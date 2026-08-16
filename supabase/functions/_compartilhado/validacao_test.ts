/**
 * As recusas do framework que estamos deixando, congeladas em teste.
 *
 * Rodar (da pasta `supabase/functions`):
 *   npx deno test _compartilhado/validacao_test.ts
 */
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  inteiro,
  recusaDeRotaDesconhecida,
  RecusaDeValidacao,
} from "./validacao.ts";

Deno.test("int: aceita o que o `int()` do Python aceita", () => {
  assertEquals(inteiro("18560", "path", "pedido"), 18560);
  // O `int()` apara espacos.
  assertEquals(inteiro(" 18560 ", "path", "pedido"), 18560);
  assertEquals(inteiro("-3", "query", "limite"), -3);
});

Deno.test("int: recusa o que o `Number()` aceitaria por frouxidao", () => {
  // `Number("")` e 0, `Number("0x10")` e 16, `Number("1e3")` e 1000 -- e o
  // `int()` do Python levanta em todos os tres.
  for (const ruim of ["", "0x10", "1e3", "18560.0", "abacaxi", null]) {
    assertThrows(() => inteiro(ruim, "path", "pedido"), RecusaDeValidacao);
  }
});

Deno.test("int: o 422 diz de onde veio o valor ruim", () => {
  try {
    inteiro("abacaxi", "query", "limite");
    throw new Error("devia ter recusado");
  } catch (e) {
    const detalhes = (e as RecusaDeValidacao).detalhes as any[];
    assertEquals((e as RecusaDeValidacao).status, 422);
    assertEquals(detalhes[0].type, "int_parsing");
    assertEquals(detalhes[0].loc, ["query", "limite"]);
    assertEquals(detalhes[0].input, "abacaxi");
  }
});

Deno.test("rota desconhecida: GET e 404, e todo o resto e 405", () => {
  // Medido contra o Render em 16/08/2026. A regra e de METODO, e nao de
  // caminho: `GET /pedidos/1/qr` responde 404 mesmo com o caminho existindo
  // para POST, porque o apanhador de arquivos estaticos do `app.py` casa
  // qualquer GET. Adivinhar pela leitura do FastAPI daria o contrario.
  for (const metodo of ["GET", "HEAD"]) {
    const e = assertThrows(() => recusaDeRotaDesconhecida(metodo)) as any;
    assertEquals([e.status, e.detail], [404, "Not Found"]);
  }
  for (const metodo of ["POST", "PATCH", "DELETE", "PUT"]) {
    const e = assertThrows(() => recusaDeRotaDesconhecida(metodo)) as any;
    assertEquals([e.status, e.detail], [405, "Method Not Allowed"]);
  }
});
