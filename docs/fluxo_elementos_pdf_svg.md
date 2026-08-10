# Fluxo dos elementos PDF e SVG da numeração

Análise ponta a ponta dos elementos de tipo `PDF` e `SVG` de uma numeração, do
upload até o papel. Data: 2026-08-08, contra a v488.

Tudo que está marcado como **medido** foi verificado executando código, não lendo.
Os comandos estão no fim de cada achado.

> **Estado em 2026-08-09 (v490):** os bloqueadores **B1**, **B2** e **B3** foram
> corrigidos na v489, e as inconsistências **E1**, **E2** e **E3** na v490 — ver o
> CHANGELOG e as notas "✅ Corrigido" em cada seção abaixo. O texto original de cada
> achado foi mantido porque descreve o sintoma que se deve saber reconhecer. Segue
> aberta a **E4** (três comportamentos diferentes quando o arquivo não carregou).

## Como está hoje (v490)

O arquivo é **do elemento**, não da numeração. Cada elemento PDF/SVG carrega:

| Campo | O que é |
|---|---|
| `pdf_content` / `svg_content` | o arquivo: texto do SVG, data URL do PDF, ou URL pública depois de salvo |
| `pdf_filename` / `svg_filename` | o nome, para a box exibir |
| `natural_w_mm` / `natural_h_mm` | o tamanho natural, para o botão "Tamanho original (100%)" |
| `width_mm` / `height_mm` | o tamanho em uso, sempre na proporção do natural |
| `render_mode` | `"print"` (padrão) ou `"layout"` — ver "Finalidade", abaixo |
| `_pdfCanvas` / `_svgImage` | cache de render, nunca persistido |

Dá para ter quantos quiser, de qualquer mistura. Quem os cria é a box **Adicionar
Pdf e Svg** (`#num-arquivos-box` em `frontend/index.html`): o upload já cria o
elemento no tamanho natural. Não existe mais upload de PDF/SVG no topo do editor.

As colunas `svg_content` e `pdf_content` da **numeração** continuam sendo escritas,
derivadas do primeiro elemento de cada tipo. **Não remova isso**: `svg_content` da
numeração é o marcador de CAMAROTE lido por `engine.py:222` (e `:256`, `:1032`,
`:1097`, mais `frontend/script.js` e `frontend/pedido.js`), que testa se o **nome do
arquivo** contém "CAMAROTE". Parar de escrever a coluna quebra a detecção em silêncio.

## O caminho, em oito etapas

Linhas conferidas contra a v490.

| # | Etapa | Onde |
|---|---|---|
| 1 | Upload → já cria o elemento | `adicionarElementoSvg()` `:4868`, `adicionarElementoPdf()` `:4906` |
| 2 | Criação do elemento | `addElement(type, extras)`, `:5033` |
| 3 | Canvas do editor | `drawElement()`, `:3525` |
| 4 | Lista da box | `renderBoxArquivos()`, `:5539` |
| 5 | Persistência | `saveNumeracao()`, `:5960` |
| 6 | Janela combinada de arte | `renderItemAmostraCombinada()`, `:21005` |
| 6b | Janela em **modo PDF** (multipáginas) | `drawNumeracaoElementsOverCanvas()` — outro caminho, que **não** passa por `drawAmostraFace()` |
| 7 | Preview de imposição | `drawVdpElements()`, `:7339` — **e a outra**, em `pedido.js` |
| 8 | Export de gabarito | `exportarPdfGabarito()`, `:25601` |
| 9 | Geração do PDF | `engine.py:735` (SVG), `:775` (PDF) |
| 10 | Impressão | `app.py:1024` — só reenvia o PDF do engine ao spooler |

Funções de apoio que todo renderizador novo deve usar: `drawImageContain()` (`:3514`)
para desenhar sem distorcer, `tamanhoNaturalDoElemento()` (`:4753`) para o tamanho
100%, `svgNaturalSizeMm()` (`:4707`) para medir um SVG como o `svglib` mede, e
`precarregarArtesDosElementos()` (`:4842`) para carregar a arte de uma lista de
elementos vinda do banco.

