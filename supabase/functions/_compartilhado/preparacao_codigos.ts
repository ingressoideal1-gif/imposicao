// Mesma posição de qr_ideal.py; esta função recebe somente a base privada no servidor.
export const POOL_BYTES = 24_000_000;
export const POOL_SHA256 = "8e30409786113d484103cb66f88080a99bb67530a4817c245789c8929da35174";
export const POOL_OBJETO = "ideal-control-master/qr_ideal_pool.bin";
export const POOL_V2_SHA256 = "6e968837c7f16a9acd0b0a46adfa84bbb1137dae75010f64512ca7f01351e1dc";
export const POOL_V2_OBJETO = "ideal-control-master/qr_ideal_pool_qr12_1.bin";

export function indiceQr(pedido: number, modelo: number, numero: number): number {
  const diferenca = ((pedido % 100 - modelo % 100) + 100) % 100;
  return ((((diferenca || 100) - 1) * 30000 + numero - 1) % 3000000 + 3000000) % 3000000;
}

export type PlanoModelo = {
  modelo: number; setor: string; quantidade: number; inicio: number;
  passo: number; posicao: number; tipo: string; prefix: string; suffix: string; pad: number;
  qr_contrato?: ContratoQr;
};

export type ContratoQr = { pedido: number; modelo: number; versao: number; inicio: number;
  passo: number; posicao: number; quantidade: number; deslocamento: number | null;
  capacidade: number; pool_revisao: string; fonte_hash: string };

export function indiceContrato(pedido: number, modelo: number, valor: number, c: ContratoQr): number {
  if (c.pedido !== pedido || c.modelo !== modelo) throw new Error("Contrato QR de outro pedido/modelo.");
  const pos = valor - c.inicio, offset = c.deslocamento;
  if (!Number.isSafeInteger(pos) || pos < 0 || pos >= c.capacidade) throw new Error("Número fora da reserva QR.");
  if (c.versao === 1 && c.pool_revisao === "ideal-master-1") return indiceQr(pedido, modelo, valor);
  if (c.versao !== 2 || c.pool_revisao !== "ideal-qr12-1") throw new Error("Versão QR incompatível.");
  if (!Number.isSafeInteger(pos) || pos < 0 || pos >= c.capacidade || offset === null ||
      !Number.isSafeInteger(offset) || offset < 0 || offset + c.capacidade > 3000000) {
    throw new Error("Número fora da reserva QR; base nunca pode dar a volta.");
  }
  return offset + pos;
}

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
  const offset = (m.qr_contrato ? indiceContrato(pedido, m.modelo, valor, m.qr_contrato) : indiceQr(pedido, m.modelo, valor)) * 8;
  const prefixo = m.qr_contrato?.versao === 2 ? String(m.modelo).slice(-4).padStart(4,"0") : String(pedido);
  return prefixo.split("").reverse().join("") + new TextDecoder("ascii").decode(pool.subarray(offset, offset + 8));
}
