// Só dados sintéticos. Sem --allow-net: nenhuma chamada pode chegar à nuvem.
import { cifrarPin, decifrarPin, registrarPin, elevarPin, consultarPinDaGrafica } from "../supabase/functions/_compartilhado/pin_instalacao.ts";
import { emitirQrEvento, usarQrEvento, revogarQrEvento } from "../supabase/functions/_compartilhado/qr_evento.ts";
import { editarComPin } from "../supabase/functions/_compartilhado/edicao_pin.ts";
import { hashDoToken } from "../supabase/functions/_compartilhado/hash.ts";
import { Recusa } from "../supabase/functions/_compartilhado/sessao.ts";

const E = "11111111-1111-4111-8111-111111111111", I = "22222222-2222-4222-8222-222222222222";
const A = "33333333-3333-4333-8333-333333333333", S = "44444444-4444-4444-8444-444444444444";
const KEY = "ab".repeat(32), TOKEN = "cd".repeat(32), PIN = "042815"; // exclusivamente fictícios
Deno.env.set("SUPABASE_URL", "https://banco-sintetico.invalid");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "sintetico-sem-validade");
Deno.env.set("IDEAL_CONTROL_PIN_CHAVE", "11".repeat(32));
Deno.env.set("ACESSO_ELEVACAO_SEGREDO", "segredo-sintetico-para-testes");
let semIngressos = false, semSetores = false;
let dados: any, convite: any, chamadas: any[], aparelho: any, falharEmissao = false, papel = "admin";
function reset() { semIngressos = false; semSetores = false; dados = null; convite = null; chamadas = []; falharEmissao = false; papel = "admin"; aparelho = { id: A, evento_id: E, instalacao_id: I, status: "ativo", nome: "Celular sintético" }; }
function assert(v: unknown, msg = "asserção falhou"): asserts v { if (!v) throw new Error(msg); }
async function recusa(f: () => Promise<any>, status?: number) {
  try { await f(); } catch (e) { if (status) assert(e instanceof Recusa && e.status === status); return; }
  throw new Error("a operação deveria falhar");
}
globalThis.fetch = (async (input: any, options: any = {}) => {
  const u = new URL(String(input));
  assert(u.origin === "https://banco-sintetico.invalid", "rede real proibida");
  const t = u.pathname.replace("/rest/v1/", ""), method = options.method || "GET";
  const c = options.body ? JSON.parse(options.body) : null;
  chamadas.push({ t, method, c });
  let r: any;
  if (t === "producao_acesso_instalacoes") {
    if (method === "POST") { if (!dados) dados = { ...c, id: I, falhas: 0 }; r = [dados]; }
    else r = dados && (!u.searchParams.get("chave_hash") || u.searchParams.get("chave_hash") === "eq." + dados.chave_hash) ? [dados] : [];
  } else if (t === "rpc/producao_acesso_conferir_pin") {
    // Simula somente o contrato. Não comprova execução/locks do PL/pgSQL.
    r = dados && dados.falhas < 5 && c.p_chave_hash === dados.chave_hash && c.p_pin_hash === dados.pin_hash ? I : null;
    if (!r && dados) dados.falhas++;
  } else if (t === "producao_acesso_convites_evento") {
    if (method === "POST") { convite = { ...c, id: S }; r = falharEmissao ? [] : [convite]; }
    else { if (convite) Object.assign(convite, c); r = convite ? [convite] : []; }
  } else if (t === "rpc/producao_acesso_ativar_qr_evento") {
    r = convite && !convite.revogado_em && convite.segredo_hash === c.p_segredo_hash
      ? { evento: { id: E, nome: "Evento sintético" }, ...(c.p_token_hash ? { aparelho: { id: A, nome: "Celular sintético" } } : {}) } : null;
  } else if (t === "imposition_user_permissions") r = [{ user_id: I, role: papel }];
  else if (t === "producao_acesso_dispositivos") r = [aparelho];
  else if (t === "producao_acesso_setores") r = u.searchParams.get("status") === "eq.ativo" && !semSetores ? [{id:S}] : [];
  else if (t === "producao_acesso_credenciais") r = semIngressos ? [] : [{id:A}];
  else if (t === "producao_acesso_eventos") r = [{ id: E, status: "ativo", ...c }];
  else if (t === "producao_acesso_auditoria_pin") r = [{ id: S, ...c }];
  else throw new Error("chamada inesperada: " + t);
  return new Response(JSON.stringify(r), { headers: { "Content-Type": "application/json" } });
}) as typeof fetch;

