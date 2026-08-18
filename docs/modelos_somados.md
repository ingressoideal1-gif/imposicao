# Modelos somados numa imposição só

Vários modelos do mesmo pedido saem numa tiragem única, e a folha se enche na
ordem em vez de cada modelo reservar folhas próprias. Introduzido na v631.

Arquivos: `frontend/index.html` (a barra e as opções do modelo),
`frontend/script.js` (a regra e a conta), `frontend/pedido.js` (o clone da tela
Pedido), `engine.py` (o banco por arte e a ordem),
`sql/alter_pedidos_modelos_opcoes_impressao.sql` (as opções que o modelo
guarda). Desenho e o porquê de cada decisão em
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

## As duas opções que o modelo guarda

Um bloco no painel, acima da barra, com as escolhas do **modelo aberto**:

```
🧾 Opções do modelo 1000277 — Tchequia
   Modo de impressão: [ Sequencial ] [ Blocado ]   ☐ Imprimir o número do modelo em cada item
   Valem ao imprimir este modelo junto com outros na mesma folha.
   Sozinho, ele segue a Regra de Paginação acima.
```

Elas moram em `pedidos_modelos` — `imprimir_numero_modelo`, `modo_impressao`,
`cutstack_modo`, `cutstack_folhas` (migração
`sql/alter_pedidos_modelos_opcoes_impressao.sql`) — e voltam do jeito que
ficaram. Antes disto, o campo da tela ficava com o que sobrou do modelo
anterior.

**A fronteira, e ela é o mais importante deste bloco:** as quatro colunas são
lidas **somente com dois ou mais modelos marcados**. Imprimir um modelo sozinho
continua decidido pela Regra de Paginação da tela, pelo padrão do Formato e pelo
`blocos` do ERP — foi condição do usuário em 18/08/2026, porque esse caminho já
está validado e rodando na gráfica. Por isso o par de botões **não escreve** no
campo Regra de Paginação: escrever ali mudaria a impressão de um modelo só por
via indireta, sem aparecer como mudança de comportamento.

O harness `modelos_somados_harness.js` cobra essa fronteira: toda chamada a
`esquemaDaSelecaoCombinada`, `modoCutStackDaSelecao`, `blocagemDaSelecao` ou
`nomeDosModelosCombinados` fora do bloco de definições precisa estar perto de um
`isMultiSelected`.

### O número do modelo

O motor imprime `arte["nome"]` deitado na borda esquerda de cada item, e esse
campo é o **único** que decide se ele sai. O painel mandava o número sempre, e a
marca aparecia no papel sem ninguém ter pedido. Agora o painel manda vazio
enquanto a caixa estiver desmarcada — que é como ela nasce.

A **Lista de Imposição** da aba Imposição não muda: lá o nome é digitado e a cor
escolhida por coluna, e continua saindo como sempre. A prévia do Pedido passou a
desenhar o mesmo que o papel: até 18/08/2026 ela mostrava `sItem.produto`,
sempre, um texto que a impressão nunca teve.

### Sequencial e Blocado

| Modo do modelo | Esquema que o motor recebe |
|---|---|
| Sequencial | `sequential` — a folha enche na ordem de leitura, folha a folha |
| Blocado | a barra decide: `cut_stack` (folha própria) ou `multi_artes` (aproveitar) |

O motor já sabia fazer `sequential` com modelos combinados — o índice é
`(folha × poses) + pose` e cada item continua puxando a arte e a linha do banco
do próprio modelo —, mas nenhum caminho do painel chegava ali com `multi_artes`
preenchido. Nada de Python mudou.

**Sequencial sempre aproveita a folha**, e não por economia: não há pilha para
cortar, então "folha própria por modelo" não existe nesse modo. A barra fica
desabilitada, com o motivo e a saída escritos ("mude o modo para Blocado").

Sem nada salvo, o modo efetivo vem do `blocos` do ERP e, na falta dele, do
padrão do Formato — quem decidia antes de a escolha existir. E a blocagem sem
nada salvo devolve o mesmo `strict_assembly` com as folhas do `bloco` do ERP que
a v634 já mandava: ligar o recurso não muda nenhuma tiragem que já saía certa.

**Modelos de modos diferentes não combinam.** A ordem das células da folha é uma
só. Isto tem um custo declarado: um modelo com `blocos = S` e outro com
`blocos = N` combinavam até a v634 e não combinam mais. O aviso diz o motivo e
onde mudar.

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

`porQueNaoCombina(a, b)` recusa seis desencontros, e cada um produz uma folha
impossível, não só diferente: **cor**, **formato**, **saída**, **face** (frente e
verso contra só frente), **modo PDF** e **modo de impressão** (Sequencial contra
Blocado). Até a v630 só a cor era conferida.

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

## Os botões "PDF Sel." e "Imp. Sel." não existem mais

Ficavam no cabeçalho de cada produto na fila e saíram em 18/08/2026, quando o
operador relatou que **Imprimir funcionava com dois modelos e Imp. Sel. imprimia
só o primeiro**.

Três coisas, na mesma função:

- **Chamavam a função da outra tela.** `pedQueueGerarPDFMulti` estava no
  `pedido.js` e chamava `runImposition` — a da aba Imposição.
- **Pediam de volta um PDF que ela nunca devolve.** O `returnBlob` só pula a
  janela de "onde salvar"; não existe `return blob` em lugar nenhum de
  `runImposition`. A lista de arquivos ficava vazia e o modal de impressão nunca
  abria por ali.
- **Quem tratava a resposta do motor era a outra função**, salvando os arquivos
  um a um. Com "cada modelo em folha própria" o motor devolve **vários**
  arquivos — a `runPedImposition` os junta em `openPrintModalQueue`, a outra não.
  Daí sair só o primeiro.

Não foram consertados, foram removidos: as mesmas duas ações já existem no
painel, em **Gerar PDF** e **Imprimir**, pelo caminho que a gráfica usa todo dia.
Dois caminhos para a mesma coisa foi o que produziu o defeito, e o segundo não
tinha nada a mais.

## Impressão de vários modelos: status e nome do arquivo

**O status vale para todos os marcados.** `alvosDaImpressao(isMultiSelected)`
devolve a seleção inteira quando há vários, e o modelo aberto quando há um só —
o popup de confirmação já sabia listar vários ("A impressão dos 2 modelos foi
concluída?"). Antes, imprimir dois modelos marcava um e deixava o outro em
Aguardando, e o operador só descobria pela fila, depois.

**O nome do arquivo traz todos os modelos**: `1000277_1000278.pdf`. Acima de
oito encurta para `1000270_a_1000278_9modelos.pdf` — o caminho no Windows para
em 260 caracteres, e o motor ainda deriva daqui os nomes `_setN_02_miolo`.