A impressão não re-renderiza nada: recebe o PDF que o engine gerou e manda para a
impressora. Logo, **o que o engine faz é o que sai no papel**, e qualquer divergência
entre tela e engine é divergência entre tela e papel.

---

## Finalidade: Layout ou Impressão (v506)

Cada elemento PDF/SVG tem um seletor **Finalidade** no card de configuração, gravado
em `render_mode`. `"print"` é o padrão e é o que todo elemento anterior à v506 tem
(campo ausente = impressão). `"layout"` significa **só visualização**: o elemento
existe para conferir o encaixe na tela e nunca vai ao papel.

O critério que decide cada renderizador é **o que aquela tela promete**:

| Renderizador | Elemento de Layout |
|---|---|
| `drawElement()` — canvas do editor | **desenha**, com borda tracejada âmbar e o selo `LAYOUT` |
| `drawAmostraFace()` (`script.js` e `cliente.js`) | **desenha** |
| `drawNumeracaoElementsOverCanvas()` (modo PDF, nas duas cópias) | **desenha** |
| `renderEditorLayer2Numeracao()` — Criador de Arte | **desenha** |
| `drawVdpElements()` — prévia de imposição, **nas duas cópias** | **pula** — com uma exceção, abaixo |
| `criarCanvasNumeracaoRasterizada()` — PDF Gabarito | **pula** |
| `engine.py` | **pula** |

A prévia de imposição é a exceção entre as janelas de tela porque ela promete o
comportamento da impressão, não a aparência da peça. Ao acrescentar um renderizador
novo, a pergunta a responder é essa, e não "é canvas ou é PDF".

### O checkbox 🎨 AMOSTRA troca a promessa da janela (v508)

Na prévia do **Painel de Produção** (view Pedido, `pedido.js`), o checkbox
`#ped-preview-toggle-amostra` desenha a camada base da Cor por baixo e transforma a
prévia na **peça acabada** em vez da folha da impressora. Marcado, ele também mostra os
elementos de Layout. Isso não contradiz a regra — aplica a mesma pergunta: mudou o que a
janela promete, muda o que ela mostra.

Duas coisas a não quebrar:

- **A leitura fica só no `pedido.js`.** O checkbox mora no `index.html`, o mesmo
  documento da view Imposição. Se a `drawVdpElements()` do `script.js` também o lesse,
  quem marcasse o checkbox no Painel de Produção veria elementos de Layout na prévia da
  Imposição, onde esse controle não existe nem aparece.
- **O payload não muda.** O checkbox é só de visualização; a numeração enviada ao motor
  continua sem os elementos de Layout nos dois estados.

Os predicados são `elementoSoLayout(el)` e `numeracaoSemElementosDeLayout(num)`, em
`frontend/script.js` e expostos em `window` — o `pedido.js` usa os dois de lá, como já
fazia com a `drawImageContain()`. No backend é `_so_layout(el)`, no topo do `engine.py`.

**A filtragem é dupla de propósito.** O `engine.py` descarta o elemento nos três
pontos de ingestão (as duas cargas do `ImpositionConfig` e o `parse_elements` do
`process`) e ainda tem uma guarda no `_render_element`. Mas o frontend **também** o
retira do payload antes de enviar, nos dois construtores. A razão é o `NewProd.exe`:
ele carrega uma cópia congelada do `engine.py`, então uma estação com agente antigo
imprimiria o que a tela prometeu que não seria impresso. Não remova nenhum dos dois
lados achando que o outro basta.

Uma consequência no PDF Gabarito: o fundo vetorial passou a procurar o primeiro
elemento PDF **de impressão** em vez de ler a coluna `pdf_content` da numeração
primeiro. A coluna é apenas derivada do primeiro elemento PDF ao salvar; o arquivo é
do elemento, e é no elemento que existe a finalidade. A coluna segue como fallback
para registros legados, sem elemento PDF.

---

## Bloqueadores

### B1. Elementos SVG nunca chegam ao PDF gerado

`engine.py:729-731` importa `svglib` e `reportlab` **dentro** do `try`, e o
`except Exception` de `:743` apenas imprime no console do servidor.

