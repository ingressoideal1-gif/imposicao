/**
 * Os tres endpoints do aparelho da portaria, agora ao lado do banco.
 *
 * Porte fiel do `acesso_portaria.py`. Enquanto os dois conviverem, o
 * `tests/test_portaria_paridade.py` compara as respostas campo a campo -- e e
 * ele que autoriza o corte, nao a leitura deste arquivo.
 *
 * ## Por que isto existe
 *
 * No Python, cada consulta do aparelho fazia DUAS travessias de internet:
 * celular -> Render -> Supabase e a volta toda. E o Render dorme. No portao,
 * com fila e 4G, isso se sentia. Aqui a funcao roda dentro da infraestrutura do
 * Supabase: uma travessia, sem cold start.
 *
 * ## O que NAO pode divergir do Python
 *
 * O formato das respostas, os codigos de status e o silencio: codigo errado,
 * aparelho revogado e evento inexistente devolvem a MESMA coisa, porque
 * responder diferente conta a um estranho o que existe do outro lado.
 */
import { hashCodigo, hashDoToken, tokenNovo } from "../_compartilhado/hash.ts";
import { usarQrEvento } from "../_compartilhado/qr_evento.ts";
import { Recusa } from "../_compartilhado/sessao.ts";
import { registrarPin, elevarPin } from "../_compartilhado/pin_instalacao.ts";
import { editarComPin } from "../_compartilhado/edicao_pin.ts";
import { banco, contar } from "../_compartilhado/banco.ts";
import { iguaisEmTempoConstante, rotaPedida } from "./puro.ts";
import { comCors, origemPermitida, respostaDePreflight } from "../_compartilhado/cors.ts";

// Quantas credenciais por pagina da carga.
//
// TEM DE FICAR ABAIXO DE 1000: o PostgREST deste projeto tem `max_rows = 1000`
// (esta no supabase/config.toml), e esse teto vence QUALQUER limit pedido na
// URL, caladamente. O paginador pede POR_PAGINA + 1 para saber se ha proxima
// pagina; com POR_PAGINA >= 1000 esse "+1" tambem seria cortado, `temProxima`
// nunca ficaria true, e o aparelho pararia achando que baixou o evento inteiro
// faltando metade. Ja mordeu em producao: pedido 18560, 2.000 credenciais
// gravadas e a leitura devolvendo 1.000.
const POR_PAGINA = 500;

const MAXIMO_LEITURAS = 500;

// Quantas entradas a rota leve devolve por vez.
//
// Vale o MESMO teto de 1000 linhas do PostgREST explicado acima, e ele morde
// aqui do jeito mais silencioso possivel: no primeiro sincronismo depois de um
// boot, no meio de um evento grande, ha muito mais de mil entradas registradas.
// Sem paginar, a lista voltaria cortada em 1000 sem aviso nenhum, e as entradas
// que sobraram simplesmente nunca chegariam ao portao -- que passaria a deixar
// entrar de novo quem ja entrou.
const ENTRADAS_POR_VEZ = 500;

// Forca bruta no pareamento. A contagem mora no BANCO -- Edge Function e
// stateless, e um contador em memoria comecaria do zero a cada invocacao.
// Enquanto o Python e esta funcao conviverem, os dois contam na MESMA tabela:
// contagens separadas dariam ao atacante o dobro de tentativas, bastando
// alternar entre os dois enderecos.
const MAXIMO_FALHAS = 10;
const JANELA_DE_FALHAS = 300; // segundos
const TABELA_FALHAS = "producao_acesso_falhas_pareamento";

const RESULTADOS = ["permitido", "negado"];

const FORMATO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * As recusas viajam como `Response` LANCADA -- e o equivalente do
 * `HTTPException` do FastAPI. O `Deno.serve` no fim do arquivo devolve a
 * resposta quando o que foi lancado e uma `Response`, e trata qualquer outra
 * coisa como defeito nosso.
 */
