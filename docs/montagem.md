# Montagem

A tela que junta numa folha só as células a refazer, **mesmo que venham de
pedidos diferentes**. No ar desde 29/08/2026.

Arquivos: [`frontend/montagem.js`](../frontend/montagem.js) (a tela inteira),
[`frontend/index.html`](../frontend/index.html) (o menu e a view),
[`frontend/style.css`](../frontend/style.css) (bloco `MONTAGEM`).
**Nada de Python mudou** — a seção 2 explica por quê.

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

## 2. Por que nenhum Python mudou

Duas coisas já existiam no motor, e é a soma delas que faz esta tela ser só de
frontend.

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

---

## 3. O que a tela faz: traduzir

O operador pensa em *"a posição 6 do modelo 1000565"*. O motor espera posições
no **fluxo combinado**, porque é assim que ele monta o `multi_map`: arte por
arte, cada uma com a sua tiragem inteira.

```
grupos                         →  posições combinadas
1000565  qtd 3000  #1 #6 #22   →  1, 6, 22
1000589  qtd 1920  #340        →  3000 + 340  = 3340
1000412  qtd  150  #7 #12      →  4920 + 7    = 4927 …
```

> ⚠️ **O deslocamento é a TIRAGEM do modelo anterior, não o número de células
> pedidas dele.** Somar 3 em vez de 3.000 faria o motor imprimir os itens
> errados — com os códigos de QR de outros ingressos, descobertos na portaria.
> `posicoesCombinadas()` é a função mais delicada do arquivo, e
> `test_a_traducao_das_posicoes_desloca_pela_tiragem` existe só para isso.

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
  pilha: a montagem compacta numa folha, na ordem digitada.
- **Modo PDF.** Ele decide de onde a arte vem para a tiragem inteira, e cada
  célula da montagem já traz a arte do seu próprio modelo.

### As outras três decisões (29/08/2026)

| | Escolhido |
|---|---|
| Como escolher a célula | pedido → modelo → posições, **acumulando uma lista** |
| Quais pedidos a tela oferece | os **impressos nos últimos 30 dias**, mais busca por número |
| Senha da gerência | **não** — é trabalho normal do operador |

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

### Dois campos para escolher o pedido, e não um

O seletor lista os **impressos nos últimos 30 dias** — refazer célula é sobre
material que acabou de sair, e a fila inteira encheria a lista de pedidos sem
nada a repor. Ao lado dele há um campo de **número**, para o pedido antigo que
voltou do cliente.

São dois campos porque um `<select>` não se digita: a primeira versão prometia
*"escolha ou digite o número"* dentro do seletor, e essa era uma promessa que a
tela não cumpria.

> ⚠️ **O `montagem.js` precisa estar na lista de sincronismo da estação**
> (`security_config.py`). O `index.html` que a estação baixa já pede o script;
> sem o nome ali, o menu novo abriria em branco com um 404 no console. O
> `test_painel_estacao.py` pegou exatamente isso — a tela estava pronta e a
> gráfica não a receberia.

### A tiragem de cada modelo, na lista

A coluna **Tiragem** diz quantos itens aquele modelo imprime ao todo — e é contra
esse número que a posição vale. `#340` só existe num modelo de 1.920; sem o
número na tela o operador digita no escuro. Pedido do usuário em 29/08/2026.

Ele vem do **banco** quando há banco, e não da quantidade contratada: os dois
podem divergir, e quem manda é o que vira papel.

### Imprimir o número do modelo em cada item

Mesmo conceito das *Opções do modelo* da tela do Pedido, e a mesma mecânica: o
motor imprime `arte["nome"]` deitado na borda de cada item, e **esse campo é o
único** que decide se ele sai. Marcada a caixa, o payload leva o número do
modelo; desmarcada, leva vazio.

Numa folha que mistura pedidos é por ele que se separa o material depois de
cortar — é aqui que a marca serve mais do que no Pedido.

Duas diferenças em relação ao Pedido, as duas deliberadas:

- **É uma escolha para a montagem inteira**, não uma por modelo. No Pedido a
  opção mora em `pedidos_modelos` e vale para aquele modelo; aqui a folha mistura
  modelos de pedidos diferentes, e uma caixa por linha faria o operador decidir o
  mesmo N vezes para o mesmo papel.
- **Ela não é gravada no modelo.** A Montagem é reposição avulsa: marcar aqui não
  pode mudar como aquele modelo sai na próxima tiragem inteira dele. A escolha
  que fica salva continua sendo a da tela do Pedido.

