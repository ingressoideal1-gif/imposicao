/** Rotas reais com gateway, banco e SMTP substituídos por dados sintéticos. */
import { strict as assert } from "node:assert";

Deno.test("painel/email: sessão, grade, CORS Cloudflare, métodos e envio sem agente", async () => {
  const servir = Deno.serve, buscar = globalThis.fetch, ambiente = Deno.env.get, tls = Deno.connectTls;
  let handler!: (req: Request) => Promise<Response>;
  let permissoes: Record<string, unknown> | null = { perm_lista_arte_view: true, role: "designer" };
  let consultas = 0, conexoes = 0;
  const jwt = "cabecalho." + btoa(JSON.stringify({ sub: "usuario-sintetico", email: "operador@example.com" })) + ".assinatura";
  const vars: Record<string, string> = {
    SUPABASE_URL: "https://banco.example", SUPABASE_SERVICE_ROLE_KEY: "chave-sintetica",
    EMAIL_ARTES_SMTP_HOST: "smtp.example.com", EMAIL_ARTES_SMTP_USER: "arte@example.com",
    EMAIL_ARTES_SMTP_PASSWORD: "senha-sintetica", EMAIL_ARTES_REMETENTE: "arte@example.com",
  };
  try {
    // Apenas captura o handler; não abre servidor ou socket no teste.
    Deno.serve = ((fn: typeof handler) => { handler = fn; return {}; }) as unknown as typeof Deno.serve;
    Deno.env.get = (nome: string) => vars[nome];
    globalThis.fetch = ((_url: string | URL | Request, opcoes?: RequestInit) => {
      consultas++;
      assert.equal(opcoes?.method, "GET");
      const url = String(_url);
      let dados;
      if (url.includes("imposition_user_permissions?")) dados = permissoes ? [permissoes] : [];
      else if (url.includes("pedidos_links_cliente?")) dados = [{ os_id: "vibe_11", numero_pedido: "11", token: "abc123" }];
      else if (url.includes("propostas?id_int=eq.11&select=id_int,texto_whatsapp&limit=2")) dados = [{id_int:11,texto_whatsapp:"Total: R$ 148,05"}];
      else throw new Error("consulta fora do contrato");
      return Promise.resolve(Response.json(dados));
    }) as typeof fetch;
    Deno.connectTls = (async (opcoes) => {
      conexoes++; assert.equal(opcoes.port, 465);
      let bytes = new TextEncoder().encode("220 smtp\r\n250 AUTH PLAIN\r\n334 \r\n235 ok\r\n250 ok\r\n250 ok\r\n354 dados\r\n250 aceito\r\n221 fim\r\n");
      return {
        read: (buffer: Uint8Array) => { const n = Math.min(buffer.length, bytes.length); buffer.set(bytes.subarray(0, n)); bytes = bytes.subarray(n); return Promise.resolve(n || null); },
        write: (buffer: Uint8Array) => Promise.resolve(buffer.length), close: () => {},
      };
    }) as typeof Deno.connectTls;
    await import("./index.ts");
    assert.equal(typeof handler, "function");
    const req = (rota: string, method = "GET", corpo?: unknown, token = jwt, origem = "https://imposition.ai-ideal.com.br") => {
      const headers: Record<string, string> = { Origin: origem, "Content-Type": "application/json" };
      if (token) headers.Authorization = "Bearer " + token;
      return new Request("https://funcao.example/functions/v1/painel/api/" + rota, {
        method, headers, ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
      });
    };
    const preflight = await handler(req("email/enviar", "OPTIONS", undefined, ""));
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("Access-Control-Allow-Origin"), "https://imposition.ai-ideal.com.br");
    assert.match(preflight.headers.get("Access-Control-Allow-Headers")!, /authorization/);
    assert.equal(consultas, 0);
    const anonimo = await handler(req("email/config", "GET", undefined, ""));
    assert.equal(anonimo.status, 401); assert.equal(consultas, 0);
    assert.equal(anonimo.headers.get("Access-Control-Allow-Origin"), "https://imposition.ai-ideal.com.br");
    const status = await handler(req("email/config"));
    assert.equal(status.status, 200);
    assert.deepEqual(await status.json(), { ok: true, config: { email_remetente: "arte@example.com", nome_remetente: "Ingresso Ideal — Atendimento", configurado: true } });
    const falsaOrigem = await handler(req("email/config", "OPTIONS", undefined, "", "https://imposition.ai-ideal.com.br.evil.example"));
    assert.equal(falsaOrigem.headers.get("Access-Control-Allow-Origin"), null);
    assert.equal((await handler(req("email/config", "POST", { password: "forjada" }))).status, 405);
    assert.equal((await handler(req("email/enviar", "GET"))).status, 405);
    permissoes = null;
    assert.equal((await handler(req("email/testar", "POST", {}))).status, 403);
    assert.equal(conexoes, 0);
    permissoes = { perm_lista_arte_view: true, role: "visualizador" };
    const link = "https://imposition.ai-ideal.com.br/cliente/11-abc123";
    const resultado = await handler(req("email/enviar", "POST", {
      os_id: "vibe_11", to: "cliente@example.com", subject: "Arte", link_url: link, body_text: "Confira " + link,
    }));
    assert.equal(resultado.status, 200); assert.equal((await resultado.json()).ok, true);
    assert.equal(conexoes, 1);
  } finally {
    Deno.serve = servir; globalThis.fetch = buscar; Deno.env.get = ambiente; Deno.connectTls = tls;
  }
});

Deno.test("painel/email: gateway continua exigindo assinatura JWT", async () => {
  const config = await Deno.readTextFile(new URL("../../config.toml", import.meta.url));
  const secao = config.split("[functions.painel]")[1]?.split(/\n\[/)[0];
  assert.match(secao || "", /^verify_jwt\s*=\s*true\s*$/m);
});