function erro(status: number, detail: string): Response {
  return new Response(JSON.stringify({ detail }), { status, headers: JSON_HEADERS });
}

function ok(corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), { headers: JSON_HEADERS });
}

// `hashDoToken` e `tokenNovo` moram no `_compartilhado/hash.ts` desde
// 16/08/2026. Eram daqui, e nao podiam continuar sendo: desde que o dono passou
// a configurar o aparelho no proprio aparelho, quem CUNHA o token e a criacao
// do aparelho, e quem o CONFERE e esta funcao. Duas definicoes do mesmo hash
// divergiriam algum dia, e o sintoma seria aparelho recusado sem motivo
// aparente -- no portao, com fila.

async function conferirForcaBruta(eventoId: string): Promise<void> {
  // `toISOString()` termina em `Z`. NAO trocar por nada que produza `+00:00`:
  // numa query string o `+` significa espaco, o filtro chega quebrado e o
  // PostgREST responde 400 -- o porteiro levaria erro com fila na frente. Foi
  // exatamente esse defeito que apareceu no Python em 16/08/2026.
  const desde = new Date(Date.now() - JANELA_DE_FALHAS * 1000).toISOString();
  // `limit`: nao interessa se sao 10 ou 10.000 falhas, so se chegou ao teto.
  const recentes = (await banco(
    "GET",
    `${TABELA_FALHAS}?evento_id=eq.${eventoId}&momento=gte.${desde}` +
      `&select=id&limit=${MAXIMO_FALHAS}`,
  )) ?? [];
  if (recentes.length >= MAXIMO_FALHAS) {
    throw erro(429, "muitas tentativas; espere cinco minutos e tente de novo");
  }
}

/**
 * A MESMA resposta para codigo errado, aparelho revogado e evento que nao
 * existe. Responder diferente contaria a um estranho o que existe do outro lado.
 */
async function recusarPareamento(eventoId: string): Promise<never> {
  // O `momento` nao vai no corpo: quem carimba e o banco (`default now()`).
  // Mandar daqui deixaria o freio a merce do relogio de quem chama -- e o
  // relogio da Edge Function nao e o mesmo da estacao.
  await banco("POST", TABELA_FALHAS, { evento_id: eventoId }, "return=minimal");
  throw erro(401, "codigo invalido");
}

async function setoresDoAparelho(dispositivoId: string): Promise<string[]> {
  const vinculos = (await banco(
    "GET",
    `producao_acesso_dispositivo_setores?dispositivo_id=eq.${dispositivoId}` +
      `&select=setor_id`,
  )) ?? [];
  return vinculos.map((v: any) => v.setor_id);
}

/**
 * Quem esta falando. Revogar o aparelho na tela do dono zera o `token_hash` e
 * faz esta funcao recusar na requisicao seguinte -- e o unico jeito de tirar um
 * aparelho de circulacao.
 */
async function aparelhoDoToken(cabecalho: string | null): Promise<any> {
  const valor = (cabecalho ?? "").trim();
  if (!valor.toLowerCase().startsWith("bearer ")) {
    throw erro(401, "aparelho nao pareado");
  }
  const hash = await hashDoToken(valor.slice(7).trim());
  const achados = (await banco(
    "GET",
    `producao_acesso_dispositivos?token_hash=eq.${hash}&status=eq.ativo` +
      `&select=id,evento_id,nome,instalacao_id`,
  )) ?? [];
  if (!achados.length) throw erro(401, "aparelho nao pareado ou revogado");
  return achados[0];
}

