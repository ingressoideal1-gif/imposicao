/** E-mail de aprovação: identidade do painel, configuração somente na nuvem. */
import { banco } from "./banco.ts";
import { Recusa } from "./sessao.ts";
import { layoutEmailArte } from "./email_artes_layout.ts";
import { enviarSmtpArtes, type ConfigSmtpArtes, type MensagemArte } from "./smtp_artes.ts";

type Quem = { id: string; email: string; permissoes: Record<string, unknown> | null };
type Dependencias = {
  consultar?: typeof banco;
  ambiente?: (nome: string) => string | undefined;
  enviar?: (config: ConfigSmtpArtes, mensagem: MensagemArte) => Promise<void>;
};
const PORTAL = "https://imposition.ai-ideal.com.br";
const ENDERECO = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\.[a-zA-Z]{2,}$/;

function email(valor: unknown): string {
  if (typeof valor !== "string" || valor.length > 254 || !ENDERECO.test(valor)) {
    throw new Recusa(422, "Informe um endereço de e-mail válido.");
  }
  return valor;
}

function texto(valor: unknown, limite: number, multilinha = false): string {
  if (typeof valor !== "string" || !valor.trim() || valor.length > limite ||
      (multilinha ? /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/ : /[\x00-\x1f\x7f]/).test(valor)) {
    throw new Recusa(422, "Confira o assunto e a mensagem do e-mail.");
  }
  return valor.trim();
}

function configuracao(ler: (nome: string) => string | undefined) {
  const remetente = ler("EMAIL_ARTES_REMETENTE") || "contato@ingressoideal.com.br";
  const nome = ler("EMAIL_ARTES_NOME") || "Ingresso Ideal — Atendimento";
  const host = ler("EMAIL_ARTES_SMTP_HOST") || "";
  const usuario = ler("EMAIL_ARTES_SMTP_USER") || remetente;
  const senha = ler("EMAIL_ARTES_SMTP_PASSWORD") || "";
  const porta = ler("EMAIL_ARTES_SMTP_PORT") || "465";
  const portal = ler("EMAIL_ARTES_PORTAL_URL") || PORTAL;
  let pronta = false;
  try {
    const url = new URL(portal);
    pronta = !!host && /^[a-zA-Z0-9.-]+$/.test(host) && host.includes(".") &&
      porta === "465" && !!senha && senha.length <= 1024 && !/[\x00\r\n]/.test(senha) &&
      !!texto(usuario, 254) && !!email(remetente) && !!texto(nome, 120) &&
      url.protocol === "https:" && url.origin === portal && !url.username && !url.password;
  } catch { /* A tela só recebe o estado, nunca valores secretos ou erros brutos. */ }
  return { pronta, portal, config: { host, usuario, senha, remetente, nome } };
}

