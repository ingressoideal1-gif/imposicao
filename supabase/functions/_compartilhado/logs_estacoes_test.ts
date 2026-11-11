import { strict as assert } from 'node:assert';
import { receberLogs, consultarLogs, linhaSegura } from './logs_estacoes.ts';
import { handler } from '../historico-impressao/index.ts';
const lote = () => ({estacao:'LASER-TESTE', arquivo:'agent.log', resumo:'a'.repeat(64),
  coletado_em:'2026-11-11T12:00:00Z', estado:'disponivel', tamanho:100, parcial:false,
  linhas:['[print] pagina 1/5', '[print] senha=sintetica', '[engine] total_sheets=5']});

Deno.test('logs: isolamento, sanitizacao e snapshot limitado', async () => {
  const chamadas:any[]=[];
  const banco=async(...a:any[])=>{chamadas.push(a);return [];};
  await receberLogs({...lote(),empresa:'outra'}, 'empresa-autorizada', banco);
  assert.equal(chamadas[0][2].empresa, 'empresa-autorizada');
  assert.ok(!JSON.stringify(chamadas[0][2]).includes('sintetica'));
  assert.match(chamadas[0][3], /merge-duplicates/);
  await consultarLogs({estacao:'LASER-TESTE',empresa:'outra'}, 'empresa-autorizada', banco);
  assert.match(chamadas[1][1], /empresa=eq.empresa-autorizada&estacao=eq.LASER-TESTE/);
  assert.match(chamadas[1][1], /limit=6/);
});
Deno.test('logs: rejeita caminhos, linhas grandes, injecao e ausente incoerente', async () => {
  for (const extra of [{arquivo:'../agent.log'}, {estacao:'x&empresa=eq.y'},
    {linhas:Array(301).fill('a')}, {linhas:['a'.repeat(2001)]}, {linhas:['[print] x\nsenha=y']},
    {estado:'ausente'}, {linhas:Array(100).fill('漢'.repeat(1000))}]) {
    await assert.rejects(()=>receberLogs({...lote(),...extra},'empresa',async()=>{throw Error('nao deve gravar');}),
      (e:any)=>e.status===422);
  }
  await assert.rejects(()=>consultarLogs({},'empresa',async()=>[]));
  assert.ok(!linhaSegura('[print] teste@example.invalid C:\\Users\\Teste').includes('Users'));
  const erro='RuntimeError: Envio do lote nao confirmado; geracao interrompida.';
  assert.equal(linhaSegura(erro),erro);
  assert.match(linhaSegura("[integridade] job=12345678-1234-1234-1234-123456789012 modelos=['123'] etapa=uploads_confirmados"), /modelos=\['123'\]/);
});
Deno.test('logs: sessao administrativa e empresa obrigatorias na rota', async () => {
  const f=globalThis.fetch, get=Deno.env.get;
  let valido=false, admin=false, empresa='outra', gravacoes=0;
  Deno.env.get=(k:string)=>({SUPABASE_URL:'https://teste.invalid',SUPABASE_ANON_KEY:'sintetica',
    SUPABASE_SERVICE_ROLE_KEY:'sintetica',PILOTO_LOCAL_EMPRESA:'Teste',PILOTO_LOCAL_EMPRESA_ID:'empresa'} as Record<string,string>)[k];
  globalThis.fetch=(async (input:any)=>{
    const u=String(input);
    if(u.endsWith('/auth/v1/user'))return Response.json({id:'12345678-1234-1234-1234-123456789012'},{status:valido?200:401});
    if(u.includes('imposition_user_permissions?'))return Response.json([{perm_admin_view:admin,empresa_id:empresa}]);
    gravacoes++;return Response.json([]);
  }) as typeof fetch;
  const req=()=>new Request('https://teste.invalid/historico-impressao/consultar-logs',
    {method:'POST',headers:{authorization:'Bearer sintetico'},body:JSON.stringify({estacao:'LASER-TESTE'})});
  try {
    assert.equal((await handler(req())).status,401);
    valido=true;assert.equal((await handler(req())).status,403);
    admin=true;assert.equal((await handler(req())).status,403);assert.equal(gravacoes,0);
    empresa='empresa';assert.equal((await handler(req())).status,200);assert.equal(gravacoes,1);
    assert.equal((await handler(new Request(req(),{headers:{origin:'https://fora.invalid'}}))).status,403);
  } finally { globalThis.fetch=f;Deno.env.get=get; }
});

Deno.test('logs: upload exige segredo, vinculo ativo e corpo limitado', async () => {
  const f=globalThis.fetch,get=Deno.env.get;let ativo=true,gravacoes=0;
  const id='12345678-1234-1234-1234-123456789012';
  const vars:Record<string,string>={SUPABASE_URL:'https://teste.invalid',SUPABASE_SERVICE_ROLE_KEY:'sintetica',
    ACESSO_AGENTE_SEGREDO:'segredo-sintetico',PILOTO_LOCAL_EMPRESA:'Teste',PILOTO_LOCAL_EMPRESA_ID:'empresa',PILOTO_LOCAL_ESTACAO:'LEGADA'};
  Deno.env.get=k=>vars[k];
  globalThis.fetch=(async(input:any,op:any)=>{
    const url=String(input);
    if(url.includes('imposition_acessos_locais?'))return Response.json(ativo?[{role:'visualizador',permissoes:{
      piloto_estacao:'LASER-TESTE',piloto_empresa:'Teste',piloto_instalacao_autorizada:true,piloto_usuario_id:id,
      empresa_id:'empresa',perm_producao_view:true,perm_imprimir:true}}]:[]);
    if(url.includes('imposition_user_permissions?'))return Response.json([{user_id:id,empresa_id:'empresa',perm_producao_view:true,perm_imprimir:true}]);
    assert.match(url,/imposition_logs_estacoes/);assert.equal(op.method,'POST');gravacoes++;return new Response(null,{status:204});
  }) as typeof fetch;
  const req=(secret='segredo-sintetico',body=JSON.stringify(lote()))=>new Request('https://teste.invalid/historico-impressao/enviar-logs',{
    method:'POST',headers:{'x-agente-segredo':secret},body});
  try {
    assert.equal((await handler(req('incorreto'))).status,401);assert.equal(gravacoes,0);
    assert.equal((await handler(req())).status,200);assert.equal(gravacoes,1);
    ativo=false;assert.equal((await handler(req())).status,403);assert.equal(gravacoes,1);
    assert.equal((await handler(req('segredo-sintetico','x'.repeat(262145)))).status,413);
  } finally {globalThis.fetch=f;Deno.env.get=get;}
});
