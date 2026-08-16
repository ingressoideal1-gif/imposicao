/**
 * As pecas puras da tela interna.
 *
 * `hora_casos.json` foi gerado chamando `acesso_interno._hora_cheia` caso a
 * caso -- e nao e enfeite: a primeira versao deste porte convertia para UTC, e
 * so a comparacao com o Python mostrou que ele NAO converte.
 *
 * Rodar: npx deno test acesso-interno/puro_test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import casos from "./hora_casos.json" with { type: "json" };
import {
  horaCheia,
  numeracaoDoModelo,
  numeroDaPagina,
  pedacosDaRota,
  situacao,
  tamanhoDaPagina,
  termoSeguro,
} from "./puro.ts";

Deno.test("hora cheia: bate com o Python caso a caso", () => {
  for (const c of casos) {
    const alvo = c.momento === null ? null : c.momento;
    assertEquals(horaCheia(alvo), c.hora, `divergiu em ${JSON.stringify(alvo)}`);
  }
});

Deno.test("hora cheia: o fuso NAO desloca a hora", () => {
  // O caso que a primeira versao errava. Converter para UTC daria 01:00 do dia
  // seguinte, e o pico do grafico apareceria numa hora vazia.
  assertEquals(horaCheia("2026-08-15T22:33:16-03:00"), "2026-08-15T22:00");
  assertEquals(horaCheia("2026-08-15T22:33:16+05:30"), "2026-08-15T22:00");
});

Deno.test("hora cheia: data impossivel vira vazio, como no Python", () => {
  for (const ruim of ["2026-13-99", "2026-02-30T10:00", "amanha", "", null]) {
    assertEquals(horaCheia(ruim), "", `deveria ser vazio: ${ruim}`);
  }
});

Deno.test("rota: o prefixo do Supabase sai, e os pedacos sobram", () => {
  assertEquals(
    pedacosDaRota("/functions/v1/acesso-interno/pedidos/18560/dashboard"),
    ["pedidos", "18560", "dashboard"],
  );
  assertEquals(pedacosDaRota("/acesso-interno/pedidos"), ["pedidos"]);
});

Deno.test("rota: barra sobrando nao vira pedaco vazio", () => {
  // `/pedidos/` chegaria como ["pedidos", ""] sem o filtro, e o comprimento
  // 2 casaria com a rota de VER UM pedido, com id vazio.
  assertEquals(pedacosDaRota("/acesso-interno/pedidos/"), ["pedidos"]);
  assertEquals(pedacosDaRota("/acesso-interno/"), []);
  assertEquals(pedacosDaRota("/acesso-interno"), []);
});

Deno.test("rota: id com caractere escapado volta ao normal", () => {
  assertEquals(pedacosDaRota("/acesso-interno/setores/a%20b"), ["setores", "a b"]);
});

Deno.test("pagina: o teto de 500 vale, e o piso e 1", () => {
  // Passar de 1.000 faria o PostgREST cortar em silencio.
  assertEquals(tamanhoDaPagina(5000), 500);
  // O `or` do Python cai no padrao para qualquer valor falso, e `0` e falso.
  assertEquals(tamanhoDaPagina(0), 200);
  assertEquals(tamanhoDaPagina(""), 200);
  assertEquals(tamanhoDaPagina(-3), 1);
  assertEquals(tamanhoDaPagina("50"), 50);
  assertEquals(tamanhoDaPagina(null), 200);
  assertEquals(tamanhoDaPagina("abacaxi"), 200);
});

Deno.test("pagina: numero abaixo de 1 vira 1", () => {
  assertEquals(numeroDaPagina(0), 1);
  assertEquals(numeroDaPagina(-9), 1);
  assertEquals(numeroDaPagina("3"), 3);
  assertEquals(numeroDaPagina("x"), 1);
});

Deno.test("busca: tira o que quebraria o filtro do PostgREST", () => {
  assertEquals(termoSeguro("a*b,c&d"), "abcd");
  assertEquals(termoSeguro("x".repeat(200)).length, 64);
});

Deno.test("situacao: cancelado vence bloqueado, que vence entrou", () => {
  assertEquals(situacao({ status: "cancelado" }, "roubo", "2026-08-15"), "cancelado");
  assertEquals(situacao({ status: "ativo" }, "roubo", "2026-08-15"), "bloqueado");
  assertEquals(situacao({ status: "ativo" }, null, "2026-08-15"), "entrou");
  assertEquals(situacao({ status: "ativo" }, null, null), "disponivel");
  assertEquals(situacao({}, null, null), "disponivel");
});

Deno.test("modelo: o QR_IDEAL vence, seja qual for a ordem salva", () => {
  const elementos = [
    { type: "BARCODE", prefix: "B" },
    { type: "QR_IDEAL", prefix: "A", pad: 6 },
    { type: "QR", prefix: "C" },
  ];
  assertEquals(numeracaoDoModelo(elementos)?.tipo, "QR_IDEAL");
  assertEquals(numeracaoDoModelo([...elementos].reverse())?.tipo, "QR_IDEAL");
});

Deno.test("modelo: alimentado por coluna do CSV nao sobe", () => {
  // O conteudo vem da linha, e nao do numero do item: publicar a conta
  // sequencial gravaria um hash que NAO corresponde ao impresso, e todo
  // ingresso seria recusado com a causa invisivel.
  assertEquals(numeracaoDoModelo([{ type: "QR_IDEAL", source: "database" }]), null);
});

Deno.test("modelo: valor fixo nao identifica nada, entao nao sobe", () => {
  assertEquals(numeracaoDoModelo([{ type: "QR_IDEAL", fixed: true }]), null);
});

Deno.test("modelo: sem elemento de codigo nenhum devolve nulo", () => {
  assertEquals(numeracaoDoModelo([{ type: "TEXT" }]), null);
  assertEquals(numeracaoDoModelo([]), null);
  assertEquals(numeracaoDoModelo(null), null);
});

Deno.test("modelo: lixo na lista nao derruba a leitura", () => {
  assertEquals(
    numeracaoDoModelo([null, "texto", 7, { type: "QR", prefix: "X", pad: "4" }])?.pad,
    4,
  );
});
