import { Recusa } from "../_compartilhado/sessao.ts";
import "../../../frontend/mapa-teatro-revisao.js";

export const BUCKET = "mapas-teatro-pdfs";
export const GERADOR = "a3-v2-20261006";
export const GERADORES = ["a3-v1-20261003", GERADOR];
export const MAX_ARQUIVO = 10 * 1024 * 1024;
export const MAX_TOTAL = 30 * 1024 * 1024;
export type Mapa = { id: string; name: string; config: Record<string, any> };
export type Arquivo = { tipo: "mapa" | "setor"; setor_id: string | null; nome_setor: string | null;
  quantidade_assentos: number; storage_path: string; sha256_arquivo: string; tamanho_bytes: number; paginas: number };

export function canonico(v: any): any {
  return Array.isArray(v) ? v.map(canonico) : v && typeof v === "object"
    ? Object.fromEntries(Object.keys(v).sort().map(k => [k, canonico(v[k])])) : v;
}
export async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, "0")).join("");
}
export async function revisao(m: Mapa): Promise<string> {
  try { return await (globalThis as any).MapaTeatroRevisao.revisao(m.config); }
  catch { throw new Recusa(422, "A configuração do mapa não é válida para JCS/RFC 8785."); }
}
export function textoId(v: unknown): string {
  if (typeof v !== "string" || !v.trim() || v.length > 200 || /[\x00-\x1f]/.test(v)) throw new Recusa(422, "Identificador inválido.");
  return v;
}
export function hexId(v: string): string {
  return [...new TextEncoder().encode(textoId(v))].map(c => c.toString(16).padStart(2, "0")).join("");
}
export function setores(m: Mapa): { id: string; nome: string; quantidade: number }[] {
  if (Object.keys(m.config?.cadeiras || {}).length) throw new Recusa(422, "Revise as cadeiras antigas sem setor.");
  const lista = m.config?.setores ?? [];
  if (!Array.isArray(lista) || lista.length > 99) throw new Recusa(422, "O mapa deve ter até 99 setores.");
  const ids = new Set<string>();
  return lista.map((s: any) => {
    const id = textoId(s?.id);
    if (ids.has(id)) throw new Recusa(422, "Há setores com identificadores duplicados.");
    ids.add(id);
    if (!s.cadeiras || Array.isArray(s.cadeiras) || typeof s.cadeiras !== "object") throw new Recusa(422, "Cadastro de assentos inválido.");
    for (const [posicao, c] of Object.entries(s.cadeiras) as [string, any][]) {
      if (!c || typeof c !== "object" || Array.isArray(c) || (c.isErased !== undefined && typeof c.isErased !== "boolean")) throw new Recusa(422, "Cadastro de assentos inválido.");
      const xy = posicao.split(",");
      if (xy.length !== 2 || xy.some(v => !v.trim() || !Number.isFinite(Number(v)))) throw new Recusa(422, "Posição de assento inválida.");
    }
    const cadeiras = Object.values(s.cadeiras).filter((c: any) => c.tipo !== "Apagado" && !c.isErased);
    return { id, nome: String(s.nome || "Sem nome"), quantidade: cadeiras.length };
  });
}
export function caminho(mapa: string, rev: string, setor: string | null, hash: string, gerador = GERADOR): string {
  if (!/^[a-f0-9]{64}$/.test(rev) || !/^[a-f0-9]{64}$/.test(hash) || !GERADORES.includes(gerador)) throw new Recusa(422, "Revisão, hash ou gerador inválido.");
  return `${hexId(mapa)}/${rev}/${gerador}/${setor === null ? "mapa" : "setores/" + hexId(setor)}/${hash}.pdf`;
}
export function recurso(base: string, mapa: string, rev: string, setor: string | null, gerador = GERADOR): string {
  if (!GERADORES.includes(gerador)) throw new Recusa(422, "Gerador inválido.");
  const q = new URLSearchParams({ revisao: rev, gerador });
  if (setor !== null) q.set("setor", setor);
  return `${base}/mapas/${encodeURIComponent(mapa)}/arquivo?${q}`;
}
