import { deepStrictEqual as assertEquals } from "node:assert";

const EVENTO = "11111111-1111-4111-8111-111111111111";
const OUTRO_EVENTO = "22222222-2222-4222-8222-222222222222";
const LEITURA = {
  momento: "2026-11-27T21:00:00Z",
  recebido_em: "2026-11-27T21:01:00Z",
  tipo: "entrada",
  resultado: "negado",
  motivo: "setor_bloqueado",
  setor: "Setor sintetico",
  aparelho: null,
  numero: null,
};
const PERMISSOES = "imposition_user_permissions";
const PEDIDOS = "producao_acesso_pedidos";
const RPC = "rpc/producao_acesso_exportar_leituras_v1";
const BASE = "https://teste.invalid/acesso-interno/pedidos/";

Deno.test("exportacao interna exige papel e vinculo unico e usa o evento persistido", async () => {
  const serveOriginal = Deno.serve;
  const fetchOriginal = globalThis.fetch;
  const env = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const anteriores = env.map((nome) => Deno.env.get(nome));
  let handler: (req: Request) => Promise<Response>;
  let papel = "admin";
  let vinculos: { evento_id: string | null }[] = [{ evento_id: EVENTO }];
  const chamadas: string[] = [];
  try {
    Deno.env.set(env[0], "https://banco.invalid");
    Deno.env.set(env[1], "chave-sintetica-sem-acesso");
    Deno.serve = ((h: typeof handler) => { handler = h; return {}; }) as typeof Deno.serve;
    globalThis.fetch = ((url: string | URL | Request, opcoes?: RequestInit) => {
      const u = new URL(String(url));
      assertEquals(u.origin, "https://banco.invalid");
      const recurso = u.pathname.replace("/rest/v1/", "");
      chamadas.push(recurso);
      if (recurso === PERMISSOES) {
        assertEquals(opcoes?.method, "GET");
        return Promise.resolve(Response.json(papel ? [{ role: papel }] : []));
      }
      if (recurso === PEDIDOS) {
        assertEquals(opcoes?.method, "GET");
        assertEquals(u.searchParams.get("pedido_id_int"), "eq.12345");
        return Promise.resolve(Response.json(vinculos));
      }
      assertEquals(recurso, RPC);
      assertEquals(opcoes?.method, "POST");
      assertEquals(opcoes?.body, JSON.stringify({ p_evento_id: EVENTO }));
      return Promise.resolve(Response.json({ leituras: [LEITURA], ha_mais: true }));
    }) as typeof fetch;
    await import("./index.ts");
    // O gateway faz a verificacao da assinatura. Aqui o handler recebe claims sinteticas.
    const token = "ficticio." + btoa(JSON.stringify({ sub: OUTRO_EVENTO })) + ".ficticio";
    const headers = { Authorization: "Bearer " + token };
    const alvo = BASE + "12345/leituras?exportar=1&evento_id=" + OUTRO_EVENTO;

    assertEquals((await handler!(new Request(alvo))).status, 401);
    assertEquals(chamadas.splice(0), []);
    for (papel of ["cliente", "designer", "operador", ""]) {
      assertEquals((await handler!(new Request(alvo, { headers }))).status, 403);
      assertEquals(chamadas.splice(0), [PERMISSOES]);
    }

    papel = "admin";
    assertEquals((await handler!(new Request(BASE + "abc/leituras?exportar=1", { headers }))).status, 422);
    assertEquals(chamadas.splice(0), [PERMISSOES]);
    assertEquals((await handler!(new Request(BASE + "12345/leituras", { headers }))).status, 404);
    assertEquals(chamadas.splice(0), [PERMISSOES]);

    for (vinculos of [[], [{ evento_id: null }]]) {
      assertEquals((await handler!(new Request(alvo, { headers }))).status, 404);
      assertEquals(chamadas.splice(0), [PERMISSOES, PEDIDOS]);
    }
    vinculos = [{ evento_id: EVENTO }, { evento_id: OUTRO_EVENTO }];
    assertEquals((await handler!(new Request(alvo, { headers }))).status, 409);
    assertEquals(chamadas.splice(0), [PERMISSOES, PEDIDOS]);

    vinculos = [{ evento_id: EVENTO }];
    for (papel of ["admin", "atendimento"]) {
      const resposta = await handler!(new Request(alvo, { headers }));
      assertEquals(resposta.status, 200);
      assertEquals(resposta.headers.get("Cache-Control"), "no-store");
      assertEquals(await resposta.json(), {
        leituras: [{ ...LEITURA, rotulo_motivo: "Setor desligado pelo dono" }],
        ha_mais: true,
      });
      assertEquals(chamadas.splice(0), [PERMISSOES, PEDIDOS, RPC]);
    }
  } finally {
    Deno.serve = serveOriginal;
    globalThis.fetch = fetchOriginal;
    env.forEach((nome, i) => anteriores[i] === undefined ? Deno.env.delete(nome) : Deno.env.set(nome, anteriores[i]!));
  }
});
