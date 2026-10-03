import { atender, Dependencias } from "./servico.ts";
import { canonico, GERADOR, MAX_TOTAL, Mapa, revisao, sha256, setores } from "./puro.ts";
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
    async exportacao(_id, rev) { chamadas.push("consulta"); return row?.revisao_exportacao === rev ? row : null; },
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
Deno.test("mapa alterado durante upload não finaliza revisão antiga", async () => {
  const f = fixture(); f.mudar();
  await assert.rejects(async () => atender(post(await formulario(f.mapa)), f.deps), recusa(409));
  assert.equal(f.row, null);
});
Deno.test("revisão desatualizada recusa antes do upload", async () => {
  const f = fixture(), form = await formulario(f.mapa); f.mapa.name = "Novo nome";
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
  f.mapa.name = "Nome novo";
  const atual = await (await atender(get(), f.deps)).json(); assert.equal(atual.estado, "pendente");
  const antiga = await (await atender(new Request(base + "exportacao?revisao=" + old.revisao_exportacao, { headers: { Authorization: auth } }), f.deps)).json();
  assert.equal(antiga.estado, "pronto"); assert.equal(antiga.revisao_atual, false);
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
