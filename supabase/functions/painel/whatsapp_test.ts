import assert from "node:assert/strict";
Deno.test("painel/whatsapp: rota autenticada, CORS e no-store", async () => {
  const servir = Deno.serve, buscar = globalThis.fetch, ambiente = Deno.env.get;
  let handler!: (req: Request) => Promise<Response>;
  let permitido = true;
  const vars: Record<string, string> = { SUPABASE_URL: "https://banco.example", SUPABASE_SERVICE_ROLE_KEY: "sintetica",
    CHATGURU_ENDPOINT: "https://s1.chatguru.app/api/v1", CHATGURU_KEY: "sintetica", CHATGURU_ACCOUNT_ID: "conta", CHATGURU_PHONE_ID: "telefone", CHATGURU_DEFAULT_DDI: "55" };
  try {
    Deno.serve = ((fn: typeof handler) => { handler = fn; return {}; }) as unknown as typeof Deno.serve;
    Deno.env.get = k => vars[k];
    globalThis.fetch = (async (url, opts) => {
      assert.equal(opts?.method, "GET");
      const s = String(url);
      if (s.includes("imposition_user_permissions?")) return Response.json([{ perm_lista_arte_view: permitido }]);
      if (s.includes("pedidos_links_cliente?")) return Response.json([{ numero_pedido: 11, token: "abc123", arte_pronta_em: "2026-11-06T12:00:00Z" }]);
      if (s.includes("propostas?")) return Response.json([{ id_cliente: 1, id_contato: "7" }]);
      if (s.includes("contatos?")) return Response.json([{ id_cliente: 1, nome_contato: "Exemplo", whats: "11999990000" }]);
      if (s.includes("imposition_whatsapp_artes?")) return Response.json([]);
      throw new Error("Chamada inesperada");
    }) as typeof fetch;
    await import("./index.ts");
    const jwt = "cabecalho." + btoa(JSON.stringify({ sub: "usuario-sintetico" })) + ".assinatura";
    const req = (method = "POST", token = jwt) => new Request("https://funcao.example/functions/v1/painel/api/whatsapp-artes/preparar", {
      method, headers: { Origin: "https://imposition.ai-ideal.com.br", Authorization: token ? "Bearer " + token : "", "Content-Type": "application/json" },
      body: method === "POST" ? JSON.stringify({ os_id: "vibe_11" }) : undefined
    });
    assert.equal((await handler(req("POST", ""))).status, 401);
    assert.equal((await handler(req("GET"))).status, 405);
    const ok = await handler(req());
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("Cache-Control"), "no-store");
    assert.equal(ok.headers.get("Access-Control-Allow-Origin"), "https://imposition.ai-ideal.com.br");
    const data = await ok.json(); assert.equal(data.estado, "novo");
    assert.ok(!JSON.stringify(data).includes("sintetica"));
    permitido = false; assert.equal((await handler(req())).status, 403);
  } finally { Deno.serve = servir; globalThis.fetch = buscar; Deno.env.get = ambiente; }
});
