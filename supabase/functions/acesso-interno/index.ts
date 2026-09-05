/**
 * O Ideal Control da grafica: as 15 rotas de `/api/acesso/interno/*`.
 *
 * Porte de `acesso_interno.py`. Enquanto o Render existir, os dois respondem a
 * mesma coisa -- `tests/test_acesso_interno_paridade.py` e quem prova isso.
 *
 * ## Quem pode
 *
 * Todas as rotas passam por `quemConfigura`: JWT valido MAIS papel ADM ou
 * Atendimento em `imposition_user_permissions`. Nenhuma pede elevacao -- a
 * decisao do usuario e que estar logado como ADM ou Atendimento basta. O que
 * essa decisao NAO dispensa e a conferencia do JWT: sem ela, "sem senha"
 * viraria "sem porta".
 *
 * A conferencia da assinatura do JWT e do portao do Supabase, e depende de
 * `verify_jwt = true` no `supabase/config.toml`. Se alguem desligar aquilo, o
 * `sub` das claims vira dado de entrada do atacante e esta funcao inteira abre.
 *
 * ## O que NUNCA sai daqui
 *
 * O codigo do QR Ideal. A tela lista os ingressos pelo NUMERO e pela situacao;
 * `codigo_hash` nao entra em nenhum `select`, e `codigo_visivel` so aparece
 * para os codigos que o proprio cliente carregou (staff, cortesia), que sao
 * dele e ele precisa administrar. O sal do evento tambem nao sai.
 */
import { banco, contar } from "../_compartilhado/banco.ts";
import { comCors, origemPermitida, respostaDePreflight } from "../_compartilhado/cors.ts";
import { Recusa, quemConfigura } from "../_compartilhado/sessao.ts";
import {
  inteiro,
  recusaDeRotaDesconhecida,
  RecusaDeValidacao,
} from "../_compartilhado/validacao.ts";
import {
  aplicarAparelho,
  aplicarAparelhoNovo,
  aplicarBloqueio,
  aplicarCodigos,
  aplicarEvento,
  aplicarLiberacao,
  aplicarNovoCodigo,
  aplicarSetor,
  excluirAparelho,
} from "../_compartilhado/configuracao.ts";
import { contasDoCliente, liberarAcesso, novaSenhaProvisoria } from "../_compartilhado/contas.ts";
// As contas do relatorio moram no compartilhado desde 04/09/2026: o dono do
// evento ve os MESMOS numeros no aplicativo dele, e duas copias diriam 412 aqui
// e 409 la, as duas telas abertas ao mesmo tempo, sem como saber qual acertou.
import {
  dashboard,
  listarIngressos,
  numerosDoSetor,
} from "../_compartilhado/relatorio.ts";
// Desfazer o vinculo do pedido e reconferir os setores -- as mesmas funcoes que
// o aplicativo do dono chama. Duas copias divergiriam, e o sintoma seria a
// grafica desfazendo de um jeito que o cliente nao consegue reproduzir.
import {
  desvincularPedido,
  sincronizarSetores,
} from "../_compartilhado/vinculo.ts";
import {
  numeracaoDoModelo,
  numeroDaPagina,
  pedacosDaRota,
  tamanhoDaPagina,
  URL_DE_INSTALACAO,
} from "./puro.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ok(corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { headers: JSON_HEADERS });
}

/**
 * O formato do id e conferido ANTES de ir ao banco. Sem isto o PostgREST recusa
 * `id=eq.nao-e-uuid` com erro de tipo, o `banco()` lanca, e o atendente recebe
 * "erro interno" no lugar de "nao encontrado".
 */
function uuid(valor: string, oque: string): string {
  const v = String(valor ?? "").trim();
  if (!FORMATO_UUID.test(v)) throw new Recusa(404, `${oque} nao encontrado`);
  return v;
}

