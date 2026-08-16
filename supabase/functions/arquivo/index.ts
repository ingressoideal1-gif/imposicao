/**
 * O proxy de arquivos: `/api/proxy?url=` (`app.py:381`).
 *
 * Busca os bytes de um PDF ou imagem e devolve. Quem chama é a tela do cliente,
 * o Criador de Arte e o painel, sempre como SEGUNDA tentativa — o `fetch`
 * direto vem antes e resolve a maioria dos casos, porque o Storage do Supabase
 * responde `Access-Control-Allow-Origin: *` (medido em 16/08/2026).
 *
 * ## Por que então ele ainda existe
 *
 * Por três registros. `producao_numeracoes.elements[].pdf_content` de três
 * numerações antigas ("87x54 - Amostra", "- Ovaide" e "- Registro") ainda aponta
 * para o bucket do Firebase da conta antiga, e aqueles PDFs seguem online. Sem
 * este caminho, abrir uma daquelas três na tela do cliente falharia — e falharia
 * na frente de quem está aprovando arte.
 *
 * ## `verify_jwt = false`, e o que protege no lugar
 *
 * `cliente.html` é a tela de quem comprou, aberta pelo link do QR, sem login
 * nenhum. Exigir sessão recusaria o cliente antes de o código rodar.
 *
 * O que protege é a ALLOWLIST, e ela é o ponto inteiro desta função. Um proxy
 * sem allowlist é um SSRF: alcança a rede interna de quem o hospeda e, no
 * agente, a LAN da gráfica. Aqui só passam o Storage do Supabase e aquele
 * bucket legado — cópia fiel de `security_config.is_allowed_proxy_url`.
 */
import { comCors, origemPermitida, respostaDePreflight } from "../_compartilhado/cors.ts";
import { Recusa } from "../_compartilhado/sessao.ts";
import { recusaDeRotaDesconhecida } from "../_compartilhado/validacao.ts";
import { enderecoPermitido, pedacosDaRota } from "./puro.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

async function proxy(url: URL): Promise<Response> {
  const alvo = url.searchParams.get("url") ?? "";
  if (!alvo) {
    // O FastAPI recusa parâmetro de busca obrigatório ausente com 422.
    throw new Recusa(422, "url e obrigatorio");
  }
  if (!enderecoPermitido(alvo)) {
    // A mesma mensagem do Render, para a tela não precisar distinguir as pilhas.
    throw new Recusa(403, "URL não autorizada para proxy.");
  }

  let r: Response;
  try {
    // `redirect: manual` reproduz o `allow_redirects=False` do Python, e não é
    // detalhe: seguir redirecionamento é como uma URL permitida vira uma URL
    // proibida sem que a allowlist perceba.
    r = await fetch(alvo, { redirect: "manual" });
  } catch (e) {
    throw new Recusa(400, String(e).slice(0, 200));
  }

  return new Response(r.body, {
    status: 200,
    headers: {
      "Content-Type": r.headers.get("content-type") ?? "application/pdf",
      // O binário não muda; deixar o navegador guardá-lo poupa a segunda ida.
      "Cache-Control": "public, max-age=3600",
    },
  });
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const origem = origemPermitida(req.headers.get("origin"));

  if (req.method === "OPTIONS") {
    return respostaDePreflight(origem, "GET, OPTIONS", "authorization,content-type,apikey");
  }

  try {
    const p = pedacosDaRota(url.pathname);
    if (p.length !== 1 || p[0] !== "proxy" || req.method !== "GET") {
      recusaDeRotaDesconhecida(req.method);
    }
    return comCors(await proxy(url), origem);
  } catch (e) {
    if (e instanceof Recusa) {
      return comCors(
        new Response(JSON.stringify({ detail: e.detail }), {
          status: e.status,
          headers: JSON_HEADERS,
        }),
        origem,
      );
    }
    console.error("[arquivo]", e);
    return comCors(
      new Response(JSON.stringify({ detail: "erro interno" }), {
        status: 500,
        headers: JSON_HEADERS,
      }),
      origem,
    );
  }
});
