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

// O `?desde=` da rota leve entra DIRETO num filtro do PostgREST, e o `banco()`
// concatena a URL sem escapar nada. So passa data que termina em `Z`: o `+` de
// um `+00:00` significa ESPACO numa query string, o filtro chega quebrado e o
// PostgREST responde 400 -- defeito que ja mordeu o freio de forca bruta em
// 16/08/2026. Qualquer outra coisa e ignorada (ver a rota leve, mais abaixo).
const FORMATO_ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;

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
      `&select=id,evento_id,nome`,
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

/** A carga do evento: tudo o que o aparelho precisa para decidir sem rede. */
async function faixa(
  cabecalho: string | null,
  desdeBruto: string | null,
): Promise<Response> {
  const aparelho = await aparelhoDoToken(cabecalho);
  const eventoId = aparelho.evento_id;
  const desde = Math.max(0, parseInt(desdeBruto ?? "0") || 0);

  const evento = ((await banco(
    "GET",
    `producao_acesso_eventos?id=eq.${eventoId}&select=id,nome_evento,sal,status`,
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

/** Recebe a fila que o aparelho acumulou. */
async function leituras(cabecalho: string | null, corpo: any): Promise<Response> {
  const aparelho = await aparelhoDoToken(cabecalho);
  const itens = corpo?.leituras ?? [];
  if (itens.length > MAXIMO_LEITURAS) {
    return erro(422, `mande no maximo ${MAXIMO_LEITURAS} leituras por vez`);
  }
  if (!itens.length) return ok({ gravadas: 0 });

  const linhas = [];
  for (const i of itens) {
    if (!RESULTADOS.includes(String(i.resultado ?? ""))) {
      return erro(422, "resultado invalido");
    }
    if (!i.id_local || !i.momento) {
      return erro(422, "leitura sem id_local ou momento");
    }
    linhas.push({
      evento_id: aparelho.evento_id,
      // O aparelho e quem o TOKEN diz que e. Aceitar o id do corpo deixaria um
      // aparelho gravar leitura no nome de outro.
      dispositivo_id: aparelho.id,
      credencial_id: i.credencial_id,
      setor_id: i.setor_id,
      id_local: String(i.id_local),
      momento: i.momento,
      // `tipo` tem DEFAULT 'entrada' no esquema, entao omiti-lo daria a mesma
      // linha -- por sorte. Explicito porque o dia em que o default mudar nao
      // avisa ninguem, e porque o Python manda explicito.
      tipo: "entrada",
      resultado: i.resultado,
      // ESTE campo ficou de fora ate 16/08/2026, e o furo passou por baixo de
      // todo teste de HTTP: as duas rotas respondem `{"gravadas": 1}` antes de
      // saber o que o banco fez, entao a resposta era identica e a linha
      // gravada nao era. So apareceu quando li a tabela com a chave de
      // servico. `motivo` e o "por que" da recusa no portao -- sem ele, a tela
      // do dono mostra um ingresso negado e nao sabe dizer a razao.
      motivo: i.motivo ?? null,
    });
  }

  // `on_conflict` e a chave unica que ja existe no esquema desde 13/08/2026,
  // criada exatamente para isto: o celular que ficou tres horas offline reenvia
  // a fila inteira, e nada duplica.
  await banco(
    "POST",
    "producao_acesso_leituras?on_conflict=dispositivo_id,id_local",
    linhas,
    "resolution=ignore-duplicates,return=minimal",
  );
  await banco(
    "PATCH",
    `producao_acesso_dispositivos?id=eq.${aparelho.id}`,
    { ultimo_visto: "now()" },
    "return=minimal",
  );
  return ok({ gravadas: linhas.length });
}

/**
 * A leitura que acabou de acontecer, na hora -- e a corrida entre dois portoes
 * decidida pelo BANCO.
 *
 * ## Por que existe, se o `/leituras` ja sobe a fila
 *
 * O sincronismo do portao e de cinco minutos, e cinco minutos e tempo de sobra
 * para a mesma pessoa entrar por duas portas. Fechar isso perguntando "ja existe
 * entrada para esta credencial?" e so entao gravar NAO funciona: as duas
 * perguntas se cruzam e os dois portoes recebem "nao existe". Quem decide aqui e
 * o banco, com `credencial_id` como chave primaria e `ON CONFLICT DO NOTHING`,
 * numa operacao so.
 *
 * ## O que nao pode sair errado
 *
 * O portao NUNCA espera esta resposta: quem chama tem teto de 800 ms e segue com
 * a decisao local. Por isso a leitura e gravada de qualquer jeito, ganhando ou
 * perdendo a corrida -- e contagem que o cliente pagou para ter. O que muda e o
 * `resultado`/`motivo` que fica registrado.
 */
async function entrada(cabecalho: string | null, corpo: any): Promise<Response> {
  const aparelho = await aparelhoDoToken(cabecalho);

  let resultado = String(corpo?.resultado ?? "");
  let motivo = corpo?.motivo ?? null;
  if (!RESULTADOS.includes(resultado)) return erro(422, "resultado invalido");
  if (!corpo?.id_local || !corpo?.momento) {
    return erro(422, "leitura sem id_local ou momento");
  }

  const credencialId = String(corpo?.credencial_id ?? "");
  const setorId = String(corpo?.setor_id ?? "");
  // Os dois vao para dentro de um filtro do PostgREST, e o `banco()` concatena a
  // URL sem escapar nada: id malformado viraria HTTP 400 la e "erro interno" na
  // tela do porteiro, com fila na frente. Mesmo defeito que o `/entrar` ja teve
  // em producao.
  const idsValidos = FORMATO_UUID.test(credencialId) && FORMATO_UUID.test(setorId);

  // Comeca em `true` porque a corrida so existe para leitura PERMITIDA em setor
  // de entrada unica. Para uma leitura que o aparelho ja negou, este campo nao
  // quer dizer nada -- a tela dele travou no vermelho antes desta resposta
  // chegar, e nao ha entrada nenhuma a reivindicar.
  let primeira = true;
  let anterior: { momento: string; portao: string } | null = null;

  if (resultado === "permitido" && idsValidos) {
    // Reentrada NAO entra na corrida: o setor existe justamente para deixar sair
    // e voltar, e para ele nao existe "primeira entrada". Reivindicar
    // exclusividade la trancaria na rua quem tem direito de voltar.
    //
    // O `evento_id` no filtro nao e enfeite: o setor tem de ser do evento DESTE
    // aparelho, senao um token de um portao reivindicaria entrada em outro
    // evento.
    const setor = ((await banco(
      "GET",
      `producao_acesso_setores?id=eq.${setorId}` +
        `&evento_id=eq.${aparelho.evento_id}&select=id,tipo_uso`,
    )) ?? [])[0];

    if (setor && setor.tipo_uso !== "reentrada") {
      await banco(
        "POST",
        "producao_acesso_entradas_unicas?on_conflict=credencial_id",
        {
          credencial_id: credencialId,
          evento_id: aparelho.evento_id,
          setor_id: setorId,
          // O aparelho e quem o TOKEN diz que e, aqui pelo mesmo motivo do
          // `/leituras`: aceitar o id do corpo deixaria um aparelho gravar
          // entrada no nome de outro -- e e este campo que decide quem ganhou.
          dispositivo_id: aparelho.id,
          momento: corpo.momento,
        },
        "resolution=ignore-duplicates,return=minimal",
      );

      // Quem ficou na linha. Um `return=representation` no POST acima nao
      // serviria: com `ignore-duplicates` o PostgREST devolve VAZIO quando o
      // conflito acontece, e vazio nao diz quem ganhou nem quando.
      const dono = ((await banco(
        "GET",
        `producao_acesso_entradas_unicas?credencial_id=eq.${credencialId}` +
          `&select=dispositivo_id,momento`,
      )) ?? [])[0];

      // Se a linha e deste aparelho, ele ganhou -- inclusive quando ele proprio
      // ja tinha ganhado antes e esta reenviando. Isso e de proposito: o mesmo
      // aparelho reenviando a mesma leitura nao pode virar recusa, e a chave
      // `(dispositivo_id, id_local)` da tabela de leituras impede a duplicata.
      primeira = !!dono && dono.dispositivo_id === aparelho.id;

      if (!primeira && dono) {
        // Quem perde precisa ouvir QUANDO e em QUAL portao a pessoa entrou --
        // senao a recusa vira "nao sei, o sistema nao deixou", que e o que o
        // porteiro tem de repetir para a pessoa na frente dele.
        const outro = ((await banco(
          "GET",
          `producao_acesso_dispositivos?id=eq.${dono.dispositivo_id}&select=nome`,
        )) ?? [])[0];
        anterior = {
          momento: dono.momento,
          portao: outro?.nome ?? "outro aparelho",
        };
        resultado = "negado";
        motivo = "ja_entrou";
      }
    }
  }

  // Gravada DEPOIS da corrida, e nao antes, porque e a corrida que decide o
  // `resultado`/`motivo` desta linha. `on_conflict` e a mesma chave de
  // idempotencia do `/leituras`: se esta leitura tambem subir pela fila depois,
  // nada duplica.
  await banco(
    "POST",
    "producao_acesso_leituras?on_conflict=dispositivo_id,id_local",
    [{
      evento_id: aparelho.evento_id,
      dispositivo_id: aparelho.id,
      credencial_id: corpo.credencial_id ?? null,
      setor_id: corpo.setor_id ?? null,
      id_local: String(corpo.id_local),
      momento: corpo.momento,
      tipo: "entrada",
      resultado,
      motivo,
    }],
    "resolution=ignore-duplicates,return=minimal",
  );
  await banco(
    "PATCH",
    `producao_acesso_dispositivos?id=eq.${aparelho.id}`,
    { ultimo_visto: "now()" },
    "return=minimal",
  );

  return ok({ primeira, resultado, motivo, anterior });
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
    `producao_acesso_eventos?id=eq.${eventoId}&select=id,status,entradas_zeradas_em`,
  )) ?? [])[0];
  if (!evento) return erro(409, "evento nao existe mais");

  const setores = (await banco(
    "GET",
    `producao_acesso_setores?evento_id=eq.${eventoId}&status=eq.ativo` +
      `&select=id,bloqueado,bloqueado_motivo,abre_em,fecha_em,tipo_uso&order=nome.asc`,
  )) ?? [];
  const bloqueios = (await banco(
    "GET",
    `producao_acesso_bloqueios?evento_id=eq.${eventoId}&status=eq.ativo` +
      `&select=setor_id,de,ate,motivo`,
  )) ?? [];

  // `?desde=` e OPCIONAL: sem ele a rota devolve as entradas todas, que e o
  // primeiro sincronismo depois de um boot. Data em formato estranho e IGNORADA
  // em vez de recusada -- baixar tudo e pesado, mas e correto; recusar deixaria
  // o portao sem sincronizar por causa de um relogio mal formatado.
  const desde = FORMATO_ISO_Z.test(desdeBruto ?? "") ? desdeBruto : null;
  const filtro = desde ? `&momento=gte.${desde}` : "";
  // Pede ENTRADAS_POR_VEZ + 1 pelo mesmo motivo do `/faixa`: e o unico jeito de
  // distinguir "esta pagina veio cheia e acabou" de "ha mais depois dela".
  const maisUma = (await banco(
    "GET",
    `producao_acesso_entradas_unicas?evento_id=eq.${eventoId}${filtro}` +
      `&select=credencial_id,momento&order=momento.asc` +
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
    evento: { ativo: evento.status === "ativo" },
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
    // Onde continuar quando a pagina veio cheia. Vai como `momento` e o proximo
    // pedido usa `gte`, e nao `gt`: repetir a ultima entrada nao custa nada
    // (quem recebe junta por `credencial_id`), e PULAR uma entrada que dividia o
    // mesmo instante custaria uma pessoa entrando duas vezes.
    proxima_desde: temMais ? entradas[entradas.length - 1].momento : null,
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
    if (req.method === "POST" && rota === "entrar") {
      return comCors(await entrar(await req.json()), origem);
    }
    if (req.method === "GET" && rota === "faixa") {
      return comCors(await faixa(auth, url.searchParams.get("desde")), origem);
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
    // Defeito nosso. O detalhe vai para o log da funcao, e NAO para o corpo da
    // resposta: mensagem de erro interno na tela do porteiro nao ajuda ele e
    // conta a um estranho como o servidor esta montado por dentro.
    console.error("[portaria]", e);
    return comCors(erro(500, "erro interno"), origem);
  }
});
