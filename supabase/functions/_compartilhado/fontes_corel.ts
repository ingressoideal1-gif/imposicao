import { banco } from "./banco.ts";
import { Recusa } from "./sessao.ts";
import { lerFonteDesktop, LIMITE_FONTE } from "./fonte_desktop.ts";
const BUCKET = "imposition-fontes-corel";
type Identity = {id:string; permissoes:Record<string,unknown>|null};
type Store = (method:string,path:string,body?:unknown)=>Promise<any>;
async function storage(method:string,path:string,body?:unknown) {
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const binary=body instanceof Uint8Array;
  const response=await fetch(`${Deno.env.get("SUPABASE_URL")}/storage/v1/${path}`,{
    method,headers:{Authorization:`Bearer ${key}`,apikey:key,
      "Content-Type":binary?"application/octet-stream":"application/json",
      ...(binary?{"x-upsert":"true"}:{})},
    body:body===undefined?undefined:binary?body as BodyInit:JSON.stringify(body)});
  if(!response.ok)throw new Recusa(503,"Biblioteca de fontes indisponivel.");
  return await response.json();
}
export async function operarFontesCorel(action:string,input:any,who:Identity,db:typeof banco=banco,store:Store=storage) {
  const p=who.permissoes;
  if(!p || !["admin","gerente","designer","atendimento"].includes(String(p.role||"").toLowerCase()) || p.perm_fontes_view===false)
    throw new Recusa(403,"Biblioteca de fontes restrita a equipe interna.");
  if(!input||typeof input!=="object"||Array.isArray(input))throw new Recusa(422,"Parametros invalidos.");
  if(action==="listar") {
    const offset=Number(input.offset||0);
    if(!Number.isSafeInteger(offset)||offset<0)throw new Recusa(422,"Pagina invalida.");
    return {fontes:await db("GET",`imposition_fontes_corel?select=sha256,nome,familia,estilo,versao,postscript,extensao,tamanho,criado_em&order=sha256.asc&limit=200&offset=${offset}`)};
  }
  if(action==="baixar") {
    if(!/^[a-f0-9]{64}$/.test(input.sha256||""))throw new Recusa(422,"Fonte invalida.");
    const rows=await db("GET",`imposition_fontes_corel?sha256=eq.${input.sha256}&select=*&limit=2`);
    if(!Array.isArray(rows)||rows.length!==1)throw new Recusa(404,"Fonte nao cadastrada.");
    const row=rows[0], path=`${row.sha256}.${row.extensao}`;
    if(!["ttf","otf"].includes(row.extensao))throw new Recusa(503,"Formato nao confirmado.");
    const signed=await store("POST",`object/sign/${BUCKET}/${path}`,{expiresIn:60});
    if(typeof signed.signedURL!=="string"||!signed.signedURL.startsWith(`/object/sign/${BUCKET}/${path}?`))
      throw new Recusa(503,"Link de fonte nao confirmado.");
    return {sha256:row.sha256,tamanho:row.tamanho,extensao:row.extensao,nome:row.nome,
      url:Deno.env.get("SUPABASE_URL")+"/storage/v1"+signed.signedURL};
  }
  if(action!=="salvar")throw new Recusa(404,"Acao inexistente.");
  if(p.perm_fontes_edit!==true)throw new Recusa(403,"Sem permissao para cadastrar fontes.");
  if(input.licenca_confirmada!==true)throw new Recusa(422,"Confirme a permissao de distribuir esta fonte entre as estacoes.");
  if(typeof input.arquivo!=="string"||input.arquivo.length>4*Math.ceil(LIMITE_FONTE/3))throw new Recusa(422,"Fonte excede 10 MiB.");
  let bytes:Uint8Array, meta:ReturnType<typeof lerFonteDesktop>;
  try {bytes=Uint8Array.from(atob(input.arquivo),c=>c.charCodeAt(0));meta=lerFonteDesktop(bytes);}
  catch {throw new Recusa(422,"Use uma fonte TTF/OTF valida, ate 10 MiB. Colecoes TTC e fontes web nao sao aceitas.");}
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new Uint8Array(bytes).buffer)),b=>b.toString(16).padStart(2,"0")).join("");
  const existing=await db("GET",`imposition_fontes_corel?sha256=eq.${sha}&select=sha256&limit=1`);
  if(existing?.length===1)return {ok:true,sha256:sha,inalterado:true};
  // Endereco por hash: um mesmo nome nunca sobrescreve outra versao/binario.
  await store("POST",`object/${BUCKET}/${sha}.${meta.extensao}`,bytes);
  const saved=await db("POST","rpc/imposition_registrar_fonte_corel",{
    p_dados:{...meta,sha256:sha,tamanho:bytes.length,criado_por:who.id,
      licenca_confirmada:true,licenca_nota:String(input.licenca_nota||"").slice(0,1000)}});
  if(!Array.isArray(saved)||saved.length!==1||saved[0].sha256!==sha)throw new Recusa(503,"Cadastro da fonte nao confirmado.");
  return {ok:true,sha256:sha,inalterado:false};
}
