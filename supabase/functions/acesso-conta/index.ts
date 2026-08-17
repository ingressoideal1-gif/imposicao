/**
 * A tela do cliente: as 14 rotas de `/api/acesso/*` que o dono do evento usa.
 *
 * Porte de `acesso_config.py` mais `/evento`, `/meus-eventos` e `/reivindicar`
 * de `acesso_api.py`.
 *
 * ## Duas portas, e nao uma
 *
 * LER exige so o JWT. ESCREVER exige, alem dele, a prova de que a senha do dono
 * foi digitada nos ultimos 15 minutos NAQUELE navegador -- porque o celular da
 * portaria fica na mao do porteiro, logado com a conta do cliente. Uma
 * autorizacao que nao vence transformaria aquele aparelho num painel de
 * configuracao permanente.
 *
 * ## O que difere da `acesso-interno`
 *
 * As duas escrevem as MESMAS coisas, chamando as mesmas funcoes de
 * `_compartilhado/configuracao.ts`. O que muda e quem pode: la e papel ADM ou
 * Atendimento; aqui e ser dono do evento MAIS elevacao. Por isso a camada de
 * escrita nao sabe de permissao nenhuma.
 *
 * ## Segredos que esta funcao exige
 *
 * `QR_PEDIDO_SEGREDO` (rotas `/evento` e `/reivindicar`) e
 * `ACESSO_ELEVACAO_SEGREDO` (toda escrita). Sem eles, essas rotas respondem 503
 * dizendo qual variavel falta -- e nao 500, porque faltar configuracao nao e
 * defeito de quem chamou.
 */
import { banco, contar } from "../_compartilhado/banco.ts";
import { comCors, origemPermitida, respostaDePreflight } from "../_compartilhado/cors.ts";
import { Recusa, usuarioDoJwt } from "../_compartilhado/sessao.ts";
import { recusaDeRotaDesconhecida } from "../_compartilhado/validacao.ts";
import { segredo } from "../_compartilhado/segredos.ts";
import { gerarSal, modelosLegiveis } from "../_compartilhado/pedidos.ts";
import {
  conferirElevacao,
  conferirQrPedido,
  gerarElevacao,
  SEGREDO_ELEVACAO,
  SEGREDO_QR_PEDIDO,
} from "../_compartilhado/assinatura.ts";
import {
  aplicarAparelho,
  aplicarAparelhoAqui,
  aplicarAparelhoNovo,
  aplicarBloqueio,
  aplicarCodigos,
  aplicarEvento,
  aplicarLiberacao,
  aplicarNovoCodigo,
  aplicarSetor,
  zerarEntradas,
} from "../_compartilhado/configuracao.ts";
import { nomeDoEvento, pedacosDaRota, recusaHumana } from "./puro.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ok(corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { headers: JSON_HEADERS });
}

function uuid(valor: string): string {
  const v = String(valor ?? "").trim();
  // A MESMA resposta de "nao e seu": um 404 aqui e um 403 ali contariam a um
  // estranho que aquele id chegou a existir.
  if (!FORMATO_UUID.test(v)) throw new Recusa(403, "evento nao encontrado nesta conta");
  return v;
}

/**
 * A recusa `{"codigo": ..., "mensagem": ...}` que a tela sabe tratar.
 *
 * O 401 da elevacao vem com codigo proprio porque a tela precisa distinguir "a
 * sessao caiu" de "a elevacao venceu": sao consertos diferentes, e confundi-los
 * faz a tela deslogar quem so precisava digitar a senha de novo.
 */
class RecusaComCodigo extends Recusa {
  constructor(status: number, public corpo: unknown) {
    super(status, "");
  }
}

/** 503, e nao 500: faltar configuracao no servidor nao e defeito de quem
 * chamou, e a mensagem diz exatamente qual variavel falta. */
async function exigirSegredo(nome: string): Promise<void> {
  if (!(await segredo(nome))) {
    throw new Recusa(503, `${nome} nao configurada neste servidor`);
  }
}

