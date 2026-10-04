import { strict as assert } from 'node:assert';

Deno.test('rota autonoma: exige segredo, opt-in de estacao e operador ativo autorizado',async()=>{
  const serve=Deno.serve,fetchOriginal=globalThis.fetch,env=Deno.env.get;
  let handler!:(req:Request)=>Promise<Response>;
  const vars:Record<string,string>={SUPABASE_URL:'https://banco.invalid',SUPABASE_SERVICE_ROLE_KEY:'sintetica',
    ACESSO_AGENTE_SEGREDO:'agente-sintetico',PILOTO_LOCAL_EMPRESA:'teste',
    PILOTO_LOCAL_ESTACAO:'PC-JR-HOME',PILOTO_LOCAL_OPERADOR:'ABC123'};
  let pode=true,ativo=true,leituras=0;
  try {
    Deno.serve=((fn:typeof handler)=>{handler=fn;return {}}) as unknown as typeof Deno.serve;
    Deno.env.get=nome=>vars[nome];
    globalThis.fetch=(async(input,op)=>{
      assert.equal(op?.method,'GET');leituras++;
      const url=String(input);
      if(url.endsWith('/auth/v1/user'))return Response.json({}, {status:401});
      if(url.includes('imposition_acessos_locais?'))return Response.json(ativo?[{role:'impressor',permissoes:{perm_producao_view:true,perm_imprimir:pode}}]:[]);
      if(url.includes('pedidos_modelos?'))return Response.json([]);
      throw new Error('Consulta inesperada');
    }) as typeof fetch;
    handler=(await import('../piloto-local/index.ts')).handler;
    const req=(chave='agente-sintetico',estacao='PC-JR-HOME')=>new Request('https://funcao.invalid/functions/v1/piloto-local/listar',{
      method:'POST',headers:{'Content-Type':'application/json','X-Agente-Segredo':chave},body:JSON.stringify({estacao,empresa:'teste',cursor:0})});
    assert.equal((await handler(req('invalido'))).status,401);assert.equal(leituras,0);
    assert.equal((await handler(req('agente-sintetico','outra'))).status,403);assert.equal(leituras,0);
    const r=await handler(req());assert.equal(r.status,200);assert.deepEqual(await r.json(),{itens:[],proximo:0,fim:true});
    pode=false;assert.equal((await handler(req())).status,403);
    ativo=false;assert.equal((await handler(req())).status,401);
    delete vars.PILOTO_LOCAL_ESTACAO;assert.equal((await handler(req())).status,503);
    assert.equal((await handler(new Request('https://funcao.invalid/piloto-local/listar'))).status,405);
    assert.equal((await handler(new Request('https://funcao.invalid/piloto-local/listar', {method:'POST',headers:{origin:'https://fora.invalid'}}))).status,403);
    assert.equal((await handler(new Request('https://funcao.invalid/piloto-local/conferir-sessao', {method:'POST',headers:{authorization:'Bearer forjado'}}))).status,401);
  } finally {Deno.serve=serve;globalThis.fetch=fetchOriginal;Deno.env.get=env;}
});
