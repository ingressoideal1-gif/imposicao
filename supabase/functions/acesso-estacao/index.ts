/**
 * A publicacao da faixa de codigos: as tres rotas que a estacao chama.
 *
 * Porte de `abrir`, `credenciais` e `fechar` (`acesso_api.py`). Quem fala com
 * esta funcao e o `acesso_publicacao.py` dentro do `NewProd.exe`, SEMPRE depois
 * que o papel ja saiu:
 *
 *   1. abrir       -> devolve o sal daquele pedido (sorteado na primeira vez)
 *   2. credenciais -> envia {modelo_id, numero, hash} em lotes de 500
 *   3. fechar      -> carimba publicado_em e o total
 *
 * ## Por que `verify_jwt = false`, e o que protege no lugar
 *
 * A estacao nao tem sessao do Supabase: ela apresenta o `ACESSO_AGENTE_SEGREDO`,
 * um segredo nosso que so autoriza publicar faixa e nada mais. E a mesma razao
 * da portaria. Com a verificacao ligada, o gateway recusaria toda publicacao com
 * 401 antes de o nosso codigo rodar -- e o papel ja estaria impresso.
 *
 * ## O que o segredo do agente protege
 *
 * Estas rotas ESCREVEM, e vivem num endereco publico. Sem segredo, qualquer um
 * publicaria credencial para qualquer pedido -- e o buraco nao e cosmetico: como
 * o `abrir` devolve o sal, quem chegasse ate aqui calcularia o hash de um
 * conteudo escolhido por ele e inseriria um ingresso que a portaria aceitaria. E
 * a UNICA forma de forjar ingresso sem ter o pool.
 *
 * Por isso, tres travas alem do segredo:
 *
 *   - `numero` nao pode passar da quantidade que o ERP registrou para aquele
 *     modelo, e `modelo_id` tem de ser mesmo daquele pedido;
 *   - publicacao fechada nao aceita mais lote (reabrir e ato explicito);
 *   - a falha e FECHADA: servidor sem segredo configurado recusa tudo, em vez de
 *     virar porta aberta por esquecimento.
 *
 * ## O que nao pode regredir neste porte
 *
 * A IDEMPOTENCIA do `abrirPedido`: reabrir devolve o MESMO sal. Sal novo
 * invalidaria os ingressos que ja estao na mao das pessoas, e ninguem
 * descobriria antes da portaria. Ela mora em `_compartilhado/pedidos.ts`.
 */
import { banco, contar } from "../_compartilhado/banco.ts";
import { comCors, origemPermitida, respostaDePreflight } from "../_compartilhado/cors.ts";
import { Recusa } from "../_compartilhado/sessao.ts";
import { segredo } from "../_compartilhado/segredos.ts";
import { iguaisEmTempoConstante } from "../_compartilhado/assinatura.ts";
import { inteiro, RecusaDeValidacao } from "../_compartilhado/validacao.ts";
import {
  abrirPedido,
  modelosLegiveis,
  setoresDoPedido,
  tiragemDoPedido,
} from "../_compartilhado/pedidos.ts";
import {
  conferirItens,
  itensDoCorpo,
  linhasDeCredencial,
  LOTE_MAXIMO,
  pedacosDaRota,
} from "./puro.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

const SEGREDO_AGENTE = "ACESSO_AGENTE_SEGREDO";

/**
 * Quem esta publicando e mesmo um agente nosso?
 *
 * A comparacao e em tempo constante, como o `hmac.compare_digest` do Python, e
 * isso nao e enfeite que se possa trocar por `===`: o `===` sai no primeiro
 * caractere diferente, e o tempo de resposta passa a contar quantos caracteres
 * do segredo o atacante ja acertou.
 */
async function conferirAgente(req: Request): Promise<void> {
  const esperado = await segredo(SEGREDO_AGENTE);
  if (!esperado) {
    throw new Recusa(
      503,
      `${SEGREDO_AGENTE} nao configurada neste servidor. A publicacao fica ` +
        "fechada ate que esteja: endpoint de escrita sem segredo e porta aberta.",
    );
  }
  const apresentado = req.headers.get("x-agente-segredo") ?? "";
  if (!apresentado || !iguaisEmTempoConstante(apresentado, esperado)) {
    throw new Recusa(401, "segredo do agente invalido");
  }
}

/** Porte de `_gravar_lote`. Devolve quantos itens o lote tinha. */
async function gravarLote(pedidoIdInt: number, itens: unknown[]): Promise<number> {
  const linha = ((await banco(
    "GET",
    `producao_acesso_pedidos?pedido_id_int=eq.${pedidoIdInt}&select=*`,
  )) ?? [])[0];
  if (!linha) throw new Recusa(409, "publicacao nao foi aberta para este pedido");
  if (linha.publicado_em) {
    throw new Recusa(409, "publicacao ja fechada; reabra antes de enviar mais lotes");
  }

  const recusa = conferirItens(pedidoIdInt, itens, await tiragemDoPedido(pedidoIdInt));
  if (recusa) throw new Recusa(recusa.status, recusa.detail);

  // `on_conflict=chave_dedup` e o que torna a publicacao repetivel: a rede cai
  // no meio, o agente reenvia o lote inteiro, e nada duplica.
  //
  // A chave era `codigo_hash` sozinho, e isso custou 31 ingressos do pedido
  // 20508 em 15/08/2026: tres modelos daquele pedido usavam a mesma numeracao,
  // entao o item 1 dos tres saiu impresso com o mesmo `000001`. Texto igual e
  // sal igual -- o sal e por pedido -- dao hash igual, e o banco aceitou a
  // IMPRENSA e descartou em silencio a PISTA e o CAMAROTE.
  await banco(
    "POST",
    "producao_acesso_credenciais?on_conflict=chave_dedup",
    linhasDeCredencial(pedidoIdInt, itens, await setoresDoPedido(pedidoIdInt)),
    "resolution=ignore-duplicates,return=minimal",
  );
  return itens.length;
}

