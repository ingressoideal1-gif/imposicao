// Segredo exclusivo do Vibe; PIN nunca e armazenado nem enviado ao Auth como senha.
export async function codigoPrivado(segredo:string, contexto:string):Promise<string> {
  if(segredo.length<32)throw new Error('Configuracao PIN indisponivel');
  const enc=new TextEncoder();
  const key=await crypto.subtle.importKey('raw',enc.encode(segredo),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(contexto)));
  return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
}
export async function senhaTecnica(segredo:string,email:string,pin:string):Promise<string> {
  if(!/^[0-9]{4}$/.test(pin))throw new Error('Informe exatamente quatro digitos');
  return 'Vi1!'+await codigoPrivado(segredo,'vibe-pin-v1|'+email.trim().toLowerCase()+'|'+pin);
}
