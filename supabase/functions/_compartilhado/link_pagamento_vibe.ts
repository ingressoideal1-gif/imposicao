import { banco } from "./banco.ts";

export type DependenciasPagamento = {
  consultar?: typeof banco;
  ambiente?: (nome: string) => string | undefined;
  buscar?: typeof fetch;
  registrar?: (codigo: string) => void;
};

export function urlPagamentoValida(url: unknown, numero: string): url is string {
  return typeof url === "string" && url.length <= 2048 &&
    /^[1-9][0-9]{0,14}$/.test(numero) &&
    new RegExp(`^https://vibe[.]ai-ideal[.]com[.]br/p/${numero}-[A-Za-z0-9_-]+$`).test(url);
}

/** Falha opcional: nunca propaga erros, corpos, chave ou URLs para logs. */
export async function obterLinkPagamentoVibe(numero: string, token: string, deps: DependenciasPagamento = {}): Promise<string | null> {
  const consultar = deps.consultar || banco;
  const registrar = deps.registrar || ((codigo: string) => console.info(JSON.stringify({ evento: "link_pagamento_vibe", codigo })));
  if (!/^[1-9][0-9]{0,14}$/.test(numero) || !token || token.length < 6 || token.length > 200) return null;
  try {
    const estado = await consultar("POST", "rpc/reservar_link_pagamento_vibe", { p_numero: numero, p_token: token });
    if (urlPagamentoValida(estado?.url, numero)) return estado.url;
    if (!estado?.reserva) return null;
    let url: string | null = null;
    let codigo = "SEM_CHAVE";
    const chave = (deps.ambiente || ((nome) => Deno.env.get(nome)))("VIBE_LINK_PGTO_KEY");
    if (chave) {
      const controle = new AbortController();
      const timer = setTimeout(() => controle.abort(), 5000);
      try {
        const resposta = await (deps.buscar || fetch)(`https://vibe.ai-ideal.com.br/api/v1/parceiro/link-pagamento/${numero}`, {
          method: "GET", headers: { "x-api-key": chave }, signal: controle.signal, redirect: "error",
        });
        codigo = String(resposta.status);
        if (resposta.status === 200) {
          const dados = await resposta.json();
          if (String(dados?.id_int) === numero && urlPagamentoValida(dados?.url, numero)) url = dados.url;
          else codigo = "RESPOSTA_INVALIDA";
        } else {
          await resposta.body?.cancel();
        }
      } catch {
        codigo = controle.signal.aborted ? "TIMEOUT" : "FALHA_API";
      } finally { clearTimeout(timer); }
    }
    if (codigo !== "200") registrar(codigo);
    const salvo = await consultar("POST", "rpc/concluir_link_pagamento_vibe", {
      p_numero: numero, p_reserva: estado.reserva, p_url: url, p_codigo: codigo,
    });
    if (!salvo || salvo.codigo !== codigo || salvo.url !== url) throw new Error("persistencia");
    if (!url) return null;
    // Confirma persistência antes de usar o endereço no e-mail ou no portal.
    const linhas = await consultar("GET", `pedidos_links_pagamento_vibe?numero_pedido=eq.${numero}&select=url&limit=2`);
    if (!Array.isArray(linhas) || linhas.length !== 1 || linhas[0].url !== url) throw new Error("releitura");
    return url;
  } catch {
    registrar("FALHA_CACHE");
    return null;
  }
}
