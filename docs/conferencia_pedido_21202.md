# Conferência do pedido 21202 — 29/08/2026

Investigação feita a pedido do usuário, que perguntou por que um modelo mostrava
dois números diferentes de folhas, e depois delimitou o trabalho:
**"verificar 'sem alterar' banco deste pedido, apenas analizar, não alterar"**.

Nenhuma linha do banco foi escrita. Todas as consultas usadas estão preservadas
como SQL de leitura, e este documento é o que elas mostraram.

O 21202 é o maior pedido real do sistema: **51 modelos**, bancos de numeração de
150 a 14.000 linhas, um evento de vários dias.

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

Ou seja:

| Momento | De onde vem a conta | No modelo 1000589 |
|---|---|---|
| Logo ao clicar, banco ainda não desceu | faixa numérica (N. inicial → N. final) | 1.920 ÷ 10 = **192 folhas** |
| Segundos depois, com o banco carregado | número de linhas do banco | 700 ÷ 10 = **70 folhas** |

**Isso não é defeito de código.** A regra está certa: o banco manda, porque é ele
que vai virar papel. O que o número denuncia é uma **divergência no dado** — os
dois só dão resultados diferentes quando a faixa contratada e o banco ligado não
falam da mesma quantidade.

### O que estava divergindo

O modelo 1000589 apontava para a numeração **"STAFF RECINTO 12"**, que tem 700
linhas e pertence a outros dois modelos (1000595 e 1000607).

**O dado foi corrigido entre a minha primeira e a segunda consulta.** Na segunda,
o 1000589 já apontava para **"CAMAROTE PATROCINADORES 11"**, com exatamente
**1.920 linhas** — batendo com a faixa. O número parou de oscilar porque as duas
contas passaram a dar o mesmo resultado.

### O que isso ensina sobre a tela

Quando o número de folhas **muda sozinho** segundos depois de abrir um modelo,
isso é sinal de que **o banco ligado não entrega a quantidade contratada**. Hoje
a tela não diz isso em palavra nenhuma — ela só troca o número, e o operador
precisa perceber a troca. Ver a seção 4.

---

## 2. A varredura dos 51 modelos

Consulta em [`sql/consultas/conferir_pedido_por_modelo.sql`](../sql/consultas/conferir_pedido_por_modelo.sql),
que faz três perguntas por modelo:

1. o banco da numeração entrega a quantidade contratada?
2. o **dia** do nome do modelo (`05/set …`) bate com o dia no nome da numeração
   (`… 05`)?
3. o gabarito que o ERP pediu bate com a numeração que foi ligada?

**Resultado: 50 modelos ok, 1 divergência.**

### 🔴 Modelo 1000565 — "05/set CAMAROTE PRESIDENTE"

| | |
|---|---|
| Quantidade **contratada** no ERP | **3.000** |
| Numeração ligada | `CAMAROTE PRESIDENTE` |
| Linhas **no banco** dessa numeração | **12.806** |
| Recorte (`csv_selecao`) | **não tem** |

**Se este modelo for impresso como está, saem 12.806 peças no lugar de 3.000.**

O que a conta sugere: 3.000 × 4 dias = 12.000, mais 800 extras = 12.800 — muito
perto das 12.806 linhas. Ou seja, **este é o banco-mestre do evento inteiro**, e
não o banco de um dia.

O nome confirma. Todas as outras numerações do pedido terminam com o dia
(`CAMAROTE PATROCINADORES 11`, `STAFF RECINTO 12`, `Backstage 12`). Esta é a
única **sem sufixo de dia** — e **não existe** uma `CAMAROTE PRESIDENTE 05` no
banco.

> **Regra do produto:** em pedido de evento com vários dias, cada dia tem a sua
> própria numeração. Não se divide um banco entre modelos pela distribuição.

**Nada foi alterado.** A decisão é do usuário: criar a numeração do dia 05 a
partir do banco-mestre, ou aplicar um recorte ao modelo.

### ⚠️ O `gabarito_operacional` não é confiável para conferência

O campo `pedidos_modelos.gabarito_operacional`, que vem do ERP, diverge da
numeração ligada em casos onde a numeração está **certa**. Exemplo encontrado:

| Modelo | Nome do modelo | `gabarito_operacional` | Numeração ligada |
|---|---|---|---|
| 1000602 | 12/set … | `Backstage 11` | `Backstage 12` ✅ |

O modelo é do dia 12, a numeração ligada é a do dia 12, e o gabarito ficou no
dia 11. **Não use esse campo como fonte para conferir dia ou peça** — ele produz
alarme falso. A fonte confiável é o par *nome do modelo* × *nome da numeração
ligada* (`amostra_num_id`).

---

## 3. Notas de esquema aprendidas nesta conferência

Erros que custaram consultas refeitas, anotados para a próxima vez:

- `pedidos_modelos` e `producao_numeracoes` guardam o id em tipos diferentes;
  o join precisa de `::text` dos dois lados
  (`n.id::text = pm.amostra_num_id::text`).
- Em `pedidos_modelos` as colunas são **`nome_modelo`**, **`quantidade`**,
  **`amostra_num_id`**, **`numeracao_inicio`/`numeracao_fim`**. Não existem
  `modelo`, `qtd`, `numeracao_id` nem `formato_id` nessa tabela.
- `csv_data` é **json**, não texto: contar linhas é
  `jsonb_array_length(n.csv_data::jsonb)`, e `length()` dá erro de tipo.
