---
name: elementos-pdf-svg
description: Leia ANTES de mexer em elementos de numeração do tipo PDF ou SVG — a box "Adicionar Pdf e Svg" do editor, o upload desses arquivos, o desenho deles em qualquer canvas, a escala/tamanho original, o ramo SVG ou PDF do engine.py, ou a Arte de Fundo do editor de numeração. Cobre as regras que, se quebradas, fazem a tela mostrar uma coisa e o papel sair outra — a primeira delas, nunca rasterizar a arte do cliente, já custou uma reversão inteira.
---

# Antes de mexer em elemento PDF ou SVG

Leia **`docs/fluxo_elementos_pdf_svg.md`** por inteiro. Ele mapeia as dez etapas do
caminho, do upload ao papel, com as linhas conferidas contra a v490, e registra o que
foi **medido** em cada achado — não deduzido.

Cinco regras carregam o resto, e a primeira é a mais cara:

1. **Nunca rasterize a arte do cliente.** O PDF e o SVG do elemento entram no papel
   como vetor, por `show_pdf_page`, e é assim que têm de continuar — texto continua
   texto, fonte continua embutida, CMYK não vira RGB. Em 18/08/2026 a transparência
   foi implementada rasterizando a 300 dpi quando a opacidade caía abaixo de 100%, e o
   usuário mandou **reverter tudo**: *"rasterizar o pdf em imagem esta fora de
   cogitação"*. Numa gráfica, trocar a resolução do RIP por uma escolhida no código é
   perda que só aparece no papel impresso, onde nem teste nem tela conseguem medir. Se
   a única implementação de um recurso passa por rasterizar, a resposta certa é dizer
   que não dá. A transparência acabou saindo pelo caminho vetorial — `ExtGState` com
   `/ca` mais um grupo de transparência, na `_colar_arte_pdf()` do `engine.py` — e a
   seção "Opacidade" do documento explica os dois detalhes que a fazem sair certa.

2. **Nunca use `ctx.drawImage(img, x, y, w, h)` cru num elemento PDF/SVG.** Use
   **`drawArteDoElemento()`**, que desenha sem distorcer e com a opacidade do
   elemento — são dez janelas, e cada uma que desenhe por conta própria é uma que
   mostra o que o papel não faz. O `engine.py` impõe esses dois tipos com
   `keep_proportion=True` — as únicas duas ocorrências de `True` no arquivo, contra
   nove de `False` —, então um `drawImage` de cinco argumentos estica na tela o que o
   papel vai encaixar. A regra do produto, dada pelo usuário, é: **tamanho original,
   escala 100%, sem distorção**.

3. **Girar o elemento gira a CAIXA, não só o conteúdo.** Um PDF ou SVG de 40 × 20 mm
   a 90 graus ocupa 20 × 40 mm na peça — é o que o canvas sempre fez. O motor mantinha
   o retângulo em pé e mandava o PyMuPDF girar o conteúdo dentro dele; com
   `keep_proportion=True`, a arte **encolhia** para caber. Medido em 27/08/2026: a
   tela mostrava 20,00 × 40,00 e o papel saía com **10,08 × 19,98** — um quarto da
   área. Quem monta o retângulo é **`_caixa_girada()`**, no topo do `engine.py`; todo
   ramo novo que cole arte numa caixa tem de passar por ela. Ver
   `docs/fidelidade_tela_papel.md`.

4. **O tamanho impresso de um SVG é o que o `svglib` calcula, não o que o navegador
   mede.** Eles coincidem quando o arquivo declara dimensão absoluta e divergem
   quando não declara — aí o navegador chuta 300×150 px. Por isso o tamanho natural
   sai de `svgNaturalSizeMm()`, que lê o texto do arquivo. As oito convenções
   (`px`, `pt`, `cm`, `in`, `mm`, só `viewBox`, `%`, nenhuma) estão medidas nos dois
   lados no documento.

5. **O arquivo é do elemento, não da numeração.** Cada elemento tem seu
   `pdf_content`/`svg_content`, seu nome e seu `natural_w_mm`. As colunas
   `svg_content`/`pdf_content` da **numeração** ainda são escritas, derivadas do
   primeiro elemento de cada tipo — **não remova isso**: `svg_content` da numeração é
   o marcador de CAMAROTE lido por `engine.py:222` e mais três pontos, que testa se o
   nome do arquivo contém "CAMAROTE".

Desde a v506 existe uma sexta regra: cada elemento PDF/SVG tem uma **Finalidade**
(`render_mode`), `"print"` ou `"layout"`. Um elemento de Layout aparece nas janelas
que mostram **como a peça vai ficar** (editor, janela de arte, modo PDF, link do
cliente, Criador de Arte) e some das que prometem **o comportamento da impressão** —
a prévia de imposição, o PDF Gabarito e o `engine.py`. Ao acrescentar renderizador
novo, é essa a pergunta a responder, não "é canvas ou é PDF". A única exceção confirma
a regra: o checkbox 🎨 AMOSTRA da prévia do Painel de Produção troca a promessa daquela
janela para "peça acabada", e por isso mostra os elementos de Layout — só no
`pedido.js`, nunca no `script.js`, e sem mexer no payload enviado ao motor. Use
`elementoSoLayout()` / `numeracaoSemElementosDeLayout()` no frontend e `_so_layout()`
no `engine.py`, e não remova a filtragem do payload achando que a do engine basta: o
`NewProd.exe` roda uma cópia congelada do `engine.py`.

E uma armadilha de história: até a v489 o PDF da numeração também servia de **Arte de
Fundo** do canvas, e reabrir uma numeração pintava o PDF do elemento por baixo a 55%
de opacidade — o "fantasma". A arte de fundo **desenhada** é `state.bgImage` e mais nada: se um
renderizador novo precisar de um fundo, é de lá que ele sai.

Desde 26/08/2026 há três campos ao lado dela — `bgFile`, `bgUrl`, `bgFilename` — que
não desenham nada: dizem se aquele fundo **pertence à numeração** e portanto se o save
deve guardá-lo. Só a numeração exclusiva de cliente guarda (colunas `bg_url` e
`bg_filename`); o fundo que vem da cor do formato base continua sendo da cor. O que
sobe ao Storage é o **arquivo original**, nunca o `bgImage` — ele é a rasterização
feita para a tela, e gravá-la quebraria a regra 1. Ver "A arte de fundo fica guardada"
em `docs/lista_de_numeracoes.md`.

Uma regra que vale para todo elemento, não só para estes dois: **tela e papel medem
com a mesma régua**. Onde a mesma grandeza é derivada nos dois lados — a altura de uma
fonte, a largura de uma barra, o retângulo de um elemento girado —, ela tem de vir da
mesma origem, e não de duas aproximações que casam por sorte. As sete divergências
levantadas e corrigidas em 27/08/2026 estão em `docs/fidelidade_tela_papel.md`, com a
medição de tinta de cada uma e o molde para medir um caso novo.

`svglib` e `reportlab` são obrigatórios para impor SVG e estão no `requirements.txt`.
O `NewProd.exe` carrega uma cópia congelada do `engine.py`: enquanto não for
reconstruído com essas bibliotecas no bundle, uma imposição feita por ele sai sem os
SVGs.

Para subir o app e conferir no navegador, use a skill `rodar-app`. Não há framework de
teste de frontend; a verificação é Puppeteer na porta 9123 mais um teste do engine
impondo de verdade e medindo o PDF gerado.
