import { comCors, origemPermitida, respostaDePreflight } from "../_compartilhado/cors.ts";
import { Recusa } from "../_compartilhado/sessao.ts";
import { atender } from "./servico.ts";

Deno.serve(async req => {
  const origem = origemPermitida(req.headers.get("origin"));
  if (req.method === "OPTIONS") return respostaDePreflight(origem, "GET, POST, OPTIONS", "authorization,content-type,apikey");
  try { return comCors(await atender(req), origem); }
  catch (e) {
    const status = e instanceof Recusa ? e.status : 503;
    const detail = e instanceof Recusa ? e.detail : "O armazenamento dos PDFs está indisponível. O mapa salvo foi preservado; tente novamente depois.";
    if (!(e instanceof Recusa)) console.error("[mapas-teatro-pdfs] falha ao consultar ou persistir exportação");
    return comCors(Response.json({ detail }, { status, headers: { "Cache-Control": "no-store" } }), origem);
  }
});