Deno.test("PIN: cifra autenticada preserva zero inicial e vincula à instalação", async () => {
  reset(); const c = await cifrarPin(PIN, I);
  assert(c !== PIN && await decifrarPin(c, I) === PIN);
  assert(c !== await cifrarPin(PIN, I));
  await recusa(() => decifrarPin(c, A));
  await recusa(() => decifrarPin(c.slice(0, -4) + "AAAA", I));
});
Deno.test("PIN: cadastro não grava senha em claro; reenvio não troca a senha", async () => {
  reset(); await registrarPin({ chave: KEY, pin: PIN });
  assert(!JSON.stringify(dados).includes(PIN));
  assert((await registrarPin({ chave: KEY, pin: PIN })).id === I);
  await recusa(() => registrarPin({ chave: KEY, pin: "999999" }), 403);
  assert(await decifrarPin(dados.pin_cifrado, dados.chave_hash) === PIN);
});
Deno.test("PIN: só seis dígitos, inclusive rejeita número convertido e espaços", async () => {
  for (const pin of [123456, "12345", "1234567", "12345a", " 123456"]) {
    reset(); await recusa(() => registrarPin({ chave: KEY, pin }), 422); assert(chamadas.length === 0);
  }
});
Deno.test("PIN: gráfica recupera a senha do aparelho sem devolver chave da instalação", async () => {
  reset(); await registrarPin({ chave: KEY, pin: PIN });
  const r = await consultarPinDaGrafica(A, I); assert(r.pin === PIN && r.aparelho_id === A && !r.chave);
});
Deno.test("PIN: outra instalação não eleva e não tenta adivinhar a senha", async () => {
  reset(); await registrarPin({ chave: KEY, pin: PIN });
  await recusa(() => elevarPin({ chave: "ef".repeat(32), pin: PIN }, aparelho), 403);
  aparelho.instalacao_id = A;
  await recusa(() => elevarPin({ chave: KEY, pin: PIN }, aparelho), 403);
});
Deno.test("PIN: bilhete de edição fica limitado ao evento e ao aparelho", async () => {
  reset(); await registrarPin({ chave: KEY, pin: PIN });
  const b = await elevarPin({ chave: KEY, pin: PIN }, aparelho);
  const corpo = { chave: KEY, elevacao: b.token, metodo: "PATCH", caminho: "/eventos/" + E, corpo: { nome_evento: "Novo" } };
  await recusa(() => editarComPin(corpo, { ...aparelho, evento_id: A }), 401);
  await recusa(() => editarComPin({ ...corpo, caminho: "/eventos/" + A }, aparelho), 403);
  await recusa(() => editarComPin({ ...corpo, caminho: "/setores/" + S }, aparelho), 403);
  await editarComPin(corpo, aparelho);
  assert(chamadas.some((r) => r.t === "producao_acesso_auditoria_pin" && r.method === "POST"));
});
Deno.test("QR: aleatório, não contém senha; hash persistido e ausência de linha falha", async () => {
  reset(); const r = await emitirQrEvento(E, I);
  assert(/^IDEAL-CONTROL-EVENTO:1:[a-f0-9]{64}$/.test(r.conteudo));
  assert(convite.segredo_hash === await hashDoToken(r.conteudo.split(":")[2]));
  assert(!JSON.stringify(convite).includes(r.conteudo.split(":")[2]));
  falharEmissao = true; await recusa(() => emitirQrEvento(E, I));
});

