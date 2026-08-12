# Travar elemento, frente/trás e largura máxima para colunas do banco

Data: 2026-08-12. Aprovado pelo usuário nesta data.

Três recursos no editor de numeração (view Lista de Numerações → editor), todos no
cartão de configuração dos elementos:

1. **🔒 Travar** — elemento travado não é arrastado por engano no canvas.
2. **⬆⬇ Frente/trás** — mudar a ordem de sobreposição dos elementos.
3. **📏 Largura máxima** — elementos de coluna do banco (CSV) ganham largura em
   milímetros e uma regra para quando o dado variável não cabe: reduzir a fonte
   até caber ou quebrar em linhas.

## 1. Travar (`locked`)

**Campo**: `locked: true` no objeto do elemento. **Ausência = destravado** — mesma
polaridade do `__ativo` do CSV: nenhum elemento existente muda de comportamento e
não há migração.

**UI**: botão 🔓/🔒 no cabeçalho de cada cartão de elemento, entre o nome e o botão
Duplicar — inclusive no cartão do PICOTE, que tem template próprio e também é
arrastável. Âmbar quando travado, `title` explicativo nos dois estados. Alternar
chama `saveNumHistory()` (Ctrl+Z funciona) e redesenha.

**O que a trava bloqueia:**

- **Arrasto no canvas.** O clique ainda seleciona (o cartão acende — é assim que o
  operador acha o elemento), mas o elemento fica fora de `state.dragging.targets`
  em `onCanvasMouseDown`. Ao tentar arrastar algo 100% travado, um toast avisa:
  "🔒 Elemento travado — destrave no cartão" (com contenção para não repetir a cada
  mousedown).
- **Grupo com membro travado não arrasta.** Mover só os destravados quebraria o
  layout relativo do grupo; o toast explica o porquê.
- **Ferramentas de alinhamento** (`alignSelectedElement`): elementos travados são
  pulados. Se todos os selecionados estiverem travados, toast em vez de silêncio.

**O que a trava NÃO bloqueia** (deliberado — a trava é anti-acidente, não
imutabilidade):

- Editar campos no cartão, inclusive X/Y — digitar coordenada é ação deliberada.
- Duplicar (a cópia nasce travada), excluir, mudar frente/trás, trocar cor etc.

**Fora do editor**: `locked` viaja no payload e é ignorado pelo `engine.py` e por
todos os renderizadores — nenhuma mudança fora do editor.

## 2. Frente/trás (ordem de sobreposição)

**Fato arquitetural que decide o design**: a ordem do array `state.numElements` já
É a ordem de desenho em todos os renderizadores (frontend e `engine.py` iteram o
array na ordem), o hit-test do canvas já varre em ordem inversa (último = topo), e
os elementos são persistidos como array. Portanto **reordenar o array muda a
sobreposição na tela, no papel e no clique, sem tocar nenhum renderizador nem o
motor**. Nenhum campo `z_index` novo — um campo exigiria ordenar em ~10 lugares.

**UI**: dois botões no cabeçalho do cartão, ⬆ "Trazer para frente" e ⬇ "Enviar
para trás", um passo por clique (troca com o vizinho no array). `saveNumHistory()`
a cada troca. Sem efeito visível quando não há sobreposição — comportamento padrão
de qualquer editor.

**Sem sobressalto na lista**: os cartões são ordenados por `last_interaction`, não
pela ordem do array, então reordenar não embaralha a lista de cartões.

## 3. Largura máxima para elementos de coluna do banco (CSV)

### Campos novos no elemento

| Campo | Valores | Ausente significa |
|---|---|---|
| `max_width_mm` | número > 0 | sem limite (comportamento atual) |
| `overflow` | `"shrink"` \| `"wrap"` | `"shrink"` (só relevante com largura definida) |
| `text_align` | `"center"` \| `"left"` \| `"right"` | `"center"` (comportamento atual) |

### UI