Nasce **desmarcada**, como no Pedido — novidade que muda o que sai no papel entra
desligada.

### Onde o PDF vai parar

Duas escolhas, no rodapé da prévia — ambas pedidas pelo usuário em 29/08/2026,
depois que o PDF simplesmente não apareceu (ver §6).

**A pasta.** O seletor lista as pastas que **esta estação** já autorizou, e o
botão ao lado abre o **seletor nativo do Windows na estação**. É a mesma lista, o
mesmo seletor e o mesmo `soltar()` que a tela do Pedido usa para o hot folder do
RIP — e a estação recusa gravar em pasta que não esteja na lista.

Quem abre o seletor e quem escreve no disco é o **agente**, nunca o navegador.
Essa é a razão de ser da escolha: o navegador não enxerga o disco da estação, e
**cada estação da gráfica usa um navegador diferente** — nada aqui pode depender
de permissão, *flag* ou configuração feita no navegador.

Sem pasta escolhida, o PDF desce pelos **downloads do navegador**. É o caminho
que sempre funciona, e por isso ele é a primeira opção da lista: sem estação no
ar, a tela continua entregando o arquivo.

A escolha fica lembrada nesta máquina, e a dica embaixo do seletor diz o que vai
acontecer com o arquivo **antes** de gerar — inclusive que uma pasta observada
pelo RIP põe o material na fila de impressão assim que o arquivo chegar.

**Abrir na tela.** Marcada — e ela nasce marcada —, o PDF abre sobre o painel, na
mesma *lightbox* que o anexo do pedido já usa. Não é janela nova: janela nova é
exatamente o que não funcionava.

Se a gravação na pasta falhar por motivo do disco (a pasta sumiu, a rede caiu), o
trabalho **não se perde**: o PDF desce pelo navegador e o aviso diz o que falhou.
A montagem já tinha dado certo; quem falhou foi o destino.

### A linha da lista é o caminho de volta ao modelo

Clicar numa linha devolve **aquele pedido e aquele modelo** ao compositor, com o
cursor já no campo de posições. Pedido do usuário em 29/08/2026.

Refazer célula é trabalho de **descoberta**: o operador acha mais uma pulseira
estragada depois de já ter montado a folha. Sem isso ele teria de reescolher o
pedido no seletor, esperar o `loadOSItens`, reescolher o modelo na lista e só
então digitar — quatro gestos para dizer uma coisa que a linha já sabe.

O campo de posições fica **vazio**, e não preenchido com o que já foi pedido: ele
vem acrescentar, e ver a lista antiga no campo faria parecer que precisa apagá-la
primeiro. O `adicionarNaMontagem` soma ao grupo que existe.

Duas coisas são travadas por teste:

- **o × continua sendo o ×.** Ele mora dentro da linha, e sem parar a propagação
  tirar um modelo também levaria o compositor de volta a ele — para um modelo que
  acabou de sair da lista;
- **a linha ativa é derivada** do que o compositor mostra, e não um índice
  guardado à parte. Um segundo estado ficaria mentindo assim que o operador
  escolhesse o modelo pelos seletores, ou assim que a lista perdesse um grupo —
  e digitar posições achando que são de outro modelo é erro que só aparece no
  papel.

### Adicionar o mesmo modelo duas vezes SOMA ao grupo

Não cria um segundo. Dois grupos do mesmo modelo dariam duas artes iguais no
`multi_artes`, e o deslocamento contaria a tiragem daquele modelo duas vezes —
todas as posições dos modelos seguintes sairiam erradas.

---

## 6. O defeito de estreia, e o que ele ensinou

A primeira versão foi ao ar na **v771** e o operador viu, ao gerar o PDF:

```
Erro 500: 400: Formato não encontrado.
```

**A causa:** `formato_id` **não existe** em `pedidos_modelos`. Quem o preenche na
memória é o **desenho da fila do Pedido** (`renderPedOSQueue`), a partir do
produto do ERP. A Montagem carrega os modelos com o `loadOSItens` e nunca desenha
aquela fila — então os itens chegavam **sem formato**.

**E a segunda falha era pior que a primeira.** O erro do motor ao menos aparece
na tela. Mas o `porQueNaoCabeNaMontagem` comparava `'' !== ''`, que é falso em
todas as quatro conferências — e devolvia *"cabe"* **sempre**. A regra de
compatibilidade que o usuário decidiu estava **inerte**: uma folha com dois
materiais diferentes teria passado sem um aviso, e a descoberta seria na
impressora.