// A recusa 422 do FastAPI e o `int` de parametro moram em
// `_compartilhado/validacao.ts` desde a Tarefa 3: `acesso-pedido` e
// `acesso-estacao` precisam do MESMO formato de erro, e tres copias de um
// formato de erro divergiriam no dia em que uma delas fosse ajustada.

// ── Leitura ─────────────────────────────────────────────────────────────────

async function eventoDoPedido(pedidoIdInt: number): Promise<any> {
  return ((await banco(
    "GET",
    `producao_acesso_pedidos?pedido_id_int=eq.${pedidoIdInt}&select=` +
      "pedido_id_int,evento_id,publicado_em,total_credenciais,qr_gerado_em," +
      "qr_revogado_em,status,created_at",
  )) ?? [])[0] ?? null;
}

/**
 * Os modelos do ERP, com a marca de quais a portaria tem como ler.
 *
 * Os dois lados juntos de proposito. O atendente precisa ver o modelo QUE NAO
 * SOBE tanto quanto os que sobem -- senao ele conta os setores na tela, acha
 * que falta um, e abre um chamado sobre um ingresso que simplesmente nao tem
 * codigo impresso.
 */
async function modelosDoPedido(pedidoIdInt: number): Promise<any[]> {
  const todos = (await banco(
    "GET",
    `pedidos_modelos?id_int=eq.${pedidoIdInt}` +
      "&select=id,nome_modelo,quantidade,numeracao_inicio,numeracao_fim," +
      "tipo_numeracao,ordem,amostra_num_id&order=ordem.asc",
  )) ?? [];

  const ids = [...new Set(
    todos.filter((m: any) => m.amostra_num_id).map((m: any) => String(m.amostra_num_id)),
  )].sort();
  const numeracoes: Record<string, unknown> = {};
  if (ids.length) {
    const lista = ids.map((i) => `"${i}"`).join(",");
    for (
      const n of (await banco(
        "GET",
        `producao_numeracoes?id=in.(${lista})&select=id,elements`,
      )) ?? []
    ) {
      numeracoes[String(n.id)] = n.elements;
    }
  }

  return todos.map((m: any) => ({
    modelo_id: Number(m.id),
    nome: String(m.nome_modelo ?? `Modelo ${m.id}`).trim(),
    quantidade: Number(m.quantidade ?? 0),
    numero_de: m.numeracao_inicio,
    numero_ate: m.numeracao_fim,
    tipo_numeracao: m.tipo_numeracao,
    sobe_ao_controle: Boolean(numeracaoDoModelo(numeracoes[String(m.amostra_num_id)])),
  }));
}

/**
 * Os setores com a configuracao e os bloqueios. SEM contagem nenhuma.
 *
 * Duas consultas, as duas para o evento inteiro. Medido contra producao: COM as
 * contagens, abrir o pedido 18560 custava 20 idas ao banco, e cinco delas
 * existiam so para escrever um numero que ninguem tinha pedido ainda. A
 * abertura traz a ESTRUTURA; os numeros de cada setor vem com a lista de
 * ingressos daquele setor, quando o atendente a abre.
 */
async function setoresDoEvento(eventoId: string, pedidoIdInt?: number): Promise<any[]> {
  let filtro = `producao_acesso_setores?evento_id=eq.${eventoId}&status=eq.ativo`;
  if (pedidoIdInt !== undefined) filtro += `&pedido_id_int=eq.${pedidoIdInt}`;
  const setores = (await banco(
    "GET",
    // `bloqueado` e `bloqueado_motivo` entram aqui em 18/08/2026: o cliente
    // bloqueia o setor inteiro no aplicativo dele, e ate agora a grafica nao
    // via nem o bloqueio nem o motivo -- o atendente atendia o telefone sem
    // saber que o proprio dono tinha fechado aquele portao.
    filtro + "&select=id,nome,quantidade,tipo_uso,abre_em,fecha_em," +
      "bloqueado,bloqueado_motivo,pedido_id_int,modelo_id&order=nome.asc",
  )) ?? [];

  const bloqueios = (await banco(
    "GET",
    `producao_acesso_bloqueios?evento_id=eq.${eventoId}&status=eq.ativo` +
      "&select=id,setor_id,de,ate,motivo,created_at&order=de.asc",
  )) ?? [];

  for (const s of setores) {
    s.bloqueios = bloqueios.filter((b: any) => String(b.setor_id) === String(s.id));
  }
  return setores;
}

