# Conferência do pedido 21202 — 29/08/2026

Investigação feita a pedido do usuário, que perguntou por que um modelo mostrava
dois números diferentes de folhas, e depois delimitou o trabalho:
**"verificar 'sem alterar' banco deste pedido, apenas analizar, não alterar"**.

Nenhuma linha do banco foi escrita.

O 21202 é o maior pedido real do sistema: **51 modelos**, bancos de numeração de
150 a 14.000 linhas, um evento de vários dias.

> ## ⚠️ Leia isto antes de usar este documento
>
> A primeira versão desta conferência **acusou uma divergência que não existia**.
> Eu escrevi que o modelo 1000565 tinha 3.000 unidades contratadas contra 12.806
> linhas no banco, e que imprimi-lo produziria 12.806 peças. O usuário respondeu
> com a tela: *"o 1000565 mostra 300 folhas e já foi impresso corretamente"*.
>
> Ele estava certo. A causa do meu erro está na seção 2, e vale mais do que o
> resultado: **contar linha crua do banco não responde à pergunta que o produto
> faz.** Refeita a conferência com a regra real, os **51 modelos batem**.

---

## 1. Por que o mesmo modelo mostrava 70 e depois 192 folhas

> Pergunta do usuário: *"pq no pedido 21202 modelo 1000589 quando selecionado
> hora mostra gerar 70 páginas hora mostra gerar 192 páginas?"*

### A causa

