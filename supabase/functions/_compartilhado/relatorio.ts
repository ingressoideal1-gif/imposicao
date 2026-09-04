/**
 * O relatorio do evento: os numeros que a grafica e o DONO veem, do mesmo lugar.
 *
 * Ate 04/09/2026 estas contas viviam dentro do `acesso-interno`, e so o
 * atendente as via. O dono do evento configurava tudo antes, recebia um numero
 * depois de finalizar, e ficava cego durante o evento -- justamente a parte que
 * ele comprou. Agora o aplicativo dele mostra os mesmos numeros, e por isso
 * elas moram aqui.
 *
 * COPIAR ESTAS CONTAS SERIA O PIOR DEFEITO POSSIVEL, e por um motivo especifico:
 * ele nao quebra nada. A grafica diria 412 e o cliente diria 409, os dois com a
 * tela aberta ao mesmo tempo, e nao haveria como saber qual dos dois esta certo
 * -- nem, depois, como refazer a conta da noite que ja passou.
 *
 * O que muda entre as duas telas e so QUEM PODE PERGUNTAR: la o papel no painel
 * da grafica, aqui o dono do evento. A autorizacao fica em cada funcao; a conta
 * fica aqui.
 */
import { banco, contar } from "./banco.ts";
import { horaCheia, MOTIVOS, situacao, termoSeguro } from "./relatorio_puro.ts";

/**
 * Teto de leituras trazidas para montar o grafico por hora. Os TOTAIS nao
 * passam por aqui -- eles saem de `contar()`, que e exato a qualquer tamanho.
 * So o histograma precisa das linhas, e um evento gigante nao pode travar a
 * tela. Quando o teto e atingido, a resposta DIZ (`grafico_truncado`): um corte
 * silencioso viraria um grafico que parece completo e nao e.
 */
export const LEITURAS_PARA_O_GRAFICO = 20000;

/**
 * Pagina o PostgREST ate o teto, e diz se parou por causa dele.
 *
 * Lotes de 1.000 porque e o `max_rows` deste projeto: pedir mais nao traz mais,
 * e o corte e silencioso.
 */
