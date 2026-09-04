# Montagem

A tela que junta numa folha só as células a refazer, **mesmo que venham de
pedidos diferentes**. No ar desde 29/08/2026 e reescrita em 03/09/2026, em três
frentes do mesmo dia: as artes passaram a ser montadas pelas **mesmas funções da
tela do Pedido** (§6), a folha virou um **kanban de células** (arrastar, repetir,
tirar) e a tela inteira foi **redesenhada** — a folha montada tomou o lugar
nobre, passou a ser desenhada na grade de verdade do formato, e o número do
modelo ganhou controle de posição, rotação, tamanho e cor (§5). No mesmo dia ela
ganhou o **aproveitamento da folha**: com dois modelos ou mais, a tela sugere
quantas células de cada um a folha deve levar para gastar o mínimo de papel
(§5).

Arquivos: [`frontend/montagem.js`](../frontend/montagem.js) (a tela inteira),
[`frontend/pedido.js`](../frontend/pedido.js) (`arteDoModeloParaFolha` e
`arteParaOMotor`, o construtor de arte que as duas telas dividem),
[`frontend/script.js`](../frontend/script.js) (`rotacaoDaFolhaDoFormato`),
[`frontend/index.html`](../frontend/index.html) (o menu e a view),
[`frontend/style.css`](../frontend/style.css) (bloco `MONTAGEM`). No Python,
duas coisas: a chave `refazer_repetir` (§2) e o desenho do número do modelo,
que virou uma função só (`_desenhar_numero_do_modelo`, §5).

---

## 1. O problema que ela resolve

O **Refazer Célula** da tela do Pedido já repõe o item que estragou: o operador
digita as posições (`1,6,22`), e o motor as compacta numa folha, sem buraco.

O limite dele é que a folha é de **um modelo de um pedido**. E a gráfica não
estraga assim: estraga uma célula de um pedido, duas de outro, todas do mesmo
Triband — e paga uma folha inteira de PVC para repor três cartões.

> Pedido do usuário: *"vai se chamar Montagem, ela será utilizada para refazer
> células de um mesmo produto (triband, Mobi, pvc, etc...) mesmo quando elas são
> de pedidos diferentes"*.

---

## 2. O que o motor já fazia — e a única chave que entrou

Duas coisas já existiam no motor, e é a soma delas que faz esta tela ser quase
só de frontend.

**O motor já monta folha com pedidos diferentes.** Desde 18/08/2026, no
`multi_artes` do aproveitamento de folha, cada arte carrega o seu `pedido`; o
`_pedido_do_item()` faz o pedido do item vencer o do trabalho, e item que chega
sem saber de onde veio **levanta erro** em vez de sair com a coluna do pool de
outro pedido.

**E o `refazer_celulas` indexa o `multi_map`**, que é a lista ordenada dos itens
do trabalho inteiro — não uma conta de esquema:

```python
itens = [multi_map[c - 1] for c in r_cels ...]
```

Cada entrada do `multi_map` carrega `modelo`, `pedido`, `csv_row`, `local_idx` e
`start_base` do item **original**.

### A consequência, que é o que torna a tela segura

O código do QR Ideal é determinístico:

```python
def indice(pedido, modelo, item):
    col = coluna_do_modelo(pedido, modelo)
    return ((col - 1) * LINHAS + (int(item) - 1)) % TOTAL
```

Refazer a posição 6 do modelo X do pedido Y devolve **exatamente o mesmo código**
do original. A célula refeita **substitui** o ingresso perdido; ela não cria um
segundo ingresso válido para a mesma entrada. Sem isso, esta tela seria uma
fábrica de entradas duplicadas.

### `refazer_repetir` (03/09/2026)

O construtor do `ImpositionConfig` tirava posição repetida de `refazer_celulas`
(`dict.fromkeys`), e isso continua sendo o padrão: no Refazer Célula do Pedido,
"1,1,6" é engano de dedo. O botão ⧉ da Montagem precisa do contrário — a mesma
peça impressa duas vezes, lado a lado —, então entrou a chave
`refazer_repetir`, que nasce desligada. Com ela, a lista mantém as repetições
na ordem recebida; o `app.py` a repassa do payload. Os dois consumidores da
lista (`fontes[k]` no caminho principal e `multi_map[c - 1]` no
strict_assembly) já lidavam com repetição sem mudar nada. Testes em
[`tests/test_engine_refazer.py`](../tests/test_engine_refazer.py).

---

## 3. O que a tela faz: traduzir

O operador pensa em *"a posição 6 do modelo 1000565"*. O motor espera posições
no **fluxo combinado**, porque é assim que ele monta o `multi_map`: arte por
arte, cada uma com a sua tiragem inteira.

A tela guarda duas listas, separadas de propósito:

