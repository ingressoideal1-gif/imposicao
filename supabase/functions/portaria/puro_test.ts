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
import { iguaisEmTempoConstante, rotaPedida } from "./puro.ts";

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