async function aparelhosDoEvento(eventoId: string): Promise<any[]> {
  const aparelhos = (await banco(
    "GET",
    `producao_acesso_dispositivos?evento_id=eq.${eventoId}` +
      "&select=id,nome,status,ultimo_visto,token_hash,created_at&order=nome.asc",
  )) ?? [];
  const ids = aparelhos.map((a: any) => String(a.id));
  const vinculos = ids.length
    ? ((await banco(
      "GET",
      `producao_acesso_dispositivo_setores?dispositivo_id=in.(${ids.join(",")})` +
        "&select=dispositivo_id,setor_id",
    )) ?? [])
    : [];

  for (const a of aparelhos) {
    a.setores = vinculos
      .filter((v: any) => String(v.dispositivo_id) === String(a.id))
      .map((v: any) => v.setor_id);
    // `token_hash` e segredo e nao pode viajar; o que a tela precisa saber e so
    // se o aparelho ja foi pareado alguma vez.
    a.pareado = Boolean(a.token_hash);
    delete a.token_hash;
  }
  return aparelhos;
}

async function painelDoPedido(pedidoIdInt: number): Promise<any> {
  const modelos = await modelosDoPedido(pedidoIdInt);
  if (!modelos.length) {
    throw new Recusa(404, `o pedido ${pedidoIdInt} nao tem modelos cadastrados no ERP`);
  }

  const publicacao = await eventoDoPedido(pedidoIdInt);
  const eventoId = publicacao?.evento_id;

  let evento = null, setores: any[] = [], aparelhos: any[] = [];
  if (eventoId) {
    evento = ((await banco(
      "GET",
      `producao_acesso_eventos?id=eq.${eventoId}` +
        "&select=id,nome_evento,data_evento,local_evento,status,dono_auth_id,created_at",
    )) ?? [])[0] ?? null;
    setores = await setoresDoEvento(eventoId, pedidoIdInt);
    aparelhos = await aparelhosDoEvento(eventoId);
  }

  return {
    pedido: pedidoIdInt,
    cliente: await clienteDoPedido(pedidoIdInt),
    modelos,
    publicacao: {
      existe: Boolean(publicacao),
      // Aberta quer dizer "o agente ainda pode mandar lote". E o estado normal
      // de um pedido que talvez seja reimpresso; fechada e que exige reabrir.
      aberta: Boolean(publicacao) && !publicacao?.publicado_em,
      publicado_em: publicacao?.publicado_em ?? null,
      total_credenciais: publicacao?.total_credenciais ?? 0,
      qr_gerado_em: publicacao?.qr_gerado_em ?? null,
      qr_revogado_em: publicacao?.qr_revogado_em ?? null,
    },
    evento,
    setores,
    aparelhos,
    // O dashboard NAO vem junto: ele custa cinco contagens e uma varredura das
    // leituras. A tela pede em separado, quando o atendente toca em "Ver o
    // painel de publico" -- e ate la a abertura do pedido nao paga por ele.
    tem_dashboard: Boolean(eventoId),
  };
}

/**
 * O cliente do pedido e as contas ligadas a ele. E o que o bloco "Acesso do
 * cliente" do painel desenha. Sem proposta, ou sem cliente cadastrado para
 * ela, devolve nulo e o painel esconde o bloco -- sem e-mail nao ha o que
 * liberar.
 */
