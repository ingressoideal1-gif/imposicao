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

### Adicionar o mesmo modelo duas vezes SOMA ao grupo

Não cria um segundo. Dois grupos do mesmo modelo dariam duas artes iguais no
`multi_artes`, e o deslocamento contaria a tiragem daquele modelo duas vezes —
todas as posições dos modelos seguintes sairiam erradas.

---

## 6. O que a Montagem não faz

- **Não muda status nem quantidade.** É reposição: o modelo já está impresso, a
  quantidade contratada é do ERP e não se escreve de volta.
- **Não imprime pela nuvem.** Não há plano B: impressão só acontece pela estação
  da gráfica. Sem agente respondendo, a resposta ao operador é que não dá.
- **Não sabe sozinha o que estragou.** Quem viu o papel foi o operador; a tela é
  onde ele diz.

---

## 7. Testes

| Harness | Verificações | O que trava |
|---|---|---|
| [`tests/montagem_harness.js`](../tests/montagem_harness.js) | 42 | o núcleo: posições digitadas, compatibilidade, e a **tradução das posições** |
| [`tests/montagem_tela_harness.js`](../tests/montagem_tela_harness.js) | 38 | a tela desenhada num Chrome de verdade: lista, selo, trava, prévia, layout e o payload |

[`tests/test_montagem.py`](../tests/test_montagem.py) roda os dois e acrescenta o
que só se lê no código-fonte — inclusive um teste que falha se alguém mexer no
`engine.py` por causa desta tela.

> Nota de método: dois dos testes da tela falharam na primeira execução por
> **erro de conta no próprio teste**, não no código — eu somei as bases errado.
> Foi o harness corrigindo quem o escreveu, que é para isso que ele serve.
