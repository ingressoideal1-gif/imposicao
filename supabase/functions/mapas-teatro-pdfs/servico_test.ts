import { atender, Dependencias } from "./servico.ts";
import { caminho, canonico, GERADOR, MAX_TOTAL, Mapa, revisao, sha256, setores } from "./puro.ts";
import { Recusa } from "../_compartilhado/sessao.ts";

const PDF = (globalThis as any).PDFLib;
// Asserções locais: estes testes não instalam nem importam bibliotecas externas.
const assert = {
  equal(a: unknown, b: unknown) { if (a !== b) throw Error(`Esperado ${String(b)}, recebido ${String(a)}`); },
  deepEqual(a: unknown, b: unknown) { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error("Valores diferentes"); },
  ok(v: unknown) { if (!v) throw Error("Verificação falhou"); },
  throws(fn: () => unknown, predicado: (e: any) => boolean) {
    try { fn(); } catch (e) { if (!predicado(e)) throw e; return; } throw Error("Era esperado um erro");
  },
  async rejects(fn: () => Promise<unknown>, predicado: (e: any) => boolean) {
    try { await fn(); } catch (e) { if (!predicado(e)) throw e; return; } throw Error("Era esperado um erro");
  },
};
const auth = "Bearer teste." + btoa(JSON.stringify({ sub: "autor-sintetico" })) + ".teste";
const base = "https://projeto.invalid/functions/v1/mapas-teatro-pdfs/mapas/m1/";
function fixture() {
  const mapa: Mapa = { id: "m1", name: "Teatro sintético", config: { setores: [1, 2, 3, 4].map(n => ({
    id: "s" + n, nome: "Setor " + n, cadeiras: Object.fromEntries(Array.from({ length: n }, (_, i) => [i + ",0", { prefixo: "A", num: i + 1, tipo: "Normal" }]))
  })) } };
  let row: any = null, falha = 0, negar = false, mudar = false;
  const objetos = new Map<string, Uint8Array>(), chamadas: string[] = [];
  const deps: Dependencias = {
    async mapa(id) { chamadas.push("mapa"); if (negar) throw new Recusa(403, "Sem acesso"); assert.equal(id, mapa.id); return structuredClone(mapa); },
    async escritor() { chamadas.push("autor"); return { id: "autor-sintetico" }; },
    async exportacao(_id, rev, versao) { chamadas.push("consulta"); return row?.revisao_exportacao === rev && row?.gerador_versao === versao ? row : null; },
    async upload(path, bytes) { chamadas.push("upload"); if (falha && chamadas.filter(c => c === "upload").length === falha) throw new Recusa(502, "Upload interrompido"); objetos.set(path, bytes); if (mudar) mapa.name = "Mapa alterado"; },
    async finalizar(snapshot, rev, arquivos) {
      chamadas.push("finalizar");
      if (JSON.stringify(canonico(snapshot)) !== JSON.stringify(canonico(mapa))) throw new Recusa(409, "Mapa mudou");
      assert.ok(arquivos.every(a => objetos.has(a.storage_path)));
      row = { id: "exportacao-sintetica", mapa_id: mapa.id, nome_mapa: mapa.name, revisao_exportacao: rev, gerador_versao: GERADOR, arquivos };
      return row;
    },
    async download(path) { chamadas.push("download"); return objetos.get(path)!; },
  };
  return { mapa, deps, chamadas, objetos, get row() { return row; }, falhar(n: number) { falha = n; }, negar() { negar = true; }, mudar() { mudar = true; } };
}
async function formulario(m: Mapa) {
  const form = new FormData(), meta: any[] = [], lista = setores(m);
  const todos = await PDF.PDFDocument.create();
  const individuais: Uint8Array[] = [];
  for (const s of lista) {
    const d = await PDF.PDFDocument.create(); d.addPage().drawText(s.nome);
    const bytes = await d.save(); individuais.push(bytes);
    (await todos.copyPages(d, [0])).forEach((p: any) => todos.addPage(p));
  }
  if (!lista.length) todos.addPage();
  const arquivos = [{ tipo: "mapa", setor_id: null, quantidade_assentos: lista.reduce((n, s) => n + s.quantidade, 0), bytes: await todos.save() },
    ...lista.map((s, i) => ({ tipo: "setor", setor_id: s.id, quantidade_assentos: s.quantidade, bytes: individuais[i] }))];
  for (let i = 0; i < arquivos.length; i++) {
    const a = arquivos[i];
    meta.push({ tipo: a.tipo, setor_id: a.setor_id, quantidade_assentos: a.quantidade_assentos, sha256_arquivo: await sha256(a.bytes) });
    form.append("pdf_" + i, new Blob([a.bytes]), "arquivo.pdf");
    form.set("pdf_" + i, new File([a.bytes], "arquivo.pdf", { type: "application/pdf" }));
  }
  form.set("manifesto", JSON.stringify(meta)); form.set("revisao_exportacao", await revisao(m)); form.set("gerador_versao", GERADOR);
  return form;
}
const post = (f: FormData) => new Request(base + "exportacao", { method: "POST", headers: { Authorization: auth }, body: f });
const get = (acao = "exportacao") => new Request(base + acao, { headers: { Authorization: auth } });
const recusa = (status: number) => (e: any) => e instanceof Recusa && e.status === status;

