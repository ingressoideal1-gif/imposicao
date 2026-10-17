import { comCors,origemPermitida,respostaDePreflight } from '../_compartilhado/cors.ts';
import { codigoPrivado,senhaTecnica } from '../_compartilhado/vibe_pin.ts';
export async function atender(req:Request,fetcher:typeof fetch=fetch,env=(n:string)=>Deno.env.get(n)) {
  const origem=origemPermitida(req.headers.get('origin'));
  const responder=(body:unknown,status=200)=>comCors(new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}),origem);
  if(req.method==='OPTIONS')return respostaDePreflight(origem,'POST, OPTIONS','authorization,apikey,content-type,x-client-info');
  if(req.headers.has('origin')&&!origem)return responder({erro:'Origem não permitida.'},403);
  if(req.method!=='POST')return responder({erro:'Método não permitido.'},405);
  const url=env('SUPABASE_URL'),anon=env('SUPABASE_ANON_KEY'),service=env('SUPABASE_SERVICE_ROLE_KEY'),secret=env('VIBE_ENTREGAS_PIN_SECRET');
  if(!url||!anon||!service||!secret||secret.length<32)return responder({erro:'Login indisponível.'},503);
  try {
    const raw=await req.text();if(raw.length>2000)return responder({erro:'Solicitação inválida.'},400);
    let body;try{body=JSON.parse(raw);}catch{return responder({erro:'Solicitação inválida.'},400);}
    if(typeof body?.email!=='string'||body.email.length>254||typeof body?.pin!=='string'||!/^[0-9]{4}$/.test(body.pin))return responder({erro:'Informe e-mail e PIN de 4 dígitos.'},400);
    const email=body.email.trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return responder({erro:'Informe e-mail e PIN de 4 dígitos.'},400);
    const rpc=async(nome:string,dados:unknown)=>fetcher(url+'/rest/v1/rpc/'+nome,{method:'POST',headers:{Authorization:'Bearer '+service,apikey:service,'Content-Type':'application/json'},body:JSON.stringify(dados),signal:AbortSignal.timeout(10000)});
    const limite=await rpc('ve_pin_tentar',{p_chave:await codigoPrivado(secret,'vibe-limite-v1|'+email)});
    if(!limite.ok)return responder({erro:'Login indisponível.'},503);
    if(await limite.json()!==true)return responder({erro:'Limite de tentativas atingido. Aguarde 15 minutos antes de tentar novamente.'},429);
    const auth=await fetcher(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:anon,'Content-Type':'application/json'},body:JSON.stringify({email,password:await senhaTecnica(secret,email,body.pin)}),signal:AbortSignal.timeout(15000)});
    if(!auth.ok)return responder({erro:'E-mail ou PIN inválido, ou acesso indisponível.'},401);
    const sessao=await auth.json();if(!sessao.user?.id||!sessao.access_token||!sessao.refresh_token)return responder({erro:'Login não confirmado.'},502);
    const acesso=await rpc('ve_pin_conta_ativa',{p_usuario:sessao.user.id});
    if(!acesso.ok||await acesso.json()!==true)return responder({erro:'E-mail ou PIN inválido, ou acesso indisponível.'},401);
    return responder({access_token:sessao.access_token,refresh_token:sessao.refresh_token});
  }catch{return responder({erro:'Login não confirmado. Tente novamente mais tarde.'},503);}
}
if(import.meta.main)Deno.serve(req=>atender(req));
