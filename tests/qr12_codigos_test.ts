import { conteudoDoIngresso, indiceContrato, POOL_BYTES, PlanoModelo } from "../supabase/functions/_compartilhado/preparacao_codigos.ts";
import { hashCodigo } from "../supabase/functions/_compartilhado/hash.ts";
function assert(v: unknown) { if (!v) throw new Error("Contrato QR12 violado"); }
const c = { pedido:23063, modelo:1001859, versao:2, inicio:7, passo:3, posicao:2,
 quantidade:10, deslocamento:5000, capacidade:30, pool_revisao:"ideal-qr12-1", fonte_hash:"sintetico" };
const plano:PlanoModelo={...c,setor:"sintetico",tipo:"QR_IDEAL",prefix:"",suffix:"",pad:0,qr_contrato:c};
Deno.test("v2 usa 12 caracteres e posição reservada; TICKET preserva células físicas",async()=>{
 const pool=new Uint8Array(POOL_BYTES);pool.set(new TextEncoder().encode("00001389"),5001*8);
 const texto=conteudoDoIngresso(pool,23063,plano,0);
 assert(texto==="958100001389" && texto.length===12 && plano.quantidade===10);
 assert(indiceContrato(23063,1001859,35,c)===5028);
 // Vetor PBKDF2 conferido pelo teste Python, sem sal/código reais.
 assert((await hashCodigo(texto,"00".repeat(32)))==="e4472f0e43ec62851043963352a9927764007f03015a25c0b595fc977715cd29");
 for(const valor of [6,37,3000007]){
  let falhou=false;try{indiceContrato(23063,1001859,valor,c);}catch{falhou=true;}assert(falhou);
 }
});
Deno.test("legado sem contrato persistido mantém conteúdo; versão desconhecida recusa",()=>{
 const pool=new Uint8Array(POOL_BYTES);pool.fill(65);
 assert(conteudoDoIngresso(pool,23063,{...plano,qr_contrato:undefined},0)==="36032AAAAAAAA");
 let falhou=false;try{conteudoDoIngresso(pool,23063,{...plano,qr_contrato:{...c,versao:3}},0);}catch{falhou=true;}assert(falhou);
});
