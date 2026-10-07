import { strict as assert } from 'node:assert';
import { receberHistorico, consultarHistorico, empresaHistorico } from './historico_impressao.ts';
import { handler } from '../historico-impressao/index.ts';
const id = '12345678-1234-1234-1234-123456789012';
const lote = () => ({estacao:'TESTE-01', instalacao:id, cursor:1, eventos:[{seq:1, trabalho:id,
  quando:'2026-10-07T10:00:00Z', codigo:'trabalho_enviado', nivel:'info', impressora:'Sintetica', spool_id:1,
  contexto:{alvos:[{pedido:'123',modelo:'456'}],tipo:'capa',escopo:'modelo'},dados:{}}]});

Deno.test('historico: insert atomico, empresa imposta pelo servidor e deduplicacao', async()=>{
  const chamadas: any[] = [];
  const banco = async (...args:any[]) => { chamadas.push(args); return null; };
  for(let i=0;i<2;i++) assert.deepEqual(await receberHistorico(lote(),'empresa-teste',banco),{confirmado:1,instalacao:id});
  assert.equal(chamadas[0][0],'POST');
  assert.match(chamadas[0][1],/on_conflict=empresa,estacao,instalacao,seq/);
  assert.equal(chamadas[0][2][0].empresa,'empresa-teste');
  assert.equal(chamadas[0][3],'resolution=ignore-duplicates,return=minimal');
});
Deno.test('historico: corpo invalido nao escreve, cursor nao e confirmado apos erro', async()=>{
  let escritas=0;const banco=async()=>{escritas++;throw Error('offline');};
  const a=lote();a.eventos[0].contexto.alvos[0].pedido='1&empresa=outra';
  await assert.rejects(()=>receberHistorico(a,'empresa',banco));assert.equal(escritas,0);
  await assert.rejects(()=>receberHistorico(lote(),'empresa',banco));assert.equal(escritas,1);
  const b=lote();b.eventos.push(b.eventos[0]);await assert.rejects(()=>receberHistorico(b,'empresa',banco));
});
Deno.test('historico: consulta por empresa, modelo e pedido no mesmo alvo, paginacao limitada', async()=>{
  let path='';const banco=async(_m:string,p:string)=>{path=p;return Array.from({length:101},(_,i)=>({id:200-i}));};
  const r=await consultarHistorico({pedido:'123',modelo:'456',estacao:'TESTE-01',dias:7,antes:300},'empresa',banco);
  assert.equal(r.eventos.length,100);assert.equal(r.proximo,101);
  assert.match(path,/empresa=eq.empresa/);assert.match(path,/limit=101/);assert.match(path,/id=lt.300/);
  assert.ok(decodeURIComponent(path).includes('"alvos":[{"pedido":"123","modelo":"456"}]'));
  await assert.rejects(()=>consultarHistorico({dias:999},'empresa',banco));
});
Deno.test('historico: isolamento e ausencia de configuracao falham fechados',()=>{
  assert.throws(()=>empresaHistorico({empresa_id:'outra'},'Teste','empresa'));
  assert.throws(()=>empresaHistorico({},'Teste',undefined));
  assert.equal(empresaHistorico({empresa_id:'empresa'},'Teste','empresa'),'empresa');
});
Deno.test('historico: sessao, permissao administrativa, origem e empresa verificadas',async()=>{
  const fetchOriginal=globalThis.fetch,envOriginal=Deno.env.get;
  let admin=false,empresa='empresa', valido=false, consultas=0;
  Deno.env.get=(nome:string)=>({SUPABASE_SERVICE_ROLE_KEY:'sintetica',SUPABASE_URL:'https://sintetico.invalid',SUPABASE_ANON_KEY:'teste',PILOTO_LOCAL_EMPRESA:'Teste',PILOTO_LOCAL_EMPRESA_ID:'empresa'} as any)[nome];
  globalThis.fetch=(async(input:any)=>{
    const url=String(input);
    if(url.endsWith('/auth/v1/user'))return Response.json({id},{status:valido?200:401});
    if(url.includes('imposition_user_permissions?'))return Response.json([{perm_admin_view:admin,empresa_id:empresa}]);
    consultas++;return Response.json([]);
  }) as typeof fetch;
  const req=()=>new Request('https://sintetico.invalid/historico-impressao/consultar',{method:'POST',headers:{authorization:'Bearer sintetico'},body:'{}'});
  try {
    assert.equal((await handler(req())).status,401);
    valido=true;assert.equal((await handler(req())).status,403);
    admin=true;empresa='outra';assert.equal((await handler(req())).status,403);
    assert.equal(consultas,0);empresa='empresa';
    // banco.ts exige a chave de servico mesmo com fetch simulado.
    Deno.env.get=(nome:string)=>nome==='SUPABASE_SERVICE_ROLE_KEY'?'sintetica':({SUPABASE_SERVICE_ROLE_KEY:'sintetica',SUPABASE_URL:'https://sintetico.invalid',SUPABASE_ANON_KEY:'teste',PILOTO_LOCAL_EMPRESA:'Teste',PILOTO_LOCAL_EMPRESA_ID:'empresa'} as any)[nome];
    assert.equal((await handler(req())).status,200);
    assert.equal((await handler(new Request(req(),{headers:{origin:'https://fora.invalid'}}))).status,403);
  } finally {globalThis.fetch=fetchOriginal;Deno.env.get=envOriginal;}
});

Deno.test('historico: upload exige segredo e vinculo ativo, limite antes de gravar',async()=>{
  const f=globalThis.fetch,get=Deno.env.get;let ativo=true, gravacoes=0;
  const vars:Record<string,string>={SUPABASE_URL:'https://teste.invalid',SUPABASE_SERVICE_ROLE_KEY:'sintetica',
    ACESSO_AGENTE_SEGREDO:'segredo-sintetico',PILOTO_LOCAL_EMPRESA:'Teste',PILOTO_LOCAL_EMPRESA_ID:'empresa',PILOTO_LOCAL_ESTACAO:'LEGADA'};
  Deno.env.get=k=>vars[k];
  globalThis.fetch=(async(input:any,op:any)=>{
    const url=String(input);
    if(url.includes('imposition_acessos_locais?'))return Response.json(ativo?[{role:'visualizador',permissoes:{
      piloto_estacao:'TESTE-01',piloto_empresa:'Teste',piloto_instalacao_autorizada:true,piloto_usuario_id:id,
      empresa_id:'empresa',perm_producao_view:true,perm_imprimir:true}}]:[]);
    if(url.includes('imposition_user_permissions?'))return Response.json([{user_id:id,empresa_id:'empresa',perm_producao_view:true,perm_imprimir:true}]);
    assert.match(url,/imposition_historico_impressao/);assert.equal(op.method,'POST');gravacoes++;return new Response(null,{status:204});
  }) as typeof fetch;
  const req=(secret='segredo-sintetico',body=JSON.stringify(lote()))=>new Request('https://teste.invalid/historico-impressao/enviar',{
    method:'POST',headers:{'x-agente-segredo':secret},body});
  try {
    assert.equal((await handler(req('incorreto'))).status,401);
    assert.equal((await handler(req())).status,200);assert.equal(gravacoes,1);
    ativo=false;assert.equal((await handler(req())).status,403);assert.equal(gravacoes,1);
    assert.equal((await handler(req('segredo-sintetico','x'.repeat(262145)))).status,413);
  } finally {globalThis.fetch=f;Deno.env.get=get;}
});
