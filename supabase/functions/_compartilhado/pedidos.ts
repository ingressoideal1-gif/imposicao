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
import { numeracaoDoModelo } from "./modelos.ts";

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

/**
 * Os modelos do pedido que a portaria TEM COMO LER, na ordem do ERP.
 *
 * Modelo cuja numeracao nao tem QR, QR Ideal nem codigo de barras nao sobe ao
 * Ideal Control. Regra do usuario, 15/08/2026, sobre o modelo 1000283 do pedido
 * 20508 -- cinquenta ingressos com numeracao que so tem texto e um PDF.
 *
 * Nao e otimizacao: e o que impede o sistema de mentir. Sem o filtro, o modelo
 * aparece como um setor com cinquenta lugares que nunca serao preenchidos, e o
 * pedido se declara ETERNAMENTE INCOMPLETO -- mandando reimprimir papel que
 * esta do jeito que foi contratado.
 *
 * Quem decide o que e legivel e `numeracaoDoModelo`, a MESMA regra que o agente
 * usa para decidir o que publicar.
 */
export async function modelosLegiveis(pedidoIdInt: number): Promise<
  { modelo_id: number; nome: string; quantidade: number }[]
> {
  const modelos = (await banco(
    "GET",
    `pedidos_modelos?id_int=eq.${pedidoIdInt}` +
      "&select=id,nome_modelo,quantidade,amostra_num_id&order=ordem.asc",
  )) ?? [];

  const ids = [...new Set(
    modelos.filter((m: any) => m.amostra_num_id).map((m: any) => String(m.amostra_num_id)),
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

  return modelos
    .filter((m: any) => numeracaoDoModelo(numeracoes[String(m.amostra_num_id)]))
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
