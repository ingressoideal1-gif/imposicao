# Box "Adicionar Pdf e Svg" e arquivo por elemento

Data: 2026-08-09. Contra a v489.

## O problema

Três pedidos que, olhando o código, são o mesmo conserto:

1. Os elementos PDF e SVG devem sair da box "Adicionar Elementos" e ganhar uma box
   própria, "Adicionar Pdf e Svg", onde o upload já cria o elemento.
2. Deve ser possível ter **vários** elementos `.pdf` e `.svg`, cada um com seu arquivo.
3. Ao carregar um PDF, sair da numeração e voltar, o PDF aparece como **fantasma** no
   lugar da Arte de Fundo.

O que liga os três: hoje o arquivo é **da numeração**, não do elemento. `state.numPdfContent`
e `state.numSvgContent` guardam um arquivo cada, `addElement('PDF')` copia desse estado
global, e `saveNumeracao()` sobrescreve o conteúdo de *todos* os elementos com esse arquivo
único (a inconsistência E3 de `docs/fluxo_elementos_pdf_svg.md`). Um segundo PDF diferente
é impossível de manter: some no primeiro save.

O fantasma é a mesma confusão vista de outro ângulo. `state.numPdfImage` serve a dois
donos: é a arte do elemento **e** a arte de fundo de referência do canvas. Em
`frontend/script.js:3384` o fundo é `state.bgImage` ou, na falta dele, `state.numPdfImage
|| state.numSvgImage`. Ao reabrir a numeração, `editNumeracao()` recupera o `pdf_content`
do primeiro elemento PDF (`:2899`), ele vira `numPdfImage`, e o canvas o pinta como fundo a
55% de opacidade.

## Decisões tomadas

| Questão | Decisão |
|---|---|
| Os dois campos de upload no topo do editor | Removidos. A box passa a ser o único caminho. |
| "Arte própria vence" (regra da v486) | Revogada. A cor do formato base carrega sempre. |
| Opção de escala do PDF | Espelhar o que o SVG já tem: Largura/Altura em mm travadas na proporção mais o botão "Tamanho original (100%)". |

## Arquitetura

### O arquivo passa a ser do elemento

Cada elemento PDF/SVG carrega o próprio conteúdo (`pdf_content` / `svg_content`, campos que
já existem no schema), o próprio nome de arquivo (`pdf_filename` / `svg_filename`, novos) e
o próprio tamanho natural em mm (`natural_w_mm` / `natural_h_mm`, novos, para o botão de
100% funcionar sem reabrir o arquivo).

`saveNumeracao()` passa a subir o arquivo de **cada** elemento separadamente, pulando os que
já são URL, e deixa de sobrescrever todos com um arquivo só.

As variáveis globais `state.numPdfContent`, `numSvgContent`, `numPdfImage`, `numSvgImage`,
`numPdfOffCanvas`, `numPdfOriginalW/H` e `numSvgOriginalW/H` deixam de ser fonte de arte de
elemento.

### As colunas da numeração continuam sendo escritas

`producao_numeracoes.svg_content` e `.pdf_content` continuam preenchidas, a partir do
**primeiro** elemento de cada tipo. Não é zelo: `svg_content` da numeração é um marcador de
CAMAROTE load-bearing. `engine.py:222` faz `if "CAMAROTE" in str(numeracao.get("svg_content",
""))` para forçar `num_tipo = "CAMAROTE"`, e o mesmo teste aparece em `engine.py:256`,
`:1032` e `:1097`, mais `frontend/script.js:6848` e `frontend/pedido.js:1233`. O check é
sobre o **nome do arquivo** na URL. Parar de escrever a coluna quebraria a detecção em
silêncio. O export de gabarito (`script.js:25769`) e os defaults de `db.py:588` também leem
essas colunas.

### A box "Adicionar Pdf e Svg"

Card novo no painel do editor, logo abaixo de "Adicionar Elementos". Contém:

- dois botões, `📄 + PDF` e `🎨 + SVG`, que abrem o seletor de arquivo e já criam o elemento
  com aquele arquivo, no tamanho natural (escala 100%);
- a lista dos elementos PDF/SVG da numeração: ícone, nome do arquivo, tamanho em mm, e um ✕
  que remove o elemento. Clicar na linha seleciona o elemento no canvas.

Saem: os botões `🎨 SVG` e `📄 PDF` de "Adicionar Elementos", e os dois campos de upload do
topo do editor ("Desenho Vetorial (SVG)" e "Arquivo PDF (Elementos Variáveis)"). O Upload CSV
fica onde está, e o grid de três colunas do topo vira de uma.

O mesmo `<input type="file">` oculto é reaproveitado, movido para dentro da box; o que muda é
o handler, que passa a criar elemento em vez de preencher estado global.

### A escala no painel de propriedades

O elemento PDF ganha o mesmo bloco que o SVG tem desde a v489: Largura e Altura em mm
travadas na proporção e o botão `↺ Tamanho original (100%)`. As funções
`updateElDimensaoSvg` e `resetSvgTamanhoOriginal` são generalizadas para os dois tipos.

O tamanho natural sai de `natural_w_mm`/`natural_h_mm` do elemento. Para elementos antigos,
que não têm esses campos, o pré-carregador que já abre o PDF com o pdf.js os calcula do
viewport, e o do SVG usa `svgNaturalSizeMm()` sobre o conteúdo.

### O fantasma

Três pontos, o mesmo conserto — a arte de fundo passa a ser **só** `state.bgImage`:

- `script.js:3384` — canvas do editor, face frente;
- `script.js:3379` — face verso (que lê `state.numPdfImageVerso`, uma variável que nada no
  repositório atribui: já era código morto);
- `script.js:6168` — gerador do `preview_jpg`, onde o fantasma hoje também é assado dentro
  da imagem salva.

E a trava de `autoLoadCorBg` (`:4640`, `if (state.numPdfContent || state.numSvgContent)
return false;`) sai, para a cor do formato base voltar a carregar sempre.

## Compatibilidade com numerações existentes

Abrem sem migração: os elementos já carregam a URL no próprio `pdf_content`/`svg_content` —
hoje é a mesma para todos, o que continua sendo um estado válido no modelo novo. O que falta
neles é `pdf_filename` e `natural_w_mm`; a box mostra o nome derivado da URL e o
pré-carregador calcula o tamanho natural. A partir do primeiro save no modelo novo, cada
elemento fica com os seus.

A mudança visível esperada: numerações que usavam o PDF como fundo de referência passam a
mostrar a cor do formato base no lugar dele.

## Riscos

O maior é a varredura incompleta. `state.numPdfImage` e companhia aparecem em cerca de vinte
pontos, incluindo os pré-carregadores da janela de arte, o preview de imposição e o export de
gabarito. Cada um precisa ser visitado; deixar um para trás recria o fantasma numa tela só,
que é justamente o tipo de falha que passa despercebida.

## Verificação

Não há framework de teste de frontend. Puppeteer na porta 9123 (skill `rodar-app`):

1. Adicionar dois PDFs **diferentes** e um SVG pela box; conferir três elementos com três
   conteúdos distintos.
2. Interceptar o payload do save e conferir que os três chegam com URLs distintas, e que
   `svg_content`/`pdf_content` da numeração vieram do primeiro elemento de cada tipo.
3. Reabrir a numeração e conferir que o canvas não desenha o PDF como fundo, e que a cor do
   formato base carregou.
4. Gerar o `preview_jpg` e conferir que ele também não tem o fantasma.
5. Escala: mexer na Largura do elemento PDF e conferir que a Altura acompanha; o botão de
   100% devolve o tamanho do arquivo.
6. Engine: impor uma numeração com os três elementos e medir cada um no PDF gerado.
