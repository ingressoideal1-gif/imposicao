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
import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import casos from "./momento_casos.json" with { type: "json" };
import {
  aplicarAparelho,
  aplicarEvento,
  aplicarSetor,
  conferirJanela,
  excluirAparelho,
  faixa,
  momento,
  sortearCodigo,
  texto,
  zerarEntradas,
} from "./configuracao.ts";
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

// ── O banco, de mesa ────────────────────────────────────────────────────────
//
// Os testes acima sao de funcoes puras. `aplicarEvento` e `aplicarSetor` nao
// sao: as duas GRAVAM antes de devolver o `gravado`, e o `banco()` chega no
// PostgREST por `fetch`.
//
// O dublê e no `fetch`, e nao numa troca do `banco()`, de proposito: assim o
// caminho real do modulo continua sendo percorrido -- validacao, monta a
// mudanca, monta a URL, grava. Um dublê mais alto deixaria de exercitar
// exatamente a parte que se quer conferir aqui, que e O QUE cada funcao aceita
// gravar.

const fetchDeVerdade = globalThis.fetch;

/**
 * Roda a tarefa com o banco dublado e devolve o fetch verdadeiro no fim.
 *
 * O `finally` importa mesmo quando a tarefa recusa: sem ele, uma Recusa
 * esperada deixaria o `fetch` trocado para os testes seguintes, e a falha
 * apareceria longe de quem a causou.
 */
async function comBancoDeMesa<T>(tarefa: () => Promise<T>): Promise<T> {
  Deno.env.set("SUPABASE_URL", "https://banco.de.mesa");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "chave-de-mesa");
  // `return=minimal` responde 204 sem corpo, que e como os `aplicar*` gravam.
  globalThis.fetch = (() =>
    Promise.resolve(new Response(null, { status: 204 }))) as typeof fetch;
  try {
    return await tarefa();
  } finally {
    globalThis.fetch = fetchDeVerdade;
  }
}

/** O setor ja lido do banco, que e o que `aplicarSetor` recebe. */
const SETOR = { id: "s1", evento_id: "e1", abre_em: null, fecha_em: null };

Deno.test("evento: status aceita ativo, encerrado e finalizado", async () => {
  // Sao os TRES estados da tela: lendo, pausado e arquivado. `finalizado` e o
  // que o dono escolhe quando o evento acabou -- e por isso ele tem de voltar
  // para `ativo` ou `encerrado` depois, no reabrir.
  for (const valor of ["ativo", "encerrado", "finalizado"]) {
    const r = await comBancoDeMesa(() => aplicarEvento("e1", { status: valor }));
    assertEquals(r.gravado, ["status"], `recusou o status ${valor}`);
  }
});

Deno.test("evento: status `excluido` NAO passa, nem depois do finalizado", async () => {
  // A coluna aceita, e e por isso que o teste existe -- agora com um motivo a
  // mais: `finalizado` e a palavra parecida que ACABOU de entrar, e quem
  // encostar nesta validacao de novo pode achar que "ja que finalizado passa,
  // excluido tambem". Nao passa. Um evento acontece e termina; ele nao deixa de
  // ter existido. A diferenca entre os dois e "o dono arquivou o evento" e "o
  // evento sumiu da conta dele" -- sem volta e sem nada na tela que explicasse.
  await assertRejects(
    () => comBancoDeMesa(() => aplicarEvento("e1", { status: "excluido" })),
    Recusa,
  );
});

Deno.test("evento: status desconhecido nao passa", async () => {
  await assertRejects(
    () => comBancoDeMesa(() => aplicarEvento("e1", { status: "pausado" })),
    Recusa,
  );
});

Deno.test("setor: bloquear com motivo grava os dois campos", async () => {
  const r = await comBancoDeMesa(() =>
    aplicarSetor(SETOR, {
      bloqueado: true,
      bloqueado_motivo: "Camarote interditado pelos bombeiros",
    })
  );
  assertEquals(r.gravado, ["bloqueado", "bloqueado_motivo"]);
});

Deno.test("setor: bloquear SEM dizer por que nao passa", async () => {
  // O motivo e o que o porteiro le em voz alta para quem esta na fila. Bloqueio
  // mudo vira "nao sei, o sistema nao deixou" na frente da pessoa.
  await assertRejects(
    () =>
      comBancoDeMesa(() =>
        aplicarSetor(SETOR, { bloqueado: true, bloqueado_motivo: "  " })
      ),
    Recusa,
  );
});

Deno.test("setor: desbloquear apaga o motivo junto", async () => {
  // Motivo velho grudado num setor liberado reapareceria na proxima recusa,
  // falando de um bloqueio que ja acabou.
  const r = await comBancoDeMesa(() => aplicarSetor(SETOR, { bloqueado: false }));
  assertEquals(r.gravado, ["bloqueado", "bloqueado_motivo"]);
});