**Medido:** `svglib` não está instalado neste ambiente e **não consta do
`requirements.txt`** (que lista apenas `pymupdf`). Reproduzindo o ramo literal do
engine:

```
Erro ao impor SVG: No module named 'svglib'
  -> a pagina tem desenho? False
```

Consequência: todo elemento SVG aparece no editor, aparece na janela de arte,
aparece no preview — e **simplesmente não existe no PDF impresso**. A imposição não
falha, não avisa, não registra nada além de um `print()` que ninguém lê. O operador
descobre no papel.

O mesmo `except` engole qualquer outra falha de SVG (arquivo malformado, recurso
externo, fonte ausente), sempre em silêncio.

**Correção mínima:** acrescentar `svglib` e `reportlab` ao `requirements.txt` e
instalar. **Correção correta:** além disso, mover o `import` para fora do `try` (uma
dependência ausente é erro de instalação, não de conteúdo) e fazer a falha de um
elemento SVG propagar como erro visível ao usuário em vez de gerar um PDF incompleto.

**✅ Corrigido na v489 pela correção correta.** As duas bibliotecas entraram no
`requirements.txt`; o import subiu para o topo do `engine.py` e guarda a falha em
`_SVG_IMPORT_ERROR`; impor um SVG sem elas levanta `RuntimeError` com a instrução de
instalação. Os `except` de SVG e de PDF re-levantam em vez de imprimir. Entrou também
uma checagem para o caso que não levantava exceção nenhuma: o `svglib` aceita um SVG
malformado e devolve um desenho 0×0, que não pinta nada.

### B2. A tela estica o elemento; o PDF gerado preserva a proporção

Todos os quatro renderizadores do frontend desenham com
`ctx.drawImage(img, x, y, w, h)`, que **estica** a imagem para preencher a caixa do
elemento. O engine usa `page.show_pdf_page(..., keep_proportion=True)` em
`engine.py:742` (SVG) e `:774` (PDF), que **encaixa preservando a proporção** e
deixa sobra.

Vale notar que essas são as **únicas duas** ocorrências de `keep_proportion=True` no
`engine.py`; todas as outras nove usam `False`. Os elementos PDF e SVG são a exceção
dentro do próprio backend.

**Medido**, com uma fonte de 100×50mm colocada numa caixa de 100×100mm:

```
keep_proportion=True   -> altura pintada ~50mm  (o que o engine faz)
keep_proportion=False  -> altura pintada ~100mm (o que o canvas faz)
```

Consequência: enquanto o operador não mexer no tamanho, os dois coincidem. No
momento em que ele redimensiona o elemento para uma proporção diferente da original
— que é justamente o que as alças de redimensionamento convidam a fazer — a tela
mostra a arte preenchendo a caixa e o papel sai com ela encolhida e centralizada.

É a mesma classe de problema que o `docs/editor_de_arte.md` já registra para o
Criador de Arte: divergir do renderizador canônico faz o editor mostrar uma coisa e
a impressão outra.

**Decisão necessária:** ou o canvas passa a respeitar a proporção (desenhar com
letterbox, como o engine), ou o engine passa a esticar (`keep_proportion=False`,
como o resto do arquivo). O que não pode é continuar um de cada jeito.

**✅ Corrigido na v489.** A regra escolhida foi **tamanho original, escala 100%, sem
distorção** — o canvas passou a respeitar a proporção, e o `keep_proportion=True` do
engine ficou como estava. `drawImageContain()` (`frontend/script.js`) é o equivalente
exato no canvas, centralização inclusive.

**⚠️ A varredura da v489 contou quatro renderizadores, e eram nove.** Cinco ficaram de
fora, porque estão em arquivos ou caminhos que a busca não alcançou. Três esticavam a
arte, e foram corrigidos na **v496**:

| Renderizador esquecido | Onde | Tipo |
|---|---|---|
| Prévia de imposição do pedido | `pedido.js`, `drawVdpElements()` | SVG e PDF |
| Link de aprovação do cliente | `cliente.js`, dentro de `drawAmostraFace()` | SVG e PDF |
| Camada 2 do Criador de Arte | `criador-arte.js`, `renderEditorLayer2Numeracao()` | PDF |

