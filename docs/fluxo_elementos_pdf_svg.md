# Fluxo dos elementos PDF e SVG da numeração

Análise ponta a ponta dos elementos de tipo `PDF` e `SVG` de uma numeração, do
upload até o papel. Data: 2026-08-08, contra a v488.

Tudo que está marcado como **medido** foi verificado executando código, não lendo.
Os comandos estão no fim de cada achado.

## O caminho, em sete etapas

| # | Etapa | Onde |
|---|---|---|
| 1 | Upload do arquivo | `frontend/script.js:4820` (SVG), `:4940` (PDF) |
| 2 | Criação do elemento | `frontend/script.js:5142` (SVG), `:5144` (PDF) |
| 3 | Canvas do editor | `drawElement()`, `frontend/script.js:3879` |
| 4 | Persistência | `saveNumeracao()`, `frontend/script.js:6062-6125` |
| 5 | Janela combinada de arte | `renderItemAmostraCombinada()`, `frontend/script.js:20834` |
| 6 | Preview de imposição | `drawVdpElements()`, `frontend/script.js:7476` |
| 7 | Geração do PDF | `engine.py:721` (SVG), `:746` (PDF) |
| 8 | Impressão | `app.py:1024` — só reenvia o PDF do engine ao spooler |

A impressão não re-renderiza nada: recebe o PDF que o engine gerou e manda para a
impressora. Logo, **o que o engine faz é o que sai no papel**, e qualquer divergência
entre tela e engine é divergência entre tela e papel.

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

### B3. O tamanho inicial do SVG está errado para as duas convenções mais comuns

`frontend/script.js:4833` deriva os milímetros de `(img.width / 96) * 25.4`, ou
seja, assume que o SVG declara tamanho em pixels a 96 DPI.

**Medido**, com três SVGs que descrevem exatamente o mesmo desenho de 100×50:

| SVG | `img.width` | mm calculados |
|---|---|---|
| `width="100" height="50"` | 100×50 | **26,5 × 13,2** |
| só `viewBox="0 0 100 50"` | 300×150 | **79,4 × 39,7** |
| `width="100mm" height="50mm"` | 378×189 | **100 × 50** ✓ |

Só a terceira convenção acerta. A segunda é pior do que parece: 300×150 é o
**tamanho default do navegador** para SVG sem dimensão intrínseca — o número não tem
relação nenhuma com o desenho.

O elemento PDF não tem esse problema: `:4961` usa o viewport real em pontos, com a
conversão correta de 72 pt/polegada.

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

### E2. PDF é por elemento, SVG é global

O elemento PDF carrega seu próprio `_pdfCanvas`; o editor desenha SVG a partir de um
único `state.numSvgImage`. Dois elementos SVG diferentes na mesma numeração são
indistinguíveis no editor — os dois mostram a mesma imagem.

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

1. **B1** — instalar `svglib`/`reportlab` e colocá-los no `requirements.txt`. É o
   único achado que faz o produto sair errado do jeito mais caro: papel impresso.
2. **B2** — decidir entre esticar e preservar, e alinhar os dois lados.
3. **E1** — unificar a fonte da imagem do SVG em `el._svgImage`, que é a única das
   quatro que funciona por elemento e já é usada por dois renderizadores.
4. **B3** — corrigir a derivação de milímetros do SVG, preferindo `viewBox` quando
   houver, e avisar quando o SVG não declarar dimensão física.
5. **E3/E2** — decidir se a numeração suporta um ou N arquivos, e fazer o save
   refletir a decisão.
6. O resto.

## Como reproduzir as medições

Os scripts usados estão descritos aqui para quem quiser refazer:

- **B1 e B2**: script Python avulso que reproduz o ramo SVG do engine literalmente e
  compara `keep_proportion` `True`/`False` medindo a área pintada de um `pixmap`.
- **B3 e E1**: scripts Puppeteer contra o app na porta 9123 (ver skill `rodar-app`),
  medindo `img.width` de três SVGs e inspecionando `window.state` versus `state`.

Dentro de `page.evaluate` use os nomes nus `state` e `supabaseClient` — `const`/`let`
de topo de script clássico não viram propriedade de `window`.