Caixa **📏 Espaço do texto** no cartão, exibida apenas para elementos **`TEXT`**
com `el.source === 'database'` (junto de "Coluna do CSV"). QR e BARCODE também
têm origem "Banco de Dados", mas não desenham texto — ficam de fora:

```
Largura máxima (mm)  [    ]      vazio ou 0 = livre
Se não couber:       [ Reduzir a fonte até caber ▾ | Quebrar em linhas ]
Alinhamento:         [ Centro ▾ | Esquerda | Direita ]
```

Textinho de ajuda de uma linha embaixo, no padrão dos outros cartões. Os três
controles têm rótulo em texto (regra do projeto: controle novo se explica).

**Guia visual**: com o elemento selecionado no editor e `max_width_mm` definido,
`drawElement` desenha um retângulo tracejado discreto do espaço delimitado
(largura = `max_width_mm`, centrado na âncora; altura = altura do bloco de
linhas). Só no canvas do editor — as demais janelas mostram o resultado, não a
régua.

### O algoritmo (idêntico em JS e Python)

Função pura com espelho exato nos dois lados:

```
ajustarTextoNaLargura(medir, texto, corpo, larguraMax, modo) -> { corpo, linhas[] }
```

- `medir(texto, corpo)` é um callback que devolve a largura do texto naquele
  corpo — cada chamador usa a régua da sua tecnologia (canvas `measureText`,
  PyMuPDF `get_text_length`). A função em si não conhece canvas nem fitz.
- Sem `larguraMax` (ou ≤ 0): devolve `{corpo, linhas: texto.split('\n')}` —
  exatamente o comportamento atual.
- **`"shrink"`**: mede a linha mais larga; se passa, `corpo' = corpo × larguraMax
  / larguraMedida` (largura de texto é linear no corpo nas duas tecnologias — uma
  divisão, sem laço). Sem piso: "reduzir até caber" é literal; dado patológico
  fica visível na tela, que espelha o papel.
- **`"wrap"`**: quebra gulosa por palavra em cada parágrafo; palavra sozinha mais
  larga que o espaço quebra por caractere (nunca estoura). Corpo inalterado.
- Fator de segurança de 0,5% na comparação, para uma palavra no limite não quebrar
  diferente na tela e no papel por diferença de medição.

### Onde a função vive e quem a chama

- **`frontend/texto-ajuste.js`** (arquivo novo, padrão `csv-editor.js`): define
  `window.ajustarTextoNaLargura` e o desenhador comum `window.desenharTextoAjustado`,
  e é carregado por `index.html` **e** `cliente.html` — um arquivo compartilhado em
  vez de uma cópia por página, para as duas não driftarem. (Na implementação, isso
  substituiu a ideia original de copiar a função para o `cliente.js`.)
- **`engine.py`**: `_ajustar_texto_na_largura()` no topo do arquivo, chamada em
  `_render_element` antes do laço `lines_to_draw`. A medição usa a régua que o
  engine já usa para centralizar: `fitz.get_text_length` para Base-14 e a
  estimativa `0.55 × corpo × len` para fonte com `fontfile`. Todos os caminhos de
  texto do engine (inclusive os rotacionados, que montam `rotated_el = dict(el)`)
  afunilam em `_render_element`, então **a mudança no motor é em um lugar só** e
  os campos novos viajam sozinhos no `dict(el)`.

**Alinhamento**: aplicado no desenho, não na função. Com `larguraMax` definida, a
caixa é `[cx − w/2, cx + w/2]`; esquerda alinha as linhas à borda esquerda da
caixa, direita à direita, centro mantém o atual. No canvas é `ctx.textAlign` +
deslocamento; no engine é o `origin_x` que já é calculado por linha. Sem
`larguraMax`, `text_align` é ignorado (não há caixa).

### Inventário dos renderizadores de texto (chamadores do ajuste)

Os ramos TEXT com `source === 'database'` que passam a chamar a função antes de
desenhar (QR não entra — não é texto desenhado):

