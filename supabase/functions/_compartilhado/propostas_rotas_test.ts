/** Exercita as rotas integradas sem sockets, banco ou identidades reais. */
import { strict as assert } from "node:assert";

Deno.test("propostas/fundo: painel e estacao preservam autenticacao e coexistem com bancos", async () => {
  const serve = Deno.serve, fetchOriginal = globalThis.fetch, env = Deno.env.get;
  let handler!: (req: Request) => Promise<Response>;
  let permissoes: Record<string, unknown> = { perm_pedidos_view: true, perm_admin_edit: true, role: "admin" };
  let consultas = 0;
  const vars: Record<string, string> = { SUPABASE_URL: "https://banco.example", SUPABASE_SERVICE_ROLE_KEY: "sintetica", ACESSO_AGENTE_SEGREDO: "segredo-sintetico" };
  const jwt = "cabecalho." + btoa(JSON.stringify({ sub: "usuario-teste", email: "operador@example.com" })) + ".assinatura";
  try {
    Deno.serve = ((fn: typeof handler) => { handler = fn; return {}; }) as unknown as typeof Deno.serve;
    Deno.env.get = nome => vars[nome];
    globalThis.fetch = (async (input, opcoes) => {
      consultas++;
      const url = String(input);
      if (url.includes("imposition_user_permissions?")) return Response.json([permissoes]);
      if (url.includes("imposition_acessos_locais?")) return Response.json([{ role: "admin", permissoes }]);
      if (url.includes("/propostas?")) { assert.equal(opcoes?.method, "GET"); return Response.json([{ id_int: 11 }]); }
      if (url.endsWith("/rpc/remover_fundo_do_pwa")) { assert.equal(opcoes?.method, "POST"); return Response.json(null); }
      throw new Error("Consulta fora do contrato sintetico");
    }) as typeof fetch;
    for (const canal of ["painel", "acesso-estacao"]) {
      if (canal === "painel") await import("../painel/index.ts");
      else await import("../acesso-estacao/index.ts");
      const prefixo = canal === "painel" ? "api/" : "api/acesso/";
      const requisicao = (rota: string, autenticado: boolean, method = "POST") => {
        const headers: Record<string,string> = { "Content-Type": "application/json", Origin: "https://imposition.ai-ideal.com.br" };
        if (autenticado && canal === "painel") headers.Authorization = "Bearer " + jwt;
        if (autenticado && canal === "acesso-estacao") {
          headers["X-Agente-Segredo"] = "segredo-sintetico";
          headers["X-Operador-Codigo"] = "ABC123";
        }
        return new Request(`https://funcao.example/functions/v1/${canal}/${prefixo}${rota}`, {
          method, headers, ...(method === "POST" ? {body: JSON.stringify(rota.startsWith("propostas") ? {tipo: "lista"} : {})} : {}),
        });
      };
      permissoes = { perm_pedidos_view: true, perm_admin_edit: true, role: "admin" };
      const antes = consultas;
      assert.equal((await handler(requisicao("propostas/consultar", false))).status, 401);
      assert.equal(consultas, antes);
      const r = await handler(requisicao("propostas/consultar", true));
      assert.equal(r.status, 200); assert.deepEqual(await r.json(), [{id_int:11}]);
      assert.equal(r.headers.get("Access-Control-Allow-Origin"), "https://imposition.ai-ideal.com.br");
      assert.equal((await handler(requisicao("fundo/remover", true))).status, 200);
      // O roteador existente responde 404 para leituras sem rota GET.
      assert.equal((await handler(requisicao("propostas/consultar", true, "GET"))).status, 404);
      permissoes = { perm_pedidos_view: false, perm_producao_view: false, perm_acabamento_view: false,
        perm_lista_arte_view: false, perm_numeracao_view: false, perm_admin_edit: false,
        perm_amostras_view: false, role: "visualizador" };
      assert.equal((await handler(requisicao("propostas/consultar", true))).status, 403);
      assert.equal((await handler(requisicao("fundo/remover", true))).status, 403);
      // A rota dos bancos continua montada e passa pela autenticacao.
      assert.equal((await handler(requisicao("bancos-pedido/listar", false))).status, 401);
    }
  } finally {
    Deno.serve = serve; globalThis.fetch = fetchOriginal; Deno.env.get = env;
  }
});