Deno.test("quatro setores: arquivos reais, manifesto completo e download da revisão", async () => {
  const f = fixture();
  const r = await (await atender(post(await formulario(f.mapa)), f.deps)).json();
  assert.equal(r.estado, "pronto"); assert.equal(r.arquivos.length, 5);
  assert.deepEqual(r.arquivos.slice(1).map((a: any) => a.quantidade_assentos), [1, 2, 3, 4]);
  assert.equal(f.objetos.size, 5); assert.equal(f.chamadas.at(-1), "finalizar");
  const file = await atender(new Request(r.arquivos[2].pdf_recurso, { headers: { Authorization: auth } }), f.deps);
  assert.equal(file.headers.get("content-type"), "application/pdf");
  assert.equal(await sha256(new Uint8Array(await file.arrayBuffer())), r.arquivos[2].sha256_arquivo);
});
Deno.test("upload parcial não anuncia exportação", async () => {
  const f = fixture(); f.falhar(3);
  await assert.rejects(async () => atender(post(await formulario(f.mapa)), f.deps), recusa(502));
  assert.equal(f.row, null); assert.equal(f.chamadas.includes("finalizar"), false);
});
Deno.test("repetição não duplica upload nem manifesto", async () => {
  const f = fixture();
  await atender(post(await formulario(f.mapa)), f.deps);
  const antes = f.chamadas.filter(c => c === "upload").length;
  await atender(post(await formulario(f.mapa)), f.deps);
  assert.equal(f.chamadas.filter(c => c === "upload").length, antes);
  assert.equal(f.chamadas.filter(c => c === "finalizar").length, 1);
});
Deno.test("gerador v1 preserva consulta e bytes; v2 nao reutiliza o PDF antigo", async () => {
  const f = fixture(), antigo = "a3-v1-20261003";
  await atender(post(await formulario(f.mapa)), f.deps);
  f.row.gerador_versao = antigo;
  for (const a of f.row.arquivos) {
    const anterior = a.storage_path;
    a.storage_path = caminho(f.mapa.id, f.row.revisao_exportacao, a.setor_id, a.sha256_arquivo, antigo);
    f.objetos.set(a.storage_path, f.objetos.get(anterior)!); f.objetos.delete(anterior);
  }
  const preservado = structuredClone(f.row);
  const atual = await (await atender(get(), f.deps)).json();
  assert.equal(atual.estado, "pendente"); assert.equal(atual.gerador_versao, GERADOR);
  const historico = await (await atender(get("exportacao?gerador=" + antigo), f.deps)).json();
  assert.equal(historico.estado, "pronto"); assert.equal(historico.gerador_versao, antigo);
  const download = await atender(new Request(historico.arquivos[1].pdf_recurso, { headers: { Authorization: auth } }), f.deps);
  assert.equal(await sha256(new Uint8Array(await download.arrayBuffer())), preservado.arquivos[1].sha256_arquivo);
  assert.deepEqual(f.row, preservado);
  // Agora os registros simulados convivem, como na chave unica do banco.
  const consultar = f.deps.exportacao;
  f.deps.exportacao = async (id, rev, versao) => versao === antigo && rev === preservado.revisao_exportacao ? preservado : consultar(id, rev, versao);
  const novo = await (await atender(post(await formulario(f.mapa)), f.deps)).json();
  assert.equal(novo.estado, "pronto"); assert.equal(novo.gerador_versao, GERADOR);
  const novamente = await (await atender(get("exportacao?gerador=" + antigo), f.deps)).json();
  assert.deepEqual(novamente.arquivos, historico.arquivos);
});
Deno.test("consulta v1 ausente informa v1; gerador desconhecido e upload v1 recusam", async () => {
  const f = fixture(), antigo = "a3-v1-20261003";
  const r = await (await atender(get("exportacao?gerador=" + antigo), f.deps)).json();
  assert.equal(r.estado, "pendente"); assert.equal(r.gerador_versao, antigo);
  await assert.rejects(() => atender(get("exportacao?gerador=desconhecido"), f.deps), recusa(422));
  const form = await formulario(f.mapa); form.set("gerador_versao", antigo);
  await assert.rejects(() => atender(post(form), f.deps), recusa(409));
  assert.equal(f.objetos.size, 0);
});
Deno.test("mapa alterado durante upload não finaliza revisão antiga", async () => {
  const f = fixture(); f.mudar();
  await assert.rejects(async () => atender(post(await formulario(f.mapa)), f.deps), recusa(409));
  assert.equal(f.row, null);
});
Deno.test("revisão desatualizada recusa antes do upload", async () => {
  const f = fixture(), form = await formulario(f.mapa); f.mapa.config.setores[0].nome = "Novo nome";
  await assert.rejects(() => atender(post(form), f.deps), recusa(409));
  assert.equal(f.objetos.size, 0);
});
Deno.test("mapa negado não consulta exportações nem assina acesso privilegiado", async () => {
  const f = fixture(); f.negar();
  await assert.rejects(() => atender(get(), f.deps), recusa(403));
  assert.deepEqual(f.chamadas, ["mapa"]);
});
Deno.test("anônimo recusa antes de ler qualquer registro", async () => {
  const f = fixture();
  await assert.rejects(() => atender(new Request(base + "exportacao"), f.deps), recusa(401));
  assert.deepEqual(f.chamadas, []);
});
Deno.test("leitor sem papel de publicação não envia arquivos", async () => {
  const f = fixture(); f.deps.escritor = async () => { throw new Recusa(403, "Sem papel"); };
  await assert.rejects(async () => atender(post(await formulario(f.mapa)), f.deps), recusa(403));
  assert.equal(f.objetos.size, 0);
});
Deno.test("setor ausente ou duplicado não usa índice ou nome como ID", () => {
  const f = fixture(); f.mapa.config.setores[1].id = "s1";
  assert.throws(() => setores(f.mapa), recusa(422));
  delete f.mapa.config.setores[1].id;
  assert.throws(() => setores(f.mapa), recusa(422));
});
Deno.test("manifesto incompleto, quantidade divergente e hash falso recusam", async () => {
  for (const caso of ["incompleto", "quantidade", "hash"]) {
    const f = fixture(), form = await formulario(f.mapa), meta = JSON.parse(String(form.get("manifesto")));
    if (caso === "incompleto") meta.pop();
    if (caso === "quantidade") meta[1].quantidade_assentos = 999;
    if (caso === "hash") meta[1].sha256_arquivo = "a".repeat(64);
    form.set("manifesto", JSON.stringify(meta));
    await assert.rejects(() => atender(post(form), f.deps), recusa(422));
    assert.equal(f.objetos.size, 0);
  }
});
Deno.test("arquivo com cabeçalho PDF e conteúdo inválido recusa", async () => {
  const f = fixture(), form = await formulario(f.mapa), bytes = new TextEncoder().encode("%PDF-invalido");
  form.set("pdf_1", new File([bytes], "f.pdf", { type: "application/pdf" }));
  await assert.rejects(() => atender(post(form), f.deps), recusa(422));
  assert.equal(f.objetos.size, 0);
});
Deno.test("limite declarado do envio recusa sem upload", async () => {
  const f = fixture(), r = post(await formulario(f.mapa)); r.headers.set("content-length", String(MAX_TOTAL + 1));
  await assert.rejects(() => atender(r, f.deps), recusa(413));
  assert.equal(f.objetos.size, 0);
});
Deno.test("revisão antiga é explícita e consulta atual fica pendente", async () => {
  const f = fixture(); const old = await (await atender(post(await formulario(f.mapa)), f.deps)).json();
  f.mapa.config.setores[0].cadeiras["9,0"] = { prefixo: "A", num: 10, tipo: "Normal" };
  const atual = await (await atender(get(), f.deps)).json(); assert.equal(atual.estado, "pendente");
  const antiga = await (await atender(new Request(base + "exportacao?revisao=" + old.revisao_exportacao, { headers: { Authorization: auth } }), f.deps)).json();
  assert.equal(antiga.estado, "pronto"); assert.equal(antiga.revisao_atual, false);
});
Deno.test("renomear o mapa conserva revisão e exportação; nome do setor integra config", async () => {
  const f = fixture(), antes = await revisao(f.mapa);
  await atender(post(await formulario(f.mapa)), f.deps);
  f.mapa.name = "Mapa renomeado";
  assert.equal(await revisao(f.mapa), antes);
  const r = await (await atender(get(), f.deps)).json();
  assert.equal(r.estado, "pronto"); assert.equal(r.revisao_exportacao, antes);
  assert.equal(r.nome_mapa, "Teatro sintético"); // Nome histórico do PDF armazenado.
  f.mapa.config.setores[0].nome = "Setor renomeado";
  assert.ok(await revisao(f.mapa) !== antes);
});
Deno.test("histórico com hash de id/name/config conserva registro e bytes após mudança para JCS", async () => {
  const f = fixture();
  await atender(post(await formulario(f.mapa)), f.deps);
  const legado = await sha256(new TextEncoder().encode(JSON.stringify(canonico(f.mapa))));
  assert.ok(legado !== await revisao(f.mapa));
  f.row.revisao_exportacao = legado;
  for (const a of f.row.arquivos) {
    const anterior = a.storage_path;
    a.storage_path = caminho(f.mapa.id, legado, a.setor_id, a.sha256_arquivo);
    f.objetos.set(a.storage_path, f.objetos.get(anterior)!); f.objetos.delete(anterior);
  }
  const preservado = structuredClone(f.row);
  const atual = await (await atender(get(), f.deps)).json(); assert.equal(atual.estado, "pendente");
  const antiga = await (await atender(get("exportacao?revisao=" + legado), f.deps)).json();
  assert.equal(antiga.revisao_exportacao, legado); assert.equal(antiga.revisao_atual, false);
  const download = await atender(new Request(antiga.arquivos[0].pdf_recurso, { headers: { Authorization: auth } }), f.deps);
  assert.equal(await sha256(new Uint8Array(await download.arrayBuffer())), f.row.arquivos[0].sha256_arquivo);
  assert.deepEqual(f.row, preservado);
});
Deno.test("revisão histórica ausente não é substituída pela atual", async () => {
  const f = fixture(), historica = "a".repeat(64);
  const r = await (await atender(get("exportacao?revisao=" + historica), f.deps)).json();
  assert.equal(r.estado, "pendente"); assert.equal(r.revisao_exportacao, historica); assert.equal(r.revisao_atual, false);
  assert.equal(f.chamadas.includes("upload"), false);
});
Deno.test("Edge Function usa os mesmos bytes JCS do painel e rejeita dados inválidos", async () => {
  const m = fixture().mapa;
  m.config = { "2": 2, "10": 10, unicode: "ação 😀", numeros: [1e30, 1e-7, -0] };
  const esperado = '{"10":10,"2":2,"numeros":[1e+30,1e-7,0],"unicode":"ação 😀"}';
  assert.equal(await revisao(m), await sha256(new TextEncoder().encode(esperado)));
  m.config = { texto: "\ud800" };
  await assert.rejects(() => revisao(m), recusa(422));
});
Deno.test("download não aceita caminho adulterado ou bytes trocados", async () => {
  const f = fixture(), r = await (await atender(post(await formulario(f.mapa)), f.deps)).json();
  const req = () => new Request(r.arquivos[1].pdf_recurso, { headers: { Authorization: auth } });
  const path = f.row.arquivos[1].storage_path; f.row.arquivos[1].storage_path = "outro-mapa/segredo.pdf";
  await assert.rejects(() => atender(req(), f.deps), recusa(502));
  assert.equal(f.chamadas.includes("download"), false);
  f.row.arquivos[1].storage_path = path; f.objetos.set(path, new Uint8Array([1, 2, 3]));
  await assert.rejects(() => atender(req(), f.deps), recusa(502));
});
Deno.test("consulta e download não realizam upload; setor de outro mapa não resolve", async () => {
  const f = fixture();
  const pendente = await (await atender(get(), f.deps)).json(); assert.equal(pendente.estado, "pendente");
  await assert.rejects(() => atender(get("arquivo?setor=inexistente"), f.deps), recusa(404));
  assert.equal(f.chamadas.includes("upload"), false);
});
Deno.test("mapa vazio publica só o documento completo", async () => {
  const f = fixture(); f.mapa.config.setores = [];
  const r = await (await atender(post(await formulario(f.mapa)), f.deps)).json();
  assert.equal(r.arquivos.length, 1); assert.equal(r.arquivos[0].quantidade_assentos, 0);
});
