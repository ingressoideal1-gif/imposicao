# Modelos somados numa imposição só

Vários modelos do mesmo pedido saem numa tiragem única, e a folha se enche na
ordem em vez de cada modelo reservar folhas próprias. Introduzido na v631.

Arquivos: `frontend/index.html` (a barra), `frontend/script.js` (a regra e a
conta), `frontend/pedido.js` (o clone da tela Pedido), `engine.py` (o banco por
arte e a ordem). Desenho e o porquê de cada decisão em
`docs/superpowers/specs/2026-08-17-somar-modelos-aproveitando-a-folha-design.md`.

## A regra

Uma conta só: **total de itens ÷ células do formato**, arredondado para cima.
Modo **empilhado**, células preenchidas **na ordem**. É a regra que o usuário
ditou, e ela vale para qualquer pedido — nada de calcular por modelo e somar.

No pedido 20495 (nove modelos de credencial PVC, 4 células por folha A4):

| | Folhas | Células vazias |
|---|---|---|
| Cada modelo em folha própria | 66 | 14 |
| Aproveitando a folha | 63 | 2 |

## Como o operador liga

A barra aparece sozinha quando **dois ou mais modelos** estão marcados na fila,
nas duas abas:

```
🧷 Modelos combinados:  [ Cada modelo em folha própria ▾ ]
   8 modelos · 238 itens · 4 por folha · 63 folhas — aproveitando a folha seriam 60
```

Trocado para **Aproveitar a folha (empilhado)**, a mesma linha passa a dizer
`60 folhas — economia de 3 folha(s)`.

**O padrão é "Cada modelo em folha própria".** Sem tocar no seletor, tudo se
comporta como antes da v631 — decisão deliberada, porque a gráfica já trabalha
com o comportamento antigo aprovado.

A escolha vive em `state.modoSomaFolha` e **não vai ao banco**: é decisão de
tiragem, não do pedido. A barra é um nó fixo do HTML, e não parte da fila; por
isso `renderImpOSQueue` e `renderPedOSQueue` chamam `atualizarBarraDeSoma()` ao
terminar, em vez de a desenharem junto — um seletor redesenhado perderia o valor
a cada clique na fila.

## O que muda no payload

| | Cada modelo em folha própria | Aproveitar a folha |
|---|---|---|
| `schema` | `cut_stack` | `multi_artes` |
| `cut_stack_mode` | `strict_assembly` | `independent` (o motor ignora) |
| folhas | soma de `ceil(qtdᵢ / poses)` | `ceil(Σqtdᵢ / poses)` |

O `strict_assembly` continua existindo e continua sendo o caminho de quem tem
blocagem de verdade: ele monta blocos completos por modelo e dá folhas próprias
às sobras. O modo novo não o substitui.

## O que o operador recebe

238 itens em 60 folhas. Corta em 4 pilhas; empilhadas na ordem das poses (coluna
primeiro) devolvem a sequência 1–238 contínua, e cada modelo é um trecho
contíguo dela. A arte muda no limite, então separar é olhar, não contar.

**As células vazias não ficam juntas na última folha.** No empilhado a pose leva
uma faixa contínua da tiragem, então o buraco cai no fim da **última pilha**. Com
14 itens em folhas de 4 as folhas saem `4, 4, 3, 3` — e isso está certo.

## Quem pode dividir a folha

`porQueNaoCombina(a, b)` recusa cinco desencontros, e cada um produz uma folha
impossível, não só diferente: **cor**, **formato**, **saída**, **face** (frente e
verso contra só frente) e **modo PDF**. Até a v630 só a cor era conferida.

`"SÓ FRENTE"` e `"Frente"` são a mesma coisa — as duas grafias convivem no banco,
e o pedido 20495 tem as duas.

## O contrato do motor

Três coisas mudaram no `engine.py`, e as três importam:

**Cada item carrega a linha do banco da SUA arte.** Antes, os cinco pontos de
renderização liam `cfg.csv_data[item_index]` — um banco único, o da numeração
principal do payload. O `csv_data` que viaja dentro de `multi_artes[i].numeracao`
nunca era lido. Somar oito modelos com banco de dados estourava `IndexError` no
meio da tiragem, ou — no caminho de montagem, que confere o limite — imprimia a
credencial **com o nome em branco**, em silêncio. Agora a linha vai dentro do
item (`csv_row`) e `_linha_do_banco()` decide:

- linha do item, quando há;
- **nada**, quando a arte tem banco próprio e o item passou do fim dele — nunca a
  linha de outro modelo, que sairia com o nome de outra pessoa;
- o banco do trabalho, com o índice conferido, para quem não soma modelos.

**Cada item sabe de que modelo veio.** O `multi_map` ganhou `modelo`. Antes, o QR
Ideal procurava o modelo indexando a lista de **artes** pelo índice do **item**:
o item 40 de uma folha de oito artes não existia ali e recebia o modelo do
trabalho, e o caminho de montagem — que chama sem índice — dava a **todos** os
itens o modelo da primeira arte. Os códigos saíam da coluna errada do pool, e
isso só aparece na portaria. Agora, item sem modelo numa folha somada **levanta
erro**: falhar alto é a regra do QR Ideal.

**A ordem do pedido manda no modo somado.** `sorted_artes` só ordena por
quantidade decrescente quando o esquema é `strict_assembly`, onde isso ajuda a
montar blocos. No modo somado embaralhava a tiragem sem ganho nenhum.

## Como verificar uma mudança

- `pytest tests/test_engine_modelos_somados.py` — a conta das folhas, a ordem das
  células, a linha de banco de cada arte, os limites de `_linha_do_banco`, e a
  trava do QR Ideal.
- `pytest tests/test_harness_de_imposicao.py` — roda os harnesses de node dentro
  da suíte (`modelos_somados_harness.js` e `csv_fatia_do_modelo_harness.js`).
- `node tests/modelos_somados_harness.js` — a conta que a barra mostra e as cinco
  recusas de compatibilidade, com as funções lidas do `script.js`.

## Fora de escopo

Combinar modelos de **pedidos diferentes** foi decidido como fora de escopo em
17/08/2026: abre perguntas de status, cancelamento e de a quem pertence a folha
que ainda não têm resposta.

## A seleção pertence a um pedido só

Em 18/08/2026 o operador marcou os modelos **1000277** e **1000278** e só o
1000277 saiu. Os dois são de pedidos diferentes — Tchéquia é do 20495, VIP é do
20508 —, e a seleção do pedido anterior tinha atravessado a troca.

Três coisas se somavam, e nenhuma avisava:

- **`state.selectedOSItems` só era zerado em `abrirImposicaoDoPedido`**, do
  `script.js`. Abrir um pedido pela aba Pedido não limpava nada.
- **A fila só desenha o pedido aberto**, então o modelo do outro pedido ficava
  invisível: o operador não via e não tinha como desmarcar.
- **`sItem` virava `undefined`** ao montar as artes, porque `state.osItens` não
  tinha aquele pedido carregado — e a arte entrava no trabalho com `qtd: 0`,
  sumindo da folha sem uma linha de aviso.

Agora, `limparSelecaoDeOutroPedido(osId)` derruba os forasteiros ao abrir um
pedido e ao marcar um modelo, dizendo quantos foram; e `problemaNaSelecao()`
trava a imposição, nas duas telas, quando a seleção cruza pedidos ou contém
modelo que não está mais carregado. As duas mensagens dizem a saída.

A validação de compatibilidade também dependia disso: ela procurava o primeiro
modelo marcado dentro dos itens do pedido **do modelo sendo marcado**. Com a
seleção cruzando pedidos, a busca não achava nada e a conferência passava em
silêncio. Com os forasteiros fora, ela volta a valer.
