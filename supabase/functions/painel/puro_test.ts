/**
 * As pecas puras do `painel`. Rode com:
 *
 *     deno test supabase/functions/painel/puro_test.ts
 */
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  limparItemOs,
  normalizarCodigo,
  pedacosDaRota,
  podeEditarUsuarios,
  podeVerUsuarios,
  validarCodigo,
} from "./puro.ts";

Deno.test("a rota sai igual com e sem o prefixo api/", () => {
  assertEquals(pedacosDaRota("/functions/v1/painel/acessos-locais"), ["acessos-locais"]);
  assertEquals(pedacosDaRota("/functions/v1/painel/api/acessos-locais"), ["acessos-locais"]);
  assertEquals(
    pedacosDaRota("/functions/v1/painel/user/permissions/abc"),
    ["user", "permissions", "abc"],
  );
});

Deno.test("o codigo e normalizado como no db.py", () => {
  assertEquals(normalizarCodigo(" m9k gjd "), "M9KGJD");
  assertEquals(normalizarCodigo(null), "");
});

Deno.test("o codigo precisa de seis caracteres do alfabeto", () => {
  assertEquals(validarCodigo("m9kgjd"), "M9KGJD");
  assertThrows(() => validarCodigo("M9KGJ"), Error, "exatamente 6");
  assertThrows(() => validarCodigo("M9KGJ-"), Error, "letras e numeros");
});

Deno.test("codigo repetido e recusado com o motivo, e nao pelo banco", () => {
  assertThrows(
    () => validarCodigo("m9kgjd", ["M9KGJD"]),
    Error,
    "ja esta em uso",
  );
  // O proprio codigo do operador que esta sendo editado nao conta como repetido:
  // quem chama tira a linha dele da lista antes.
  assertEquals(validarCodigo("m9kgjd", ["Y6P4KN"]), "M9KGJD");
});

Deno.test("o item de OS so aceita as quatro colunas conhecidas", () => {
  assertEquals(
    limparItemOs({ impressao: "4x0", os_id: "outro", preco: 999, cor_id: "c1" }),
    { impressao: "4x0", cor_id: "c1" },
  );
  assertEquals(limparItemOs({ nada: 1 }), {});
  assertEquals(limparItemOs(null), {});
});

Deno.test("o modulo Usuarios sai da grade, e nao do papel", () => {
  // O caso que motiva a regra: papel de administrador com o modulo tirado a mao.
  assertEquals(podeVerUsuarios({ role: "admin", perm_admin_view: false }), false);
  // E o contrario: papel qualquer a quem o dono deu o modulo de proposito.
  assertEquals(podeVerUsuarios({ role: "designer", perm_admin_view: true }), true);
  assertEquals(podeEditarUsuarios({ perm_admin_view: true }), false);
  assertEquals(podeEditarUsuarios({ perm_admin_edit: true }), true);
  // Quem ainda nao tem linha nenhuma nao ve nem edita.
  assertEquals(podeVerUsuarios(null), false);
  assertEquals(podeEditarUsuarios(null), false);
});

Deno.test("ver o modulo nao e edita-lo", () => {
  const soVe = { perm_admin_view: true, perm_admin_edit: false };
  assertEquals(podeVerUsuarios(soVe), true);
  assertEquals(podeEditarUsuarios(soVe), false);
});
