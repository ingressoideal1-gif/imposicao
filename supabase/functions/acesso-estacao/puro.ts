/**
 * As pecas da publicacao da faixa que nao tocam em rede nem em banco.
 *
 * Arquivo separado pelo mesmo motivo das outras funcoes: o `index.ts` chama
 * `Deno.serve()` no topo, entao importa-lo liga um servidor.
 *
 * O que mora aqui e justamente o que precisa de teste de mesa: as travas que
 * impedem alguem com o segredo do agente na mao de gravar um ingresso que a
 * portaria aceitaria.
 */

/**
 * O caminho depois do nome da funcao, em pedacos.
 *
 * ## Por que o `/api/acesso/` e aceito no meio
 *
 * O `acesso_publicacao.py` monta `${ACESSO_BASE_URL}/api/acesso/pedidos/{p}/...`
 * -- o prefixo esta no codigo do agente, dentro do `NewProd.exe` de cada uma das
 * onze estacoes. Se esta funcao exigisse o caminho limpo, apontar uma estacao
 * para ca exigiria compilar e distribuir um executavel novo.
 *
 * Aceitando os dois, o corte de cada estacao vira uma variavel de ambiente
 * (`ACESSO_BASE_URL`), e a volta atras tambem. Numa grafica com onze maquinas
 * que atualizam cada uma no seu ritmo, essa diferenca e a diferenca entre migrar
 * uma estacao por vez e migrar todas de uma vez.
 */
export function pedacosDaRota(pathname: string): string[] {
  return pathname
    .replace(/^.*\/acesso-estacao\/?/, "")
    .replace(/^api\/acesso\/?/, "")
    .split("/")
    .filter((p) => p !== "")
    .map(decodeURIComponent);
}

/**
 * Lotes maiores estouram o corpo da requisicao sem ganhar velocidade: o custo
 * esta no KDF, que roda na estacao, e nao na rede. Tem de ser o mesmo numero do
 * `acesso_api.LOTE_MAXIMO`, e o agente manda em lotes de 500 exatos.
 */
export const LOTE_MAXIMO = 500;

/** `corpo.get("itens") or []`, com a mesma tolerancia do Python. */
export function itensDoCorpo(corpo: unknown): unknown[] {
  const itens = (corpo as any)?.itens;
  return Array.isArray(itens) ? itens : [];
}

/**
 * O `int()` do Python, na medida em que este caminho o usa.
 *
 * Aceita numero e texto de numero; devolve `null` para o que o `int()`
 * levantaria. O Python quebraria com 500 nesses casos -- aqui vira 422, que e a
 * resposta certa para corpo malformado e nao muda nada para o agente, que so
 * manda inteiro.
 */
function paraInteiro(valor: unknown): number | null {
  if (typeof valor === "number") return Number.isFinite(valor) ? Math.trunc(valor) : null;
  const texto = String(valor ?? "").trim();
  if (!/^[+-]?\d+$/.test(texto)) return null;
  return Number(texto);
}

export type RecusaSimples = { status: number; detail: string };

/**
 * As duas travas que valem MESMO com o segredo do agente na mao.
 *
 * Porte do laco de validacao de `_gravar_lote`. Sem elas, quem tivesse o segredo
 * inseriria o ingresso 99.999 de uma tiragem de 3.000 -- e como o `abrir`
 * devolve o sal, ele poderia calcular o hash de um conteudo escolhido por ele. E
 * a UNICA forma de forjar ingresso sem ter o pool.
 *
 * Devolve a recusa, em vez de lanca-la, para poder ser testada sem servidor.
 */
export function conferirItens(
  pedidoIdInt: number,
  itens: unknown[],
  tiragem: Record<number, number>,
): RecusaSimples | null {
  for (const item of itens) {
    const modelo = paraInteiro((item as any)?.modelo_id);
    const numero = paraInteiro((item as any)?.numero);
    if (modelo === null || numero === null) {
      return { status: 422, detail: "cada item precisa de modelo_id e numero inteiros" };
    }
    if (!Object.prototype.hasOwnProperty.call(tiragem, modelo)) {
      return {
        status: 422,
        detail: `modelo ${modelo} nao pertence ao pedido ${pedidoIdInt}`,
      };
    }
    if (!(numero >= 1 && numero <= tiragem[modelo])) {
      return {
        status: 422,
        detail: `ingresso ${numero} fora da tiragem do modelo ${modelo} ` +
          `(1..${tiragem[modelo]})`,
      };
    }
  }
  return null;
}

/**
 * As linhas que vao para `producao_acesso_credenciais`.
 *
 * ## Por que a credencial ja nasce ligada ao setor
 *
 * O carimbo de `evento_id`/`setor_id` era feito SO na reivindicacao. Isso
 * funciona numa ordem -- imprimir, depois reivindicar -- e falha calado na
 * outra: em 14/08/2026 o cliente reivindicou o pedido 18560 as 10:55, o papel
 * saiu as 18:52, e as 200 credenciais ficaram orfas para sempre.
 *
 * Orfa nao e defeito visivel: ela existe, conta no total, e some justamente onde
 * importa -- a portaria nao sabe de que setor o codigo e, e o bloqueio por
 * faixa, que e por setor, nao alcanca nenhuma.
 *
 * `chave_dedup` NAO e enviada: e coluna GENERATED ALWAYS no Postgres, calculada
 * pelo banco em toda insercao. Por isso nao ha como este codigo esquecer de
 * preenche-la nem preenche-la diferente do indice.
 */
export function linhasDeCredencial(
  pedidoIdInt: number,
  itens: unknown[],
  dono: Record<number, { evento_id: string; setor_id: string }>,
): Record<string, unknown>[] {
  return itens.map((item) => {
    const modelo = Math.trunc(Number((item as any).modelo_id));
    return {
      pedido_id_int: pedidoIdInt,
      modelo_id: modelo,
      numero: Math.trunc(Number((item as any).numero)),
      codigo_hash: (item as any).hash,
      origem: "qr_ideal",
      ...(dono[modelo] ?? {}),
    };
  });
}
