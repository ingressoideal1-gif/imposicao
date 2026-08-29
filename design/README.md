# Prancheta de desenho

As telas desenhadas antes de virarem código. Cada `.dc.html` é um quadro; o
`canvas.json` diz onde cada um fica.

| Arquivo | O quadro |
|---|---|
| `Main.dc.html` | a Montagem em uso |
| `Vazia.dc.html` | como a tela abre |
| `Recusa.dc.html` | quando uma célula não combina |

O arquivo montado (`montagem.html`, 2,4 MB) **não é versionado**: ele tem o
editor inteiro embutido e se refaz do zero a partir destes arquivos. Para
remontá-lo, rode o `/design` no Claude Code — ele traz a ferramenta que junta as
fontes e publica.

Estes desenhos são **registro da decisão**, não a tela que está no ar. A tela de
verdade é a `#view-montagem` do [`frontend/index.html`](../frontend/index.html),
descrita em [`docs/montagem.md`](../docs/montagem.md) — e ela se afasta do
desenho em pelo menos um ponto de propósito: o botão *Imprimir na estação* do
desenho não existe na primeira versão, que gera o PDF e deixa a impressão para o
caminho já aprovado do Pedido.