// ── Quem e dono do que ──────────────────────────────────────────────────────

/**
 * O evento, se ele for desta conta. 403 em qualquer outro caso.
 *
 * A MESMA resposta para "nao existe" e para "nao e seu": responder diferente
 * contaria a um estranho quais eventos existem.
 */
async function eventoDoDono(eventoId: string, usuario: { id: string }): Promise<any> {
  const linha = ((await banco(
    "GET",
    `producao_acesso_eventos?id=eq.${uuid(eventoId)}` +
      "&select=id,dono_auth_id,nome_evento,data_evento,local_evento,status",
  )) ?? [])[0];
  if (!linha || String(linha.dono_auth_id) !== String(usuario.id)) {
    throw new Recusa(403, "evento nao encontrado nesta conta");
  }
  return linha;
}

async function setorDoDono(setorId: string, usuario: { id: string }): Promise<any> {
  const linha = ((await banco(
    "GET",
    `producao_acesso_setores?id=eq.${uuid(setorId)}` +
      "&select=id,evento_id,nome,quantidade,abre_em,fecha_em",
  )) ?? [])[0];
  if (!linha) throw new Recusa(403, "setor nao encontrado nesta conta");
  await eventoDoDono(linha.evento_id, usuario);
  return linha;
}

async function aparelhoDoDono(aparelhoId: string, usuario: { id: string }): Promise<any> {
  const linha = ((await banco(
    "GET",
    `producao_acesso_dispositivos?id=eq.${uuid(aparelhoId)}&select=id,evento_id,nome`,
  )) ?? [])[0];
  if (!linha) throw new Recusa(403, "aparelho nao encontrado nesta conta");
  await eventoDoDono(linha.evento_id, usuario);
  return linha;
}

// ── A elevacao de 15 minutos ────────────────────────────────────────────────

/**
 * A senha do dono esta certa? Quem sabe e o Supabase.
 *
 * Usa a chave ANONIMA de proposito: a API de autenticacao a exige, e aqui nao
 * se toca em tabela nenhuma. Uma sessao nova nasce desta chamada e e
 * descartada -- nao ha efeito colateral.
 */
async function conferirSenha(email: string, senha: string): Promise<boolean> {
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !anon) throw new Recusa(503, "SUPABASE_ANON_KEY nao esta no ambiente");

  const r = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: anon, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: senha }),
  });
  if (r.ok) return Boolean((await r.json())?.access_token);
  // 400 e corpo mal formado, 401 e credencial errada -- os dois sao "senha nao
  // confere" do ponto de vista do dono. Qualquer outro codigo (429 de limite de
  // taxa, 5xx do provedor) NAO e senha errada, e dizer que e manda o dono
  // procurar um papel com a senha quando o problema e outro.
  if (r.status === 400 || r.status === 401) return false;
  throw new Recusa(503, `nao consegui conferir a senha agora (codigo ${r.status})`);
}

async function elevar(
  eventoId: string,
  usuario: { id: string; email: string },
  senha: string,
  navegador: string,
): Promise<any> {
  await eventoDoDono(eventoId, usuario);
  await exigirSegredo(SEGREDO_ELEVACAO);
  if (!(await conferirSenha(usuario.email ?? "", senha ?? ""))) {
    // Uma frase so: nao dizer se o problema foi o e-mail ou a senha.
    throw new Recusa(401, "senha nao confere");
  }
  const { token, expira } = await gerarElevacao(eventoId, usuario.id, navegador);
  return { token, expira_em: expira, minutos: 15 };
}