Os outros dois eram piores: **não desenhavam SVG e PDF de jeito nenhum**, corrigidos na
**v497** — ver "O modo PDF não desenhava elemento SVG nem PDF", abaixo.

Há **duas** `drawVdpElements()` no projeto — uma em `script.js:7339`, que a v489
corrigiu, e outra em `pedido.js`, que ela não viu. A `cliente.html` não carrega o
`script.js`, então a `drawImageContain()` nem existia lá: a v496 levou uma cópia
declarada para o topo do `cliente.js`. Ao mexer numa das duas cópias, mexa na outra.

Hoje nenhum `ctx.drawImage(img, x, y, w, h)` cru sobra para elementos SVG/PDF — o que
se confere com uma busca por `drawImage(` seguido de `_pdfCanvas`, `_svgImage`,
`svgImg` ou `imgObj` em `frontend/*.js`, descontando as chamadas de `drawImageContain`.

Além disso, distorcer deixou de ser possível pela interface: os campos Largura e
Altura de um elemento SVG ficaram travados na proporção — mexer num ajusta o outro —
e um botão **Tamanho original (100%)** devolve o elemento ao tamanho do arquivo.
Elementos PDF nunca tiveram campos de tamanho no painel de propriedades, então já
entravam e permaneciam em 100%.

Medido depois da correção, com arte natural de 40×20 mm: numa caixa de 60×60 mm o
engine pinta razão 2,02 e o `drawElement()` do editor pinta razão ~2,0 — os dois
encaixam, nenhum estica.

### B2b. O modo PDF não desenhava elemento SVG nem PDF

**✅ Corrigido na v497.** Quando o item está em **modo PDF (multipáginas)**, a janela de
visualização não passa por `drawAmostraFace()`: ela renderiza a página do PDF e carimba
a numeração por cima com **`drawNumeracaoElementsOverCanvas()`** — um décimo caminho,
com uma cópia em `script.js` e outra em `cliente.js`.

Essa função tratava `TEXT`/`FIXED`, os tipos de teatro e camarote, `QR`, `BARCODE` e
`PICOTE` — e **não tinha ramo algum para `SVG` nem para `PDF`**. O `forEach` caía fora
de todos os `else if`, dava `ctx.restore()` e não pintava nada. Não era problema de
carregamento: medido, `el._pdfCanvas` e `el._svgImage` já estavam prontos e ainda assim
os dois tipos desenhavam **zero pixel**, enquanto `FIXED` desenhava 10.349 e `BARCODE`
4.118 no mesmo gabarito.

A correção tem duas partes, e as duas são necessárias:

1. O ramo `SVG`/`PDF`, espelhando o de `drawAmostraFace()`: recorte na caixa,
   `drawImageContain()` e, sem arte carregada, a caixa com o nome do tipo.
2. `await precarregarArtesDosElementos(num.elements)` **antes** de desenhar, nos dois
   pontos de chamada. As duas funções que chamam são `async`, então dá para esperar de
   verdade e sair certo de primeira, sem carregar e mandar redesenhar depois.

A `cliente.html` não carrega o `script.js`, então a v497 levou para o `cliente.js` uma
`precarregarArtesDosElementos()` própria — que também carrega **SVG**, coisa que a
`preloadAmostraItemPdfElements()` de lá não fazia. As duas versões de lá agora
compartilham o mesmo carregador.

### B3. O tamanho inicial do SVG erra quando o arquivo não declara tamanho

`frontend/script.js:4833` deriva os milímetros de `(img.width / 96) * 25.4`, ou
seja, mede o SVG **pelo navegador** e assume 96 DPI.

Quem manda no tamanho impresso, porém, é o `svglib` — é ele que transforma o SVG em
PDF dentro do engine. Ele lê `width`/`height` do próprio arquivo (unidade ausente =
px a 96 DPI) e, quando faltam, usa as dimensões do `viewBox` como px. Para todo SVG
que declara um tamanho **absoluto**, a medida do navegador coincide com a do `svglib`
— foi medido nas duas pontas. O problema aparece nos casos em que o SVG **não tem
tamanho intrínseco**: sem `width`/`height`, ou com eles em `%`, o navegador substitui
pelo default de 300×150 px, que não tem relação nenhuma com o desenho.

