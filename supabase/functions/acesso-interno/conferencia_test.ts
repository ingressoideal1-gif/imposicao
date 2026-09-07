import { assertEquals, assert } from "jsr:@std/assert@1";

Deno.test("busca da grafica exige papel interno e so consulta clientes", async () => {
  const serve = Deno.serve;
  const fetchOriginal = globalThis.fetch;
  const env = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const anteriores = env.map((n) => Deno.env.get(n));
  let handler: (r: Request) => Promise<Response>;
  let papel = "admin";
  const urls: string[] = [];
  try {
    Deno.env.set(env[0], "https://teste.invalid");
    Deno.env.set(env[1], "chave-ficticia-sem-acesso");
    Deno.serve = ((h: typeof handler) => { handler = h; return {}; }) as typeof Deno.serve;
    globalThis.fetch = ((url: string | URL | Request, options?: RequestInit) => {
      const u = new URL(String(url));
      assertEquals(u.hostname, "teste.invalid");
      assertEquals(options?.method, "GET");
      urls.push(u.href);
      const rows = u.pathname.endsWith("imposition_user_permissions")
        ? [{ role: papel }] : [{ id_cliente: 1, nome: "Cliente ficticio" }];
      return Promise.resolve(new Response(JSON.stringify(rows), { status: 200 }));
    }) as typeof fetch;
    await import("./index.ts");
    const token = "ficticio." + btoa(JSON.stringify({ sub: "11111111-1111-4111-8111-111111111111", email: "teste@example.invalid" })) + ".ficticio";
    async function chamar(busca: string, autenticado = true) {
      return await handler(new Request("https://teste.invalid/acesso-interno/clientes?busca=" + encodeURIComponent(busca), {
        headers: autenticado ? { Authorization: "Bearer " + token } : {},
      }));
    }
    // A assinatura e conferida pelo gateway (verify_jwt=true), nao por este teste.
    assertEquals((await chamar("Cliente", false)).status, 401);
    assertEquals(urls.length, 0);
    for (papel of ["cliente", "designer", "operador", ""]) {
      urls.length = 0;
      assertEquals((await chamar("Cliente")).status, 403);
      assertEquals(urls.length, 1);
      assert(urls[0].includes("imposition_user_permissions"));
    }
    for (papel of ["admin", "atendimento"]) {
      urls.length = 0;
      assertEquals((await chamar("Cliente&limit=999")).status, 200);
      const query = new URL(urls[1]).searchParams;
      assertEquals(query.get("limit"), "30");
      assertEquals(query.get("select"), "id_cliente,nome");
      assertEquals(query.get("nome"), "ilike.*Clientelimit=999*");
      assertEquals((await chamar("*")).status, 422);
    }
  } finally {
    Deno.serve = serve;
    globalThis.fetch = fetchOriginal;
    env.forEach((n, i) => anteriores[i] === undefined ? Deno.env.delete(n) : Deno.env.set(n, anteriores[i]!));
  }
});
