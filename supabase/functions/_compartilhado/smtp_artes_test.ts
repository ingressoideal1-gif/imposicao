import { strict as assert } from "node:assert";
import { enviarSmtpArtes, verificarSmtpArtes, mensagemMime, type ConexaoSmtp } from "./smtp_artes.ts";
import { Recusa } from "./sessao.ts";

const config = { host: "smtp.example.com", usuario: "arte@example.com", senha: "senha-sintetica", remetente: "arte@example.com", nome: "Gráfica — Atendimento" };
const mensagem = { to: "cliente@example.com", subject: "Aprovação de arte 🎨", text: "Olá!\n.\nMAIL FROM: falso\nhttps://portal.example/cliente/11-abc123" };
function servidor(respostas: string, fragmento = 5) {
  let restante = new TextEncoder().encode(respostas), escrita = "", fechado = false;
  const conn: ConexaoSmtp = {
    read: (buffer) => {
      if (!restante.length) return Promise.resolve(null);
      const n = Math.min(fragmento, buffer.length, restante.length);
      buffer.set(restante.subarray(0, n)); restante = restante.subarray(n); return Promise.resolve(n);
    },
    write: (buffer) => {
      const n = Math.min(fragmento, buffer.length);
      escrita += new TextDecoder().decode(buffer.subarray(0, n)); return Promise.resolve(n);
    },
    close: () => { fechado = true; },
  };
  return { conn, escrita: () => escrita, fechado: () => fechado };
}
const inicio = "220 smtp teste\r\n250-smtp.example.com\r\n250 AUTH PLAIN LOGIN\r\n334 \r\n235 autenticado\r\n";
const envio = "250 remetente\r\n250 destinatario\r\n354 dados\r\n250 aceito\r\n221 fim\r\n";

Deno.test("SMTP: validação da conta autentica sem enviar mensagem", async () => {
  const s = servidor(inicio + "221 fim\r\n");
  await verificarSmtpArtes(config, async () => s.conn);
  assert.match(s.escrita(), /AUTH PLAIN/);
  assert.doesNotMatch(s.escrita(), /MAIL FROM|RCPT TO|DATA/);
  assert.match(s.escrita(), /QUIT\r\n$/);
  assert.equal(s.fechado(), true);
});

Deno.test("SMTP: TLS/465, PLAIN, respostas fragmentadas, escritas parciais e aceitação final", async () => {
  const s = servidor(inicio + envio);
  await enviarSmtpArtes(config, mensagem, async (opcoes) => {
    assert.deepEqual(opcoes, { hostname: config.host, port: 465 }); return s.conn;
  });
  const texto = s.escrita();
  assert.match(texto, /^EHLO example.com\r\nAUTH PLAIN\r\n/);
  assert.equal(texto.includes(btoa("\0" + config.usuario + "\0" + config.senha)), true);
  assert.match(texto, /MAIL FROM:<arte@example.com>\r\nRCPT TO:<cliente@example.com>\r\nDATA\r\n/);
  assert.match(texto, /\r\n\.\r\nQUIT\r\n$/);
  assert.equal(texto.includes("MAIL FROM: falso"), false);
  assert.equal(s.fechado(), true);
});
Deno.test("SMTP: usa LOGIN quando PLAIN não foi anunciado", async () => {
  const s = servidor("220 smtp\r\n250 AUTH LOGIN\r\n334 usuario\r\n334 senha\r\n235 ok\r\n" + envio);
  await enviarSmtpArtes(config, mensagem, async () => s.conn);
  assert.equal(s.escrita().includes("AUTH LOGIN\r\n" + btoa(config.usuario) + "\r\n" + btoa(config.senha)), true);
});
Deno.test("SMTP: autenticação recusada não envia dados nem expõe segredo", async () => {
  const s = servidor("220 smtp\r\n250 AUTH PLAIN\r\n334 \r\n535 senha-sintetica\r\n");
  await assert.rejects(() => enviarSmtpArtes(config, mensagem, async () => s.conn),
    (e: unknown) => e instanceof Recusa && /autenticação/.test(e.message) && !e.message.includes(config.senha));
  assert.equal(s.escrita().includes("MAIL FROM"), false); assert.equal(s.fechado(), true);
});
Deno.test("SMTP: destinatário recusado impede DATA", async () => {
  const s = servidor(inicio + "250 remetente\r\n550 destinatario recusado\r\n");
  await assert.rejects(() => enviarSmtpArtes(config, mensagem, async () => s.conn), Recusa);
  assert.equal(s.escrita().includes("DATA"), false); assert.equal(s.fechado(), true);
});
Deno.test("SMTP: não declara aceitação quando conexão cai após DATA", async () => {
  const s = servidor(inicio + "250 remetente\r\n250 destinatario\r\n354 dados\r\n");
  await assert.rejects(() => enviarSmtpArtes(config, mensagem, async () => s.conn),
    (e: unknown) => e instanceof Recusa && /Confira o recebimento/.test(e.message));
  assert.equal(s.fechado(), true);
});
Deno.test("SMTP: falha em QUIT não desfaz aceitação confirmada", async () => {
  const s = servidor(inicio + envio.replace("221 fim\r\n", ""));
  await enviarSmtpArtes(config, mensagem, async () => s.conn);
  assert.equal(s.fechado(), true);
});
Deno.test("SMTP: resposta sem limite, códigos inconsistentes e auth incompatível são recusados", async () => {
  for (const resposta of ["x".repeat(5000), "220-primeira\r\n250 ultima\r\n", "220 smtp\r\n250 AUTH XOAUTH2\r\n"]) {
    const s = servidor(resposta, 2048);
    await assert.rejects(() => enviarSmtpArtes(config, mensagem, async () => s.conn), Recusa);
    assert.equal(s.escrita().includes("MAIL FROM"), false); assert.equal(s.fechado(), true);
  }
});
Deno.test("SMTP: erro de TLS é sanitizado e não tenta conexão sem criptografia", async () => {
  let chamadas = 0;
  await assert.rejects(() => enviarSmtpArtes(config, mensagem, () => {
    chamadas++; throw new Error("certificado servidor senha-sintetica");
  }), (e: unknown) => e instanceof Recusa && !e.message.includes("senha-sintetica"));
  assert.equal(chamadas, 1);
});
Deno.test("SMTP: timeout fecha conexão que chega atrasada sem transmitir credenciais", async () => {
  const s = servidor(inicio + envio);
  const conexao = new Promise<ConexaoSmtp>(resolve => setTimeout(() => resolve(s.conn), 20));
  await assert.rejects(() => enviarSmtpArtes(config, mensagem, () => conexao, 2), Recusa);
  await conexao;
  assert.equal(s.escrita(), ""); assert.equal(s.fechado(), true);
});
Deno.test("MIME: preserva acentos, emoji, quebras e texto literal sem injetar comandos", () => {
  const mime = mensagemMime(config, { ...mensagem, subject: mensagem.subject.repeat(8) });
  const [headers, body] = mime.split("\r\n\r\n");
  const texto = new TextDecoder().decode(Uint8Array.from(atob(body.replace(/\s/g, "")), c => c.charCodeAt(0)));
  assert.equal(texto, mensagem.text.replace(/\n/g, "\r\n"));
  assert.equal(headers.includes("Content-Transfer-Encoding: base64"), true);
  assert.equal(headers.split("\r\n").every(l => l.length <= 998), true);
  for (const m of headers.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)) {
    assert.equal(m[0].length <= 75, true);
    new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(m[1]), c => c.charCodeAt(0)));
  }
});
