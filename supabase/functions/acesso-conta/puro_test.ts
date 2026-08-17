import { assert, assertEquals } from "jsr:@std/assert@1";
import { pertenceAConta } from "./puro.ts";

Deno.test("posse: o evento e da conta que o criou, mesmo sem cliente ligado", () => {
  assert(pertenceAConta({ dono_auth_id: "u1", id_cliente: 14 }, "u1", []));
});

Deno.test("posse: o evento e de toda conta ligada ao MESMO cliente", () => {
  assert(pertenceAConta({ dono_auth_id: "u1", id_cliente: 14 }, "u2", [14, 60928]));
});

Deno.test("posse: outra conta, outro cliente -- nao", () => {
  assert(!pertenceAConta({ dono_auth_id: "u1", id_cliente: 14 }, "u2", [8469]));
  assert(!pertenceAConta({ dono_auth_id: "u1", id_cliente: null }, "u2", [14]));
  assert(!pertenceAConta({}, "u2", []));
});
