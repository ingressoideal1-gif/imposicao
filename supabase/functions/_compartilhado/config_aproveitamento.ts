/** Configuracoes globais: identidade e permissao verificadas no servidor. */
import { banco } from "./banco.ts";
import { Recusa } from "./sessao.ts";
export async function salvarConfigAproveitamento(acao: string, entrada: unknown,
  identidade: Record<string, unknown> | null, consultar: typeof banco = banco) {
  if (identidade?.perm_admin_edit !== true) throw new Recusa(403, "Editar Aproveitamento exige permissao EDITAR de ADM.");
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) throw new Recusa(422, "Corpo invalido.");
  const corpo = entrada as Record<string, unknown>;
  let tabela: string, filtro: string, registro: Record<string, unknown>, chave: string;
  if (acao === "limiar") {
    if (Object.keys(corpo).some(k => !["chave", "valor", "atualizado_em"].includes(k)) || corpo.chave !== "limiar_sobra" ||
        typeof corpo.valor !== "number" || !Number.isFinite(corpo.valor) || corpo.valor <= 0 || corpo.valor > 1) throw new Recusa(422, "Limiar invalido.");
    tabela = "producao_config"; chave = "chave"; filtro = "chave=eq.limiar_sobra";
    registro = { chave: "limiar_sobra", valor: corpo.valor, atualizado_em: new Date().toISOString() };
  } else if (acao === "produto") {
    if (Object.keys(corpo).some(k => !["id_produto", "nome", "liberado", "limiar_sobra", "atualizado_em"].includes(k))) throw new Recusa(422, "Campo de produto nao permitido.");
    const id = String(corpo.id_produto ?? "");
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(id) || typeof corpo.liberado !== "boolean" ||
        !(corpo.nome === null || typeof corpo.nome === "string") ||
        !(corpo.limiar_sobra === null || (typeof corpo.limiar_sobra === "number" && Number.isFinite(corpo.limiar_sobra) && corpo.limiar_sobra > 0 && corpo.limiar_sobra <= 1))) throw new Recusa(422, "Configuracao do produto invalida.");
    tabela = "producao_produtos_combinaveis"; chave = "id_produto"; filtro = "id_produto=eq." + id;
    registro = { id_produto: id, nome: corpo.nome, liberado: corpo.liberado, limiar_sobra: corpo.limiar_sobra, atualizado_em: new Date().toISOString() };
  } else throw new Recusa(404, "Operacao de configuracao desconhecida.");
  const gravadas = await consultar("POST", tabela + "?on_conflict=" + chave, registro, "resolution=merge-duplicates,return=representation");
  if (!Array.isArray(gravadas) || gravadas.length !== 1 || String(gravadas[0][chave]) !== String(registro[chave])) throw new Recusa(503, "A configuracao nao confirmou a gravacao.");
  const lidas = await consultar("GET", tabela + "?" + filtro + "&select=*&limit=2");
  if (!Array.isArray(lidas) || lidas.length !== 1 || Object.keys(registro).some(k => k !== "atualizado_em" && String(lidas[0][k]) !== String(registro[k]))) throw new Recusa(409, "Configuracao divergente apos salvar. Atualize a tela.");
  return { configuracao: lidas[0] };
}
