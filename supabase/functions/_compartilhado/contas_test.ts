import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { ALFABETO_SENHA, emailLimpo, senhaProvisoria } from "./contas.ts";
import { Recusa } from "./sessao.ts";

Deno.test("senha provisoria: 8 simbolos, sem 0 O 1 I L", () => {
  for (let i = 0; i < 200; i++) {
    const s = senhaProvisoria();
    assertEquals(s.length, 8);
    for (const c of s) assert(ALFABETO_SENHA.includes(c), `simbolo fora do alfabeto: ${c}`);
    for (const proibido of "0O1Il") assert(!s.includes(proibido));
  }
});

Deno.test("senha provisoria: duas seguidas nao sao iguais", () => {
  assert(senhaProvisoria() !== senhaProvisoria());
});

Deno.test("e-mail: minusculo e sem espacos", () => {
  assertEquals(emailLimpo("  Daniel@Exemplo.com "), "daniel@exemplo.com");
});

Deno.test("e-mail: o que nao parece e-mail e recusado com 422", () => {
  for (const ruim of ["", "daniel", "daniel@", "@exemplo.com", null, undefined, "a b@c.d"]) {
    const e = assertThrows(() => emailLimpo(ruim), Recusa);
    assertEquals(e.status, 422);
  }
});