// ── Zerar as entradas ───────────────────────────────────────────────────────
//
// `zerarEntradas` e a unica funcao deste modulo que DESTROI dado, e o que ela
// NAO toca importa tanto quanto o que ela apaga. Isso nao da para conferir pelo
// valor de retorno -- so olhando as idas ao banco.

const MARCA = "2026-08-16T23:10:00+00:00";

/** Uma ida ao banco, como o dublê a viu. */
interface Ida {
  metodo: string;
  caminho: string;
  corpo: string;
}

/**
 * O mesmo dublê de `comBancoDeMesa`, mas ANOTANDO cada ida.
 *
 * E o unico jeito de provar uma ausencia: que as credenciais, os setores e os
 * aparelhos continuam onde estao depois de zerar. Um teste sobre o valor de
 * retorno nunca reprovaria um DELETE a mais.
 */
async function anotandoAsIdasAoBanco<T>(
  tarefa: () => Promise<T>,
): Promise<{ resultado: T; idas: Ida[] }> {
  const idas: Ida[] = [];
  Deno.env.set("SUPABASE_URL", "https://banco.de.mesa");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "chave-de-mesa");
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    const metodo = init?.method ?? "GET";
    idas.push({
      metodo,
      caminho: String(url).replace("https://banco.de.mesa/rest/v1/", ""),
      corpo: String(init?.body ?? ""),
    });
    // O PATCH volta com a linha, como o `return=representation` de verdade: e
    // dela que sai o `zerado_em` da resposta. Um 204 aqui esconderia que a
    // funcao depende da representacao para ter o que responder.
    if (metodo === "PATCH") {
      return Promise.resolve(
        new Response(JSON.stringify([{ entradas_zeradas_em: MARCA }]), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return Promise.resolve(new Response(null, { status: 204 }));
  }) as typeof fetch;
  try {
    return { resultado: await tarefa(), idas };
  } finally {
    globalThis.fetch = fetchDeVerdade;
  }
}

Deno.test("zerar: apaga as entradas unicas E as leituras", async () => {
  // As duas, e nao uma. `entradas_unicas` e o que decide a corrida entre dois
  // portoes; `leituras` e de onde sai o numero na tela. Apagar so a primeira
  // deixaria o contador cheio; so a segunda deixaria `ja_entrou` barrando quem
  // entrou no teste.
  const { idas } = await anotandoAsIdasAoBanco(() => zerarEntradas("e1"));
  const apagados = idas.filter((i) => i.metodo === "DELETE").map((i) => i.caminho);
  assertEquals(
    apagados.some((c) => c.startsWith("producao_acesso_entradas_unicas?evento_id=eq.e1")),
    true,
    `nao apagou as entradas unicas: ${JSON.stringify(apagados)}`,
  );
  assertEquals(
    apagados.some((c) => c.startsWith("producao_acesso_leituras?evento_id=eq.e1")),
    true,
    `nao apagou as leituras: ${JSON.stringify(apagados)}`,
  );
});

Deno.test("zerar: NAO apaga credenciais, setores nem aparelhos", async () => {
  // E a escolha do usuario, e cada uma tem um custo proprio se for quebrada:
  // sem as credenciais o portao recusa TODO MUNDO como `desconhecido`; sem os
  // setores nao ha onde a leitura cair; sem os aparelhos o dono pareia os
  // celulares de novo, um a um, com o evento prestes a comecar.
  const { idas } = await anotandoAsIdasAoBanco(() => zerarEntradas("e1"));
  for (const tabela of [
    "producao_acesso_credenciais",
    "producao_acesso_setores",
    "producao_acesso_dispositivos",
    "producao_acesso_dispositivo_setores",
    "producao_acesso_bloqueios",
    "producao_acesso_pedidos",
  ]) {
    assertEquals(
      idas.some((i) => i.metodo === "DELETE" && i.caminho.startsWith(tabela)),
      false,
      `zerar apagou ${tabela}, e nao devia`,
    );
  }
});

Deno.test("zerar: nunca apaga sem dizer de QUAL evento", async () => {
  // Um DELETE sem filtro no PostgREST apaga a tabela inteira -- as entradas de
  // todos os clientes da grafica, de todos os eventos, com um clique so.
  const { idas } = await anotandoAsIdasAoBanco(() => zerarEntradas("e1"));
  for (const i of idas.filter((x) => x.metodo === "DELETE")) {
    assertEquals(
      i.caminho.includes("evento_id=eq.e1"),
      true,
      `DELETE sem o evento no filtro: ${i.caminho}`,
    );
  }
});

