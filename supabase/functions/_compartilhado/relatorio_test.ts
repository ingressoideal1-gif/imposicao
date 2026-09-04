/**
 * As contas do relatorio, que agora as DUAS telas mostram.
 *
 * O que este arquivo protege nao e uma conta difícil -- e a coerencia entre a
 * tela da grafica e o aplicativo do dono. Desde 04/09/2026 as duas leem daqui,
 * e o defeito que isso evita nao quebra nada: seria a grafica dizendo 412 e o
 * cliente dizendo 409, as duas telas abertas ao mesmo tempo, sem como saber
 * qual acertou nem como refazer a conta da noite que ja passou.
 *
 * O duble e no `fetch`, como no `configuracao_test.ts`, e pelo mesmo motivo: o
 * caminho real do modulo continua sendo percorrido -- monta o filtro, monta a
 * URL, le a resposta. Um duble mais alto deixaria de exercitar exatamente a
 * parte que se quer conferir, que e QUAL FILTRO cada funcao pede.
 *
 * Rodar: npx deno test --allow-env _compartilhado/relatorio_test.ts
 */
import { assertEquals } from "jsr:@std/assert@1";
import {
  dashboard,
  leiturasDoEvento,
  listarIngressos,
} from "./relatorio.ts";
import { MOTIVOS } from "./relatorio_puro.ts";

const fetchDeVerdade = globalThis.fetch;

interface Ida {
  caminho: string;
  contagem: boolean;
}

/**
 * Roda a tarefa com um banco de mesa que responde por CAMINHO.
 *
 * `tabelas` mapeia um pedaco do caminho para as linhas devolvidas; `contagens`
 * faz o mesmo para as chamadas de `contar()`, que leem o total do cabecalho
 * `Content-Range` e nao do corpo. Uma tabela nao declarada devolve lista vazia,
 * que e o que o PostgREST faz.
 */
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
    const contagem = (init?.headers as Record<string, string>)?.Prefer === "count=exact";
    idas.push({ caminho, contagem });

    if (contagem) {
      const chave = Object.keys(contagens).find((k) => caminho.includes(k));
      const total = chave === undefined ? 0 : contagens[chave];
      return Promise.resolve(
        new Response(null, { headers: { "content-range": `0-0/${total}` } }),
      );
    }
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

const SETORES = [
  { id: "vip", nome: "VIP", quantidade: 100, bloqueios: [] },
  { id: "cam", nome: "Camarote", quantidade: 50, bloqueios: [{ de: 1, ate: 10 }] },
];

// ── listarIngressos ─────────────────────────────────────────────────────────

Deno.test("ingressos: com setor, o filtro e o setor SOZINHO", async () => {
  // E o filtro que a tela da grafica sempre usou. Trocá-lo por evento+setor
  // parece equivalente e nao e: uma credencial carimbada com setor e sem evento
  // (o estado que as credenciais orfas de agosto tinham) sumiria da lista.
  const { idas } = await comBanco({ credenciais: [] }, {}, () =>
    listarIngressos("e1", "vip", 1, 50, null));
  const busca = idas.find((i) => i.caminho.includes("credenciais"))!;
  assertEquals(busca.caminho.includes("setor_id=eq.vip"), true);
  assertEquals(busca.caminho.includes("evento_id=eq.e1"), false);
});

Deno.test("ingressos: sem setor, procura no EVENTO inteiro", async () => {
  // A pergunta da porta. Quem esta com o ingresso na mao nao sabe de que setor
  // ele e -- e justamente isso que ele veio descobrir.
  const { idas } = await comBanco({ credenciais: [] }, {}, () =>
    listarIngressos("e1", null, 1, 50, null));
  const busca = idas.find((i) => i.caminho.includes("credenciais"))!;
  assertEquals(busca.caminho.includes("evento_id=eq.e1"), true);
});

Deno.test("ingressos: numero busca por numero; texto busca por codigo visivel", async () => {
  const so = async (busca: string) => {
    const { idas } = await comBanco({ credenciais: [] }, {}, () =>
      listarIngressos("e1", null, 1, 50, busca));
    return idas.find((i) => i.caminho.includes("credenciais"))!.caminho;
  };
  assertEquals((await so("42")).includes("numero=eq.42"), true);
  assertEquals((await so("STAFF")).includes("codigo_visivel=ilike.*STAFF*"), true);
});

