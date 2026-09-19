import { operarBancosPedido, operadorLocalBancos, type Banco } from "./bancos_pedido.ts";
import { Recusa } from "./sessao.ts";

const ID = "11111111-1111-4111-8111-111111111111";

Deno.test("consulta limita os bancos ao id_int e os vinculos aos bancos encontrados", async () => {
  const chamadas: string[] = [];
  const falso: Banco = async (_m, caminho) => {
    chamadas.push(caminho);
    if (caminho.startsWith("pedidos_bancos?")) return [{ id: ID, id_int: 21460 }];
    return [{ modelo_id: "1000780", banco_id: ID }];
  };
  const r: any = await operarBancosPedido(
    "consultar", { id_int: 21460 }, { perm_amostras_view: true }, falso,
  );
  if (r.bancos.length !== 1 || r.vinculos.length !== 1) throw new Error("resultado incompleto");
  if (!chamadas[0].includes("id_int=eq.21460")) throw new Error("leitura sem limite do pedido");
  if (!chamadas[1].includes(`banco_id=in.(${ID})`)) throw new Error("vinculos sem limite dos bancos");
});

Deno.test("atualizacao confere o dono e exige a linha devolvida", async () => {
  const chamadas: Array<{ metodo: string; caminho: string; corpo: unknown; prefer?: string }> = [];
  const falso: Banco = async (metodo, caminho, corpo, prefer) => {
    chamadas.push({ metodo, caminho, corpo, prefer });
    if (metodo === "GET") return [{ id: ID, id_int: 21460 }];
    return [{ id: ID, id_int: 21460, nome: "Novo" }];
  };
  await operarBancosPedido(
    "atualizar", { id_int: 21460, banco_id: ID, nome: "Novo", coluna_indevida: 1 },
    { perm_amostras_edit: true }, falso,
  );
  const escrita = chamadas.find((c) => c.metodo === "PATCH");
  if (!escrita?.caminho.includes(`id=eq.${ID}&id_int=eq.21460`)) {
    throw new Error("PATCH sem os dois filtros");
  }
  const corpo: any = escrita.corpo;
  if (corpo.nome !== "Novo" || "coluna_indevida" in corpo) throw new Error("whitelist de colunas falhou");
  if (escrita.prefer !== "return=representation") throw new Error("escrita sem confirmacao");
});

Deno.test("banco de outro pedido recusa antes de escrever", async () => {
  let escreveu = false;
  const falso: Banco = async (metodo) => {
    if (metodo !== "GET") escreveu = true;
    return [];
  };
  try {
    await operarBancosPedido(
      "atualizar", { id_int: 21460, banco_id: ID, nome: "X" },
      { perm_amostras_edit: true }, falso,
    );
    throw new Error("deveria recusar");
  } catch (e) {
    if (!(e instanceof Recusa) || e.status !== 404) throw e;
  }
  if (escreveu) throw new Error("escreveu antes de conferir o pedido");
});

Deno.test("vinculo confere modelo e banco no mesmo pedido", async () => {
  const chamadas: string[] = [];
  const falso: Banco = async (metodo, caminho, corpo) => {
    chamadas.push(`${metodo} ${caminho}`);
    if (caminho.startsWith("pedidos_modelos?")) return [{ id: 1000780 }];
    if (caminho.startsWith("pedidos_bancos?")) return [{ id: ID, id_int: 21460 }];
    return [corpo];
  };
  const r: any = await operarBancosPedido(
    "vincular",
    { id_int: 21460, modelo_id: "1000780", banco_id: ID, csv_mapa: { "el:1": "NOME" } },
    { perm_amostras_edit: true },
    falso,
  );
  if (r.vinculo.modelo_id !== "1000780") throw new Error("vinculo nao voltou");
  if (!chamadas[0].includes("id_int=eq.21460")) throw new Error("modelo sem pedido");
  if (!chamadas[1].includes("id_int=eq.21460")) throw new Error("banco sem pedido");
  if (!chamadas[2].startsWith("POST pedidos_modelos_banco?on_conflict=modelo_id")) {
    throw new Error("upsert inesperado");
  }
});

Deno.test("codigo local e validado no servidor e respeita permissao explicita", async () => {
  const falso: Banco = async () => [{ role: "admin", permissoes: { perm_amostras_edit: false } }];
  const operador = await operadorLocalBancos("a1b2c3", falso);
  try {
    await operarBancosPedido(
      "criar", { id_int: 1, nome: "X", csv_headers: [], csv_data: [{}] }, operador,
      async () => { throw new Error("nao deveria consultar"); },
    );
    throw new Error("deveria recusar");
  } catch (e) {
    if (!(e instanceof Recusa) || e.status !== 403) throw e;
  }
});
