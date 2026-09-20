import { operarPropostas, operadorLocalPropostas } from "./propostas.ts";
import { Recusa } from "./sessao.ts";

function igual(a: unknown, b: unknown) {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`diferenca: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
}
async function recusa(status: number, f: () => Promise<unknown>) {
  try { await f(); } catch (e) {
    if (e instanceof Recusa) { igual(e.status, status); return; }
    throw e;
  }
  throw new Error("a operacao deveria ter sido recusada");
}
const leitor = { perm_pedidos_view: true };

Deno.test("nome fantasia: cliente comercial vence o faturado sem alterar dados fiscais", async () => {
  const propostas = [
    { id_int: 1, id_cliente: 10, id_faturado: 99, cliente: "RAZAO UM" },
    { id_int: 2, id_cliente: 20, cliente: "RAZAO DOIS" },
    { id_int: 3, id_cliente: 30, cliente: "Nome legado" },
  ];
  const resultado = await operarPropostas("consultar", { tipo: "lista" }, leitor, async (_m, caminho) => {
    if (caminho.startsWith("propostas?")) return propostas.map(p => ({ ...p }));
    igual(caminho, "clientes?id_cliente=in.(10,20,30)&select=id_cliente,fantasia,nome");
    return [{ id_cliente: 10, fantasia: " Loja Sol ", nome: "RAZAO UM" },
      { id_cliente: 20, fantasia: " ", nome: "RAZAO DOIS" }];
  });
  igual(resultado[0].cliente_exibicao, "Loja Sol");
  igual(resultado[0].cliente, "RAZAO UM");
  igual(resultado[0].id_faturado, 99);
  igual(resultado[1].cliente_exibicao, "RAZAO DOIS");
  igual(resultado[2].cliente, "Nome legado");
  const indisponivel = await operarPropostas("consultar", { tipo: "lista" }, leitor, async (_m, caminho) => {
    if (caminho.startsWith("propostas?")) return propostas;
    throw new Error("cadastro indisponivel");
  });
  igual(indisponivel, propostas);
});

Deno.test("cadastro: contato preserva vendedor e a exigencia de cadastro do envio atual", async () => {
  const pedido = { cliente: "Cliente teste", vendedor: "Atendente teste", id_cliente: 7 };
  const r = await operarPropostas("cadastro", { pedido: 11, escopo: "contato", exigir_cadastro: true }, leitor,
    (_m, caminho) => Promise.resolve(caminho.startsWith("propostas?") ? [pedido] : [{ email: "cliente@example.com" }]));
  igual(r.vendedor, "Atendente teste");
  igual(r.cliente.email, "cliente@example.com");
  await recusa(409, () => operarPropostas("cadastro", { pedido: 11, escopo: "contato", exigir_cadastro: true }, leitor,
    (_m, caminho) => Promise.resolve(caminho.startsWith("propostas?") ? [pedido] : [])));
  await recusa(422, () => operarPropostas("cadastro", { pedido: 11, exigir_cadastro: "true" }, leitor, semBanco));
});
const semBanco = () => { throw new Error("nao deveria consultar o banco"); };

Deno.test("cadastro: anon recusado; pedido determina cliente e endereco sem campos livres", async () => {
  await recusa(403, () => operarPropostas("cadastro", { pedido: 11 }, null, semBanco));
  await recusa(422, () => operarPropostas("cadastro", { pedido: 11, cliente: 22 }, leitor, semBanco));
  const id = "00000000-0000-0000-0000-000000000001";
  const chamadas: string[] = [];
  const resposta = await operarPropostas("cadastro", { pedido: 11 }, leitor, async (metodo, caminho) => {
    igual(metodo, "GET"); chamadas.push(caminho);
    if (caminho.startsWith("propostas?")) return [{ cliente: "Cliente sintetico", id_cliente: 22, id_faturado: 33, id_endereco_ent: id }];
    if (caminho.startsWith("clientes?")) { igual(caminho.includes("id_cliente=eq.33&"), true); return [{ nome: "Faturado sintetico" }]; }
    igual(caminho.startsWith(`enderecos?id=eq.${id}&`), true); return [{ cidade: "Cidade sintetica" }];
  });
  igual(resposta, { cliente: { nome: "Faturado sintetico" }, endereco: { cidade: "Cidade sintetica" }, nome: "Cliente sintetico", vendedor: "" });
  igual(chamadas.some(c => c.includes("select=*")), false);
});
Deno.test("cadastro: pedido ambiguo e endereco malformado nao produzem sucesso", async () => {
  await recusa(409, () => operarPropostas("cadastro", { pedido: 11 }, leitor, async () => [{}, {}]));
  await recusa(409, () => operarPropostas("cadastro", { pedido: 11 }, leitor, async () => [{ id_endereco_ent: "x&select=*" }]));
});
Deno.test("cadastro: contato nao depende do endereco nem devolve documento", async () => {
  const resposta = await operarPropostas("cadastro", { pedido: 11, escopo: "contato" }, leitor, async (_metodo, caminho) => {
    if (caminho.startsWith("propostas?")) return [{ id_cliente: 22, id_endereco_ent: "referencia-antiga-invalida" }];
    igual(caminho.startsWith("clientes?"), true);
    igual(caminho.includes("documento"), false);
    return [{ nome: "Cliente sintetico" }];
  });
  igual(resposta.endereco, null);
});
Deno.test("pagamentos: leitura minima paginada preserva o filtro financeiro existente", async () => {
  await recusa(403, () => operarPropostas("pagamentos", { numeros: [11] }, null, semBanco));
  await recusa(422, () => operarPropostas("pagamentos", { numeros: [11], limite: 501 }, leitor, semBanco));
  igual(await operarPropostas("pagamentos", { numeros: [11, 22], offset: 500 }, leitor, async (metodo, caminho) => {
    igual(metodo, "GET");
    const q = new URL("https://exemplo.invalid/" + caminho).searchParams;
    igual(q.get("id_int"), "in.(11,22)"); igual(q.get("status"), "neq.CANCELADO");
    igual(q.get("select"), "id_int,status"); igual(q.get("offset"), "500");
    return [{ id_int: 22, status: "PAID" }];
  }), [{ id_int: 22, status: "PAID" }]);
});

Deno.test("propostas: anon e usuario sem permissao nao consultam dados", async () => {
  await recusa(403, () => operarPropostas("consultar", { tipo: "lista" }, null, semBanco));
  await recusa(403, () => operarPropostas("consultar", { tipo: "lista" }, { role: "cliente" }, semBanco));
});
Deno.test("propostas: listagem nao filtra empresa ou propriedade do pedido", async () => {
  const linhas = [{ id_int: 11 }, { id_int: 22 }];
  const r = await operarPropostas("consultar", { tipo: "numeros", numeros: [11, 22] }, leitor, (metodo, caminho) => {
    igual(metodo, "GET");
    const q = new URL("https://teste/" + caminho).searchParams;
    igual(q.get("id_int"), "in.(11,22)");
    igual(q.has("empresa_id"), false);
    igual(q.has("user_id"), false);
    return Promise.resolve(linhas);
  });
  igual(r, linhas);
});
Deno.test("propostas: recusa filtros livres, campos financeiros e ids injetados", async () => {
  for (const corpo of [
    { tipo: "lista", select: "*" }, { tipo: "lista", empresa: 1 },
    { tipo: "numeros", numeros: ["1),id_int.gt.0"] }, { tipo: "lista", limite: 501 },
    { tipo: "lista", offset: -1 }, { tipo: "status", status: [] },
  ]) await recusa(422, () => operarPropostas("consultar", corpo, leitor, semBanco));
  await recusa(422, () => operarPropostas("status", { pedido: 11, status: "EM PRODUCAO", valor: 0 }, { role: "admin" }, semBanco));
  await recusa(422, () => operarPropostas("status", { pedido: 11, status: "PAGO" }, { role: "admin" }, semBanco));
});
Deno.test("propostas: texto com sintaxe PostgREST permanece um unico literal", async () => {
  await operarPropostas("consultar", { tipo: "nome", nome: 'A"&select=*,x' }, leitor, (_m, caminho) => {
    const q = new URL("https://teste/" + caminho).searchParams;
    igual(q.getAll("select").length, 1);
    igual(q.get("cliente"), 'ilike."%A\\"&select=*,x%"');
    return Promise.resolve([]);
  });
});
Deno.test("propostas: liberar producao exige admin mesmo com permissao de edicao", async () => {
  await recusa(403, () => operarPropostas("status", { pedido: 11, status: "EM PRODUCAO" },
    { role: "gerente", perm_producao_edit: true }, semBanco));
  await recusa(403, () => operarPropostas("status", { pedido: 11, status: "EXPEDICAO" }, leitor, semBanco));
});
Deno.test("propostas: escrita altera somente status e a chave primaria resolvida", async () => {
  const chamadas: unknown[] = [];
  const r = await operarPropostas("status", { pedido: 11, status: "EM PRODUCAO" }, { role: "admin" }, (m, p, b) => {
    chamadas.push([m, p, b]);
    return Promise.resolve(m === "GET" ? [{ id: "uuid-do-pedido" }] : [{ id_int: 11, status_interno: "EM PRODUCAO" }]);
  });
  igual(chamadas[1], ["PATCH", "propostas?id=eq.uuid-do-pedido&id_int=eq.11&select=id_int,status_interno", { status_interno: "EM PRODUCAO" }]);
  igual(r, { id_int: 11, status_interno: "EM PRODUCAO" });
});
Deno.test("propostas: numero ambiguo ou gravacao vazia nao devolvem sucesso", async () => {
  for (const existentes of [[], [{ id: "a" }, { id: "b" }]]) {
    await recusa(409, () => operarPropostas("status", { pedido: 11, status: "EXPEDICAO" }, { perm_acabamento_edit: true },
      (m) => { igual(m, "GET"); return Promise.resolve(existentes); }));
  }
  await recusa(409, () => operarPropostas("status", { pedido: 11, status: "EXPEDICAO" }, { perm_acabamento_edit: true },
    (m) => Promise.resolve(m === "GET" ? [{ id: "a" }] : [])));
});
Deno.test("propostas: operador local ausente, desativado ou duplicado e recusado", async () => {
  await recusa(401, () => operadorLocalPropostas(null, semBanco));
  await recusa(401, () => operadorLocalPropostas("ABC123", (_m, caminho) => {
    igual(caminho.includes("ativo=eq.true"), true); return Promise.resolve([]);
  }));
  await recusa(401, () => operadorLocalPropostas("ABC123", () => Promise.resolve([{}, {}])));
});
Deno.test("propostas: grade local do servidor prevalece sobre o padrao do perfil", async () => {
  const p = await operadorLocalPropostas("ABC123", () => Promise.resolve([
    { role: "admin", permissoes: { perm_acabamento_edit: false } },
  ]));
  igual(p.perm_acabamento_edit, false);
  igual(p.perm_pedidos_view, true);
  await recusa(403, () => operarPropostas("status", { pedido: 11, status: "EXPEDICAO" }, p, semBanco));
});
Deno.test("propostas: erro de validar codigo nao inclui o segredo no diagnostico", async () => {
  try { await operadorLocalPropostas("ABC123", () => { throw new Error("codigo=eq.ABC123"); }); }
  catch (e) { igual(e instanceof Recusa && e.status === 503 && !e.message.includes("ABC123"), true); return; }
  throw new Error("deveria recusar");
});
