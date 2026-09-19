import { banco } from "../_compartilhado/banco.ts";
import { comCors, origemPermitida, respostaDePreflight } from "../_compartilhado/cors.ts";
import { cnpjValido, consultarCnpj, consultarNomeCpf, cpfValido, ErroConsulta, somenteDigitos } from "./puro.ts";

const JSON_HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function resposta(corpo: unknown, status: number, origem: string | null): Response {
  return comCors(new Response(JSON.stringify(corpo), { status, headers: JSON_HEADERS }), origem);
}

async function hashDocumento(documento: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(documento));
  return Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req: Request) => {
  const origem = origemPermitida(req.headers.get("origin"));
  if (req.method === "OPTIONS") return respostaDePreflight(origem, "POST, OPTIONS");
  try {
    if (req.method !== "POST") throw new ErroConsulta(405, "metodo nao permitido");
    const entrada = await req.json().catch(() => null);
    const numero = String(entrada?.numero ?? "").trim();
    const token = String(entrada?.token ?? "").trim();
    const documento = somenteDigitos(entrada?.documento);
    // Os links historicos do portal usam tokens de 12 caracteres. A prova de
    // validade e a comparacao exata numero+token feita pela RPC; aqui basta
    // recusar valor vazio ou excessivo antes de chegar ao banco.
    if (!/^[1-9]\d*$/.test(numero) || !token || token.length > 200 ||
      (!cpfValido(documento) && !cnpjValido(documento))) {
      throw new ErroConsulta(400, "dados invalidos");
    }
    const limite = await banco("POST", "rpc/link_cliente_registrar_consulta_documento", {
      p_numero: numero,
      p_token: token,
      p_documento_hash: await hashDocumento(documento),
    });
    if (!limite?.ok) throw new ErroConsulta(429, "limite de consultas atingido");
    if (documento.length === 14) {
      const empresa = await consultarCnpj(documento);
      return resposta({ ok: true, tipo: "cnpj", ...empresa }, 200, origem);
    }
    const segredo = Deno.env.get("CPFHUB_TOKEN") ||
      await banco("POST", "rpc/portal_segredo_cpfhub", {});
    const consultado = await consultarNomeCpf(documento, typeof segredo === "string" ? segredo : "");
    // A API tambem devolve nascimento e genero; o portal nao precisa deles e
    // por isso eles nao atravessam esta fronteira.
    return resposta({ ok: true, tipo: "cpf", cpf: consultado.cpf, nome: consultado.nome }, 200, origem);
  } catch (e) {
    if (e instanceof ErroConsulta) return resposta({ ok: false, erro: e.message }, e.status, origem);
    console.error("[consulta-documento-entrega] falha sem dados pessoais", e instanceof Error ? e.message : e);
    return resposta({ ok: false, erro: "erro interno" }, 500, origem);
  }
});
