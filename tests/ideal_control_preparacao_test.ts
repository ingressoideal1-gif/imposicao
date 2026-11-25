import { conteudoDoIngresso, indiceQr, planejar, POOL_BYTES, sequenciaDoContrato, sequenciaDoIngresso } from "../supabase/functions/_compartilhado/preparacao_codigos.ts";
import { prepararEvento } from "../supabase/functions/_compartilhado/preparacao_nuvem.ts";
import { hashCodigo } from "../supabase/functions/_compartilhado/hash.ts";
import { usarQrEvento } from "../supabase/functions/_compartilhado/qr_evento.ts";
function assert(v: unknown) { if (!v) throw new Error("Contrato de preparação violado"); }
const fonte = [{id:1000160,quantidade:250,inicio:7,setor:"setor-sintetico",numeracao:{elements:[{type:"QR",prefix:"X",pad:4,suffix:"Z"}]}}];
const ticketDuasVias = [{
  ...fonte[0], inicio: 1, quantidade: 75,
  numeracao: { tipo: "TICKET", ticket_qtd: 2, elements: [
    { type: "QR", ticket_pos: 2, pad: 4 },
    { type: "QR", ticket_pos: 1, pad: 4 },
    { type: "BARCODE", ticket_pos: 2, pad: 4 },
    { type: "QR", source: "database", ticket_pos: 2 },
  ] },
}];

Deno.test("Ticket convencional publica cada via legível e conserva os ordinais da via já usada", () => {
  const [plano] = planejar(ticketDuasVias);
  assert(plano.quantidade === 150);
  const codigo = (indice: number) => conteudoDoIngresso(null, 123, plano, indice);
  assert(codigo(0) === "0002" && codigo(74) === "0150");
  assert(codigo(75) === "0001" && codigo(149) === "0149");
  const [ideal] = planejar([{
    ...ticketDuasVias[0], numeracao: { ...ticketDuasVias[0].numeracao, elements: [
      ...ticketDuasVias[0].numeracao.elements, { type: "QR_IDEAL", ticket_pos: 1 },
    ] },
  }]);
  assert(ideal.tipo === "QR_IDEAL" && ideal.quantidade === 75 && ideal.vias === undefined);
});

Deno.test("QR Ideal TICKET: mil células geram duas mil identidades QR12 nas vias configuradas", () => {
  const [plano] = planejar([{
    ...ticketDuasVias[0], quantidade: 1000,
    numeracao: { ...ticketDuasVias[0].numeracao, elements: [
      { type: "QR_IDEAL", ticket_pos: 2 },
      { type: "QR_IDEAL" },
      { type: "QR_IDEAL", ticket_pos: 2 },
      { type: "QR", ticket_pos: 1 },
    ] },
  }]);
  const c = {
    pedido: 123, modelo: plano.modelo, versao: 2, inicio: 1, passo: 2, posicao: 1, posicoes: [1, 2],
    quantidade: 1000, deslocamento: 50, capacidade: 2000, pool_revisao: "ideal-qr12-1", fonte_hash: "teste",
  };
  assert(plano.quantidade === 2000 && plano.vias?.map(v => v.posicao).join(",") === "1,2");
  const contrato = { ...plano, ...sequenciaDoContrato(c), qr_contrato: c };
  const pool = new Uint8Array(POOL_BYTES);
  const encoder = new TextEncoder();
  for (let i = 0; i < c.capacidade; i++) {
    pool.set(encoder.encode(String(i).padStart(8, "0")), (c.deslocamento + i) * 8);
  }
  const valores = [0, 999, 1000, 1999].map(i => sequenciaDoIngresso(contrato, i).valor);
  assert(valores.join(",") === "1,1999,2,2000");
  const codigos = Array.from({ length: contrato.quantidade }, (_, i) =>
    conteudoDoIngresso(pool, c.pedido, contrato, i));
  assert(codigos.every(codigo => codigo.length === 12) && new Set(codigos).size === 2000);
});
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
 const plano=planejar(ticketDuasVias), sal="00".repeat(32);let cursor=0, fechado=false, consultas=0;
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
     fechado=cursor===150;
    }
    body={concluida:fechado,prontos:cursor,total:150,plano,fonte:ticketDuasVias,sal,fonte_hash:"sintetico"};
   }else throw new Error("Rede inesperada");
   return new Response(JSON.stringify(body));
  }) as typeof fetch;
  const a=await prepararEvento("evento");assert(!a.concluida&&a.prontos===100);
  const b=await prepararEvento("evento");assert(!b.concluida&&b.prontos===150);
  const fim=await prepararEvento("evento");
  assert(fim.concluida&&fim.total===150&&Object.keys(fim).length===3);
  const antes=consultas;let recusou=false;
  try {await usarQrEvento({segredo:"ab".repeat(32)},false,true);}catch{recusou=true;}
  assert(recusou&&consultas===antes+1);
 }finally{globalThis.fetch=original;vars.forEach((n,i)=>before[i]===undefined?Deno.env.delete(n):Deno.env.set(n,before[i]!));}
});
