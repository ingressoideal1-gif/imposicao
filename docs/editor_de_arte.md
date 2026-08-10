# Criador de Arte (Editor 2D) — documento técnico

**Leia antes de mexer em `frontend/criador-arte.js`.** Este documento existe porque o editor tem
três armadilhas que não são visíveis no código: ele reimplementa em canvas o que outro arquivo
já faz, ele guarda a estrutura editável fora do banco, e a fusão das camadas depende de CSS, não
de JavaScript. Todas as três já causaram bug em produção.

| | |
|---|---|
| Lógica | `frontend/criador-arte.js` (~1.870 linhas, tudo global em `window.*`) |
| Markup | `frontend/index.html`, view `#view-criador-arte` |
| Estilos da pilha | `frontend/style.css`, seção "Criador de Arte Canvas Stack Layers" |
| Também carregado por | `frontend/producao.html` |
| Biblioteca | Fabric.js 5.3.1 (+ PDF.js para rasterizar, PDFLib para gerar o PDF final, qrcodejs) |

---

## A regra de ouro

> **`drawAmostraFace()` (em `frontend/script.js`) é a especificação do editor.**

Essa função é o renderizador canônico: é ela que compõe as três camadas na prévia do card do
pedido, e é o que o cliente vê no link de aprovação. O editor precisa reproduzir as decisões
dela. Duas em particular:

1. **Enquadramento "contain"** — a arte cabe inteira na prancha, com proporção preservada e
   centralizada nos **dois** eixos. Não é encaixe pela altura com âncora no topo.
2. **Multiply, uma vez só, e do grupo inteiro** — a numeração **não** funde com a arte: ela
   cobre a arte com fusão normal. Arte e numeração formam um **grupo**, e é o grupo que
   multiplica sobre a cor do papel. Na prática, `drawAmostraFace()` pinta arte e numeração
   num canvas transparente à parte e só então compõe esse canvas sobre a cor com
   `globalCompositeOperation = 'multiply'`.

   Não é o que era antes: até a v496 cada camada multiplicava em cascata sobre o resultado
   acumulado, e a numeração escurecia onde caísse em cima de arte escura.

Divergir disso produz a classe de bug mais reportada aqui: o editor mostra uma coisa e o
pedido/impressão mostram outra. Ao implementar qualquer coisa sobre como a arte é carregada,
escalada, posicionada ou fundida, abra `drawAmostraFace()` primeiro e case o comportamento.

---

## A pilha de 3 camadas

O que aparece na tela é o empilhamento de **três elementos `<canvas>` irmãos** dentro de
`#editor-canvas-stack`, todos do mesmo tamanho:

```
#editor-canvas-stack
├── layer1        🎨 Cor (fundo)            z-index 1     pointer-events: none
└── #editor-blend-group    ← isolation: isolate + mix-blend-mode: multiply
    ├── canvas-container   🎨 ARTE (Fabric.js)   z-index 10    interativa ← a ÚNICA editável
    └── layer2             🔢 Numeração/Picote   z-index 100   pointer-events: none
```

A camada da arte fica **no meio**. Isso é imposto na mão em `setupEditorWorkspace()`, porque o
Fabric envolve o `<canvas>` numa `div.canvas-container` própria; sem forçar o `z-index` dessa div,
o empilhamento quebra.

A `#editor-blend-group` também é montada ali, na mão, a cada `setupEditorWorkspace()`: o
`dispose()` do Fabric desmonta e recria o container, então a div é reaproveitada pelo `id` e os
dois filhos são reanexados.

**As camadas 1 e 2 são contexto, não conteúdo.** Existem para o operador posicionar a arte sabendo
onde a numeração vai cair e qual é a cor do papel. Podem ser desligadas nos checkboxes do cabeçalho
(`toggleEditorLayer()`, que só alterna `display`). **Nada delas entra no arquivo salvo.**

### A fusão entre camadas é CSS, não JavaScript

Este é o ponto menos óbvio do editor.

`globalCompositeOperation` do canvas funde um desenho com o que já está **no mesmo canvas**. Como
as camadas aqui são elementos irmãos do DOM, composite de canvas **nunca** alcança a camada de
baixo. Marcar o objeto como `multiply` no Fabric não faz a arte fundir com a cor — só ajusta a
fusão dentro da própria Camada 3.

