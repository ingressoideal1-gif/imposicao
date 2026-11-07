import { banco } from "../_compartilhado/banco.ts";
import { telefoneWhatsApp } from "../_compartilhado/whatsapp_artes.ts";

// Piloto expressamente autorizado; não é uma API geral para disparos.
const PEDIDO = 24880;
const DIALOGO = "6aef191d04236cee4e7075c1";
const TABELA = "imposition_whatsapp_artes";
// Autor técnico reservado, não representa uma sessão de operador.
const AUTOR = "00000000-0000-4000-8000-000000000007";
type Deps = { db?: typeof banco; env?: (k: string) => string | undefined; fetch?: typeof fetch };
const sha = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), b => b.toString(16).padStart(2, "0")).join("");
const unica = (r: any) => { if (!Array.isArray(r) || r.length !== 1) throw new Error("Registro ambíguo"); return r[0]; };
const resposta = (status: number, data: unknown) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export async function handler(req: Request, deps: Deps = {}): Promise<Response> {
  const env = deps.env || (k => Deno.env.get(k));
  const segredo = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!segredo || req.headers.get("Authorization") !== `Bearer ${segredo}`) return resposta(403, { erro: "Acesso técnico exigido." });
  if (req.method !== "POST") return resposta(405, { erro: "Use POST." });
  const db = deps.db || banco;
  try {
    const c = await req.json();
    if (!c || typeof c !== "object" || Array.isArray(c) || Object.keys(c).some(k => !["pedido", "acao", "confirmacao"].includes(k)) || c.pedido !== PEDIDO || !["preparar", "enviar", "status"].includes(c.acao)) return resposta(422, { erro: "Fora do piloto autorizado." });
    // Chave fixa: alteração de contato/link/configuração não libera outro teste.
    const chave = await sha(`dialogo-piloto-20261107:${PEDIDO}:${DIALOGO}`);
    const caminho = `${TABELA}?chave=eq.${chave}`;
    const registros = await db("GET", `${caminho}&select=estado,concluido&limit=2`);
    if (!Array.isArray(registros) || registros.length > 1) throw new Error("Reserva inválida");
    const estado = registros[0]?.estado || "novo";
    const resumo = (e: string) => ({ pedido: PEDIDO, dialogo: DIALOGO, estado: e, dialogo_executado: e === "aguardando", entrega_confirmada: false });
    if (c.acao === "status" || (c.acao === "enviar" && estado !== "novo")) return resposta(200, resumo(estado));
    const link = unica(await db("GET", `pedidos_links_cliente?numero_pedido=eq.${PEDIDO}&ativo=eq.true&select=os_id,numero_pedido,token,arte_pronta_em&limit=2`));
    if (!link.arte_pronta_em || !/^[a-zA-Z0-9]{6,12}$/.test(link.token) || !link.os_id) throw new Error("Arte não preparada");
    const p = unica(await db("GET", `propostas?id_int=eq.${PEDIDO}&select=id_contato,id_cliente,id_faturado&limit=2`));
    if (!/^[1-9]\d*$/.test(String(p.id_contato))) throw new Error("Contato inválido");
    const contato = unica(await db("GET", `contatos?id=eq.${p.id_contato}&select=id,id_cliente,whats&limit=2`));
    if (![p.id_cliente,p.id_faturado].filter(x => x != null).map(String).includes(String(contato.id_cliente))) throw new Error("Vínculo inválido");
    const numero = telefoneWhatsApp(contato.whats, env("CHATGURU_DEFAULT_DDI") || "");
    const endpoint = env("CHATGURU_ENDPOINT") || "";
    const key = env("CHATGURU_KEY"), account = env("CHATGURU_ACCOUNT_ID"), phone = env("CHATGURU_PHONE_ID");
    if (!/^https:\/\/(?:[a-z0-9-]+\.chatguru\.app|app\.zap\.guru)\/api\/v1\/?$/.test(endpoint) || !key || !account || !phone) throw new Error("Configuração inválida");
    const url = `https://imposition.ai-ideal.com.br/cliente/${PEDIDO}-${link.token}`;
    const confirmacao = await sha(JSON.stringify([chave,link.os_id,link.arte_pronta_em,p.id_contato,numero,url,endpoint,account,phone]));
    if (c.acao === "preparar") return resposta(200, { ...resumo(estado), confirmacao, final_whatsapp: numero.slice(-4), arte_pronta: true });
    if (c.confirmacao !== confirmacao) return resposta(409, { erro: "Pedido ou configuração mudou. Prepare novamente." });
    const reservou = await db("POST", "rpc/imposition_whatsapp_reservar", { p_chave: chave, p_os_id: link.os_id, p_autor: AUTOR, p_repetir: false });
    if (reservou !== true) return resposta(409, { erro: "Teste já reservado. Consulte status, sem repetir." });
    const salvar = async (e: string, etapa: string) => {
      const salvo = unica(await db("PATCH", caminho, { estado: e, atualizado_em: new Date().toISOString() }));
      if (salvo.estado !== e || salvo.chave !== chave) throw new Error("Gravação não confirmada");
      return resposta(200, { ...resumo(e), etapa });
    };
    const chamar = async (action: string, extra: Record<string,string>) => {
      const r = await (deps.fetch || fetch)(endpoint, { method: "POST", redirect: "error", signal: AbortSignal.timeout(20000), headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ key, account_id: account, phone_id: phone, chat_number: numero, action, ...extra }) });
      const data = await r.json();
      return { ok: r.ok && data.result === "success" && data.code === 200, rejeitado: r.status < 500 && data.result === "error" && data.code === 400 };
    };
    let etapa = "campo";
    try {
      const campo = await chamar("chat_update_custom_fields", { field__Link_do_Cliente: url });
      if (!campo.ok) return await salvar(campo.rejeitado ? "falhou" : "desconhecido", etapa);
      etapa = "dialogo";
      const dialogo = await chamar("dialog_execute", { dialog_id: DIALOGO });
      // A API não devolve message_id aqui. Nunca inventar ID nem afirmar entrega.
      return await salvar(dialogo.ok ? "aguardando" : dialogo.rejeitado ? "falhou" : "desconhecido", etapa);
    } catch {
      return await salvar("desconhecido", etapa);
    }
  } catch {
    return resposta(503, { erro: "Não foi possível confirmar a operação. Consulte status antes de qualquer nova ação." });
  }
}
if (import.meta.main) Deno.serve(req => handler(req));
