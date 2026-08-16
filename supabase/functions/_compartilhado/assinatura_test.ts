/**
 * A paridade das assinaturas, contra casos gerados pelo Python.
 *
 * ## Por que casos de mesa gravados, e nao um teste que fala com o servidor
 *
 * A paridade da portaria (Fase 2a) compara as duas pilhas no ar, e isso e o
 * certo para consulta ao banco. Assinatura e outra coisa: e uma funcao pura, e
 * o que precisa ser provado e que ela devolve o MESMO byte que o Python
 * devolve. Um teste contra o servidor provaria isso so para os valores que o
 * servidor acontecesse de produzir naquele instante.
 *
 * Os casos em `assinatura_casos.json` foram gerados por `qr_pedido._assinar` e
 * `acesso_elevacao._assinar` com um segredo de TESTE -- fixo e publico de
 * proposito, porque o arquivo vai para o repositorio. Regerar:
 * `ferramentas/gerar_casos_de_assinatura.py`.
 *
 * ## O que os corpos crus exercitam
 *
 * O alfabeto base64url inteiro. O `btoa` do JavaScript devolve base64 PADRAO,
 * com `+` e `/`; base64url usa `-` e `_`. Um porte que esqueca essa troca
 * acerta 62 dos 64 simbolos -- e passa em quase todo teste de mesa escrito sem
 * pensar nisso.
 *
 * Rodar: npx deno test --allow-env _compartilhado/assinatura_test.ts
 */
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import casos from "./assinatura_casos.json" with { type: "json" };

// Os segredos precisam estar no ambiente ANTES do modulo assinar qualquer
// coisa -- ele le sob demanda, entao basta definir aqui.
Deno.env.set("QR_PEDIDO_SEGREDO", casos.segredo_qr);
Deno.env.set("ACESSO_ELEVACAO_SEGREDO", casos.segredo_elevacao);

const {
  assinarCorpo,
  conferirQrPedido,
  gerarQrPedido,
  conferirElevacao,
  gerarElevacao,
  iguaisEmTempoConstante,
  SEGREDO_QR_PEDIDO,
  SEGREDO_ELEVACAO,
} = await import("./assinatura.ts");

Deno.test("assinatura: cada corpo cru bate com o Python, byte a byte", async () => {
  for (const c of casos.corpos_crus) {
    assertEquals(
      await assinarCorpo(SEGREDO_QR_PEDIDO, c.corpo),
      c.assinatura,
      `o corpo ${JSON.stringify(c.corpo)} assina diferente do Python`,
    );
  }
});

Deno.test("assinatura: tem sempre 27 caracteres", async () => {
  for (const c of casos.corpos_crus) {
    assertEquals((await assinarCorpo(SEGREDO_QR_PEDIDO, c.corpo)).length, 27);
  }
});

Deno.test("assinatura: nunca sai com o alfabeto do base64 padrao", async () => {
  // `+`, `/` e `=` nao existem em base64url. Se aparecerem, a troca falhou.
  for (const c of casos.corpos_crus) {
    const a = await assinarCorpo(SEGREDO_QR_PEDIDO, c.corpo);
    assertEquals(/[+/=]/.test(a), false, `assinatura com alfabeto errado: ${a}`);
  }
});

Deno.test("assinatura: segredo diferente da assinatura diferente", async () => {
  // Prova que o segredo entra mesmo no calculo. Sem isto, uma implementacao
  // que ignorasse a chave passaria em todos os casos acima desde que fosse
  // consistente consigo mesma.
  const doQr = await assinarCorpo(SEGREDO_QR_PEDIDO, "1.2");
  const daElevacao = await assinarCorpo(SEGREDO_ELEVACAO, "1.2");
  assertEquals(doQr === daElevacao, false);
});

Deno.test("QR do Pedido: confere token que o Python emitiu", async () => {
  for (const c of casos.qr) {
    if (c.expira < Math.floor(Date.now() / 1000)) continue; // vencido de proposito
    assertEquals(await conferirQrPedido(c.token), c.pedido);
  }
});

Deno.test("QR do Pedido: token vencido do Python e recusado como vencido", async () => {
  const vencido = casos.qr.find((c) => c.expira === 0)!;
  await assertRejects(() => conferirQrPedido(vencido.token), Error, "token vencido");
});

Deno.test("QR do Pedido: ida e volta na propria funcao", async () => {
  assertEquals(await conferirQrPedido(await gerarQrPedido(18560)), 18560);
});

Deno.test("QR do Pedido: assinatura mexida e recusada ANTES da validade", async () => {
  // A ordem importa: dizer "vencido" para um token forjado contaria a quem
  // esta tentando que aquele pedido existiu algum dia.
  const t = await gerarQrPedido(18560);
  const mexido = t.slice(0, -1) + (t.at(-1) === "A" ? "B" : "A");
  await assertRejects(() => conferirQrPedido(mexido), Error, "assinatura invalida");
});

Deno.test("QR do Pedido: malformado nao vira pedido", async () => {
  for (const ruim of ["", "1.2", "a.b.c", "1.2.3.4", "..", "1..x"]) {
    await assertRejects(() => conferirQrPedido(ruim), Error);
  }
});

Deno.test("elevacao: confere bilhete que o Python emitiu", async () => {
  for (const c of casos.elevacao) {
    if (c.expira < Math.floor(Date.now() / 1000)) continue;
    await conferirElevacao(c.token, c.evento_id, c.conta_id, c.navegador);
  }
});

Deno.test("elevacao: bilhete de outro evento nao vale neste", async () => {
  const c = casos.elevacao.find((x) => x.expira === 2147483647)!;
  await assertRejects(
    () => conferirElevacao(c.token, "outro-evento", c.conta_id, c.navegador),
    Error,
    "assinatura invalida",
  );
});

Deno.test("elevacao: bilhete de outro navegador nao vale neste", async () => {
  const c = casos.elevacao.find((x) => x.expira === 2147483647)!;
  await assertRejects(
    () => conferirElevacao(c.token, c.evento_id, c.conta_id, "outro-nav"),
    Error,
    "assinatura invalida",
  );
});

Deno.test("elevacao: identificador com ponto e recusado", async () => {
  // A regra que impede deslocar campos: com ponto dentro de um identificador,
  // `a.b` + `c` e `a` + `b.c` montariam o mesmo corpo assinado.
  await assertRejects(
    () => gerarElevacao("evento.com.ponto", "conta", "nav"),
    Error,
    "identificador invalido",
  );
  await assertRejects(
    () => conferirElevacao("x.y.z.1.s", "evento.ponto", "conta", "nav"),
    Error,
    "identificador invalido",
  );
});

Deno.test("elevacao: ida e volta na propria funcao", async () => {
  const { token } = await gerarElevacao("ev-1", "conta-1", "nav-1");
  await conferirElevacao(token, "ev-1", "conta-1", "nav-1");
});

Deno.test("tempo constante: os casos que um `===` deixaria passar", () => {
  assertEquals(iguaisEmTempoConstante("abc", "abc"), true);
  assertEquals(iguaisEmTempoConstante("abc", "abd"), false);
  assertEquals(iguaisEmTempoConstante("abc", "abcd"), false);
  assertEquals(iguaisEmTempoConstante("", ""), true);
});
