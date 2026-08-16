/**
 * As travas da publicacao, testadas sem servidor e sem banco.
 *
 * Rodar (da pasta `supabase/functions`):
 *   npx deno test acesso-estacao/puro_test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import {
  conferirItens,
  itensDoCorpo,
  linhasDeCredencial,
  LOTE_MAXIMO,
  pedacosDaRota,
} from "./puro.ts";

Deno.test("rota: os formatos que o Supabase entrega", () => {
  assertEquals(
    pedacosDaRota("/functions/v1/acesso-estacao/pedidos/20272/abrir"),
    ["pedidos", "20272", "abrir"],
  );
  assertEquals(
    pedacosDaRota("/acesso-estacao/pedidos/20272/credenciais"),
    ["pedidos", "20272", "credenciais"],
  );
});

Deno.test("rota: o `/api/acesso/` que o agente ja embute e aceito", () => {
  // E o que permite apontar uma estacao para ca trocando so `ACESSO_BASE_URL`,
  // sem compilar e distribuir um `NewProd.exe` novo para as onze maquinas.
  assertEquals(
    pedacosDaRota("/functions/v1/acesso-estacao/api/acesso/pedidos/20272/fechar"),
    ["pedidos", "20272", "fechar"],
  );
});

Deno.test("corpo: itens ausente ou de outro tipo vira lista vazia", () => {
  assertEquals(itensDoCorpo({}), []);
  assertEquals(itensDoCorpo(null), []);
  assertEquals(itensDoCorpo({ itens: null }), []);
  assertEquals(itensDoCorpo({ itens: "abc" }), []);
  assertEquals(itensDoCorpo({ itens: [1] }), [1]);
});

Deno.test("o lote maximo e o mesmo do agente", () => {
  // O `acesso_publicacao.LOTE` manda 500 exatos. Um teto MENOR aqui recusaria
  // todo lote cheio -- a publicacao pararia na primeira remessa.
  assertEquals(LOTE_MAXIMO, 500);
});

const TIRAGEM = { 1000283: 50, 1000284: 3000 };

Deno.test("trava: modelo de outro pedido e recusado", () => {
  const r = conferirItens(20508, [{ modelo_id: 999, numero: 1, hash: "x" }], TIRAGEM);
  assertEquals(r?.status, 422);
  assertEquals(r?.detail, "modelo 999 nao pertence ao pedido 20508");
});

Deno.test("trava: numero acima da tiragem e recusado", () => {
  // A trava que vale MESMO com o segredo do agente na mao: sem ela, quem tem o
  // sal (que o `abrir` devolve) inseriria o ingresso 99.999 de uma tiragem de
  // 3.000 com um hash escolhido por ele.
  const r = conferirItens(20508, [{ modelo_id: 1000284, numero: 99999 }], TIRAGEM);
  assertEquals(r?.status, 422);
  assertEquals(r?.detail, "ingresso 99999 fora da tiragem do modelo 1000284 (1..3000)");
});

Deno.test("trava: zero e negativo tambem estao fora da faixa", () => {
  for (const numero of [0, -1]) {
    const r = conferirItens(20508, [{ modelo_id: 1000283, numero }], TIRAGEM);
    assertEquals(r?.status, 422, `numero ${numero} passou`);
  }
});

Deno.test("trava: as pontas da faixa passam", () => {
  assertEquals(conferirItens(20508, [{ modelo_id: 1000283, numero: 1 }], TIRAGEM), null);
  assertEquals(conferirItens(20508, [{ modelo_id: 1000283, numero: 50 }], TIRAGEM), null);
});

Deno.test("trava: item malformado nao vira consulta ao banco", () => {
  for (const item of [{}, { modelo_id: "abc", numero: 1 }, { modelo_id: 1000283 }]) {
    const r = conferirItens(20508, [item], TIRAGEM);
    assertEquals(r?.status, 422, `${JSON.stringify(item)} passou`);
  }
});

Deno.test("trava: o lote inteiro cai por causa de um item ruim", () => {
  const r = conferirItens(
    20508,
    [{ modelo_id: 1000283, numero: 1 }, { modelo_id: 1000283, numero: 51 }],
    TIRAGEM,
  );
  assertEquals(r?.status, 422);
});

Deno.test("trava: pedido sem tiragem nenhuma recusa tudo", () => {
  // Tiragem vazia e o que o ERP responde para pedido que nao existe. Aceitar
  // ali gravaria credencial de um pedido inventado.
  const r = conferirItens(1, [{ modelo_id: 1, numero: 1 }], {});
  assertEquals(r?.status, 422);
});

Deno.test("linha: a credencial nasce com origem e sem chave_dedup", () => {
  const linhas = linhasDeCredencial(20508, [{ modelo_id: 1000283, numero: 7, hash: "ab" }], {});
  assertEquals(linhas, [{
    pedido_id_int: 20508,
    modelo_id: 1000283,
    numero: 7,
    codigo_hash: "ab",
    origem: "qr_ideal",
  }]);
  // `chave_dedup` e GENERATED ALWAYS no Postgres. Enviar uma calculada aqui
  // seria a chance de calcular diferente do indice.
  assertEquals("chave_dedup" in linhas[0], false);
});

Deno.test("linha: ja nasce ligada ao setor quando o pedido foi reivindicado", () => {
  // A metade que faltava em 14/08/2026: o cliente reivindicou as 10:55, o papel
  // saiu as 18:52, e as 200 credenciais ficaram orfas para sempre.
  const dono = { 1000283: { evento_id: "ev-1", setor_id: "st-1" } };
  const linhas = linhasDeCredencial(20508, [{ modelo_id: 1000283, numero: 7, hash: "ab" }], dono);
  assertEquals(linhas[0].evento_id, "ev-1");
  assertEquals(linhas[0].setor_id, "st-1");
});

Deno.test("linha: modelo sem setor fica sem dono, e nao com dono errado", () => {
  const dono = { 1000284: { evento_id: "ev-1", setor_id: "st-1" } };
  const linhas = linhasDeCredencial(20508, [{ modelo_id: 1000283, numero: 1, hash: "ab" }], dono);
  assertEquals("evento_id" in linhas[0], false);
  assertEquals("setor_id" in linhas[0], false);
});
