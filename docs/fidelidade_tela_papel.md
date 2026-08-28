# Fidelidade entre a tela e o papel

Onde as janelas do app e o motor de imposição concordam sobre **tamanho e posição**
dos elementos de numeração, e onde eles discordavam. Levantamento de 27/08/2026,
corrigido no mesmo dia e refeito contra o código corrigido.

Tudo aqui foi **medido**, não deduzido: o papel veio do próprio `_render_element`
do `engine.py` rasterizado a 600 dpi, com a mancha de tinta lida pixel a pixel; a
tela veio das funções reais do frontend rodando num Chrome sem cabeça, com o mesmo
arquivo de fonte. Os scripts estão descritos em "Como refazer as medições".

> **Por que isto importa.** A impressão não re-renderiza nada: ela recebe o PDF que o
> motor gerou e o manda ao spooler. Logo, **o que o motor faz é o que sai no papel**, e
> qualquer divergência entre janela e motor é divergência entre a tela e o papel — que
> o operador só descobre depois de a folha sair.

---

## A regra

**Os dois lados medem com a mesma régua.** Quando uma janela e o motor precisam da
mesma grandeza — a altura de uma fonte, a largura de uma barra, o retângulo de um
elemento girado —, os dois têm de derivá-la da mesma origem, e não de duas
aproximações que casam por sorte.

Onde a mesma coisa é desenhada em dez lugares, o desenho tem **um dono só**: é a
razão de existirem o `frontend/qr-canvas.js`, o `frontend/barcode-canvas.js` e o
`frontend/fonte-canvas.js`. Cópia que divergiu já custou defeito de produção três
vezes neste projeto.

---

## O que foi corrigido

Cinco levas, cada uma com o teste escrito **antes** do conserto e a medição de tinta
depois. As três primeiras não mudam nada do que já foi impresso; as duas últimas
mudam, e por isso saíram por último.

### 1. A altura do texto vinha de uma média, não do arquivo da fonte

O navegador, com `textBaseline='middle'`, usa o `sTypoAscender` e o `sTypoDescender`
da tabela OS/2 do **arquivo** da fonte, normalizados para somarem o corpo. Medido em
nove fontes, a fração bate até a quinta casa decimal:

```
deslocamento = corpo × ( typoAsc / (typoAsc + |typoDesc|) − 0,5 )
```

O motor usava uma fração fixa (0,72 e 0,21) para toda fonte que não fosse uma das
seis embutidas no PDF, **e uma conta diferente** — `(asc − desc) / 2`, que só
coincide quando os dois somam 1, e quase nenhuma fonte real soma.

| Fonte | Fração do corpo que o motor errava | A 12 pt | A 40 pt |
|---|---:|---:|---:|
| Impact | +0,1211 | +0,51 mm | +1,71 mm |
| Courier New (apelido `cour`) | +0,0553 | +0,23 mm | +0,78 mm |
| Verdana | +0,0323 | +0,14 mm | +0,46 mm |
| Times New Roman (apelido `times`) | +0,0296 | +0,13 mm | +0,42 mm |
| Arial (apelido `helv`) | +0,0203 | +0,09 mm | +0,29 mm |
| Comic Sans MS Bold | −0,0111 | −0,05 mm | −0,16 mm |

Positivo quer dizer que o papel imprimia a linha **mais alta** do que a tela mostrava.

**Onde:** `_fracao_tipografica`, `_fracao_das_base14` e `_fracao_do_meio_da_fonte`, no
topo do `engine.py`; o uso fica no ramo de texto do `_render_element`.

**Cuidado que a implementação exige.** Não dá para usar `fitz.Font.ascender`: ele
devolve as medidas da tabela `hhea`, que são outras — medido, a `hhea` erra até 0,049
do corpo, quatro vezes mais do que a média fixa que ela substituiria. A leitura é da
OS/2, direto dos bytes, cacheada por caminho. Arquivo que não se deixa ler volta para
a média de sempre e avisa no log: fonte estranha não pode derrubar a imposição com o
operador na frente da impressora.

**Alcance no acervo:** 287 dos 350 elementos de texto foram medidos (o resto usa fonte
que só existe no catálogo da nuvem). 85 % se moviam menos de 0,15 mm; 16 elementos
passavam de meio milímetro, todos em Impact. O maior deles é a numeração `1000540`, em
Impact 35 — ver `docs/CHANGELOG.md` de 27/08/2026.

### 2. Girar um elemento girava só o conteúdo, não a caixa

O canvas gira a caixa: um elemento de 40 × 20 mm a 90° passa a ocupar 20 × 40 na peça.
O motor mantinha o retângulo em pé e mandava o PyMuPDF girar o conteúdo dentro dele —
e como PDF, SVG e foto entram com encaixe proporcional, a arte encolhia para caber.

