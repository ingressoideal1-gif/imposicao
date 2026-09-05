/**
 * As pecas da tela interna que nao tocam em rede nem em banco.
 *
 * Moram em arquivo separado pelo mesmo motivo da portaria: o `index.ts` chama
 * `Deno.serve()` no topo, entao IMPORTA-LO liga um servidor, e um teste destas
 * funcoes teria de pedir permissao de rede e deixar um servidor pendurado.
 *
 * O que sobrou aqui e o que so esta tela usa. O resto -- as contas do relatorio
 * e a paginacao -- mudou para `_compartilhado/relatorio_puro.ts` em 04/09/2026,
 * quando o dono do evento passou a ver os mesmos numeros no aplicativo dele.
 * Os reexports abaixo mantem os testes deste modulo apontando para onde foram
 * escritos.
 */

/**
 * O caminho depois do nome da funcao, em pedacos.
 *
 * A funcao e servida em `/functions/v1/acesso-interno/<...>`, e o caminho
 * tambem chega como `/acesso-interno/<...>` dependendo de como se chama. O
 * prefixo sai por regex, e nao contando segmentos: se o Supabase mudar o
 * formato e a conta de segmentos quebrar, TODAS as rotas viram 404 de uma vez e
 * a tela para sem dizer por que.
 */
export function pedacosDaRota(pathname: string): string[] {
  return pathname
    .replace(/^.*\/acesso-interno\/?/, "")
    .split("/")
    .filter((p) => p !== "")
    .map(decodeURIComponent);
}

/**
 * Mudou de casa na Fase 2b: as duas telas precisam da mesma regra, entao ela
 * vive em `_compartilhado/modelos.ts`. O reexport mantem os testes deste
 * modulo apontando para onde foram escritos.
 */
export { idDeNumeracao, numeracaoDoModelo } from "../_compartilhado/modelos.ts";

/**
 * As contas do relatorio, compartilhadas com a tela do dono desde 04/09/2026.
 * Ver o cabecalho de `_compartilhado/relatorio_puro.ts`.
 */
export {
  horaCheia,
  MOTIVOS,
  numeroDaPagina,
  POR_PAGINA_MAXIMO,
  POR_PAGINA_PADRAO,
  situacao,
  tamanhoDaPagina,
  termoSeguro,
} from "../_compartilhado/relatorio_puro.ts";

/**
 * O QR de instalacao aponta para ca. Um so, generico, sem nada dentro: quem o
 * le instala o aplicativo e entra com a conta que a grafica liberou. E o
 * dominio publico e nao o da estacao, porque o painel da grafica roda nos
 * dois e o QR vai para o celular do cliente.
 */
export const URL_DE_INSTALACAO = "https://ideal-imposition.vercel.app/ic/";
