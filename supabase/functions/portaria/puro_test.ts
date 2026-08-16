/**
 * Testes das duas pecas puras da funcao da portaria.
 *
 * O comportamento inteiro so e conferido pelo
 * `tests/test_portaria_paridade.py`, que compara esta funcao com o Python
 * contra o banco de verdade. Mas estas duas nao dao para deixar sem teste:
 *
 * - a comparacao em tempo constante nao existe no Python (la e
 *   `hmac.compare_digest`), foi escrita a mao aqui, e se estiver errada NENHUM
 *   aparelho pareia;
 * - o desmonte da rota, se quebrar, transforma TODAS as rotas em 404 de uma vez
 *   e o aparelho para sem dizer por que.
 *
 * Rodar: deno test supabase/functions/portaria/puro_test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import { iguaisEmTempoConstante, origemPermitida, rotaPedida } from "./puro.ts";

Deno.test("iguais em tempo constante: strings identicas", () => {
  assertEquals(iguaisEmTempoConstante("abc123", "abc123"), true);
});

Deno.test("iguais em tempo constante: um caractere diferente no fim", () => {
  // O caso que um `startsWith` ou uma comparacao de prefixo deixaria passar.
  assertEquals(iguaisEmTempoConstante("abc123", "abc124"), false);
});

Deno.test("iguais em tempo constante: um caractere diferente no comeco", () => {
  assertEquals(iguaisEmTempoConstante("abc123", "zbc123"), false);
});

Deno.test("iguais em tempo constante: tamanhos diferentes", () => {
  assertEquals(iguaisEmTempoConstante("abc", "abc0"), false);
  assertEquals(iguaisEmTempoConstante("abc0", "abc"), false);
});

Deno.test("iguais em tempo constante: vazias", () => {
  assertEquals(iguaisEmTempoConstante("", ""), true);
});

Deno.test("iguais em tempo constante: hash de 64 hex, so o ultimo difere", () => {
  const a = "8cc48cd725a2a437b8a7bf25c312a0f7b85303d85438d0a39842ac21ed4bad9e";
  const b = "8cc48cd725a2a437b8a7bf25c312a0f7b85303d85438d0a39842ac21ed4bad9f";
  assertEquals(iguaisEmTempoConstante(a, a), true);
  assertEquals(iguaisEmTempoConstante(a, b), false);
});

Deno.test("rota: caminho completo do Supabase", () => {
  assertEquals(rotaPedida("/functions/v1/portaria/entrar"), "entrar");
  assertEquals(rotaPedida("/functions/v1/portaria/faixa"), "faixa");
  assertEquals(rotaPedida("/functions/v1/portaria/leituras"), "leituras");
});

Deno.test("rota: caminho curto", () => {
  assertEquals(rotaPedida("/portaria/entrar"), "entrar");
});

Deno.test("rota: sem rota nenhuma vira vazio, e o servidor responde 404", () => {
  assertEquals(rotaPedida("/functions/v1/portaria"), "");
  assertEquals(rotaPedida("/functions/v1/portaria/"), "");
});

Deno.test("rota: caminho desconhecido nao vira rota valida por acidente", () => {
  // Sem `/portaria/` no caminho, a regex nao casa e o nome inteiro sobra --
  // que nao e nenhuma das tres rotas, entao o servidor devolve 404.
  const r = rotaPedida("/functions/v1/outra-coisa/entrar");
  assertEquals(r === "entrar", false);
});

// ── Politica de origem (CORS) ───────────────────────────────────────────────
//
// Estes casos existem porque o defeito que eles cobrem NAO aparece em teste de
// servidor: `curl` e `urllib` nao fazem preflight nem olham
// `Access-Control-Allow-Origin`. Ate 16/08/2026 a funcao nao respondia OPTIONS
// coisa nenhuma, e so o celular do porteiro descobriria isso -- no portao.

Deno.test("origem: a pagina de producao passa", () => {
  assertEquals(
    origemPermitida("https://ideal-imposition.vercel.app"),
    "https://ideal-imposition.vercel.app",
  );
});

Deno.test("origem: um preview do Vercel passa pela regex", () => {
  const previa = "https://ideal-imposition-4kbywehmf-algum-projeto.vercel.app";
  assertEquals(origemPermitida(previa), previa);
});

Deno.test("origem: desenvolvimento local em qualquer porta passa", () => {
  assertEquals(origemPermitida("http://localhost:9123"), "http://localhost:9123");
  assertEquals(origemPermitida("http://127.0.0.1"), "http://127.0.0.1");
});

Deno.test("origem: dominio de fora e recusado", () => {
  assertEquals(origemPermitida("https://exemplo.com"), null);
});

Deno.test("origem: o sufixo enganoso NAO passa", () => {
  // O caso que uma regex sem ancora deixaria entrar: `test()` casa pedaco, e
  // um atacante que registrasse este dominio leria a carga do evento inteira.
  assertEquals(
    origemPermitida("https://ideal-imposition.vercel.app.exemplo.com"),
    null,
  );
});

Deno.test("origem: o prefixo enganoso NAO passa", () => {
  assertEquals(origemPermitida("https://mal.com/https://imposicao.vercel.app"), null);
});

Deno.test("origem: requisicao sem cabecalho Origin nao ganha permissao", () => {
  // Chamada de servidor para servidor nao e navegador e nao precisa de CORS;
  // devolver `*` aqui seria dar permissao a quem nunca pediu.
  assertEquals(origemPermitida(null), null);
});

Deno.test("origem: http na producao NAO passa", () => {
  assertEquals(origemPermitida("http://ideal-imposition.vercel.app"), null);
});