/** A porta de toda escrita. Silencio e aprovacao. */
async function exigirElevacao(
  eventoId: string,
  usuario: { id: string },
  req: Request,
): Promise<void> {
  try {
    // Segredo ausente entra no MESMO caminho de bilhete invalido, de proposito:
    // um token bem formado chegando na janela em que a variavel ainda nao foi
    // colada nao pode virar 500 numa tela que ja sabe tratar 401.
    await exigirSegredo(SEGREDO_ELEVACAO);
    await conferirElevacao(
      req.headers.get("x-elevacao") ?? "",
      eventoId,
      usuario.id,
      req.headers.get("x-navegador") ?? "",
    );
  } catch {
    throw new RecusaComCodigo(401, {
      detail: {
        codigo: "elevacao_expirada",
        mensagem: "digite a senha do dono para alterar o evento",
      },
    });
  }
}

// ── A lista da tela inicial ─────────────────────────────────────────────────

/**
 * Os eventos do dono, com quanta gente entrou em cada um.
 *
 * Sem `status=eq.ativo`. Com o filtro, inativar o evento o fazia sumir da lista
 * do proprio dono -- e nao sobrava tela nenhuma de onde reativar. A lista MOSTRA
 * o inativo e o finalizado, e por isso o `status` vem junto: e ele que separa
 * "Meus Eventos" da lista de finalizados, e que vira a palavra `inativo` ao lado
 * do nome.
 *
 * `excluido` continua de fora, e continua sem nenhum caminho na tela que o
 * produza -- de proposito.
 *
 * ## Por que a contagem vem daqui, e nao de uma segunda chamada
 *
 * A lista de finalizados mostra "4.812 entraram" em cada linha. Pedir isso
 * evento por evento significaria a tela inicial disparando uma chamada por
 * linha, no 4G de quem abriu o aplicativo -- e nenhuma delas serve para outra
 * coisa.
 *
 * ## Por que das LEITURAS permitidas, e nao das entradas unicas
 *
 * E a mesma fonte dos `totais` do `/sincronizar`, e tem de ser: o numero na
 * lista de finalizados e o numero que o dono viu no portao a noite inteira, e
 * duas contas diferentes para a mesma pergunta viram uma discussao que ninguem
 * consegue resolver depois. Alem disso, setor de reentrada nao tem linha nenhuma
 * em `entradas_unicas` -- um evento so de reentrada apareceria com zero.
 *
 * `contar` e nao o tamanho de uma lista, pelo teto de 1000 linhas do PostgREST:
 * qualquer evento maior que isso apareceria eternamente com "1.000 entraram".
 * Uma consulta por evento e o que ha: agregacao esta desligada neste PostgREST.
 */
async function meusEventos(donoId: string): Promise<any> {
  const eventos = (await banco(
    "GET",
    `producao_acesso_eventos?dono_auth_id=eq.${donoId}` +
      "&status=neq.excluido&select=id,nome_evento,data_evento,status" +
      "&order=created_at.desc",
  )) ?? [];

  for (const e of eventos) {
    e.entradas = await contar(
      `producao_acesso_leituras?evento_id=eq.${e.id}&resultado=eq.permitido`,
    );
  }
  return { eventos };
}

// ── O painel do evento ──────────────────────────────────────────────────────