/** Todos os perfis usam a grade de leitura de pedidos existente; não exige admin. */
export async function operarEmailArtes(
  acao: string, entrada: unknown, quem: Quem, deps: Dependencias = {},
) {
  if (!quem.id) throw new Recusa(401, "Entre na sua conta para enviar e-mails.");
  // A grade vigente é a fonte da autorização, independentemente do papel.
  const leituras = ["perm_pedidos_view", "perm_producao_view", "perm_acabamento_view", "perm_lista_arte_view", "perm_numeracao_view"];
  if (!leituras.some(chave => quem.permissoes?.[chave] === true)) {
    throw new Recusa(403, "Sem permissão para acessar pedidos no painel.");
  }
  const estado = configuracao(deps.ambiente || ((nome) => Deno.env.get(nome)));
  if (acao === "config") {
    return { ok: true, config: {
      email_remetente: estado.config.remetente, nome_remetente: estado.config.nome,
      configurado: estado.pronta,
    } };
  }
  if (!["enviar", "testar"].includes(acao)) throw new Recusa(404, "Operação de e-mail inexistente.");
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) {
    throw new Recusa(422, "Esperava os dados do e-mail.");
  }
  const corpo = entrada as Record<string, unknown>;
  const campos = acao === "testar" ? [] : ["os_id", "link_url", "to", "subject", "body_text"];
  if (Object.keys(corpo).some(k => !campos.includes(k))) {
    throw new Recusa(422, "Campo não permitido no envio de e-mail.");
  }
  if (!estado.pronta) {
    throw new Recusa(503, "O envio de e-mail ainda não foi configurado na nuvem. Avise o administrador.");
  }

  let mensagem: MensagemArte;
  if (acao === "testar") {
    // O destinatário do teste vem da sessão verificada, nunca do navegador.
    mensagem = { to: email(quem.email), subject: "Teste de e-mail — Ideal Imposition",
      text: "O envio de e-mails do painel está funcionando pela nuvem. Confira também a pasta de spam." };
    Object.assign(mensagem, layoutEmailArte(mensagem.text, estado.portal));
  } else {
    const id = corpo.os_id;
    if (typeof id !== "string" || !/^(vibe_[1-9][0-9]{0,14}|[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})$/.test(id)) {
      throw new Recusa(422, "Pedido inválido para envio de arte.");
    }
    const to = email(corpo.to), subject = texto(corpo.subject, 200);
    const body = texto(corpo.body_text, 50000, true);
    let linhas;
    try {
      linhas = await (deps.consultar || banco)("GET",
        `pedidos_links_cliente?os_id=eq.${encodeURIComponent(id)}&ativo=eq.true&select=os_id,numero_pedido,token&limit=2`);
    } catch { throw new Recusa(503, "Não foi possível conferir o link de aprovação. Tente mais tarde."); }
    if (!Array.isArray(linhas) || linhas.length !== 1 || linhas[0].os_id !== id ||
        !/^[0-9]+$/.test(String(linhas[0].numero_pedido)) || !/^[a-zA-Z0-9]{6,12}$/.test(linhas[0].token)) {
      throw new Recusa(409, "O pedido precisa de um único link de aprovação ativo antes do envio.");
    }
    const caminho = `/cliente/${linhas[0].numero_pedido}-${linhas[0].token}`;
    let link: URL;
    try { link = new URL(String(corpo.link_url)); }
    catch { throw new Recusa(422, "Link de aprovação inválido."); }
    const origemConhecida = [estado.portal, PORTAL, "https://ideal-imposition.vercel.app", "https://imposicao.vercel.app"].includes(link.origin) ||
      (link.protocol === "http:" && ["localhost", "127.0.0.1"].includes(link.hostname));
    if (!origemConhecida || link.pathname !== caminho || link.search || link.hash || link.username || link.password ||
        typeof corpo.link_url !== "string" || !body.includes(corpo.link_url)) {
      throw new Recusa(409, "O link da mensagem não corresponde ao pedido. Reabra o envio pela Lista de Artes.");
    }
    // Mesma fonte do orçamento no portal. Não recalcular preços a partir das artes.
    let propostas;
    try {
      propostas = await (deps.consultar || banco)("GET",
        `propostas?id_int=eq.${linhas[0].numero_pedido}&select=id_int,texto_whatsapp,vendedor&limit=2`);
    } catch { throw new Recusa(503, "Não foi possível consultar o resumo do orçamento. Tente mais tarde."); }
    if (!Array.isArray(propostas) || propostas.length > 1 ||
        (propostas.length === 1 && String(propostas[0].id_int) !== String(linhas[0].numero_pedido))) {
      throw new Recusa(409, "Não foi possível identificar o orçamento deste pedido.");
    }
    const resumo = propostas[0]?.texto_whatsapp;
    if (resumo != null && (typeof resumo !== "string" || resumo.length > 50000)) {
      throw new Recusa(503, "O resumo do orçamento precisa ser conferido antes do envio.");
    }
    const orcamento = resumo?.trim() || "Resumo não disponível neste e-mail. Consulte a aba Orçamento no link de aprovação ou fale com o atendimento.";
    // Responsável da proposta, nunca o nome informado pelo navegador.
    const vendedor = typeof propostas[0]?.vendedor === "string" ? propostas[0].vendedor : "";
    // Links montados na estação também saem com o domínio público configurado.
    mensagem = { to, subject, text: body.replaceAll(corpo.link_url, estado.portal + caminho) };
    Object.assign(mensagem, layoutEmailArte(mensagem.text, estado.portal, estado.portal + caminho, String(linhas[0].numero_pedido), orcamento, vendedor));
  }
  const referencia = crypto.randomUUID();
  try {
    await (deps.enviar || enviarSmtpArtes)(estado.config, mensagem);
  } catch (e) {
    // Sem corpo, endereço do cliente, token de aprovação ou resposta SMTP no log.
    console.info(JSON.stringify({ evento: "email_artes", referencia, autor: quem.id, resultado: "falha" }));
    if (e instanceof Recusa) throw e;
    throw new Recusa(502, "Não foi possível confirmar o envio. Confira o recebimento antes de tentar novamente.");
  }
  console.info(JSON.stringify({ evento: "email_artes", referencia, autor: quem.id, resultado: "aceito" }));
  return { ok: true, referencia, message: "E-mail aceito pelo servidor de envio. Isso ainda não confirma a entrega na caixa de entrada." };
}