/**
 * Porte de `_fechar_pedido`. Carimba o total e trava a entrada de lotes novos.
 *
 * O total sai de `contar()`, e nao de trazer as linhas para medir o tamanho da
 * lista. O PostgREST corta a resposta em 1.000 linhas, em silencio: o pedido
 * 18560, com 2.000 ingressos, fechou dizendo "INCOMPLETA: 1000 de 2000" com as
 * 2.000 credenciais gravadas e corretas. Mil e justamente o tamanho em que o
 * defeito comeca -- quem testou com tiragem menor nao tinha como ver.
 *
 * E o `esperado` conta so o que a portaria tem como ler: contar o modelo sem
 * codigo deixaria o pedido eternamente incompleto e mandaria reimprimir papel
 * que esta do jeito que foi contratado.
 */
async function fecharPedido(pedidoIdInt: number): Promise<unknown> {
  const total = await contar(
    `producao_acesso_credenciais?pedido_id_int=eq.${pedidoIdInt}`,
  );
  const esperado = (await modelosLegiveis(pedidoIdInt))
    .reduce((s, m) => s + m.quantidade, 0);

  await banco("PATCH", `producao_acesso_pedidos?pedido_id_int=eq.${pedidoIdInt}`, {
    publicado_em: "now()",
    total_credenciais: total,
  });

  // `completo` e o que o agente olha para decidir se tenta de novo: um lote
  // perdido por rede nao pode passar por publicacao terminada.
  return { total, esperado, completo: total === esperado };
}

async function rotear(req: Request, url: URL): Promise<Response> {
  const p = pedacosDaRota(url.pathname);
  const ok = (corpo: unknown) =>
    new Response(JSON.stringify(corpo), { headers: JSON_HEADERS });

  // A ordem e a do Starlette, e ela e visivel de fora: primeiro o CAMINHO casa
  // (senao 404), depois o METODO (senao 405), e so entao os parametros sao
  // validados (senao 422) -- tudo isso antes de a rota rodar, e portanto antes
  // do segredo. Trocar a ordem faria a mesma URL responder diferente em cada
  // pilha enquanto as duas convivem.
  const conhecida = p.length === 3 && p[0] === "pedidos" &&
    ["abrir", "credenciais", "fechar"].includes(p[2]);
  if (!conhecida) throw new Recusa(404, "Not Found");
  if (req.method !== "POST") throw new Recusa(405, "Method Not Allowed");

  const pedido = inteiro(p[1], "path", "pedido");
  await conferirAgente(req);

  if (p[2] === "abrir") return ok(await abrirPedido(pedido));

  if (p[2] === "credenciais") {
    // Uma divergencia DELIBERADA em relacao ao FastAPI: la o corpo e validado
    // antes de a rota rodar, entao corpo malformado com segredo errado responde
    // 422; aqui responde 401. E o unico caso em que os dois discordam, e a
    // escolha e a segura -- interpretar corpo de quem nao se identificou seria
    // trabalho feito para um estranho.
    let corpo: unknown;
    try {
      corpo = await req.json();
    } catch {
      throw new Recusa(422, "corpo invalido: esperava JSON");
    }
    const itens = itensDoCorpo(corpo);
    // Antes de qualquer consulta: recusar por tamanho custa uma comparacao, e
    // ler o pedido para depois recusar custa uma ida ao banco.
    if (itens.length > LOTE_MAXIMO) {
      throw new Recusa(413, `lote acima de ${LOTE_MAXIMO} itens`);
    }
    return ok({ gravadas: await gravarLote(pedido, itens) });
  }

  return ok(await fecharPedido(pedido));
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const origem = origemPermitida(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    // Quem chama esta funcao e o agente, que nao faz preflight nenhum. O
    // tratamento existe para a resposta a um OPTIONS ser 204 e nao o 404 de rota
    // desconhecida -- e para o dia em que alguem diagnosticar isto do navegador.
    return respostaDePreflight(
      origem,
      "POST, OPTIONS",
      "authorization,content-type,x-agente-segredo",
    );
  }

  try {
    return comCors(await rotear(req, url), origem);
  } catch (e) {
    if (e instanceof Recusa) {
      const corpo = e instanceof RecusaDeValidacao
        ? { detail: e.detalhes }
        : { detail: e.detail };
      return comCors(
        new Response(JSON.stringify(corpo), { status: e.status, headers: JSON_HEADERS }),
        origem,
      );
    }
    console.error("[acesso-estacao]", e);
    return comCors(
      new Response(JSON.stringify({ detail: "erro interno" }), {
        status: 500,
        headers: JSON_HEADERS,
      }),
      origem,
    );
  }
});
