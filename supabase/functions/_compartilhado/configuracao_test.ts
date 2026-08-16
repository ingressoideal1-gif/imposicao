/**
 * Os validadores da configuracao, contra o comportamento medido do Python.
 *
 * `momento_casos.json` foi gerado chamando `acesso_config._momento` caso a
 * caso. Nao e uma lista que eu imaginei: e o que o Render responde hoje.
 *
 * Este arquivo existe por causa de uma divergencia real encontrada em
 * 16/08/2026. O `Date` do JavaScript e MAIS permissivo que o
 * `datetime.fromisoformat` em algumas formas ("Sept 28 2026") e MENOS em
 * outras (a forma compacta `20260928T2000`, que o Python aceita). Os dois
 * lados discordando significaria o Render gravando um horario que a Edge
 * Function recusa, ou o contrario -- e o sintoma seria a tela do dono
 * "as vezes nao salvar a hora".
 *
 * Rodar: npx deno test _compartilhado/configuracao_test.ts
 */
import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import casos from "./momento_casos.json" with { type: "json" };
import { conferirJanela, faixa, momento, sortearCodigo, texto } from "./configuracao.ts";
import { Recusa } from "./sessao.ts";

Deno.test("momento: aceita e recusa exatamente o que o Python", () => {
  for (const c of casos) {
    const alvo = c.texto === "None" ? null : c.texto;
    if (c.aceito) {
      assertEquals(
        momento(alvo, "campo"),
        c.devolve,
        `o Python aceita ${JSON.stringify(alvo)} e devolve ${JSON.stringify(c.devolve)}`,
      );
    } else {
      assertThrows(
        () => momento(alvo, "campo"),
        Recusa,
        undefined,
        `o Python recusa ${JSON.stringify(alvo)} e esta funcao aceitou`,
      );
    }
  }
});

Deno.test("momento: vazio e nulo sao o mesmo pedido -- sem limite deste lado", () => {
  // O dono precisa de um jeito de voltar atras depois de ter posto um horario.
  assertEquals(momento(null, "c"), null);
  assertEquals(momento("", "c"), null);
  assertEquals(momento("   ", "c"), null);
});

Deno.test("momento: separador misturado nao passa", () => {
  // `2026-0928` nao e aceito por nenhum dos dois lados; a regex tem de exigir a
  // MESMA escolha de separador no campo inteiro.
  for (const ruim of ["2026-0928", "20260928T20:00", "2026-09-28T2000"]) {
    assertThrows(() => momento(ruim, "c"), Recusa, undefined, `passou: ${ruim}`);
  }
});

Deno.test("janela: fechar antes de abrir recusa", () => {
  assertThrows(
    () => conferirJanela("2026-09-28T22:00", "2026-09-28T05:00"),
    Recusa,
  );
});

Deno.test("janela: o baile que vira a madrugada e legitimo", () => {
  // Abre sabado 22h, fecha domingo 5h. E o caso normal da gráfica.
  conferirJanela("2026-09-28T22:00", "2026-09-29T05:00");
});

Deno.test("janela: um lado so nao e erro", () => {
  conferirJanela("2026-09-28T22:00", null);
  conferirJanela(null, "2026-09-29T05:00");
  conferirJanela(null, null);
});

Deno.test("janela: sem fuso e comparado como UTC, nao como hora da maquina", () => {
  // Se um lado virasse hora local e o outro nao, o resultado dependeria de
  // onde a funcao esta rodando.
  conferirJanela("2026-09-28T22:00", "2026-09-28T23:00Z");
  assertThrows(() => conferirJanela("2026-09-28T23:00Z", "2026-09-28T22:00"), Recusa);
});

Deno.test("janela: fechar EXATAMENTE na hora de abrir recusa", () => {
  assertThrows(() => conferirJanela("2026-09-28T22:00", "2026-09-28T22:00"), Recusa);
});

Deno.test("faixa: a tiragem comeca em 1", () => {
  assertThrows(() => faixa({ de: 0, ate: 10 }, 100), Recusa);
});

Deno.test("faixa: invertida recusa -- ela nao bloquearia ingresso nenhum", () => {
  assertThrows(() => faixa({ de: 500, ate: 100 }, 1000), Recusa);
});

Deno.test("faixa: passar da quantidade do setor recusa", () => {
  assertThrows(() => faixa({ de: 1, ate: 101 }, 100), Recusa);
});

Deno.test("faixa: sem quantidade conhecida, o teto nao se aplica", () => {
  assertEquals(faixa({ de: 1, ate: 999999 }, 0), [1, 999999]);
});

Deno.test("faixa: texto no lugar de numero recusa", () => {
  for (const ruim of [{ de: "a", ate: 5 }, { de: 1 }, {}, { de: 1.5, ate: 5 }]) {
    assertThrows(() => faixa(ruim, 100), Recusa, undefined, JSON.stringify(ruim));
  }
});

Deno.test("faixa: um ingresso so e faixa valida", () => {
  assertEquals(faixa({ de: 7, ate: 7 }, 100), [7, 7]);
});

Deno.test("texto: apara espacos e mede o que sobrou", () => {
  assertEquals(texto("  Portao A  ", "nome", 1, 60), "Portao A");
  assertThrows(() => texto("   ", "nome", 1, 60), Recusa);
  assertThrows(() => texto("x".repeat(61), "nome", 1, 60), Recusa);
});

Deno.test("texto: minimo zero deixa passar o vazio", () => {
  assertEquals(texto("", "local", 0, 200), "");
});

Deno.test("codigo: seis caracteres do alfabeto sem ambiguidade", () => {
  const proibidos = /[01OIL]/;
  for (let i = 0; i < 200; i++) {
    const c = sortearCodigo();
    assertEquals(c.length, 6, `saiu com ${c.length}: ${c}`);
    assertEquals(proibidos.test(c), false, `caractere ambiguo em ${c}`);
  }
});

Deno.test("codigo: nao repete a cada chamada", () => {
  // Uma implementacao que devolvesse constante passaria em tudo acima.
  const vistos = new Set(Array.from({ length: 50 }, () => sortearCodigo()));
  assertEquals(vistos.size > 45, true, `so ${vistos.size} codigos distintos em 50`);
});