- **`modelos`** — um registro por par (pedido, modelo), na ordem em que entrou.
  É a ordem do `multi_artes`, e portanto quem decide o **deslocamento**.
- **`celulas`** — uma entrada por célula, na ordem em que vão sair **no papel**.
  É a lista que o operador arrasta, repete e tira.

```
modelos (deslocamento)              celulas (ordem da folha)   →  refazer_celulas
1000565  qtd 3000  base 0           1000412 #7                 →  4920 + 7    = 4927
1000589  qtd 1920  base 3000        1000565 #1                 →  0 + 1       = 1
1000412  qtd  150  base 4920        1000565 #6                 →  6
                                    1000565 #6  (⧉)            →  6
                                    1000589 #340               →  3000 + 340  = 3340
```

> ⚠️ **O deslocamento é a TIRAGEM do modelo anterior, não o número de células
> pedidas dele.** Somar 3 em vez de 3.000 faria o motor imprimir os itens
> errados — com os códigos de QR de outros ingressos, descobertos na portaria.
> `posicoesCombinadas()` é a função mais delicada do arquivo, e
> `test_a_traducao_das_posicoes_desloca_pela_tiragem` existe só para isso.

**A ordem das células não mexe no deslocamento.** Arrastar a célula do pedido b
para o começo da folha troca a ordem da saída; o índice dela continua sendo o
do modelo dela. É isso que faz o kanban ser seguro.

**A tiragem que vale para o deslocamento é a da arte pronta** (`artes[j].qtd`),
e não a guardada na lista na hora de adicionar: o banco pode ter mudado entre
uma coisa e outra. Célula cuja posição passou da tiragem da arte pronta é
recusada na hora de gerar, dizendo qual.

**Cada arte leva a tiragem inteira no payload.** Recortar o banco seria mais
leve e estaria errado pelo mesmo motivo: o índice do item é o que decide o
código.

---

## 4. As regras, e quem as decidiu

### O que pode dividir a folha

O usuário abriu o pedido dizendo que a única condição seria o mesmo **formato**.
Apontada a diferença, ele decidiu em 29/08/2026 manter **quatro**:

| Confere | Por quê |
|---|---|
| **Formato** | a grade da folha |
| **Cor** | a folha é de um material só — Triband azul e Triband dourado não saem da mesma passagem |
| **Saída** | é o tamanho da folha física |
| **Face** | o verso da folha existe ou não existe |

Três dessas não são preferência: são impossibilidade física.

**O que NÃO impede**, e de propósito:

- **Sequencial × Blocado.** O `porQueNaoCombina` da tela do Pedido recusa, e ali
  está certo — a ordem das células decide como a pilha é cortada. Aqui não há
  pilha: a montagem compacta numa folha, na ordem da lista.
- **Modo PDF.** Ele decide de onde a arte vem para a tiragem inteira, e cada
  célula da montagem já traz a arte do seu próprio modelo.

### As outras decisões

| | Escolhido | Quando |
|---|---|---|
| Como escolher a célula | pedido → modelo → posições, **acumulando** | 29/08 |
| Quais pedidos a tela oferece | os **impressos nos últimos 30 dias**, mais busca por número | 29/08 |
| Senha da gerência | **não** — é trabalho normal do operador | 29/08 |
| Repetir célula (⧉) | a **mesma peça**, impressa duas vezes, logo abaixo | 03/09 |
| Tirar célula (×) | só aquela; as outras do modelo ficam | 03/09 |
| Ordem da folha | **kanban**: arrastar a célula muda a sequência | 03/09 |
| Quantidade do aproveitamento | a **tiragem** do modelo | 03/09 |
| Como a sugestão vira folha | os **três** caminhos ficam oferecidos | 03/09 |

---

## 5. A tela

**Ela abre vazia, e é aí que precisa se explicar.** O operador chega com uma
folha estragada na mão, não com a documentação lida: o estado vazio diz o que a
tela faz, a condição para juntar, e a garantia do código igual ao original.

**A trava do formato nasce escondida.** Não há um seletor de formato para
preencher: o operador adiciona a primeira célula e a folha passa a mostrar o que
aceita. Um campo a menos, e o estado sai do que ele já fez.

**A recusa aparece ao escolher o modelo, não ao clicar em Adicionar** — descobrir
que a cor não bate depois de digitar quinze posições é fazer o operador trabalhar
à toa. E ela diz o que fazer, não só o que está errado.

**O selo é o mesmo do Pedido**, com a mesma regra de cor: verde quando a folha
fecha certo, amarelo quando sobra célula. O amarelo é reservado à sobra.

### O redesenho de 03/09/2026: a folha no lugar nobre

Pedido do usuário: *"rever usabilidade geral, precisamos a janela de visualização
da Folha Montada maior, com melhor nível de detalhamento e posição privilegiada;
montar na visualização o número do modelo, com opção de alterar posição,
rotação, tamanho da fonte e cor na impressão; maior controle sobre as ações para
os usuários"*.

