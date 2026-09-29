import { strict as assert } from "node:assert";
import { obterLinkPagamentoVibe, urlPagamentoValida, type DependenciasPagamento } from "./link_pagamento_vibe.ts";
import { atenderLinkPagamento } from "../link-pagamento/handler.ts";

const numero = "22898", token = "sintetico123", url = `https://vibe.ai-ideal.com.br/p/${numero}-sintetico`;
function contexto(status = 200, corpo: unknown = { id_int: 22898, url }) {
  const logs: string[] = [], chamadas: string[] = [];
  let salvo: { url: string | null; codigo?: string } | null = null;
  let reservado = false, consultasVibe = 0;
  const deps: DependenciasPagamento = {
    ambiente: () => "chave-sintetica",
    registrar: codigo => { logs.push(codigo); },
    consultar: async (metodo, caminho, entrada) => {
      chamadas.push(metodo + " " + caminho);
      const p = entrada as Record<string, string>;
      if (caminho === "rpc/reservar_link_pagamento_vibe") {
        if (p.p_token !== token || p.p_numero !== numero) return null;
        if (salvo?.url) return salvo;
        if (reservado) return {};
        reservado = true;
        return { reserva: "00000000-0000-0000-0000-000000000001" };
      }
      if (caminho === "rpc/concluir_link_pagamento_vibe") {
        salvo = { url: p.p_url, codigo: p.p_codigo };
        return salvo;
      }
      return [salvo];
    },
    buscar: (endereco, init) => {
      consultasVibe++;
      assert.equal(endereco, `https://vibe.ai-ideal.com.br/api/v1/parceiro/link-pagamento/${numero}`);
      assert.equal(new Headers(init?.headers).get("x-api-key"), "chave-sintetica");
      assert.equal(init?.redirect, "error");
      assert.equal(init?.method, "GET");
      assert.ok(init?.signal);
      return Promise.resolve(new Response(JSON.stringify(corpo), { status }));
    },
  };
  return { deps, logs, chamadas, consultas: () => consultasVibe };
}

Deno.test("pagamento Vibe: salva, relê e reutiliza link sem repetir GET no ERP", async () => {
  const c = contexto();
  assert.equal(await obterLinkPagamentoVibe(numero, token, c.deps), url);
  assert.equal(await obterLinkPagamentoVibe(numero, token, c.deps), url);
  assert.equal(c.consultas(), 1);
  assert.ok(c.chamadas.some(x => x.startsWith("GET pedidos_links_pagamento_vibe?")));
  assert.deepEqual(c.logs, []);
});
Deno.test("pagamento Vibe: chamadas concorrentes não duplicam busca", async () => {
  const c = contexto();
  const resultados = await Promise.all(Array.from({ length: 10 }, () => obterLinkPagamentoVibe(numero, token, c.deps)));
  assert.ok(resultados.includes(url));
  assert.equal(c.consultas(), 1);
});
Deno.test("pagamento Vibe: erros têm log só de código e não repetem em sequência", async () => {
  for (const status of [401, 404, 429, 503, 500]) {
    const c = contexto(status, { erro: "segredo-sintetico", mensagem: "chave-sintetica" });
    assert.equal(await obterLinkPagamentoVibe(numero, token, c.deps), null);
    assert.equal(await obterLinkPagamentoVibe(numero, token, c.deps), null);
    assert.equal(c.consultas(), 1);
    assert.deepEqual(c.logs, [String(status)]);
  }
});
Deno.test("pagamento Vibe: chave ausente, token inválido e erro de cache não acessam ERP", async () => {
  const c = contexto();
  assert.equal(await obterLinkPagamentoVibe(numero, "outrotoken", c.deps), null);
  assert.equal(await obterLinkPagamentoVibe(numero + "&select=*", token, c.deps), null);
  assert.equal(await obterLinkPagamentoVibe(numero, token, { ...c.deps, ambiente: () => undefined }), null);
  assert.equal(await obterLinkPagamentoVibe(numero, token, { ...c.deps, consultar: () => { throw new Error("chave-sintetica"); } }), null);
  assert.equal(c.consultas(), 0);
  assert.deepEqual(c.logs, ["SEM_CHAVE", "FALHA_CACHE"]);
});
Deno.test("pagamento Vibe: exige mesmo pedido, domínio e caminho seguro", async () => {
  for (const corpo of [{ id_int: 1, url }, { id_int: 22898, url: url.replace('22898-', '11-') },
    { id_int: 22898, url: 'https://vibe.ai-ideal.com.br.evil.example/p/22898-abc' },
    { id_int: 22898, url: 'javascript:alert(1)' }, { id_int: 22898, url: url + '?chave=segredo' }]) {
    const c = contexto(200, corpo);
    assert.equal(await obterLinkPagamentoVibe(numero, token, c.deps), null);
    assert.deepEqual(c.logs, ["RESPOSTA_INVALIDA"]);
  }
  assert.equal(urlPagamentoValida(url, numero), true);
});
Deno.test("pagamento Vibe: persistência vazia ou releitura divergente não liberam botão", async () => {
  for (const falha of ["rpc/concluir_link_pagamento_vibe", "GET"]) {
    const c = contexto(), consultar = c.deps.consultar!;
    c.deps.consultar = async (metodo, caminho, corpo) => (falha === caminho || falha === metodo) ? [] : consultar(metodo, caminho, corpo);
    assert.equal(await obterLinkPagamentoVibe(numero, token, c.deps), null);
    assert.deepEqual(c.logs, ["FALHA_CACHE"]);
  }
});
Deno.test("pagamento Vibe: timeout de cinco segundos aborta sem logar exceção", async () => {
  const c = contexto(), inicio = Date.now();
  c.deps.buscar = (_url, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener("abort", () => reject(new Error("chave-sintetica")), { once: true });
  });
  assert.equal(await obterLinkPagamentoVibe(numero, token, c.deps), null);
  assert.ok(Date.now() - inicio >= 4900 && Date.now() - inicio < 8000);
  assert.deepEqual(c.logs, ["TIMEOUT"]);
});
Deno.test("rota pagamento: CORS, método, token e retorno público sem chave", async () => {
  const c = contexto(), endpoint = "https://edge.example/link-pagamento";
  const headers = { origin: "https://imposition.ai-ideal.com.br", "content-type": "application/json" };
  const preflight = await atenderLinkPagamento(new Request(endpoint, { method: "OPTIONS", headers }), c.deps);
  assert.equal(preflight.status, 204);
  assert.match(preflight.headers.get("Access-Control-Allow-Headers")!, /apikey/);
  assert.equal((await atenderLinkPagamento(new Request(endpoint), c.deps)).status, 405);
  const resposta = await atenderLinkPagamento(new Request(endpoint, { method: "POST", headers, body: JSON.stringify({ numero, token }) }), c.deps);
  assert.equal(resposta.headers.get("cache-control"), "no-store");
  assert.equal(resposta.headers.get("access-control-allow-origin"), headers.origin);
  assert.deepEqual(await resposta.json(), { url });
  const invalido = await atenderLinkPagamento(new Request(endpoint, { method: "POST", headers, body: JSON.stringify({ numero, token: "revogado" }) }), c.deps);
  assert.deepEqual(await invalido.json(), { url: null });
  assert.equal(c.consultas(), 1);
});