- O `amostra_num_id` é a coluna que vale. O `numeracao_id` é espelho legado —
  ler ele primeiro faz o código escolher a numeração errada.

---

## 4. A verificação já existe — mas não na tela onde se imprime

A função **`divergenciaDeCelulasDoModelo`** compara a quantidade contratada com
as células que o modelo de fato gera. Ela já está ligada em **quatro** lugares,
todos na tela de **Amostras**:

| Onde | O que faz |
|---|---|
| `renderAmostrasOSItens` | mostra a divergência no card de cada modelo |
| `decisionAmostraItem` | **bloqueia a aprovação** do modelo |
| `promoverPedidoSeTodosProntos` | bloqueia a promoção do pedido |
| `conferenciaDeDadosDoPedido` | entra no relatório do botão **🔎 Conferência de dados** |

Ou seja: **o 1000565 seria apontado hoje**, com o pedido aberto na tela de
Amostras — no card e no relatório. Se ele passou, foi porque ninguém abriu aquela
tela para este pedido depois que o vínculo do modelo mudou.

O que **não** existe é a mesma conta na **tela do Pedido**, que é onde o operador
manda imprimir. Lá o selo diz *"20 folha(s) · 200 itens · a folha fecha certo"* e
nunca compara com o contratado. Trazer a verificação para esse selo foi oferecido
ao usuário e **ainda não foi decidido**.

> Nota sobre custo: a função só varre o banco quando a tiragem ficou **curta**
> (`diferenca < 0`), justamente porque ela roda a cada redesenho de card e uma
> varredura extra num banco de 19 mil linhas se sente na tela. Quem for levá-la
> para a tela do Pedido precisa manter esse cuidado — ver a seção 5.

---

## 5. O INP de 2.105 ms (ainda em aberto)

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
| O mesmo, no maior banco do pedido (12.806) | **0,66 ms** | descartado |
| Varrer os **51 bancos de uma vez** (128.286 linhas) | **7,5 ms** | descartado |
| `contaDoProduto` (Total / Impressas / Faltam) | lê `it.qtd`, **não varre banco** | descartado |
| `renderPedOSQueue` com 52 modelos | 43,7 ms (158 ms no pior caso) | não explica |
| `showView('view-pedido')` | troca de classes, sem carregar dado | descartado |

O medidor está em
[`ferramentas/medir_varredura_csv.mjs`](../ferramentas/medir_varredura_csv.mjs)
(rodar com `node .\ferramentas\medir_varredura_csv.mjs`) e roda as funções **reais**,
lidas do `script.js` pelo nome, com bancos do tamanho dos deste pedido e o
formato de coluna real (`__id, Arquivo, Codigo, Data, Origem, Seq. no arquivo`).

Somando tudo o que dá para medir fora da estação: **menos de 200 ms**. Faltam
**1,9 segundos**.

### O candidato que sobrou

Consulta em [`sql/consultas/conferir_elementos_por_numeracao.sql`](../sql/consultas/conferir_elementos_por_numeracao.sql):
**todas as numerações deste pedido têm elemento QR** (tipos `METADATA, QR, TEXT`; 4 a 5 elementos, 1 QR, nenhum
código de barras, nenhuma imagem).

A prévia gera **um QR por célula**, e a Triband tem **10 células por folha** —
então cada desenho da prévia gera 10 QRs, e a prévia é redesenhada mais de uma
vez durante o carregamento encadeado (400/600/800 ms). É CPU, é o caminho do
clique, e é o candidato mais forte que restou.

**Não foi medido, e por isso não está afirmado.**

### Como fechar isso

Duas saídas, nesta ordem de preferência:

1. **Expandir a linha do `span` / 2.105,3 ms no DevTools da estação.** O painel
   abre a atribuição do script — nome da função, arquivo e linha. É evidência
   que só se colhe na estação, e resolve a pergunta num clique.
2. **Instrumentar o caminho do clique**: cronômetro que imprime no console quanto
   cada etapa levou (`enviarParaImposicao`, `drawPedPreview`, o redesenho, o
   painel da impressora). O operador clica num modelo uma vez e manda a saída.
   Publicar junto com a próxima leva e retirar depois de descoberto.

---

## 6. As consultas usadas

Todas **somente-leitura**, guardadas no repositório em
[`sql/consultas/`](../sql/consultas/). Cada uma traz no topo o marcador
`<<< TROQUE AQUI o numero do pedido`, para servir a qualquer outro pedido.

| Arquivo | Pergunta |
|---|---|
| [`conferir_pedido_por_modelo.sql`](../sql/consultas/conferir_pedido_por_modelo.sql) | os 51 modelos: banco bate com contratado? dia bate? gabarito bate? |
| [`conferir_contratado_x_banco.sql`](../sql/consultas/conferir_contratado_x_banco.sql) | onde contratado ≠ banco, com a conta de folhas dos dois lados |
| [`conferir_numeracoes_do_pedido.sql`](../sql/consultas/conferir_numeracoes_do_pedido.sql) | por numeração: quantos modelos usam, soma contratada, linhas no banco |
| [`conferir_elementos_por_numeracao.sql`](../sql/consultas/conferir_elementos_por_numeracao.sql) | o que cada numeração manda desenhar por item (QR e código de barras são os caros) |

Para rodar qualquer uma delas:
`.\ferramentas\rodar_sql.ps1 sql\consultas\<arquivo>` — e com `-Conferir` ele
mostra o SQL sem executar.
