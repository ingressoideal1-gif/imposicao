/** Nome/WhatsApp do contato selecionado; nenhuma troca de contato ou edição livre. */
import { banco } from "./banco.ts";
import { Recusa } from "./sessao.ts";
import { telefoneWhatsApp } from "./whatsapp_artes.ts";
type Quem = { id: string; permissoes: Record<string, unknown> | null };
type Ambiente = (k: string) => string | undefined;
// Só consulta números dos contatos já autorizados. A base Guru permanece privada.
async function conferirGuru(linhas: any[], db: typeof banco, env: Ambiente) {
  const resultado = linhas.map(r => r.valido ? { ...r, guru_disponivel: null as boolean | null } : r);
  try {
    const phone = env("CHATGURU_PHONE_ID") || "";
    const fontes = JSON.parse(env("CHATGURU_WEBHOOK_FONTES") || "null");
    const fonte = fontes?.[phone];
    if (!/^[a-f0-9]{24}$/.test(phone) || typeof fonte !== "string" || !/^[a-z0-9_.:/-]{1,100}$/.test(fonte)) return resultado;
    const numeros = resultado.map(r => {
      if (!r.valido) return null;
      try { return telefoneWhatsApp(r.whatsapp, env("CHATGURU_DEFAULT_DDI") || ""); } catch { return null; }
    });
    const unicos = [...new Set(numeros.filter((n): n is string => n !== null))];
    const encontrados = new Set<string>();
    if (unicos.length) {
      // Paginação evita marcar ausência quando o mesmo número possui muitos chats.
      for (let offset = 0; ; offset += 1000) {
        const rows = await db("GET", `chatguru_contatos_importados?select=telefone_normalizado&fonte=eq.${encodeURIComponent(fonte)}&telefone_valido=eq.true&telefone_normalizado=in.(${unicos.join(",")})&order=chat_id&limit=1000&offset=${offset}`);
        if (!Array.isArray(rows) || rows.some(r => !unicos.includes(r.telefone_normalizado))) throw Error();
        rows.forEach(r => encontrados.add(r.telefone_normalizado));
        if (rows.length < 1000) break;
      }
    }
    return resultado.map((r, i) => r.valido ? { ...r, guru_disponivel: numeros[i] !== null && encontrados.has(numeros[i]!) } : r);
  } catch {
    // Falha de consulta não significa número ausente e não invalida um salvamento.
    return resultado;
  }
}
function numero(v: unknown): number {
  if (!/^[1-9]\d*$/.test(String(v)) || !Number.isSafeInteger(Number(v))) throw new Recusa(422, "Pedido inválido.");
  return Number(v);
}
export async function operarContatosArte(acao: string, entrada: unknown, quem: Quem, db = banco, env: Ambiente = k => Deno.env.get(k)) {
  if (!quem.id) throw new Recusa(401, "Entre na sua conta do painel.");
  if (quem.permissoes?.perm_lista_arte_view !== true) throw new Recusa(403, "Sem permissão para consultar a Lista de Arte.");
  if (!["consultar", "salvar"].includes(acao)) throw new Recusa(404, "Operação inexistente.");
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) throw new Recusa(422, "Dados inválidos.");
  const c = entrada as Record<string, unknown>;
  const permitidos = acao === "consultar" ? ["pedidos"] : ["pedido", "contato_id", "nome_anterior", "whatsapp_anterior", "nome", "whatsapp"];
  if (Object.keys(c).some(k => !permitidos.includes(k))) throw new Recusa(422, "Campo não permitido.");
  if (acao === "consultar") {
    if (!Array.isArray(c.pedidos) || !c.pedidos.length || c.pedidos.length > 200) throw new Recusa(422, "Informe até 200 pedidos.");
    const pedidos = [...new Set(c.pedidos.map(numero))];
    let linhas;
    try { linhas = await db("POST", "rpc/imposition_contatos_arte_ler", { p_pedidos: pedidos }); }
    catch { throw new Recusa(503, "Não foi possível consultar os contatos."); }
    if (!Array.isArray(linhas) || linhas.some(r => !pedidos.includes(Number(r.pedido))) || new Set(linhas.map(r => String(r.pedido))).size !== linhas.length) throw new Recusa(503, "Resposta de contatos inválida.");
    // Não expor contato vinculado a outro cliente por inconsistência no ERP.
    return conferirGuru(linhas.map(r => r.valido ? r : { pedido: r.pedido, contato_id: null, nome: null, whatsapp: null, valido: false }), db, env);
  }
  if (quem.permissoes?.perm_lista_arte_edit !== true) throw new Recusa(403, "Sem permissão para editar a Lista de Arte.");
  const pedido = numero(c.pedido);
  if (typeof c.contato_id !== "string" || !/^[1-9]\d*$/.test(c.contato_id) ||
      typeof c.nome !== "string" || !c.nome.trim() || c.nome.length > 150 || /[\x00-\x1f\x7f]/.test(c.nome) ||
      typeof c.whatsapp !== "string" || !/^\+?[\d ().-]{10,32}$/.test(c.whatsapp.trim()) || !/^[1-9]\d{9,14}$/.test(c.whatsapp.replace(/\D/g, "")) ||
      ![c.nome_anterior, c.whatsapp_anterior].every(v => v === null || typeof v === "string" && v.length <= 300)) throw new Recusa(422, "Informe nome e WhatsApp válidos, com DDD (e DDI se internacional).");
  let linhas;
  try {
    linhas = await db("POST", "rpc/imposition_contato_arte_salvar", { p_pedido: pedido, p_contato_id: c.contato_id,
      p_nome_anterior: c.nome_anterior, p_whatsapp_anterior: c.whatsapp_anterior, p_nome: c.nome.trim(), p_whatsapp: c.whatsapp.trim() });
  } catch { throw new Recusa(409, "Não foi possível salvar. Reabra o contato e confira se o pedido ou cadastro mudou."); }
  const r = Array.isArray(linhas) && linhas.length === 1 ? linhas[0] : null;
  if (!r || Number(r.pedido) !== pedido || r.contato_id !== c.contato_id || r.nome !== c.nome.trim() || r.whatsapp !== c.whatsapp.trim() || r.valido !== true) throw new Recusa(503, "O banco não confirmou a gravação. Reabra o contato para conferir.");
  return (await conferirGuru([r], db, env))[0];
}
