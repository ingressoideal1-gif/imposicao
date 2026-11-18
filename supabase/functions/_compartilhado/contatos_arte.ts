/** Consulta o comprador selecionado no Vibe e os contatos do cliente no Guru 3478. */
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
  if (acao === "selecionar") throw new Recusa(409, "Altere o comprador no Vibe.");
  if (acao !== "consultar") throw new Recusa(404, "Operação inexistente.");
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) throw new Recusa(422, "Dados inválidos.");
  const c = entrada as Record<string, unknown>;
  if (Object.keys(c).some(k => k !== "pedidos")) throw new Recusa(422, "Campo não permitido.");
  if (!Array.isArray(c.pedidos) || !c.pedidos.length || c.pedidos.length > 200) throw new Recusa(422, "Informe até 200 pedidos.");
  const pedidos = [...new Set(c.pedidos.map(numero))];
  let linhas;
  try { linhas = await db("POST", "rpc/imposition_arte_guru_ler", { p_pedidos: pedidos }); }
  catch { throw new Recusa(503, "Não foi possível consultar o comprador. Recarregue a lista de contatos."); }
  if (!Array.isArray(linhas) || linhas.some(r => !pedidos.includes(Number(r.pedido)) || !Array.isArray(r.opcoes)) ||
      new Set(linhas.map(r => String(r.pedido))).size !== linhas.length) throw new Recusa(503, "Resposta de contatos inválida.");
  return linhas;
}