Até aqui a folha vivia numa coluna fixa de 380 px na direita, e a tabela de
modelos tomava a largura toda. Isso estava invertido: **o trabalho do operador
acontece na folha** — é nela que ele arrasta, repete e tira célula. A tabela é
só o registro do que ele já fez.

A tela passou a ter duas colunas:

- **`.mtg-folha-card`, à esquerda, elástica** (`flex: 1 1 auto`) — a folha
  montada, o zoom, a ordenação, o *Completar folha* e o desfazer.
- **`.mtg-lado`, à direita, fixa em 440 px** (`flex: 0 0 440px`) — o compositor
  (pedido → modelo → posições), o selo, a lista de modelos, o painel do número
  e o destino do PDF.

A folha rola **dentro** do card (`max-height: calc(100vh - 340px)`): sem isso
uma montagem de várias folhas empurrava a página inteira para baixo e escondia
os controles do lado — defeito visto na primeira revisão em tela.

### A folha é desenhada na grade de verdade do formato

Este era o pior defeito do desenho antigo, e ele **mentia sobre o papel**: a
prévia empilhava as células numa coluna, sempre. Isso só coincide com a verdade
num formato de uma coluna — o Triband. Numa credencial PVC, que é 2 × 2, a tela
mostrava quatro linhas empilhadas e o papel saía em quadrado.

A conta de onde cada célula cai **é a do motor**, e não uma escolha de desenho.
No caminho compactado do `engine.py`:

```python
k = S * poses_per_sheet + P,  com  P = row * cols + col
```

Linha primeiro, da esquerda para a direita, de cima para baixo. É o que
`lugarDaCelulaNaFolha(i, cols, rows)` reproduz. A geometria da folha vem da
mesma fórmula, em milímetros (`geometriaDaFolha`):

```
used_w  = cols * item_w + (cols - 1) * gap_h
start_x = (sheet_w - used_w) / 2
```

As células são posicionadas em milímetros convertidos para píxel, e a área
imposta aparece centralizada dentro do papel. Sem saída conhecida a folha vira a
própria área imposta — melhor desenhar a grade certa sem o papel em volta do que
inventar um papel.

**Três zooms**, porque cada um responde uma pergunta diferente:

| Zoom | Para quê |
|---|---|
| **Peça** | as células enchem a largura — é o modo de trabalho, conferir o conteúdo de cada uma |
| **Folha** | o papel inteiro cabe na área — é onde a **sobra** aparece pelo tamanho, e não só por um número no selo |
| **100%** | tamanho real a 96 dpi — para conferir corpo de fonte |

### Dois campos para escolher o pedido, e não um

O seletor lista os **impressos nos últimos 30 dias** — refazer célula é sobre
material que acabou de sair, e a fila inteira encheria a lista de pedidos sem
nada a repor. Ao lado dele há um campo de **número**, para o pedido antigo que
voltou do cliente.

São dois campos porque um `<select>` não se digita: a primeira versão prometia
*"escolha ou digite o número"* dentro do seletor, e essa era uma promessa que a
tela não cumpria. (O rótulo do seletor voltou a prometer isso numa versão
seguinte, por descuido; desde 03/09 ele diz "Impressos nos últimos 30 dias…".)

> ⚠️ **O `montagem.js` precisa estar na lista de sincronismo da estação**
> (`security_config.py`). O `index.html` que a estação baixa já pede o script;
> sem o nome ali, o menu novo abriria em branco com um 404 no console. O
> `test_painel_estacao.py` pegou exatamente isso — a tela estava pronta e a
> gráfica não a receberia.

### Ao escolher o pedido, os bancos dele descem

`onMontagemPedidoChange` carrega os modelos (`loadOSItens`) **e** os bancos do
pedido (`garantirBancosDoTrabalho`) **e** o CSV de cada numeração
(`garantirCsvDoTrabalho`) — o mesmo que a `runPedImposition` faz antes de
montar o payload. Sem isso a tiragem da lista saía errada para quem nunca
tivesse aberto o pedido na tela do Pedido nesta sessão.

### A tiragem de cada modelo, na lista

A coluna **Tiragem** diz quantos itens aquele modelo imprime ao todo — e é contra
esse número que a posição vale. `#340` só existe num modelo de 1.920; sem o
número na tela o operador digita no escuro. Pedido do usuário em 29/08/2026.

É a **mesma conta que o motor faz** com a arte da tela do Pedido: a quantidade
contratada é quantos itens ele cria; o banco, quantos têm dado. Vale o menor.
Com distribuição do banco (`csv_selecao`) vale a fatia, e só ela.

### O número do modelo no papel

