/**
 * Roda o hash do QR Ideal em Deno e imprime o resultado.
 *
 * Existe para o pytest poder comparar a TERCEIRA implementacao da regra contra
 * o Python sem embutir Deno dentro do teste -- do mesmo jeito que o
 * `qr_ideal_hash_harness.js` faz pelo navegador.
 *
 * uso: deno run tests/deno_hash_harness.ts <conteudo> <sal>
 */
import { hashCodigo } from "../supabase/functions/_compartilhado/hash.ts";

const [conteudo, sal] = Deno.args;
if (!conteudo || !sal) {
  console.error("uso: deno run deno_hash_harness.ts <conteudo> <sal>");
  Deno.exit(2);
}
console.log(await hashCodigo(conteudo, sal));