/** Troca o codigo de seis caracteres por um token do aparelho. */
async function entrar(corpo: any): Promise<Response> {
  const eventoId = String(corpo?.evento_id ?? "").trim();
  const codigo = String(corpo?.codigo ?? "").trim().toUpperCase();
  if (!eventoId || !codigo) return erro(422, "informe o evento e o codigo");

  // O formato do id e conferido AQUI, antes de ir ao banco. Sem isto o
  // PostgREST recusa `id=eq.nao-e-uuid` com erro de tipo, o `banco()` levanta, e
  // o porteiro recebe "erro interno" -- num portao, com fila, e sem nada que ele
  // possa fazer. E a resposta e a MESMA dos outros casos, de proposito.
  if (!FORMATO_UUID.test(eventoId)) await recusarPareamento(eventoId);

  await conferirForcaBruta(eventoId);

  const evento = ((await banco(
    "GET",
    `producao_acesso_eventos?id=eq.${eventoId}&select=id,nome_evento,sal`,
  )) ?? [])[0];
  if (!evento) await recusarPareamento(eventoId);

  // UM PBKDF2 para a tentativa inteira: o hash depende do codigo e do sal do
  // evento, e nao do aparelho. Comparar contra cada aparelho depois e de graca.
  const tentativa = await hashCodigo(codigo, evento.sal);

  const aparelhos = (await banco(
    "GET",
    `producao_acesso_dispositivos?evento_id=eq.${eventoId}&status=eq.ativo` +
      `&select=id,nome,codigo_hash`,
  )) ?? [];
  const achado = aparelhos.find((a: any) =>
    iguaisEmTempoConstante(String(a.codigo_hash ?? ""), tentativa)
  );
  if (!achado) await recusarPareamento(eventoId);

  const token = tokenNovo();
  await banco(
    "PATCH",
    `producao_acesso_dispositivos?id=eq.${achado.id}`,
    { token_hash: await hashDoToken(token), ultimo_visto: "now()" },
    "return=minimal",
  );

  // Quem acertou provou que nao e o atacante. Deixar a contagem de pe faria o
  // porteiro que errou antes de acertar chegar mais perto do teto sem motivo.
  await banco(
    "DELETE",
    `${TABELA_FALHAS}?evento_id=eq.${eventoId}`,
    undefined,
    "return=minimal",
  );

  return ok({
    token,
    aparelho: {
      id: achado.id,
      nome: achado.nome,
      setores: await setoresDoAparelho(achado.id),
    },
    evento: { id: evento.id, nome: evento.nome_evento },
  });
}

/** Dados públicos do evento, limitados ao token deste aparelho. */
async function dadosDoEvento(cabecalho: string | null): Promise<Response> {
  const aparelho = await aparelhoDoToken(cabecalho);
  const evento = ((await banco("GET", `producao_acesso_eventos?id=eq.${aparelho.evento_id}` +
    "&select=id,nome_evento,data_evento,local_evento,status")) ?? [])[0];
  if (!evento) return erro(409, "evento nao existe mais");
  return ok({evento: {id:evento.id, nome_evento:evento.nome_evento, data_evento:evento.data_evento, local_evento:evento.local_evento, status:evento.status}});
}

/** Marca leve da publicação: não expõe códigos nem dados das credenciais. */
async function publicacaoDoEvento(eventoId: string) {
  const pedidos: any[] = [];
  for (let offset = 0;; offset += 1000) {
    const lote = (await banco("GET", `producao_acesso_pedidos?evento_id=eq.${eventoId}` +
      `&select=pedido_id_int,publicado_em,total_credenciais&order=pedido_id_int.asc&limit=1000&offset=${offset}`)) ?? [];
    pedidos.push(...lote);
    if (lote.length < 1000) break;
  }
  return {
    versao: JSON.stringify(pedidos.map(p => [p.pedido_id_int, p.publicado_em, p.total_credenciais])),
    concluida: pedidos.length > 0 && pedidos.every(p => p.publicado_em && Number(p.total_credenciais) > 0),
    leitor_minimo: await banco("POST", "rpc/producao_acesso_qr_leitor_evento", { p_evento: eventoId }),
  };
}