async function painel(eventoId: string): Promise<any> {
  const evento = ((await banco(
    "GET",
    `producao_acesso_eventos?id=eq.${eventoId}` +
      "&select=id,nome_evento,data_evento,local_evento,status",
  )) ?? [])[0] ?? null;

  // `lotacao` NAO entra no select: a lotacao de um setor E a quantidade
  // contratada no ERP. Um segundo numero, digitado a parte, envelheceria no
  // instante em que o cliente aumentasse o pedido.
  const setores = (await banco(
    "GET",
    `producao_acesso_setores?evento_id=eq.${eventoId}&status=eq.ativo` +
      "&select=id,nome,quantidade,tipo_uso,abre_em,fecha_em,pedido_id_int,modelo_id," +
      "bloqueado,bloqueado_motivo" +
      "&order=nome.asc",
  )) ?? [];

  // A faixa IMPRESSA em cada setor vem do ERP, e nao de um MIN/MAX sobre as
  // credenciais publicadas: uma faixa deduzida do que ja foi impresso encolhe
  // quando metade dos modelos ainda nao passou pela impressora. E agregacao
  // esta desligada neste PostgREST.
  const modelos = [...new Set<number>(
    setores.filter((s: any) => s.modelo_id !== null && s.modelo_id !== undefined)
      .map((s: any) => Number(s.modelo_id)),
  )].sort((a, b) => a - b);
  const faixas: Record<number, any> = {};
  if (modelos.length) {
    for (
      const m of (await banco(
        "GET",
        `pedidos_modelos?id=in.(${modelos.join(",")})` +
          "&select=id,numeracao_inicio,numeracao_fim",
      )) ?? []
    ) {
      faixas[Number(m.id)] = m;
    }
  }
  for (const s of setores) {
    const f = s.modelo_id !== null && s.modelo_id !== undefined
      ? faixas[Number(s.modelo_id)]
      : null;
    // Ausente e nao zero: o modelo pode nao ter faixa cadastrada, e um
    // "de 0000 a 0000" na tela do dono seria pior que linha nenhuma.
    s.numero_de = f?.numeracao_inicio ?? null;
    s.numero_ate = f?.numeracao_fim ?? null;
  }

  // `status=eq.ativo` porque bloqueio liberado e historico, nao configuracao.
  // Mostra-lo faria o dono liberar de novo o que ja esta liberado.
  const bloqueios = (await banco(
    "GET",
    `producao_acesso_bloqueios?evento_id=eq.${eventoId}&status=eq.ativo` +
      "&select=id,setor_id,de,ate,motivo&order=de.asc",
  )) ?? [];
  for (const s of setores) {
    s.bloqueios = bloqueios.filter((b: any) => String(b.setor_id) === String(s.id));
  }

  const aparelhos = (await banco(
    "GET",
    `producao_acesso_dispositivos?evento_id=eq.${eventoId}` +
      "&select=id,nome,status,ultimo_visto&order=nome.asc",
  )) ?? [];
  // Escopado aos aparelhos ja buscados: sem o `in.(...)`, esta consulta trazia
  // os vinculos de TODOS os eventos do sistema a cada abertura do painel.
  const idsAparelhos = aparelhos.map((a: any) => String(a.id));
  const vinculos = idsAparelhos.length
    ? ((await banco(
      "GET",
      `producao_acesso_dispositivo_setores?dispositivo_id=in.(${idsAparelhos.join(",")})` +
        "&select=dispositivo_id,setor_id",
    )) ?? [])
    : [];
  for (const a of aparelhos) {
    a.setores = vinculos
      .filter((v: any) => String(v.dispositivo_id) === String(a.id))
      .map((v: any) => v.setor_id);
  }

  const pedidos = (await banco(
    "GET",
    `producao_acesso_pedidos?evento_id=eq.${eventoId}` +
      "&select=pedido_id_int,publicado_em,total_credenciais&order=pedido_id_int.asc",
  )) ?? [];

  // A contagem por setor so acontece quando o evento tem ALGUM codigo de
  // cliente. Sem esta guarda, um evento comum -- que e a maioria, e nunca
  // carregou codigo nenhum -- pagaria uma ida ao banco por setor a cada
  // abertura da tela para receber zero em todas.
  const codigos = await contar(
    `producao_acesso_credenciais?evento_id=eq.${eventoId}&origem=eq.cliente`,
  );
  for (const s of setores) {
    s.codigos_cliente = codigos
      ? await contar(
        `producao_acesso_credenciais?setor_id=eq.${s.id}&origem=eq.cliente`,
      )
      : 0;
  }

  return { evento, setores, aparelhos, pedidos, codigos_cliente: codigos };
}

// ── O QR do Pedido ──────────────────────────────────────────────────────────

