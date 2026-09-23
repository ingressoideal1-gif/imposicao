// Diagnostic only: original Edge code, synthetic PostgREST in memory, no network permission.
import { zerarEntradas } from "../supabase/functions/_compartilhado/configuracao.ts";
import { hashCodigo, hashDoToken } from "../supabase/functions/_compartilhado/hash.ts";

const E = "11111111-1111-4111-8111-111111111111";
const S = "22222222-2222-4222-8222-222222222222";
const A = "33333333-3333-4333-8333-333333333333";
const C = "44444444-4444-4444-8444-444444444444";
const C2 = "55555555-5555-4555-8555-555555555555";
const TOKEN = "token-sintetico-confirmacao-ideal-control";
const SAL = "ab".repeat(32);
const tables: Record<string, any[]> = {};
let trace: any[] = [];
let handler: (req: Request) => Promise<Response>;
Deno.env.set("SUPABASE_URL", "https://banco-sintetico.invalid");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "chave-sintetica-sem-validade");

function json(value: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(value), { headers: { "Content-Type": "application/json", ...headers } });
}
function matches(row: any, params: URLSearchParams) {
  for (const [key, value] of params) {
    if (value.startsWith("eq.") && String(row[key]) !== value.slice(3)) return false;
    if (value.startsWith("gte.") && String(row[key]) < value.slice(4)) return false;
  }
  return true;
}

// Intercepts the original banco()/contar() HTTP boundary. No external request is forwarded.
globalThis.fetch = (async (input: any, options: any = {}) => {
  const u = new URL(String(input));
  if (u.origin !== "https://banco-sintetico.invalid") throw new Error("Unexpected network destination: " + u.origin);
  const table = u.pathname.replace("/rest/v1/", "");
  if (table === "rpc/producao_acesso_zerar_entradas") {
    const body = JSON.parse(options.body);
    if (body.p_evento_id !== E) throw new Error("Unexpected reset target");
    trace.push({ method: options.method, path: u.pathname, body });
    // Model the migration's atomic reset for browser/Edge integration only.
    // This fixture does not execute PL/pgSQL or establish SQL lock correctness.
    tables.producao_acesso_entradas_unicas = [];
    tables.producao_acesso_leituras = [];
    const marker = new Date().toISOString();
    tables.producao_acesso_eventos[0].entradas_zeradas_em = marker;
    return json([{ zerado_em: marker }]);
  }
  if (!tables[table]) throw new Error("Unsupported fixture table: " + table);
  const method = options.method || "GET";
  const body = options.body ? JSON.parse(options.body) : undefined;
  trace.push({ method, path: u.pathname + u.search, body });
  const rows = tables[table];
  if (method === "GET") {
    let selected = rows.filter(row => matches(row, u.searchParams));
    const total = selected.length;
    if (u.searchParams.get("order") === "momento.asc") selected.sort((a, b) => a.momento.localeCompare(b.momento));
    if (u.searchParams.has("limit")) selected = selected.slice(0, Number(u.searchParams.get("limit")));
    return json(selected, { "Content-Range": total ? `0-${selected.length - 1}/${total}` : "*/0" });
  }
  if (method === "DELETE") {
    if (u.searchParams.get("evento_id") !== "eq." + E) throw new Error("Unexpected DELETE filter");
    tables[table] = rows.filter(row => !matches(row, u.searchParams));
    return new Response(null, { status: 204 });
  }
  if (method === "PATCH") {
    const selected = rows.filter(row => matches(row, u.searchParams));
    const values = Object.fromEntries(Object.entries(body).map(([key, value]) => [key, value === "now()" ? new Date().toISOString() : value]));
    selected.forEach(row => Object.assign(row, values));
    return json(selected);
  }
  if (method === "POST") {
    for (const row of Array.isArray(body) ? body : [body]) {
      if (row.evento_id !== E) throw new Error("Unexpected event on insert");
      const cutoff = tables.producao_acesso_eventos[0].entradas_zeradas_em;
      if (cutoff && Date.parse(row.momento) <= Date.parse(cutoff)) continue;
      const keys = (u.searchParams.get("on_conflict") || "id").split(",");
      if (!rows.some(old => keys.every(key => old[key] === row[key]))) rows.push(structuredClone(row));
    }
    return new Response(null, { status: 201 });
  }
  throw new Error("Unsupported method " + method);
}) as typeof fetch;