```
SVG 40×20 a 90°     tela 20,00 × 40,00      papel 10,08 × 19,98   (um quarto da área)
FOTO 25×32 a 90°    tela 32,00 × 25,00      papel 25,06 × 19,64
BARCODE 60×12 a 90° tela 12,00 × 60,00      papel 53,43 × 12,02
```

A rotação é um seletor de quatro opções no cartão de **todo** elemento, então o defeito
estava a um clique de distância.

**Onde:** `_caixa_girada` no `engine.py`, usada pelos ramos SVG, PDF e FOTO. O código
de barras resolveu por outro caminho — ver a leva 3.

### 3. O código de barras imprimia 89 % da altura, e a tela desenhava um código falso

A imagem que o `python-barcode` devolve traz uma faixa branca fixa de 1 mm em cima e
outra embaixo, somadas ao `module_height`, e ela era esticada junto para preencher a
caixa. Medido: um elemento de 60 × 12 mm imprimia barras de **60,03 × 10,67**.

Recortar a folga da imagem custaria caro — medido, gerar o PNG leva 4,58 ms por código
e recortar somaria outros 2,01 ms, mais de três minutos numa tiragem de 100.000 peças.
Então as barras deixaram de ser imagem: o motor pede só o **padrão de módulos**
(`build()`) e desenha retângulos vetoriais. Três ganhos de uma vez:

- a altura é a pedida **por construção** — não há folga para esticar;
- o traço sai na resolução do RIP da impressora, e não nos 300 dpi que o código
  escolhia — o mesmo princípio que vale para a arte do cliente;
- fica mais rápido, em vez de mais lento.

O fundo branco continua: é o contraste que o leitor pede quando o código cai sobre arte
colorida. E o giro passou a ser um `morph`, que gira a caixa por construção.

**Conferido antes de trocar:** nas seis simbologias que o motor aceita, a imagem antiga
desenhava **todas** as barras com a mesma altura (linhas 11 a 188 de 200). Não há barra
de guarda mais comprida a reproduzir.

Do lado da tela, as dez janelas pintavam um padrão **fixo de 40 barras**, igual para
qualquer valor e qualquer simbologia. Tamanho e posição do bloco estavam certos — e é
por isso que ninguém notava —, mas o operador não tinha como ver se o Code 128 daquele
número ficaria denso demais para a largura escolhida.

**Onde:** `_modulos_do_barcode` e o ramo `BARCODE` do `_render_element`, no `engine.py`;
`frontend/barcode-canvas.js` na tela.

> **O `barcode-canvas.js` não pode usar "um" algoritmo de Code 128.** Ele usa
> exatamente o do `python-barcode`, que é quem monta o papel: as tabelas foram
> extraídas da própria biblioteca e os algoritmos são espelho dos de lá, inclusive a
> troca de conjunto A/B/C — que é onde duas implementações honestas divergem. Um número
> de módulos diferente muda a largura de cada barra na tela, e a tela voltaria a mentir,
> agora com um desenho convincente. `tests/test_barcode_canvas.py` compara os dois lados
> valor a valor, em 15 casos.

### 4. A sangria era aparada na pose girada

O motor tem dois caminhos para montar um ingresso na folha:

- **pose sem giro** — arte e elementos vão direto na folha, em coordenadas absolutas. O
  que passa da borda do ingresso continua no papel: é a **sangria**, a sobra que protege
  do desvio da guilhotina.
- **pose com giro** (ou folha com nome de arte) — o ingresso é montado numa página
  temporária e colado girado. Essa página era do tamanho **exato** do ingresso, e uma
  página de PDF recorta o próprio conteúdo na borda: tudo o que passava do corte deixava
  de existir.

Medido numa imposição completa no formato `Credencial 90x140`, que gira as poses 2 e 3
em 180°, com um elemento de 110 × 154 mm num ingresso de 105 × 148:

```
pose 0 e 1 (sem giro)   ->  2,45 mm de tinta além do corte
pose 2 e 3 (180 graus)  ->  0,00 mm
```

Metade das credenciais de cada folha saía sem a sobra. Levantamento do banco no mesmo
dia: **45 elementos PDF de 21 numerações passam da borda de propósito**, e todos usam
esse formato.

**A regra que a medição decidiu: sangrar sempre.** O que passa da borda é sangria de
credencial, e era a pose girada que a destruía.

**Onde:** `_folga_de_sangria` no `engine.py`. A página temporária nasce com um ingresso
de folga para cada lado, e a colagem estica o retângulo da célula na mesma medida. A
folga é **simétrica de propósito**: o centro não se move, então o giro continua em torno
do mesmo ponto e a arte cai onde sempre caiu. A área extra é transparente — não pinta
nada nem cobre a célula vizinha.

