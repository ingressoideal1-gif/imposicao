/** Transporte restrito a SMTP sobre TLS/465, texto UTF-8 e um destinatário.
 * Não aceita host, credenciais, anexos ou comandos vindos da requisição.
 * Usa TLS nativo do Deno com validação de certificado, sem novas dependências.
 */
import { Recusa } from "./sessao.ts";

export type ConfigSmtpArtes = { host: string; usuario: string; senha: string; remetente: string; nome: string };
export type MensagemArte = { to: string; subject: string; text: string };
export type ConexaoSmtp = Pick<Deno.TlsConn, "read" | "write" | "close">;
type Conectar = (opcoes: { hostname: string; port: number }) => Promise<ConexaoSmtp>;

function base64(texto: string): string {
  let binario = "";
  for (const byte of new TextEncoder().encode(texto)) binario += String.fromCharCode(byte);
  return btoa(binario);
}

// Encoded-words curtas preservam UTF-8 e o limite de linha dos cabeçalhos MIME.
function cabecalho(texto: string): string {
  const partes: string[] = [];
  let atual = "";
  for (const caractere of texto) {
    if (new TextEncoder().encode(atual + caractere).length > 42) {
      partes.push(`=?UTF-8?B?${base64(atual)}?=`); atual = "";
    }
    atual += caractere;
  }
  if (atual) partes.push(`=?UTF-8?B?${base64(atual)}?=`);
  return partes.join("\r\n ");
}

export function mensagemMime(config: ConfigSmtpArtes, mensagem: MensagemArte): string {
  const corpo = base64(mensagem.text.replace(/\r?\n/g, "\r\n")).match(/.{1,76}/g)?.join("\r\n") || "";
  return [
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <${crypto.randomUUID()}@${config.remetente.split("@")[1]}>`,
    `From: ${cabecalho(config.nome)} <${config.remetente}>`,
    `To: <${mensagem.to}>`, `Subject: ${cabecalho(mensagem.subject)}`,
    'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64', "", corpo, "",
  ].join("\r\n");
}

export async function enviarSmtpArtes(
  config: ConfigSmtpArtes, mensagem: MensagemArte,
  conectar?: Conectar, limiteMs?: number,
): Promise<void> {
  return await executarSmtpArtes(config, mensagem, conectar, limiteMs);
}

/** Valida a conta sem MAIL FROM, RCPT TO ou DATA. Usado na ativação do serviço. */
export async function verificarSmtpArtes(
  config: ConfigSmtpArtes, conectar?: Conectar, limiteMs?: number,
): Promise<void> {
  return await executarSmtpArtes(config, null, conectar, limiteMs);
}

async function executarSmtpArtes(
  config: ConfigSmtpArtes, mensagem: MensagemArte | null,
  conectar: Conectar = (opcoes) => Deno.connectTls(opcoes), limiteMs = 25000,
): Promise<void> {
  let conexao: ConexaoSmtp | undefined;
  let encerrado = false;
  let iniciouDados = false;
  let aceito = false;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  const fechar = () => { try { conexao?.close(); } catch { /* Já fechada. */ } };

  const operacao = async () => {
    const nova = await conectar({ hostname: config.host, port: 465 });
    if (encerrado) { nova.close(); return; }
    conexao = nova;
    let pendente = "";
    const decoder = new TextDecoder();
    const buffer = new Uint8Array(2048);
    async function linha(): Promise<string> {
      while (!pendente.includes("\r\n")) {
        if (pendente.length > 4096) throw new Error("resposta SMTP inválida");
        const n = await nova.read(buffer);
        if (!n) throw new Error("conexão SMTP encerrada");
        pendente += decoder.decode(buffer.subarray(0, n), { stream: true });
      }
      const fim = pendente.indexOf("\r\n");
      if (fim > 4096) throw new Error("linha SMTP longa");
      const resultado = pendente.slice(0, fim);
      pendente = pendente.slice(fim + 2);
      return resultado;
    }
    async function resposta(codigos: number[]): Promise<string[]> {
      const linhas: string[] = [];
      let codigo: number | undefined;
      for (let i = 0; i < 64; i++) {
        const atual = await linha();
        const m = /^(\d{3})([ -])(.*)$/.exec(atual);
        if (!m || (codigo !== undefined && Number(m[1]) !== codigo)) throw new Error("resposta SMTP inválida");
        codigo = Number(m[1]);
        linhas.push(m[3]);
        if (m[2] === " ") {
          if (!codigos.includes(codigo)) {
            if (codigo === 534 || codigo === 535) throw new Recusa(502, "A hospedagem recusou a autenticação SMTP. Avise o administrador.");
            throw new Recusa(502, "A hospedagem recusou o envio. Confira o destinatário e as configurações com o administrador.");
          }
          return linhas;
        }
      }
      throw new Error("resposta SMTP longa");
    }
    async function escrever(texto: string) {
      const bytes = new TextEncoder().encode(texto);
      let offset = 0;
      while (offset < bytes.length) {
        if (encerrado) throw new Error("operação encerrada");
        const n = await nova.write(bytes.subarray(offset));
        if (n <= 0) throw new Error("escrita SMTP interrompida");
        offset += n;
      }
    }
    async function comando(texto: string, codigos: number[]) {
      await escrever(texto + "\r\n");
      return await resposta(codigos);
    }
    await resposta([220]);
    const ehlo = await comando("EHLO " + config.remetente.split("@")[1], [250]);
    const mecanismos = ehlo.filter(s => /^AUTH[ =]/i.test(s)).join(" ").toUpperCase().split(/[ =]+/);
    if (mecanismos.includes("PLAIN")) {
      await comando("AUTH PLAIN", [334]);
      await comando(base64("\0" + config.usuario + "\0" + config.senha), [235]);
    } else if (mecanismos.includes("LOGIN")) {
      await comando("AUTH LOGIN", [334]);
      await comando(base64(config.usuario), [334]);
      await comando(base64(config.senha), [235]);
    } else {
      throw new Recusa(502, "A hospedagem precisa oferecer autenticação SMTP PLAIN ou LOGIN sobre TLS. Avise o administrador.");
    }
    if (mensagem === null) {
      aceito = true;
      try { await comando("QUIT", [221]); } catch { /* Login já confirmado. */ }
      return;
    }
    await comando(`MAIL FROM:<${config.remetente}>`, [250]);
    await comando(`RCPT TO:<${mensagem.to}>`, [250, 251]);
    await comando("DATA", [354]);
    iniciouDados = true;
    // Corpo em base64 não contém linhas iniciadas por ponto nem comandos SMTP.
    await escrever(mensagemMime(config, mensagem) + ".\r\n");
    await resposta([250]);
    aceito = true;
    // Uma falha depois do 250 não pode transformar mensagem aceita em falha.
    try { await comando("QUIT", [221]); } catch { /* Aceitação já confirmada. */ }
  };
  try {
    await Promise.race([
      operacao(),
      new Promise<never>((_, rejeitar) => {
        temporizador = setTimeout(() => {
          encerrado = true; fechar(); rejeitar(new Error("tempo SMTP esgotado"));
        }, limiteMs);
      }),
    ]);
  } catch (e) {
    if (aceito) return;
    if (e instanceof Recusa) throw e;
    throw new Recusa(502, iniciouDados
      ? "Não foi possível confirmar o envio. Confira o recebimento antes de tentar novamente."
      : "Não foi possível conectar ao e-mail da hospedagem. Avise o administrador.");
  } finally {
    encerrado = true;
    if (temporizador !== undefined) clearTimeout(temporizador);
    fechar();
  }
}
