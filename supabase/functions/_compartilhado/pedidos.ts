/**
 * A linha do pedido no controle de acesso: o sal, a tiragem e os setores.
 *
 * Porte de `_abrir_pedido`, `_tiragem_do_pedido`, `_setores_do_pedido` e
 * `_modelos_legiveis` (`acesso_api.py`).
 *
 * ## Por que isto e compartilhado, e nao mora dentro de uma funcao
 *
 * TRES funcoes precisam do mesmo `abrirPedido`: a estacao (que publica a faixa
 * depois que o papel saiu), o painel da grafica (que garante a linha e o sal na
 * hora de gerar o QR do Pedido) e, indiretamente, quem fechar a publicacao.
 * Duas copias de uma funcao que sorteia sal seria a pior duplicacao possivel
 * neste projeto -- ver a secao seguinte.
 */
import { banco } from "./banco.ts";
import { idDeNumeracao, numeracaoDoModelo } from "./modelos.ts";
import { type ContratoQr, planoDoModelo, sequenciaDoContrato } from "./preparacao_codigos.ts";

/**
 * 32 bytes sorteados, em hexadecimal. Porte de `qr_ideal.gerar_sal`.
 *
 * SAO 64 CARACTERES, e o numero importa: o sal entra no PBKDF2 como os BYTES
 * do hexadecimal (`hexParaBytes` em `hash.ts`, `bytes.fromhex` no Python), e o
 * `hash.ts` documenta 64 caracteres na assinatura. Um sal de outro comprimento
 * nao daria erro nenhum -- daria um hash plausivel e diferente do que o Python
 * gravaria para o mesmo codigo, e o sintoma apareceria com a fila na porta.
 *
 * `crypto.randomUUID()` tambem nao serve: tem hifens, que nao sao hexadecimal.
 */
