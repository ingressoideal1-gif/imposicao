---
name: elementos-pdf-svg
description: Leia ANTES de mexer em elementos de numeração do tipo PDF ou SVG — a box "Adicionar Pdf e Svg" do editor, o upload desses arquivos, o desenho deles em qualquer canvas, a escala/tamanho original, o ramo SVG ou PDF do engine.py, ou a Arte de Fundo do editor de numeração. Cobre as três regras que, se quebradas, fazem a tela mostrar uma coisa e o papel sair outra.
---

# Antes de mexer em elemento PDF ou SVG

Leia **`docs/fluxo_elementos_pdf_svg.md`** por inteiro. Ele mapeia as dez etapas do
caminho, do upload ao papel, com as linhas conferidas contra a v490, e registra o que
foi **medido** em cada achado — não deduzido.

Três regras carregam o resto:

1. **Nunca use `ctx.drawImage(img, x, y, w, h)` cru num elemento PDF/SVG.** Use
   `drawImageContain()`. O `engine.py` impõe esses dois tipos com
   `keep_proportion=True` — as únicas duas ocorrências de `True` no arquivo, contra
   nove de `False` —, então um `drawImage` de cinco argumentos estica na tela o que o
   papel vai encaixar. A regra do produto, dada pelo usuário, é: **tamanho original,
   escala 100%, sem distorção**.

2. **O tamanho impresso de um SVG é o que o `svglib` calcula, não o que o navegador
   mede.** Eles coincidem quando o arquivo declara dimensão absoluta e divergem
   quando não declara — aí o navegador chuta 300×150 px. Por isso o tamanho natural
   sai de `svgNaturalSizeMm()`, que lê o texto do arquivo. As oito convenções
   (`px`, `pt`, `cm`, `in`, `mm`, só `viewBox`, `%`, nenhuma) estão medidas nos dois
   lados no documento.

3. **O arquivo é do elemento, não da numeração.** Cada elemento tem seu
   `pdf_content`/`svg_content`, seu nome e seu `natural_w_mm`. As colunas
   `svg_content`/`pdf_content` da **numeração** ainda são escritas, derivadas do
   primeiro elemento de cada tipo — **não remova isso**: `svg_content` da numeração é
   o marcador de CAMAROTE lido por `engine.py:222` e mais três pontos, que testa se o
   nome do arquivo contém "CAMAROTE".

Desde a v506 existe uma quarta regra: cada elemento PDF/SVG tem uma **Finalidade**
(`render_mode`), `"print"` ou `"layout"`. Um elemento de Layout aparece nas janelas
que mostram **como a peça vai ficar** (editor, janela de arte, modo PDF, link do
cliente, Criador de Arte) e some das que prometem **o comportamento da impressão** —
a prévia de imposição, o PDF Gabarito e o `engine.py`. Ao acrescentar renderizador
novo, é essa a pergunta a responder, não "é canvas ou é PDF". Use
`elementoSoLayout()` / `numeracaoSemElementosDeLayout()` no frontend e `_so_layout()`
no `engine.py`, e não remova a filtragem do payload achando que a do engine basta: o
`NewProd.exe` roda uma cópia congelada do `engine.py`.

E uma armadilha de história: até a v489 o PDF da numeração também servia de **Arte de
Fundo** do canvas, e reabrir uma numeração pintava o PDF do elemento por baixo a 55%
de opacidade — o "fantasma". A arte de fundo é `state.bgImage` e mais nada. Se um
renderizador novo precisar de um fundo, é de lá que ele sai.

`svglib` e `reportlab` são obrigatórios para impor SVG e estão no `requirements.txt`.
O `NewProd.exe` carrega uma cópia congelada do `engine.py`: enquanto não for
reconstruído com essas bibliotecas no bundle, uma imposição feita por ele sai sem os
SVGs.

Para subir o app e conferir no navegador, use a skill `rodar-app`. Não há framework de
teste de frontend; a verificação é Puppeteer na porta 9123 mais um teste do engine
impondo de verdade e medindo o PDF gerado.