A `drawPedPreview()` conta os itens de duas maneiras, e **muda de uma para a
outra no meio do carregamento** ([`frontend/pedido.js:836`](../frontend/pedido.js#L836)):

```js
let raw_items = Math.max(1, end - start + 1);   // pela faixa numérica do modelo
if (state.csvData) {
    raw_items = state.csvData.length;           // pelo banco, assim que ele desce
}
```

| Momento | De onde vem a conta | No modelo 1000589 |
|---|---|---|
| Logo ao clicar, banco ainda não desceu | faixa numérica (N. inicial → N. final) | 1.920 ÷ 10 = **192 folhas** |
| Segundos depois, com o banco carregado | linhas do banco | 700 ÷ 10 = **70 folhas** |

**Não é defeito de código.** A regra está certa: o banco manda, porque é ele que
vira papel. O número oscilando denuncia que a faixa contratada e o banco ligado
não falavam da mesma quantidade.

Naquele momento o 1000589 apontava para **"STAFF RECINTO 12"**, de 700 linhas,
que pertence a outros dois modelos. **O dado foi corrigido no ERP entre a minha
primeira e a segunda consulta**: hoje ele aponta para **"CAMAROTE PATROCINADORES
11"**, com exatamente **1.920** linhas. As duas contas passaram a dar o mesmo
resultado, e o número parou de oscilar.

**Como reconhecer isso na tela:** número de folhas que muda sozinho segundos
depois de abrir o modelo. Ver a seção 4.

---

## 2. O erro da primeira conferência — e a regra que ele ensina

Minha consulta contava `jsonb_array_length(csv_data)` — o banco **cru** — e
comparava com `pedidos_modelos.quantidade`.

**O produto não usa esse número.** O `fatiaCsvDoItem`
([`frontend/script.js:16118`](../frontend/script.js#L16118)) aplica **dois
cortes** antes de decidir o que o modelo imprime:

1. **o recorte do modelo** (`csv_selecao`), quando existe — a distribuição de um
   banco entre vários modelos;
2. **`linhasComDadoDaNumeracao`** — linha sem dado em nenhuma das colunas que
   *aquela* numeração lê **não é célula daquele modelo**, nem para contar nem
   para imprimir.

O segundo corte é o que eu ignorei. A numeração "CAMAROTE PRESIDENTE" é um
**banco-mestre** de 12.806 linhas, e o elemento dela lê uma coluna só, `Codigo`,
que está preenchida em exatamente **3.000** delas. O modelo imprime 3.000, a tela
mostra 300 folhas, e foi isso que saiu no papel.

> **A regra que fica:** antes de afirmar que o banco diverge do pedido, a consulta
> tem de **reproduzir a regra que o código aplica**, e não uma aproximação dela.
> Ler as colunas da numeração (`elements` com `source = 'database'`, campo
> `csv_column`), contar só as linhas com dado em alguma delas, e respeitar
> `__ativo` e `csv_selecao`.
>
> E quando o que a tela mostra discorda do que eu li no banco, **o errado é o meu
> SQL** — a tela roda a regra de verdade.

Alarme falso em conferência é pior do que conferência nenhuma: ensina o operador
a ignorar o aviso, e aí ele não serve no dia em que houver divergência real. Esse
raciocínio já estava escrito no código, no comentário de
`colunasDeIdentificacaoDaNumeracao`, sobre por que o aviso de repetidos não soma
todas as colunas.

---

## 3. O resultado, com a regra certa

Consulta em [`sql/consultas/conferir_contratado_x_banco.sql`](../sql/consultas/conferir_contratado_x_banco.sql).

> **Nota de 01/09/2026:** essa consulta foi reescrita para cobrir também o banco
> que mora no PEDIDO (`pedidos_bancos` + `csv_mapa`), porque na forma antiga ela
> devolvia *zero linhas* nos pedidos do desenho novo — silêncio que se lê como
> "tudo certo". O resultado do 21202 não mudou; ver
> [`conferencia_pedido_21460.md`](conferencia_pedido_21460.md), seção 5.

**Os 51 modelos batem: `contratada = imprime`, `falta = 0` em todos.**

Um único modelo tem banco maior do que imprime, e é legítimo:

| Modelo | Contratada | Linhas brutas | Colunas lidas | Imprime |
|---|---|---|---|---|
| **1000565** — 05/set CAMAROTE PRESIDENTE | 3.000 | **12.806** | `Codigo` | **3.000** ✅ |

Os outros três dias do CAMAROTE PRESIDENTE (1000579, 1000591, 1000603) e os
extras (1000612) têm cada um a sua própria numeração, com 3.000 e 800 linhas.

Vale notar como leitura de tela: `linhas_brutas` muito maior que `imprime` **não
é problema** — é banco-mestre servindo a um modelo. O que seria problema é
`falta` diferente de zero.

### ⚠️ O `gabarito_operacional` não serve para conferência

O campo, que vem do ERP, diverge da numeração ligada em casos onde a numeração
está **certa**:

| Modelo | Nome do modelo | `gabarito_operacional` | Numeração ligada |
|---|---|---|---|
| 1000602 | 12/set BACKSTAGE EXPERIENCE | `Backstage 11` | `Backstage 12` ✅ |
| 1000597 | 11/set STAFF VIVA + | `STAFF VIVA` (sem dia) | `STAFF VIVA 11` ✅ |
| 1000604 | 12/set CAMAROTE VIVA + | `CAMAROTE VIVA` (sem dia) | `CAMAROTE VIVA 12` ✅ |

**Não use esse campo para conferir dia ou peça** — ele produz alarme falso. A
fonte confiável é o par *nome do modelo* × *nome da numeração ligada*
(`amostra_num_id`). Por isso ele saiu do critério da consulta e ficou só como
coluna informativa.

---

## 4. A verificação já existe — mas não na tela onde se imprime

A função **`divergenciaDeCelulasDoModelo`**
([`frontend/script.js:18121`](../frontend/script.js#L18121)) compara a quantidade
contratada com as células que o modelo de fato gera — e ela **usa a regra certa**,
via `celulasGeradasDoModelo`. Está ligada em quatro lugares, todos na tela de
**Amostras**:

| Onde | O que faz |
|---|---|
| `renderAmostrasOSItens` | mostra a divergência no card de cada modelo |
| `decisionAmostraItem` | **bloqueia a aprovação** do modelo |
| `promoverPedidoSeTodosProntos` | bloqueia a promoção do pedido |
| `conferenciaDeDadosDoPedido` | entra no relatório do botão **🔎 Conferência de dados** |

Ou seja: **o produto já sabia que o 1000565 estava certo.** Quem estava errado
era o meu SQL, que rodava por fora dessa função.

O que **não** existe é a mesma conta na **tela do Pedido**, que é onde o operador
manda imprimir. Lá o selo diz *"300 folha(s) · 3.000 itens · a folha fecha certo"*
e nunca compara com o contratado — nem avisa quando o número muda sozinho ao
banco descer, que foi o sintoma da seção 1. Trazer a verificação para esse selo
foi oferecido ao usuário e **ainda não foi decidido**.

> Nota de custo, para quem for fazer: a função só varre o banco quando a tiragem
> ficou **curta** (`diferenca < 0`), de propósito, porque roda a cada redesenho de
> card e uma varredura extra num banco de 19 mil linhas se sente na tela. Numa
> tela que redesenha 52 linhas a cada clique, esse cuidado é obrigatório.

---

## 5. Notas de esquema aprendidas nesta conferência

Erros que custaram consultas refeitas, anotados para a próxima vez:

- `pedidos_modelos` e `producao_numeracoes` guardam o id em tipos diferentes;
  o join precisa de `::text` dos dois lados
  (`n.id::text = pm.amostra_num_id::text`).
- Em `pedidos_modelos` as colunas são **`nome_modelo`**, **`quantidade`**,
  **`amostra_num_id`**, **`numeracao_inicio`/`numeracao_fim`**. Não existem
  `modelo`, `qtd`, `numeracao_id` nem `formato_id` nessa tabela.
- `csv_data` e `elements` são **json**, não texto: contar linhas é
  `jsonb_array_length(n.csv_data::jsonb)`, e `length()` dá erro de tipo.
- O `amostra_num_id` é a coluna que vale. O `numeracao_id` é espelho legado —
  ler ele primeiro faz o código escolher a numeração errada.
- As colunas que a numeração lê saem de `elements`, nos elementos com
  `source = 'database'`, campo `csv_column`. É a lista de
  `colunasDoBancoDaNumeracao` no frontend.

---

## 6. O INP de 2.105 ms (ainda em aberto)

Captura que o usuário trouxe do DevTools da estação:

```
span                 click       2.105,3 ms
                     input delay     0,3 ms
                     pointerup       0,0 ms
                     mouseup         0,1 ms
                     render         52,2 ms
                     total       2.157,9 ms
button.filter-btn-pill#btn-ped-so-aguardando   render 42,4 ms
```

O `span` é o nome do modelo, cujo clique sobe para a linha e chama
`alternarModeloAberto`.

### O que já foi descartado, cada um com medição

| Suspeito | Medido | Veredito |
|---|---|---|
| `fatiaCsvDoItem` num banco de 14.000 linhas | **0,54 ms** | descartado |
| O mesmo, no maior banco do pedido (12.806) | **0,82 ms** | descartado |
| Varrer os **51 bancos de uma vez** (128.286 linhas) | **7,8 ms** | descartado |
| `contaDoProduto` (Total / Impressas / Faltam) | lê `it.qtd`, **não varre banco** | descartado |
| `renderPedOSQueue` com 52 modelos | 43,7 ms (158 ms no pior caso) | não explica |
| `showView('view-pedido')` | troca de classes, sem carregar dado | descartado |

O medidor está em
[`ferramentas/medir_varredura_csv.mjs`](../ferramentas/medir_varredura_csv.mjs)
(rodar com `node .\ferramentas\medir_varredura_csv.mjs`) e roda as funções
**reais**, lidas do `script.js` pelo nome, com bancos do tamanho dos deste pedido
e o formato de coluna real (`__id, Arquivo, Codigo, Data, Origem, Seq. no
arquivo`).

Somando tudo o que dá para medir fora da estação: **menos de 200 ms**. Faltam
**1,9 segundos**.

### O candidato que sobrou

Consulta em [`sql/consultas/conferir_elementos_por_numeracao.sql`](../sql/consultas/conferir_elementos_por_numeracao.sql):
**todas as numerações deste pedido têm elemento QR** (tipos `METADATA, QR, TEXT`;
4 a 5 elementos, 1 QR, nenhum código de barras, nenhuma imagem).

A prévia gera **um QR por célula**, e a Triband tem **10 células por folha** —
então cada desenho da prévia gera 10 QRs, e a prévia é redesenhada mais de uma vez
durante o carregamento encadeado (400/600/800 ms). É CPU, é o caminho do clique, e
é o candidato mais forte que restou.

**Não foi medido, e por isso não está afirmado.**

### Como fechar isso

Duas saídas, nesta ordem de preferência:

1. **Expandir a linha do `span` / 2.105,3 ms no DevTools da estação.** O painel
   abre a atribuição do script — nome da função, arquivo e linha. É evidência que
   só se colhe na estação, e resolve a pergunta num clique.
2. **Instrumentar o caminho do clique**: cronômetro que imprime no console quanto
   cada etapa levou (`enviarParaImposicao`, `drawPedPreview`, o redesenho, o
   painel da impressora). O operador clica num modelo uma vez e manda a saída.
   Publicar junto com a próxima leva e retirar depois de descoberto.

---

## 7. As consultas usadas

Todas **somente-leitura**, guardadas em [`sql/consultas/`](../sql/consultas/).
Cada uma traz no topo o marcador `<<< TROQUE AQUI o numero do pedido`, para
servir a qualquer outro pedido.

| Arquivo | Pergunta |
|---|---|
| [`conferir_contratado_x_banco.sql`](../sql/consultas/conferir_contratado_x_banco.sql) | o modelo imprime a quantidade contratada? **(aplica o corte por coluna)** |
| [`conferir_pedido_por_modelo.sql`](../sql/consultas/conferir_pedido_por_modelo.sql) | os 51 modelos, com o achado de cada um: quantidade, dia, banco compartilhado |
| [`conferir_numeracoes_do_pedido.sql`](../sql/consultas/conferir_numeracoes_do_pedido.sql) | por numeração: quantos modelos usam, soma contratada, linhas no banco |
| [`conferir_elementos_por_numeracao.sql`](../sql/consultas/conferir_elementos_por_numeracao.sql) | o que cada numeração manda desenhar por item (QR e código de barras são os caros) |

As duas primeiras **aplicam o corte de `linhasComDadoDaNumeracao`**, e trazem no
cabeçalho o registro do alarme falso que a versão ingênua produziu. A terceira
conta linha crua de propósito — ela responde outra pergunta, sobre a numeração e
não sobre o modelo.

Para rodar: `.\ferramentas\rodar_sql.ps1 sql\consultas\<arquivo>` — e com
`-Conferir` ele mostra o SQL sem executar.