Deno.test("zerar: carimba a marca DEPOIS de apagar, e nao antes", async () => {
  // A marca e o que manda os portoes esquecerem o que baixaram. Carimbada
  // antes, o celular esvaziaria a lista local e o sincronismo seguinte a
  // encheria de novo com as MESMAS entradas -- o dono veria o contador voltar
  // sozinho e nao teria como entender por que.
  const { idas } = await anotandoAsIdasAoBanco(() => zerarEntradas("e1"));
  const ultimoDelete = idas.map((i) => i.metodo).lastIndexOf("DELETE");
  const carimbo = idas.findIndex(
    (i) => i.metodo === "PATCH" && i.caminho.startsWith("producao_acesso_eventos"),
  );
  assertEquals(carimbo > ultimoDelete, true, "a marca foi gravada antes de apagar");
});

Deno.test("zerar: a marca e o relogio do BANCO", async () => {
  // `now()` e nao um instante calculado aqui: o aparelho COMPARA esta marca com
  // a que guardou, e um relogio diferente do que carimba as linhas poderia cair
  // antes de entradas que ela deveria apagar.
  const { idas } = await anotandoAsIdasAoBanco(() => zerarEntradas("e1"));
  const patch = idas.find((i) => i.metodo === "PATCH");
  assertEquals(JSON.parse(patch!.corpo), { entradas_zeradas_em: "now()" });
});

Deno.test("zerar: devolve o instante, para a tela nao ter de perguntar de novo", async () => {
  const { resultado } = await anotandoAsIdasAoBanco(() => zerarEntradas("e1"));
  assertEquals(resultado.zerado_em, MARCA);
});

Deno.test("setor: `bloqueado` que nao e booleano nao passa", async () => {
  // "sim" e verdadeiro em JavaScript. Aceita-lo faria a tela mandar qualquer
  // coisa e o setor fechar sem que ninguem tivesse pedido.
  await assertRejects(
    () => comBancoDeMesa(() => aplicarSetor(SETOR, { bloqueado: "sim" })),
    Recusa,
  );
});


// ── Pausar e excluir um aparelho ────────────────────────────────────────────
//
// 18/08/2026: "Revogar" saiu, e no lugar dele entraram Pausar (tem volta) e
// Excluir (nao tem, e apaga a linha). Os testes abaixo guardam a diferenca.

/** Como o `comBancoDeMesa`, mas ANOTANDO cada ida ao banco. */
async function anotandoOBanco<T>(
  tarefa: () => Promise<T>,
): Promise<{ r: T; idas: Array<{ metodo: string; url: string }> }> {
  Deno.env.set("SUPABASE_URL", "https://banco.de.mesa");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "chave-de-mesa");
  const idas: Array<{ metodo: string; url: string }> = [];
  globalThis.fetch = ((url: string, opcoes: RequestInit) => {
    idas.push({ metodo: String(opcoes?.method ?? "GET"), url: String(url) });
    return Promise.resolve(new Response(null, { status: 204 }));
  }) as unknown as typeof fetch;
  try {
    return { r: await tarefa(), idas };
  } finally {
    globalThis.fetch = fetchDeVerdade;
  }
}

/** O aparelho ja lido do banco, que e o que as duas funcoes recebem. */
const APARELHO = { id: "a1", evento_id: "e1", nome: "Portao A" };

Deno.test("aparelho: status aceita ativo e pausado", async () => {
  for (const valor of ["ativo", "pausado"]) {
    const { r } = await anotandoOBanco(() =>
      aplicarAparelho(APARELHO, { status: valor })
    );
    assertEquals(r.ok, true, `recusou o status ${valor}`);
  }
});

Deno.test("aparelho: `revogado` nao passa mais", async () => {
  // A coluna e texto livre e aceitaria. Quem nao aceita e esta validacao: o
  // estado do meio -- desligado para sempre, mas ocupando a lista -- deixou de
  // existir como escolha da tela, e recria-lo por uma chamada solta poria de
  // volta na tela do dono um cartao que ele nao tem como resolver.
  await assertRejects(
    () => anotandoOBanco(() => aplicarAparelho(APARELHO, { status: "revogado" })),
    Recusa,
  );
});

Deno.test("excluir aparelho: apaga os vinculos e a linha, e NAO toca nas leituras", async () => {
  const { r, idas } = await anotandoOBanco(() => excluirAparelho(APARELHO));

  assertEquals(r.excluido, "a1");
  assertEquals(idas.map((i) => i.metodo), ["DELETE", "DELETE"]);
  // Os vinculos primeiro: sem eles, a linha do aparelho ainda tem quem aponte
  // para ela num banco onde a migracao do `on delete cascade` nao passou.
  assertEquals(
    idas[0].url,
    "https://banco.de.mesa/rest/v1/producao_acesso_dispositivo_setores?dispositivo_id=eq.a1",
  );
  assertEquals(
    idas[1].url,
    "https://banco.de.mesa/rest/v1/producao_acesso_dispositivos?id=eq.a1",
  );
  // O historico da noite nao vai junto. Quem cuida disso e o `on delete set
  // null` das leituras -- e este teste garante que ninguem resolva o mesmo
  // problema apagando-as por aqui.
  assertEquals(idas.some((i) => i.url.includes("leituras")), false);
});