Deno.test("ingressos: a faixa bloqueada so marca o ingresso do MESMO setor", async () => {
  // O defeito que este teste existe para impedir aparece so na busca pelo
  // evento inteiro: o `0001` do VIP e o `0001` do Camarote convivem por
  // desenho, e uma faixa bloqueada no Camarote marcaria o do VIP como
  // bloqueado. O dono devolveria na porta um ingresso que esta bom.
  const { resultado } = await comBanco(
    {
      "producao_acesso_credenciais": [
        { id: "c1", numero: 1, setor_id: "vip", origem: "qr_ideal", status: "ativo" },
        { id: "c2", numero: 1, setor_id: "cam", origem: "qr_ideal", status: "ativo" },
      ],
      "producao_acesso_bloqueios": [
        { setor_id: "cam", de: 1, ate: 10, motivo: "lote extraviado" },
      ],
    },
    {},
    () => listarIngressos("e1", null, 1, 50, "1"),
  );
  const porSetor = Object.fromEntries(
    resultado.ingressos.map((i: any) => [i.setor_id, i.situacao]),
  );
  assertEquals(porSetor, { vip: "disponivel", cam: "bloqueado" });
});

Deno.test("ingressos: `ha_mais` pede uma linha a mais, e nao a devolve", async () => {
  // Sem isto, saber se ha proxima pagina custaria uma segunda consulta -- ou,
  // pior, uma contagem que o teto de 1.000 do PostgREST limitaria em silencio.
  const linhas = [1, 2, 3].map((n) => ({
    id: `c${n}`, numero: n, setor_id: "vip", origem: "qr_ideal", status: "ativo",
  }));
  const { resultado, idas } = await comBanco(
    { "producao_acesso_credenciais": linhas },
    {},
    () => listarIngressos("e1", "vip", 1, 2, null),
  );
  assertEquals(idas[0].caminho.includes("limit=3"), true);
  assertEquals(resultado.ha_mais, true);
  assertEquals(resultado.ingressos.length, 2);
});

Deno.test("ingressos: o codigo em claro so sai para o que o CLIENTE carregou", async () => {
  // O codigo do QR Ideal nao existe em claro em lugar nenhum do sistema. O de
  // staff e cortesia e a lista do proprio cliente, e ele precisa administra-la.
  const { resultado } = await comBanco(
    {
      "producao_acesso_credenciais": [
        { id: "c1", numero: 1, setor_id: "vip", origem: "qr_ideal", codigo_visivel: "NAO", status: "ativo" },
        { id: "c2", numero: 2, setor_id: "vip", origem: "cliente", codigo_visivel: "STAFF7", status: "ativo" },
      ],
    },
    {},
    () => listarIngressos("e1", "vip", 1, 50, null),
  );
  assertEquals(resultado.ingressos.map((i: any) => i.codigo), [null, "STAFF7"]);
});

// ── dashboard ───────────────────────────────────────────────────────────────

Deno.test("dashboard: o contratado chega pronto, e nao e recalculado aqui", async () => {
  // As duas telas o conhecem por caminhos diferentes -- a grafica soma os
  // modelos do ERP que sobem ao controle, o aplicativo do dono soma a
  // quantidade dos setores. Calcular aqui obrigaria esta funcao a escolher um
  // dos dois, e ela nao tem como saber qual.
  const { resultado } = await comBanco({}, {}, () => dashboard("e1", SETORES, 777));
  assertEquals(resultado.publico.contratado, 777);
});

Deno.test("dashboard: presentes = entraram - sairam, nunca negativo", async () => {
  const { resultado } = await comBanco(
    {},
    { "resultado=eq.permitido&tipo=eq.entrada": 10, "resultado=eq.permitido&tipo=eq.saida": 4 },
    () => dashboard("e1", SETORES, 150),
  );
  assertEquals(resultado.publico.entraram, 10);
  assertEquals(resultado.publico.sairam, 4);
  assertEquals(resultado.publico.presentes, 6);
});

Deno.test("dashboard: sem ninguem publicado, o comparecimento e nulo e nao zero", async () => {
  // Zero por cento diria "ninguem apareceu"; a verdade e que ainda nao ha
  // denominador. A tela escreve "—".
  const { resultado } = await comBanco({}, {}, () => dashboard("e1", SETORES, 150));
  assertEquals(resultado.publico.comparecimento_pct, null);
});