A fusão real vem da **`#editor-blend-group`**, a div que envolve a arte e a numeração, declarada
no `style.css` com duas propriedades que só funcionam em par:

- **`isolation: isolate`** cria um contexto de fusão próprio dentro do grupo. É o que faz a
  numeração compor sobre a arte com fusão **normal**, sem enxergar a cor que está atrás.
- **`mix-blend-mode: multiply`** faz o resultado já composto do grupo multiplicar contra o que
  está atrás dele, que é a Camada 1.

Junto, isso é o equivalente em CSS do que `drawAmostraFace()` faz em canvas: pintar arte e
numeração numa folha transparente e multiplicar essa folha, inteira, uma vez só.

**Tem de ser no elemento que agrupa.** No `.lower-canvas` não funciona, porque o container do
Fabric tem `position` + `z-index`, o que cria um *stacking context*, e stacking context **isola
blending** — o filho só fundiria com o que estivesse dentro do próprio container. E no
`.canvas-container` (onde ficava até a v496) o multiply pega **só a arte**, deixando a numeração
fora do grupo: era assim que a numeração acabava multiplicando por cima do resultado arte+cor.

Consequência disso: o grupo funde **inteiro**, inclusive o `.upper-canvas`, onde o Fabric
desenha as alças de seleção. Por isso `setupEditorWorkspace()` define alças com cantos preenchidos
e escuros — o padrão do Fabric (cantos vazados em azul claro) praticamente some sobre cores fortes.

Os dois mecanismos são complementares e não se somam: o `globalCompositeOperation` do objeto
mantém a semântica da arte (e é o que o checkbox "Efeito Multiply" lê e o que persiste no
`arte_json`); o `mix-blend-mode` é o que produz o resultado visual.

### Escala: 4 px por milímetro

`scalePxPerMm` (valor `4.0`, definido em `window.editorState` e reafirmado em
`setupEditorWorkspace()`) amarra tudo. O formato vem em mm (resolvido por `cor.formato_id` →
`num.formato_id` → primeiro formato → fallback 180×50 mm) e o canvas é `width_mm × 4` px. Um
ingresso de 180×50 mm vira um canvas de 720×200 px.

Toda conversão do inspector usa essa constante (`mm = px / 4`) — é por isso que os campos
Largura/Altura mostram milímetros reais. O zoom é puramente visual: um `transform: scale()` no
wrapper, que não altera o canvas.

---

## Camada 1 — Cor

`renderEditorLayer1Cor()` tenta, em cascata: rasterizar um PDF da cor via PDF.js → tratar como
imagem esticada → preencher com `cor_hex` sólido → branco.

A detecção "isso é PDF?" é heurística por string (inclui o teste do magic number base64 `JVBERi`).
Funciona, mas é frágil. No verso, se a cor não tem PDF de verso próprio mas o PDF tem 2 páginas,
usa a **página 2**.

## Camada 2 — Numeração

Fica **dentro** da `#editor-blend-group`, acima da arte: cobre a arte com fusão normal e
multiplica sobre a cor junto com ela, nunca por cima do resultado arte+cor.

`renderEditorLayer2Numeracao()` é um **reimplementador em canvas 2D puro** do gabarito de
numeração: percorre `num.elements` e desenha cada tipo à mão — `TEXT`/`FIXED`, os tipos de teatro
(`TEATRO_FILA`, `TEATRO_LUGAR`, `TEATRO_COMBO`), camarote, `QR`, `BARCODE`, `PICOTE`, `SVG`/`PDF`.

Dois pontos:

- **Os valores são amostras**, não dados reais: primeira linha do CSV (`state.csvData[0]`), ou o
  `numeracao_inicio` do item, ou placeholders como `[coluna]`.
- **O `PICOTE` é espelhado no verso** (`x = width_mm - x_mm`), porque o picote é físico e atravessa
  o papel.
- O `BARCODE` é um padrão **fake e hardcoded** de 40 barras. É ilustrativo; não codifica nada.