/** A carga do evento: tudo o que o aparelho precisa para decidir sem rede. */
async function faixa(
  cabecalho: string | null,
  desdeBruto: string | null,
  leitor = 1,
): Promise<Response> {
  const aparelho = await aparelhoDoToken(cabecalho);
  const eventoId = aparelho.evento_id;
  const publicacao = await publicacaoDoEvento(eventoId);
  if (leitor < publicacao.leitor_minimo) return erro(426, "Atualize o Ideal Control e conclua o download antes de usar este evento offline.");
  const desde = Math.max(0, parseInt(desdeBruto ?? "0") || 0);

  const evento = ((await banco(
    "GET",
    `producao_acesso_eventos?id=eq.${eventoId}&select=id,nome_evento,data_evento,local_evento,sal,status`,
  )) ?? [])[0];
  if (!evento) return erro(409, "evento nao existe mais");

  // `bloqueado`/`bloqueado_motivo` vem junto com o resto do setor de proposito:
  // a decisao no portao e tomada sem rede, com esta carga, e um bloqueio que
  // dependesse de uma segunda consulta simplesmente nao chegaria la.
  //
  // Nao confundir com `producao_acesso_bloqueios`, logo abaixo: aquilo e faixa
  // de NUMEROS suspensa dentro do setor; isto aqui e a porta inteira desligada
  // pelo dono.
  const setores = (await banco(
    "GET",
    `producao_acesso_setores?evento_id=eq.${eventoId}&status=eq.ativo` +
      `&select=id,nome,quantidade,tipo_uso,abre_em,fecha_em` +
      `,bloqueado,bloqueado_motivo&order=nome.asc`,
  )) ?? [];
  const bloqueios = (await banco(
    "GET",
    `producao_acesso_bloqueios?evento_id=eq.${eventoId}&status=eq.ativo` +
      `&select=setor_id,de,ate,motivo`,
  )) ?? [];
  const pedidos = (await banco(
    "GET",
    `producao_acesso_pedidos?evento_id=eq.${eventoId}&select=pedido_id_int,sal`,
  )) ?? [];

  // O evento INTEIRO, e nao so os setores deste aparelho. E o que torna a regra
  // `setor_nao_autorizado` possivel: com so os setores autorizados, um ingresso
  // de outra porta cairia em `desconhecido` e o porteiro devolveria ingresso bom
  // achando que e falso.
  //
  // Pede POR_PAGINA + 1: e o unico jeito de saber se ha proxima pagina quando o
  // total e MULTIPLO exato de POR_PAGINA. `pagina.length === POR_PAGINA` sozinho
  // nao distingue "esta e a ultima, e veio cheia" de "ha mais depois dela". O
  // item extra nunca sobe na resposta.
  const paginaMaisUma = (await banco(
    "GET",
    `producao_acesso_credenciais?evento_id=eq.${eventoId}&status=eq.ativo` +
      `&select=id,codigo_hash,setor_id,numero&order=id.asc` +
      `&offset=${desde}&limit=${POR_PAGINA + 1}`,
  )) ?? [];
  const temProxima = paginaMaisUma.length > POR_PAGINA;
  const pagina = paginaMaisUma.slice(0, POR_PAGINA);

  const sais: Record<string, string> = {};
  for (const p of pedidos) sais[String(p.pedido_id_int)] = p.sal;

  return ok({
    evento: {
      id: evento.id,
      nome: evento.nome_evento,
      data_evento: evento.data_evento, local_evento: evento.local_evento, status: evento.status,
      sal: evento.sal,
      // Booleano, e nao o texto do status: quem le e o `portaria-validacao.js`,
      // que decide sem rede e nao pode ficar sabendo dos valores do banco.
      ativo: evento.status === "ativo",
    },
    aparelho: {
      id: aparelho.id,
      nome: aparelho.nome,
      setores: await setoresDoAparelho(aparelho.id),
    },
    publicacao,
    sais,
    setores,
    bloqueios,
    // Nomes curtos de proposito: sao ate 30.000 objetos numa rede de portao, e
    // `codigo_hash`/`setor_id`/`numero` por extenso somariam ~1 MB so de nomes
    // de campo.
    credenciais: pagina.map((c: any) => ({
      h: c.codigo_hash,
      s: c.setor_id,
      n: c.numero,
      id: c.id,
    })),
    proxima: temProxima ? desde + POR_PAGINA : null,
  });
}