async function clienteDoPedido(pedidoIdInt: number): Promise<any> {
  const proposta = ((await banco(
    "GET",
    `propostas?id_int=eq.${pedidoIdInt}&select=id_cliente`,
  )) ?? [])[0];
  const idCliente = Number(proposta?.id_cliente);
  if (!idCliente) return null;
  const c = ((await banco(
    "GET",
    `clientes?id_cliente=eq.${idCliente}&select=id_cliente,nome,email,email_contato`,
  )) ?? [])[0];
  if (!c) return null;
  return {
    id_cliente: idCliente,
    nome: c?.nome ?? "",
    email: String(c?.email || c?.email_contato || "").trim().toLowerCase(),
    contas: await contasDoCliente(idCliente),
  };
}

async function setor(setorId: string): Promise<any> {
  const linha = ((await banco(
    "GET",
    `producao_acesso_setores?id=eq.${uuid(setorId, "setor")}` +
      "&select=id,evento_id,nome,quantidade,abre_em,fecha_em",
  )) ?? [])[0];
  if (!linha) throw new Recusa(404, "setor nao encontrado");
  return linha;
}

async function aparelho(aparelhoId: string): Promise<any> {
  const linha = ((await banco(
    "GET",
    `producao_acesso_dispositivos?id=eq.${uuid(aparelhoId, "aparelho")}` +
      "&select=id,evento_id,nome",
  )) ?? [])[0];
  if (!linha) throw new Recusa(404, "aparelho nao encontrado");
  return linha;
}

async function evento(eventoId: string): Promise<any> {
  const linha = ((await banco(
    "GET",
    `producao_acesso_eventos?id=eq.${uuid(eventoId, "evento")}&select=id,nome_evento`,
  )) ?? [])[0];
  if (!linha) throw new Recusa(404, "evento nao encontrado");
  return linha;
}

/**
 * Os ingressos de um setor, com a situacao de cada um.
 *
 * A lista em si vem do `_compartilhado/relatorio.ts` -- a MESMA que o
 * aplicativo do dono do evento usa desde 04/09/2026. O que esta funcao
 * acrescenta e o cabecalho do setor e os tres numeros dele, que so esta tela
 * mostra.
 */
async function ingressosDoSetor(
  setorId: string,
  pagina: number,
  porPagina: number,
  busca: string | null,
): Promise<any> {
  const s = await setor(setorId);
  const lista = await listarIngressos(s.evento_id, s.id, pagina, porPagina, busca);
  return {
    setor: { id: s.id, nome: s.nome ?? null, quantidade: s.quantidade ?? null },
    ...lista,
    // Os numeros deste setor vem de carona, e so na PRIMEIRA pagina: quem abriu
    // a lista esta olhando este setor agora, e e o momento certo de contar.
    // Repeti-los a cada pagina seriam tres idas ao banco por toque em
    // "Proximos" para escrever o mesmo numero.
    numeros: pagina === 1 ? await numerosDoSetor(s.id) : null,
  };
}

/**
 * Os pedidos que ja tem alguma coisa no Ideal Control, mais novos primeiro.
 *
 * E o que a tela mostra antes de alguem pesquisar: sem isto, ela abriria numa
 * caixa de busca vazia e o atendente teria de saber o numero de cabeca.
 */
async function pedidosComControle(limite: number): Promise<any[]> {
  const teto = Math.max(1, Math.min(Number(limite) || 50, 200));
  const pedidos = (await banco(
    "GET",
    "producao_acesso_pedidos?select=pedido_id_int,evento_id,publicado_em," +
      `total_credenciais,created_at&order=created_at.desc&limit=${teto}`,
  )) ?? [];

  const ids = [...new Set(
    pedidos.filter((p: any) => p.evento_id).map((p: any) => String(p.evento_id)),
  )].sort();
  const eventos: Record<string, any> = {};
  if (ids.length) {
    const lista = ids.map((i) => `"${i}"`).join(",");
    for (
      const e of (await banco(
        "GET",
        `producao_acesso_eventos?id=in.(${lista})&select=id,nome_evento,data_evento`,
      )) ?? []
    ) {
      eventos[String(e.id)] = e;
    }
  }

  for (const p of pedidos) {
    const ev = eventos[String(p.evento_id)];
    p.nome_evento = ev?.nome_evento ?? null;
    p.data_evento = ev?.data_evento ?? null;
  }
  return pedidos;
}

