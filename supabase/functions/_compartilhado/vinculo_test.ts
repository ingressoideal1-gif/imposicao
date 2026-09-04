/**
 * Desfazer e refazer o vinculo entre um pedido e o evento dele.
 *
 * As duas operacoes ESCREVEM, e uma delas destroi configuracao. O que estes
 * testes protegem e a ORDEM e os LIMITES: o que pode ser desfeito, o que nao
 * pode, e o que sobra quando uma escrita falha no meio.
 *
 * Rodar: npx deno test --allow-env _compartilhado/vinculo_test.ts
 */
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { desvincularPedido, sincronizarSetores } from "./vinculo.ts";
import { Recusa } from "./sessao.ts";

const fetchDeVerdade = globalThis.fetch;

interface Ida {
  metodo: string;
  caminho: string;
  corpo: string;
}

async function comBanco<T>(
  tabelas: Record<string, any[]>,
  contagens: Record<string, number>,
  tarefa: () => Promise<T>,
): Promise<{ resultado: T; idas: Ida[] }> {
  const idas: Ida[] = [];
  Deno.env.set("SUPABASE_URL", "https://banco.de.mesa");
  Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "chave-de-mesa");
  globalThis.fetch = ((url: string | URL | Request, init?: RequestInit) => {
    const caminho = String(url).replace("https://banco.de.mesa/rest/v1/", "");
    const metodo = init?.method ?? "GET";
    const contagem = (init?.headers as Record<string, string>)?.Prefer === "count=exact";
    if (!contagem) idas.push({ metodo, caminho, corpo: String(init?.body ?? "") });

    if (contagem) {
      const chave = Object.keys(contagens).find((k) => caminho.includes(k));
      return Promise.resolve(
        new Response(null, {
          headers: { "content-range": `0-0/${chave === undefined ? 0 : contagens[chave]}` },
        }),
      );
    }
    if (metodo === "POST") {
      // O `return=representation` de verdade devolve a linha criada, e e dela
      // que sai o id usado para carimbar as credenciais logo em seguida.
      return Promise.resolve(
        new Response(JSON.stringify([{ id: "setor-novo" }]), {
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    if (metodo === "PATCH") return Promise.resolve(new Response(null, { status: 204 }));
    const chave = Object.keys(tabelas).find((k) => caminho.includes(k));
    return Promise.resolve(
      new Response(JSON.stringify(chave === undefined ? [] : tabelas[chave]), {
        headers: { "Content-Type": "application/json" },
      }),
    );
  }) as typeof fetch;
  try {
    return { resultado: await tarefa(), idas };
  } finally {
    globalThis.fetch = fetchDeVerdade;
  }
}

const DOIS_SETORES = [
  { id: "s1", nome: "VIP", modelo_id: 1000001, quantidade: 100 },
  { id: "s2", nome: "Pista", modelo_id: 1000002, quantidade: 400 },
];

// ── Desvincular ─────────────────────────────────────────────────────────────

Deno.test("desvincular: com leitura na portaria, NAO desfaz e diz quantas", async () => {
  // Depois que gente passou pela porta, aquele setor e historico: apagar a
  // linha levaria junto a resposta de "quem entrou naquela noite", e o
  // relatorio do evento e o que o cliente pagou para ter.
  const erro = await assertRejects(
    () =>
      comBanco(
        { "producao_acesso_setores": DOIS_SETORES },
        { "producao_acesso_leituras": 37 },
        () => desvincularPedido(20272, "e1"),
      ),
    Recusa,
  );
  assertEquals((erro as Recusa).status, 409);
  assertEquals(String((erro as Recusa).message).includes("37 leituras"), true);
});

Deno.test("desvincular: sem leitura, descarimba, desliga os setores e solta o pedido", async () => {
  const { resultado, idas } = await comBanco(
    { "producao_acesso_setores": DOIS_SETORES },
    {},
    () => desvincularPedido(20272, "e1"),
  );
  assertEquals(resultado.setores_desligados, 2);
  assertEquals(resultado.nomes, ["VIP", "Pista"]);

  const escritas = idas.filter((i) => i.metodo === "PATCH");
  assertEquals(escritas.length, 4);   // credenciais + dois setores + pedido
  assertEquals(escritas[0].caminho.includes("producao_acesso_credenciais"), true);
  assertEquals(JSON.parse(escritas[0].corpo), { evento_id: null, setor_id: null });
});

Deno.test("desvincular: o vinculo do PEDIDO sai por ultimo", async () => {
  // Enquanto o `evento_id` do pedido estiver la, ele continua se declarando
  // carregado, e uma falha no meio deixa a operacao repetivel -- chamar de novo
  // termina o servico. Invertida, uma falha depois de soltar o pedido deixaria
  // setores vivos apontando para um evento que o pedido ja nao conhece, e tela
  // nenhuma mostraria isso.
  const { idas } = await comBanco(
    { "producao_acesso_setores": DOIS_SETORES },
    {},
    () => desvincularPedido(20272, "e1"),
  );
  const escritas = idas.filter((i) => i.metodo === "PATCH");
  assertEquals(escritas[escritas.length - 1].caminho.includes("producao_acesso_pedidos"), true);
});

Deno.test("desvincular: a credencial NAO e apagada -- so o carimbo sai", async () => {
  // Ela e o que foi impresso, e continua valida para o dia em que o pedido for
  // carregado no evento certo.
  const { idas } = await comBanco(
    { "producao_acesso_setores": DOIS_SETORES },
    {},
    () => desvincularPedido(20272, "e1"),
  );
  assertEquals(idas.some((i) => i.metodo === "DELETE"), false);
});

Deno.test("desvincular: o setor e DESLIGADO, e nao apagado", async () => {
  // O vinculo do aparelho com o setor aponta para esta linha; apaga-la
  // derrubaria a configuracao de um portao por causa de um pedido que saiu.
  const { idas } = await comBanco(
    { "producao_acesso_setores": DOIS_SETORES },
    {},
    () => desvincularPedido(20272, "e1"),
  );
  const doSetor = idas.filter((i) =>
    i.metodo === "PATCH" && i.caminho.includes("producao_acesso_setores")
  );
  assertEquals(doSetor.length, 2);
  assertEquals(JSON.parse(doSetor[0].corpo), { status: "excluido" });
});

Deno.test("desvincular: pedido sem setor nenhum passa sem quebrar", async () => {
  const { resultado } = await comBanco({}, {}, () => desvincularPedido(20272, "e1"));
  assertEquals(resultado.setores_desligados, 0);
});

// ── Sincronizar ─────────────────────────────────────────────────────────────

/**
 * O `modelosLegiveis` vai ao banco por conta propria. As duas tabelas que ele
 * le sao declaradas aqui: os modelos do ERP e as numeracoes deles.
 */
const MODELOS_DO_ERP = [
  { id: 1000001, nome_modelo: "VIP", quantidade: 100, amostra_num_id: "n1" },
  { id: 1000002, nome_modelo: "Pista", quantidade: 500, amostra_num_id: "n1" },
];
const NUMERACOES = [{ id: "n1", elements: [{ type: "QR", pad: 4 }] }];

Deno.test("sincronizar: cria o setor que faltava e carimba as credenciais dele", async () => {
  // O caso que motivou tudo: um modelo ganhou numeracao com codigo DEPOIS do
  // carregar -- que e exatamente o conserto quando a grafica errou a numeracao.
  const { resultado, idas } = await comBanco(
    {
      "pedidos_modelos": MODELOS_DO_ERP,
      "producao_numeracoes": NUMERACOES,
      "producao_acesso_setores": [DOIS_SETORES[0]],   // so o VIP existe
    },
    {},
    () => sincronizarSetores(20272, "e1"),
  );
  assertEquals(resultado.criados, ["Pista"]);

  const criacao = idas.find((i) => i.metodo === "POST")!;
  assertEquals(JSON.parse(criacao.corpo).modelo_id, 1000002);
  // O carimbo vem logo depois, com o id que o POST devolveu: sem ele, o modelo
  // vira setor e os ingressos continuam orfaos -- a portaria nao saberia de que
  // setor sao, e o bloqueio por faixa nao alcancaria nenhum.
  const carimbo = idas.find((i) =>
    i.metodo === "PATCH" && i.caminho.includes("producao_acesso_credenciais")
  )!;
  assertEquals(carimbo.caminho.includes("modelo_id=eq.1000002"), true);
  assertEquals(JSON.parse(carimbo.corpo), { evento_id: "e1", setor_id: "setor-novo" });
});

Deno.test("sincronizar: a quantidade e atualizada; o NOME do cliente nao se toca", async () => {
  // O nome e do cliente -- ele renomeia o setor para o que o porteiro precisa
  // ler, e sobrescrever isso apagaria o trabalho dele. A quantidade E a lotacao
  // contratada, e um numero velho faria o contador comparar com o contrato
  // errado.
  const { resultado, idas } = await comBanco(
    {
      "pedidos_modelos": MODELOS_DO_ERP,
      "producao_numeracoes": NUMERACOES,
      "producao_acesso_setores": [
        DOIS_SETORES[0],
        { id: "s2", nome: "Portão dos fundos", modelo_id: 1000002, quantidade: 400 },
      ],
    },
    {},
    () => sincronizarSetores(20272, "e1"),
  );
  assertEquals(resultado.criados, []);
  assertEquals(resultado.atualizados, ["Portão dos fundos"]);
  const escrita = idas.find((i) =>
    i.metodo === "PATCH" && i.caminho.includes("producao_acesso_setores")
  )!;
  assertEquals(JSON.parse(escrita.corpo), { quantidade: 500 });
});

Deno.test("sincronizar: nada a fazer nao escreve nada", async () => {
  const { resultado, idas } = await comBanco(
    {
      "pedidos_modelos": MODELOS_DO_ERP,
      "producao_numeracoes": NUMERACOES,
      "producao_acesso_setores": [
        DOIS_SETORES[0],
        { id: "s2", nome: "Pista", modelo_id: 1000002, quantidade: 500 },
      ],
    },
    {},
    () => sincronizarSetores(20272, "e1"),
  );
  assertEquals(resultado, {
    pedido: 20272, criados: [], atualizados: [], desligados: [],
    mantidos_com_ingresso: [],
  });
  assertEquals(idas.filter((i) => i.metodo !== "GET").length, 0);
});

Deno.test("sincronizar: o setor sem codigo e VAZIO e desligado", async () => {
  // Os oito setores orfaos criados antes de o filtro de legibilidade existir.
  // Eles nunca receberao credencial e aparecem ao dono como faixa que "faltou
  // publicar".
  const { resultado } = await comBanco(
    {
      "pedidos_modelos": [MODELOS_DO_ERP[0]],
      "producao_numeracoes": NUMERACOES,
      "producao_acesso_setores": [
        DOIS_SETORES[0],
        { id: "s9", nome: "Credencial staff", modelo_id: 1000283, quantidade: 50 },
      ],
    },
    {},
    () => sincronizarSetores(20272, "e1"),
  );
  assertEquals(resultado.desligados, ["Credencial staff"]);
  assertEquals(resultado.mantidos_com_ingresso, []);
});

Deno.test("sincronizar: o setor sem codigo COM ingresso dentro fica, e a resposta diz", async () => {
  // Desligar um setor que tem ingresso impresso e decisao de gente, nao de
  // rotina -- e uma rotina que o fizesse calada apagaria o setor de um lote que
  // esta na mao das pessoas.
  const { resultado } = await comBanco(
    {
      "pedidos_modelos": [MODELOS_DO_ERP[0]],
      "producao_numeracoes": NUMERACOES,
      "producao_acesso_setores": [
        DOIS_SETORES[0],
        { id: "s9", nome: "Camarote antigo", modelo_id: 1000283, quantidade: 50 },
      ],
    },
    { "producao_acesso_credenciais?setor_id=eq.s9": 50 },
    () => sincronizarSetores(20272, "e1"),
  );
  assertEquals(resultado.desligados, []);
  assertEquals(resultado.mantidos_com_ingresso, ["Camarote antigo"]);
});
