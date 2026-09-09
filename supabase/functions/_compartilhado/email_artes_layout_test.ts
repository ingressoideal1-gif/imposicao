import { strict as assert } from "node:assert";
import { layoutEmailArte } from "./email_artes_layout.ts";
import { mensagemMime } from "./smtp_artes.ts";

const portal = "https://portal.example";
const link = portal + "/cliente/11-abc123";
Deno.test("layout: botao antes dos modelos, logo, WhatsApp e texto alternativo", () => {
  const texto = `Olá, Cliente!\n\nSuas artes estão prontas.\n\nRESUMO DOS MODELOS DO PEDIDO:\n\n[01] Pulseira\nQuantidade: 5000\nArte: https://storage.example/arte.pdf\n\nLINK DE APROVAÇÃO INTERATIVA:\n${link}`;
  const r = layoutEmailArte(texto, portal, link, "11");
  assert.ok(r.html.indexOf("Abrir aprovação interativa") < r.html.indexOf("[01] Pulseira"));
  assert.ok(r.html.includes(`src="${portal}/logo.png"`));
  assert.ok(r.html.includes(`href="${link}"`));
  assert.match(r.html, /phone=555195343478/);
  assert.ok(r.text.startsWith(texto));
  assert.match(r.html, /Abrir arquivo da arte/);
  assert.doesNotMatch(r.html, />https:\/\/storage.example/);
});
Deno.test("layout: HTML editado e atributos de links sao escapados", () => {
  const r = layoutEmailArte('<script>alert(1)</script>\n<img src=x onerror="alert(2)">\nhttps://storage.example/a?x=1&y=2\njavascript:alert(3)', portal, link, "11");
  assert.doesNotMatch(r.html, /<script|<img src=x|href="javascript:/);
  assert.match(r.html, /&lt;script&gt;/);
  assert.match(r.html, /x=1&amp;y=2/);
});
Deno.test("layout: teste de remetente nao inventa link de aprovacao", () => {
  const r = layoutEmailArte("Teste sintético", portal);
  assert.match(r.html, /Abrir painel/);
  assert.doesNotMatch(r.html, /Abrir aprovação interativa|\/cliente\//);
});
Deno.test("MIME: texto e HTML UTF-8 decodificam sem corromper assunto nem links", () => {
  const corpo = layoutEmailArte("Olá! Aprovação de arte.", portal, link, "11");
  const mime = mensagemMime({host:"smtp.example",usuario:"arte@example.com",senha:"sintetica",remetente:"arte@example.com",nome:"Ingresso Ideal"}, {to:"cliente@example.com",subject:"Aprovação — Pedido #11",...corpo});
  const boundary = mime.match(/boundary="([^"]+)"/)![1];
  const parts = mime.split("--" + boundary);
  assert.equal(parts.length, 4);
  assert.match(parts[1], /text\/plain/);
  assert.match(parts[2], /text\/html/);
  for (const [index, expected] of [[1, corpo.text], [2, corpo.html]] as const) {
    const b64 = parts[index].split("\r\n\r\n")[1].trim();
    const decoded = new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\s/g, "")), c => c.charCodeAt(0)));
    assert.equal(decoded.replace(/\r\n/g,"\n"), expected.replace(/\r\n/g,"\n"));
  }
  assert.match(mime, /To: <cliente@example.com>/);
});