Deno.test("dashboard: por setor e por hora saem da MESMA varredura de leituras", async () => {
  const { resultado, idas } = await comBanco(
    {
      "producao_acesso_leituras": [
        { momento: "2026-09-04T21:10:00+00:00", resultado: "permitido", tipo: "entrada", setor_id: "vip" },
        { momento: "2026-09-04T21:40:00+00:00", resultado: "permitido", tipo: "entrada", setor_id: "vip" },
        { momento: "2026-09-04T22:05:00+00:00", resultado: "permitido", tipo: "entrada", setor_id: "cam" },
        { momento: "2026-09-04T22:20:00+00:00", resultado: "negado", motivo: "ja_entrou", setor_id: "vip" },
      ],
    },
    {},
    () => dashboard("e1", SETORES, 150),
  );
  assertEquals(
    resultado.por_setor.map((s: any) => [s.nome, s.entraram]),
    [["VIP", 2], ["Camarote", 1]],
  );
  assertEquals(resultado.por_hora.map((h: any) => h.hora), [
    "2026-09-04T21:00",
    "2026-09-04T22:00",
  ]);
  assertEquals(resultado.pico, "2026-09-04T21:00");
  assertEquals(resultado.recusas, [
    { motivo: "ja_entrou", rotulo: MOTIVOS.ja_entrou, quantas: 1 },
  ]);
  // UMA varredura de leituras, e nao uma por setor.
  const varreduras = idas.filter((i) => !i.contagem && i.caminho.includes("leituras"));
  assertEquals(varreduras.length, 1);
});

Deno.test("dashboard: bloqueados soma as faixas, contando as duas pontas", async () => {
  // `de=1, ate=10` sao dez ingressos, e nao nove. Errar aqui faz o dono achar
  // que sobrou um ingresso valido em cada lote suspenso.
  const { resultado } = await comBanco({}, {}, () => dashboard("e1", SETORES, 150));
  assertEquals(resultado.publico.bloqueados, 10);
});

// ── leiturasDoEvento ────────────────────────────────────────────────────────

Deno.test("leituras: a NEGADA sobe junto, com o motivo traduzido", async () => {
  // E ela que responde "por que a fila parou as 22h". Um relatorio so de quem
  // entrou esconderia exatamente a parte que precisa de explicacao.
  const { resultado } = await comBanco(
    {
      "producao_acesso_leituras": [
        {
          id: "l1", momento: "2026-09-04T22:00:00+00:00",
          recebido_em: "2026-09-04T22:03:00+00:00", tipo: "entrada",
          resultado: "negado", motivo: "setor_bloqueado",
          setor_id: "vip", dispositivo_id: "a1", credencial_id: "c1",
        },
      ],
      "producao_acesso_setores": [{ id: "vip", nome: "VIP" }],
      "producao_acesso_dispositivos": [{ id: "a1", nome: "Portão 1" }],
      "producao_acesso_credenciais": [{ id: "c1", numero: 42 }],
    },
    {},
    () => leiturasDoEvento("e1", 1, 100),
  );
  assertEquals(resultado.leituras, [{
    momento: "2026-09-04T22:00:00+00:00",
    recebido_em: "2026-09-04T22:03:00+00:00",
    tipo: "entrada",
    resultado: "negado",
    motivo: "setor_bloqueado",
    rotulo_motivo: "Setor desligado pelo dono",
    setor: "VIP",
    aparelho: "Portão 1",
    numero: 42,
  }]);
});

Deno.test("leituras: os nomes vem em TRES consultas, e nao uma por linha", async () => {
  // Uma pagina de 200 leituras faria 600 idas ao banco, e este relatorio e
  // baixado inteiro, pagina a pagina, por um celular no fim do evento.
  const linhas = Array.from({ length: 20 }, (_, n) => ({
    id: `l${n}`, momento: "2026-09-04T22:00:00+00:00", tipo: "entrada",
    resultado: "permitido", setor_id: "vip", dispositivo_id: "a1",
    credencial_id: `c${n}`,
  }));
  const { idas } = await comBanco(
    { "producao_acesso_leituras": linhas },
    {},
    () => leiturasDoEvento("e1", 1, 100),
  );
  assertEquals(idas.length, 4); // a pagina de leituras + setores + aparelhos + numeros
});

Deno.test("leituras: pagina vazia nao vai buscar nome nenhum", async () => {
  const { idas } = await comBanco({}, {}, () => leiturasDoEvento("e1", 1, 100));
  assertEquals(idas.length, 1);
});
