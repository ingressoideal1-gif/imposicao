import { banco } from "./banco.ts";

type Contrato = {
  pedido: number; modelo: number; versao: number;
  inicio: number; passo: number; posicao: number; quantidade: number;
};

/** `numero` continua sendo a identidade ordinal usada na emissão e nos bloqueios.
 * O valor impresso vem do contrato congelado, nunca do modelo editável do ERP.
 * Sem contrato QR12 não reinterpretamos credenciais legadas/importadas.
 */
export function numeroImpresso(credencial: any, contrato?: Contrato): number | undefined {
  if (credencial.origem !== "qr_ideal" || !contrato || contrato.versao !== 2) return undefined;
  if (contrato.pedido !== credencial.pedido_id_int || contrato.modelo !== credencial.modelo_id) {
    throw new Error("Contrato de numeração de outra credencial.");
  }
  const { inicio, passo, posicao, quantidade } = contrato;
  const ordem = credencial.numero;
  if (![inicio, passo, posicao, quantidade, ordem].every(Number.isSafeInteger) ||
      inicio < 0 || passo < 1 || posicao < 1 || posicao > passo ||
      quantidade < 1 || ordem < 1 || ordem > quantidade) {
    throw new Error("Contrato de numeração inválido para a credencial.");
  }
  const valor = inicio + (ordem - 1) * passo + posicao - 1;
  if (!Number.isSafeInteger(valor)) throw new Error("Número impresso fora do limite seguro.");
  return valor;
}

/** Uma página de credenciais, consultas somente leitura em lotes limitados.
 * Não chama a RPC que reserva contratos nem lê hashes/pools para calcular números.
 */
export async function numerosImpressos(credenciais: any[]): Promise<Map<string, number>> {
  const pares = new Map<string, { pedido: number; modelo: number }>();
  for (const c of credenciais) {
    if (c.origem !== "qr_ideal" || !Number.isSafeInteger(c.pedido_id_int) ||
        !Number.isSafeInteger(c.modelo_id)) continue;
    pares.set(`${c.pedido_id_int}/${c.modelo_id}`, { pedido: c.pedido_id_int, modelo: c.modelo_id });
  }
  const contratos = new Map<string, Contrato>();
  const lista = [...pares.values()];
  for (let i = 0; i < lista.length; i += 50) {
    const filtro = lista.slice(i, i + 50).map(p =>
      `and(pedido.eq.${p.pedido},modelo.eq.${p.modelo})`).join(",");
    const linhas = await banco("GET", "producao_acesso_qr_contratos?versao=eq.2" +
      `&or=(${filtro})&select=pedido,modelo,versao,inicio,passo,posicao,quantidade&limit=50`);
    if (!Array.isArray(linhas)) throw new Error("Resposta de contratos de numeração inválida.");
    for (const c of linhas) contratos.set(`${c.pedido}/${c.modelo}`, c);
  }
  const resultado = new Map<string, number>();
  for (const c of credenciais) {
    const valor = numeroImpresso(c, contratos.get(`${c.pedido_id_int}/${c.modelo_id}`));
    if (valor !== undefined) resultado.set(c.id, valor);
  }
  return resultado;
}