**Medido** (antes da correção), com SVGs que descrevem o mesmo desenho de 100×50:

| SVG | `img.width` do navegador | mm calculados | `svglib` diz |
|---|---|---|---|
| `width="100" height="50"` | 100×50 | 26,46 × 13,23 | 26,46 × 13,23 ✓ |
| só `viewBox="0 0 100 50"` | 300×150 | **79,4 × 39,7** | 26,46 × 13,23 ✗ |
| `width="100mm" height="50mm"` | 378×189 | 100 × 50 | 100 × 50 ✓ |
| `width="50%" height="50%"` | 300×150 | **79,4 × 39,7** | 13,23 × 6,61 ✗ |

O elemento PDF não tem esse problema: `:4961` usa o viewport real em pontos, com a
conversão correta de 72 pt/polegada.

**✅ Corrigido na v489.** `svgNaturalSizeMm()` passou a ler o tamanho do texto do
próprio arquivo, reproduzindo a interpretação do `svglib`, incluindo `pt`, `pc`, `mm`,
`cm`, `in`, `q` e percentuais resolvidos contra o `viewBox`. As oito convenções foram
medidas nos dois lados e batem. O único caso que continua sem resposta é o SVG sem
`width`/`height` **e** sem `viewBox`: o upload avisa que o tamanho foi estimado pelo
navegador, e a imposição falha com mensagem — o `svglib` produz um desenho 0×0 ali.

---

## Inconsistências estruturais

### E1. Quatro fontes diferentes para a imagem do SVG

O mesmo dado é buscado em quatro lugares distintos, um por renderizador:

| Renderizador | De onde lê o SVG |
|---|---|
| Editor (`:3916`) | `state.numSvgImage` — global |
| Preview de imposição (`:7483`) | `currentNum._svgImage` — na numeração |
| Janela de arte (`:20861`) | `el._svgImage` — no elemento, carregado sob demanda |
| Export de gabarito (`:25509`) | `el._svgImage` — sem carregar |

**Medido:** em `frontend/script.js`, `_svgImage` só é atribuído a **elementos**
(`:20866`). Nada no arquivo atribui `_svgImage` a uma numeração. Portanto
`currentNum._svgImage` do preview de imposição é sempre `undefined`, e **o preview de
imposição sempre desenha a caixa com a palavra "SVG"** no lugar da arte.

Existe uma atribuição em `frontend/pedido.js:1969` — mas ela está dentro de um bloco
que começa em `pedido.js:1818` com `if (numId && window.state && window.state.numeracoes)`,
e **medido em runtime**: `window.state` contém apenas `{mapas, mapaAtual, mapaHistory}`,
vindo de `frontend/mapas.js:6`. `window.state.numeracoes` é `undefined` e
`window.state !== state`. O bloco nunca executa.

Ver a explicação do `window.state` em `docs/lista_de_numeracoes.md`.

**✅ Corrigido na v490.** A fonte é uma só: `el._svgImage`, no próprio elemento. O
editor e o preview de imposição passaram a lê-la, e o preview carrega sob demanda com
`carregarImagemSvgDoElemento()`, no mesmo molde que o elemento PDF ao lado já usava —
antes ele desenhava o placeholder "SVG" sempre. `state.numSvgImage` e
`state.numPdfImage` deixaram de existir como fonte de arte de elemento.

### E2. PDF é por elemento, SVG é global

O elemento PDF carrega seu próprio `_pdfCanvas`; o editor desenha SVG a partir de um
único `state.numSvgImage`. Dois elementos SVG diferentes na mesma numeração são
indistinguíveis no editor — os dois mostram a mesma imagem.

**✅ Corrigido na v490.** Os dois tipos são por elemento: cada um tem seu
`svg_content`/`pdf_content`, seu `_svgImage`/`_pdfCanvas` e seu `natural_w_mm`.

### E3. O salvamento achata tudo num arquivo só

`saveNumeracao()` faz, para **todo** elemento (`:6122` e `:6125`):