// Capture the real request handler; do not open a server or a network socket.
(Deno as any).serve = (fn: any) => { handler = fn; return {}; };
await import("../supabase/functions/portaria/index.ts");

async function fixture(withOld: boolean) {
  trace = [];
  const oldMoment = "2026-01-01T12:00:00.000Z";
  const reading = { id_local: "66666666-6666-4666-8666-666666666666", evento_id: E, dispositivo_id: A,
    credencial_id: C, setor_id: S, momento: oldMoment, resultado: "permitido", motivo: null, tipo: "entrada" };
  tables.producao_acesso_eventos = [{ id: E, status: "ativo", entradas_zeradas_em: null }];
  tables.producao_acesso_dispositivos = [{ id: A, evento_id: E, nome: "Aparelho sintetico", status: "ativo", token_hash: await hashDoToken(TOKEN) }];
  tables.producao_acesso_setores = [{ id: S, evento_id: E, nome: "Setor de teste", status: "ativo", tipo_uso: "unico", bloqueado: false, abre_em: null, fecha_em: null }];
  tables.producao_acesso_dispositivo_setores = [{dispositivo_id:A,setor_id:S}];
  tables.producao_acesso_bloqueios = [];
  tables.producao_acesso_pedidos = [{evento_id:E,pedido_id_int:123,publicado_em:oldMoment,total_credenciais:2}];
  tables.producao_acesso_leituras = withOld ? [structuredClone(reading)] : [];
  tables.producao_acesso_entradas_unicas = withOld ? [{ credencial_id: C, evento_id: E, setor_id: S, dispositivo_id: A, momento: oldMoment }] : [];
  return {
    token: TOKEN, reading,
    carga: { evento: { id: E, nome: "Confirmacao sintetica", sal: SAL, ativo: true },
      publicacao: {versao:JSON.stringify([[123,oldMoment,2]]),concluida:true},
      publicacao_baixada: JSON.stringify([[123,oldMoment,2]]),
      aparelho: { id: A, nome: "Aparelho sintetico", setores: [S] }, sais: {},
      setores: [{ id: S, nome: "Setor de teste", quantidade: 2, tipo_uso: "unico", bloqueado: false, abre_em: null, fecha_em: null }],
      bloqueios: [], credenciais: [
        { id: C, s: S, n: 1, h: await hashCodigo("000001", SAL) },
        { id: C2, s: S, n: 2, h: await hashCodigo("000002", SAL) },
      ] },
  };
}

async function dispatch(message: any) {
  if (message.op === "fixture") return await fixture(message.withOld);
  if (message.op === "reset") return await zerarEntradas(E);
  if (message.op === "snapshot") return { tables, trace };
  if (message.op === "request") {
    const req = new Request(message.url, { method: message.method, headers: message.headers, body: message.body });
    const response = await handler(req);
    return { status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() };
  }
  throw new Error("Unknown operation");
}

let pending = "";
for await (const chunk of Deno.stdin.readable.pipeThrough(new TextDecoderStream())) {
  pending += chunk;
  while (pending.includes("\n")) {
    const end = pending.indexOf("\n");
    const line = pending.slice(0, end); pending = pending.slice(end + 1);
    if (!line.trim()) continue;
    const message = JSON.parse(line);
    try { console.log(JSON.stringify({ id: message.id, result: await dispatch(message) })); }
    catch (error) { console.log(JSON.stringify({ id: message.id, error: String(error) })); }
  }
}
