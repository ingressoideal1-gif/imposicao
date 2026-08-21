/**
 * A senha semanal de liberacao de peso: a semana, a derivacao e a conferencia.
 *
 * Tudo aqui e PURO de proposito. `senhaAtual` e `conferirSenha` leem o segredo
 * pela `precisaDoSegredo`, que olha o ambiente e depois o banco -- e este teste
 * roda sem `--allow-env` e sem banco. Por isso o modulo separa a derivacao
 * (`senhaDaSemana`, que recebe o segredo como texto) e a comparacao
 * (`conferirContra`, que recebe a senha esperada) do que vai buscar o segredo.
 *
 * O segredo abaixo e de TESTE, fixo e publico de proposito: o arquivo vai para
 * o repositorio. As senhas literais foram conferidas contra o `hmac` do Python
 * com a mesma formula, em 21/08/2026 -- se a derivacao mudar, elas mudam, e e
 * isso que o teste cobra: trocar a formula trocaria a senha de todas as
 * estacoes no dia da publicacao.
 *
 * Rodar: npx deno test supabase/functions/_compartilhado/senha_liberacao_test.ts
 */
import { assert, assertEquals, assertMatch, assertNotEquals } from "jsr:@std/assert@1";
import {
  conferirContra,
  FUSO,
  normalizarSenha,
  SEGREDO_SENHA_LIBERACAO,
  semanaDe,
  senhaDaSemana,
} from "./senha_liberacao.ts";

const SEGREDO = "segredo-de-teste-fixo-e-publico";

Deno.test("contrato: o nome do segredo e o fuso sao os combinados", () => {
  assertEquals(SEGREDO_SENHA_LIBERACAO, "PESO_LIBERACAO_SEGREDO");
  assertEquals(FUSO, "America/Sao_Paulo");
});

// ── A semana ────────────────────────────────────────────────────────────────

Deno.test("semana: 21/08/2026 (sexta) e a W34, de 17/08 a 23/08", () => {
  assertEquals(semanaDe(new Date("2026-08-21T15:00:00Z")), {
    chave: "2026-W34",
    inicio: "2026-08-17",
    fim: "2026-08-23",
  });
});

Deno.test("semana: vira na segunda 00:00 de Sao Paulo, nao no UTC", () => {
  // Sao Paulo e UTC-3 o ano inteiro (sem horario de verao desde 2019).
  // Domingo 23/08 23:59:59 em SP e 02:59:59Z de 24/08: ainda W34.
  assertEquals(semanaDe(new Date("2026-08-24T02:59:59Z")).chave, "2026-W34");
  // Segunda 24/08 00:00:00 em SP e 03:00:00Z: W35.
  assertEquals(semanaDe(new Date("2026-08-24T03:00:00Z")).chave, "2026-W35");
  // O caso que pega uma implementacao feita sobre o UTC: as 00:30Z de 24/08 o
  // UTC ja esta na segunda, mas na mesa do acabamento ainda e domingo 21:30.
  assertEquals(semanaDe(new Date("2026-08-24T00:30:00Z")).chave, "2026-W34");
});

Deno.test("semana: a virada do ano segue a regra ISO", () => {
  // 1/1/2026 e quinta: a W01 de 2026 comeca em 29/12/2025.
  assertEquals(semanaDe(new Date("2025-12-29T12:00:00Z")), {
    chave: "2026-W01",
    inicio: "2025-12-29",
    fim: "2026-01-04",
  });
  assertEquals(semanaDe(new Date("2026-01-04T12:00:00Z")).chave, "2026-W01");
  assertEquals(semanaDe(new Date("2026-01-05T12:00:00Z")).chave, "2026-W02");
  // 2026 tem 53 semanas ISO, e 1/1/2027 (sexta) ainda e da ultima delas.
  assertEquals(semanaDe(new Date("2027-01-01T12:00:00Z")), {
    chave: "2026-W53",
    inicio: "2026-12-28",
    fim: "2027-01-03",
  });
});

