import "../../../frontend/pdf-lib.min.js";
import { banco } from "../_compartilhado/banco.ts";
import { quemConfigura, Recusa, usuarioDoJwt } from "../_compartilhado/sessao.ts";
import { Arquivo, BUCKET, caminho, GERADOR, Mapa, MAX_ARQUIVO, MAX_TOTAL, recurso, revisao, setores, sha256, textoId } from "./puro.ts";

const PDF = (globalThis as any).PDFLib;
const TABELA = "producao_mapas_teatro_pdf_exportacoes";
export type Dependencias = {
  mapa: (id: string, auth: string) => Promise<Mapa>;
  escritor: (auth: string) => Promise<{ id: string }>;
  exportacao: (id: string, rev: string, versao: string) => Promise<any>;
  upload: (path: string, bytes: Uint8Array) => Promise<void>;
  finalizar: (mapa: Mapa, rev: string, arquivos: Arquivo[], autor: string) => Promise<any>;
  download: (path: string) => Promise<Uint8Array>;
};
function ambiente() {
  const url = Deno.env.get("SUPABASE_URL"), chave = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"), anon = Deno.env.get("SUPABASE_ANON_KEY");
  if (!url || !chave || !anon) throw new Recusa(503, "O serviço de PDFs ainda não está configurado.");
  return { url, chave, anon };
}
async function storage(method: string, path: string, bytes?: Uint8Array): Promise<Response> {
  const { url, chave } = ambiente();
  return await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, { method,
    headers: { apikey: chave, Authorization: `Bearer ${chave}`, "Content-Type": "application/pdf", "x-upsert": "false" },
    body: bytes as BodyInit | undefined });
}
export const producao: Dependencias = {
  async mapa(id, auth) {
    const { url, anon } = ambiente();
    const q = new URLSearchParams({ id: `eq.${id}`, select: "id,name,config", limit: "1" });
    // A leitura com JWT do solicitante preserva as políticas do mapa.
    const r = await fetch(`${url}/rest/v1/producao_mapas_teatro?${q}`, { headers: { apikey: anon, Authorization: auth } });
    if (!r.ok) throw new Recusa(r.status === 401 ? 401 : 403, "Sem acesso ao mapa solicitado.");
    const rows = await r.json();
    if (!rows?.[0] || String(rows[0].id) !== id) throw new Recusa(404, "Mapa não encontrado ou sem acesso.");
    return rows[0];
  },
  escritor: quemConfigura,
  async exportacao(id, rev, versao) {
    const q = new URLSearchParams({ mapa_id: `eq.${id}`, revisao_exportacao: `eq.${rev}`, gerador_versao: `eq.${versao}`, select: "*", limit: "1" });
    return (await banco("GET", `${TABELA}?${q}`))?.[0] || null;
  },
  async upload(path, bytes) {
    const r = await storage("POST", path, bytes);
    if (!r.ok) {
      // Upload concorrente só vale se os bytes existentes conferirem.
      const existente = await storage("GET", path);
      if (!existente.ok || await sha256(new Uint8Array(await existente.arrayBuffer())) !== await sha256(bytes)) throw new Recusa(502, "Não foi possível confirmar o envio do PDF. Tente novamente.");
    } else {
      const conferido = await storage("GET", path);
      if (!conferido.ok || await sha256(new Uint8Array(await conferido.arrayBuffer())) !== await sha256(bytes)) throw new Recusa(502, "O PDF enviado não foi confirmado.");
    }
  },
  async finalizar(mapa, rev, arquivos, autor) {
    const row = await banco("POST", "rpc/mapas_teatro_publicar_pdf_exportacao", { p_mapa_id: mapa.id, p_revisao: rev,
      p_gerador: GERADOR, p_snapshot: { id: mapa.id, name: mapa.name, config: mapa.config }, p_arquivos: arquivos, p_autor: autor });
    const salvo = Array.isArray(row) ? row[0] : row;
    if (!salvo?.id) throw new Recusa(502, "O registro da exportação não foi confirmado.");
    const confirmado = await producao.exportacao(mapa.id, rev, GERADOR);
    if (confirmado?.id !== salvo.id) throw new Recusa(502, "Não foi possível conferir a exportação salva.");
    return confirmado;
  },
  async download(path) {
    const r = await storage("GET", path);
    if (!r.ok) throw new Recusa(502, "O arquivo persistido não está disponível.");
    return new Uint8Array(await r.arrayBuffer());
  },
};
function resposta(row: any, mapa: Mapa, atual: string, base: string, consultada = atual) {
  if (!row) return { mapa_id: mapa.id, nome_mapa: mapa.name, revisao_exportacao: consultada, revisao_atual: consultada === atual,
    gerador_versao: GERADOR, estado: "pendente", arquivos: [] };
  return { exportacao_id: row.id, mapa_id: row.mapa_id, nome_mapa: row.nome_mapa, revisao_exportacao: row.revisao_exportacao,
    gerador_versao: row.gerador_versao, estado: "pronto", revisao_atual: row.revisao_exportacao === atual,
    criado_em: row.criado_em, arquivos: row.arquivos.map((a: Arquivo) => ({ ...a, pdf_recurso: recurso(base, mapa.id, row.revisao_exportacao, a.setor_id) })) };
}
async function corpoLimitado(req: Request): Promise<FormData> {
  if (Number(req.headers.get("content-length") || 0) > MAX_TOTAL || !req.body) throw new Recusa(413, "O envio ultrapassa 30 MB.");
  if (!req.headers.get("content-type")?.startsWith("multipart/form-data;")) throw new Recusa(415, "Envie os PDFs como formulário multipart.");
  const reader = req.body.getReader(), partes: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_TOTAL) { await reader.cancel(); throw new Recusa(413, "O envio ultrapassa 30 MB."); }
      partes.push(value);
    }
    return await new Response(new Blob(partes as BlobPart[]), { headers: { "Content-Type": req.headers.get("content-type")! } }).formData();
  } catch (e) {
    if (e instanceof Recusa) throw e;
    throw new Recusa(422, "Formulário de PDFs inválido.");
  } finally { reader.releaseLock(); }
}
export async function atender(req: Request, deps: Dependencias = producao): Promise<Response> {
  const url = new URL(req.url), partes = url.pathname.split("/").filter(Boolean), idx = partes.indexOf("mapas");
  if (idx < 0 || partes.length !== idx + 3 || !["exportacao", "arquivo"].includes(partes[idx + 2])) throw new Recusa(404, "Rota não encontrada.");
  const acao = partes[idx + 2];
  if (req.method !== "GET" && !(req.method === "POST" && acao === "exportacao")) throw new Recusa(405, "Método não permitido.");
  const auth = req.headers.get("authorization");
  usuarioDoJwt(auth); // Assinatura conferida pelo gateway e pela leitura com JWT.
  let id: string;
  try { id = textoId(decodeURIComponent(partes[idx + 1])); } catch { throw new Recusa(422, "Identificador inválido."); }
  const mapa = await deps.mapa(id, auth!);
  const atual = await revisao(mapa), base = url.origin + "/" + partes.slice(0, idx).join("/");
  if (req.method === "GET") {
    const rev = url.searchParams.get("revisao") || atual, versao = url.searchParams.get("gerador") || GERADOR;
    if (!/^[a-f0-9]{64}$/.test(rev) || versao !== GERADOR) throw new Recusa(422, "Revisão ou gerador inválido.");
    const row = await deps.exportacao(id, rev, versao);
    if (acao === "exportacao") return Response.json(resposta(row, mapa, atual, base, rev), { headers: { "Cache-Control": "no-store" } });
    const setor = url.searchParams.get("setor");
    const a: Arquivo | undefined = row?.arquivos.find((a: Arquivo) => a.setor_id === setor && a.tipo === (setor === null ? "mapa" : "setor"));
    if (!a) throw new Recusa(404, "PDF não publicado para esse mapa, setor e revisão.");
    if (a.storage_path !== caminho(id, rev, setor, a.sha256_arquivo)) throw new Recusa(502, "Referência do PDF inválida.");
    const bytes = await deps.download(a.storage_path);
    if (bytes.byteLength !== a.tamanho_bytes || await sha256(bytes) !== a.sha256_arquivo) throw new Recusa(502, "O PDF persistido não confere com o registro.");
    return new Response(bytes as BodyInit, { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="mapa-teatro.pdf"',
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  }
  const autor = await deps.escritor(auth!);
  const form = await corpoLimitado(req);
  if (form.get("revisao_exportacao") !== atual || form.get("gerador_versao") !== GERADOR) throw new Recusa(409, "O mapa mudou ou o gerador está desatualizado. Gere novamente os PDFs.");
  const lista = setores(mapa), total = lista.reduce((n, s) => n + s.quantidade, 0);
  let meta: any;
  try { meta = JSON.parse(String(form.get("manifesto"))); } catch { throw new Recusa(422, "Manifesto inválido."); }
  const esperado = [{ tipo: "mapa", setor_id: null, nome_setor: null, quantidade_assentos: total },
    ...lista.map(s => ({ tipo: "setor", setor_id: s.id, nome_setor: s.nome, quantidade_assentos: s.quantidade }))];
  if (!Array.isArray(meta) || meta.length !== esperado.length || [...form.keys()].length !== meta.length + 3) throw new Recusa(422, "Envie exatamente o mapa completo e todos os setores.");
  const arquivos: Arquivo[] = [], dados: Uint8Array[] = [];
  for (let i = 0; i < esperado.length; i++) {
    const a = meta[i], e = esperado[i], file = form.get("pdf_" + i);
    if (!a || a.tipo !== e.tipo || a.setor_id !== e.setor_id || a.quantidade_assentos !== e.quantidade_assentos || !(file instanceof File)) throw new Recusa(422, "O PDF não corresponde ao mapa e setor cadastrados.");
    if (!file.size || file.size > MAX_ARQUIVO || file.type !== "application/pdf") throw new Recusa(422, "Cada arquivo deve ser PDF e ter até 10 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new Recusa(422, "Arquivo PDF inválido.");
    let doc;
    try { doc = await PDF.PDFDocument.load(bytes); } catch { throw new Recusa(422, "Não foi possível ler o PDF enviado."); }
    const paginas = doc.getPageCount();
    if (!paginas || paginas > 1000) throw new Recusa(422, "O PDF deve ter entre 1 e 1000 páginas.");
    const hash = await sha256(bytes);
    if (a.sha256_arquivo !== hash) throw new Recusa(422, "Os bytes do PDF não conferem com o manifesto.");
    arquivos.push({ ...e, tipo: e.tipo as "mapa" | "setor", storage_path: caminho(id, atual, e.setor_id, hash), sha256_arquivo: hash, tamanho_bytes: bytes.length, paginas });
    dados.push(bytes);
  }
  if (arquivos[0].paginas !== (lista.length ? arquivos.slice(1).reduce((n, a) => n + a.paginas, 0) : 1)) throw new Recusa(422, "As páginas do mapa completo não conferem com os PDFs dos setores.");
  const existente = await deps.exportacao(id, atual, GERADOR);
  if (existente) return Response.json(resposta(existente, mapa, atual, base), { headers: { "Cache-Control": "no-store" } });
  for (let i = 0; i < arquivos.length; i++) await deps.upload(arquivos[i].storage_path, dados[i]);
  let row;
  try { row = await deps.finalizar(mapa, atual, arquivos, autor.id); }
  catch (e) {
    if (e instanceof Recusa) throw e;
    if (await revisao(await deps.mapa(id, auth!)) !== atual) throw new Recusa(409, "O mapa mudou durante o envio. Reabra o mapa e gere os PDFs novamente.");
    throw e;
  }
  return Response.json(resposta(row, mapa, atual, base), { headers: { "Cache-Control": "no-store" } });
}
