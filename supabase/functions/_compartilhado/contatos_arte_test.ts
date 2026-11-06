import assert from "node:assert/strict";
import { operarContatosArte } from "./contatos_arte.ts";
const quem = { id: "operador", permissoes: { perm_lista_arte_view: true, perm_lista_arte_edit: true } };
const dados = { pedido: 11, contato_id: "7", nome_anterior: "Anterior", whatsapp_anterior: "11999990000", nome: "Novo", whatsapp: "1188880000" };
const salvo = { pedido: 11, contato_id: "7", nome: "Novo", whatsapp: "1188880000", valido: true };
Deno.test("contatos arte: sessão e permissões bloqueiam antes do banco", async () => {
  const db = () => { throw new Error("Não deve consultar"); };
  await assert.rejects(() => operarContatosArte("consultar", { pedidos: [11] }, { ...quem, id: "" }, db), /Entre/);
  await assert.rejects(() => operarContatosArte("consultar", { pedidos: [11] }, { ...quem, permissoes: {} }, db), /permissão/);
  await assert.rejects(() => operarContatosArte("salvar", dados, { ...quem, permissoes: { perm_lista_arte_view: true } }, db), /editar/);
});
Deno.test("contatos arte: lote limitado sem expor contato de outro cliente", async () => {
  const r = await operarContatosArte("consultar", { pedidos: [11, 12, 11] }, quem, async (metodo, caminho, corpo) => {
    assert.equal(metodo, "POST"); assert.equal(caminho, "rpc/imposition_contatos_arte_ler");
    assert.deepEqual(corpo, { p_pedidos: [11, 12] });
    return [salvo, { ...salvo, pedido: 12, valido: false }];
  });
  assert.deepEqual(r[1], { pedido: 12, contato_id: null, nome: null, whatsapp: null, valido: false });
  await assert.rejects(() => operarContatosArte("consultar", { pedidos: Array(201).fill(11) }, quem), /200/);
  await assert.rejects(() => operarContatosArte("consultar", { pedidos: ["11&sql=x"] }, quem), /inválido/);
});
Deno.test("contatos arte: salva somente campos previstos e confirma linha persistida", async () => {
  const r = await operarContatosArte("salvar", dados, quem, async (_m, caminho, corpo) => {
    assert.equal(caminho, "rpc/imposition_contato_arte_salvar");
    assert.deepEqual(corpo, { p_pedido: 11, p_contato_id: "7", p_nome_anterior: "Anterior", p_whatsapp_anterior: "11999990000", p_nome: "Novo", p_whatsapp: "1188880000" });
    return [salvo];
  });
  assert.deepEqual(r, salvo);
  for (const retorno of [[], [salvo, salvo], [{ ...salvo, whatsapp: "outro" }], [{ ...salvo, contato_id: "8" }]]) {
    await assert.rejects(() => operarContatosArte("salvar", dados, quem, async () => retorno), /confirmou/);
  }
});
Deno.test("contatos arte: validação e erros não vazam detalhes do banco", async () => {
  for (const extra of [{ nome: "" }, { whatsapp: "telefone 11999990000" }, { id_cliente: "2" }, { nome_anterior: undefined }]) {
    await assert.rejects(() => operarContatosArte("salvar", { ...dados, ...extra }, quem), /válid|permitido/);
  }
  try { await operarContatosArte("salvar", dados, quem, async () => { throw new Error("dados privados"); }); assert.fail(); }
  catch (e) { assert.ok(String(e).includes("Reabra")); assert.ok(!String(e).includes("privados")); }
});
