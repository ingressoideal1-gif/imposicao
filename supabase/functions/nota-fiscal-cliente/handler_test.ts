import { strict as assert } from "node:assert";
import { atenderNotaFiscal, caminhoFiscal } from "./handler.ts";

const base = "https://projeto-teste.supabase.co";
const path = "nfe-documentos/NFE-123-001/danfe.pdf";
const antiga = `${base}/storage/v1/object/sign/${path}?token=expirado`;
const entrada = { numero: "123", token: "token-teste", nota_url: antiga };
function fixture() {
  const c = { consultas: 0, assinaturas: 0, ativo: true, disponivel: true, url: antiga };
  const deps = {
    ambiente: (nome: string): string => nome === "SUPABASE_URL" ? base : "chave-servico-teste",
    consultar: async (metodo: string, rota: string, corpo?: unknown) => {
      c.consultas++;
      assert.equal(metodo, "POST"); assert.equal(rota, "rpc/link_cliente_notas_fiscais");
      const p = corpo as Record<string, string>;
      return c.ativo && c.disponivel && p.p_numero === "123" && p.p_token === "token-teste"
        ? [{ tipo: "NF-e", numero: "1", url: c.url }] : [];
    },
    buscar: (async (url: string | URL | Request, init?: RequestInit) => {
      c.assinaturas++;
      assert.equal(String(url), `${base}/storage/v1/object/sign/${path}`);
      assert.equal(init?.method, "POST"); assert.equal(init?.redirect, "error");
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer chave-servico-teste");
      assert.deepEqual(JSON.parse(String(init?.body)), { expiresIn: 60 });
      assert.ok(init?.signal);
      return Response.json({ signedURL: `/object/sign/${path}?token=novo-${c.assinaturas}` });
    }) as typeof fetch,
  };
  const chamar = (body: unknown = entrada) => atenderNotaFiscal(new Request("https://edge.test", {
    method: "POST", headers: { Origin: "https://imposition.ai-ideal.com.br" }, body: JSON.stringify(body),
  }), deps);
  return { c, deps, chamar };
}

Deno.test("nota: URL vencida recebe assinatura nova em cada clique sem gravar no banco", async () => {
  const { c, chamar } = fixture();
  for (let i = 1; i <= 2; i++) {
    const r = await chamar(); assert.equal(r.status, 200);
    assert.equal(r.headers.get("Cache-Control"), "no-store");
    assert.equal(r.headers.get("Access-Control-Allow-Origin"), "https://imposition.ai-ideal.com.br");
    assert.deepEqual(await r.json(), { url: `${base}/storage/v1/object/sign/${path}?token=novo-${i}` });
  }
  assert.equal(c.consultas, 2); assert.equal(c.assinaturas, 2);
});

Deno.test("nota: token errado, outro pedido ou documento nunca chegam ao Storage", async () => {
  const { c, chamar } = fixture();
  for (const body of [{ ...entrada, token: "outro" }, { ...entrada, numero: "456" },
    { ...entrada, nota_url: antiga.replace("123", "456") }]) {
    assert.equal((await chamar(body)).status, 404);
  }
  assert.equal(c.assinaturas, 0);
});

Deno.test("nota: revogação do link e nota cancelada após carregar a tela são revalidadas", async () => {
  const { c, chamar } = fixture();
  assert.equal((await chamar()).status, 200);
  c.ativo = false; assert.equal((await chamar()).status, 404);
  c.ativo = true; c.disponivel = false; assert.equal((await chamar()).status, 404);
  assert.equal(c.assinaturas, 1);
});

Deno.test("nota: domínio, bucket, arquivo e caminhos malformados falham fechados", async () => {
  for (const url of [antiga.replace("projeto-teste", "outro"), antiga.replace("nfe-documentos", "segredos"),
    antiga.replace("danfe.pdf", "nfe.xml"), antiga.replace("NFE-123-001", "%2e%2e"),
    antiga.replace("NFE-123-001", "a%2fb"), antiga.replace("NFE-123-001", "a%255cb"),
    antiga.replace("https:", "http:"), "https://example.test/nota.pdf"]) {
    const { c, chamar } = fixture(); c.url = url;
    assert.equal((await chamar({ ...entrada, nota_url: url })).status, 422);
    assert.equal(c.assinaturas, 0);
  }
  assert.equal(caminhoFiscal(antiga.replace("nfe-documentos", "nfse-documentos"), base), path.replace("nfe-documentos", "nfse-documentos"));
});

Deno.test("nota: PDF externo estável autorizado preservado, assinatura externa não reutilizada", async () => {
  const { c, chamar } = fixture();
  c.url = "https://focusnfe.s3.sa-east-1.amazonaws.com/exemplo/nota.pdf";
  assert.equal((await chamar({ ...entrada, nota_url: c.url })).status, 200);
  c.url += "?token=velho";
  assert.equal((await chamar({ ...entrada, nota_url: c.url })).status, 422);
  assert.equal(c.assinaturas, 0);
});

Deno.test("nota: falhas do banco e Storage não devolvem URL antiga nem segredo", async () => {
  for (const modo of ["banco", "storage", "resposta", "config"]) {
    const { deps, chamar } = fixture();
    if (modo === "banco") deps.consultar = () => { throw Error("token-secreto"); };
    if (modo === "storage") deps.buscar = (() => Promise.resolve(new Response("erro", { status: 404 }))) as typeof fetch;
    if (modo === "resposta") deps.buscar = (() => Promise.resolve(Response.json({ signedURL: "https://externo.test" }))) as typeof fetch;
    if (modo === "config") deps.ambiente = nome => nome === "SUPABASE_URL" ? base : "";
    const r = await chamar(); assert.equal(r.status, 503);
    const body = await r.text(); assert.ok(!body.includes("token-secreto")); assert.ok(!body.includes("expirado"));
  }
});

Deno.test("nota: métodos, preflight e entrada inválida não consultam dados", async () => {
  const { c, deps, chamar } = fixture();
  for (const body of [null, {}, { ...entrada, numero: "123 OR true" }, { ...entrada, token: "" }, { ...entrada, nota_url: "x".repeat(17000) }])
    assert.equal((await chamar(body)).status, 400);
  assert.equal((await atenderNotaFiscal(new Request("https://edge.test"), deps)).status, 405);
  assert.equal((await atenderNotaFiscal(new Request("https://edge.test", { method: "POST", body: "{" }), deps)).status, 400);
  const pre = await atenderNotaFiscal(new Request("https://edge.test", { method: "OPTIONS", headers: { Origin: "https://imposition.ai-ideal.com.br" } }), deps);
  assert.ok(pre.ok); assert.match(pre.headers.get("Access-Control-Allow-Methods") || "", /POST/);
  assert.equal(c.consultas, 0); assert.equal(c.assinaturas, 0);
});
