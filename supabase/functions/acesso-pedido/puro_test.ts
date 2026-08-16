/**
 * Rodar: npx deno test _compartilhado/../acesso-pedido/puro_test.ts
 * (da pasta `supabase/functions`: npx deno test acesso-pedido/puro_test.ts)
 */
import { assertEquals } from "jsr:@std/assert@1";
import { PAINEL_PADRAO, pedacosDaRota, urlDoEvento } from "./puro.ts";

Deno.test("rota: os dois formatos que o Supabase entrega", () => {
  assertEquals(
    pedacosDaRota("/functions/v1/acesso-pedido/pedidos/20272/qr"),
    ["pedidos", "20272", "qr"],
  );
  assertEquals(pedacosDaRota("/acesso-pedido/pedidos/20272/qr"), ["pedidos", "20272", "qr"]);
});

Deno.test("rota: o `/api/acesso/` do painel e aceito no meio", () => {
  // E o que permite o corte ser uma troca de endereco, e nao uma reescrita de
  // como a tela monta a URL.
  assertEquals(
    pedacosDaRota("/functions/v1/acesso-pedido/api/acesso/pedidos/20272/qr"),
    ["pedidos", "20272", "qr"],
  );
});

Deno.test("rota: a funcao sem caminho nenhum nao vira rota", () => {
  assertEquals(pedacosDaRota("/functions/v1/acesso-pedido"), []);
  assertEquals(pedacosDaRota("/functions/v1/acesso-pedido/"), []);
});

Deno.test("rota: pedido com caractere escapado volta decodificado", () => {
  assertEquals(pedacosDaRota("/acesso-pedido/pedidos/a%20b/qr"), ["pedidos", "a b", "qr"]);
});

Deno.test("url do evento: o padrao e o painel versionado", () => {
  assertEquals(urlDoEvento(null, "1.2.abc"), `${PAINEL_PADRAO}/evento.html?t=1.2.abc`);
  assertEquals(urlDoEvento("", "1.2.abc"), `${PAINEL_PADRAO}/evento.html?t=1.2.abc`);
});

Deno.test("url do evento: a barra do fim nunca duplica", () => {
  // `rstrip('/')` do Python, e nao um `replace` de uma barra so: o valor pode
  // chegar com mais de uma.
  assertEquals(
    urlDoEvento("https://exemplo.app///", "t"),
    "https://exemplo.app/evento.html?t=t",
  );
  assertEquals(
    urlDoEvento("https://exemplo.app", "t"),
    "https://exemplo.app/evento.html?t=t",
  );
});
