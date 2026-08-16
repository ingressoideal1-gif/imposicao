/**
 * A allowlist do proxy. Rode com:
 *
 *     deno test supabase/functions/arquivo/puro_test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import { enderecoPermitido, pedacosDaRota } from "./puro.ts";

Deno.test("o Storage do Supabase passa", () => {
  assertEquals(
    enderecoPermitido(
      "https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/x.ttf"),
    true,
  );
  assertEquals(enderecoPermitido("https://qualquer.supabase.in/x"), true);
});

Deno.test("o bucket legado do Firebase passa, e so ele", () => {
  const bom = "https://firebasestorage.googleapis.com/v0/b/" +
    "ideal-arte-e64f6.firebasestorage.app/o/pdf.pdf";
  assertEquals(enderecoPermitido(bom), true);
  // Outro bucket no MESMO host nao passa: o host hospeda o mundo.
  assertEquals(
    enderecoPermitido(
      "https://firebasestorage.googleapis.com/v0/b/outro-projeto.appspot.com/o/x.pdf"),
    false,
  );
});

Deno.test("dominio parecido NAO passa", () => {
  // O caso que um `includes("supabase.co")` deixaria entrar. Este domínio
  // qualquer um registra, e por ele se alcança o que o proxy alcança.
  assertEquals(enderecoPermitido("https://supabase.co.exemplo.com/x"), false);
  assertEquals(enderecoPermitido("https://naosupabase.com/x"), false);
});

Deno.test("esquema que nao e http(s) NAO passa", () => {
  // `file://` leria o disco da função; `gopher://` e amigos são clássicos de
  // SSRF. O Python recusa pelo mesmo motivo.
  assertEquals(enderecoPermitido("file:///etc/passwd"), false);
  assertEquals(enderecoPermitido("ftp://exemplo.supabase.co/x"), false);
  assertEquals(enderecoPermitido(""), false);
  assertEquals(enderecoPermitido("nao e url"), false);
});

Deno.test("a rota aceita com e sem o prefixo api/", () => {
  assertEquals(pedacosDaRota("/functions/v1/arquivo/proxy"), ["proxy"]);
  assertEquals(pedacosDaRota("/functions/v1/arquivo/api/proxy"), ["proxy"]);
});