export async function todasAsLinhas(
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

/** A PRIMEIRA entrada de cada credencial, por id. Vazio para lista vazia. */
export async function entradasPorCredencial(
  ids: string[],
): Promise<Record<string, string>> {
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

/** Os tres numeros de um setor. Tres contagens, e so quando alguem pede. */
export async function numerosDoSetor(setorId: string): Promise<any> {
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

/**
 * O painel do evento: publico, por setor, recusas e o grafico por hora.
 *
 * `contratado` chega pronto porque as duas telas o conhecem por caminhos
 * diferentes -- a grafica soma os modelos do ERP que sobem ao controle, e o
 * aplicativo do dono soma a quantidade dos setores, que E a quantidade
 * contratada. Calcula-lo aqui obrigaria esta funcao a escolher um dos dois, e
 * ela nao tem como saber qual.
 */
export async function dashboard(
  eventoId: string,
  setores: any[],
  contratado: number,
): Promise<any> {
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

/**
 * Os ingressos, com a situacao de cada um. Por setor ou pelo evento inteiro.
 *
 * O CODIGO NAO ENTRA. A lista traz o numero (que e o que esta impresso e o que
 * a pessoa procura), a origem e a situacao. `codigo_visivel` so sai para os
 * codigos que o proprio cliente carregou.
 *
 * `setorId` presente filtra por ele SOZINHO, e nao por evento mais setor: e o
 * filtro que a tela da grafica sempre usou, e mante-lo identico e o que garante
 * que esta mudanca de casa nao mexeu no que ela responde.
 *
 * Sem `setorId`, procura no EVENTO inteiro -- que e a pergunta da porta: "este
 * ingresso aqui, que eu tenho na mao, ja entrou?". Quem esta na porta nao sabe
 * de que setor o ingresso e; e justamente isso que ele veio descobrir.
 */
export async function listarIngressos(
  eventoId: string,
  setorId: string | null,
  pagina: number,
  porPagina: number,
  busca: string | null,
): Promise<any> {
  let filtro = setorId
    ? `producao_acesso_credenciais?setor_id=eq.${setorId}`
    : `producao_acesso_credenciais?evento_id=eq.${eventoId}`;
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
    filtro + "&select=id,numero,setor_id,codigo_visivel,origem,status,created_at" +
      "&order=numero.asc,created_at.asc" +
      `&offset=${(pagina - 1) * porPagina}&limit=${porPagina + 1}`,
  )) ?? [];
  const haMais = linhas.length > porPagina;
  linhas = linhas.slice(0, porPagina);

  const entradas = await entradasPorCredencial(linhas.map((l: any) => l.id));
  const faixas = ((await banco(
    "GET",
    (setorId
      ? `producao_acesso_bloqueios?setor_id=eq.${setorId}`
      : `producao_acesso_bloqueios?evento_id=eq.${eventoId}`) +
      "&status=eq.ativo&select=setor_id,de,ate,motivo",
  )) ?? []) as any[];

  const ingressos = linhas.map((l: any) => {
    const numero = l.numero;
    // O bloqueio e POR SETOR: procurando no evento inteiro, uma faixa do VIP
    // nao pode marcar como bloqueado o mesmo numero do Camarote. Com `setorId`
    // todas as faixas ja sao daquele setor, e a comparacao passa igual.
    const bloqueio = faixas.find(
      (f) =>
        numero !== null && numero !== undefined &&
        String(f.setor_id) === String(l.setor_id) &&
        f.de <= numero && numero <= f.ate,
    )?.motivo ?? null;
    const entrada = entradas[String(l.id)] ?? null;
    return {
      id: l.id,
      numero,
      setor_id: l.setor_id ?? null,
      // So o do cliente. O do QR Ideal nao existe em claro em lugar nenhum --
      // nem aqui, nem no banco.
      codigo: l.origem === "cliente" ? (l.codigo_visivel ?? null) : null,
      origem: l.origem,
      situacao: situacao(l, bloqueio, entrada),
      motivo_bloqueio: bloqueio,
      entrou_em: entrada,
    };
  });

  return { pagina, por_pagina: porPagina, ha_mais: haMais, ingressos };
}

/**
 * As leituras do evento, uma por linha, para a conferencia da noite.
 *
 * E a base do arquivo que o dono baixa. Traz a leitura NEGADA junto -- e ela
 * que responde "por que a fila parou as 22h", e um relatorio que so mostrasse
 * quem entrou esconderia exatamente a parte que precisa de explicacao.
 *
 * As DUAS horas saem daqui: a do aparelho (que pode estar offline ha tres
 * horas) e a do servidor. Uma so nao conta a historia -- foi a diferenca entre
 * as duas que explicou, em mais de uma noite, por que a fila do relatorio nao
 * bate com a lembranca de quem estava na porta.
 */
export async function leiturasDoEvento(
  eventoId: string,
  pagina: number,
  porPagina: number,
): Promise<any> {
  let linhas = (await banco(
    "GET",
    `producao_acesso_leituras?evento_id=eq.${eventoId}` +
      "&select=id,momento,recebido_em,resultado,motivo,tipo,setor_id," +
      "dispositivo_id,credencial_id" +
      "&order=momento.asc,id.asc" +
      `&offset=${(pagina - 1) * porPagina}&limit=${porPagina + 1}`,
  )) ?? [];
  const haMais = linhas.length > porPagina;
  linhas = linhas.slice(0, porPagina);

  const nomes = await nomesDeApoio(eventoId, linhas);

  return {
    pagina,
    por_pagina: porPagina,
    ha_mais: haMais,
    leituras: linhas.map((l: any) => ({
      momento: l.momento,
      recebido_em: l.recebido_em,
      tipo: l.tipo,
      resultado: l.resultado,
      motivo: l.motivo ?? null,
      // O nome que a pessoa entende, ao lado do nome cru -- o cru fica porque
      // e ele que se procura no log quando alguem quiser investigar.
      rotulo_motivo: l.motivo ? (MOTIVOS[String(l.motivo)] ?? String(l.motivo)) : null,
      setor: l.setor_id ? (nomes.setores[String(l.setor_id)] ?? null) : null,
      aparelho: l.dispositivo_id ? (nomes.aparelhos[String(l.dispositivo_id)] ?? null) : null,
      numero: l.credencial_id ? (nomes.numeros[String(l.credencial_id)] ?? null) : null,
    })),
  };
}

/**
 * Os nomes de setor, de aparelho e os numeros de ingresso desta pagina.
 *
 * Em TRES consultas, e nao uma por linha: uma pagina de 200 leituras faria 600
 * idas ao banco, e este relatorio e baixado inteiro, pagina a pagina, por um
 * celular no fim do evento.
 */
async function nomesDeApoio(eventoId: string, linhas: any[]): Promise<{
  setores: Record<string, string>;
  aparelhos: Record<string, string>;
  numeros: Record<string, number>;
}> {
  const setores: Record<string, string> = {};
  const aparelhos: Record<string, string> = {};
  const numeros: Record<string, number> = {};
  if (!linhas.length) return { setores, aparelhos, numeros };

  for (
    const s of (await banco(
      "GET",
      `producao_acesso_setores?evento_id=eq.${eventoId}&select=id,nome`,
    )) ?? []
  ) {
    setores[String(s.id)] = s.nome ?? "";
  }
  for (
    const a of (await banco(
      "GET",
      `producao_acesso_dispositivos?evento_id=eq.${eventoId}&select=id,nome`,
    )) ?? []
  ) {
    aparelhos[String(a.id)] = a.nome ?? "";
  }

  const ids = [...new Set(
    linhas.filter((l) => l.credencial_id).map((l) => String(l.credencial_id)),
  )];
  if (ids.length) {
    const lista = ids.map((i) => `"${i}"`).join(",");
    for (
      const c of (await banco(
        "GET",
        `producao_acesso_credenciais?id=in.(${lista})&select=id,numero`,
      )) ?? []
    ) {
      numeros[String(c.id)] = c.numero;
    }
  }
  return { setores, aparelhos, numeros };
}