/**
 * Quantos modelos e quantos ingressos tem cada pedido de uma lista.
 *
 * Serve para uma pergunta so: este pedido tem o que configurar? Pedido sem
 * modelo no ERP faz `painelDoPedido` responder 404 -- oferece-lo na lista seria
 * um botao que nunca abre.
 *
 * Em lotes, e cada lote paginado, porque o `max_rows` deste PostgREST e 1000 e
 * ele corta em SILENCIO. Um corte aqui nao daria erro: apagaria pedidos da
 * lista do cliente, que e exatamente o defeito que esta funcao veio consertar.
 */
async function pesoDosPedidos(
  ids: number[],
): Promise<Record<string, { modelos: number; quantidade: number }>> {
  const conta: Record<string, { modelos: number; quantidade: number }> = {};
  const LOTE = 40;
  const PAGINA = 1000;
  for (let i = 0; i < ids.length; i += LOTE) {
    const lote = ids.slice(i, i + LOTE).join(",");
    let de = 0;
    for (;;) {
      const linhas = (await banco(
        "GET",
        `pedidos_modelos?id_int=in.(${lote})&select=id_int,quantidade` +
          `&order=id.asc&limit=${PAGINA}&offset=${de}`,
      )) ?? [];
      for (const m of linhas) {
        const k = String(m.id_int);
        conta[k] ??= { modelos: 0, quantidade: 0 };
        conta[k].modelos += 1;
        conta[k].quantidade += Number(m.quantidade ?? 0);
      }
      if (linhas.length < PAGINA) break;
      de += PAGINA;
    }
  }
  return conta;
}

/**
 * Tudo o que a grafica precisa saber de um cliente, pelo numero dele.
 *
 * A busca desta tela passou a ser pelo NUMERO DO CLIENTE em 18/08/2026, por
 * decisao do usuario. O atendente atende o telefone e sabe quem esta do outro
 * lado -- o numero do pedido ele teria de perguntar, e o cliente muitas vezes
 * nao tem.
 *
 * ## TODOS os pedidos, e nao so os que ja subiram (04/09/2026)
 *
 * Ate hoje esta lista saia de `producao_acesso_pedidos` -- ou seja, so os
 * pedidos que JA passaram pela publicacao do controle de acesso. O efeito era
 * silencioso e ruim: o cliente 11406 tem quatro pedidos com modelo, e a tela
 * mostrava um. Os outros tres existiam, tinham numeracao, e nao havia caminho
 * nenhum ate eles por esta tela.
 *
 * Decisao do usuario, no mesmo dia: "todos os pedidos devem ficar disponiveis
 * para visualizacao e edicao pelo menu ideal control". Entao a lista passa a
 * sair das PROPOSTAS do cliente, e o que veio do controle vira enfeite de cada
 * linha -- `no_controle`, o evento, o quanto ja foi publicado.
 *
 * Fica de fora so o pedido sem modelo nenhum no ERP, que `painelDoPedido`
 * recusa com 404 por nao ter o que configurar. Quantos sao vai em
 * `sem_modelo`, para a tela poder dizer isso em vez de simplesmente omitir.
 */
