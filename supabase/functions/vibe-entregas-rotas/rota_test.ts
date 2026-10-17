import { preparar, interpretar, GRAFICA } from './rota.ts';
import { atender } from './index.ts';
const ok=(v:unknown)=>{if(!v)throw new Error('Falha de verificacao');};
const paradas=[{chave:'a',pedido:1,endereco:'Rua A, 1'},{chave:'b',pedido:2,endereco:'Rua B, 2'},{chave:'c',pedido:3,endereco:'Rua C, 3'}];
const entrada={pedidos:['a','b','c'],origem:'grafica',retorno:true,modo:'DRIVE',ultima:'c'};
Deno.test('Reordena indices, preserva fim fixo e retorno grafica',()=>{
 const plano=preparar(entrada,paradas);ok(plano.corpo.destination.address===GRAFICA);
 const r=interpretar({routes:[{optimizedIntermediateWaypointIndex:[2,0,1],distanceMeters:900,duration:'200s'}]},plano);ok(r.paradas.map(p=>p.chave).join()==='c,a,b');
 const aberto=preparar({...entrada,retorno:false},paradas);ok(aberto.corpo.destination.address==='Rua C, 3');
 ok(interpretar({routes:[{optimizedIntermediateWaypointIndex:[1,0],distanceMeters:100,duration:'10s'}]},aberto).paradas.map(p=>p.chave).join()==='b,a,c');
});
Deno.test('Rejeita localizacao invalida e indices duplicados',()=>{
 let erros=0;try{preparar({...entrada,origem:'atual',localizacao:{latitude:NaN,longitude:0}},paradas);}catch{erros++;}
 try{interpretar({routes:[{optimizedIntermediateWaypointIndex:[1,1,0],distanceMeters:100,duration:'10s'}]},preparar(entrada,paradas));}catch{erros++;}ok(erros===2);
});
Deno.test('Desativada nao faz chamadas de rede',async()=>{
 const r=await atender(new Request('http://local',{method:'POST'}),(()=>{throw new Error('rede inesperada');}) as typeof fetch,()=>undefined);ok(r.status===503);
});
Deno.test('Sem sessao ou reserva recusada nunca chama Google',async()=>{
 const env=(n:string)=>({VIBE_ROUTES_ENABLED:'true',GOOGLE_ROUTES_API_KEY:'fake',SUPABASE_URL:'http://db',SUPABASE_ANON_KEY:'fake',SUPABASE_SERVICE_ROLE_KEY:'fake'}[n]);
 const noauth=await atender(new Request('http://local',{method:'POST'}),fetch,env);ok(noauth.status===401);
 let calls=0;const mock=(async(url:string)=>{calls++;return new Response(JSON.stringify(url.endsWith('/user')?{id:'user'}:{}),{status:url.endsWith('/user')?200:403});}) as typeof fetch;
 const id='00000000-0000-0000-0000-000000000001';
 const r=await atender(new Request('http://local',{method:'POST',headers:{Authorization:'Bearer fake'},body:JSON.stringify({...entrada,id,pedidos:[id],ultima:id})}),mock,env);ok(r.status===409&&calls===2);
});
Deno.test('Google somente apos reserva; chave nao aparece no retorno',async()=>{
 const env=(n:string)=>({VIBE_ROUTES_ENABLED:'true',GOOGLE_ROUTES_API_KEY:'google-secret-test',SUPABASE_URL:'http://db',SUPABASE_ANON_KEY:'fake',SUPABASE_SERVICE_ROLE_KEY:'fake'}[n]);
 const id='00000000-0000-0000-0000-000000000001',passos:string[]=[];
 const mock=(async(url:string,opts:RequestInit)=>{passos.push(url);let body:unknown=true;
 if(url.endsWith('/user'))body={id:'user'};
 if(url.endsWith('ve_rota_reservar'))body=[{chave:id,pedido:1,endereco:'Rua A,1'}];
 if(url.includes('googleapis')){ok((opts.headers as Record<string,string>)['X-Goog-Api-Key']==='google-secret-test');body={routes:[{distanceMeters:1000,duration:'600s'}]};}
 return new Response(JSON.stringify(body));}) as typeof fetch;
 const r=await atender(new Request('http://local',{method:'POST',headers:{Authorization:'Bearer fake'},body:JSON.stringify({...entrada,id,pedidos:[id],ultima:id})}),mock,env);
 ok(r.status===200&&passos.length===4);ok(!(await r.text()).includes('google-secret-test'));
});
