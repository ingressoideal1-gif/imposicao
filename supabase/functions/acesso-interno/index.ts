/**
 * O Ideal Control da grafica: as 12 rotas de `/api/acesso/interno/*`.
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
  aplicarAparelho,
  aplicarAparelhoNovo,
  aplicarBloqueio,
  aplicarCodigos,
  aplicarEvento,
  aplicarLiberacao,
  aplicarNovoCodigo,
  aplicarSetor,
} from "../_compartilhado/configuracao.ts";
import {
  horaCheia,
  MOTIVOS,
  numeracaoDoModelo,
  numeroDaPagina,
  pedacosDaRota,
  situacao,
  tamanhoDaPagina,
  termoSeguro,
} from "./puro.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * Teto de leituras trazidas para montar o grafico por hora. Os TOTAIS nao
 * passam por aqui -- eles saem de `contar()`, que e exato a qualquer tamanho.
 * So o histograma precisa das linhas, e um evento gigante nao pode travar a
 * tela. Quando o teto e atingido, a resposta DIZ (`grafico_truncado`): um corte
 * silencioso viraria um grafico que parece completo e nao e.
 */
const LEITURAS_PARA_O_GRAFICO = 20000;

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

/**
 * A recusa que o FastAPI produz sozinho quando um `int` nao converte.
 *
 * Reproduzida ao pe da letra -- `type`, `loc`, `msg` e `input` -- e medida
 * contra o Render em 16/08/2026. Nao e capricho: enquanto as duas pilhas
 * conviverem, a mesma tela pode falar com qualquer uma das duas, e uma recusa
 * com formato diferente e uma tela que quebra de um jeito num endereco e de
 * outro no outro.
 *
 * A `loc` diz de onde veio o valor ruim: `["path", "pedido"]` ou
 * `["query", "limite"]`. E o que permite a tela apontar o campo errado.
 */
class RecusaDeValidacao extends Recusa {
  constructor(public detalhes: unknown[]) {
    super(422, "");
  }
}

function recusaDeInteiro(onde: "path" | "query", nome: string, valor: unknown): never {
  throw new RecusaDeValidacao([{
    type: "int_parsing",
    loc: [onde, nome],
    msg: "Input should be a valid integer, unable to parse string as an integer",
    input: valor,
  }]);
}

/**
 * O `int` de um parametro de caminho ou de busca.
 *
 * O Python aceita o que `int()` aceita: `"18560"` sim, `"18560.0"` nao,
 * `" 18560 "` sim (o `int()` apara espacos). O `Number()` do JavaScript e mais
 * frouxo -- `Number("")` e 0 e `Number("0x10")` e 16 --, entao a conferencia e
 * por regex antes de converter.
 */
function inteiro(valor: unknown, onde: "path" | "query", nome: string): number {
  const texto = String(valor ?? "").trim();
  if (!/^[+-]?\d+$/.test(texto)) recusaDeInteiro(onde, nome, valor);
  return Number(texto);
}

// ── Leitura ─────────────────────────────────────────────────────────────────

/**
 * Traz uma tabela inteira em paginas de 1.000, ate o teto.
 *
 * O `order` tem de vir no caminho: sem ordem definida, o PostgREST pode repetir
 * e pular linhas entre paginas -- duas paginas somariam 2.000 linhas com
 * repetidas dentro.
 */
async function todasAsLinhas(
  caminho: string,
  teto = LEITURAS_PARA_O_GRAFICO,
): Promise<[any[], boolean]> {
  const linhas: any[] = [];
  let inicio = 0;
  while (inicio < teto) {
    const lote = (await banco("GET", `${caminho}&offset=${inicio}&limit=1000`)) ?? [];
    linhas.push(...lote);
    if (lote.length < 1000) return [linhas, false];
    inicio += 1000;
  }
  return [linhas, true];
}

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
    filtro + "&select=id,nome,quantidade,tipo_uso,abre_em,fecha_em," +
      "pedido_id_int,modelo_id&order=nome.asc",
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

async function numerosDoSetor(setorId: string): Promise<any> {
  return {
    publicadas: await contar(
      `producao_acesso_credenciais?setor_id=eq.${setorId}&origem=eq.qr_ideal`,
    ),
    codigos_cliente: await contar(
      `producao_acesso_credenciais?setor_id=eq.${setorId}&origem=eq.cliente`,
    ),
    entradas: await contar(
      `producao_acesso_leituras?setor_id=eq.${setorId}` +
        "&resultado=eq.permitido&tipo=eq.entrada",
    ),
  };
}

