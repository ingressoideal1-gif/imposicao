// Mesma posição de qr_ideal.py; esta função recebe somente a base privada no servidor.
export const POOL_BYTES = 24_000_000;
export const POOL_SHA256 = "8e30409786113d484103cb66f88080a99bb67530a4817c245789c8929da35174";
export const POOL_OBJETO = "ideal-control-master/qr_ideal_pool.bin";

export function indiceQr(pedido: number, modelo: number, numero: number): number {
  const diferenca = ((pedido % 100 - modelo % 100) + 100) % 100;
  return ((((diferenca || 100) - 1) * 30000 + numero - 1) % 3000000 + 3000000) % 3000000;
}

export type PlanoModelo = {
  modelo: number; setor: string; quantidade: number; inicio: number;
  passo: number; posicao: number; tipo: string; prefix: string; suffix: string; pad: number;
};

export function planejar(fonte: any[]): PlanoModelo[] {
  const planos: PlanoModelo[] = [];
  for (const m of fonte) {
    const n = m.numeracao;
    if (!n || !Array.isArray(n.elements)) continue;
    let el: any;
    for (const tipo of ["QR_IDEAL", "QR", "BARCODE"]) {
      el = n.elements.find((e: any) => e?.type === tipo && e.source !== "database" && !e.fixed);
      if (el) break;
    }
    if (!el) continue;
    const quantidade = Number(m.quantidade), inicio = Number(m.inicio ?? 1);
    const passo = n.tipo === "TICKET" ? Number(n.ticket_qtd || 1) : 1;
    const posicao = n.tipo === "TICKET" ? Number(el.ticket_pos || 1) : 1;
    if (!Number.isSafeInteger(quantidade) || quantidade < 1 ||
        !Number.isSafeInteger(inicio) || inicio < 0 ||
        !Number.isSafeInteger(passo) || passo < 1 ||
        !Number.isSafeInteger(posicao) || posicao < 1 || posicao > passo ||
        !m.setor || !Number.isSafeInteger(Number(m.id))) {
      throw new Error("Modelo sem quantidade, numeração ou setor válido. Confira o pedido na gráfica.");
    }
    // QTD continua sendo células físicas; nunca dividir por ticket_qtd.
    planos.push({ modelo: Number(m.id), setor: m.setor, quantidade, inicio, passo, posicao,
      tipo: el.type, prefix: String(el.prefix ?? ""), suffix: String(el.suffix ?? ""),
      pad: Math.max(0, Math.min(100, Number(el.pad) || 0)) });
  }
  if (!planos.length) throw new Error("O evento não tem modelos com códigos disponíveis.");
  return planos;
}

export function conteudoDoIngresso(pool: Uint8Array | null, pedido: number, m: PlanoModelo, i: number): string {
  const valor = m.inicio + i * m.passo + m.posicao - 1;
  if (m.tipo !== "QR_IDEAL") return m.prefix + String(valor).padStart(m.pad, "0") + m.suffix;
  if (!pool || pool.byteLength !== POOL_BYTES) throw new Error("Base privada indisponível.");
  const offset = indiceQr(pedido, m.modelo, valor) * 8;
  return String(pedido).split("").reverse().join("") + new TextDecoder("ascii").decode(pool.subarray(offset, offset + 8));
}
