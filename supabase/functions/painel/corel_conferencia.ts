import { Recusa } from "../_compartilhado/sessao.ts";

// A ponte-drive valida o JWT, o pedido, o modelo e o item de origem nas duas leituras.
// O navegador nunca escolhe o ID do arquivo nem recebe credenciais do Drive.
export async function baixarCdrConferencia(req: Request, base: string, consultar = fetch) {
  const auth = req.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) throw new Recusa(401, "Entre novamente no Imposition.");
  const query = new URL(req.url).searchParams;
  const pedido = query.get("pedido") || "", modelo = query.get("modelo") || "";
  const documento = query.get("documento") || "";
  if (![pedido, modelo].every(v => /^[1-9]\d{0,14}$/.test(v)) ||
      !(/^produto-[1-9]\d{0,14}$/.test(documento) || documento === "modelo-" + modelo)) {
    throw new Recusa(422, "Vínculo do pedido, modelo ou produto incompleto.");
  }
  const headers = new Headers({authorization: auth, "x-order": pedido, "x-model": modelo,
    "x-document": documento + "-coreldraw", "x-kind": "native"});
  async function ler(acao: "latest" | "download") {
    const r = await consultar(base + "/functions/v1/ponte-drive/" + acao,
      {method: "POST", headers, redirect: "error"});
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) throw new Recusa(r.status, "Acesso ao CDR recusado.");
      if (r.status === 409) throw new Recusa(409, "A revisão do CDR ainda não foi confirmada no Drive.");
      throw new Recusa(502, "O Drive não confirmou a leitura do CDR.");
    }
    return r;
  }
  const latest = await (await ler("latest")).json();
  if (!latest) throw new Recusa(404, "Não há CDR de conferência disponível no Drive.");
  const {metadata, receipt} = latest;
  if (metadata?.editor !== "coreldraw" || !Array.isArray(metadata.models) ||
      !metadata.models.some((m: {id: string; pedido: string}) =>
        String(m?.id) === modelo && String(m?.pedido) === pedido)) {
    throw new Recusa(409, "O CDR do Drive não contém este modelo do pedido.");
  }
  if (receipt?.verified !== true || !/^[A-Za-z0-9_-]{10,128}$/.test(receipt.id) ||
      !/^[a-f0-9]{64}$/.test(receipt.sha256) || !Number.isSafeInteger(receipt.size) ||
      receipt.size <= 0 || receipt.size > 30 * 1024 * 1024) {
    throw new Recusa(502, "Recibo do CDR inválido.");
  }
  headers.set("x-file-id", receipt.id);
  const arquivo = await ler("download");
  if (arquivo.headers.get("x-content-sha256") !== receipt.sha256 ||
      arquivo.headers.get("x-content-size") !== String(receipt.size)) {
    throw new Recusa(409, "A revisão do CDR mudou. Tente baixar novamente.");
  }
  const bytes = await arquivo.arrayBuffer();
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  if (bytes.byteLength !== receipt.size || Array.from(hash, b => b.toString(16).padStart(2, "0")).join("") !== receipt.sha256) {
    throw new Recusa(502, "O arquivo recebido diverge do CDR confirmado no Drive.");
  }
  return new Response(bytes, {headers: {"Content-Type": "application/octet-stream",
    "Content-Disposition": `attachment; filename="Pedido-${pedido}-Modelo-${modelo}-conferencia.cdr"`,
    "Cache-Control": "no-store"}});
}
