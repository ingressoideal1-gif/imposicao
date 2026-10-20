const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(require('node:path').join(__dirname,'../frontend/entregas/api.js'),'utf8');
assert.match(source,/const ativo = true;/, 'Integracao implantada deve estar ativa');
function ambiente(ativar=false){
  const calls=[];const state={rpc:{data:{confirmada:true,hora:'2026-10-17T15:00:00Z'},error:null},session:null,userError:null,authorized:true,options:null,routes:[],edgeError:false,upload:null,download:new Blob(['foto']),signout:0};
  const client={functions:{invoke:async(n,args)=>{calls.push({n,args});if(state.edgeError)return{error:{message:'Google indisponivel'}};state.routes.forEach(r=>r.previsao_pendente=false);return{data:{confirmado:true}};}},auth:{getSession:async()=>({data:{session:state.session}}),getUser:async()=>({data:{user:{id:'usuario'}},error:state.userError}),signInWithPassword:async()=>({data:{user:{id:'usuario'}}}),signOut:async()=>{state.signout++;return{error:null};}},rpc:async(n,args)=>{calls.push({n,args});if(n==='ve_rotas_status')return{data:state.routes};return n==='ve_entregador_autorizar'&&!state.rpc.error?{data:state.authorized}:state.rpc;},storage:{from:()=>({upload:async()=>({error:state.upload}),download:async()=>({data:state.download,error:null})})}};
  const ctx={window:{},supabase:{createClient:(url,key,opts)=>{state.options=opts;return client;}},localStorage:{},sessionStorage:{},VIBECODE_SUPABASE_URL:'https://example.invalid',VIBECODE_ANON_KEY:'fake',crypto:require('node:crypto').webcrypto,Uint8Array};
  vm.runInNewContext(source.replace(/const ativo = (true|false);/, 'const ativo = '+ativar+';'),ctx);
  return{api:ctx.window.VibeEntregas,calls,state};
}
(async()=>{
  let a=ambiente();assert.equal(a.api.ativo,false);await assert.rejects(()=>a.api.entrar('teste','senha'),/não ativada/);assert.equal(a.calls.length,0);
  a=ambiente(true);a.state.rpc={data:null,error:{message:'Negado'}};await assert.rejects(()=>a.api.entrar('teste','senha'),/Negado/);assert.equal(a.state.signout,1);
  a=ambiente(true);assert.equal(await a.api.restaurarSessao(),null);assert.equal(a.state.options.auth.persistSession,true);assert.equal(a.state.options.auth.autoRefreshToken,true);assert.ok(a.state.options.auth.storage);
  a.state.session={user:{id:'usuario'}};assert.equal((await a.api.restaurarSessao()).id,'usuario');
  a.state.userError={message:'offline'};await assert.rejects(()=>a.api.restaurarSessao(),/validar/);assert.equal(a.state.signout,0);
  a.state.userError=null;a.state.authorized=false;await assert.rejects(()=>a.api.restaurarSessao(),/acesso ativo/);assert.equal(a.state.signout,1);
  a=ambiente(true);const pedido={chave:'proposta'},registro={resultado:'entregue',operacao:'op',recebedor:'Teste',observacao:'',volumes:true};
  assert.equal((await a.api.registrar(pedido,registro,new Blob(['foto']))).confirmada,true);assert.equal(a.calls[0].args.p_foto,'usuario/proposta/op.jpg');
  a.state.routes=[{id:'rota',minha:true,previsao_pendente:true}];a.state.edgeError=true;
  const entregue=await a.api.registrar(pedido,registro,new Blob(['foto']));assert.equal(entregue.confirmada,true);assert.equal(entregue.previsoes_pendentes,true);
  assert.equal((await a.api.rotasAtivas())[0].previsao_pendente,true);
  a.state.edgeError=false;assert.equal((await a.api.rotasAtivas())[0].previsao_pendente,false);
  assert.ok(a.calls.some(c=>c.n==='vibe-entregas-previsoes'&&c.args.body.acao==='atualizar'));
  await a.api.registrar({...pedido,rota_id:'rota-grupo',grupo:[pedido,{chave:'proposta2'}]},registro,new Blob(['foto']));
  const grupo=a.calls.find(c=>c.n==='ve_registrar_repasse');assert.deepEqual(Array.from(grupo.args.p_pedidos),['proposta','proposta2']);assert.equal(grupo.args.p_rota,'rota-grupo');assert.equal(grupo.args.p_foto,'usuario/proposta/op.jpg');
  a.state.rpc={data:[],error:null};await assert.rejects(()=>a.api.registrar(pedido,registro,new Blob(['foto'])),/não confirmada/);
  a.state.upload={statusCode:409};a.state.download=new Blob(['outra']);await assert.rejects(()=>a.api.registrar(pedido,registro,new Blob(['foto'])),/mudou/);
  a.state.download=new Blob(['foto']);a.state.rpc={data:{confirmada:true},error:null};assert.equal((await a.api.registrar(pedido,registro,new Blob(['foto']))).confirmada,true);
  a.state.upload={statusCode:503};const before=a.calls.length;await assert.rejects(()=>a.api.registrar(pedido,registro,new Blob(['foto'])),/Falha/);assert.equal(a.calls.length,before);
  console.log('PASS: integracao desativada, login recusado, retorno persistido, erro de upload e hash de reenvio. Transporte simulado.');
})().catch(e=>{console.error(e);process.exitCode=1});
