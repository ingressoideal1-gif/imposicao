/** Aprovação via ChatGuru. Destinatário e mensagem resolvidos no servidor. */
import { banco } from "./banco.ts";
import { exigirOperadorPropostas } from "./propostas.ts";
import { Recusa } from "./sessao.ts";

type Deps = { consultar?: typeof banco; ambiente?: (k: string) => string | undefined; fetch?: typeof fetch };
type Quem = { id: string; permissoes: Record<string, unknown> | null };
const PORTAL = "https://imposition.ai-ideal.com.br";
const TABELA = "imposition_whatsapp_artes";

export function telefoneWhatsApp(valor: unknown, ddi: string): string {
  if (typeof valor !== "string" || !/^[+\d\s().-]+$/.test(valor)) throw new Recusa(422, "Corrija o WhatsApp do contato selecionado no pedido.");
  let n = valor.replace(/\D/g, "");
  // DDI nacional somente quando explicitamente configurado pelo administrador.
  if (!valor.trim().startsWith("+") && /^[1-9]\d{9,10}$/.test(n)) {
    if (ddi !== "55") throw new Recusa(422, "O contato está sem DDI. Corrija o cadastro ou configure o DDI brasileiro na integração.");
    n = ddi + n;
  }
  if (!/^[1-9]\d{10,14}$/.test(n)) throw new Recusa(422, "Informe o WhatsApp com DDI e DDD no contato do pedido.");
  return n;
}

async function hash(texto: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto))), b => b.toString(16).padStart(2, "0")).join("");
}
function uma(linhas: any, aviso: string) {
  if (!Array.isArray(linhas) || linhas.length !== 1) throw new Recusa(409, aviso);
  return linhas[0];
}

