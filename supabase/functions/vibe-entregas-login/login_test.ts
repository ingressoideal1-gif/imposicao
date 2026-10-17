import { atender } from './index.ts';
import { senhaTecnica } from '../_compartilhado/vibe_pin.ts';
const secret='synthetic-secret-32-characters-only-test';
const env=(n:string)=>({SUPABASE_URL:'https://example.invalid',SUPABASE_ANON_KEY:'anon-test',SUPABASE_SERVICE_ROLE_KEY:'server-test',VIBE_ENTREGAS_PIN_SECRET:secret}[n]);
const assert=(v:unknown)=>{if(!v)throw Error('Contrato PIN');};
function setup({limite=true,auth=true,ativo=true}={}) {
 const calls:string[]=[];
 const fetcher=(async(input:RequestInfo|URL,init?:RequestInit)=>{
  const u=String(input);calls.push(u);const b=JSON.parse(String(init?.body));
  if(u.endsWith('/ve_pin_tentar')){assert(/^[a-f0-9]{64}$/.test(b.p_chave));assert(!JSON.stringify(b).includes('@'));return new Response(JSON.stringify(limite));}
  if(u.includes('/auth/v1/token')){assert(b.password!=='0123'&&b.password.length===68);return new Response(JSON.stringify(auth?{user:{id:'driver'},access_token:'session-test',refresh_token:'refresh-test'}:{}),{status:auth?200:400});}
  if(u.endsWith('/ve_pin_conta_ativa'))return new Response(JSON.stringify(ativo));
  throw Error('Rede inesperada');
 }) as typeof fetch;
 const run=(pin='0123')=>atender(new Request('https://example.invalid',{method:'POST',headers:{Origin:'https://imposition.ai-ideal.com.br','Content-Type':'application/json'},body:JSON.stringify({email:'driver@example.invalid',pin})}),fetcher,env);
 return {run,calls};
}
Deno.test('PIN de quatro digitos inclui zero inicial e gera senha exclusiva',async()=>{
 const a=await senhaTecnica(secret,'Driver@example.invalid','0123');assert(a.length===68);assert(a===await senhaTecnica(secret,'driver@example.invalid','0123'));
 assert(a!==await senhaTecnica(secret,'driver@example.invalid','1234'));assert(a!==await senhaTecnica(secret,'other@example.invalid','0123'));
});
Deno.test('Login libera sessao somente apos Auth e cadastro ativo',async()=>{const s=setup();const r=await s.run();assert(r.status===200);assert(s.calls.length===3);assert(r.headers.get('Cache-Control')==='no-store');const t=await r.text();assert(!t.includes('0123')&&!t.includes(secret)&&!t.includes('server-test'));});
Deno.test('Limite bloqueia antes do Auth',async()=>{const s=setup({limite:false});assert((await s.run()).status===429);assert(s.calls.length===1);});
Deno.test('PIN incorreto nao libera sessao',async()=>{const s=setup({auth:false});const r=await s.run();assert(r.status===401);assert(!(await r.text()).includes('session-test'));assert(s.calls.length===2);});
Deno.test('Conta inativa ou fora do modulo nao libera sessao',async()=>{const r=await setup({ativo:false}).run();assert(r.status===401);assert(!(await r.text()).includes('session-test'));});
Deno.test('Formato invalido nao consulta banco nem Auth',async()=>{for(const pin of ['123','12345','abcd']){const s=setup();assert((await s.run(pin)).status===400);assert(s.calls.length===0);}});
Deno.test('Login aceita preflight SDK e recusa origem externa',async()=>{
 const r=await atender(new Request('https://example.invalid',{method:'OPTIONS',headers:{Origin:'https://imposition.ai-ideal.com.br'}}));assert(r.headers.get('Access-Control-Allow-Headers')?.includes('x-client-info'));
 const x=await atender(new Request('https://example.invalid',{method:'POST',headers:{Origin:'https://evil.invalid'}}));assert(x.status===403&&!x.headers.has('Access-Control-Allow-Origin'));
});