Mesmo conceito das *Opções do modelo* da tela do Pedido, e a mesma mecânica: o
motor imprime `arte["nome"]` — o id do modelo com seis dígitos — na borda de
cada item. Desde 03/09 quem escreve o `nome` é o construtor do Pedido
(`arteParaOMotor`), a partir de `_imprimirNumero`; o `prepararArtesDaMontagem`
preenche `_imprimirNumero` com a caixa desta tela, para todos os modelos.

Numa folha que mistura pedidos é por ele que se separa o material depois de
cortar — é aqui que a marca serve mais do que no Pedido.

Duas diferenças em relação ao Pedido, as duas deliberadas:

- **É uma escolha para a montagem inteira**, não uma por modelo.
- **Ela não é gravada no modelo.** A Montagem é reposição avulsa.

Nasce **desmarcada**, como no Pedido — novidade que muda o que sai no papel entra
desligada.

#### Os quatro controles (03/09/2026)

Pedido do usuário: *"montar na visualização o número do modelo, com opção de
alterar posição, rotação, tamanho da fonte e cor na impressão"*. Dos quatro, só
a **cor** existia (`nome_color`); os outros três estavam escritos no meio do
`engine.py`, em **três cópias**.

| Controle | Campo no payload | Valores | Padrão |
|---|---|---|---|
| Posição | `nome_pos` | `esquerda`, `direita`, `topo`, `base` | `esquerda` |
| Rotação | `nome_rot` | 0°, 90°, 180°, 270° | 90 |
| Tamanho | `nome_size` | 6 a 24 pt | 14 |
| Cor | `nome_color` | cinco atalhos + seletor livre | `#000000` |

> **O padrão é exatamente o que o motor sempre fez.** 14 pt, borda esquerda,
> deitado, preto. Ligar a caixa não pode mudar o papel de quem nunca pediu
> nada — e o combinado `esquerda` + `90` recai, **bit a bit**, na expressão
> literal que o motor tinha antes.

**A tela e o motor saneiam os mesmos valores.** `numeroDaMontagemSaneado` recusa
o que não estiver na lista e devolve o padrão; do outro lado,
`_numero_do_modelo_corpo/posicao/giro` fazem o mesmo, calados. Se um dos dois
afrouxasse sozinho, a prévia mostraria uma coisa e o papel sairia outra.

**A folha desenha o número onde ele vai sair**, no corpo e na cor escolhidos, e
a célula ganha um recuo do tamanho do rótulo para os dois não se sobreporem.

#### O desenho do número virou uma função só, no motor

O mesmo bloco `if arte_nome:` estava copiado em **três** pontos do `engine.py`:
o ramo de reserva do laço principal, o `_render_item_front` e o
`_render_item_back`. Os três tinham de concordar e nada os obrigava — mexer num
e esquecer os outros faz o verso sair diferente da frente, e a folha combinada
diferente das duas. É o tipo de divergência que só aparece no papel.

Virou `_desenhar_numero_do_modelo(page, item, fx, fy, cfg)`. A geometria: o
texto fica **encostado** na borda escolhida, com recuo igual ao próprio corpo da
fonte medido até a **linha de base**, e **centralizado** ao longo dela. Quando o
texto corre perpendicular à borda, é a **ponta** dele que fica no recuo — o
resto entra na célula; centralizar o meio jogaria metade para fora do papel.

> Um quarto bloco parecido, o `insert_textbox` centralizado no verso, **não foi
> tocado**: é outro recurso, com outra finalidade.

O `app.py` não precisou mudar — ele repassa o `multi_artes` inteiro, e um teste
tranca isso. **Agente velho ignora os campos novos e imprime como sempre**, que
é exatamente o padrão desta tela.

### A folha montada é um kanban (03/09/2026)

Pedido do usuário: *"adicionar opção de duplicar célula (ícone que duplica o
modelo na próxima célula), incluir o excluir célula (x na célula que exclui ela
do gabarito) e deixar as células em modo kanban para movê-las manualmente
alterando a sequência"*.

