/**
 * A leitura do JWT, sem rede.
 *
 * `quemConfigura` toca o banco e por isso nao entra aqui -- ele e conferido no
 * teste de paridade da funcao `acesso-interno`, contra usuarios de verdade.
 * `usuarioDoJwt` e puro, e e onde mora o erro que ninguem enxerga: um `atob`
 * sem o preenchimento, ou lido como latin-1, entrega email trocado sem falhar.
 *
 * Rodar: npx deno test _compartilhado/sessao_test.ts
 */
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { PAPEIS_QUE_CONFIGURAM, Recusa, usuarioDoJwt } from "./sessao.ts";

function jwtDeMesa(claims: unknown): string {
  const b64 = (o: unknown) =>
    btoa(new TextDecoder("latin1").decode(new TextEncoder().encode(JSON.stringify(o))))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  // A assinatura e lixo de proposito: este modulo NAO confere assinatura --
  // quem confere e o portao do Supabase, antes de invocar a funcao.
  return `${b64({ alg: "HS256" })}.${b64(claims)}.assinatura-nao-conferida-aqui`;
}

Deno.test("jwt: tira o id e o email das claims", () => {
  const t = jwtDeMesa({ sub: "abc-123", email: "pessoa@exemplo.com" });
  assertEquals(usuarioDoJwt(`Bearer ${t}`), {
    id: "abc-123",
    email: "pessoa@exemplo.com",
  });
});

Deno.test("jwt: email com acento nao sai trocado", () => {
  // O caso que um `atob` lido como latin-1 estragaria em silencio.
  const t = jwtDeMesa({ sub: "x", email: "joão.conceição@exemplo.com.br" });
  assertEquals(usuarioDoJwt(`Bearer ${t}`).email, "joão.conceição@exemplo.com.br");
});

Deno.test("jwt: claims sem preenchimento base64 ainda decodificam", () => {
  // Comprimentos variados garantem que algum caia em cada resto de 4.
  for (const sufixo of ["", "a", "ab", "abc", "abcd"]) {
    const t = jwtDeMesa({ sub: `id${sufixo}` });
    assertEquals(usuarioDoJwt(`Bearer ${t}`).id, `id${sufixo}`);
  }
});

Deno.test("jwt: sem cabecalho e 401", () => {
  const e = assertThrows(() => usuarioDoJwt(null), Recusa);
  assertEquals((e as Recusa).status, 401);
});

Deno.test("jwt: cabecalho que nao e Bearer e 401", () => {
  assertThrows(() => usuarioDoJwt("sopa"), Recusa);
});

Deno.test("jwt: token com numero de partes errado e 401", () => {
  for (const ruim of ["Bearer a.b", "Bearer a", "Bearer a.b.c.d"]) {
    assertThrows(() => usuarioDoJwt(ruim), Recusa);
  }
});

Deno.test("jwt: claims sem `sub` e 401", () => {
  // Um token bem formado sem identidade nao pode virar usuario anonimo com
  // id vazio -- ele casaria com `user_id=eq.` em qualquer consulta.
  assertThrows(() => usuarioDoJwt(`Bearer ${jwtDeMesa({ email: "x@y.z" })}`), Recusa);
});

Deno.test("jwt: claims que nao sao JSON e 401", () => {
  assertThrows(() => usuarioDoJwt("Bearer aaa.bbbb.cccc"), Recusa);
});

Deno.test("papel: a lista e exatamente a do Python, e nao uma abreviacao dela", () => {
  // Este teste existe por um defeito de 16/08/2026: o porte escreveu "adm", e a
  // Edge Function passou a ACEITAR quem o Render recusa. Divergencia de
  // permissao que ABRE nao aparece como erro -- aparece como alguem vendo uma
  // tela que nao devia, sem nada no log.
  assertEquals(PAPEIS_QUE_CONFIGURAM, ["admin", "atendimento"]);
  assertEquals(PAPEIS_QUE_CONFIGURAM.includes("adm"), false);
});
