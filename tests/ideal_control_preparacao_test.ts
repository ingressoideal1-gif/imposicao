import { conteudoDoIngresso, indiceQr, planejar, POOL_BYTES } from "../supabase/functions/_compartilhado/preparacao_codigos.ts";
import { prepararEvento } from "../supabase/functions/_compartilhado/preparacao_nuvem.ts";
import { hashCodigo } from "../supabase/functions/_compartilhado/hash.ts";
import { usarQrEvento } from "../supabase/functions/_compartilhado/qr_evento.ts";
function assert(v: unknown) { if (!v) throw new Error("Contrato de preparação violado"); }
const fonte = [{id:1000160,quantidade:250,inicio:7,setor:"setor-sintetico",numeracao:{elements:[{type:"QR",prefix:"X",pad:4,suffix:"Z"}]}}];
Deno.test("posição, virada de coluna, início, TICKET e formato iguais à impressão", () => {
 assert(indiceQr(19521,1000160,1) === 1800000);
 assert(indiceQr(20272,1000072,30001) === 0);
 assert(indiceQr(20272,1000022,7) === 1470006);
 const p=planejar(fonte)[0]; assert(conteudoDoIngresso(null,19521,p,1)==="X0008Z");
 const ticket=planejar([{...fonte[0],numeracao:{tipo:"TICKET",ticket_qtd:3,elements:[{type:"QR",ticket_pos:2}]}}])[0];
 assert(ticket.quantidade===250 && conteudoDoIngresso(null,19521,ticket,2)==="14");
 const pool=new Uint8Array(POOL_BYTES);pool.set(new TextEncoder().encode("HM4IKCBY"),indiceQr(20272,1000022,7)*8);
 assert(conteudoDoIngresso(pool,20272,{...p,modelo:1000022,tipo:"QR_IDEAL"},0)==="27202HM4IKCBY");
 let recusou=false;try {planejar([{...fonte[0],setor:null}]);}catch{recusou=true;}assert(recusou);
});

Deno.test("lotes retomáveis só devolvem progresso; QR inválido não acessa fonte nem base", async () => {
 const original=globalThis.fetch, vars=["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY"], before=vars.map(n=>Deno.env.get(n));
 const plano=planejar(fonte), sal="00".repeat(32);let cursor=0, fechado=false, consultas=0;
 try {
  Deno.env.set(vars[0],"https://sintetico.invalid");Deno.env.set(vars[1],"ficticia");
  globalThis.fetch=(async (url:any,opts:any)=>{
   assert(String(url).startsWith("https://sintetico.invalid/"));consultas++;
   let body:any;
   if(String(url).includes("rpc/producao_acesso_ativar_qr_evento"))body=null;
   else if(String(url).includes("producao_acesso_pedidos?"))body=[{pedido_id_int:19521}];
   else if(String(url).endsWith("rpc/producao_acesso_preparar_lote")){
    const c=JSON.parse(opts.body);
    if(c.p_itens){
     assert(c.p_offset===cursor && c.p_itens.length<=100);
     for(const item of c.p_itens){assert(item.numero===cursor+1);assert(item.hash===await hashCodigo(conteudoDoIngresso(null,19521,plano[0],cursor),sal));cursor++;}
     fechado=cursor===250;
    }
    body={concluida:fechado,prontos:cursor,total:250,plano,fonte,sal,fonte_hash:"sintetico"};
   }else throw new Error("Rede inesperada");
   return new Response(JSON.stringify(body));
  }) as typeof fetch;
  const a=await prepararEvento("evento");assert(!a.concluida&&a.prontos===100);
  const b=await prepararEvento("evento");assert(!b.concluida&&b.prontos===200);
  await prepararEvento("evento");const fim=await prepararEvento("evento");
  assert(fim.concluida&&fim.total===250&&Object.keys(fim).length===3);
  const antes=consultas;let recusou=false;
  try {await usarQrEvento({segredo:"ab".repeat(32)},false,true);}catch{recusou=true;}
  assert(recusou&&consultas===antes+1);
 }finally{globalThis.fetch=original;vars.forEach((n,i)=>before[i]===undefined?Deno.env.delete(n):Deno.env.set(n,before[i]!));}
});
