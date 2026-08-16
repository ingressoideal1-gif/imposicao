/**
 * As pecas da portaria que nao tocam em rede nem em banco.
 *
 * Moram em arquivo separado por um motivo pratico: o `index.ts` chama
 * `Deno.serve()` no topo, entao IMPORTA-LO liga um servidor. Um teste que
 * quisesse conferir estas duas funcoes teria de pedir permissao de rede e
 * deixar um servidor pendurado -- ou entao o `Deno.serve` teria de ficar atras
 * de um `import.meta.main`, e se o Supabase um dia nao marcar o modulo como
 * principal a funcao subiria sem atender ninguem. Separar custa um arquivo e
 * nao arrisca nada.
 */

/**
 * Comparacao de tempo constante.
 *
 * O Python usa `hmac.compare_digest` no mesmo lugar, e isso NAO e enfeite que
 * se possa trocar por `===` na traducao: o `===` sai no primeiro caractere
 * diferente, e o tempo de resposta passa a contar quantos caracteres do hash o
 * atacante ja acertou. Com dez tentativas por janela o ataque e improvavel, mas
 * a decisao original foi deliberada e nao cabe a um porte revoga-la de graca.
 */
export function iguaisEmTempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferenca = 0;
  for (let i = 0; i < a.length; i++) {
    diferenca |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diferenca === 0;
}

/**
 * A rota pedida, sem o prefixo do Supabase.
 *
 * A funcao e servida em `/functions/v1/portaria/<rota>`, mas o caminho tambem
 * chega como `/portaria/<rota>` dependendo de como se chama. O prefixo sai por
 * regex, e nao contando segmentos: se o Supabase mudar o formato e a conta de
 * segmentos quebrar, TODAS as rotas viram 404 de uma vez e o aparelho para sem
 * dizer por que.
 */
export function rotaPedida(pathname: string): string {
  return pathname.replace(/^.*\/portaria\/?/, "");
}
