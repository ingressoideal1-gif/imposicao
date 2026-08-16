/**
 * A allowlist do proxy, e o roteamento. Sem rede, para poder ser testada.
 *
 * Porte de `security_config.is_allowed_proxy_url`. Um proxy sem allowlist e um
 * SSRF: alcanca a rede interna de quem o hospeda e, no agente, a LAN da
 * grafica. Por isso a lista e por SUFIXO DE HOST, e nao por "contem" -- basta
 * um `includes("supabase.co")` para `https://supabase.co.exemplo.com` passar, e
 * esse dominio qualquer um registra.
 */

/** Hosts do Supabase. Sufixo com ponto na frente, de proposito. */
export const SUFIXOS_PERMITIDOS = [".supabase.co", ".supabase.in"];

/**
 * Legado do Firebase: tres numeracoes antigas ainda apontam
 * `elements[].pdf_content` para o bucket da conta anterior, e os PDFs seguem
 * online. Liberado o BUCKET, e nao o host inteiro -- `firebasestorage.
 * googleapis.com` hospeda o mundo.
 */
export const PREFIXOS_LEGADOS = [
  "https://firebasestorage.googleapis.com/v0/b/ideal-arte-e64f6.firebasestorage.app/",
];

export function enderecoPermitido(endereco: string): boolean {
  let url: URL;
  try {
    url = new URL(endereco ?? "");
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return false;

  const host = url.hostname.toLowerCase();
  if (SUFIXOS_PERMITIDOS.some((s) => host.endsWith(s))) return true;

  const minusculo = (endereco ?? "").toLowerCase();
  return PREFIXOS_LEGADOS.some((p) => minusculo.startsWith(p.toLowerCase()));
}

/** O caminho depois do nome da funcao, aceitando o `api/` do Render. */
export function pedacosDaRota(pathname: string): string[] {
  const p = pathname.split("/").filter(Boolean);
  const i = p.indexOf("arquivo");
  const resto = i >= 0 ? p.slice(i + 1) : p;
  return resto[0] === "api" ? resto.slice(1) : resto;
}