async function painelDoCliente(idCliente: number): Promise<any> {
  const c = ((await banco(
    "GET",
    `clientes?id_cliente=eq.${idCliente}&select=id_cliente,nome,fantasia,email,email_contato`,
  )) ?? [])[0];
  if (!c) throw new Recusa(404, `o cliente ${idCliente} nao existe no ERP`);

  // As propostas do cliente primeiro: e o caminho mais curto entre "numero do
  // cliente" e "pedidos dele", porque a tabela de controle nao guarda o cliente
  // -- ela guarda o pedido.
  const propostas = ((await banco(
    "GET",
    `propostas?id_cliente=eq.${idCliente}&select=id_int,created_at` +
      "&order=created_at.desc&limit=200",
  )) ?? []).filter((p: any) => Number(p.id_int));

  const ids: number[] = [...new Set<number>(propostas.map((p: any) => Number(p.id_int)))];
  const peso = ids.length ? await pesoDosPedidos(ids) : {};

  // O que o controle de acesso sabe de cada um -- quando sabe alguma coisa.
  const doControle: Record<string, any> = {};
  if (ids.length) {
    for (
      const a of (await banco(
        "GET",
        `producao_acesso_pedidos?pedido_id_int=in.(${ids.join(",")})` +
          "&select=pedido_id_int,evento_id,publicado_em,total_credenciais",
      )) ?? []
    ) {
      doControle[String(a.pedido_id_int)] = a;
    }
  }

  let semModelo = 0;
  const pedidos: any[] = [];
  for (const p of propostas) {
    const chave = String(p.id_int);
    const q = peso[chave];
    if (!q) { semModelo += 1; continue; }
    const a = doControle[chave];
    pedidos.push({
      pedido_id_int: Number(p.id_int),
      created_at: p.created_at,
      modelos: q.modelos,
      quantidade: q.quantidade,
      no_controle: Boolean(a),
      evento_id: a?.evento_id ?? null,
      publicado_em: a?.publicado_em ?? null,
      total_credenciais: a?.total_credenciais ?? 0,
    });
  }

  const eventosDaLista: string[] = [...new Set<string>(
    pedidos.filter((p: any) => p.evento_id).map((p: any) => String(p.evento_id)),
  )].sort();
  const eventos: Record<string, any> = {};
  if (eventosDaLista.length) {
    const lista = eventosDaLista.map((i) => `"${i}"`).join(",");
    for (
      const e of (await banco(
        "GET",
        `producao_acesso_eventos?id=in.(${lista})` +
          "&select=id,nome_evento,data_evento,local_evento,status",
      )) ?? []
    ) {
      eventos[String(e.id)] = e;
    }
  }
  for (const p of pedidos) {
    const ev = eventos[String(p.evento_id)];
    p.nome_evento = ev?.nome_evento ?? null;
    p.data_evento = ev?.data_evento ?? null;
    p.local_evento = ev?.local_evento ?? null;
    p.status_evento = ev?.status ?? null;
  }

  return {
    cliente: {
      id_cliente: idCliente,
      nome: c?.nome ?? "",
      fantasia: c?.fantasia ?? "",
      email: String(c?.email || c?.email_contato || "").trim().toLowerCase(),
      contas: await contasDoCliente(idCliente),
    },
    pedidos,
    sem_modelo: semModelo,
  };
}

// ── Roteamento ──────────────────────────────────────────────────────────────

