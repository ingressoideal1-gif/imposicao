# Como a arte entra na peça — e por que a tela tem de copiar a impressora

**Leia antes de mexer em qualquer janela que mostre a arte de um modelo.** Este documento
existe porque a mesma arte é desenhada por **seis** programas diferentes, e durante muito
tempo eles não concordavam. O sintoma que isso produz é sempre o mesmo, e é o pior possível
numa gráfica: **a tela mostra uma coisa e o papel sai outra.**

| quem desenha | arquivo | onde aparece |
|---|---|---|
| o renderizador canônico | `drawAmostraFace()` em `frontend/script.js` | card do pedido em arte, e a janela ampliada, que copia o bitmap dele |
| a cópia do link do cliente | `drawAmostraFace()` em `frontend/cliente.js` | página pública de aprovação |
| o editor | `carregarArteBaseNoCanvas()` em `frontend/criador-arte.js` | Criador de Arte |
| a janela da imposição do Pedido | `drawPedPreview()` em `frontend/pedido.js` | a folha, na tela do Pedido |
| a janela da imposição | `drawPreview()` em `frontend/script.js` | a folha, na tela de Imposição |
| **quem imprime** | `engine.py` | o papel e o PDF de imposição |

> **As duas janelas da folha entraram nesta tabela em 02/09/2026**, e não porque
> nasceram naquele dia: elas sempre desenharam a arte, e ninguém as tinha
> anotado aqui. Enquanto ficaram de fora, foram justamente as duas que
> continuaram encolhendo a arte em PDF para caber na célula — o defeito que o
> card do modelo tinha até 18/08/2026. Quem lesse este documento acreditaria que
> a regra já valia em todo lugar. Ver a seção "A moldura e a arte são duas
> coisas", no fim.

A ordem importa: **`engine.py` é a régua.** Ele é o único que produz o que o cliente recebe;
os outros três existem para prever o que ele vai fazer. Quando houver dúvida sobre como a arte
deve aparecer, a resposta não é "o que fica mais bonito" — é "o que o motor faz".

---

## A regra, em duas linhas

- **Arte em PDF** → entra no **tamanho real** da página, centrada na peça. O que passar da
  peça **não aparece**, exatamente como a faca corta.
- **Arte em imagem** (JPG/PNG) → entra em **"contain"**: cabe inteira, proporção preservada,
  centralizada nos dois eixos.

São duas regras porque um PDF tem tamanho físico (a página é medida em pontos, 2,8346 pt =
1 mm) e uma imagem não tem — ela é só uma grade de pixels, e não há como saber quantos
milímetros ela quer ocupar.

No `engine.py` isso está em dois lugares:

- PDF: a arte é colocada na célula com o rect do tamanho da **própria página**
  (`base_w`/`base_h`), centrada — nunca reduzida para caber.
- Imagem: `_load_base_as_pdf()` converte a imagem para uma página **do tamanho do item** e
  encaixa a imagem dentro, proporcionalmente e centralizada. O comentário lá diz, com todas as
  letras, *"equivalente ao frontend"*.

Nas telas, a conversão do PDF para pixels é sempre a mesma conta: a página vem em pontos e o
canvas tem `S` pixels por milímetro, então **a escala do tamanho real é `S / 2.8346`**. No card
e no link do cliente `S` vem de `150/25.4` (150 dpi); no editor, de `scalePxPerMm = 4`.

### Por que não é "encolher até caber"

Até 18/08/2026 as telas encolhiam a arte até o arquivo inteiro caber dentro da peça. Parece mais
gentil — nada some —, mas mente duas vezes: mostra a arte **menor** do que ela vai sair e inventa
uma faixa branca em volta que o papel não tem.

Enquanto a arte tem exatamente o tamanho da peça as duas regras dão no mesmo resultado, e é por
isso que a divergência viveu tanto tempo sem ser notada. Medição nos 25 modelos mais recentes,
em 18/08/2026:

| modelo | arte | peça | como aparecia | como aparece |
|---|---|---|---|---|
| Credencial, PVC FOTO, países | 98 × 148 mm | 105 × 148 mm | 98,3% do tamanho | tamanho real |
| CAMAROTE e VIP do pedido 20508 | 245 × 20 mm | 148,5 × 52,25 mm | **60%** do tamanho | tamanho real, cortada nas laterais |
| Triband, Texband, TexPlus, UP, VanGogh | igual à peça | igual à peça | igual | igual |

O segundo caso é instrutivo: uma arte de Triband num modelo de Mobi é **erro de cadastro**. A
regra antiga escondia o erro deixando tudo bonitinho na tela; a regra nova mostra o corte que o
papel vai ter. Preferir ver o problema é a decisão do usuário, tomada em 18/08/2026.

---

## Nenhuma moldura desenhada dentro do bitmap

O card, a janela ampliada e o link do cliente mostram **o mesmo bitmap**: a janela ampliada
copia o canvas do card em vez de redesenhar (ver `frontend/amostra-modal.js`), e o
`amostra_arte_base64` — o JPEG de aprovação que o cliente vê — é o mesmo canvas salvo. Logo,
**qualquer enfeite pintado ali viaja para todo lugar**, inclusive para caminhos que já
chegaram ao papel (ver `frontend/arte-de-impressao.js`).

Por isso não se desenha moldura no bitmap. Até a v641 havia três, e o usuário via "um fio de
contorno que corta parte da imagem":

- `// Borda decorativa` no fim de `drawAmostraFace()`, nas duas cópias;
- `// contorno do formato` na camada de numeração — que é composta **por cima** da arte, então
  a moldura caía sobre a beirada do desenho;
- `// Borda final da amostra` em `renderAmostraCombinada()`, com 1,5 px.

Medido no navegador com uma arte que tem faixa vermelha colada no topo e verde colada embaixo:
a primeira fileira de pixels saía `165,54,64` em vez do vermelho puro `255,0,0`, e a última
`46,172,64` em vez do verde. Uma fileira coberta em cima e outra embaixo, nunca no papel —
porque o motor redesenha tudo do zero e não conhece essas linhas.

Quem mostra até onde vai o ingresso é a **borda do próprio canvas**, com a sombra do CSS.

`tests/test_amostra_sem_moldura.py` prende as três.

### O fio do CSS é outro, e também morde

Além das molduras desenhadas, havia `border: 1px solid` no CSS das caixas de amostra e no canvas
do editor de numeração. Como o projeto usa `box-sizing: border-box`, essa borda **entra na
largura**: o desenho encolhia 2 px, a proporção do canvas de 1200 × 500 saía 2,3927 em vez de
2,4000, e a conta do clique em `getCanvasPos()` — que divide `canvas.width` pela largura **com**
borda — ficava alguns pixels fora no extremo direito. Removida na v641 e na v642.

E há uma armadilha de layout na mesma família: **centralizar com `overflow` corta de verdade**.
Um item maior que a caixa, centralizado por flexbox, transborda pelos dois lados e a rolagem não
alcança o começo — medido em 308 px de arte inacessíveis acima do topo. A correção é
`align-items: safe center` e `justify-content: safe center`; navegador que não entenda `safe`
ignora as duas linhas e fica com a centralização de antes.

---

## O tamanho da peça: manda o formato

A amostra monta o canvas com o tamanho da **cor** quando ela tem dimensões próprias, e com o do
**formato** quando não tem. A camada de numeração, porém, é sempre montada com o tamanho do
**formato**, porque as coordenadas dos elementos são em milímetros relativos a ele.

Quando os dois divergem, a diferença é cortada pela borda do canvas. Foi o que aconteceu com a
cor **Credencial PVC**, cadastrada com 105 × 145,5 mm contra um formato de 105 × 148 mm: a peça
na tela nascia 2,5 mm mais curta do que a que imprime, e a numeração perdia 1,25 mm em cima e
1,25 mm embaixo.

