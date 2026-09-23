// Rotas reais, somente banco sintético. Sem permissão de rede.
Deno.test("faixa e sincronismo sinalizam publicação pendente e concluída sem expor códigos", async () => {
 const originalServe=Deno.serve, originalFetch=globalThis.fetch;
 const E="11111111-1111-4111-8111-111111111111",A="22222222-2222-4222-8222-222222222222";
 const env=["SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY"],before=env.map(n=>Deno.env.get(n));
 let handler:(r:Request)=>Promise<Response>,published=false;
 const assert=(x:unknown)=>{if(!x)throw new Error("Resultado inesperado");};
 try {
  Deno.env.set(env[0],"https://sintetico.invalid");Deno.env.set(env[1],"ficticia");
  Deno.serve=((h:typeof handler)=>{handler=h;return {};}) as typeof Deno.serve;
  globalThis.fetch=((input:any)=>{
   const u=new URL(String(input));assert(u.hostname==="sintetico.invalid");
   const t=u.pathname.split('/').pop();let rows:any[]=[];
   if(t==="producao_acesso_dispositivos")rows=[{id:A,evento_id:E,status:"ativo",nome:"Teste"}];
   else if(t==="producao_acesso_eventos")rows=[{id:E,status:"ativo",nome_evento:"Nome atualizado",data_evento:"2026-10-01T12:00:00Z",local_evento:"Local atualizado",sal:"ab".repeat(32)}];
   else if(t==="producao_acesso_pedidos")rows=[{pedido_id_int:123,publicado_em:published?"2026-09-22T12:00:00Z":null,total_credenciais:published?2:0,sal:"cd".repeat(32)}];
   return Promise.resolve(new Response(JSON.stringify(rows),{headers:{"Content-Range":"*/0"}}));
  }) as typeof fetch;
  await import("../supabase/functions/portaria/index.ts");
  const eventoRes=await handler!(new Request("https://sintetico.invalid/portaria/evento",{headers:{Authorization:"Bearer sintetico"}}));
  const evento=(await eventoRes.json()).evento;
  assert(evento.nome_evento === "Nome atualizado" && !('sal' in evento));
  assert((await handler!(new Request("https://sintetico.invalid/portaria/evento"))).status===401);
  let previous="";
  for(published of [false,true]) {
   let mark="";
   for(const route of ["faixa","sincronizar"]) {
    const res=await handler!(new Request("https://sintetico.invalid/portaria/"+route,{headers:{Authorization:"Bearer sintetico"}}));
    assert(res.status===200);const r=await res.json();
    assert(r.publicacao.concluida===published);
    assert(r.evento.nome === "Nome atualizado" && r.evento.local_evento === "Local atualizado");
    assert(!r.publicacao.versao.includes("sal"));
    if(mark)assert(mark===r.publicacao.versao);mark=r.publicacao.versao;
   }
   if(previous)assert(previous!==mark);previous=mark;
  }
 } finally {Deno.serve=originalServe;globalThis.fetch=originalFetch;env.forEach((n,i)=>before[i]===undefined?Deno.env.delete(n):Deno.env.set(n,before[i]!));}
});
