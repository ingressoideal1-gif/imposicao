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

type Via = { posicao: number; prefix: string; suffix: string; pad: number };

export type PlanoModelo = Via & {
  modelo: number; setor: string; quantidade: number; inicio: number;
  passo: number; tipo: string;
  vias?: Via[];
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

const TIPOS = ["QR_IDEAL", "QR", "BARCODE"];

export function planoDoModelo(m: any): PlanoModelo | null {
  const n = m.numeracao;
  if (!Array.isArray(n?.elements)) return null;
  const codigos = TIPOS.flatMap(tipo => n.elements.filter((e: any) =>
    e?.type === tipo && e.source !== "database" && !e.fixed));
  const primeiro = codigos[0];
  if (!primeiro) return null;

  const ticket = n.tipo === "TICKET";
  const passo = ticket ? Number(n.ticket_qtd || 1) : 1;
  const inicio = Number(m.inicio ?? 1);
  const celulas = Number(m.quantidade);
  const porVia = new Map<number, Via>();
  const elementos = ticket && primeiro.type !== "QR_IDEAL" ? codigos : [primeiro];
  for (const el of elementos) {
    const posicao = ticket ? Number(el.ticket_pos || 1) : 1;
    if (!Number.isSafeInteger(posicao) || posicao < 1 || posicao > passo) {
      throw new Error("Posição TICKET inválida. Confira a numeração na gráfica.");
    }
    if (!porVia.has(posicao)) porVia.set(posicao, {
      posicao, prefix: String(el.prefix ?? ""), suffix: String(el.suffix ?? ""),
      pad: Math.max(0, Math.min(100, Number(el.pad) || 0)),
    });
  }
  const vias = [...porVia.values()];
  const quantidade = celulas * vias.length;
  if (!Number.isSafeInteger(celulas) || celulas < 1 || !Number.isSafeInteger(quantidade) ||
      !Number.isSafeInteger(inicio) || inicio < 0 || !Number.isSafeInteger(passo) || passo < 1 ||
      !Number.isSafeInteger(inicio + celulas * passo - 1) ||
      !Number.isSafeInteger(Number(m.id))) {
    throw new Error("Modelo sem quantidade ou numeração válida. Confira o pedido na gráfica.");
  }
  return { modelo: Number(m.id), setor: m.setor ?? "", quantidade, inicio, passo, tipo: primeiro.type,
    ...vias[0], ...(vias.length > 1 ? { vias } : {}) };
}

export function planejar(fonte: any[]): PlanoModelo[] {
  const planos = fonte.map(planoDoModelo).filter((p): p is PlanoModelo => p !== null);
  if (!planos.length) throw new Error("O evento não tem modelos com códigos disponíveis.");
  if (planos.some(p => !p.setor)) throw new Error("Modelo sem setor válido. Confira o pedido na gráfica.");
  return planos;
}

export function conteudoDoIngresso(pool: Uint8Array | null, pedido: number, m: PlanoModelo, i: number): string {
  // A via já adotada mantém os ordinais 1..QTD. As demais ocupam os blocos
  // seguintes, com numeração contínua exigida pela RPC de preparação.
  const celulas = m.quantidade / (m.vias?.length ?? 1);
  const via = m.vias?.[Math.floor(i / celulas)] ?? m;
  const celula = m.vias ? i % celulas : i;
  const valor = m.inicio + celula * m.passo + via.posicao - 1;
  if (m.tipo !== "QR_IDEAL") return via.prefix + String(valor).padStart(via.pad, "0") + via.suffix;
  if (!pool || pool.byteLength !== POOL_BYTES) throw new Error("Base privada indisponível.");
  const offset = (m.qr_contrato ? indiceContrato(pedido, m.modelo, valor, m.qr_contrato) : indiceQr(pedido, m.modelo, valor)) * 8;
  const prefixo = m.qr_contrato?.versao === 2 ? String(m.modelo).slice(-4).padStart(4,"0") : String(pedido);
  return prefixo.split("").reverse().join("") + new TextDecoder("ascii").decode(pool.subarray(offset, offset + 8));
}
