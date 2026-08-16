/**
 * O MESMO hash do `qr_ideal.py` e do `frontend/qr-ideal-hash.js`.
 *
 * A nuvem nunca guarda o codigo do QR Ideal -- guarda o hash dele. O celular da
 * portaria confere calculando o hash do que leu e procurando na faixa que
 * baixou, montada pelo agente em Python.
 *
 * Se esta funcao divergir das outras duas em qualquer detalhe, TODO ingresso do
 * evento e recusado na portaria. Nao ha como perceber antes: nao aparece no
 * papel, nao aparece no banco, nao aparece testando o app. So aparece com a
 * fila na porta e o lote ja entregue.
 *
 * ## Por que existe uma TERCEIRA copia da regra
 *
 * O caminho obvio seria a Edge Function importar o `frontend/qr-ideal-hash.js`,
 * que ja existe e ja e testado. Nao da: aquele arquivo e carregado como script
 * CLASSICO na `frontend/portaria.html` e esta na lista de cache do
 * `frontend/sw.js`. Acrescentar um `export` no topo o transformaria em modulo
 * ES, e um `<script src>` classico apontando para um modulo falha com erro de
 * sintaxe -- a tela da portaria deixaria de carregar por completo.
 *
 * Entao sao tres: Python na estacao (que publica), JavaScript no celular (que
 * confere) e esta, em Deno (que serve a faixa). Tres copias soltas seriam a
 * receita do defeito mais caro deste sistema; o que as torna seguras e o
 * `tests/test_qr_ideal_hash.py`, que roda as tres e compara contra um valor
 * congelado.
 *
 * Mexeu aqui, roda aquele teste. Mexeu la, roda aquele teste.
 */

// Tem de ser igual a `qr_ideal.ITERACOES` e ao ITERACOES do
// `frontend/qr-ideal-hash.js`. Mudar so de um lado quebra tudo em silencio;
// mudar dos tres invalida todo hash ja publicado.
export const ITERACOES = 10000;

/**
 * O tipo de retorno e o `ArrayBuffer` explicito no construtor NAO sao zelo:
 * sem eles o `deno check` recusa o arquivo.
 *
 * No TypeScript novo o `Uint8Array` e generico sobre o buffer e assume
 * `ArrayBufferLike`, que inclui `SharedArrayBuffer`. O `BufferSource` que o
 * `crypto.subtle` espera exige `ArrayBuffer` de verdade. `new Uint8Array(n)`
 * produz a forma larga e o tipo nao encaixa; `new Uint8Array(new ArrayBuffer(n))`
 * produz a estreita e encaixa.
 *
 * Em tempo de execucao os dois sao a mesma coisa -- o teste passava mesmo com o
 * `deno check` falhando. Mas o deploy de Edge Function faz type check, entao o
 * arquivo simplesmente nao subiria.
 */
function hexParaBytes(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(new ArrayBuffer(hex.length / 2));
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

function bytesParaHex(buffer: ArrayBuffer): string {
  const b = new Uint8Array(buffer);
  let s = "";
  for (let i = 0; i < b.length; i++) {
    s += b[i].toString(16).padStart(2, "0");
  }
  return s;
}

/**
 * @param conteudo O texto INTEIRO do QR: prefixo do pedido mais os 8 caracteres
 *                 do pool. Nao so o codigo.
 * @param sal      64 caracteres hexadecimais.
 * @returns        64 caracteres hexadecimais.
 */
export async function hashCodigo(conteudo: string, sal: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(conteudo),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      // Os BYTES do hexadecimal, nunca o texto dele. E a armadilha desta
      // funcao: passar `sal` cru aqui produz um hash plausivel, diferente do
      // Python, e o erro so apareceria na portaria.
      salt: hexParaBytes(sal),
      iterations: ITERACOES,
      hash: "SHA-256",
    },
    chave,
    256,
  );
  return bytesParaHex(bits);
}