export async function operarWhatsappArtes(acao: string, entrada: unknown, quem: Quem, deps: Deps = {}) {
  if (!quem.id) throw new Recusa(401, "Entre na sua conta do painel.");
  exigirOperadorPropostas(quem.permissoes, "consultar");
  if (!["preparar", "enviar", "reenviar", "status", "concluir"].includes(acao)) throw new Recusa(404, "Operação inexistente.");
  const c = entrada as Record<string, unknown>;
  if (!c || typeof c !== "object" || Array.isArray(c) || Object.keys(c).some(k => !["os_id", "confirmacao"].includes(k)) ||
      typeof c.os_id !== "string" || !/^(vibe_[1-9]\d{0,14}|[0-9a-fA-F]{8}(?:-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12})$/.test(c.os_id)) {
    throw new Recusa(422, "Pedido inválido para envio.");
  }
  const ler = deps.ambiente || ((k: string) => Deno.env.get(k));
  const endpoint = ler("CHATGURU_ENDPOINT") || "";
  const key = ler("CHATGURU_KEY") || "", account = ler("CHATGURU_ACCOUNT_ID") || "", phone = ler("CHATGURU_PHONE_ID") || "";
  if (!/^https:\/\/(?:[a-z0-9-]+\.chatguru\.app|app\.zap\.guru)\/api\/v1\/?$/.test(endpoint)) {
    throw new Recusa(503, "O endereço CHATGURU_ENDPOINT está ausente ou fora dos endereços permitidos da integração.");
  }
  if (!key || !account || !phone) {
    throw new Recusa(503, "Complete os secrets CHATGURU_KEY, CHATGURU_ACCOUNT_ID e CHATGURU_PHONE_ID na nuvem.");
  }
  const db: typeof banco = async (...args) => {
    try { return await (deps.consultar || banco)(...args); }
    catch { throw new Recusa(503, "Não foi possível confirmar o registro do envio. Consulte o status antes de tentar novamente."); }
  };
  const link = uma(await db("GET", `pedidos_links_cliente?os_id=eq.${encodeURIComponent(c.os_id)}&ativo=eq.true&select=os_id,numero_pedido,token,arte_pronta_em&limit=2`), "O pedido precisa de um único link ativo.");
  if (!/^[1-9]\d*$/.test(String(link.numero_pedido)) || !/^[a-zA-Z0-9]{6,12}$/.test(link.token) || !link.arte_pronta_em) {
    throw new Recusa(409, "Prepare a arte e o link antes do envio.");
  }
  const proposta = uma(await db("GET", `propostas?id_int=eq.${link.numero_pedido}&select=id_int,id_contato,id_cliente,id_faturado&limit=2`), "Pedido inexistente ou ambíguo.");
  const contatoId = String(proposta.id_contato || "").trim();
  if (!/^[1-9]\d*$/.test(contatoId)) throw new Recusa(422, "Selecione um contato no pedido antes de enviar.");
  const contato = uma(await db("GET", `contatos?id=eq.${contatoId}&select=id,id_cliente,nome_contato,whats&limit=2`), "O contato selecionado não foi encontrado.");
  if (![proposta.id_cliente, proposta.id_faturado].filter(v => v != null).map(String).includes(String(contato.id_cliente))) {
    throw new Recusa(409, "O contato selecionado não pertence ao cliente do pedido. Confira o cadastro.");
  }
  const numero = telefoneWhatsApp(contato.whats, ler("CHATGURU_DEFAULT_DDI") || "");
  const url = `${PORTAL}/cliente/${link.numero_pedido}-${link.token}`;
  const nome = String(contato.nome_contato || "Cliente").replace(/[\r\n\x00-\x1f]/g, " ").slice(0, 150);
  const texto = `Olá, ${nome}!\nA arte do pedido ${link.numero_pedido} está pronta para sua conferência.\n\nRevise atentamente:\n\n✅ Amostras\n✅ Quantidades\n✅ Numerações\n✅ Dados para Envio\n✅ Dados da Nota Fiscal\n💳 Faça o Pagamento\n\nLink: Suas AMOSTRAS👇🏻\n${url}`;
  // Um envio por versão da arte, contato, destino e remetente. Sem dados pessoais na chave.
  const chave = await hash(JSON.stringify([c.os_id, link.token, link.arte_pronta_em, contatoId, numero, endpoint, account, phone]));
  const consultar = async () => {
    const linhas = await db("GET", `${TABELA}?chave=eq.${chave}&select=chave,estado,message_id,concluido&limit=2`);
    if (!Array.isArray(linhas) || linhas.length > 1) throw new Recusa(503, "Registro de envio inválido.");
    return linhas[0] || null;
  };
  const publico = (r: any) => ({ ok: true, confirmacao: chave, estado: r?.estado || "novo", aceito: !!r?.message_id, concluido: r?.concluido === true,
    contato: { nome, whatsapp: numero }, texto });
  if (acao === "preparar") return publico(await consultar());
  if (c.confirmacao !== chave) throw new Recusa(409, "O contato ou a arte mudou. Reabra o envio e confira os dados.");
  async function salvar(estado: string, message_id: string | null) {
    const r = uma(await db("PATCH", `${TABELA}?chave=eq.${chave}`, { estado, message_id, atualizado_em: new Date().toISOString() }), "Não foi possível confirmar o resultado. Consulte o status.");
    if (r.chave !== chave || r.estado !== estado || r.message_id !== message_id) throw new Recusa(503, "O banco não confirmou o resultado do envio.");
    return r;
  }
  async function chamar(action: string, extra: Record<string, string>) {
    const response = await (deps.fetch || fetch)(endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(20000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ key, account_id: account, phone_id: phone, action, ...extra }) });
    const data = await response.json();
    return { http: response.status, data };
  }
  let registro = await consultar();
  if (acao === "concluir") {
    if (!registro?.message_id) throw new Recusa(409, "A mensagem ainda não foi aceita pelo ChatGuru.");
    const salvo = uma(await db("PATCH", `${TABELA}?chave=eq.${chave}`, { concluido: true }), "Não foi possível registrar a conclusão.");
    if (salvo.chave !== chave || salvo.concluido !== true) throw new Recusa(503, "O banco não confirmou a conclusão.");
    return publico(salvo);
  }
  if (acao === "status") {
    if (!registro?.message_id || registro.estado === "enviado") return publico(registro);
    try {
      const { http, data } = await chamar("message_status", { message_id: registro.message_id });
      if (http >= 200 && http < 300 && data.result === "success" && data.code === 200) {
        // Só os valores documentados são interpretados; desconhecido não vira falha.
        if (data.message_status === "sent") registro = await salvar("enviado", registro.message_id);
      }
    } catch { throw new Recusa(502, "Não foi possível consultar o ChatGuru. A mensagem não foi reenviada."); }
    return publico(registro);
  }
  if (registro && !(acao === "reenviar" && registro.estado === "falhou")) return publico(registro);
  const reserva = await db("POST", "rpc/imposition_whatsapp_reservar", { p_chave: chave, p_os_id: c.os_id, p_autor: quem.id, p_repetir: acao === "reenviar" });
  if (reserva !== true) return publico(await consultar());
  // Depois desta reserva, nunca repetir automaticamente o POST ao provedor.
  let resposta;
  try { resposta = await chamar("message_send", { chat_number: numero, text: texto }); }
  catch { return publico(await salvar("desconhecido", null)); }
  const { http, data } = resposta;
  const aceito = http >= 200 && http < 300 && data.result === "success" && data.code === 201 &&
    typeof data.message_id === "string" && /^[a-zA-Z0-9_-]{1,128}$/.test(data.message_id);
  if (aceito) return publico(await salvar(data.message_status === "sent" ? "enviado" : "aguardando", data.message_id));
  const rejeitado = http < 500 && data.result === "error" && data.code === 400;
  return publico(await salvar(rejeitado ? "falhou" : "desconhecido", null));
}