async function dashboard(eventoId: string, setores: any[], modelos: any[]): Promise<any> {
  const contratado = modelos
    .filter((m) => m.sobe_ao_controle)
    .reduce((s, m) => s + m.quantidade, 0);

  const publicado = await contar(
    `producao_acesso_credenciais?evento_id=eq.${eventoId}&origem=eq.qr_ideal`,
  );
  const cortesias = await contar(
    `producao_acesso_credenciais?evento_id=eq.${eventoId}&origem=eq.cliente`,
  );
  const entradas = await contar(
    `producao_acesso_leituras?evento_id=eq.${eventoId}&resultado=eq.permitido&tipo=eq.entrada`,
  );
  const saidas = await contar(
    `producao_acesso_leituras?evento_id=eq.${eventoId}&resultado=eq.permitido&tipo=eq.saida`,
  );
  const recusadas = await contar(
    `producao_acesso_leituras?evento_id=eq.${eventoId}&resultado=eq.negado`,
  );

  const [leituras, truncado] = await todasAsLinhas(
    `producao_acesso_leituras?evento_id=eq.${eventoId}` +
      "&select=momento,resultado,motivo,tipo,setor_id,dispositivo_id&order=momento.asc",
  );

  const porHora: Record<string, { entradas: number; saidas: number; recusas: number }> = {};
  const entradasPorSetor: Record<string, number> = {};
  const motivos: Record<string, number> = {};
  for (const l of leituras) {
    if (l.resultado === "permitido" && l.tipo !== "saida" && l.setor_id) {
      const k = String(l.setor_id);
      entradasPorSetor[k] = (entradasPorSetor[k] ?? 0) + 1;
    }
    if (l.resultado === "negado") {
      const m = l.motivo ?? null;
      motivos[String(m)] = (motivos[String(m)] ?? 0) + 1;
    }

    const hora = horaCheia(l.momento);
    if (!hora) continue;
    porHora[hora] ??= { entradas: 0, saidas: 0, recusas: 0 };
    if (l.resultado === "negado") porHora[hora].recusas += 1;
    else if (l.tipo === "saida") porHora[hora].saidas += 1;
    else porHora[hora].entradas += 1;
  }

  const bloqueados = setores.reduce(
    (soma, s) =>
      soma + (s.bloqueios ?? []).reduce(
        (t: number, b: any) => t + Math.max(0, b.ate - b.de + 1),
        0,
      ),
    0,
  );

  const horasOrdenadas = Object.keys(porHora).sort();
  let pico: string | null = null;
  let picoEntradas = 0;
  for (const h of horasOrdenadas) {
    if (porHora[h].entradas > picoEntradas) {
      picoEntradas = porHora[h].entradas;
      pico = h;
    }
  }
  // `max(..., default=(None, 0))[0]` do Python devolve a PRIMEIRA hora quando
  // todas empatam em zero. Sem esta linha, o `>` acima deixaria `pico` nulo.
  if (pico === null && horasOrdenadas.length) pico = horasOrdenadas[0];

  return {
    publico: {
      contratado,
      publicado,
      cortesias,
      entraram: entradas,
      sairam: saidas,
      // Quem esta DENTRO agora. So faz sentido onde ha reentrada; nos setores de
      // entrada unica, saidas sao sempre zero e o numero coincide com
      // "entraram" -- que e o comportamento certo.
      presentes: Math.max(0, entradas - saidas),
      recusadas,
      bloqueados,
      // A pergunta que o dono faz primeiro: quantos dos que compraram
      // apareceram? Sem `publicado` ainda nao ha denominador, e devolver 0%
      // mentiria -- devolve nulo e a tela diz "—".
      comparecimento_pct: publicado
        ? Math.round(entradas * 1000.0 / publicado) / 10
        : null,
    },
    // Sai da MESMA varredura de leituras que o histograma usa -- nenhuma
    // consulta a mais. Contar por setor no banco custaria uma ida por setor.
    por_setor: setores.map((s) => ({
      setor_id: s.id,
      nome: s.nome,
      contratado: s.quantidade ?? 0,
      entraram: entradasPorSetor[String(s.id)] ?? 0,
      ocupacao_pct: s.quantidade
        ? Math.round((entradasPorSetor[String(s.id)] ?? 0) * 1000.0 / s.quantidade) / 10
        : null,
    })),
    recusas: Object.entries(motivos)
      .sort((a, b) => b[1] - a[1])
      .map(([m, quantas]) => ({
        motivo: m === "null" ? "sem motivo" : m,
        rotulo: MOTIVOS[m] ?? (m === "null" ? "sem motivo" : m),
        quantas,
      })),
    por_hora: horasOrdenadas.map((h) => ({ hora: h, ...porHora[h] })),
    pico,
    // Nenhum corte silencioso: quando o histograma nao cabe no teto, a resposta
    // diz. Um grafico cortado que nao avisa se le como o evento inteiro -- e o
    // numero que ele contradiz (`entraram`) esta logo acima.
    grafico_truncado: truncado,
    leituras_lidas: leituras.length,
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

async function entradasPorCredencial(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  const lista = ids.map((i) => `"${i}"`).join(",");
  const linhas = (await banco(
    "GET",
    `producao_acesso_leituras?credencial_id=in.(${lista})` +
      "&resultado=eq.permitido&tipo=eq.entrada" +
      "&select=credencial_id,momento&order=momento.asc",
  )) ?? [];
  const primeira: Record<string, string> = {};
  for (const l of linhas) {
    const k = String(l.credencial_id);
    if (!(k in primeira)) primeira[k] = l.momento;
  }
  return primeira;
}

/**
 * Os ingressos de um setor, com a situacao de cada um.
 *
 * O CODIGO NAO ENTRA. A lista traz o numero (que e o que esta impresso e o que
 * o atendente procura), a origem e a situacao. `codigo_visivel` so sai para os
 * codigos que o proprio cliente carregou.
 */
async function ingressosDoSetor(
  setorId: string,
  pagina: number,
  porPagina: number,
  busca: string | null,
): Promise<any> {
  const s = await setor(setorId);

  let filtro = `producao_acesso_credenciais?setor_id=eq.${s.id}`;
  if (busca !== null && busca !== "") {
    if (/^\d+$/.test(busca.trim())) {
      filtro += `&numero=eq.${Number(busca)}`;
    } else {
      filtro += `&codigo_visivel=ilike.*${termoSeguro(busca)}*`;
    }
  }

  // `order` explicito e sempre o mesmo: sem ele, duas paginas do PostgREST
  // podem repetir e pular linhas, e a tela mostraria o mesmo ingresso duas
  // vezes em paginas diferentes.
  //
  // Pede UMA linha a mais do que cabe. E como se sabe que "ha mais" sem uma
  // segunda consulta -- e sem prometer um total que o teto de 1.000 do
  // PostgREST nao deixaria contar de graca.
  let linhas = (await banco(
    "GET",
    filtro + "&select=id,numero,codigo_visivel,origem,status,created_at" +
      "&order=numero.asc,created_at.asc" +
      `&offset=${(pagina - 1) * porPagina}&limit=${porPagina + 1}`,
  )) ?? [];
  const haMais = linhas.length > porPagina;
  linhas = linhas.slice(0, porPagina);

  const entradas = await entradasPorCredencial(linhas.map((l: any) => l.id));
  const faixas = ((await banco(
    "GET",
    `producao_acesso_bloqueios?setor_id=eq.${s.id}&status=eq.ativo&select=de,ate,motivo`,
  )) ?? []) as any[];

  const ingressos = linhas.map((l: any) => {
    const numero = l.numero;
    const bloqueio = faixas.find(
      (f) => numero !== null && numero !== undefined && f.de <= numero && numero <= f.ate,
    )?.motivo ?? null;
    const entrada = entradas[String(l.id)] ?? null;
    return {
      id: l.id,
      numero,
      // So o do cliente. O do QR Ideal nao existe em claro em lugar nenhum --
      // nem aqui, nem no banco.
      codigo: l.origem === "cliente" ? (l.codigo_visivel ?? null) : null,
      origem: l.origem,
      situacao: situacao(l, bloqueio, entrada),
      motivo_bloqueio: bloqueio,
      entrou_em: entrada,
    };
  });

  return {
    setor: { id: s.id, nome: s.nome ?? null, quantidade: s.quantidade ?? null },
    pagina,
    por_pagina: porPagina,
    ha_mais: haMais,
    ingressos,
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
  if (metodo === "GET" && p.length === 3 && p[0] === "pedidos" && p[2] === "dashboard") {
    const pedido = inteiro(p[1], "path", "pedido");
    const eventoId = (await eventoDoPedido(pedido))?.evento_id;
    if (!eventoId) throw new Recusa(404, "este pedido ainda nao virou evento");
    return ok(await dashboard(
      eventoId,
      await setoresDoEvento(eventoId, pedido),
      await modelosDoPedido(pedido),
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
  throw new Recusa(404, "Not Found");
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
