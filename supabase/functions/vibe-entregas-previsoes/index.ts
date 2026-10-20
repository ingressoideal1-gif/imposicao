import { comCors, origemPermitida, respostaDePreflight } from '../_compartilhado/cors.ts';

type Parada={chave:string;pedido:number;endereco:string;modalidade?:string};
type Contexto={id:string;revisao:number;origem:string;paradas:Parada[];agora:string;pendente:boolean};
export function agrupar(paradas:Parada[]){
 const grupos:Parada[][]=[];
 for(const p of paradas){const ultimo=grupos.at(-1);if(['veppo','aereo'].includes(p.modalidade||'')&&ultimo&&ultimo[0].modalidade===p.modalidade&&ultimo[0].endereco===p.endereco)ultimo.push(p);else grupos.push([p]);}
 return grupos;
}
export function previsoes(ctx:Contexto, dados:any){
 const pernas=dados?.routes?.[0]?.legs,grupos=agrupar(ctx.paradas);
 if(!Array.isArray(pernas)||pernas.length!==grupos.length)throw Error('Trajeto incompleto.');
 let acumulado=0;const inicio=Date.parse(ctx.agora),resultado:Record<string,string>={};
 if(!Number.isFinite(inicio))throw Error('Horário indisponível.');
 pernas.forEach((p:any,i:number)=>{
  const raw=p?.duration;if(typeof raw!=='string'||!/^\d+(\.\d+)?s$/.test(raw))throw Error('Tempo de deslocamento indisponível.');
  const segundos=Number(raw.slice(0,-1));if(!Number.isFinite(segundos)||segundos<0)throw Error('Tempo inválido.');
  acumulado+=segundos+(i>0?300:0);
  if(acumulado>7*86400)throw Error('Rota excede sete dias.');
  for(const parada of grupos[i])resultado[parada.chave]=new Date(inicio+Math.max(60,acumulado)*1000).toISOString();
 });return resultado;
}
export async function atender(req:Request, fetcher:typeof fetch=fetch,env=(n:string)=>Deno.env.get(n)){
 const origem=origemPermitida(req.headers.get('origin'));
 const resposta=(body:unknown,status=200)=>comCors(new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}}),origem);
 if(req.method==='OPTIONS')return respostaDePreflight(origem,'POST, OPTIONS','authorization,content-type,apikey,x-client-info');
 if(req.headers.has('origin')&&!origem)return resposta({erro:'Origem não permitida.'},403);
 if(req.method!=='POST')return resposta({erro:'Método não permitido.'},405);
 const url=env('SUPABASE_URL'),anon=env('SUPABASE_ANON_KEY'),service=env('SUPABASE_SERVICE_ROLE_KEY'),key=env('GOOGLE_ROUTES_API_KEY');
 if(!url||!anon||!service)return resposta({erro:'Integração indisponível.'},503);
 const token=req.headers.get('Authorization')||'';if(!token.startsWith('Bearer '))return resposta({erro:'Entre novamente.'},401);
 try{
  const raw=await req.text();if(raw.length>2000)return resposta({erro:'Solicitação inválida.'},400);
  let entrada;try{entrada=JSON.parse(raw);}catch{return resposta({erro:'Solicitação inválida.'},400);}
  if(!entrada||typeof entrada!=='object'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entrada.id)||!['prever','iniciar','atualizar'].includes(entrada.acao))return resposta({erro:'Rota ou ação inválida.'},400);
  const auth=await fetcher(url+'/auth/v1/user',{headers:{Authorization:token,apikey:anon},signal:AbortSignal.timeout(10000)});
  if(!auth.ok)return resposta({erro:'Sessão inválida.'},401);const user=await auth.json();if(!user.id)return resposta({erro:'Sessão inválida.'},401);
  const rpc=(nome:string,body:unknown,privado=false)=>fetcher(url+'/rest/v1/rpc/'+nome,{method:'POST',headers:{Authorization:privado?'Bearer '+service:token,apikey:privado?service:anon,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  const contexto=await rpc('ve_previsao_contexto',{p_id:entrada.id,p_iniciar:entrada.acao!=='atualizar'});
  if(!contexto.ok)return resposta({erro:'Rota alterada ou acesso não permitido. Atualize a consulta.'},409);
  const ctx:Contexto=await contexto.json();
  if(entrada.acao==='atualizar'&&!ctx.pendente)return resposta({confirmado:true,atualizado:true});
  if(!Array.isArray(ctx.paradas)||ctx.paradas.length>20||!ctx.paradas.length)return resposta({erro:'Confira as paradas pendentes.'},409);
  if(!key||env('VIBE_ROUTES_ENABLED')!=='true')return resposta({erro:'Previsão automática ainda não ativada no servidor.'},503);
  if(!ctx.origem||ctx.paradas.some(p=>!p.endereco))return resposta({erro:'Confira os endereços completos dos pedidos no ERP.'},422);
  const paradas=agrupar(ctx.paradas).map(g=>g[0]);const google=await fetcher('https://routes.googleapis.com/directions/v2:computeRoutes',{method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'routes.legs.duration'},body:JSON.stringify({origin:{address:ctx.origem},destination:{address:paradas.at(-1)!.endereco},intermediates:paradas.slice(0,-1).map(p=>({address:p.endereco})),travelMode:'DRIVE',routingPreference:'TRAFFIC_AWARE',optimizeWaypointOrder:false,languageCode:'pt-BR',regionCode:'BR'}),signal:AbortSignal.timeout(20000)});
  if(!google.ok)return resposta({erro:'Google Maps indisponível para calcular os prazos. Tente novamente.'},502);
  const estimativas=previsoes(ctx,await google.json());
  if(entrada.acao==='prever')return resposta({confirmado:true,previsoes:estimativas,calculado_em:ctx.agora});
  const salvo=await rpc('ve_previsao_aplicar',{p_id:ctx.id,p_usuario:user.id,p_revisao:ctx.revisao,p_ordem:ctx.paradas.map(p=>p.chave),p_previsoes:estimativas,p_iniciar:entrada.acao==='iniciar'},true);
  if(!salvo.ok)return resposta({erro:'A rota mudou ou os prazos expiraram. Atualize e tente novamente.'},409);
  const data=await salvo.json();if(data?.confirmado!==true)return resposta({erro:'Previsões não confirmadas pelo servidor.'},502);
  return resposta({...data,previsoes:estimativas});
 }catch{return resposta({erro:'Não foi possível atualizar as previsões. Tente novamente.'},502);}
}
if(import.meta.main)Deno.serve(req=>atender(req));
