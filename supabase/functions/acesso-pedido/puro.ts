/**
 * As pecas do QR do Pedido que nao tocam em rede nem em banco.
 *
 * Arquivo separado pelo mesmo motivo das outras funcoes: o `index.ts` chama
 * `Deno.serve()` no topo, entao importa-lo liga um servidor.
 */

/**
 * O caminho depois do nome da funcao, em pedacos.
 *
 * ## Os dois prefixos, e por que os dois sao aceitos
 *
 * O painel da grafica monta `${API_BASE_URL}/api/acesso/pedidos/{p}/qr`. Quando
 * o corte acontecer, `API_BASE_URL` passa a apontar para esta funcao, e o
 * caminho que chega e `/functions/v1/acesso-pedido/api/acesso/pedidos/{p}/qr` --
 * com o `/api/acesso/` no meio.
 *
 * Aceitar esse pedaco extra e o que torna o corte uma troca de ENDERECO, e nao
 * uma reescrita de como a tela monta a URL. E a volta atras, no dia em que
 * precisar, e trocar o endereco de novo.
 *
 * O prefixo sai por regex, e nao contando segmentos: se o Supabase mudar o
 * formato e a conta de segmentos quebrar, a rota vira 404 e a tela para sem
 * dizer por que.
 */
export function pedacosDaRota(pathname: string): string[] {
  return pathname
    .replace(/^.*\/acesso-pedido\/?/, "")
    .replace(/^api\/acesso\/?/, "")
    .split("/")
    .filter((p) => p !== "")
    .map(decodeURIComponent);
}

/**
 * O endereco do painel do cliente. Porte de `_url_do_evento`.
 *
 * O padrao e LITERAL, copiado de `security_config.PAINEL_BASE_URL`, pela mesma
 * razao que o Python o mantem versionado: vindo de fora, quem controlasse o
 * ambiente controlaria para onde o QR do cliente aponta -- e o QR viaja por
 * WhatsApp, longe de qualquer conferencia nossa.
 *
 * `ideal-imposition`, e nao `imposicao`, desde 17/08/2026. O site atende pelos
 * DOIS enderecos, mas o aplicativo INSTALAVEL mora no primeiro: e dele que o
 * cliente instala o Ideal Control, e e a origem onde ficam o chaveiro dos
 * portoes e o service worker.
 *
 * Cunhado com `imposicao`, quem TOCAVA no link no WhatsApp -- em vez de le-lo
 * pela camera do aplicativo -- caia no outro endereco numa aba de navegador:
 * outra origem, outro `localStorage`, e o celular ainda oferecia instalar uma
 * SEGUNDA copia do aplicativo, cada uma com os seus portoes.
 *
 * QR ja emitido continua valendo: o endereco antigo segue servindo o site, e o
 * `ler-qr.js` aceita as duas origens.
 */
export const PAINEL_PADRAO = "https://ideal-imposition.vercel.app";

export function urlDoEvento(base: string | null | undefined, token: string): string {
  const raiz = (base || PAINEL_PADRAO).replace(/\/+$/, "");
  // `/ic/` e o prefixo do aplicativo instalavel -- ele existe para dar ESCOPO
  // as telas do cliente e do portao. QR emitido antes desta mudanca continua
  // valendo: `/evento.html` redireciona para ca, com a querystring intacta.
  return `${raiz}/ic/evento.html?t=${token}`;
}