export function gerarSal(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** `{modelo_id: quantidade}`, lido do ERP. E o teto de cada modelo. */
export async function tiragemDoPedido(
  pedidoIdInt: number,
): Promise<Record<number, number>> {
  const linhas = (await banco(
    "GET",
    `pedidos_modelos?id_int=eq.${pedidoIdInt}&select=id,quantidade`,
  )) ?? [];
  const tiragem: Record<number, number> = {};
  for (const l of linhas) tiragem[Number(l.id)] = Number(l.quantidade ?? 0);
  return tiragem;
}

/**
 * Cria (ou reencontra) a linha do pedido e devolve o sal dele.
 *
 * IDEMPOTENTE, e isto e o ponto: reabrir tem de devolver o MESMO sal. O cliente
 * reimprime 500 ingressos de um pedido de 5.000; sal novo invalidaria os 4.500
 * que ja estao na mao das pessoas, e ninguem descobriria antes da portaria.
 *
 * Reabrir tambem destrava a publicacao que ja tinha fechado -- e o que permite
 * reimpressao. Voltar a aceitar lote e ato explicito, nunca efeito colateral.
 *
 * `comTiragem` existe para o QR do Pedido, que chama esta funcao so para
 * garantir a linha e o sal e joga o resto fora. A tiragem e uma consulta a mais
 * ao ERP, e ninguem do outro lado a le naquele caminho. A resposta da estacao,
 * que a le, continua trazendo tudo.
 */
export async function abrirPedido(
  pedidoIdInt: number,
  comTiragem = true,
): Promise<{ sal: string; reaberto: boolean; tiragem: Record<number, number> }> {
  const achados = (await banco(
    "GET",
    `producao_acesso_pedidos?pedido_id_int=eq.${pedidoIdInt}&select=*`,
  )) ?? [];

  // A tiragem vai junto com o sal, numa resposta so. O agente precisa das duas
  // coisas para calcular a faixa, e quem sabe a quantidade e o ERP -- nao ele.
  // Duas idas a rede aqui seriam duas chances de falhar.
  const tiragem = comTiragem ? await tiragemDoPedido(pedidoIdInt) : {};

  if (achados.length) {
    const linha = achados[0];
    const estavaFechado = Boolean(linha.publicado_em);
    if (estavaFechado) {
      await banco(
        "PATCH",
        `producao_acesso_pedidos?pedido_id_int=eq.${pedidoIdInt}`,
        { publicado_em: null },
      );
    }
    return { sal: linha.sal, reaberto: estavaFechado, tiragem };
  }

  const criado = await banco("POST", "producao_acesso_pedidos", {
    pedido_id_int: pedidoIdInt,
    sal: gerarSal(),
  });
  return { sal: criado[0].sal, reaberto: false, tiragem };
}

/**
 * `{modelo_id: {evento_id, setor_id}}` para o pedido ja reivindicado.
 *
 * Vazio enquanto o cliente nao reivindicou -- e ai a credencial nasce sem dono
 * mesmo, porque ainda nao existe evento a que pertencer. A reivindicacao
 * carimba as que ja estavam.
 */
export async function setoresDoPedido(
  pedidoIdInt: number,
): Promise<Record<number, { evento_id: string; setor_id: string }>> {
  const linhas = (await banco(
    "GET",
    `producao_acesso_setores?pedido_id_int=eq.${pedidoIdInt}&select=id,modelo_id,evento_id`,
  )) ?? [];
  const dono: Record<number, { evento_id: string; setor_id: string }> = {};
  for (const l of linhas) {
    if (l.modelo_id === null || l.modelo_id === undefined) continue;
    dono[Number(l.modelo_id)] = { evento_id: l.evento_id, setor_id: l.id };
  }
  return dono;
}

export async function fonteDosCodigos(pedidoIdInt: number) {
  const modelos = (await banco(
    "GET",
    `pedidos_modelos?id_int=eq.${pedidoIdInt}` +
      "&select=id,nome_modelo,quantidade,numeracao_inicio,amostra_num_id&order=ordem.asc",
  )) ?? [];
  return incluirNumeracoes(modelos);
}

export async function fonteDosCodigosPorModelo(pares: { pedido: number; modelo: number }[]) {
  const filtro = pares.map(p => `and(id_int.eq.${p.pedido},id.eq.${p.modelo})`).join(",");
  const modelos = (await banco(
    "GET",
    `pedidos_modelos?or=(${filtro})&select=id,id_int,quantidade,numeracao_inicio,amostra_num_id&limit=${pares.length}`,
  )) ?? [];
  return incluirNumeracoes(modelos);
}

async function incluirNumeracoes(modelos: any[]) {
  const ids: string[] = [...new Set<string>(
    modelos.map((m: any) => idDeNumeracao(m.amostra_num_id)).filter(Boolean) as string[],
    )].sort();
  const numeracoes: Record<string, unknown> = {};
  if (ids.length) {
    const lista = ids.map((i) => `"${i}"`).join(",");
    for (
      const n of (await banco(
        "GET",
        `producao_numeracoes?id=in.(${lista})&select=id,elements,tipo,ticket_qtd`,
      )) ?? []
    ) {
      numeracoes[String(n.id)] = n;
    }
  }

  return modelos.map((m: any) => ({
    ...m, inicio: m.numeracao_inicio, numeracao: numeracoes[String(m.amostra_num_id)],
  }));
}

/** Quantidade de credenciais da publicação. A tiragem dos setores é física. */
export async function quantidadeDeCredenciais(pedidoIdInt: number): Promise<number> {
  const [fonte, contratos] = await Promise.all([
    fonteDosCodigos(pedidoIdInt),
    banco("GET", `producao_acesso_qr_contratos?pedido=eq.${pedidoIdInt}&select=modelo,inicio,passo,posicao,posicoes,quantidade`),
  ]);
  const porModelo = new Map<number, ContratoQr>((contratos ?? []).map((c: ContratoQr) => [c.modelo, c]));
  return fonte.reduce((total: number, m: any) => {
    const c = porModelo.get(Number(m.id));
    if (c) return total + sequenciaDoContrato(c).quantidade;
    if (!numeracaoDoModelo(m.numeracao?.elements)) return total;
    const celulas = Number(m.quantidade ?? 0);
    const plano = m.numeracao?.tipo === "TICKET" && celulas > 0 ? planoDoModelo(m) : null;
    return total + (plano?.quantidade ?? celulas);
  }, 0);
}

/** Os modelos com QR, QR Ideal ou código de barras, na ordem do ERP. */
export async function modelosLegiveis(pedidoIdInt: number): Promise<
  { modelo_id: number; nome: string; quantidade: number }[]
> {
  return (await fonteDosCodigos(pedidoIdInt))
    .filter((m: any) => numeracaoDoModelo(m.numeracao?.elements))
    .map((m: any) => ({
      modelo_id: Number(m.id),
      // O setor do evento sai de `nome_modelo`. O campo `setor` de
      // `pedidos_modelos` ja esta ocupado com o setor de PRODUCAO (FLEXO,
      // TEXTIL, PVC, LASER) e nao serve aqui.
      //
      // O padrao e `Setor N`, e nao `Modelo N`: e o nome que vira o setor do
      // evento na reivindicacao, e o dono le "Setor" na tela dele. As duas
      // pilhas precisam batizar igual, senao o mesmo pedido cria setores com
      // nomes diferentes conforme o endereco que atendeu.
      //
      // A ordem tambem e a do Python -- `(nome or padrao).strip()`, e nao
      // `nome.trim() or padrao`: nome so de espacos vira vazio dos dois lados.
      nome: (m.nome_modelo ? String(m.nome_modelo) : `Setor ${m.id}`).trim(),
      quantidade: Number(m.quantidade ?? 0),
    }));
}
