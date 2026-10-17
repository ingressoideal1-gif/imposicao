import { comCors, origemPermitida, respostaDePreflight } from '../_compartilhado/cors.ts';
import { preparar, interpretar } from './rota.ts';

export async function atender(req: Request, fetcher: typeof fetch = fetch, env = (n:string)=>Deno.env.get(n)) {
  const origem=origemPermitida(req.headers.get('origin'));
  const resposta=(body:unknown,status=200)=>comCors(new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}),origem);
  if(req.method==='OPTIONS')return respostaDePreflight(origem,'POST, OPTIONS','authorization,content-type,apikey');
  if(req.headers.has('origin')&&!origem)return resposta({erro:'Origem não permitida.'},403);
  if(req.method!=='POST')return resposta({erro:'Método não permitido.'},405);
  // Nao realiza chamadas pagas antes da ativacao explicita no servidor.
  const key=env('GOOGLE_ROUTES_API_KEY');
  if(env('VIBE_ROUTES_ENABLED')!=='true'||!key)return resposta({erro:'Otimização de rotas ainda não ativada.'},503);
  const url=env('SUPABASE_URL'),anon=env('SUPABASE_ANON_KEY'),service=env('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!anon||!service)return resposta({erro:'Integração indisponível.'},503);
  const token=req.headers.get('Authorization')||'';
  if(!token.startsWith('Bearer '))return resposta({erro:'Entre com sua conta.'},401);
  try {
    const auth=await fetcher(url+'/auth/v1/user',{headers:{Authorization:token,apikey:anon},signal:AbortSignal.timeout(10000)});
    if(!auth.ok)return resposta({erro:'Sessão inválida.'},401);
    const user=await auth.json();if(!user.id)return resposta({erro:'Sessão inválida.'},401);
    const raw=await req.text();if(raw.length>12000)return resposta({erro:'Solicitação muito grande.'},413);
    let entrada;try{entrada=JSON.parse(raw);}catch{return resposta({erro:'Solicitação inválida.'},400);}
    const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if(!uuid.test(entrada.id)||!Array.isArray(entrada.pedidos)||entrada.pedidos.some((p:unknown)=>typeof p!=='string'||!uuid.test(p)))return resposta({erro:'Pedidos inválidos.'},400);
    try{preparar(entrada,entrada.pedidos.map((chave:string)=>({chave,pedido:0,endereco:'validar'})));}catch(e){return resposta({erro:(e as Error).message},400);}
    const rpc=async(nome:string,body:unknown,privado=false)=>fetcher(url+'/rest/v1/rpc/'+nome,{method:'POST',headers:{Authorization:privado?'Bearer '+service:token,apikey:privado?service:anon,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
    const reserva=await rpc('ve_rota_reservar',{p_id:entrada.id,p_pedidos:entrada.pedidos});
    if(!reserva.ok)return resposta({erro:'Confira os pedidos, os endereços e o limite diário de cálculos.'},409);
    const paradas=await reserva.json(),plano=preparar(entrada,paradas);
    const google=await fetcher('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'routes.optimizedIntermediateWaypointIndex,routes.distanceMeters,routes.duration,routes.warnings'},body:JSON.stringify(plano.corpo),signal:AbortSignal.timeout(20000)});
    if(!google.ok)return resposta({erro:'Não foi possível calcular a rota. Tente novamente mais tarde.'},502);
    const resultado=interpretar(await google.json(),plano);
    const gravado=await rpc('ve_rota_resultado',{p_id:entrada.id,p_usuario:user.id,p_ordem:resultado.paradas.map(p=>p.chave),p_retorno:entrada.retorno},true);
    if(!gravado.ok||await gravado.json()!==true)return resposta({erro:'A sequência não foi registrada. Calcule novamente antes de iniciar.'},502);
    return resposta({id:entrada.id,...resultado});
  } catch { return resposta({erro:'Serviço de rotas indisponível. Nenhuma rota foi iniciada.'},502); }
}
if(import.meta.main)Deno.serve(req=>atender(req));
