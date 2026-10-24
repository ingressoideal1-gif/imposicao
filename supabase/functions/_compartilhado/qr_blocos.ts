import manifesto from './qr_blocos_v2.json' with { type: 'json' };
import { POOL_BYTES, POOL_V2_SHA256, POOL_V2_OBJETO, indiceContrato, PlanoModelo } from './preparacao_codigos.ts';

type Blocos = { bytes: number; bloco_bytes: number; blocos: string[] };
type Buscar = (inicio: number, fim: number) => Promise<Response>;

/** Cache por instancia; cada instancia fria transfere somente os blocos usados. */
export function criarLeitorBlocos(meta: Blocos, buscar: Buscar) {
  if (!Number.isSafeInteger(meta.bytes) || meta.bytes <= 0 || meta.bytes % 8 !== 0 ||
      !Number.isSafeInteger(meta.bloco_bytes) || meta.bloco_bytes < 8 || meta.bloco_bytes % 8 !== 0 ||
      meta.blocos.length !== Math.ceil(meta.bytes / meta.bloco_bytes) ||
      meta.blocos.some(h => !/^[a-f0-9]{64}$/.test(h))) throw new Error('Manifesto QR invalido.');
  const cache = new Map<number, Promise<Uint8Array>>();
  async function bloco(n: number): Promise<Uint8Array> {
    if (!cache.has(n)) cache.set(n, (async () => {
      const inicio = n * meta.bloco_bytes, fim = Math.min(inicio + meta.bloco_bytes, meta.bytes) - 1;
      const r = await buscar(inicio, fim);
      if (r.status !== 206 || r.headers.get('Content-Range') !== `bytes ${inicio}-${fim}/${meta.bytes}`) {
        await r.body?.cancel();
        throw new Error('Faixa da base QR recusada.');
      }
      const leitor = r.body?.getReader();
      if (!leitor) throw new Error('Bloco QR ausente.');
      const bytes = new Uint8Array(fim - inicio + 1);
      let total = 0;
      try {
        while (true) {
          const { done, value } = await leitor.read();
          if (done) break;
          if (total + value.length > bytes.length) throw new Error('Bloco QR excede tamanho.');
          bytes.set(value, total); total += value.length;
        }
      } finally { await leitor.cancel(); leitor.releaseLock(); }
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
        .map(x => x.toString(16).padStart(2, '0')).join('');
      if (total !== bytes.length || hash !== meta.blocos[n]) throw new Error('Integridade do bloco QR nao confirmada.');
      return bytes;
    })().catch(e => { cache.delete(n); throw e; }));
    return cache.get(n)!;
  }
  return async (indice: number): Promise<string> => {
    if (!Number.isSafeInteger(indice) || indice < 0 || indice >= meta.bytes / 8)
      throw new Error('Indice QR fora da base.');
    const offset = indice * 8, n = Math.floor(offset / meta.bloco_bytes);
    const bytes = await bloco(n), local = offset % meta.bloco_bytes;
    return new TextDecoder('ascii').decode(bytes.subarray(local, local + 8));
  };
}

if (manifesto.revisao !== 'ideal-qr12-1' || manifesto.bytes !== POOL_BYTES ||
    manifesto.sha256 !== POOL_V2_SHA256 || manifesto.bloco_bytes !== 65536)
  throw new Error('Revisao dos blocos QR divergente.');

const lerQrV2 = criarLeitorBlocos(manifesto, async (inicio, fim) => {
  const chave = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  return await fetch(`${Deno.env.get('SUPABASE_URL')}/storage/v1/object/authenticated/${POOL_V2_OBJETO}`, {
    headers: { Authorization: `Bearer ${chave}`, apikey: chave || '', Range: `bytes=${inicio}-${fim}` },
    redirect: 'error',
  });
});

export async function conteudoQrV2EmBlocos(pedido: number, m: PlanoModelo, i: number,
    ler = lerQrV2): Promise<string> {
  const c = m.qr_contrato;
  if (m.tipo !== 'QR_IDEAL' || c?.versao !== 2) throw new Error('Contrato QR v2 obrigatorio.');
  const valor = m.inicio + i * m.passo + m.posicao - 1;
  const indice = indiceContrato(pedido, m.modelo, valor, c);
  const codigo = await ler(indice);
  return String(m.modelo).slice(-4).padStart(4, '0').split('').reverse().join('') + codigo;
}
