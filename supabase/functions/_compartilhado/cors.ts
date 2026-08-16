/**
 * A politica de CORS de todas as Edge Functions deste projeto.
 *
 * Copiada de `security_config.py` (ALLOWED_ORIGINS e ALLOWED_ORIGIN_REGEX) para
 * nao divergir do Python enquanto as duas pilhas convivem.
 *
 * ## Por que isto existe num arquivo compartilhado
 *
 * Nasceu dentro de `portaria/puro.ts` em 16/08/2026, e foi movido para ca na
 * Fase 2b porque passaram a existir cinco funcoes. Recopiar a politica em cada
 * uma daria o pior tipo de divergencia: no dia em que um dominio entrasse na
 * lista, ele entraria em quatro lugares e faltaria no quinto -- e o sintoma
 * seria uma tela que "as vezes nao carrega", numa maquina so, sem erro visivel
 * no servidor.
 *
 * ## Por que isto precisou existir
 *
 * O Render responde o preflight sozinho, via `CORSMiddleware` do FastAPI. A
 * primeira Edge Function nao respondia nada, e o OPTIONS caia no 404 de rota
 * desconhecida. Como as paginas vem da Vercel e chamam `supabase.co`, TODA
 * requisicao delas e cross-origin; qualquer chamada com Authorization obriga o
 * navegador a mandar o preflight ANTES. Sem resposta, a chamada de verdade
 * nunca sai.
 *
 * Nenhum teste de servidor pega isto: `urllib` e `curl` nao fazem preflight nem
 * conferem cabecalho de origem. So o navegador.
 */

const ORIGENS_PERMITIDAS = [
  "https://ideal-imposition.vercel.app",
  "https://imposicao.vercel.app",
  "https://imposicao.onrender.com",
];

/**
 * ANCORADA de proposito. O Starlette casa `allow_origin_regex` com `fullmatch`;
 * um `test()` do JavaScript casa PEDACO, e sem as ancoras
 * `https://ideal-imposition.vercel.app.exemplo.com` passaria -- um dominio que
 * qualquer um registra, lendo a carga inteira do evento.
 */
const ORIGEM_PERMITIDA = new RegExp(
  "^(https://(ideal-imposition|imposicao)(-[a-z0-9-]+)?\\.vercel\\.app" +
    "|http://(localhost|127\\.0\\.0\\.1)(:\\d+)?)$",
);

/** A origem a devolver no `Access-Control-Allow-Origin`, ou null para recusar. */
export function origemPermitida(origem: string | null): string | null {
  if (!origem) return null;
  if (ORIGENS_PERMITIDAS.includes(origem)) return origem;
  return ORIGEM_PERMITIDA.test(origem) ? origem : null;
}

/**
 * Envelopa uma resposta pronta com os cabecalhos de CORS.
 *
 * Aplicar na SAIDA, num lugar so, e nao dentro de cada `ok()`/`erro()`: as
 * recusas sao lancadas de dentro das funcoes de autenticacao, e elas teriam de
 * carregar a origem junto so para isso. Envelopar cobre os tres caminhos
 * (sucesso, recusa lancada e defeito nosso) sem que nenhum precise saber que
 * CORS existe.
 *
 * Origem que nao passa na politica nao recebe o cabecalho, e o navegador
 * bloqueia -- mesmo comportamento do `CORSMiddleware` do FastAPI.
 */
export function comCors(resposta: Response, origem: string | null): Response {
  if (!origem) return resposta;
  const cabecalhos = new Headers(resposta.headers);
  cabecalhos.set("Access-Control-Allow-Origin", origem);
  // Sem `Vary: Origin`, um intermediario que guardasse a resposta de uma origem
  // poderia servi-la a outra com o cabecalho errado colado.
  cabecalhos.append("Vary", "Origin");
  return new Response(resposta.body, {
    status: resposta.status,
    statusText: resposta.statusText,
    headers: cabecalhos,
  });
}

/**
 * A resposta do preflight.
 *
 * `metodos` varia por funcao: a portaria so usa GET e POST, a tela do cliente
 * usa PATCH e DELETE tambem. Declarar exatamente o que cada uma aceita custa
 * nada e evita anunciar porta que nao existe.
 *
 * Responder ANTES do roteamento e o certo: o preflight nao e uma rota, e
 * trata-lo como rota da 404 -- que foi o defeito de 16/08/2026.
 *
 * ## `cabecalhos`, e por que ele nao pode ficar so no padrao
 *
 * O navegador manda no preflight a lista de cabecalhos que PRETENDE usar, e
 * bloqueia a requisicao de verdade se a resposta nao os autorizar TODOS. A tela
 * do dono manda `X-Elevacao` e `X-Navegador` em toda escrita
 * (`frontend/controle.js`); com a lista fixa em `authorization,content-type`,
 * cada uma dessas chamadas morreria no navegador -- sem chegar ao servidor,
 * portanto sem log e sem erro do nosso lado.
 *
 * Nenhum teste de servidor pega isto: `urllib` e `curl` nao fazem preflight. So
 * o navegador, e so depois do corte.
 */
export function respostaDePreflight(
  origem: string | null,
  metodos = "GET, POST, OPTIONS",
  cabecalhos = "authorization,content-type",
): Response {
  return comCors(
    new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Methods": metodos,
        "Access-Control-Allow-Headers": cabecalhos,
        "Access-Control-Max-Age": "600",
      },
    }),
    origem,
  );
}
