import { strict as assert } from 'node:assert';
import { fornecerBaseQrV2 } from './qr_provisionamento.ts';
import { handler } from '../piloto-local/index.ts';
import { POOL_BYTES, POOL_V2_SHA256 } from './preparacao_codigos.ts';

Deno.test('QR privado: revisão fixa, autorização explícita, empresa e resposta sem cache', async () => {
  const env = Deno.env.get;
  const vars: Record<string,string> = {PILOTO_LOCAL_EMPRESA:'teste', PILOTO_LOCAL_EMPRESA_ID:'12',
    NEWPROD_QR_V2_ESTACOES:'LASER-01, LASER-02'};
  Deno.env.get = n => vars[n];
  const entrada = {empresa:'teste', revisao:'ideal-qr12-1'};
  const operador = {perm_producao_view:true, perm_imprimir:true, empresa_id:12};
  let cargas = 0;
  const carregar = async (versao = 1) => {
    assert.equal(versao, 2); cargas++;
    return new Uint8Array(POOL_BYTES); // bytes sintéticos; carregador real valida SHA-256
  };
  try {
    for (const estacao of ['FORA','LASER-%','', '*'])
      await assert.rejects(fornecerBaseQrV2(entrada,operador,estacao,carregar),{status:403});
    await assert.rejects(fornecerBaseQrV2(entrada,{...operador,perm_imprimir:false},'LASER-01',carregar),{status:403});
    await assert.rejects(fornecerBaseQrV2(entrada,{...operador,empresa_id:99},'LASER-01',carregar),{status:403});
    for (const corpo of [{...entrada,revisao:'1'}, {...entrada,empresa:'outra'},
      {...entrada,url:'https://fora.invalid'}, {...entrada,bucket:'outro'}, null, []])
      await assert.rejects(fornecerBaseQrV2(corpo,operador,'LASER-01',carregar),{status:422});
    delete vars.NEWPROD_QR_V2_ESTACOES;
    await assert.rejects(fornecerBaseQrV2(entrada,operador,'LASER-01',carregar),{status:403});
    vars.NEWPROD_QR_V2_ESTACOES = '*';
    await assert.rejects(fornecerBaseQrV2(entrada,operador,'LASER-01',carregar),{status:403});
    assert.equal(cargas,0);
    vars.NEWPROD_QR_V2_ESTACOES = 'LASER-01';
    const r = await fornecerBaseQrV2(entrada,operador,'laser-01',carregar);
    assert.equal(r.status,200); assert.equal(cargas,1);
    assert.equal(r.headers.get('X-NewProd-QR-SHA256'),POOL_V2_SHA256);
    assert.equal(r.headers.get('X-NewProd-QR-Revisao'),'ideal-qr12-1');
    assert.match(r.headers.get('Cache-Control')!,/private, no-store/);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);
    assert.equal(r.headers.get('Content-Type'),'application/octet-stream');
    assert.equal((await r.arrayBuffer()).byteLength,POOL_BYTES);
    await assert.rejects(fornecerBaseQrV2(entrada,operador,'LASER-01',async()=>new Uint8Array(1)),{status:503});
  } finally { Deno.env.get = env; }
});

Deno.test('rota QR: autenticação e vínculo antes da base; navegador e sessão comum recusados', async () => {
  const env = Deno.env.get, fetchOriginal = globalThis.fetch;
  const vars: Record<string,string> = {SUPABASE_URL:'https://banco.invalid', SUPABASE_SERVICE_ROLE_KEY:'sintetica',
    ACESSO_AGENTE_SEGREDO:'agente-sintetico', PILOTO_LOCAL_EMPRESA:'teste', PILOTO_LOCAL_EMPRESA_ID:'12',
    PILOTO_LOCAL_ESTACAO:'LASER-01', PILOTO_LOCAL_OPERADOR:'ABC123', NEWPROD_QR_V2_ESTACOES:'LASER-01'};
  let ativo = true, pode = true, consultas = 0, bases = 0;
  Deno.env.get = n => vars[n];
  globalThis.fetch = (async (input, op) => {
    assert.equal(op?.method ?? 'GET','GET'); consultas++;
    if (String(input).includes('imposition_acessos_locais?')) return Response.json(ativo ? [
      {role:'impressor',permissoes:{empresa_id:12,perm_producao_view:true,perm_imprimir:pode}}] : []);
    if (String(input).includes('/storage/')) { bases++; return new Response(null,{status:503}); }
    throw new Error('Consulta inesperada');
  }) as typeof fetch;
  const req = (key = 'agente-sintetico', extra: Record<string,string> = {}, corpo: unknown = {
    empresa:'teste', estacao:'LASER-01', revisao:'ideal-qr12-1'}) => new Request('https://funcao.invalid/piloto-local/base-qr-v2', {
      method:'POST', headers:{'x-agente-segredo':key,...extra}, body:JSON.stringify(corpo)});
  try {
    assert.equal((await handler(req(''))).status,401);
    assert.equal((await handler(req('errado'))).status,401);
    assert.equal((await handler(req('',{authorization:'Bearer sessao'}))).status,401);
    assert.equal((await handler(req('agente-sintetico',{origin:'http://localhost:9001'}))).status,403);
    assert.equal((await handler(req('agente-sintetico',{origin:'https://fora.invalid'}))).status,403);
    assert.equal(consultas,0);
    ativo = false; assert.equal((await handler(req())).status,401);
    ativo = true; pode = false; assert.equal((await handler(req())).status,403);
    pode = true; delete vars.NEWPROD_QR_V2_ESTACOES;
    assert.equal((await handler(req())).status,403);
    vars.NEWPROD_QR_V2_ESTACOES = 'LASER-01';
    assert.equal((await handler(req('agente-sintetico',{}, {empresa:'teste',estacao:'LASER-01',revisao:'outra'}))).status,422);
    assert.equal(bases,0);
    // Armazenamento inacessível: não retornar corpo, URL privada ou chave.
    const r = await handler(req()); assert.equal(r.status,503); assert.equal(bases,1);
    assert.doesNotMatch(await r.text(),/sintetica|storage|https:/);
  } finally { Deno.env.get = env; globalThis.fetch = fetchOriginal; }
});