Deno.test("PIN: impede excluir ou pausar o proprio aparelho antes de qualquer escrita", async () => {
  reset(); await registrarPin({ chave: KEY, pin: PIN });
  const b = await elevarPin({ chave: KEY, pin: PIN }, aparelho);
  for (const [metodo, corpo] of [["DELETE", null], ["PATCH", {status:"pausado"}]]) {
    chamadas = [];
    await recusa(() => editarComPin({chave:KEY,elevacao:b.token,caminho:"/aparelhos/"+A,metodo,corpo},aparelho),409);
    assert(chamadas.every(r => r.method === "GET"), "autoexclusao nao deve gravar");
  }
});
Deno.test("QR: consulta, ativação vinculada à instalação e revogação", async () => {
  reset(); await registrarPin({ chave: KEY, pin: PIN });
  const r = await emitirQrEvento(E, I), segredo = r.conteudo.split(":")[2];
  assert((await usarQrEvento({ segredo }, false)).evento.id === E);
  await recusa(() => usarQrEvento({ segredo, token: TOKEN, nome: "Celular", navegador: "local" }, true), 422);
  await usarQrEvento({ segredo, token: TOKEN, nome: "Celular", navegador: "local", chave: KEY }, true);
  const ativacao = chamadas.filter((r) => r.t === "rpc/producao_acesso_ativar_qr_evento").at(-1);
  assert(ativacao.c.p_instalacao_id === I && ativacao.c.p_token_hash === await hashDoToken(TOKEN));
  await revogarQrEvento(E);
  await recusa(() => usarQrEvento({ segredo }, false), 403);
});
Deno.test("QR: entradas malformadas não consultam o banco", async () => {
  reset(); await recusa(() => usarQrEvento({ segredo: "https://site.invalid" }, false), 422); assert(!chamadas.length);
});

Deno.test("HTTP: portaria exige token para editar e gráfica exige papel para consultar PIN", async () => {
  reset();
  const original = Deno.serve;
  let handler: (r: Request) => Promise<Response>;
  Deno.serve = ((h: any) => { handler = h; return {} as any; }) as typeof Deno.serve;
  try {
    await import("../supabase/functions/portaria/index.ts");
    const portaria = handler!;
    const semToken = await portaria(new Request("https://local.invalid/functions/v1/portaria/editar-pin", { method: "POST", body: "{}" }));
    assert(semToken.status === 401);
    const malformado = await portaria(new Request("https://local.invalid/functions/v1/portaria/consultar-qr-evento", { method: "POST", body: "{" }));
    assert(malformado.status === 422);
    await import("../supabase/functions/acesso-interno/index.ts");
    const grafica = handler!;
    const url = "https://local.invalid/functions/v1/acesso-interno/aparelhos/" + A + "/senha-edicao";
    assert((await grafica(new Request(url, { method: "POST" }))).status === 401);
    const jwt = "x." + btoa(JSON.stringify({ sub: I })) + ".x"; // gateway JWT simulado, assinatura não testada aqui
    papel = "operador";
    assert((await grafica(new Request(url, { method: "POST", headers: { Authorization: "Bearer " + jwt } }))).status === 403);
    papel = "admin"; await registrarPin({ chave: KEY, pin: PIN });
    const resposta = await grafica(new Request(url, { method: "POST", headers: { Authorization: "Bearer " + jwt } }));
    assert(resposta.status === 200 && resposta.headers.get("Cache-Control") === "no-store");
    assert((await resposta.json()).pin === PIN);
  } finally { Deno.serve = original; }
});

Deno.test("QR: consulta e ativa celular sem ingressos, preservando PIN e convite", async () => {
  reset(); semIngressos = true;
  await registrarPin({chave:KEY,pin:PIN});
  const qr = await emitirQrEvento(E, I);
  const segredo = qr.conteudo.split(":")[2];
  assert((await usarQrEvento({segredo},false)).evento.id === E);
  const r = await usarQrEvento({segredo,token:TOKEN,nome:"Celular",navegador:"sintetico",chave:KEY},true);
  assert(r.evento.id === E && r.aparelho.id === A);
  assert(!chamadas.some(r=>r.t === "producao_acesso_credenciais"));
  assert(chamadas.filter(r=>r.t === "producao_acesso_convites_evento" && r.method === "POST").length === 1);
});
Deno.test("QR: sem setores não emite; convite inválido não revela preparação", async () => {
  reset(); semSetores = true; await recusa(() => emitirQrEvento(E,I),409); assert(!convite);
  chamadas = []; await recusa(() => usarQrEvento({segredo:KEY},false),403);
  assert(chamadas.length === 1 && chamadas[0].t === "rpc/producao_acesso_ativar_qr_evento");
});
