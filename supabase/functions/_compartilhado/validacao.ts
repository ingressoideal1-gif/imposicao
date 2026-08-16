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

/**
 * A recusa de rota que nao existe -- e ela depende do METODO, nao do caminho.
 *
 * ## O que foi medido, em 16/08/2026, contra o Render
 *
 *     GET    /api/acesso/pedidos/1/qr          404 {"detail":"Not Found"}
 *     PUT    /api/acesso/pedidos/1/qr          405 {"detail":"Method Not Allowed"}
 *     GET    /api/acesso/pedidos/1/nada-disso  404 {"detail":"Not Found"}
 *     POST   /api/acesso/pedidos/1/nada-disso  405 {"detail":"Method Not Allowed"}
 *     PATCH  /api/acesso/pedidos/1/nada-disso  405
 *     DELETE /api/acesso/pedidos/1/nada-disso  405
 *
 * Repare na primeira linha: o caminho EXISTE, so que para POST, e mesmo assim a
 * resposta e 404. E na quarta: o caminho nao existe para metodo nenhum, e a
 * resposta e 405. Nao ha regra "caminho conhecido da 405" -- ha uma regra de
 * metodo, e ela vem de como o `app.py` esta montado.
 *
 * O `app.py` serve o painel inteiro por um apanhador de arquivos estaticos, que
 * casa QUALQUER caminho em GET. O Starlette percorre as rotas guardando a
 * primeira que casa o caminho mas nao o metodo (que viraria 405) e segue
 * procurando uma que case os dois. Em GET, o apanhador sempre casa por inteiro e
 * responde o 404 dele -- o 405 guardado nunca chega a ser usado. Em qualquer
 * outro metodo nada casa por inteiro, e o 405 do apanhador e o que sobra.
 *
 * Adivinhar isto pela leitura do FastAPI daria o contrario, e foi o que este
 * porte fez antes de medir. Quem descobriu foram os testes de paridade.
 */
export function recusaDeRotaDesconhecida(metodo: string): never {
  if (metodo === "GET" || metodo === "HEAD") throw new Recusa(404, "Not Found");
  throw new Recusa(405, "Method Not Allowed");
}