/** Validação estrutural antes da RPC; nenhum dado bruto entra em filtros SQL. */
function leituraValida(i: any): boolean {
  return i && typeof i.id_local === "string" && i.id_local.length > 0 && i.id_local.length <= 128 &&
    typeof i.momento === "string" && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(i.momento) &&
    Number.isFinite(Date.parse(i.momento)) && RESULTADOS.includes(i.resultado) &&
    (i.credencial_id == null || (typeof i.credencial_id === "string" && FORMATO_UUID.test(i.credencial_id))) &&
    (i.setor_id == null || (typeof i.setor_id === "string" && FORMATO_UUID.test(i.setor_id))) &&
    (i.motivo == null || (typeof i.motivo === "string" && i.motivo.length <= 200));
}

async function registrarLeituras(aparelho: any, itens: any[], online: boolean): Promise<any[]> {
  const respostas = await banco("POST", "rpc/producao_acesso_registrar_leituras", {
    p_dispositivo: aparelho.id, p_itens: itens, p_online: online,
  });
  if (!Array.isArray(respostas) || respostas.length !== itens.length ||
      respostas.some((r: any, i: number) => r.id_local !== itens[i].id_local ||
        !RESULTADOS.includes(r.resultado))) {
    throw new Error("O banco não confirmou todas as leituras.");
  }
  return respostas;
}

/** A fila usa a mesma validação e identidade da conferência online. */
async function leituras(cabecalho: string | null, corpo: any): Promise<Response> {
  const aparelho = await aparelhoDoToken(cabecalho);
  const itens = corpo?.leituras;
  if (!Array.isArray(itens) || itens.length > MAXIMO_LEITURAS || !itens.every(leituraValida)) {
    return erro(422, "lote de leituras inválido");
  }
  const respostas = itens.length ? await registrarLeituras(aparelho, itens, false) : [];
  return ok({ gravadas: respostas.length, confirmadas: respostas.map(r => r.id_local) });
}

/** Reserva e histórico são gravados juntos; um reenvio mantém a decisão original. */
async function entrada(cabecalho: string | null, corpo: any): Promise<Response> {
  const aparelho = await aparelhoDoToken(cabecalho);
  if (!leituraValida(corpo)) return erro(422, "leitura inválida");
  return ok((await registrarLeituras(aparelho, [corpo], true))[0]);
}

/**
 * `sincronizar`: so o que MUDOU -- evento, setores, bloqueios, `entradas`,
 * `totais` e a marca de quando o dono zerou a contagem. Sem a lista de
 * ingressos, e essa ausencia e a razao inteira de esta rota existir.
 *
 * O portao volta aqui a cada cinco minutos. Descer as credenciais junto seria
 * repetir ate 30.000 objetos numa rede de portao, doze vezes por hora, para
 * saber que um setor foi bloqueado -- a diferenca entre alguns kB e varias
 * paginas. A lista pesada continua vindo pelo `/faixa`, que so muda quando a
 * grafica publica mais.
 *
 * Sincronismo que falha nao interrompe nada: quem chama segue lendo com o que
 * tem e tenta de novo em cinco minutos.
 */