A folha desenha **todas** as células, folha a folha ("Folha 1 de 2", "Folha 2
de 2"), com as vazias só na última. Cada célula é um cartão com a alça ⋮⋮, o
rótulo `pedido · modelo · #posição` na cor do modelo, o **⧉** e o **×**:

- **⧉** repete a célula **logo abaixo** dela — a mesma peça (mesmo pedido,
  modelo e posição, e por isso o mesmo código de QR), impressa duas vezes. Na
  lista o chip diz `#6 ×2`. É o único jeito de repetir: posição repetida na
  digitação continua entrando uma vez, porque "6,6" é engano de dedo.
- **×** tira **só aquela** célula. As outras do mesmo modelo ficam. Modelo que
  ficou sem célula nenhuma sai da lista — e do deslocamento.
- **Arrastar** (HTML5 drag-and-drop nativo, sem biblioteca — cada estação usa um
  navegador diferente) muda a ordem da folha. Enquanto arrasta, a origem apaga e
  o alvo ganha a linha. Soltar numa célula vazia manda para o fim. Os ouvintes
  ficam no container, por delegação: a prévia é redesenhada a cada mudança.

A dica embaixo da folha diz os três gestos em texto. Ícone sem rótulo é o que
esta gráfica não aceita.

O × e o ⧉ moram **dentro** da célula arrastável e param a propagação: sem isso,
clicar no × começaria um arrasto.

### Maior controle sobre as ações (03/09/2026)

Era a falta mais grave da tela: um × no lugar errado apagava a célula **sem
volta**, e repor custava reescolher o pedido, esperar o `loadOSItens`,
reescolher o modelo e redigitar as posições.

**Desfazer e refazer.** Todo gesto que mexe na folha guarda um instantâneo antes
(`guardarNaHistoria`, até 60 passos): adicionar, tirar o modelo, ⧉, ×, arrastar,
limpar, completar e ordenar. `Ctrl+Z` desfaz, `Ctrl+Shift+Z` e `Ctrl+Y` refazem,
e há os dois botões no topo da folha.

> No instantâneo as **células são clonadas** e os **modelos vão por
> referência**. Clonar os modelos levaria junto o `peca._item`, que é o item
> vivo do `state.osItens` — duplicá-lo criaria uma segunda cópia do pedido
> dentro da montagem.

**Seleção.** Clicar numa célula a seleciona; `Ctrl` soma, `Shift` pega a faixa,
`Esc` limpa. Com uma célula selecionada, o teclado age sobre ela: `Ctrl+D`
repete, `Delete` tira, as **setas** movem na folha.

> O teclado ignora `INPUT`, `TEXTAREA`, `SELECT` e campo editável. Sem isso,
> `Delete` apagaria a célula enquanto o operador corrige uma posição digitada.

**Completar folha.** Quando sobram vazias, o botão repete as células que já estão
na folha — em rodízio, cada cópia logo depois da última cópia da mesma célula —
até a folha fechar certo. Papel é custo de produção, e a alternativa era o
operador clicar no ⧉ uma vez por vaga.

**Ordenar.** *Por modelo* agrupa tudo do mesmo modelo; *por pedido* agrupa por
pedido. Dentro de cada grupo a ordem que o operador montou é preservada
(ordenação estável) — reordenar não pode embaralhar o que ele arrastou de
propósito.

> ⚠️ Nenhuma dessas ações muda o código de ingresso nenhum. Ordenar, arrastar e
> completar mexem **só em onde a célula cai no papel**; o índice dela continua
> vindo do deslocamento do modelo dela (§3). Os avisos da tela dizem isso em
> texto, porque é a dúvida que o operador teria.

### O aproveitamento da folha (03/09/2026)

Pedido do usuário: *"ao carregar 2 modelos ou mais, ao analisar a quantidade de
cada modelo, sugerir a quantidade de repetições de cada modelo para que com a
impressão repetida da folha imposta se atinja o melhor número de aproveitamento.
Exemplo: formato com 10 células, modelo 1, 30 unidades, modelo 2, 70 unidades.
Montagem sugerida 3x o modelo 1 e 7x o modelo 2"*.

A quantidade de cada modelo é a **tiragem** dele — a coluna que a lista já
mostra. Decisão do usuário na mesma conversa.

#### A conta

O desperdício de uma folha impressa `R` vezes é `P × R − Q`: tudo o que sai do
papel e não vira peça pedida, seja célula vazia ou peça a mais. `P` (células da
folha) e `Q` (o total pedido) são dados, então **gastar menos papel é imprimir
menos vezes** — a conta se resume a achar o menor `R` que caiba.

Para um `R` qualquer, o mínimo de células que o modelo `i` precisa na folha é
`ceil(q_i / R)`: com menos que isso, `R` impressões não fecham a tiragem dele.
Se a soma desses mínimos cabe na folha, aquele `R` serve. Basta varrer `R` de
baixo para cima — a partir de `ceil(Q / P)`, abaixo do qual nem o total caberia
— e parar no primeiro que couber.

No exemplo do usuário: `R = 9` pede 4 + 8 = 12 células e não cabe; `R = 10` pede
3 + 7 = 10 e cabe. Sai exatamente a montagem que ele descreveu, com desperdício
zero.

> Uma proporção arredondada (`q_i × P ÷ Q`) daria o mesmo resultado **nesse
> exemplo**, e passaria a errar em todo caso onde a proporção não é exata. O
> erro sai em papel comprado, e por isso a conta está travada em
> `test_o_aproveitamento_da_folha_e_o_menor_numero_de_impressoes`.

O que sobrar de célula depois dos mínimos é distribuído pelo método da maior
sobra, proporcional à tiragem: o papel daquela folha já está comprado, e deixar
a célula vazia desperdiça igual sem entregar nada. Vira peça a mais, e a coluna
**Sobra** diz quantas — silenciar isso seria imprimir código que ninguém pediu.

#### Os três caminhos, e por que o arriscado continua na tela

O usuário pediu que **os três** ficassem oferecidos. Eles diferem no que a
palavra "repetida" significa:

| Caminho | O que monta | Quando serve |
|---|---|---|
| **Uma folha, N impressões** | uma folha só, com a mistura (3 + 7) | peça sem dado variável: as N impressões saem iguais, e é isso que o gang run quer |
| **Distribuir em N folhas** | todas as peças, com a mistura em cada folha | peça com dado variável: cada célula é um item diferente, nenhuma folha se repete |
| **Aplicar o recomendado** | escolhe entre os dois pelo tipo da peça | o caminho normal |

> ⚠️ **Imprimir a mesma folha N vezes só entrega a tiragem quando a peça sai
> igual.** Com numeração de dado variável, repetir a folha repete o código — N
> ingressos válidos para a mesma entrada, descobertos na portaria. É exatamente
> o que esta tela existe para não fazer (§2).

Por isso a folha repetida com dado variável **pergunta antes**, num popup que
diz o que vai acontecer e aponta a alternativa. Avisado, o operador decide: a
opção continua na tela, como ele pediu.

**O que conta como dado variável.** Numeração sem elemento nenhum é caso comum e
legítimo neste projeto — a folha sai só com a arte. Com qualquer elemento que
mude de um item para o outro, a peça é variável. A classificação erra **de
propósito para o lado seguro**: só `FIXED`, `PICOTE`, `SVG` e `PDF` contam como
fixos, e mesmo esses viram variáveis se lerem coluna do banco (a foto da
credencial é o caso comum). Tipo de elemento desconhecido conta como variável, e
**numeração que a tela não conseguiu ler também** — modelo sem numeração nenhuma
é arte só, mas modelo com numeração que não desceu é tratado como ingresso.

#### O teto da folha distribuída

Distribuir desenha **uma célula por peça**. Numa tiragem de produção
(3.000 + 1.920) são quase cinco mil células na tela, e ela não dá conta. Acima
de 800 peças o botão **nasce desabilitado**, com o motivo no rótulo de ajuda e a
saída na frase: aquela tiragem se imprime pela tela do Pedido. Botão que recusa
depois do clique faz o operador aprender por tentativa.

#### O que a sugestão não muda

Nada do código de ingresso. Aplicar substitui as células da folha, e cada uma
continua deslocada pela **tiragem** dos modelos anteriores (§3) — não pelo
número de células que a sugestão deu a eles. A folha distribuída também nunca
inventa posição: ela enfileira `1..tiragem` de cada modelo e só distribui o que
existe. E `Ctrl+Z` devolve a folha anterior.

### A linha da lista é o caminho de volta ao modelo

Clicar numa linha devolve **aquele pedido e aquele modelo** ao compositor, com o
cursor já no campo de posições. Pedido do usuário em 29/08/2026. O campo fica
**vazio**: ele vem acrescentar. O × da linha continua tirando o modelo inteiro,
com todas as células dele, e não leva de volta a ele.

### Onde o PDF vai parar

Duas escolhas, no rodapé da prévia — ambas pedidas pelo usuário em 29/08/2026,
depois que o PDF simplesmente não apareceu (ver §7).

**A pasta.** O seletor lista as pastas que **esta estação** já autorizou, e o
botão ao lado abre o **seletor nativo do Windows na estação**. Quem abre o
seletor e quem escreve no disco é o **agente**, nunca o navegador. Sem pasta
escolhida, o PDF desce pelos **downloads do navegador**.

**Abrir na tela.** Marcada — e ela nasce marcada —, o PDF abre sobre o painel, na
mesma *lightbox* que o anexo do pedido já usa.

Se a gravação na pasta falhar por motivo do disco, o trabalho **não se perde**:
o PDF desce pelo navegador e o aviso diz o que falhou.

---

## 6. As artes vêm da tela do Pedido (03/09/2026)

A análise da tela em 03/09 achou **sete divergências** entre a arte que a
Montagem montava e a que a `runPedImposition` monta para o mesmo modelo — cada
uma delas uma célula refeita diferente da original:

| # | O que a Montagem fazia | O que a tela do Pedido faz |
|---|---|---|
| 1 | lia `arte_verso_url` (campo que não existe) e mandava `print_mode: 'simplex'` (valor que o motor não conhece) — **o verso nunca saía** | `verso_arte_url` / `url_arquivo_arte_verso` pelo `arteParaImpor`, e `modoDeVersoDoModelo` |
| 2 | mandava `it.arte_url` cru — a **amostra de aprovação** podia ir ao papel | `arteParaImpor`, que barra `amostras_renderizadas` |
| 3 | não garantia os **bancos do pedido** nem o CSV antes do payload | `garantirBancosDoTrabalho` + `garantirCsvDoTrabalho` |
| 4 | mandava o `csv_data` **inteiro** — a posição N apontava para outra linha | a fatia do modelo e o limite pela quantidade (`linhasDoModeloNoPayload`) |
| 5 | escala da arte em 100% | `escala_h/escala_v` de cada modelo |
| 6 | `rotate_page: 0` | a rotação do formato |
| 7 | elementos de Layout iam junto | `numeracaoSemElementosDeLayout` |

O conserto **não foi copiar as sete regras** — cópia é o que divergiu. Foi
extrair da `runPedImposition` o corpo do `tempMultiArtes` e do
`payloadMultiArtes` para duas funções de nível superior do `pedido.js`,
**verbatim**:

- `arteDoModeloParaFolha(s, numIdReserva, opcoes)` — a arte de um modelo, como
  a folha combinada do Pedido a monta. `opcoes.comPrevia === false` pula o
  carregamento do PDF para a prévia, que só a tela do Pedido desenha.
- `arteParaOMotor(arte, isMultiSelected)` — a arte como o motor a recebe.

A `runPedImposition` passou a chamar as duas (`state.selectedOSItems.map(s =>
arteDoModeloParaFolha(s, numId))` e `artesList.map(arte =>
arteParaOMotor(arte, isMultiSelected))`), sem mudar uma linha do que faz. A
Montagem chama as mesmas, em `prepararArtesDaMontagem`.

A rotação da folha (`page_rotate` do formato, ou 90 com `default_rotate_page`)
estava escrita duas vezes — no `applyFormatoDefaults` do script.js e no gêmeo
do pedido.js. Virou `rotacaoDaFolhaDoFormato(fmt)`, no script.js, lida pelas
três telas.

### Pedido a pedido, em série

`state.bancosDoPedido` e `state.vinculosDeBanco` guardam os bancos de **um**
pedido por vez — é assim que a tela de Amostras e a do Pedido trabalham, e o
`resolverNumeracaoParaModelo` lê dali. Carregar os bancos do pedido B antes de
montar as artes do pedido A deixaria as artes de A sem o banco delas — número
no lugar do nome, calado. Então `prepararArtesDaMontagem` agrupa os modelos
por pedido e faz, para cada um: carrega os bancos, garante o CSV, monta as
artes daquele pedido; só então passa ao próximo. As artes saem na ordem dos
**modelos** (a do `multi_artes`), não na dos pedidos.

Antes de ir ao motor, três recusas com a saída na frase: banco que não se
conseguiu ler (`pedidosComBancoDesconhecido`), numeração que pede banco e
chegou sem linha (`bancoVazioNoPayload`), e célula cuja posição passou da
tiragem da arte pronta (`celulasForaDaTiragem`).

### Uma nota sobre fontes

A análise listou "fontes web sem `arquivo_url`" como sétima divergência, com
base no `runImposition` do **script.js** (a tela Imposição), que injeta a URL
da fonte em cada elemento. A `runPedImposition` — a que a gráfica usa para
imprimir modelos — **não injeta**: as fontes se resolvem na estação (o
`_embed_system_fonts` do app.py embute as instaladas). A Montagem faz
exatamente o que a `runPedImposition` faz. O item 7 da tabela acima é o que de
fato faltava nesse ponto: os elementos de Layout.

---

## 7. Os defeitos de estreia, e o que ensinaram

### O formato não chegava (29/08, v771)

`formato_id` **não existe** em `pedidos_modelos`. Quem o preenche na memória é o
**desenho da fila do Pedido**, e a Montagem nunca desenha aquela fila. Pior: o
`porQueNaoCabeNaMontagem` comparava `'' !== ''` e devolvia *"cabe"* **sempre** —
a regra de compatibilidade estava **inerte**. O conserto foi resolver o formato
pela **mesma regra** do desenho da fila (produto → `id_formato` →
`id_formato_num`) numa peça normalizada (`pecaDaMontagem`), e recusar a célula
cujo formato não se resolve.

> **A lição:** um campo que parece vir do banco pode ser preenchido pelo
> *desenho* de outra tela. E a conferência que compara campos vazios não falha,
> ela **passa**, que é a forma mais silenciosa de uma regra morrer.

### O PDF era gerado, e sumia (29/08)

A entrega era `window.open(blobUrl, '_blank')`. O navegador só deixa abrir
janela nova enquanto o gesto do operador ainda vale — no Chrome, cinco
segundos —, e uma folha montada demora mais. O bloqueio é silencioso, e o
`toast` seguinte dizia *"Montagem gerada"*. O conserto foram três caminhos sem
janela nova: gravar na pasta da estação, baixar por `<a download>`, abrir na
*lightbox*.

> **A lição:** entrega não é conclusão. O caminho crítico termina quando o
> arquivo está na mão do operador.

### A arte era outra (03/09)

Ver §6. A lição é a mesma da clonagem `script.js` → `pedido.js` que este
projeto já sofreu: **regra copiada diverge**. A única defesa é uma função só,
chamada dos dois lados, e um teste que cobra os dois lados.

### Uma aspa fechou o atributo, e o número saiu sem nada (03/09)

O estilo do número na prévia é montado numa string e colocado em
`style="${...}"`. A pilha de fontes trazia `"Arial Narrow"` com **aspas
duplas** — e a primeira delas **fechou o atributo no meio**. O que vinha depois
(tamanho, cor, rotação, posicionamento) virou lixo de marcação: o número
aparecia, no corpo herdado da página, sem cor e sem giro.

Nada disso quebra. Não há erro no console, o HTML é aceito, e a medida que eu
tinha tirado antes (101 px de largura) estava errada por causa disso — e me
levou a escrever um teste afirmando que o número **não cabia** na tira do
Triband. Com o estilo consertado (aspas simples), ele mede 71 px numa célula de
74: cabe.

> **A lição:** foi o harness de tela — Chrome de verdade, medindo o elemento
> desenhado — que pegou. Uma verificação de código-fonte teria lido a mesma
> string e concordado com ela.

### O número por cima do rótulo, e a folha sem fim (03/09)

Duas coisas que só a captura de tela mostrou, na revisão do redesenho:

- O número era desenhado **por cima** do rótulo da célula: `21202` aparecia como
  `02`. Conserto: `_mtgEspacoDoNumero` calcula quantos píxeis o rótulo precisa
  recuar, e o recuo da célula passou a ser dinâmico.
- A folha crescia sem limite e empurrava a página inteira, escondendo a coluna
  de apoio. Conserto: `max-height: calc(100vh - 340px)`, e a folha rola dentro
  do card.

---

## 8. O que a Montagem não faz

- **Não muda status nem quantidade.** É reposição: o modelo já está impresso, a
  quantidade contratada é do ERP e não se escreve de volta.
- **Não imprime pela nuvem.** Não há plano B: impressão só acontece pela estação
  da gráfica. Sem agente respondendo, a resposta ao operador é que não dá.
- **Não sabe sozinha o que estragou.** Quem viu o papel foi o operador; a tela é
  onde ele diz.
- **Não tem permissão própria no menu.** `nav-montagem` não está em
  `PERM_NAV_MAP`, e por isso aparece para todo perfil logado no site. Apontado
  na análise de 03/09; fora do escopo do que foi pedido naquele dia.

---

## 9. Testes

| Harness | Verificações | O que trava |
|---|---|---|
| [`tests/montagem_harness.js`](../tests/montagem_harness.js) | 241 | o núcleo: posições digitadas, compatibilidade, a **tradução das posições** (células × modelos), os três gestos do kanban, o lugar da célula na folha, a geometria e os zooms, o desfazer, completar e ordenar, o saneamento do número, o preparo das artes **pedido a pedido**, o payload, o **aproveitamento da folha** |
| [`tests/montagem_tela_harness.js`](../tests/montagem_tela_harness.js) | 162 | a tela desenhada num Chrome de verdade: lista, selo, trava, a folha na **grade do formato**, ⧉, ×, o arrasto com os eventos nativos, a seleção e o teclado, **o número medido no elemento desenhado**, layout, o **painel do aproveitamento** com os três caminhos, **a entrega do arquivo** |

[`tests/test_montagem.py`](../tests/test_montagem.py) roda os dois e acrescenta
o que só se lê no código-fonte: que a Montagem chama o construtor do Pedido e
não escreve regra própria de arte, que a `runPedImposition` continua chamando o
mesmo construtor, que a rotação vem de uma função só, que o motor só mudou para
aceitar `refazer_repetir`.

[`tests/test_engine_refazer.py`](../tests/test_engine_refazer.py) cobre a chave
no motor: com ela `[3,1,3]` imprime três células na ordem; sem ela continua
entrando uma vez só.

[`tests/test_numero_do_modelo.py`](../tests/test_numero_do_modelo.py) — 36
testes — cobre o desenho do número no motor. O primeiro deles compara o código
novo com uma **cópia literal do código antigo** e exige igualdade exata: é o que
garante que juntar as três cópias numa função não moveu um décimo de ponto do
que a gráfica já aprovou. Os outros cobrem as dezesseis combinações de posição e
giro, o saneamento de valor inválido, e a fonte Impact com a reserva de quem não
a tem instalada.
