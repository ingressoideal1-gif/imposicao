import { strict as assert } from 'node:assert';
import { criarLeitorBlocos, conteudoQrV2EmBlocos } from './qr_blocos.ts';
import { conteudoDoIngresso, POOL_BYTES, PlanoModelo } from './preparacao_codigos.ts';

async function fixture() {
  const bytes = new TextEncoder().encode('AAA00000BBB11111CCC22222DDD33333EEE44444');
  const blocos: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    blocos.push(Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes.slice(i, i + 16))))
      .map(x => x.toString(16).padStart(2, '0')).join(''));
  }
  const meta = { bytes: bytes.length, bloco_bytes: 16, blocos };
  const chamadas: number[][] = [];
  const buscar = async (inicio: number, fim: number) => {
    chamadas.push([inicio, fim]);
    return new Response(bytes.slice(inicio, fim + 1), {
      status: 206, headers: { 'Content-Range': `bytes ${inicio}-${fim}/${bytes.length}` },
    });
  };
  return { bytes, meta, chamadas, buscar };
}

Deno.test('QR blocos: concorrencia compartilha download, fronteira e ultimo bloco curto', async () => {
  const f = await fixture(), ler = criarLeitorBlocos(f.meta, f.buscar);
  assert.deepEqual(await Promise.all([ler(0), ler(1), ler(0)]), ['AAA00000', 'BBB11111', 'AAA00000']);
  assert.deepEqual(f.chamadas, [[0, 15]]);
  assert.equal(await ler(2), 'CCC22222');
  assert.equal(await ler(4), 'EEE44444');
  assert.deepEqual(f.chamadas, [[0, 15], [16, 31], [32, 39]]);
});

Deno.test('QR blocos: resposta integral e faixa errada recusadas antes de ler o corpo', async () => {
  const f = await fixture();
  for (const status of [200, 206, 403]) {
    let cancelado = false;
    const ler = criarLeitorBlocos(f.meta, async () => new Response(new ReadableStream({
      cancel() { cancelado = true; },
    }), { status, headers: { 'Content-Range': 'bytes 1-16/40' } }));
    await assert.rejects(ler(0), /Faixa/);
    assert.equal(cancelado, true);
  }
});

Deno.test('QR blocos: corrupcao, falta e excesso nao entram no cache; retentativa valida funciona', async () => {
  const f = await fixture();
  for (const corpo of [new Uint8Array(16), new Uint8Array(15), new Uint8Array(17)]) {
    let falhar = true;
    const ler = criarLeitorBlocos(f.meta, async (inicio, fim) => falhar
      ? new Response(corpo, { status: 206, headers: { 'Content-Range': 'bytes 0-15/40' } })
      : f.buscar(inicio, fim));
    await assert.rejects(ler(0), /Integridade|excede/);
    falhar = false;
    assert.equal(await ler(0), 'AAA00000');
  }
});

Deno.test('QR blocos: indice invalido nao consulta Storage', async () => {
  const f = await fixture(), ler = criarLeitorBlocos(f.meta, f.buscar);
  for (const i of [-1, 5, 1.5, NaN, Infinity]) await assert.rejects(ler(i), /Indice/);
  assert.equal(f.chamadas.length, 0);
});

Deno.test('QR blocos: preserva exatamente prefixo, TICKET, deslocamento e hash de entrada', async () => {
  const pool = new Uint8Array(POOL_BYTES).fill(65);
  const m: PlanoModelo = { modelo: 1004525, setor: 'A', quantidade: 3, inicio: 100,
    passo: 3, posicao: 2, tipo: 'QR_IDEAL', prefix: '', suffix: '', pad: 0,
    qr_contrato: { pedido: 23608, modelo: 1004525, versao: 2, inicio: 100,
      passo: 3, posicao: 2, quantidade: 3, deslocamento: 8191, capacidade: 9,
      pool_revisao: 'ideal-qr12-1', fonte_hash: 'sintetico' } };
  const indices: number[] = [];
  const ler = async (i: number) => { indices.push(i); return 'AAAAAAAA'; };
  for (let i = 0; i < 3; i++)
    assert.equal(await conteudoQrV2EmBlocos(23608, m, i, ler), conteudoDoIngresso(pool, 23608, m, i));
  assert.deepEqual(indices, [8192, 8195, 8198]);
  await assert.rejects(conteudoQrV2EmBlocos(999, m, 0, ler), /outro pedido/);
  await assert.rejects(conteudoQrV2EmBlocos(23608, m, 3, ler), /fora da reserva/);
  await assert.rejects(conteudoQrV2EmBlocos(23608, { ...m, qr_contrato: undefined }, 0, ler), /obrigatorio/);
  assert.equal(indices.length, 3);
});
