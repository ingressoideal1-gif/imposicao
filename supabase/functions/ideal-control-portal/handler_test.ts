import { atender } from "./handler.ts";
const req = (criar = true) => new Request("https://exemplo.invalid", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ numero: "24880", token: "ficticio", criar }),
});
function assert(ok: unknown) { if (!ok) throw new Error("Verificação falhou"); }
Deno.test("link inválido ou consulta não inicia preparação", async () => {
  for (const criar of [true, false]) {
    let lotes = 0;
    const r = await atender(req(criar), {
      consultar: async () => criar ? { disponivel: false } : { disponivel: true, estado: "preparando", evento_id: "privado" },
      preparar: async () => { lotes++; },
    });
    assert(lotes === 0 && !(await r.text()).includes("privado"));
  }
});
Deno.test("lote concluído revalida revogação antes de retornar QR", async () => {
  let leituras = 0, lotes = 0;
  const r = await atender(req(), {
    consultar: async () => ++leituras === 1
      ? { disponivel: true, estado: "preparando", evento_id: "evento-ficticio" }
      : { disponivel: false },
    preparar: async id => { assert(id === "evento-ficticio"); lotes++; },
  });
  assert(lotes === 1 && leituras === 2 && (await r.json()).disponivel === false);
});
Deno.test("falha de preparação não entrega segredo e permite retomar", async () => {
  let falhar = true;
  const deps = {
    consultar: async () => ({ disponivel: true, estado: "preparando", evento_id: "privado" }),
    preparar: async () => { if (falhar) throw new Error("detalhe privado"); },
  };
  const falha = await atender(req(), deps);
  assert(falha.status === 503 && !(await falha.text()).includes("privado"));
  falhar = false;
  const retomada = await atender(req(), deps);
  assert(retomada.status === 200 && (await retomada.json()).estado === "preparando");
});
Deno.test("cliente não escolhe evento; QR somente após confirmação do banco", async () => {
  let n = 0;
  const r = await atender(req(), {
    consultar: async () => ++n === 1 ? { disponivel: true, estado: "preparando", evento_id: "interno" }
      : { disponivel: true, estado: "criado", qr: "qr-ficticio" },
    preparar: async () => {},
  });
  const body = await r.json();
  assert(body.qr === "qr-ficticio" && !body.evento_id && r.headers.get("cache-control") === "no-store");
});
Deno.test("preflight aceita cabeçalhos do SDK e corpo inválido não consulta banco", async () => {
  const preflight = await atender(new Request("https://exemplo.invalid", {
    method: "OPTIONS", headers: { origin: "https://imposition.ai-ideal.com.br" },
  }));
  assert(preflight.status === 204 && preflight.headers.get("access-control-allow-headers")?.includes("apikey"));
  const invalid = await atender(new Request("https://exemplo.invalid", { method: "POST", body: "{}" }), {
    consultar: async () => { throw new Error("não deve consultar"); }, preparar: async () => {},
  });
  assert(invalid.status === 400);
});
