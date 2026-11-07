import assert from "node:assert/strict";
import { handler } from "./index.ts";
function fixture() {
  const env: Record<string,string> = { CHATGURU_DIALOGO_PILOTO_TOKEN: "servico-sintetico", CHATGURU_ENDPOINT: "https://app.zap.guru/api/v1", CHATGURU_KEY: "teste", CHATGURU_ACCOUNT_ID: "teste", CHATGURU_PHONE_ID: "teste", CHATGURU_DEFAULT_DDI: "55" };
  let registro: any = null;
  const c = { chamadas: [] as URLSearchParams[], falhaCampo: false, timeout: false, timeoutDialogo: false, numero: "11999990000", persistencia: true };
  const deps = { env: (k: string) => env[k], db: async (m: string, path: string, body?: any) => {
    if (path.startsWith("pedidos_links_cliente?")) return [{ os_id: "vibe_24880", token: "abc123", arte_pronta_em: "2026-11-07" }];
    if (path.startsWith("propostas?")) return [{ id_contato: "7", id_cliente: 1 }];
    if (path.startsWith("contatos?")) return [{ id: 7, id_cliente: 1, whats: c.numero }];
    if (path.startsWith("rpc/")) { if (registro) return false; registro = { chave: body.p_chave, estado: "preparando" }; return true; }
    if (m === "PATCH") { if (!c.persistencia) return []; registro = { ...registro, ...body }; }
    return registro ? [registro] : [];
  }, fetch: (async (_url: any, op: any) => {
    assert.equal(op.redirect, "error");
    const b = new URLSearchParams(op.body); c.chamadas.push(b);
    if (c.timeout || (c.timeoutDialogo && b.get("action") === "dialog_execute")) throw new Error("segredo-provedor");
    return Response.json(c.falhaCampo ? { result: "error", code: 400 } : { result: "success", code: 200 });
  }) as typeof fetch };
  const executar = (acao: string, confirmacao?: string, auth = "servico-sintetico", pedido = 24880) => handler(new Request("https://local/", { method: "POST", headers: { Authorization: "Bearer jwt-sintetico", "x-piloto-token": auth }, body: JSON.stringify({ acao, pedido, confirmacao }) }), deps);
  const preparar = async () => (await executar("preparar")).json();
  return { c, executar, preparar };
}
Deno.test("diálogo: campo confirmado antes do disparo; repetição e concorrência não duplicam", async () => {
  const f = fixture(), p = await f.preparar();
  assert.equal(f.c.chamadas.length,0);
  await Promise.all(Array.from({length:4},()=>f.executar("enviar",p.confirmacao)));
  assert.deepEqual(f.c.chamadas.map(x=>x.get("action")),["chat_update_custom_fields","dialog_execute"]);
  assert.equal(f.c.chamadas[0].get("field__Link_do_Cliente"),"https://imposition.ai-ideal.com.br/cliente/24880-abc123");
  assert.equal(f.c.chamadas[1].get("dialog_id"),"6aef191d04236cee4e7075c1");
  const s = await (await f.executar("status")).json();
  assert.equal(s.dialogo_executado,true); assert.equal(s.entrega_confirmada,false);
  f.c.numero="11999990001";
  await f.executar("enviar",(await f.preparar()).confirmacao);
  assert.equal(f.c.chamadas.length,2);
});
Deno.test("diálogo: recusa de campo e timeout não executam diálogo nem permitem repetição", async () => {
  for (const tipo of ["falhaCampo","timeout"] as const) {
    const f = fixture(), p = await f.preparar(); f.c[tipo]=true;
    const r = await (await f.executar("enviar",p.confirmacao)).json();
    assert.equal(r.estado,tipo==="timeout"?"desconhecido":"falhou");
    await f.executar("enviar",p.confirmacao);
    assert.equal(f.c.chamadas.length,1);
  }
});
Deno.test("diálogo: autorização técnica, escopo e confirmação obrigatórios", async () => {
  const f=fixture(), p=await f.preparar();
  assert.equal((await f.executar("enviar",p.confirmacao,"anon")).status,403);
  assert.equal((await f.executar("enviar",p.confirmacao,"servico-sintetico",22)).status,422);
  f.c.numero="11999990001";
  assert.equal((await f.executar("enviar",p.confirmacao)).status,409);
  assert.equal(f.c.chamadas.length,0);
});
Deno.test("diálogo: falha de persistência após execução bloqueia novo disparo", async () => {
  const f=fixture(),p=await f.preparar(); f.c.persistencia=false;
  assert.equal((await f.executar("enviar",p.confirmacao)).status,503);
  f.c.persistencia=true;
  await f.executar("enviar",p.confirmacao);
  assert.equal(f.c.chamadas.length,2);
});
Deno.test("diálogo: timeout após salvar campo mantém reserva sem reenviar", async () => {
  const f=fixture(),p=await f.preparar(); f.c.timeoutDialogo=true;
  const r=await (await f.executar("enviar",p.confirmacao)).json();
  assert.equal(r.estado,"desconhecido"); assert.equal(r.etapa,"dialogo");
  assert.equal(r.dialogo_executado,false);
  await f.executar("enviar",p.confirmacao);
  assert.equal(f.c.chamadas.length,2);
});
