import { banco } from "../_compartilhado/banco.ts";
import { comCors, origemPermitida, respostaDePreflight } from "../_compartilhado/cors.ts";

type Deps = {
  consultar?: typeof banco;
  buscar?: typeof fetch;
  ambiente?: (nome: string) => string | undefined;
};

/** Extrai somente PDFs fiscais do nosso Storage; nunca usa o token salvo. */
export function caminhoFiscal(valor: string, base: string): string | null {
  try {
    if (/[\s\\]/.test(valor)) return null;
    const u = new URL(valor), projeto = new URL(base);
    if (u.protocol !== "https:" || u.origin !== projeto.origin || u.username || u.password) return null;
    const m = u.pathname.match(/^\/storage\/v1\/object\/(?:sign|public|authenticated)\/(.+)$/);
    if (!m) return null;
    const partes = m[1].split("/").map(decodeURIComponent);
    if (!["nfe-documentos", "nfse-documentos"].includes(partes[0]) || partes.length < 3 ||
      partes.some(p => !p || p === "." || p === ".." || /[\x00-\x20\x7f/\\%?#]/.test(p)) ||
      !partes.at(-1)!.toLowerCase().endsWith(".pdf")) return null;
    return partes.map(encodeURIComponent).join("/");
  } catch { return null; }
}

export async function atenderNotaFiscal(req: Request, deps: Deps = {}): Promise<Response> {
  const origem = origemPermitida(req.headers.get("origin"));
  const responder = (corpo: unknown, status = 200) => comCors(new Response(JSON.stringify(corpo), {
    status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  }), origem);
  if (req.method === "OPTIONS") return respostaDePreflight(origem, "POST, OPTIONS", "apikey,authorization,content-type,x-client-info");
  if (req.method !== "POST") return responder({ erro: "Método não permitido." }, 405);
  try {
    const texto = await req.text();
    if (texto.length > 16384) return responder({ erro: "Entrada inválida." }, 400);
    let entrada;
    try { entrada = JSON.parse(texto); } catch { return responder({ erro: "Entrada inválida." }, 400); }
    const { numero, token, nota_url } = entrada ?? {};
    if (typeof numero !== "string" || !/^[1-9]\d{0,18}$/.test(numero) ||
      typeof token !== "string" || !token || token.length > 200 ||
      typeof nota_url !== "string" || !nota_url || nota_url.length > 8192) {
      return responder({ erro: "Entrada inválida." }, 400);
    }
    // Revalida vínculo ativo, pedido, autorização fiscal e cancelamento EM CADA clique.
    // A URL recebida só seleciona um registro autorizado; não é destino de fetch.
    const notas = await (deps.consultar ?? banco)("POST", "rpc/link_cliente_notas_fiscais", {
      p_numero: numero, p_token: token,
    });
    if (!Array.isArray(notas)) throw new Error("consulta indisponivel");
    const nota = notas.find(n => n && n.url === nota_url);
    if (!nota) return responder({ erro: "Nota indisponível. Atualize o link do pedido." }, 404);

    const env = deps.ambiente ?? (nome => Deno.env.get(nome));
    const base = env("SUPABASE_URL") || "";
    const caminho = caminhoFiscal(nota.url, base);
    if (!caminho) {
      // Compatibilidade com PDF externo estável já devolvido pela RPC.
      const externo = new URL(nota.url);
      if (externo.protocol === "https:" && externo.hostname === "focusnfe.s3.sa-east-1.amazonaws.com" &&
        !externo.port && !externo.username && !externo.password && !externo.search && !externo.hash &&
        externo.pathname.toLowerCase().endsWith(".pdf")) return responder({ url: externo.href });
      return responder({ erro: "Não foi possível renovar o acesso a esta nota." }, 422);
    }
    const chave = env("SUPABASE_SERVICE_ROLE_KEY");
    if (!chave) throw new Error("configuracao indisponivel");
    const resposta = await (deps.buscar ?? fetch)(`${new URL(base).origin}/storage/v1/object/sign/${caminho}`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { apikey: chave, Authorization: `Bearer ${chave}`, "Content-Type": "application/json" },
      body: JSON.stringify({ expiresIn: 60 }),
    });
    if (!resposta.ok) throw new Error("documento indisponivel");
    const assinado = await resposta.json();
    const prefixo = `/object/sign/${caminho}?`;
    if (typeof assinado.signedURL !== "string" || !assinado.signedURL.startsWith(prefixo)) {
      throw new Error("resposta invalida");
    }
    const url = new URL(`${new URL(base).origin}/storage/v1${assinado.signedURL}`);
    if (!url.searchParams.get("token") || url.hash) throw new Error("resposta invalida");
    return responder({ url: url.href });
  } catch (_) {
    // Nunca registra URL, token do pedido ou chave do serviço.
    return responder({ erro: "Não foi possível abrir a nota. Tente novamente." }, 503);
  }
}
