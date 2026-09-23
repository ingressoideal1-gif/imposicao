import { banco } from "./banco.ts";
import { Recusa } from "./sessao.ts";
import { conferirElevacao } from "./assinatura.ts";
import { instalacao } from "./pin_instalacao.ts";
import { painel } from "./painel_evento.ts";
import { desvincularPedido, sincronizarSetores } from "./vinculo.ts";
import { aplicarEvento, aplicarSetor, aplicarAparelho, aplicarCodigos, aplicarBloqueio, aplicarLiberacao, excluirAparelho, zerarEntradas } from "./configuracao.ts";

const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export async function editarComPin(c: any, aparelho: any): Promise<any> {
  const i = await instalacao(c?.chave);
  if (aparelho.instalacao_id !== i.id) throw new Recusa(403, "Instalação não autorizada.");
  try { await conferirElevacao(c?.elevacao, aparelho.evento_id, "pin-" + i.id, aparelho.id); }
  catch { throw new Recusa(401, "Digite novamente a senha de edição deste celular."); }
  const partes = typeof c?.caminho === "string" ? c.caminho.split("/").filter(Boolean) : [];
  const [tipo, id, acao, filho] = partes;
  const metodo = c?.metodo;
  if (!(tipo === "pedidos" ? /^[1-9][0-9]{0,14}$/.test(id || "") : UUID.test(id || "")) || partes.length > 4) throw new Recusa(404, "Operação indisponível.");
  let recurso: any;
  if (tipo === "eventos") {
    if (id !== aparelho.evento_id) throw new Recusa(403, "Evento não autorizado.");
  } else if (tipo === "setores" || tipo === "aparelhos") {
    const tabela = tipo === "setores" ? "producao_acesso_setores" : "producao_acesso_dispositivos";
    recurso = (await banco("GET", tabela + "?id=eq." + id + "&evento_id=eq." + aparelho.evento_id + "&select=*"))?.[0];
    if (!recurso) throw new Recusa(403, "Recurso de outro evento ou indisponível.");
  } else if (tipo === "pedidos") {
    recurso = (await banco("GET", "producao_acesso_pedidos?pedido_id_int=eq." + id + "&evento_id=eq." + aparelho.evento_id + "&select=pedido_id_int"))?.[0];
    if (!recurso) throw new Recusa(403, "Pedido de outro evento ou indisponível.");
  } else throw new Recusa(404, "Operação indisponível.");
  if (metodo === "GET" && tipo === "eventos" && partes.length === 2) return await painel(id);
  if (tipo === "aparelhos" && id === aparelho.id &&
      (metodo === "DELETE" || (metodo === "PATCH" && c.corpo?.status && c.corpo.status !== "ativo"))) {
    throw new Recusa(409, "Este celular está sendo usado para editar. Peça à gráfica para pausá-lo ou excluí-lo pelo Imposition.");
  }
  let executar: (() => Promise<any>) | undefined;
  if (tipo === "pedidos" && partes.length === 3 && metodo === "POST" && acao === "desvincular") executar = () => desvincularPedido(Number(id), aparelho.evento_id);
  if (tipo === "pedidos" && partes.length === 3 && metodo === "POST" && acao === "sincronizar-setores") executar = () => sincronizarSetores(Number(id), aparelho.evento_id);
  if (tipo === "eventos" && partes.length === 2 && metodo === "PATCH") executar = () => aplicarEvento(id, c.corpo);
  if (tipo === "eventos" && partes.length === 3 && metodo === "POST" && acao === "zerar-entradas") executar = () => zerarEntradas(id);
  if (tipo === "eventos" && partes.length === 3 && metodo === "POST" && acao === "codigos") executar = () => aplicarCodigos(id, c.corpo);
  if (tipo === "setores" && partes.length === 2 && metodo === "PATCH") executar = () => aplicarSetor(recurso, c.corpo);
  // Autor humano permanece nulo; instalação/aparelho são registrados na auditoria abaixo.
  if (tipo === "setores" && partes.length === 3 && metodo === "POST" && acao === "bloqueios") executar = () => aplicarBloqueio(recurso, c.corpo, null);
  if (tipo === "setores" && partes.length === 4 && metodo === "DELETE" && acao === "bloqueios" && UUID.test(filho)) executar = () => aplicarLiberacao(recurso, filho);
  if (tipo === "aparelhos" && partes.length === 2 && metodo === "PATCH") executar = () => aplicarAparelho(recurso, c.corpo);
  if (tipo === "aparelhos" && partes.length === 2 && metodo === "DELETE") executar = () => excluirAparelho(recurso);
  if (!executar) throw new Recusa(404, "Esta operação exige acesso pela conta do cliente.");
  const rows = await banco("POST", "producao_acesso_auditoria_pin", {
    instalacao_id: i.id, dispositivo_id: aparelho.id, evento_id: aparelho.evento_id,
    rota: c.caminho, metodo,
  });
  if (rows?.length !== 1 || !rows[0].id) throw new Error("auditoria nao persistida");
  const resultado = await executar();
  await banco("PATCH", "producao_acesso_auditoria_pin?id=eq." + rows[0].id, { resultado: "concluido" });
  return resultado;
}
