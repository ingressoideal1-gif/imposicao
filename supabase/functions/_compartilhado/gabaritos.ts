import "../../../frontend/pdf-lib.min.js";
import { banco } from "./banco.ts";
import { Recusa } from "./sessao.ts";

const BUCKET = "imposition-gabaritos";
const LIMIT = 30 * 1024 * 1024;
type Identity = { id: string; permissoes: Record<string, unknown> | null };
type Store = (method: string, path: string, body?: unknown) => Promise<any>;

async function storage(method: string, path: string, body?: unknown) {
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const binary = body instanceof Uint8Array;
  const response = await fetch(
    `${Deno.env.get("SUPABASE_URL")}/storage/v1/${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        "Content-Type": binary ? "application/pdf" : "application/json",
        ...(binary ? { "x-upsert": "true" } : {}),
      },
      body: body === undefined
        ? undefined
        : binary
        ? body as BodyInit
        : JSON.stringify(body),
    },
  );
  if (!response.ok) {
    throw new Recusa(503, "Nao foi possivel acessar o arquivo do gabarito.");
  }
  return await response.json();
}
function product(value: unknown): number {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n < 1 || n > 2147483647) {
    throw new Recusa(422, "Produto invalido.");
  }
  return n;
}
function permit(who: Identity) {
  const p = who.permissoes;
  if (
    !p ||
    !["admin", "gerente", "designer", "atendimento"].includes(
      String(p.role || "").toLowerCase(),
    ) || p.perm_lista_arte_view === false
  ) {
    throw new Recusa(
      403,
      "Gabaritos disponiveis somente para equipe interna de arte e atendimento.",
    );
  }
}
async function current(id: number, db: typeof banco) {
  const links = await db(
    "GET",
    `imposition_gabaritos?produto=eq.${id}&select=revisao&limit=2`,
  );
  if (!Array.isArray(links) || links.length > 1) {
    throw new Recusa(503, "Vinculo de gabarito invalido.");
  }
  if (!links.length) return null;
  const rows = await db(
    "GET",
    `imposition_gabaritos_revisoes?id=eq.${
      encodeURIComponent(links[0].revisao)
    }&produto=eq.${id}&select=*&limit=2`,
  );
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Recusa(503, "Revisao de gabarito indisponivel.");
  }
  return rows[0];
}
export async function operarGabaritos(
  action: string,
  input: any,
  who: Identity,
  db: typeof banco = banco,
  store: Store = storage,
) {
  permit(who);
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Recusa(422, "Parametros invalidos.");
  }
  if (action === "listar") {
    const all = async (query: string) => {
      const rows = [];
      for (let offset = 0;;) {
        const page = await db("GET", query + "&limit=500&offset=" + offset);
        if (!Array.isArray(page)) {
          throw new Recusa(503, "Catalogo indisponivel.");
        }
        rows.push(...page);
        if (page.length < 500) return rows;
        offset += page.length;
      }
    };
    const products = await all(
      "produtos?select=id_produto,nomeReal&order=id_produto.asc",
    );
    const links = await all(
      "imposition_gabaritos?select=produto,revisao&order=produto.asc",
    );
    return { produtos: products, gabaritos: links };
  }
  if (!["baixar", "salvar"].includes(action)) {
    throw new Recusa(404, "Acao de gabarito inexistente.");
  }
  const id = product(input.produto);
  const previous = await current(id, db);
  if (action === "baixar") {
    if (!previous) {
      throw new Recusa(404, "Este produto ainda nao tem gabarito.");
    }
    const signed = await store(
      "POST",
      `object/sign/${BUCKET}/${previous.arquivo}`,
      { expiresIn: 60 },
    );
    const base = Deno.env.get("SUPABASE_URL") || "";
    const signedPath = signed.signedURL;
    if (
      typeof signedPath !== "string" ||
      !signedPath.startsWith(`/object/sign/${BUCKET}/`)
    ) throw new Recusa(503, "Link de download nao confirmado.");
    return {
      id: previous.id,
      produto: id,
      nome: previous.nome,
      sha256: previous.sha256,
      tamanho: previous.tamanho,
      url: base + "/storage/v1" + signedPath,
    };
  }
  if ((input.anterior ?? null) !== (previous?.id ?? null)) {
    throw new Recusa(409, "Gabarito mudou. Recarregue antes de substituir.");
  }
  if (
    typeof input.pdf !== "string" || input.pdf.length > 4 * Math.ceil(LIMIT / 3)
  ) throw new Recusa(422, "PDF excede 30 MiB.");
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(input.pdf), (c) => c.charCodeAt(0));
  } catch {
    throw new Recusa(422, "PDF invalido.");
  }
  try {
    const pdf = await (globalThis as any).PDFLib.PDFDocument.load(bytes);
    if (![1, 2].includes(pdf.getPageCount())) throw Error();
  } catch {
    throw new Recusa(
      422,
      "Use PDF sem senha com uma pagina ou duas paginas Frente/Verso.",
    );
  }
  if (
    bytes.length < 8 || bytes.length > LIMIT ||
    new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-"
  ) throw new Recusa(422, "Envie um arquivo PDF ate 30 MiB.");
  const name = String(input.nome || "gabarito.pdf").replace(
    /[\x00-\x1f/\\]/g,
    "",
  ).slice(0, 180);
  if (!name.toLowerCase().endsWith(".pdf")) {
    throw new Recusa(422, "Arquivo precisa ter extensao PDF.");
  }
  const rows = await db(
    "GET",
    `produtos?id_produto=eq.${id}&select=id_produto&limit=1`,
  );
  if (!Array.isArray(rows) || rows.length !== 1) {
    throw new Recusa(404, "Produto nao encontrado.");
  }
  const sha = Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
  if (previous?.sha256 === sha) {
    return { ok: true, revisao: previous.id, inalterado: true };
  }
  const path = `${id}/${sha}.pdf`;
  await store("POST", `object/${BUCKET}/${path}`, bytes);
  let saved;
  try {
    saved = await db("POST", "rpc/imposition_publicar_gabarito", {
      p_produto: id,
      p_anterior: input.anterior ?? null,
      p_arquivo: path,
      p_nome: name,
      p_sha256: sha,
      p_tamanho: bytes.length,
      p_autor: who.id,
    });
  } catch {
    throw new Recusa(
      409,
      "Cadastro nao confirmado. Recarregue a biblioteca antes de tentar novamente.",
    );
  }
  if (
    !Array.isArray(saved) || saved.length !== 1 || saved[0].produto !== id ||
    saved[0].sha256 !== sha
  ) {
    throw new Recusa(503, "Banco nao confirmou o gabarito.");
  }
  return { ok: true, revisao: saved[0].id };
}
