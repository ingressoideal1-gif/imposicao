import { banco } from "./banco.ts";
import { Recusa } from "./sessao.ts";

/** Identidade e grade devem vir do servidor, nunca do corpo da chamada. */
export async function operarFundo(
  acao: string, entrada: unknown, permissoes: Record<string, unknown> | null,
  autor: string, executar: typeof banco = banco,
) {
  if (permissoes?.perm_admin_edit !== true) throw new Recusa(403, "sem permissao administrativa para alterar o fundo");
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) throw new Recusa(422, "esperava objeto JSON");
  const corpo = entrada as Record<string, unknown>;
  let parametros: Record<string, unknown>;
  let rpc: string;
  if (acao === "remover") {
    if (Object.keys(corpo).length) throw new Recusa(422, "remover nao recebe campos");
    parametros = {};
    rpc = "remover_fundo_do_pwa";
  } else if (acao === "publicar") {
    if (Object.keys(corpo).some(k => !["arquivo", "veu", "enquadramento", "versao"].includes(k)) ||
        typeof corpo.versao !== "string" || !/^[0-9]{13}$/.test(corpo.versao) ||
        corpo.arquivo !== `fundo-pwa/${corpo.versao}.jpg` ||
        typeof corpo.veu !== "number" || !Number.isFinite(corpo.veu) || corpo.veu < 0.20 || corpo.veu > 0.85 ||
        typeof corpo.enquadramento !== "string" || !["topo", "centro", "base"].includes(corpo.enquadramento)) {
      throw new Recusa(422, "parametros de fundo invalidos");
    }
    parametros = { p_arquivo: corpo.arquivo, p_veu: corpo.veu,
      p_enquadramento: corpo.enquadramento, p_versao: corpo.versao, p_por: autor };
    rpc = "publicar_fundo_do_pwa";
  } else throw new Recusa(404, "operacao inexistente");
  try {
    await executar("POST", `rpc/${rpc}`, parametros);
  } catch {
    // O erro bruto do banco pode conter valores ou detalhes internos.
    throw new Recusa(503, "nao foi possivel alterar o fundo");
  }
  return { ok: true };
}
