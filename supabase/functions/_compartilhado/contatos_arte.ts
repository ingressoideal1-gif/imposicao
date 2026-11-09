/** Opções do cliente no Guru 3478; seleção por pedido, sem edição do cadastro. */
import { banco } from "./banco.ts";
import { Recusa } from "./sessao.ts";
type Quem = { id: string; permissoes: Record<string, unknown> | null };
function numero(v: unknown): number {
  if (!/^[1-9]\d*$/.test(String(v)) || !Number.isSafeInteger(Number(v))) throw new Recusa(422, "Pedido inválido.");
  return Number(v);
}
export async function operarContatosArte(acao: string, entrada: unknown, quem: Quem, db = banco) {
  if (!quem.id) throw new Recusa(401, "Entre na sua conta do painel.");
  if (quem.permissoes?.perm_lista_arte_view !== true) throw new Recusa(403, "Sem permissão para consultar a Lista de Arte.");
  if (!["consultar", "selecionar"].includes(acao)) throw new Recusa(404, "Operação inexistente.");
  if (acao === "selecionar" && quem.permissoes?.perm_lista_arte_edit !== true) throw new Recusa(403, "Sem permissão para selecionar o contato.");
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) throw new Recusa(422, "Dados inválidos.");
  const c = entrada as Record<string, unknown>;
  const permitidos = acao === "consultar" ? ["pedidos"] : ["pedido", "contato_id", "revisao"];
  if (Object.keys(c).some(k => !permitidos.includes(k))) throw new Recusa(422, "Campo não permitido.");
  let pedidos: number[], caminho: string, corpo: Record<string, unknown>;
  if (acao === "consultar") {
    if (!Array.isArray(c.pedidos) || !c.pedidos.length || c.pedidos.length > 200) throw new Recusa(422, "Informe até 200 pedidos.");
    pedidos = [...new Set(c.pedidos.map(numero))];
    caminho = "rpc/imposition_arte_guru_ler"; corpo = { p_pedidos: pedidos };
  } else {
    pedidos = [numero(c.pedido)];
    if (typeof c.contato_id !== "string" || !/^[a-z0-9_.:/-]{1,100}#[a-f0-9]{24}$/.test(c.contato_id) ||
        typeof c.revisao !== "string" || !/^[a-f0-9]{32}$/.test(c.revisao)) throw new Recusa(422, "Selecione um contato disponível.");
    caminho = "rpc/imposition_arte_guru_selecionar";
    corpo = { p_pedido: pedidos[0], p_contato_id: c.contato_id, p_revisao: c.revisao, p_autor: quem.id };
  }
  let linhas;
  try { linhas = await db("POST", caminho, corpo); }
  catch { throw new Recusa(acao === "consultar" ? 503 : 409, "Não foi possível confirmar o contato. Recarregue a lista e confira se o cadastro mudou."); }
  if (!Array.isArray(linhas) || linhas.some(r => !pedidos.includes(Number(r.pedido)) || !Array.isArray(r.opcoes)) ||
      new Set(linhas.map(r => String(r.pedido))).size !== linhas.length) throw new Recusa(503, "Resposta de contatos inválida.");
  if (acao === "consultar") return linhas;
  if (linhas.length !== 1 || linhas[0].contato_id !== c.contato_id || !linhas[0].valido) throw new Recusa(503, "O banco não confirmou a seleção. Recarregue os contatos.");
  return linhas[0];
}
