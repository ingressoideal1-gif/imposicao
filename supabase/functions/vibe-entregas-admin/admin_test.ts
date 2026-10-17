import { atender } from './index.ts';
const id='00000000-0000-0000-0000-000000000095',op='00000000-0000-0000-0000-000000000400';
const env=(n:string)=>({SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'anon-test',SUPABASE_SERVICE_ROLE_KEY:'server-test',VIBE_ENTREGAS_PIN_SECRET:'synthetic-secret-32-characters-only-test'}[n]);
const base={acao:'criar',operacao:op,nome:'Pessoa sintetica',email:'driver@example.invalid',senha:'0123'};
function assert(v:unknown){if(!v)throw Error('Falha de contrato');}
function setup(options:{adm?:boolean;reserva?:boolean;existente?:boolean;alvo?:boolean;final?:boolean}={}) {
 const calls:string[]=[];
 const fetcher=(async(input:RequestInfo|URL,init?:RequestInit)=>{const url=String(input);calls.push(url);let data:unknown={};let status=200;
  if(url.endsWith('/auth/v1/user'))data={id};
  else if(url.endsWith('/ve_admin_edita'))data=options.adm!==false;
  else if(url.endsWith('/ve_admin_preparar_cadastro_geral')){data={usuario:options.existente?id:null};if(options.reserva===false)status=409;}
  else if(url.endsWith('/ve_admin_concluir_cadastro')){data={usuario:id,confirmado:options.final!==false};}
  else if(url.endsWith('/ve_admin_conta_senha')){data={usuario:id,email:'driver@example.invalid'};if(options.alvo===false)status=403;}
  else if(url.includes('/auth/v1/admin/users')){assert(new Headers(init?.headers).get('Authorization')==='Bearer server-test');const enviado=JSON.parse(String(init?.body));assert(enviado.password!==base.senha&&enviado.password.length===68);data={id};}
  else throw Error('Rede inesperada');return new Response(JSON.stringify(data),{status});}) as typeof fetch;
 const run=(body:unknown=base)=>atender(new Request('https://example.invalid',{method:'POST',headers:{Authorization:'Bearer session-test','Content-Type':'application/json'},body:JSON.stringify(body)}),fetcher,env);
 return{calls,run};
}
Deno.test('Nao ADM nunca usa Auth Admin',async()=>{const s=setup({adm:false});assert((await s.run()).status===403);assert(!s.calls.some(x=>x.includes('/admin/users')));});
Deno.test('Conta preexistente recusada antes de criar',async()=>{const s=setup({reserva:false});assert((await s.run()).status===409);assert(!s.calls.some(x=>x.includes('/admin/users')));});
Deno.test('Cadastro confirma persistencia e nao retorna senha',async()=>{const s=setup();const r=await s.run();const t=await r.text();assert(r.status===200);assert(!t.includes(base.senha)&&!t.includes('server-test'));assert(s.calls.findIndex(x=>x.endsWith('/ve_admin_preparar_cadastro_geral'))<s.calls.findIndex(x=>x.includes('/admin/users')));assert(s.calls.at(-1)?.endsWith('/ve_admin_concluir_cadastro'));});
Deno.test('Retomada reutiliza conta sem redefinir senha',async()=>{const s=setup({existente:true});assert((await s.run()).status===200);assert(!s.calls.some(x=>x.includes('/admin/users')));});
Deno.test('Nova senha exige conta do modulo e senha valida',async()=>{const s=setup({alvo:false});assert((await s.run({acao:'senha',usuario:id,senha:base.senha})).status===403);assert(!s.calls.some(x=>x.includes('/admin/users')));const b=setup();assert((await b.run({...base,senha:'curta'})).status===400);assert(!b.calls.some(x=>x.endsWith('/ve_admin_preparar_cadastro_geral')));});
Deno.test('Nao aceita cadastro sem confirmacao persistida',async()=>{const s=setup({final:false});assert((await s.run()).status===502);});

Deno.test('Preflight aceita os cabecalhos enviados pelo SDK do navegador',async()=>{
 for(const origin of ['https://imposition.ai-ideal.com.br','https://imposicao.pages.dev']){
  const r=await atender(new Request('https://example.invalid',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'apikey,authorization,content-type,x-client-info'}}),(()=>{throw Error('Preflight nao deve acessar Auth ou banco');}) as typeof fetch,env);
  assert(r.status===204);assert(r.headers.get('Access-Control-Allow-Origin')===origin);
  const allowed=(r.headers.get('Access-Control-Allow-Headers')||'').toLowerCase().split(',').map(x=>x.trim());
  for(const h of ['apikey','authorization','content-type','x-client-info'])assert(allowed.includes(h));
 }
});
Deno.test('Origem externa continua sem permissao CORS',async()=>{
 const r=await atender(new Request('https://example.invalid',{method:'OPTIONS',headers:{Origin:'https://example.invalid','Access-Control-Request-Method':'POST'}}),fetch,env);
 assert(!r.headers.has('Access-Control-Allow-Origin'));
});