Por que um ingresso inteiro, e não uma margem calculada: medir a sobra de cada elemento
antes de desenhar exigiria adivinhar a largura de um texto que ainda não foi montado, e
um chute que erra para menos volta a aparar em silêncio.

### 5. Duas janelas desenhavam antes de a fonte chegar, e uma esquecia o QR Ideal

Canvas não reflui. Se o arquivo da fonte ainda está baixando na hora do traço, o
navegador desenha com uma genérica e **não redesenha** quando ela chega. E o prejuízo
não é só de desenho: como a centralização usa a largura **medida** do texto, a fonte
errada desloca também a posição do número na peça.

O `script.js` e o `cliente.js` já esperavam. A prévia do Painel de Produção
(`pedido.js`) e a camada de numeração do Criador de Arte (`criador-arte.js`) não.

Há duas formas de esperar, e as duas valem: quem pinta de dentro de uma função `async`
**aguarda** e sai certo de primeira; quem pinta de função síncrona dispara a busca e
manda **redesenhar** quando a fonte chega.

No mesmo arquivo, a camada 2 do Criador de Arte não tinha ramo para `QR_IDEAL`: o
elemento não pintava um pixel — e nem a caixa vazia dos elementos sem arquivo. Quem
montava a arte via o ingresso **sem** o QR que vai ser impresso.

**Onde:** `tests/test_espera_de_fonte_nas_janelas.py` prende as quatro janelas;
`tests/test_qr_canvas.py` prende o ramo do QR Ideal.

---

## O estudo refeito

Mesmo método, contra o código corrigido. **19 de 19 eixos dentro do alvo.**

| Eixo medido | Antes | Agora |
|---|---:|---:|
| texto Verdana, corpo 40 (papel − tela) | −1,36 pt | −0,05 pt |
| texto Comic Sans Bold, corpo 40 | +0,42 pt | −0,06 pt |
| texto Courier New Bold, corpo 40 | +0,08 pt | −0,04 pt |
| texto Segoe UI Semibold It., corpo 40 | −0,85 pt | −0,07 pt |
| texto Impact, corpo 40 | −4,86 pt | +0,06 pt |
| código de barras 60 × 12 — altura | 10,67 mm | 12,02 mm |
| código de barras 60 × 12 — largura | 60,03 mm | 59,99 mm |
| código de barras a 90° | 53,43 × 12,02 | 12,02 × 59,94 |
| código de barras entra como imagem? | sim, 300 dpi | não, vetor |
| SVG 40 × 20 a 90° | 10,08 × 19,98 | 19,98 × 39,96 |
| PDF 40 × 20 a 90° — largura | 10,08 mm | 19,98 mm |
| foto 25 × 32 a 90° | 25,06 × 19,64 | 32,09 × 25,06 |
| SVG 40 × 20 sem giro — largura | 40,05 mm | 40,05 mm |
| QR de 15 mm — lado impresso | 15,07 mm | 15,07 mm |
| sangria na pose sem giro | 2,45 mm | 2,45 mm |
| sangria na pose girada 180° | 0,00 mm | 2,50 mm |

---

## O que já conferia, e continua conferindo

Vale saber, porque é a maior parte — e porque quase tudo foi conquistado em correções
anteriores, registradas em `docs/fluxo_elementos_pdf_svg.md`.

| Eixo | Como os dois lados chegam ao mesmo número |
|---|---|
| Grade da folha | Fórmula idêntica e mesma constante `MM2PT = 2.8346` nos dois lados: `start = (folha − usada) / 2`, `célula = start + col × (item + gap)` |
| Âncora do elemento | `x_mm`, `y_mm` são o **centro**, dos dois lados |
| Largura do texto | O motor mede o arquivo real da fonte com `fitz.Font`; a tela usa `measureText`. Diferença ≤ 0,2 % |
| QR Code | Mesma contagem de módulos e margem zero nos dois lados — conferido em 7 conteúdos |
| Tamanho de PDF e SVG | `keep_proportion=True` no motor, `drawArteDoElemento()` na tela |
| Janela da foto | O retângulo do elemento é a janela, dos dois lados |

---

## O piso de medição de cada janela

Um erro menor que um pixel da janela é invisível ali, por mais real que seja no papel.
Isso muda onde vale a pena procurar.

| Janela | Escala | 1 pixel vale |
|---|---|---|
| Editor de numeração | até 17 px/mm | 0,06 mm |
| PDF Gabarito | 8 px/mm (~203 dpi) | 0,13 mm |
| Janelas de arte, amostra, card do pedido, link do cliente | 150 dpi fixos | 0,17 mm |
| Prévia de imposição | `min(1920/larg, 1360/alt)` — ~3 px/mm numa SRA3 | 0,33 mm |