async function sha256Hex(texto: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function esqueleto(token: string): Promise<any> {
  await exigirSegredo(SEGREDO_QR_PEDIDO);

  let pedido: number;
  try {
    pedido = await conferirQrPedido(token);
  } catch (e) {
    throw new Recusa(401, recusaHumana(e instanceof Error ? e.message : ""));
  }

  const linha = ((await banco(
    "GET",
    `producao_acesso_pedidos?pedido_id_int=eq.${pedido}&select=*`,
  )) ?? [])[0];
  if (!linha) throw new Recusa(404, "pedido sem QR gerado");

  if (linha.qr_revogado_em) {
    throw new Recusa(403, "este QR foi cancelado; peca um novo a quem o enviou");
  }

  // Gerar um QR novo troca o hash guardado. O anterior continua assinado e
  // valido para sempre -- e e exatamente por isso que a comparacao existe.
  if ((linha.qr_token_hash ?? "") !== await sha256Hex(token)) {
    throw new Recusa(403, "este QR foi substituido por outro; use o mais recente");
  }

  const setores = await modelosLegiveis(pedido);
  const proposta = ((await banco(
    "GET",
    `propostas?id_int=eq.${pedido}&select=id_cliente`,
  )) ?? [])[0];

  return {
    pedido,
    id_cliente: proposta?.id_cliente ?? null,
    ja_reivindicado: Boolean(linha.evento_id),
    evento_id: linha.evento_id ?? null,
    setores,
    total: setores.reduce((s: number, x: any) => s + x.quantidade, 0),
  };
}

async function reivindicar(
  token: string,
  usuario: { id: string },
  eventoIdPedido: string | null,
  nomePedido: string,
): Promise<any> {
  const esq = await esqueleto(token);
  const pedido = esq.pedido;
  const dono = usuario.id;
  if (!dono) throw new Recusa(401, "sessao sem identificacao");

  if (esq.ja_reivindicado) {
    // Ja e deste dono? Entao nao e erro -- e a pessoa relendo o proprio QR.
    const atual = ((await banco(
      "GET",
      `producao_acesso_eventos?id=eq.${esq.evento_id}&select=id,dono_auth_id,nome_evento`,
    )) ?? [])[0];
    if (atual && String(atual.dono_auth_id) === String(dono)) {
      return { evento_id: atual.id, nome_evento: atual.nome_evento ?? null, novo: false };
    }
    throw new Recusa(
      409,
      "este pedido ja foi cadastrado por outra conta; peca um QR novo ao atendente",
    );
  }

  let alvo: any;
  let novo: boolean;
  if (eventoIdPedido) {
    alvo = ((await banco(
      "GET",
      `producao_acesso_eventos?id=eq.${uuid(eventoIdPedido)}` +
        "&select=id,dono_auth_id,nome_evento",
    )) ?? [])[0];
    if (!alvo || String(alvo.dono_auth_id) !== String(dono)) {
      throw new Recusa(403, "evento nao e desta conta");
    }
    novo = false;
  } else {
    alvo = (await banco("POST", "producao_acesso_eventos", {
      id_cliente: esq.id_cliente,
      dono_auth_id: dono,
      nome_evento: nomeDoEvento(nomePedido, pedido),
      // Sal do evento: serve aos codigos que o proprio cliente carregar (staff,
      // cortesia). Os do QR Ideal usam o sal do pedido.
      sal: gerarSal(),
    }))[0];
    novo = true;
  }

  const evento = alvo.id;

  // Um modelo = um setor. Nunca se fundem, mesmo com nome igual vindo de dois
  // pedidos: quantidade e reimpressao sao por modelo.
  for (const s of esq.setores) {
    const criado = await banco("POST", "producao_acesso_setores", {
      evento_id: evento,
      pedido_id_int: pedido,
      modelo_id: s.modelo_id,
      nome: s.nome,
      quantidade: s.quantidade,
    });
    // Carimba as credenciais que o agente publicou ANTES desta reivindicacao.
    // As que vierem depois ja nascem ligadas. As duas metades juntas e que
    // cobrem as duas ordens possiveis; sozinha, esta deixou 200 credenciais do
    // pedido 18560 orfas por oito horas de diferenca entre reivindicar e
    // imprimir.
    await banco(
      "PATCH",
      `producao_acesso_credenciais?pedido_id_int=eq.${pedido}&modelo_id=eq.${s.modelo_id}`,
      { evento_id: evento, setor_id: criado[0].id },
      "return=minimal",
    );
  }

  await banco("PATCH", `producao_acesso_pedidos?pedido_id_int=eq.${pedido}`, {
    evento_id: evento,
  });

  return { evento_id: evento, nome_evento: alvo.nome_evento ?? null, novo };
}

// ── Roteamento ──────────────────────────────────────────────────────────────

async function rotear(req: Request, url: URL): Promise<Response> {
  const p = pedacosDaRota(url.pathname);
  const metodo = req.method;
  const corpo = async () => {
    try {
      return await req.json();
    } catch {
      throw new Recusa(422, "corpo invalido: esperava JSON");
    }
  };

  // A rota publica `/evento` NAO mora aqui: ela precisa de `verify_jwt = false`,
  // e essa chave e por funcao. Ver `acesso-evento/index.ts`.
  const usuario = usuarioDoJwt(req.headers.get("authorization"));

  if (metodo === "GET" && p.length === 1 && p[0] === "meus-eventos") {
    return ok(await meusEventos(usuario.id));
  }
  if (metodo === "POST" && p.length === 1 && p[0] === "reivindicar") {
    const c = await corpo();
    return ok(await reivindicar(
      c?.token ?? "",
      usuario,
      c?.evento_id ?? null,
      c?.nome_evento ?? "",
    ));
  }

  if (metodo === "GET" && p.length === 2 && p[0] === "eventos") {
    await eventoDoDono(p[1], usuario);
    return ok(await painel(p[1]));
  }
  if (metodo === "POST" && p.length === 3 && p[0] === "eventos" && p[2] === "elevar") {
    const c = await corpo();
    return ok(await elevar(p[1], usuario, c?.senha ?? "", c?.navegador ?? ""));
  }

  // Daqui para baixo, TODA rota escreve -- e toda escrita exige elevacao. A
  // elevacao e exigida contra o evento DO RECURSO, achado agora, nunca contra
  // um evento_id que o chamador tivesse mandado por fora: isso deixaria a senha
  // de um evento abrir a escrita de outro.
  if (metodo === "PATCH" && p.length === 2 && p[0] === "eventos") {
    const evento = await eventoDoDono(p[1], usuario);
    await exigirElevacao(evento.id, usuario, req);
    return ok(await aplicarEvento(evento.id, await corpo()));
  }
  // Recomecar a contagem. E a UNICA rota desta funcao que destroi dado, e por
  // isso ela e a que mais depende da elevacao: o celular da portaria fica na mao
  // do porteiro, logado com a conta do cliente, e sem a senha recente qualquer
  // um que pegasse aquele aparelho apagaria a noite inteira de leituras.
  //
  // Ingressos, setores e portoes NAO saem -- ver `zerarEntradas`.
  if (
    metodo === "POST" && p.length === 3 && p[0] === "eventos" &&
    p[2] === "zerar-entradas"
  ) {
    const evento = await eventoDoDono(p[1], usuario);
    await exigirElevacao(evento.id, usuario, req);
    return ok(await zerarEntradas(evento.id));
  }
  if (metodo === "PATCH" && p.length === 2 && p[0] === "setores") {
    const setor = await setorDoDono(p[1], usuario);
    await exigirElevacao(setor.evento_id, usuario, req);
    return ok(await aplicarSetor(setor, await corpo()));
  }
  if (metodo === "POST" && p.length === 3 && p[0] === "setores" && p[2] === "bloqueios") {
    const setor = await setorDoDono(p[1], usuario);
    await exigirElevacao(setor.evento_id, usuario, req);
    return ok(await aplicarBloqueio(setor, await corpo(), usuario.id));
  }
  if (metodo === "DELETE" && p.length === 4 && p[0] === "setores" && p[2] === "bloqueios") {
    const setor = await setorDoDono(p[1], usuario);
    await exigirElevacao(setor.evento_id, usuario, req);
    return ok(await aplicarLiberacao(setor, uuid(p[3])));
  }
  if (metodo === "POST" && p.length === 3 && p[0] === "eventos" && p[2] === "aparelhos") {
    const evento = await eventoDoDono(p[1], usuario);
    await exigirElevacao(evento.id, usuario, req);
    return ok(await aplicarAparelhoNovo(evento.id, await corpo()));
  }
  // O aparelho configurado NESTE aparelho: o dono esta com o celular do portao
  // na mao. Devolve o token direto, sem codigo intermediario. Mesma exigencia de
  // elevacao da rota acima -- criar portao e escrita de configuracao, e sem ela
  // quem pegasse o celular do dono destrancado criaria um.
  if (metodo === "POST" && p.length === 4 && p[0] === "eventos"
      && p[2] === "aparelhos" && p[3] === "aqui") {
    const evento = await eventoDoDono(p[1], usuario);
    await exigirElevacao(evento.id, usuario, req);
    return ok(await aplicarAparelhoAqui(evento.id, await corpo()));
  }
  if (metodo === "PATCH" && p.length === 2 && p[0] === "aparelhos") {
    const ap = await aparelhoDoDono(p[1], usuario);
    await exigirElevacao(ap.evento_id, usuario, req);
    return ok(await aplicarAparelho(ap, await corpo()));
  }
  if (metodo === "POST" && p.length === 3 && p[0] === "aparelhos" && p[2] === "codigo") {
    const ap = await aparelhoDoDono(p[1], usuario);
    await exigirElevacao(ap.evento_id, usuario, req);
    return ok(await aplicarNovoCodigo(ap));
  }
  if (metodo === "POST" && p.length === 3 && p[0] === "eventos" && p[2] === "codigos") {
    const evento = await eventoDoDono(p[1], usuario);
    await exigirElevacao(evento.id, usuario, req);
    return ok(await aplicarCodigos(evento.id, await corpo()));
  }

  // O codigo depende do METODO, e nao do caminho: GET vira 404 e o resto vira
  // 405, por causa de como o `app.py` esta montado. Ver
  // `recusaDeRotaDesconhecida`, onde a medicao contra o Render esta registrada.
  recusaDeRotaDesconhecida(metodo);
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const origem = origemPermitida(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    // `x-elevacao` e `x-navegador` PRECISAM estar aqui: a tela do dono os manda
    // em toda escrita (`frontend/controle.js`), e o navegador bloqueia a
    // requisicao de verdade quando o preflight nao autoriza cabecalho que ela
    // pretende usar. A chamada morreria no navegador, sem log deste lado.
    return respostaDePreflight(
      origem,
      "GET, POST, PATCH, DELETE, OPTIONS",
      "authorization,content-type,x-elevacao,x-navegador",
    );
  }

  try {
    return comCors(await rotear(req, url), origem);
  } catch (e) {
    if (e instanceof RecusaComCodigo) {
      return comCors(
        new Response(JSON.stringify(e.corpo), { status: e.status, headers: JSON_HEADERS }),
        origem,
      );
    }
    if (e instanceof Recusa) {
      return comCors(
        new Response(JSON.stringify({ detail: e.detail }), {
          status: e.status,
          headers: JSON_HEADERS,
        }),
        origem,
      );
    }
    console.error("[acesso-conta]", e);
    return comCors(
      new Response(JSON.stringify({ detail: "erro interno" }), {
        status: 500,
        headers: JSON_HEADERS,
      }),
      origem,
    );
  }
});
