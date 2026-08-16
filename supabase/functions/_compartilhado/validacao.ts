/**
 * As recusas que o FastAPI produz sozinho, reproduzidas ao pe da letra.
 *
 * ## Por que reproduzir a recusa de um framework que estamos deixando
 *
 * Enquanto as duas pilhas conviverem, a MESMA tela pode falar com qualquer uma
 * das duas. Uma recusa com formato diferente e uma tela que quebra de um jeito
 * num endereco e de outro no outro -- e o corte, que deveria ser invisivel,
 * passa a depender de qual endereco o navegador pegou.
 *
 * Nasceu dentro de `acesso-interno/index.ts` na Tarefa 1 e desceu para ca na
 * Tarefa 3, quando `acesso-pedido` e `acesso-estacao` passaram a precisar do
 * mesmo `int` de caminho. Tres copias de um formato de erro divergiriam no dia
 * em que uma delas fosse ajustada.
 */
import { Recusa } from "./sessao.ts";

/**
 * O 422 do FastAPI: `{"detail": [{type, loc, msg, input}]}`.
 *
 * O `detail` e uma LISTA, e nao um texto -- por isso a classe existe separada
 * da `Recusa` comum, que serializa `detail` como string.
 */
export class RecusaDeValidacao extends Recusa {
  constructor(public detalhes: unknown[]) {
    super(422, "");
  }
}

/**
 * Medida contra o Render em 16/08/2026, campo a campo.
 *
 * A `loc` diz de onde veio o valor ruim: `["path", "pedido"]` ou
 * `["query", "limite"]`. E o que permite a tela apontar o campo errado.
 */
export function recusaDeInteiro(
  onde: "path" | "query",
  nome: string,
  valor: unknown,
): never {
  throw new RecusaDeValidacao([{
    type: "int_parsing",
    loc: [onde, nome],
    msg: "Input should be a valid integer, unable to parse string as an integer",
    input: valor,
  }]);
}

/**
 * O `int` de um parametro de caminho ou de busca.
 *
 * O Python aceita o que `int()` aceita: `"18560"` sim, `"18560.0"` nao,
 * `" 18560 "` sim (o `int()` apara espacos). O `Number()` do JavaScript e mais
 * frouxo -- `Number("")` e 0 e `Number("0x10")` e 16 --, entao a conferencia e
 * por regex antes de converter.
 */
export function inteiro(valor: unknown, onde: "path" | "query", nome: string): number {
  const texto = String(valor ?? "").trim();
  if (!/^[+-]?\d+$/.test(texto)) recusaDeInteiro(onde, nome, valor);
  return Number(texto);
}