async function rotear(req: Request, url: URL): Promise<Response> {
  const p = pedacosDaRota(url.pathname);
  const q = url.searchParams;
  const metodo = req.method;
  const corpo = async () => {
    try {
      return await req.json();
    } catch {
      throw new Recusa(422, "corpo invalido: esperava JSON");
    }
  };

  // Todas as rotas passam por aqui. Nenhuma excecao -- e a ordem importa: a
  // conferencia acontece ANTES de qualquer leitura, para que um id invalido
  // de quem nao pode nem chegue a virar consulta.
  const quem = await quemConfigura(req.headers.get("authorization"));

  if (metodo === "GET" && p.length === 1 && p[0] === "pedidos") {
    const limite = q.has("limite") ? inteiro(q.get("limite"), "query", "limite") : 50;
    return ok({ pedidos: await pedidosComControle(limite) });
  }
  if (metodo === "GET" && p.length === 2 && p[0] === "pedidos") {
    return ok(await painelDoPedido(inteiro(p[1], "path", "pedido")));
  }
  if (metodo === "GET" && p.length === 2 && p[0] === "clientes") {
    return ok(await painelDoCliente(inteiro(p[1], "path", "cliente")));
  }
  if (metodo === "GET" && p.length === 1 && p[0] === "instalacao") {
    return ok({ url: URL_DE_INSTALACAO });
  }
  if (metodo === "POST" && p.length === 3 && p[0] === "clientes" && p[2] === "contas") {
    const c = await corpo();
    return ok(await liberarAcesso(inteiro(p[1], "path", "cliente"), String(c?.email ?? ""), quem.id));
  }
  if (metodo === "POST" && p.length === 3 && p[0] === "contas" && p[2] === "nova-senha") {
    return ok(await novaSenhaProvisoria(uuid(p[1], "conta")));
  }
  // ── As duas saidas que faltavam (04/09/2026) ──────────────────────────────
  //
  // O cliente carregou o pedido no evento errado, ou um modelo ganhou numeracao
  // com codigo depois do carregar. Ate agora as duas so tinham conserto a mao,
  // no banco -- e quem atende o telefone e esta tela.
  //
  // As MESMAS funcoes que o aplicativo do dono chama: a autorizacao difere (aqui
  // basta o papel, la e o dono mais a elevacao), a regra nao.
  if (metodo === "POST" && p.length === 3 && p[0] === "pedidos" &&
      p[2] === "desvincular") {
    const pedido = inteiro(p[1], "path", "pedido");
    const eventoId = (await eventoDoPedido(pedido))?.evento_id;
    if (!eventoId) throw new Recusa(409, "este pedido nao esta em nenhum evento");
    return ok(await desvincularPedido(pedido, eventoId));
  }
  if (metodo === "POST" && p.length === 3 && p[0] === "pedidos" &&
      p[2] === "sincronizar-setores") {
    const pedido = inteiro(p[1], "path", "pedido");
    const eventoId = (await eventoDoPedido(pedido))?.evento_id;
    if (!eventoId) throw new Recusa(409, "este pedido ainda nao virou evento");
    return ok(await sincronizarSetores(pedido, eventoId));
  }
  if (metodo === "GET" && p.length === 3 && p[0] === "pedidos" && p[2] === "dashboard") {
    const pedido = inteiro(p[1], "path", "pedido");
    const eventoId = (await eventoDoPedido(pedido))?.evento_id;
    if (!eventoId) throw new Recusa(404, "este pedido ainda nao virou evento");
    // O contratado desta tela sai dos MODELOS DO ERP que sobem ao controle, e
    // nao dos setores: o atendente abre o pedido para conferir o que foi
    // contratado, inclusive antes de o cliente carregar o pedido e os setores
    // existirem. O aplicativo do dono soma pelos setores, que e o que ele tem.
    // Por isso o `dashboard` recebe o numero pronto em vez de escolher um dos
    // dois caminhos por conta propria.
    const modelos = await modelosDoPedido(pedido);
    const contratado = modelos
      .filter((m) => m.sobe_ao_controle)
      .reduce((s, m) => s + m.quantidade, 0);
    return ok(await dashboard(
      eventoId,
      await setoresDoEvento(eventoId, pedido),
      contratado,
    ));
  }
  if (metodo === "GET" && p.length === 3 && p[0] === "setores" && p[2] === "ingressos") {
    return ok(await ingressosDoSetor(
      p[1],
      // O FastAPI declara `pagina: int` e `por_pagina: int`, entao texto que nao
      // converte e 422 ANTES de a rota rodar -- e nao um valor padrao.
      numeroDaPagina(q.has("pagina") ? inteiro(q.get("pagina"), "query", "pagina") : 1),
      tamanhoDaPagina(
        q.has("por_pagina") ? inteiro(q.get("por_pagina"), "query", "por_pagina") : null,
      ),
      q.get("busca"),
    ));
  }

  if (metodo === "PATCH" && p.length === 2 && p[0] === "eventos") {
    // O id gravado e o que voltou do banco, e nao o que chegou na URL: assim a
    // conferencia de formato cobre tambem a escrita.
    return ok(await aplicarEvento((await evento(p[1])).id, await corpo()));
  }
  if (metodo === "PATCH" && p.length === 2 && p[0] === "setores") {
    return ok(await aplicarSetor(await setor(p[1]), await corpo()));
  }
  if (metodo === "POST" && p.length === 3 && p[0] === "setores" && p[2] === "bloqueios") {
    return ok(await aplicarBloqueio(await setor(p[1]), await corpo(), quem.id));
  }
  if (metodo === "DELETE" && p.length === 4 && p[0] === "setores" && p[2] === "bloqueios") {
    return ok(await aplicarLiberacao(await setor(p[1]), uuid(p[3], "bloqueio")));
  }
  if (metodo === "POST" && p.length === 3 && p[0] === "eventos" && p[2] === "aparelhos") {
    return ok(await aplicarAparelhoNovo((await evento(p[1])).id, await corpo()));
  }
  if (metodo === "PATCH" && p.length === 2 && p[0] === "aparelhos") {
    return ok(await aplicarAparelho(await aparelho(p[1]), await corpo()));
  }
  if (metodo === "DELETE" && p.length === 2 && p[0] === "aparelhos") {
    return ok(await excluirAparelho(await aparelho(p[1])));
  }
  if (metodo === "POST" && p.length === 3 && p[0] === "aparelhos" && p[2] === "codigo") {
    return ok(await aplicarNovoCodigo(await aparelho(p[1])));
  }
  if (metodo === "POST" && p.length === 3 && p[0] === "setores" && p[2] === "codigos") {
    // O `setor_id` vem da URL e sobrescreve qualquer um que viesse no corpo: a
    // tela ja esta dentro de um setor, e aceitar um segundo pela porta dos
    // fundos deixaria os codigos cairem em outro portao sem ninguem perceber.
    const s = await setor(p[1]);
    return ok(await aplicarCodigos(s.evento_id, { ...(await corpo()), setor_id: s.id }));
  }

  // O texto e o do FastAPI, e nao um nosso mais bonito: e o que a tela recebe
  // hoje do Render, e o corte tem de ser invisivel para ela.
  //
  // E o CODIGO depende do METODO: GET vira 404 e o resto vira 405, por causa de
  // como o `app.py` esta montado. Aqui era um 404 fixo ate a Tarefa 3, e ele
  // acertava so o caso que o teste de paridade exercitava -- um POST para rota
  // errada respondia 404 nesta funcao e 405 no Render.
  recusaDeRotaDesconhecida(metodo);
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const origem = origemPermitida(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return respostaDePreflight(origem, "GET, POST, PATCH, DELETE, OPTIONS");
  }

  try {
    return comCors(await rotear(req, url), origem);
  } catch (e) {
    if (e instanceof Recusa) {
      const corpo = e instanceof RecusaDeValidacao
        ? { detail: e.detalhes }
        : { detail: e.detail };
      return comCors(
        new Response(JSON.stringify(corpo), {
          status: e.status,
          headers: JSON_HEADERS,
        }),
        origem,
      );
    }
    // Defeito nosso. O detalhe vai para o log da funcao, e NAO para o corpo da
    // resposta: mensagem de erro interno na tela nao ajuda o atendente e conta
    // a um estranho como o servidor esta montado por dentro.
    console.error("[acesso-interno]", e);
    return comCors(
      new Response(JSON.stringify({ detail: "erro interno" }), {
        status: 500,
        headers: JSON_HEADERS,
      }),
      origem,
    );
  }
});
