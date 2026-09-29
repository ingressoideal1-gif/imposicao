import { comCors, origemPermitida, respostaDePreflight } from "../_compartilhado/cors.ts";
import { obterLinkPagamentoVibe, type DependenciasPagamento } from "../_compartilhado/link_pagamento_vibe.ts";

export async function atenderLinkPagamento(req: Request, deps: DependenciasPagamento = {}): Promise<Response> {
  const origem = origemPermitida(req.headers.get("origin"));
  const responder = (corpo: unknown, status = 200) => comCors(new Response(JSON.stringify(corpo), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  }), origem);
  if (req.method === "OPTIONS") return respostaDePreflight(origem, "POST, OPTIONS", "apikey,authorization,content-type,x-client-info");
  if (req.method !== "POST") return responder({ url: null }, 405);
  const entrada = await req.json().catch(() => null);
  const numero = String(entrada?.numero ?? "");
  const token = typeof entrada?.token === "string" ? entrada.token : "";
  return responder({ url: await obterLinkPagamentoVibe(numero, token, deps) });
}
