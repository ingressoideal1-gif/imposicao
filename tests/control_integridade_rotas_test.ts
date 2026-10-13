// Rotas reais, PostgREST sintético. Executar sem --allow-net.
import { dashboard } from "../supabase/functions/_compartilhado/relatorio.ts";
function assert(v: unknown, message = "Contrato de integridade violado"): asserts v {
  if (!v) throw new Error(message);
}
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

Deno.test("paginação por UUID, confirmação individual e métricas sem truncamento", async () => {
  const originalFetch = globalThis.fetch, originalServe = Deno.serve;
  const vars = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const before = vars.map(n => Deno.env.get(n));
  let handler: (r: Request) => Promise<Response>;
  const queries: string[] = [], calls: any[] = [];
  const entries = Array.from({ length: 1201 }, (_, i) => ({ credencial_id: id(i + 100), momento: "2026-10-12T21:00:00+00:00" }));
  let malformedAck = false;
  try {
    Deno.env.set(vars[0], "https://sintetico.invalid"); Deno.env.set(vars[1], "sintetico");
    Deno.serve = ((h: typeof handler) => { handler = h; return {}; }) as typeof Deno.serve;
    globalThis.fetch = (async (input: any, opts: any = {}) => {
      const u = new URL(String(input)); assert(u.origin === "https://sintetico.invalid");
      const table = u.pathname.replace("/rest/v1/", ""); queries.push(table + u.search);
      const body = opts.body ? JSON.parse(opts.body) : null;
      let rows: any = [];
      if (table === "rpc/producao_acesso_registrar_leituras") {
        calls.push(body);
        rows = malformedAck ? [] : body.p_itens.map((i: any) => ({ id_local: i.id_local, primeira: false, resultado: "negado", motivo: "setor_bloqueado" }));
      } else if (table === "rpc/producao_acesso_movimento") {
        calls.push(body);
        rows = { id_local: body.p_item.id_local, resultado: 'confirmar', versao: id(50) };
      } else if (table === "rpc/producao_acesso_qr_leitor_evento") rows = 1;
      else if (table === "rpc/producao_acesso_metricas") rows = {
        entraram: 20001, sairam: 0, presentes: 1, recusadas: 5, ingressos_utilizados: 1, publicados_utilizados: 1,
        por_setor: [{ setor_id: id(21), passagens: 20001, utilizados: 1 }], recusas: [{ motivo: "ja_entrou", quantas: 5 }],
      };
      else if (table === "producao_acesso_dispositivos") rows = [{ id: id(11), evento_id: id(1), nome: "Sintético" }];
      else if (table === "producao_acesso_eventos") rows = [{ id: id(1), status: "ativo" }];
      else if (table === "producao_acesso_setores") rows = [{ id: id(21), nome: "Sintético", quantidade: 10 }];
      else if (table === "producao_acesso_entradas_unicas") {
        assert(u.searchParams.get("order") === "credencial_id.asc");
        const after = u.searchParams.get("credencial_id")?.slice(3);
        rows = entries.filter(e => !after || e.credencial_id > after).sort((a, b) => a.credencial_id.localeCompare(b.credencial_id)).slice(0, 501);
      } else if (table === "producao_acesso_leituras" && u.searchParams.has("offset")) {
        rows = Array.from({ length: 1000 }, () => ({ momento: "2026-10-12T21:00:00Z", resultado: "permitido", tipo: "entrada", setor_id: id(21) }));
      }
      return new Response(JSON.stringify(rows), { headers: { "Content-Range": table === "producao_acesso_credenciais" ? "*/10" : "*/0" } });
    }) as typeof fetch;
    await import("../supabase/functions/portaria/index.ts");
    const request = async (route: string, body?: any) => handler!(new Request("https://sintetico.invalid/portaria/" + route, {
      method: body === undefined ? "GET" : "POST", headers: { Authorization: "Bearer sintetico" },
      body: body === undefined ? undefined : JSON.stringify(body),
    }));
    let cursor: string | null = null; const collected = new Set<string>();
    do {
      const r = await request("sincronizar" + (cursor ? "?desde=" + encodeURIComponent(cursor) : ""));
      assert(r.status === 200); const data = await r.json();
      data.entradas.forEach((e: any) => collected.add(e.credencial_id));
      assert(!cursor || data.proxima_desde !== cursor); cursor = data.proxima_desde;
    } while (cursor);
    assert(collected.size === 1201);
    // Uma entrada atrasada, anterior ao cursor da rodada anterior, entra no próximo ciclo.
    entries.push({ credencial_id: id(50), momento: "2020-01-01T00:00:00-03:00" });
    const late = await (await request("sincronizar")).json(); assert(late.entradas[0].credencial_id === id(50));
    assert((await request("sincronizar?desde=id:invalido")).status === 422);
    assert((await request("sincronizar?desde=" + encodeURIComponent("2026-10-12T21:00:00+00:00"))).status === 200);
    assert(!queries.some(q => q.includes("momento=gte.")));
    const reading = { id_local: "sintetico", credencial_id: id(31), setor_id: id(21), momento: "2026-10-12T21:00:00Z", resultado: "permitido" };
    const r = await (await request("entrada", reading)).json();
    assert(r.resultado === "negado" && r.motivo === "setor_bloqueado" && calls.at(-1).p_online === true);
    const batch = await (await request("leituras", { leituras: [reading] })).json();
    assert(batch.confirmadas[0] === reading.id_local && calls.at(-1).p_online === false);
    const movement = await (await request('movimento', { ...reading, acao: 'auto' })).json();
    assert(movement.resultado === 'confirmar' && movement.versao === id(50));
    assert(calls.at(-1).p_dispositivo === id(11));
    assert((await request('movimento', { ...reading, acao: 'saida' })).status === 422);
    assert((await request('movimento', { ...reading, acao: 'entrada', versao: 'invalida' })).status === 422);
    assert((await request('movimento', { ...reading, acao: 'outro' })).status === 422);
    const count = calls.length;
    assert((await request("entrada", { ...reading, credencial_id: "filtro-invalido" })).status === 422);
    assert((await request("leituras", { leituras: {} })).status === 422); assert(calls.length === count);
    malformedAck = true;
    assert((await request("leituras", { leituras: [reading] })).status === 500);
    const d = await dashboard(id(1), [{ id: id(21), nome: "Sintético", quantidade: 10 }], 10);
    assert(d.grafico_truncado && d.leituras_lidas === 20000);
    assert(d.publico.entraram === 20001 && d.publico.ingressos_utilizados === 1 && d.publico.presentes === 1);
    assert(d.publico.comparecimento_pct === 10);
    assert(d.por_setor[0].entraram === 20001 && d.por_setor[0].ingressos_utilizados === 1);
    assert(d.recusas[0].quantas === 5);
  } finally {
    globalThis.fetch = originalFetch; Deno.serve = originalServe;
    vars.forEach((n, i) => before[i] === undefined ? Deno.env.delete(n) : Deno.env.set(n, before[i]!));
  }
});
