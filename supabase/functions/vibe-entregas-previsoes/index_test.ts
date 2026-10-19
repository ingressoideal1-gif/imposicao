import { atender, previsoes } from './index.ts';
function check(ok:unknown){if(!ok)throw Error('Assertion failed');}
const id='00000000-0000-0000-0000-000000000001';
const ctx={id,revisao:1,origem:'Origem teste',agora:'2026-10-19T12:00:00Z',pendente:true,paradas:[{chave:'a',pedido:1,endereco:'Destino A'},{chave:'b',pedido:2,endereco:'Destino B'}]};
Deno.test('Duracoes acumuladas, servico entre paradas e resposta incompleta',()=>{
 const r=previsoes(ctx,{routes:[{legs:[{duration:'600s'},{duration:'1200s'}]}]});
 check(r.a==='2026-10-19T12:10:00.000Z');check(r.b==='2026-10-19T12:35:00.000Z');
 for(const legs of [[],[{duration:'bad'},{duration:'10s'}]]){let falhou=false;try{previsoes(ctx,{routes:[{legs}]});}catch{falhou=true;}check(falhou);}
});
for(const modo of ['prever','iniciar','atualizar','negado','google-falha','desativado','conflito'])Deno.test('Fluxo simulado '+modo,async()=>{
 const calls:string[]=[];
 const env=(n:string)=>({SUPABASE_URL:'https://teste.invalid',SUPABASE_ANON_KEY:'anon-teste',SUPABASE_SERVICE_ROLE_KEY:'service-teste',GOOGLE_ROUTES_API_KEY:'google-teste',VIBE_ROUTES_ENABLED:modo==='desativado'?'false':'true'}[n]);
 const fetcher:typeof fetch=async(input,init)=>{
  const url=String(input);calls.push(url);
  if(url.endsWith('/user'))return Response.json({id});
  if(url.endsWith('/ve_previsao_contexto'))return Response.json(ctx,{status:modo==='negado'?403:200});
  if(url.includes('googleapis')){const b=JSON.parse(String(init?.body));check(b.origin.address===ctx.origem);check(b.destination.address==='Destino B');check(b.intermediates.length===1);return Response.json({routes:[{legs:[{duration:'600s'},{duration:'1200s'}]}]},{status:modo==='google-falha'?503:200});}
  if(url.endsWith('/ve_previsao_aplicar')){const b=JSON.parse(String(init?.body));check(b.p_revisao===1);check(b.p_usuario===id);check(b.p_ordem.join(',')==='a,b');check(new Headers(init?.headers).get('Authorization')==='Bearer service-teste');return Response.json({confirmado:true,iniciada_em:ctx.agora},{status:modo==='conflito'?409:200});}
  throw Error('Unexpected request');
 };
 const acao=['prever','iniciar'].includes(modo)?modo:'atualizar';
 const r=await atender(new Request('https://teste.invalid',{method:'POST',headers:{Authorization:'Bearer user-teste'},body:JSON.stringify({id,acao})}),fetcher,env);
 check(r.status===({negado:409,'google-falha':502,desativado:503,conflito:409}[modo]||200));
 if(['negado','desativado'].includes(modo))check(!calls.some(x=>x.includes('googleapis')));
 if(['prever','negado','desativado','google-falha'].includes(modo))check(!calls.some(x=>x.endsWith('/ve_previsao_aplicar')));
});
