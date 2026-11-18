import assert from "node:assert/strict";
import { baixarCdrConferencia } from "./corel_conferencia.ts";

Deno.test("conferência lê a revisão do Drive com o operador e entrega apenas os bytes verificados", async () => {
  const jwt = "Bearer operador-sintetico", bytes = new TextEncoder().encode("cdr de teste");
  const sha = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    b => b.toString(16).padStart(2,"0")).join("");
  const recibo = {id:"arquivo-teste", size:bytes.length, sha256:sha, verified:true};
  const req = new Request("https://example.invalid/?pedido=15&modelo=21&documento=produto-3", {headers:{Authorization:jwt}});
  for (const caso of ["ok", "ausente", "outro modelo", "corrompido", "sem acesso", "pendente"]) {
    const calls:string[] = [];
    const download = baixarCdrConferencia(req, "https://example.invalid", async (url,opts) => {
      const action=String(url).split("/").pop()!;
      calls.push(action);
      const h = new Headers(opts?.headers);
      assert.equal(h.get("authorization"),jwt);assert.equal(h.get("x-document"),"produto-3-coreldraw");
      assert.equal(h.get("x-model"),"21");assert.equal(h.get("x-order"),"15");
      if(action==="latest"){
        if(caso==="sem acesso" || caso==="pendente")return new Response(null,{status:caso==="pendente"?409:403});
        return Response.json(caso==="ausente"?null:{receipt:recibo,metadata:{
          editor:"coreldraw", models:[{id:caso==="outro modelo"?22:21,pedido:15}]}});
      }
      assert.equal(action,"download");assert.equal(h.get("x-file-id"),recibo.id);
      return new Response(caso==="corrompido"?new Uint8Array(bytes.length):bytes,{
        headers:{"x-content-size":String(bytes.length),"x-content-sha256":sha}});
    });
    if(caso==="ok"){
      const response=await download;
      assert.deepEqual(new Uint8Array(await response.arrayBuffer()),bytes);
      assert.match(response.headers.get("Content-Disposition")!,/\.cdr/);
    } else {
      await assert.rejects(download, {status:({"ausente":404,"outro modelo":409,"corrompido":502,"sem acesso":403,"pendente":409} as Record<string,number>)[caso]});
    }
    assert.deepEqual(calls,caso==="ok"||caso==="corrompido"?["latest","download"]:["latest"]);
  }
});
