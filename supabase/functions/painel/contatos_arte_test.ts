import assert from "node:assert/strict";
Deno.test("painel/contatos: sessão, leitura, edição e no-store", async () => {
  const servir = Deno.serve, buscar = globalThis.fetch, ambiente = Deno.env.get;
  let handler!: (req: Request) => Promise<Response>;
  let editar = false, ler = true, gravacoes = 0;
  try {
    Deno.serve = ((fn: typeof handler) => { handler = fn; return {}; }) as unknown as typeof Deno.serve;
    Deno.env.get = k => ({ SUPABASE_URL: "https://banco.example", SUPABASE_SERVICE_ROLE_KEY: "sintetica" })[k];
    globalThis.fetch = (async (url, opts) => {
      const s = String(url);
      if (s.includes("imposition_user_permissions?")) return Response.json([{ perm_lista_arte_view: ler, perm_lista_arte_edit: editar }]);
      if (s.includes("rpc/imposition_arte_guru_ler")) return Response.json([{ pedido: 11, contato_id: "guru#"+"a".repeat(24), nome: "Anterior", whatsapp: "11999990000", valido: true,opcoes:[],revisao:"b".repeat(32) }]);
      if (s.includes("rpc/imposition_arte_guru_selecionar")) {
        gravacoes++; assert.equal(opts?.method, "POST");
        return Response.json([{ pedido: 11, contato_id: "guru#"+"a".repeat(24), nome: "Novo", whatsapp: "1188880000", valido: true,opcoes:[],revisao:"b".repeat(32) }]);
      }
      throw new Error("Chamada inesperada");
    }) as typeof fetch;
    await import("./index.ts");
    const jwt = "cabecalho." + btoa(JSON.stringify({ sub: "operador" })) + ".assinatura";
    const req = (acao = "consultar", token = jwt) => new Request("https://funcao.example/functions/v1/painel/api/contatos-arte/" + acao, {
      method: "POST", headers: { Origin: "https://imposition.ai-ideal.com.br", Authorization: token ? "Bearer " + token : "", "Content-Type": "application/json" },
      body: JSON.stringify(acao === "consultar" ? { pedidos: [11] } : { pedido: 11, contato_id: "guru#"+"a".repeat(24), revisao:"b".repeat(32) })
    });
    assert.equal((await handler(req("consultar", ""))).status, 401);
    const r = await handler(req()); assert.equal(r.status, 200); assert.equal(r.headers.get("Cache-Control"), "no-store");
    assert.equal((await handler(req("selecionar"))).status, 403); assert.equal(gravacoes, 0);
    editar = true; assert.equal((await handler(req("selecionar"))).status, 200); assert.equal(gravacoes, 1);
    ler = false; assert.equal((await handler(req())).status, 403);
  } finally { Deno.serve = servir; globalThis.fetch = buscar; Deno.env.get = ambiente; }
});