```js
if (e.type === 'SVG') e.svg_content = svgUrl || e.svg_content || "";
if (e.type === 'PDF') e.pdf_content = pdfUrl || e.pdf_content || "";
```

`svgUrl` e `pdfUrl` são os arquivos de **nível de numeração**. Ou seja: o modelo de
dados permite N elementos PDF/SVG com conteúdos distintos, mas salvar sobrescreve
todos com o mesmo arquivo. Um segundo PDF diferente é impossível de manter — some no
primeiro save.

Isso é coerente com E2 e com o `editNumeracao()` (`:2898-2903`), que recupera o
`pdf_content` da numeração a partir do **primeiro** elemento PDF que encontrar.

**✅ Corrigido na v490.** O save sobe o arquivo de cada elemento separadamente e não
sobrescreve mais ninguém. As colunas `svg_content`/`pdf_content` da numeração
continuam sendo escritas, derivadas do primeiro elemento de cada tipo — porque
`svg_content` é o marcador de CAMAROTE lido por `engine.py:222` e mais três pontos.

### E4. Três comportamentos diferentes quando o arquivo não carregou

| Renderizador | O que mostra |
|---|---|
| Editor (`:3908`) | caixa com `PDF (Sem arquivo)` |
| Janela de arte (`:20856`) | caixa com `PDF` |
| Export de gabarito (`:25505`) | **nada** — não desenha e não avisa |

O terceiro é o problemático: exportar o gabarito antes de os arquivos terminarem de
carregar produz um PDF com o elemento faltando, sem qualquer sinal. A espera de
`:21228` cobre a janela de arte com um teto de 3 segundos, e depois desse teto segue
em frente do mesmo jeito.

---

## Detalhes menores

- ~~**`_svgLoading` não é sanitizado.**~~ Corrigido na v490: entrou no
  destructuring do save. O texto original segue abaixo.

- **`_svgLoading` não é sanitizado.** As duas listas que limpam campos internos —
  `frontend/script.js:9089` (payload da imposição) e os destructurings de `:3091` e
  `:6120` (duplicar e salvar) — removem `_pdfCanvas`, `_pdfLoading`, `_svgImage` e
  `_pdfPreview`, mas nenhuma remove `_svgLoading`, que é criado em `:20863`. Ele pode
  ser persistido no banco e enviado ao engine. Inofensivo hoje, mas é sujeira que
  contradiz a intenção das listas.

- **Bounds e desenho discordam no engine quando falta `width_mm`.**
  `_get_element_bounds` (`engine.py:461`) assume 20mm por default; o desenho do
  elemento PDF (`:769-771`) usa o tamanho natural do PDF quando `width_mm` é `None`.
  Um elemento sem dimensão é posicionado como se tivesse 20mm e desenhado com o
  tamanho real.

- **O `except` do elemento PDF também é silencioso** (`engine.py:776-778`): imprime e
  segue, produzindo PDF sem o elemento. Mesmo padrão do B1.

---

## Ordem sugerida de ataque

1. ~~**B1**~~ — feito na v489.
2. ~~**B2**~~ — feito na v489.
3. ~~**B3**~~ — feito na v489, junto com o B2 (sem tamanho natural correto, "escala
   100%" não significa nada).
4. ~~**E1**~~ — feito na v490.
5. ~~**E3/E2**~~ — feito na v490: a numeração suporta N arquivos, um por elemento.
6. **E4** — unificar o comportamento de "arquivo não carregou", em especial o export
   de gabarito, que não desenha nada e não avisa.

## Como reproduzir as medições

Os scripts usados estão descritos aqui para quem quiser refazer:

- **B1 e B2**: script Python avulso que reproduz o ramo SVG do engine literalmente e
  compara `keep_proportion` `True`/`False` medindo a área pintada de um `pixmap`.
- **B3 e E1**: scripts Puppeteer contra o app na porta 9123 (ver skill `rodar-app`),
  medindo `img.width` de três SVGs e inspecionando `window.state` versus `state`.

Dentro de `page.evaluate` use os nomes nus `state` e `supabaseClient` — `const`/`let`
de topo de script clássico não viram propriedade de `window`.
