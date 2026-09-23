import { banco } from "./banco.ts";
import { hashDoToken, tokenNovo } from "./hash.ts";
import { Recusa } from "./sessao.ts";
import { instalacao } from "./pin_instalacao.ts";

const segredoValido = (v: unknown): v is string => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);

export async function emitirQrEvento(eventoId: string, autor: string): Promise<any> {
  const segredo = tokenNovo();
  const hash = await hashDoToken(segredo);
  const linhas = await banco("POST", "producao_acesso_convites_evento", {
    evento_id: eventoId, segredo_hash: hash, criado_por: autor,
  });
  if (linhas?.length !== 1 || linhas[0].segredo_hash !== hash || linhas[0].evento_id !== eventoId) {
    throw new Error("convite nao persistido");
  }
  return { id: linhas[0].id, conteudo: "IDEAL-CONTROL-EVENTO:1:" + segredo };
}

export async function revogarQrEvento(eventoId: string): Promise<any> {
  const linhas = await banco("PATCH", "producao_acesso_convites_evento?evento_id=eq." + eventoId + "&revogado_em=is.null",
    { revogado_em: new Date().toISOString() });
  if (!Array.isArray(linhas) || linhas.some((r: any) => r.evento_id !== eventoId || !r.revogado_em)) {
    throw new Error("revogacao nao confirmada");
  }
  return { revogados: linhas.length };
}

export async function usarQrEvento(corpo: any, ativar: boolean): Promise<any> {
  if (!segredoValido(corpo?.segredo)) throw new Recusa(422, "QR do evento inválido.");
  if (ativar && (!segredoValido(corpo?.token) || typeof corpo?.nome !== "string" ||
      !corpo.nome.trim() || corpo.nome.trim().length > 60 ||
      typeof corpo?.navegador !== "string" || !/^[A-Za-z0-9_-]{1,64}$/.test(corpo.navegador))) {
    throw new Recusa(422, "Informe o nome deste aparelho e tente novamente.");
  }
  const r = await banco("POST", "rpc/producao_acesso_ativar_qr_evento", {
    p_segredo_hash: await hashDoToken(corpo.segredo),
    p_token_hash: ativar ? await hashDoToken(corpo.token) : null,
    p_nome: ativar ? corpo.nome.trim() : null,
    p_navegador: ativar ? corpo.navegador : null,
    p_instalacao_id: ativar ? (await instalacao(corpo.chave)).id : null,
  });
  if (!r?.evento?.id || (ativar && !r?.aparelho?.id)) {
    throw new Recusa(403, "QR indisponível, revogado ou evento inativo. Peça à gráfica para conferir.");
  }
  return r;
}
