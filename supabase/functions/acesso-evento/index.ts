/**
 * `/evento?t=<token>` -- a UNICA rota do controle de acesso sem login.
 *
 * ## Por que ela mora sozinha, numa funcao propria
 *
 * O cliente abre esta rota lendo o QR com a camera, ANTES de ter conta. Ela
 * precisa de `verify_jwt = false`, senao o portao do Supabase a recusa com 401
 * antes de o codigo rodar.
 *
 * E `verify_jwt` e por FUNCAO, nao por rota. Se ela morasse junto com o resto da
 * tela do cliente, desligar a verificacao por causa dela desligaria para todas
 * -- e o `sub` das claims, que `_compartilhado/sessao.ts` le sem conferir
 * assinatura, viraria um campo que qualquer um escreve. Um estranho montaria um
 * JWT com o `sub` do dono e configuraria o evento dele.
 *
 * Separar custa uma funcao e resolve isso na raiz: aqui nao ha `sub` nenhum a
 * confiar. O que protege esta rota e a ASSINATURA do proprio token do QR, que o
 * `_compartilhado/assinatura.ts` confere, mais a conferencia de revogacao
 * contra o banco.
 */
import { banco } from "../_compartilhado/banco.ts";
import { comCors, origemPermitida, respostaDePreflight } from "../_compartilhado/cors.ts";
import { Recusa } from "../_compartilhado/sessao.ts";
import { numeracaoDoModelo } from "../_compartilhado/modelos.ts";
import { conferirQrPedido, SEGREDO_QR_PEDIDO } from "../_compartilhado/assinatura.ts";
import { recusaHumana } from "../acesso-conta/puro.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };

function precisaDoSegredo(nome: string): void {
  if (!Deno.env.get(nome)) {
    throw new Recusa(503, `${nome} nao configurada neste servidor`);
  }
}

// ── O QR do Pedido ──────────────────────────────────────────────────────────

async function modelosLegiveis(pedidoIdInt: number): Promise<any[]> {
  const modelos = (await banco(
    "GET",
    `pedidos_modelos?id_int=eq.${pedidoIdInt}` +
      "&select=id,nome_modelo,quantidade,amostra_num_id&order=ordem.asc",
  )) ?? [];

  const ids = [...new Set(
    modelos.filter((m: any) => m.amostra_num_id).map((m: any) => String(m.amostra_num_id)),
  )].sort();
  const numeracoes: Record<string, unknown> = {};
  if (ids.length) {
    const lista = ids.map((i) => `"${i}"`).join(",");
    for (
      const n of (await banco(
        "GET",
        `producao_numeracoes?id=in.(${lista})&select=id,elements`,
      )) ?? []
    ) {
      numeracoes[String(n.id)] = n.elements;
    }
  }

  return modelos
    .filter((m: any) => numeracaoDoModelo(numeracoes[String(m.amostra_num_id)]))
    .map((m: any) => ({
      modelo_id: Number(m.id),
      nome: String(m.nome_modelo ?? `Modelo ${m.id}`).trim(),
      quantidade: Number(m.quantidade ?? 0),
    }));
}

async function sha256Hex(texto: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function esqueleto(token: string): Promise<any> {
  precisaDoSegredo(SEGREDO_QR_PEDIDO);

  let pedido: number;
  try {
    pedido = await conferirQrPedido(token);
  } catch (e) {
    throw new Recusa(401, recusaHumana(e instanceof Error ? e.message : ""));
  }

  const linha = ((await banco(
    "GET",
    `producao_acesso_pedidos?pedido_id_int=eq.${pedido}&select=*`,
  )) ?? [])[0];
  if (!linha) throw new Recusa(404, "pedido sem QR gerado");

  if (linha.qr_revogado_em) {
    throw new Recusa(403, "este QR foi cancelado; peca um novo a quem o enviou");
  }

  // Gerar um QR novo troca o hash guardado. O anterior continua assinado e
  // valido para sempre -- e e exatamente por isso que a comparacao existe.
  if ((linha.qr_token_hash ?? "") !== await sha256Hex(token)) {
    throw new Recusa(403, "este QR foi substituido por outro; use o mais recente");
  }

  const setores = await modelosLegiveis(pedido);
  const proposta = ((await banco(
    "GET",
    `propostas?id_int=eq.${pedido}&select=id_cliente`,
  )) ?? [])[0];

  return {
    pedido,
    id_cliente: proposta?.id_cliente ?? null,
    ja_reivindicado: Boolean(linha.evento_id),
    evento_id: linha.evento_id ?? null,
    setores,
    total: setores.reduce((s: number, x: any) => s + x.quantidade, 0),
  };
}


Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const origem = origemPermitida(req.headers.get("origin"));

  if (req.method === "OPTIONS") return respostaDePreflight(origem, "GET, OPTIONS");

  try {
    if (req.method !== "GET") throw new Recusa(405, "Method Not Allowed");
    const corpo = await esqueleto(url.searchParams.get("t") ?? "");
    return comCors(
      new Response(JSON.stringify(corpo), { headers: JSON_HEADERS }),
      origem,
    );
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
    console.error("[acesso-evento]", e);
    return comCors(
      new Response(JSON.stringify({ detail: "erro interno" }), {
        status: 500,
        headers: JSON_HEADERS,
      }),
      origem,
    );
  }
});