**O conserto:** a Montagem resolve o formato pela **mesma regra** do desenho da
fila — produto do item → `id_formato` do produto → o formato cujo
`id_formato_num` casa —, guarda o resultado numa **peça normalizada**
(`pecaDaMontagem`) que a conferência e o payload leem, e **recusa** a célula cujo
formato ela não consegue resolver, dizendo o que fazer.

Ela **não grava** o resultado: o desenho da fila escreve de volta com
`autoSaveOSItemField`, mas a Montagem é tela de leitura e não carimba o pedido de
ninguém.

> **A lição, que vale além desta tela:** um campo que parece vir do banco pode
> ser preenchido pelo *desenho* de outra tela. Tela nova que lê modelos não pode
> supor que outra tela já rodou — e a conferência que compara campos vazios não
> falha, ela **passa**, que é a forma mais silenciosa de uma regra morrer. Foi o
> mesmo formato de defeito da trava da gerência em 28/08 e da trava do Hot Folder
> em 29/08: nasceram inertes.

Os dois harnesses ganharam o caso. O da tela passou a montar o item **sem
`formato_id`**, como ele chega do banco, e a exercitar a resolução de verdade.

### O segundo defeito: o PDF era gerado, e sumia

No mesmo dia, com o formato já resolvido, o usuário relatou: **"parou de gerar o
pdf"**.

Ele não tinha parado. O log de diagnóstico do agente registrou as três
tentativas, todas com as duas artes, e uma reprodução do mesmo payload contra a
estação devolveu `HTTP 200 · application/pdf · 121 KB`. O motor gerava; o painel
é que jogava o arquivo fora.

**A causa:** a entrega era `window.open(blobUrl, '_blank')`. O navegador só
deixa abrir janela nova enquanto o gesto do operador ainda vale — no Chrome,
**cinco segundos** —, e uma folha montada demora mais do que isso. O bloqueio é
**silencioso**: nenhuma exceção, nenhum aviso. Pior, o `toast` seguinte dizia
*"Montagem gerada"*, então a tela afirmava sucesso enquanto o PDF ia para o
lixo.

Repare no formato do defeito: ele passa em qualquer teste rápido e falha em
produção. Um trabalho de teste, pequeno, termina dentro dos cinco segundos e a
janela abre. O trabalho de verdade não.

**O conserto** foram três caminhos, e nenhum depende de janela nova: gravar na
pasta da estação, baixar por `<a download>`, e abrir na *lightbox* do próprio
painel. Os testes travam os três, e travam também a ausência do `window.open` —
com os comentários removidos antes da busca, porque a explicação acima **cita** a
função, e um teste que casa com a citação em vez da chamada não guarda nada.

> **A lição:** entrega não é conclusão. O caminho crítico não termina quando o
> servidor responde 200 — ele termina quando o arquivo está na mão do operador, e
> o trecho entre uma coisa e outra roda no navegador, onde há regras que nenhum
> teste de servidor alcança.

---

## 7. O que a Montagem não faz

- **Não muda status nem quantidade.** É reposição: o modelo já está impresso, a
  quantidade contratada é do ERP e não se escreve de volta.
- **Não imprime pela nuvem.** Não há plano B: impressão só acontece pela estação
  da gráfica. Sem agente respondendo, a resposta ao operador é que não dá.
- **Não sabe sozinha o que estragou.** Quem viu o papel foi o operador; a tela é
  onde ele diz.

---

## 8. Testes

| Harness | Verificações | O que trava |
|---|---|---|
| [`tests/montagem_harness.js`](../tests/montagem_harness.js) | 62 | o núcleo: posições digitadas, compatibilidade, e a **tradução das posições** |
| [`tests/montagem_tela_harness.js`](../tests/montagem_tela_harness.js) | 69 | a tela desenhada num Chrome de verdade: lista, selo, trava, prévia, layout, o payload e **a entrega do arquivo** |

[`tests/test_montagem.py`](../tests/test_montagem.py) roda os dois e acrescenta o
que só se lê no código-fonte — inclusive um teste que falha se alguém mexer no
`engine.py` por causa desta tela.

> Nota de método: dois dos testes da tela falharam na primeira execução por
> **erro de conta no próprio teste**, não no código — eu somei as bases errado.
> Foi o harness corrigindo quem o escreveu, que é para isso que ele serve.