| # | Arquivo | Função | Janela |
|---|---|---|---|
| 1 | script.js | `drawElement` | canvas do editor |
| 2 | script.js | `drawVdpElements` | prévia de imposição |
| 3 | script.js | `onAmostraNumeracaoSelect` | prévia da amostra na Imposição |
| 4 | script.js | `drawNumeracaoElementsOverCanvas` | modo PDF (multipáginas) |
| 5 | script.js | `drawAmostraFace` | card do pedido (renderizador canônico) |
| 6 | script.js | `criarCanvasNumeracaoRasterizada` | PDF Gabarito |
| 7 | pedido.js | `drawVdpElements` | prévia do Painel de Produção |
| 8 | cliente.js | `drawAmostraFace` | link do cliente |
| 9 | cliente.js | `drawNumeracaoElementsOverCanvas` | modo PDF no link do cliente |
| 10 | criador-arte.js | `renderEditorLayer2Numeracao` | Criador de Arte |
| 11 | engine.py | `_render_element` | o papel |

Observações de implementação:

- Vários desses ramos desenham multilinha com `lineHeight = 1.2 × corpo` (igual ao
  engine); os que só tratavam 2 linhas fixas (`onAmostraNumeracaoSelect`,
  `drawVdpElements` do pedido.js) generalizam para N linhas com o mesmo 1,2 — isso
  corrige de tabela uma inconsistência antiga (2 linhas desenhadas mais apertadas
  que o papel).
- `getElementSizeMM` (hit-test e alinhamento) passa a limitar a largura a
  `max_width_mm` e a considerar o número de linhas do ajuste na altura.
- Não há mudança de payload nem de `render_mode`: largura máxima é comportamento
  de impressão e de aparência ao mesmo tempo — vale em todas as janelas.

### Persistência

Campos novos viajam no JSON de `elements` (jsonb) — sem migração de banco. As
listas de sanitização do payload são blocklists de campos `_internos`; os campos
novos são persistentes e passam.

## Decisões e alternativas descartadas

- **Selecionável-mas-imóvel** (estilo Canva) em vez de clique-atravessa (estilo
  Illustrator) para a trava: o pedido é anti-acidente; sumir com o elemento do
  clique dificultaria achar o cartão dele.
- **Aplicar o ajuste só no engine**: a tela mentiria — mesma classe do bug B2 do
  histórico (tela estica, papel encaixa). Rejeitado.
- **Pré-processar o texto ajustado no payload**: amostra e link do cliente
  desenham por conta própria, linha a linha do CSV. Não há payload que resolva.
- **Campo `z_index`**: a ordem do array já é a verdade em todos os renderizadores.
- **Reticências/truncar**: ingresso com dado cortado é dado errado impresso.
- **Corpo mínimo configurável**: fica de fora; "reduzir até caber" literal, o
  operador vê o resultado real na tela.

## Ideias registradas para depois (não entram agora)

- **Compressão horizontal** (manter altura, espremer largura — truque de cartão de
  embarque): viável com `ctx.scale` no canvas e `morph`/Matrix no PyMuPDF.
- **Conferidor de estouro no editor de CSV**: aviso "a coluna Nome tem 3 linhas
  que reduzem a fonte abaixo de 6 pt", com filtro para vê-las — o operador
  conserta o dado onde o dado mora.

## Testes

- **pytest** para `_ajustar_texto_na_largura`: shrink devolve razão exata; wrap é
  determinístico; palavra mais larga que o espaço quebra por caractere; sem
  largura devolve o texto intacto.
- **pytest de imposição real** (molde de `test_engine_csv_ativo.py`): numeração
  com coluna longa e `max_width_mm` pequeno; medir no PDF gerado que o texto
  respeita a largura nos dois modos.
- **Tela**: skill `rodar-app` — semear numeração com CSV, definir largura e modo,
  conferir canvas do editor e card do pedido (screenshot).

## Publicação

`engine.py` muda → **site e agente saem juntos**, com versão nova do agente, como
sempre. O usuário decide o momento; eu preparo e aviso.