async function sincronizar(
  cabecalho: string | null,
  desdeBruto: string | null,
): Promise<Response> {
  const aparelho = await aparelhoDoToken(cabecalho);
  const eventoId = aparelho.evento_id;

  const evento = ((await banco(
    "GET",
    `producao_acesso_eventos?id=eq.${eventoId}&select=id,nome_evento,data_evento,local_evento,status,entradas_zeradas_em`,
  )) ?? [])[0];
  if (!evento) return erro(409, "evento nao existe mais");

  const setores = (await banco(
    "GET",
    `producao_acesso_setores?evento_id=eq.${eventoId}&status=eq.ativo` +
      `&select=id,nome,quantidade,bloqueado,bloqueado_motivo,abre_em,fecha_em,tipo_uso&order=nome.asc`,
  )) ?? [];
  const bloqueios = (await banco(
    "GET",
    `producao_acesso_bloqueios?evento_id=eq.${eventoId}&status=eq.ativo` +
      `&select=setor_id,de,ate,motivo`,
  )) ?? [];

  // Cursor por chave imutável, independente do horário informado pelo celular.
  // Datas de clientes antigos reiniciam uma varredura segura. Ao terminar cada
  // ciclo o cliente volta ao início, incluindo entradas offline recebidas tarde.
  let cursor: string | null = null;
  if (desdeBruto?.startsWith("id:")) {
    cursor = desdeBruto.slice(3);
    if (!FORMATO_UUID.test(cursor)) return erro(422, "cursor de entradas inválido");
  } else if (desdeBruto && !Number.isFinite(Date.parse(desdeBruto))) {
    return erro(422, "cursor de entradas inválido");
  }
  const filtro = cursor ? `&credencial_id=gt.${cursor}` : "";
  const maisUma = (await banco(
    "GET",
    `producao_acesso_entradas_unicas?evento_id=eq.${eventoId}${filtro}` +
      `&select=credencial_id,momento&order=credencial_id.asc` +
      `&limit=${ENTRADAS_POR_VEZ + 1}`,
  )) ?? [];
  const temMais = maisUma.length > ENTRADAS_POR_VEZ;
  const entradas = maisUma.slice(0, ENTRADAS_POR_VEZ);

  // Contados no BANCO, e nao pelo tamanho de uma lista: o teto de 1000 linhas do
  // PostgREST daria 1000 como total de qualquer setor maior que isso, calado.
  //
  // A contagem sai das LEITURAS permitidas, e nao da tabela de entradas unicas,
  // porque o contador da tela soma todos os setores do portao -- e setor de
  // reentrada nao tem linha nenhuma la.
  const totais: Record<string, number> = {};
  for (const s of setores) {
    totais[s.id] = await contar(
      `producao_acesso_leituras?evento_id=eq.${eventoId}&setor_id=eq.${s.id}` +
        `&resultado=eq.permitido`,
    );
  }

  // O portao que so le e nunca tem fila para enviar ficaria "sumido" na tela do
  // dono, porque ate agora quem carimbava o `ultimo_visto` era o envio da fila.
  // Este relogio de cinco minutos e o batimento honesto do aparelho.
  await banco(
    "PATCH",
    `producao_acesso_dispositivos?id=eq.${aparelho.id}`,
    { ultimo_visto: "now()" },
    "return=minimal",
  );

  return ok({
    // Booleano, e nao o texto do status, pelo mesmo motivo do `/faixa`: quem le
    // decide sem rede e nao pode ficar sabendo dos valores do banco.
    evento: { id: evento.id, nome: evento.nome_evento, data_evento: evento.data_evento,
      local_evento: evento.local_evento, status: evento.status, ativo: evento.status === "ativo" },
    aparelho: { id: aparelho.id, nome: aparelho.nome, setores: await setoresDoAparelho(aparelho.id) },
    setores_completos: true,
    publicacao: await publicacaoDoEvento(eventoId),
    setores,
    bloqueios,
    entradas,
    totais,
    // A ordem "esqueca o que voce tem", e o unico caminho que ela tem ate aqui.
    //
    // O dono zera as entradas no painel e isso apaga as linhas do SERVIDOR. No
    // celular do porteiro nada acontece: as entradas ja estao no IndexedDB, e
    // este sincronismo so ACRESCENTA -- ele nunca remove. Sem esta marca, o
    // contador continuaria mostrando o publico do teste e a regra `ja_entrou`
    // continuaria barrando quem entrou naquele teste.
    //
    // Vai no topo, e nao dentro de `evento`, porque quem a le
    // (`portaria-sincronismo.js`) compara com a marca que guardou e decide
    // esvaziar ANTES de mesclar o resto desta resposta. Nulo quer dizer que este
    // evento nunca foi zerado, que e o caso da esmagadora maioria.
    entradas_zeradas_em: evento.entradas_zeradas_em ?? null,
    // Exclusivo por UUID: horários iguais e fusos distintos não repetem páginas.
    proxima_desde: temMais ? "id:" + entradas[entradas.length - 1].credencial_id : null,
  });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const rota = rotaPedida(url.pathname);
  const auth = req.headers.get("authorization");
  const origem = origemPermitida(req.headers.get("origin"));

  // O preflight vem ANTES de qualquer POST com Authorization, e nao carrega
  // token nenhum -- responder aqui, antes do roteamento, e o certo: ele nao e
  // uma rota, e tratar como rota daria 404 (que foi o defeito de 16/08/2026).
  //
  // A portaria so usa GET e POST. O Render devolve a lista inteira de metodos
  // porque o middleware dele e generico; aqui da para ser exato sem custo.
  if (req.method === "OPTIONS") return respostaDePreflight(origem, "GET, POST, OPTIONS");

  try {
    if (req.method === "POST" && ["registrar-pin", "elevar-pin", "editar-pin"].includes(rota)) {
      let corpo;
      try { corpo = await req.json(); } catch { return comCors(erro(422, "Dados inválidos."), origem); }
      const r = rota === "registrar-pin" ? await registrarPin(corpo)
        : rota === "elevar-pin" ? await elevarPin(corpo, await aparelhoDoToken(auth))
        : await editarComPin(corpo, await aparelhoDoToken(auth));
      const resposta = ok(r); resposta.headers.set("Cache-Control", "no-store");
      return comCors(resposta, origem);
    }
    if (req.method === "POST" && ["consultar-qr-evento", "ativar-qr-evento", "preparar-qr-evento"].includes(rota)) {
      let corpo;
      try { corpo = await req.json(); } catch { return comCors(erro(422, "QR inválido."), origem); }
      const resposta = ok(await usarQrEvento(corpo, rota === "ativar-qr-evento", rota === "preparar-qr-evento"));
      resposta.headers.set("Cache-Control", "no-store");
      return comCors(resposta, origem);
    }
    if (req.method === "POST" && rota === "entrar") {
      return comCors(await entrar(await req.json()), origem);
    }
    if (req.method === "GET" && rota === "evento") return comCors(await dadosDoEvento(auth), origem);
    if (req.method === "GET" && rota === "faixa") {
      return comCors(await faixa(auth, url.searchParams.get("desde"), Number(url.searchParams.get("leitor")) || 1), origem);
    }
    if (req.method === "POST" && rota === "leituras") {
      return comCors(await leituras(auth, await req.json()), origem);
    }
    if (req.method === "POST" && rota === "entrada") {
      return comCors(await entrada(auth, await req.json()), origem);
    }
    if (req.method === "GET" && rota === "sincronizar") {
      return comCors(
        await sincronizar(auth, url.searchParams.get("desde")),
        origem,
      );
    }
    return comCors(erro(404, "rota desconhecida"), origem);
  } catch (e) {
    // A recusa lancada tambem passa pelo `comCors`: sem o cabecalho, o
    // navegador esconde a resposta do JavaScript e a tela do porteiro mostra
    // "erro de rede" em vez de "aparelho nao pareado" -- que e a diferenca
    // entre ele saber o que fazer e ficar olhando para o celular.
    if (e instanceof Response) return comCors(e, origem);
    if (e instanceof Recusa) return comCors(erro(e.status, e.detail), origem);
    // Defeito nosso. O detalhe vai para o log da funcao, e NAO para o corpo da
    // resposta: mensagem de erro interno na tela do porteiro nao ajuda ele e
    // conta a um estranho como o servidor esta montado por dentro.
    console.error("[portaria]", e);
    return comCors(erro(500, "erro interno"), origem);
  }
});