Como é uma reimplementação, ela pode divergir do renderizador real. Ao mudar tipos de elemento de
numeração, lembre que existem **duas** implementações a manter em sincronia: esta e a de
`drawAmostraFace()`.

## Camada 3 — Arte (Fabric)

A única com `selection: true`. Recebe texto (`fabric.IText`), formas, QR Code, imagens e PDFs
(rasterizados a `scale: 2.0`), além dos anexos do pedido.

---

## Carregar a arte existente

`setupEditorWorkspace()` decide o que abrir na Camada 3, nesta ordem:

1. **`arte_json`** — a estrutura vetorial do Fabric. É o que permite **reeditar** de verdade.
2. **`arte_url` / base64** — via `carregarArteBaseNoCanvas()`, que rasteriza se for PDF e insere
   como objeto base editável. Você move e escala, mas não edita os elementos internos.
3. O arquivo cru selecionado no `<input file>` do formulário do pedido.

Se o item **não tem arte nenhuma**, o código não só pula o carregamento: ele **purga ativamente**
as chaves do `localStorage`, para resíduos legados não ressuscitarem.

### Armadilha 1 — `amostra_arte_base64` guarda duas coisas

O campo guarda a arte do modelo **e**, quando um snapshot é gerado, a URL da **prévia composta**
(cor + arte + numeração) no bucket `amostras_renderizadas`. O predicado `ehRenderComposto()`
descarta o segundo caso.

Sem essa distinção: ao excluir a arte, o snapshot agendado ~2 s depois regravava o campo com a
prévia, o editor a carregava como se fosse a arte do modelo, e **a arte "excluída" reaparecia**.

### Armadilha 2 — `arte_json` obsoleto vence a arte nova

Como o `arte_json` tem prioridade, um "Upload de Arte" convencional num modelo que já passou pelo
editor reabria a **arte antiga**. Duas defesas hoje:

- `invalidarArteVetorial()` (em `script.js`) é chamada por `onItemArteUpload()` e `colarArte()`:
  um arquivo novo invalida a estrutura vetorial anterior.
- Desambiguação por nome de arquivo, para os modelos que já estavam nesse estado: **o editor sobe
  `arte_criada_*`, o upload convencional sobe `arte_*`**. Se a URL atual não veio do editor, o JSON
  do `localStorage` é tratado como resíduo e ignorado.

### Armadilha 3 — carregamento assíncrono e o passo 0 do histórico

Os carregamentos são **aguardados de propósito**. O `saveEditorHistory()` no fim de
`setupEditorWorkspace()` é o passo 0 do histórico; se a arte entrasse depois dele, o passo 0 seria
uma prancha vazia e um `Ctrl+Z` logo após abrir apagaria a arte recém-carregada.

### Detalhes de rede

`carregarArteBaseNoCanvas()` normaliza a URL antes de decidir se é PDF: **a detecção ignora
querystring/hash**, porque a URL pública do Supabase pode vir com `?token=...` e um
`endsWith('.pdf')` cru daria falso negativo — o PDF iria para um `<img>` e falharia em silêncio.

Para buscar bytes, usa `fetchPdfBytes()` (em `script.js`), que já trata base64, URL e o fallback
via `/api/proxy` quando o CORS bloqueia o fetch direto. Falhas emitem toast: um `console.warn`
silencioso fazia a prancha abrir vazia e parecer que o modelo não tinha arte.

---

## Histórico (Undo/Redo)

`saveEditorHistory()` serializa **o canvas inteiro** (`JSON.stringify(fc.toJSON())`) a cada ação,
guarda até **30 níveis**, deduplica comparando strings e trunca o "futuro" quando você age após um
undo. O flag `isRestoringHistory` evita o laço de o `loadFromJSON` disparar `object:modified` e
regravar histórico.

Atalhos (registrados uma única vez, e inativos quando o foco está num campo de formulário):
`Delete`/`Backspace` apaga; `Ctrl+D` duplica horizontalmente com gap de **10 mm** exatos;
`Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`; **`Shift` arrastando** trava o movimento no eixo X ou Y.

---

## Salvar — e onde cada coisa persiste

`salvarArteDoEditor()`:

1. Serializa o `arte_json` → grava em **duas chaves do `localStorage`**.
2. Exporta PNG (`multiplier: 2.0`) — **só a Camada 3**, sem cor nem numeração.
3. Gera o PDF físico com PDFLib nas dimensões reais (`mm × 72/25.4`) e sobe via `uploadToStorage()`
   para o bucket `artes`, com nome `arte_criada_*`. Se PDFLib ou o upload falharem, **cai
   silenciosamente para o data-URL base64** — o `catch` só faz `console.warn`.
4. Atualiza o item em memória, gravando o mesmo valor em 4 nomes de campo diferentes
   (`arte_url`, `url_arquivo_arte`, `url_arquivo`, `amostra_arte_base64`), por compatibilidade com
   os vários consumidores espalhados pelo `script.js`.
5. Persiste via `saveAmostraToDB()`, antes chamando `resolveItemCorNumIds()` para não perder
   cor/numeração.
6. Fecha o editor e chama `renderItemAmostraCombinada()`.
7. Dispara `forceRegenerateSnapshots()` em background para o link do cliente.

> ### ⚠️ O `arte_json` não existe no banco
>
> `saveAmostraToDB()` **remove `arte_json` e `verso_arte_json` do payload**, e nenhum `select` do
> frontend lê essas colunas. A estrutura vetorial vive **apenas em memória e no `localStorage`**.
>
> Na prática: trocar de máquina ou limpar o navegador rebaixa a arte de "editável" para "imagem
> achatada". Quem for resolver isso precisa mexer no `saveAmostraToDB` e nos `select`, não só no
> editor.

---

## Frente e Verso

As abas só aparecem se `item.verso` for verdadeiro. `switchEditorFace()` **reconstrói o workspace
do zero**: recria o Fabric, recarrega as três camadas e **zera o histórico**.

**Ela não salva a face anterior.** O que não foi salvo com 💾 antes de trocar de aba se perde.

Cada face tem seu par independente: `arte_url`/`arte_json` vs `verso_arte_url`/`verso_arte_json`.

---

## Anexos e fontes

`fetchAnexosDoPedido()` consulta `pedidos_artes` filtrando por `id_int` (o número da OS extraído
por regex), desempacota o JSON da coluna `arquivos` e resolve URLs públicas do bucket `chat-ideal`,
com cache em `state.anexosPedido[osId]`. `adicionarAnexoNaArte()` insere na Camada 3, com fallback
via `/api/proxy` quando o CORS barra.

`populateFontFamilySelect()` é alimentada **exclusivamente** por `state_fonts.catalogo` (fontes
hospedadas). Os botões "Fontes do PC" e "Digitar Nome" foram removidos de propósito: uma fonte
local do PC do operador não existiria no servidor de imposição, e a prévia divergiria do impresso.
`editorUpdateFontFamily()` faz `await document.fonts.load()` antes de aplicar, para o Fabric não
renderizar com a fonte de fallback.

---

## Fragilidades conhecidas

- **`arte_json` fora do banco** (acima) — a maior delas.
- **Troca de aba Frente/Verso descarta alterações não salvas**, sem aviso.
- **Numeração implementada duas vezes** (aqui e em `drawAmostraFace`), com risco de divergir.
- **Fallback silencioso no salvamento**: se o PDFLib ou o upload falharem, salva base64 sem avisar
  o operador.
- **Detecção de PDF por heurística de string** na Camada 1.
- **`BARCODE` é decorativo** — não codifica o valor real.

---

## Checklist antes de publicar uma mudança no editor

1. Comparei o comportamento com `drawAmostraFace()`?
2. Testei com um modelo que tem **cor** na Camada 1 (não só prancha branca)? É onde a fusão
   aparece.
3. Testei **arte vinda do Upload convencional** e **arte criada no editor**? São caminhos de
   carregamento diferentes.
4. Testei **frente e verso**?
5. Abri o editor, dei `Ctrl+Z` até o fim e a arte de base sobreviveu?
6. Salvei, reabri e a arte voltou como esperado?

Para subir o app e dirigir o navegador, veja a skill `.claude/skills/rodar-app/SKILL.md`.
