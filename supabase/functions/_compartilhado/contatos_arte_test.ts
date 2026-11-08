import assert from "node:assert/strict";
import { operarContatosArte } from "./contatos_arte.ts";
const quem = { id: "operador", permissoes: { perm_lista_arte_view: true, perm_lista_arte_edit: true } };
const dados = { pedido: 11, contato_id: "7", nome_anterior: "Anterior", whatsapp_anterior: "11999990000", nome: "Novo", whatsapp: "1188880000" };
const salvo = { pedido: 11, contato_id: "7", nome: "Novo", whatsapp: "1188880000", valido: true };
const envGuru = (k: string) => ({ CHATGURU_PHONE_ID: "a".repeat(24), CHATGURU_WEBHOOK_FONTES: JSON.stringify({ ["a".repeat(24)]: "app.zap.guru/whatsapp_2" }), CHATGURU_DEFAULT_DDI: "55" }[k]);
Deno.test("contatos arte: Guru compara número exato, limita fonte e não expõe inválidos", async () => {
  const linhas = [salvo, { ...salvo, pedido: 12, whatsapp: "11988880000" }, { ...salvo, pedido: 13, valido: false }];
  const r = await operarContatosArte("consultar", { pedidos: [11,12,13] }, quem, async (metodo, path) => {
    if (metodo === "POST") return linhas;
    assert.ok(path.includes("fonte=eq.app.zap.guru%2Fwhatsapp_2"));
    assert.ok(path.includes("in.(551188880000,5511988880000)"));
    return [{ telefone_normalizado: "551188880000" }];
  }, envGuru);
  assert.equal(r[0].guru_disponivel, true);
  assert.equal(r[1].guru_disponivel, false); // Não remove nono dígito.
  assert.equal(r[2].whatsapp, null);
});
Deno.test("contatos arte: paginação e falha Guru não viram ausência", async () => {
  let consultas = 0;
  const r = await operarContatosArte("consultar", { pedidos: [11,12] }, quem, async (metodo, path) => {
    if (metodo === "POST") return [salvo, { ...salvo, pedido: 12, whatsapp: "11988880000" }];
    consultas++;
    return path.includes("offset=1000") ? [{ telefone_normalizado: "5511988880000" }] : Array(1000).fill({ telefone_normalizado: "551188880000" });
  }, envGuru);
  assert.equal(consultas, 2); assert.ok(r.every((x: any) => x.guru_disponivel === true));
  const falha = async (metodo: string) => { if (metodo === "POST") return [salvo]; throw Error("interno"); };
  const desconhecido = await operarContatosArte("consultar", { pedidos: [11] }, quem, falha, envGuru);
  assert.equal(desconhecido[0].guru_disponivel, null);
  const gravado = await operarContatosArte("salvar", dados, quem, falha, envGuru);
  assert.equal(gravado.whatsapp, salvo.whatsapp); assert.equal(gravado.guru_disponivel, null);
});
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
  assert.deepEqual(r, { ...salvo, guru_disponivel: null });
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
