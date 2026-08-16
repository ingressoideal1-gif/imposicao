/**
 * Os bilhetes assinados do controle de acesso: QR do Pedido e elevacao.
 *
 * Porte de `qr_pedido.py` e `acesso_elevacao.py`. Os dois modulos do Python usam
 * a MESMA funcao de assinar -- HMAC-SHA256, base64url sem `=`, cortada em 27
 * caracteres -- e diferem so no segredo e no formato do corpo. Aqui isso vira
 * uma primitiva e dois codecs.
 *
 * ## Por que 27 caracteres
 *
 * 27 caracteres base64url sao 162 bits. Muito acima do necessario para impedir
 * forja, e curto o bastante para o QR nao ficar denso -- ele e lido de uma tela
 * de celular, as vezes de uma foto de WhatsApp.
 *
 * ## A regra que nao pode ser perdida no porte
 *
 * O corpo assinado e montado por concatenacao com PONTOS, e nenhum campo pode
 * conter ponto. Sem essa recusa da para deslocar os campos e fazer uma
 * assinatura valer para outra combinacao -- por exemplo um bilhete de elevacao
 * emitido para o evento A valendo para o evento B, se o identificador de um
 * carregasse um ponto no lugar certo.
 *
 * ## E a ordem de conferencia
 *
 * ASSINATURA ANTES DE VALIDADE, nos dois codecs. Conferir a validade primeiro
 * contaria, a quem estivesse tentando, que aquele token existiu algum dia -- e o
 * vencimento e justamente o campo que o atacante controla no palpite.
 */

const TAMANHO_ASSINATURA = 27;

/** `re.compile(r"^[A-Za-z0-9_-]{1,64}$")` do `acesso_elevacao.py:41`. */
const IDENTIFICADOR = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Comparacao de tempo constante.
 *
 * O Python usa `hmac.compare_digest` nos mesmos lugares, e isso NAO e enfeite
 * que se possa trocar por `===` na traducao: o `===` sai no primeiro caractere
 * diferente, e o tempo de resposta passa a contar quantos caracteres da
 * assinatura o atacante ja acertou.
 */
export function iguaisEmTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) {
    diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diferenca === 0;
}

function precisaDoSegredo(nome: string): string {
  const v = Deno.env.get(nome);
  if (!v) {
    // Falha alto, como o Python. Assinar com segredo vazio seria pior do que
    // nao assinar: pareceria protegido.
    throw new Error(
      `${nome} nao esta no ambiente desta funcao. Configure com ` +
        `\`supabase secrets set ${nome}=...\` -- o mesmo valor do Render, sem ` +
        `rotacionar, enquanto as duas pilhas convivem.`,
    );
  }
  return v;
}

/**
 * `base64.urlsafe_b64encode(mac).rstrip("=")[:27]` do Python.
 *
 * O `btoa` devolve base64 padrao, com `+` e `/`; base64url troca por `-` e `_`.
 * Errar essa troca daria assinaturas que batem em 62 dos 64 simbolos e falham
 * no resto -- um defeito que passa em quase todo teste de mesa.
 */
async function assinar(segredoNome: string, corpo: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(precisaDoSegredo(segredoNome)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign(
    "HMAC",
    chave,
    new TextEncoder().encode(corpo),
  );
  const bruto = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return bruto.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
    .slice(0, TAMANHO_ASSINATURA);
}

/** Exposta para o teste de paridade, que precisa assinar corpos de mesa. */
export const assinarCorpo = assinar;

function agoraEmSegundos(): number {
  return Math.floor(Date.now() / 1000);
}

// ── QR do Pedido ────────────────────────────────────────────────────────────

export const SEGREDO_QR_PEDIDO = "QR_PEDIDO_SEGREDO";
const VALIDADE_PADRAO_DIAS = 180;

/** `<pedido>.<vencimento>.<assinatura>` -- pronto para ir numa URL. */
export async function gerarQrPedido(
  pedidoIdInt: number,
  dias = VALIDADE_PADRAO_DIAS,
): Promise<string> {
  const corpo = `${Math.trunc(pedidoIdInt)}.${agoraEmSegundos() + Math.trunc(dias) * 86400}`;
  return `${corpo}.${await assinar(SEGREDO_QR_PEDIDO, corpo)}`;
}

/**
 * Devolve o numero do pedido, ou lanca `Error` dizendo por que.
 *
 * A assinatura cobre pedido E vencimento: nao adianta trocar o numero para
 * entrar no evento do vizinho, nem esticar a data para reviver um token.
 */
export async function conferirQrPedido(token: string): Promise<number> {
  const partes = String(token ?? "").split(".");
  if (partes.length !== 3 || partes.some((p) => !p)) {
    throw new Error("token malformado");
  }
  const [pedido, expira, assinatura] = partes;
  if (!/^\d+$/.test(pedido) || !/^\d+$/.test(expira)) {
    throw new Error("token malformado");
  }
  if (
    !iguaisEmTempoConstante(
      await assinar(SEGREDO_QR_PEDIDO, `${pedido}.${expira}`),
      assinatura,
    )
  ) {
    throw new Error("assinatura invalida");
  }
  if (Number(expira) < agoraEmSegundos()) throw new Error("token vencido");
  return Number(pedido);
}

// ── Elevacao de 15 minutos ──────────────────────────────────────────────────

export const SEGREDO_ELEVACAO = "ACESSO_ELEVACAO_SEGREDO";
const VALIDADE_MINUTOS = 15;

function conferirIdentificadores(...valores: string[]): void {
  for (const v of valores) {
    if (!IDENTIFICADOR.test(String(v ?? ""))) {
      throw new Error("identificador invalido");
    }
  }
}

/** `<evento>.<conta>.<navegador>.<vencimento>.<assinatura>` e o vencimento. */
export async function gerarElevacao(
  eventoId: string,
  contaId: string,
  navegador: string,
  minutos = VALIDADE_MINUTOS,
): Promise<{ token: string; expira: number }> {
  conferirIdentificadores(eventoId, contaId, navegador);
  const expira = agoraEmSegundos() + Math.trunc(minutos) * 60;
  const corpo = `${eventoId}.${contaId}.${navegador}.${expira}`;
  return { token: `${corpo}.${await assinar(SEGREDO_ELEVACAO, corpo)}`, expira };
}

/**
 * Lanca `Error` dizendo o que houve. Silencio e aprovacao.
 *
 * A assinatura e recalculada sobre os valores que o CHAMADOR afirma, e nao
 * sobre os que vieram no token. Assim um bilhete emitido para outro evento,
 * outra conta ou outro navegador simplesmente nao bate -- sem precisar de uma
 * comparacao campo a campo que alguem possa esquecer de escrever.
 */
export async function conferirElevacao(
  token: string,
  eventoId: string,
  contaId: string,
  navegador: string,
): Promise<void> {
  conferirIdentificadores(eventoId, contaId, navegador);

  const partes = String(token ?? "").split(".");
  if (partes.length !== 5 || partes.some((p) => !p)) {
    throw new Error("token malformado");
  }
  const expira = partes[3];
  if (!/^\d+$/.test(expira)) throw new Error("token malformado");

  const corpo = `${eventoId}.${contaId}.${navegador}.${expira}`;
  if (
    !iguaisEmTempoConstante(await assinar(SEGREDO_ELEVACAO, corpo), partes[4])
  ) {
    throw new Error("assinatura invalida");
  }
  if (Number(expira) < agoraEmSegundos()) throw new Error("token vencido");
}