---

## Divergências que são de propósito

Estas aparecem em qualquer varredura e **não são defeito**. Registradas para não
virarem correção por engano.

- **O picote nunca é impresso.** Ele cruza o canvas do editor, das janelas de arte e do
  gabarito como linha tracejada, e o motor o ignora. É guia de acabamento, não tinta.
- **O QR Ideal do editor é exemplo.** O editor é um modelo reutilizável e não sabe de
  pedido nenhum; o código real só existe quando o trabalho tem pedido.
- **Elemento de Finalidade "Layout".** Aparece nas janelas que mostram como a peça fica
  e some das que prometem o comportamento da impressão. Ver
  `docs/fluxo_elementos_pdf_svg.md`.
- **O `page_rotate` do formato.** A página do PDF sai girada e a prévia mostra a folha em
  pé. É atributo de página: a impressora resolve, e a geometria do conteúdo não muda.

---

## O que ficou de fora, e por quê

- **A tela ainda recorta na linha de corte.** A sangria que agora sai certa no papel não
  aparece em janela nenhuma — todas desenham num canvas do tamanho exato da peça.
  Mostrá-la faz a arte de uma peça invadir a vizinha na prévia, que é a verdade do papel
  mas é mudança visual numa tela já aprovada.
- **O PDF Gabarito desenha um QR falso** de 7 × 7 blocos. Pode ser guia de posição de
  propósito; a decisão é do usuário.
- **Defaults divergentes do código de barras** quando falta `width_mm`: o motor assume
  60 × 12, o editor e a prévia de imposição 40 × 10, e as janelas de arte 30 × 8 — estas
  por um campo `barcode_width_mm` que nada no projeto jamais escreve. Só afeta elemento
  sem dimensão gravada, e não há nenhum no acervo.

---

## A janela de sincronização

**O motor viaja dentro do `NewProd.exe`.** As correções que tocam o papel só chegam a
uma estação quando ela atualiza o agente — publicar só o site deixaria a tela nova e o
papel velho, que é exatamente o problema que estas correções resolvem. Site e agente
saem na mesma leva, sempre.

E há o caminho inverso: a lista `PAINEL_ARQUIVOS`, que decide o que cada estação baixa,
também mora dentro do agente. Uma estação com agente antigo baixa o `index.html` novo,
que já pede o `barcode-canvas.js`, e recebe 404. Por isso o `script.js` e o `cliente.js`
trazem uma **reserva**: sem o módulo, avisam no console e desenham a caixa vazia, em vez
de derrubar o desenho inteiro do canvas com `TypeError`. É a mesma rede que o
`qr-canvas.js` tem desde a v559.

---

## Como refazer as medições

Os cinco arquivos de teste refazem sozinhos o essencial, e cada um falhou antes de o
conserto existir:

| Arquivo | O que prende |
|---|---|
| `tests/test_engine_altura_do_texto.py` | a tinta do texto contra a posição medida no Chrome, em cinco fontes |
| `tests/test_engine_giro_do_elemento.py` | a pegada de SVG, PDF e foto nos quatro giros |
| `tests/test_engine_codigo_de_barras.py` | altura, largura, giro, o padrão de cada simbologia e o desenho vetorial |
| `tests/test_engine_sangria.py` | a sangria nas poses com e sem giro, numa imposição completa |
| `tests/test_barcode_canvas.py` | a paridade do desenho da tela com o do motor, valor a valor |
| `tests/test_espera_de_fonte_nas_janelas.py` | as quatro janelas esperando a fonte |

Para medir um caso novo, o molde é sempre o mesmo:

**No papel.** Montar o elemento com `_x`/`_y` já em pontos, chamar
`ImpositionEngine._render_element` numa página `fitz`, rasterizar com
`page.get_pixmap(dpi=600)` e varrer os bytes procurando o menor e o maior pixel escuro.
A caixa da tinta em milímetros sai dividindo por `dpi/72` e por `MM2PT`.

**Na tela.** Carregar os arquivos reais do frontend (`fonte-canvas.js`,
`texto-ajuste.js`, `qr-canvas.js`, `barcode-canvas.js`) num Chrome sem cabeça pelo
puppeteer do próprio repositório, desenhar com a mesma função que a janela usa, e ler a
mancha com `getImageData`. Para medir fonte, injetar o arquivo com `FontFace` e esperar
`document.fonts.ready` — senão o traço sai com a genérica e a medida mente.

Para subir o app e conferir numa página de verdade, ver a skill `rodar-app`. A conferência
que teste nenhum faz é essa: o módulo novo carregar nas três páginas reais.