**Regra**: quem manda é o **formato**, porque é ele que a impressão usa. Divergência assim é erro
de cadastro, e o conserto é no cadastro da cor — não no código. Vale medir antes quantas cores
estão fora de sincronia: em 18/08/2026 era **uma em vinte e quatro**, o que mostrou que era
exceção e não regra. O reparo daquele dia está em
`sql/cor_credencial_pvc_alinha_com_o_formato.sql`.

---

## A moldura e a arte são duas coisas

Regra dada pelo usuário em 02/09/2026, ao ver a frente e o verso de um modelo em
tamanhos diferentes na tela:

> *"O que define o tamanho da janela de visualização é o formato"* — *"não a arte"*

São dois objetos, e confundi-los produz erros opostos:

| | de onde sai | muda com o arquivo? |
|---|---|---|
| a **moldura** (a célula, o retângulo branco) | o **formato** do modelo, em milímetros | **não** |
| a **arte** dentro dela | o arquivo do cliente, no tamanho real | **sim** |

Duas faces com arquivos de tamanhos diferentes aparecem de tamanhos diferentes
**dentro da mesma moldura** — e isso está certo: é o que a faca faz. O modelo
1000740 do pedido 21408 é o exemplo vivo: frente de 110,70 × 164,70 mm e verso
de 104,35 × 158,35 numa célula de 105 × 148. Medido depois dos consertos: moldura
319,1 × 450,0 px na frente e 319,2 × 450,0 no verso (razão 1,000), arte 98,40
contra 92,76 px (razão 1,0609 — exatamente a razão dos arquivos).

### De onde vem o formato do modelo

`pedidos_modelos` **não tem coluna de formato**. Ele chega por três caminhos, e o
`formatoDoModelo()` tem de olhar os três — a ordem é a escolha do operador
primeiro:

1. a **cor** escolhida (`producao_cores.formato_id`);
2. a **numeração** escolhida (`producao_numeracoes.formato_id`);
3. `item.formato_id`, vindo do produto do ERP (ver `formatoPadraoId`).

Regra do usuário no mesmo dia: *"todo modelo exige obrigatoriamente um formato
vinculado"*. Não existe plano B — sem formato resolvido, a tela **diz que falta**
("Escolha a Cor ou a Numeração acima — é delas que sai o tamanho da peça") em vez
de adivinhar uma medida. Os dois palpites que existiam foram removidos em
02/09/2026: um fazia a moldura virar a página da arte, o outro caía no primeiro
formato do catálogo, de outro produto.

---

## Ao mexer em qualquer uma das seis janelas

1. Abra `engine.py` e confirme o que ele faz — ele é a régua, não o contrário.
2. Repita a decisão nas **duas** cópias de `drawAmostraFace()` (`script.js` e `cliente.js`). Elas
   são cópias de verdade, e divergir entre elas faz o cliente aprovar uma coisa e o operador ver
   outra.
3. Confira o `criador-arte.js` contra o card: o editor tem de reproduzir o que o card mostra.
4. Repita nas **duas** janelas da folha (`drawPedPreview` e `drawPreview`). Elas ficaram fora
   deste documento até 02/09/2026 e foram as últimas a receber a regra.
5. Não desenhe moldura, contorno ou marca de tela dentro do bitmap.
6. Separe a **moldura** da **arte**: a primeira é o formato, a segunda é o arquivo.
7. Rode `tests/test_arte_da_amostra_no_tamanho_real.py`, `tests/test_amostra_sem_moldura.py` e
   `tests/test_todo_modelo_tem_formato.py`. O primeiro vigia também o `engine.py`: se o motor
   mudar de regra, ele avisa que as telas precisam mudar junto.
8. Publique o agente na mesma leva (`GUIA_AGENTE.md`) — o executável embute uma cópia do
   frontend.