Deno.test("semana: a chave tem sempre o formato AAAA-Www", () => {
  for (let i = 0; i < 400; i++) {
    const d = new Date(Date.UTC(2026, 0, 1) + i * 86_400_000 + 12 * 3_600_000);
    assertMatch(semanaDe(d).chave, /^\d{4}-W\d{2}$/, d.toISOString());
  }
});

// ── A senha ─────────────────────────────────────────────────────────────────

Deno.test("senha: 1 letra maiuscula + 2 digitos, sempre", async () => {
  for (let w = 1; w <= 53; w++) {
    const chave = `2026-W${String(w).padStart(2, "0")}`;
    assertMatch(await senhaDaSemana(SEGREDO, chave), /^[A-Z][0-9]{2}$/, chave);
  }
});

Deno.test("senha: a derivacao e a combinada -- literais conferidos com o Python", async () => {
  assertEquals(await senhaDaSemana(SEGREDO, "2026-W01"), "P25");
  assertEquals(await senhaDaSemana(SEGREDO, "2026-W34"), "M04");
  assertEquals(await senhaDaSemana(SEGREDO, "2026-W35"), "K03");
  assertEquals(await senhaDaSemana(SEGREDO, "2026-W53"), "K33");
});

Deno.test("senha: mesma semana, mesma senha", async () => {
  assertEquals(
    await senhaDaSemana(SEGREDO, "2026-W34"),
    await senhaDaSemana(SEGREDO, "2026-W34"),
  );
});

Deno.test("senha: semanas diferentes dao senhas diferentes (em geral)", async () => {
  // Sao 2.600 senhas possiveis; alguma repeticao ao longo do ano e esperada.
  // O que nao pode acontecer e a senha nao depender da semana.
  assertNotEquals(
    await senhaDaSemana(SEGREDO, "2026-W34"),
    await senhaDaSemana(SEGREDO, "2026-W35"),
  );
  const vistas = new Set<string>();
  for (let w = 1; w <= 52; w++) {
    vistas.add(await senhaDaSemana(SEGREDO, `2026-W${String(w).padStart(2, "0")}`));
  }
  assert(vistas.size >= 40, `so ${vistas.size} senhas distintas em 52 semanas`);
});

Deno.test("senha: segredo diferente, senha diferente", async () => {
  assertEquals(await senhaDaSemana("outro", "2026-W34"), "C93");
  assertNotEquals(await senhaDaSemana("outro", "2026-W34"), await senhaDaSemana(SEGREDO, "2026-W34"));
});

// ── A conferencia ───────────────────────────────────────────────────────────

Deno.test("conferir: aceita ' k47 ' e recusa 'K48'", () => {
  assertEquals(conferirContra(" k47 ", "K47"), true);
  assertEquals(conferirContra("k47", "K47"), true);
  assertEquals(conferirContra("K47", "K47"), true);
  assertEquals(conferirContra("K48", "K47"), false);
  assertEquals(conferirContra("L47", "K47"), false);
  assertEquals(conferirContra("K4", "K47"), false);
  assertEquals(conferirContra("K477", "K47"), false);
});

Deno.test("conferir: vazio, nulo e nao-texto sao 'nao confere', e nao erro", () => {
  for (const ruim of ["", "   ", null, undefined, 47, {}, [], true]) {
    assertEquals(conferirContra(ruim, "K47"), false, JSON.stringify(ruim));
  }
});

Deno.test("normalizar: apara e sobe para maiusculas; nao-texto vira vazio", () => {
  assertEquals(normalizarSenha("  k47\n"), "K47");
  assertEquals(normalizarSenha(47), "");
  assertEquals(normalizarSenha(null), "");
});

Deno.test("conferir: a senha derivada confere consigo mesma depois de normalizada", async () => {
  const senha = await senhaDaSemana(SEGREDO, "2026-W34");
  assertEquals(conferirContra(` ${senha.toLowerCase()} `, senha), true);
});
