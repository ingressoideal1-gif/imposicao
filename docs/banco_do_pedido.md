# O banco de dados do pedido

> A partir de 27/08/2026 o CSV pode deixar de morar dentro da numeração e passar
> a ser um registro do **pedido**. A mesma peça serve vários modelos e vários
> pedidos, cada um com as suas linhas e as suas colunas, sem duplicar o desenho.
>
> Arquivos: `frontend/banco-do-modelo.js` (as regras puras),
> `frontend/script.js` (as telas e a gravação), `sql/pedidos_bancos.sql` (as duas
> tabelas). Plano: `docs/superpowers/plans/2026-08-27-peca-e-banco-etapa-1.md`.

## Por que existe

Até aqui desenho e dado moravam no mesmo registro (`producao_numeracoes.csv_data`).
Reusar uma peça em outro pedido arrastaria o dado do pedido anterior, e a única
saída era duplicar a numeração. Em 27/08/2026 o catálogo tinha **171 numerações,
138 delas nascidas de dentro de um pedido e 77 que são a mesma peça repetida** —
16 famílias de duplicatas, criadas só para trocar o CSV.

Num evento de vários dias isso fica evidente: a arte do camarote é uma só, mas há
uma numeração por dia porque cada dia tem o seu código. Com o banco do pedido, é
uma peça, um banco, e cada modelo aponta para a coluna do seu dia.

## As três coisas separadas

| O quê | Onde mora | Quem é dono |
|---|---|---|
| **A peça** — o desenho, os campos, as posições | `producao_numeracoes` | o catálogo |
| **O banco** — as linhas de dado | `pedidos_bancos` | o pedido (`id_int`) |
| **O vínculo** — qual banco este modelo lê, e por qual coluna | `pedidos_modelos_banco` | o modelo |

O vínculo tem `csv_mapa`, um de‑para simples: `{ "coluna que a peça pede": "coluna
deste banco" }`. A peça pede `CODIGO`; o modelo do dia 5 aponta `CODIGO → 05/09`, o
do dia 6 aponta `CODIGO → 06/09`. Nenhum dos dois altera a peça.

Um pedido pode ter **um** banco lido por vários modelos, ou **um por modelo**: é a
mesma mecânica, muda só quantos registros existem. Decisão do usuário em 27/08/2026.

## A garantia de que nada antigo muda

O caminho novo é escolhido pela **ausência**: modelo sem linha em
`pedidos_modelos_banco` cai exatamente no código de antes.

Isso é garantido por identidade, e não por semelhança. Em `banco-do-modelo.js`:

```js
function numeracaoResolvida(num, banco, mapa) {
    if (!num) return num;
    if (!banco && _vazio(mapa)) return num;   // a MESMA peça, mesma referência
    ...
}
```

Devolver uma cópia quebraria o `garantirCsvDaNumeracao`, que guarda a referência
da numeração para escrever o `csv_data` nela quando o banco desce — a escrita
cairia num objeto que ninguém mais lê e o trabalho sairia com número sequencial no
lugar do nome da pessoa. O teste que trava isso compara com `===`:
`tests/banco_do_pedido_regressao_harness.js`.

Nenhuma linha de `producao_numeracoes` é lida ou escrita pela migração. As 126
numerações que hoje têm CSV dentro continuam como estão, por decisão do usuário —
não há conversão em massa nem prazo para haver.

## As portas na tela (redesenho de 28/08/2026)

O usuário redesenhou a divisão: **o banco é do pedido, então se gerencia no
pedido; o modelo apenas escolhe**. Duas casas:

**No box "🗂️ Gerenciamento de Bancos de Dados"** — coluna direita da tela do
pedido, entre o Briefing e os Anexos (`desenharBoxDeBancos`):

| Porta | O que faz |
|---|---|
| **📤 Subir CSV** | cria um banco do pedido a partir de um arquivo |
| **🌐 Buscar de link** | cria a partir de planilha compartilhada — **cada página vira um banco**, com o link da sua aba (`#gid`) |
| nome editável | renomear grava no blur |
| **🔄 Planilha** | traz de novo o conteúdo do link (só banco com `csv_url`) |
| **📊 Conferir** | abre o editor de CSV no conteúdo do banco, avisando quantos modelos leem dali |
| **🗑** | exclui — com trava: banco lido por algum modelo não sai |
| **🗑 Excluir os N não usados** | limpeza em lote dos bancos que ninguém lê (aparece com 2+) |

**Criar não vincula.** O banco nasce solto; a adoção é sempre uma escolha no
card. Sem vínculo automático não há vínculo acidental.

**No card do modelo** — só o que é do modelo:

| Porta | O que faz | Aparece quando |
|---|---|---|
| **Vem de:** | escolhe: a numeração (padrão) ou um banco já carregado — **só escolha, nenhuma ação** | a peça tem campo de banco, ou já há banco/vínculo |
| **🔤 Colunas** | os checkboxes das colunas que a peça conhece, e o de‑para por modelo | só com banco do pedido |
| **🧩 Linhas** | reparte as linhas entre os modelos que leem a mesma fonte, e marca as **colunas conferidas** — as caixas listam as colunas das peças, e o mapa de cada modelo leva a marca até a coluna do dia dele | há linhas para contar |

A trava de excluir continua: o `ON DELETE CASCADE` apagaria os vínculos junto e
cada modelo cairia **calado** na numeração, imprimindo o dado errado. A trava diz
a saída, e a conta de leitores olha todos os vínculos carregados, não só os itens
do pedido aberto.

A caixa aparece **também quando a peça pede colunas e não tem CSV nenhum** — é a
numeração reaproveitada, exatamente quem precisa da porta para receber um banco.
Peça sem campo de banco não mostra caixa alguma.

`fonteDoModelo(item)` é quem responde "de onde este modelo lê": a numeração ou um
banco do pedido. O 🧩 Linhas e a conferência de repetidos trabalham sobre a
**fonte**, não sobre a numeração — sem isso, o modal abriria o poço errado e
gravaria em `csv_selecao` `__id`s de um banco que aquele modelo não imprime.

## A coluna é do modelo, não da peça (decisão final de 28/08/2026)

Nas palavras do usuário: *"a numeração sera compartilhada entre modelos e entre
pedidos, a coluna deve ser selecionada apenas no modelo, a numeração guarda
apenas a informação dos elementos como seus tamanhos, origem, fontes"*.

- **No editor**, elemento com origem "Banco de Dados" tem o campo **"Exemplo:"**
  — um texto só para a visualização (layout, tamanho, posição). Peça nova não
  escolhe coluna. O controle "Coluna do CSV" sobrevive **apenas** para peça
  legada com CSV/headers próprios.
- **No 🔤 Colunas do modelo**, uma linha por **elemento** (selo + nome + ex.),
  com dropdown das colunas do banco anexado e a caixinha **Conferir** (a marca
  de conferência, que mora no elemento da peça e vale para todos os pedidos).
- O apontamento grava no vínculo com **chave por elemento** (`el:<id>` no
  `csv_mapa`). A resolução tenta essa chave primeiro e cai no caminho legado
  (`csv_column` + mapa por nome) quando ela não existe — **é assim que toda
  numeração já criada continua funcionando até ser substituída**, sem migração.
- **Trava**: modelo com banco e elemento sem coluna apontada (ou apontada para
  coluna que o banco não tem) **não imprime**, nas duas telas — elemento solto
  imprime vazio, calado. O recado manda abrir o 🔤.
- O payload de **um modelo só** também resolve a peça pelo item ativo — o
  multi_artes já resolvia arte a arte.
- **No card do modelo**, a faixa **"Colunas:"** mostra as escolhidas sem abrir
  nada — uma ficha por elemento, só com o **nome da coluna** (a marca de
  conferência de repetições **não** aparece ali, por decisão do usuário; ela
  mora no 🔤). Elemento ainda sem coluna vira ficha vermelha *"sem coluna"* — a
  mesma história da trava, contada antes do Imprimir — e clicar na faixa abre o
  🔤. Quem desenha é `desenharColunasDoModeloNoCard`, chamada junto do "Vem de:"
  a cada redesenho do card; sem banco do pedido a faixa fica escondida.
- **O resumo do paginador** (a linha sob "Linha N / M") também mostra só as
  colunas que **este modelo** imprime — vinha das 3 primeiras do banco, e no
  pedido em que os modelos **compartilham as linhas e dividem as colunas**
  (21346) o card do VIP 1 exibia a coluna do VIP 2. A regra vale no card do
  operador (`script.js`) e na página do cliente (`cliente.js`); peça sem coluna
  apontada cai no resumo antigo. Compartilhar as linhas é suportado de
  propósito: sem distribuição no 🧩, todo modelo lê o banco inteiro — e, para
  compartilhar só uma PARTE das linhas, o 🧩 tem a caixa **"🔁 Linha em mais de
  um modelo"** (28/08/2026), que desliga a exclusividade da atribuição: o modelo
  entra na linha sem tirar os outros. Ver `docs/editor_de_csv.md`.

A seção de checkboxes "colunas do banco nesta numeração" (da rodada anterior do
mesmo dia) morreu com esta decisão: o Exemplo a tornou desnecessária.

**A Conferência de dados compara entre TODOS os modelos** (28/08/2026). A
isenção `separadosPelaColuna` (27/08, formato largo) calava modelos do mesmo
banco que leem colunas diferentes — e engolia o choque real: o mesmo código em
colunas distintas de dois modelos. Ela foi removida depois do relato *"a
Conferência de dados não está verificando entre modelos"*. Quem cala a
repetição legítima é a **marca de conferência**: coluna que repete por natureza
(SETOR, NOME no formato largo) se **desmarca** na caixinha Conferir do 🔤 — e
pronto, sem alarme falso e sem cegueira para o choque de verdade.

## As travas

- **Campo do banco nunca vira contador** (02/09/2026, no motor). Um elemento com
  `source: 'database'` que chega ao `_render_element` **sem linha** para o item
  faz o trabalho **parar**, com o nome do campo e o que conferir. Até esta data
  ele escorregava para o ramo final e imprimia o **número do item** — com
  prefixo, sufixo e zeros, idêntico a uma numeração sequencial comum. Ninguém vê:
  sai um QR bonito, legível, com o conteúdo errado, e quem descobre é a portaria
  do evento. Esta é a única trava que nenhum caminho de tela pode contornar, e é
  por isso que ela existe além das de baixo. (`FOTO` fica de fora: nasce sempre
  com `source: 'database'` e já tem tratamento próprio.)
- **A carga dos bancos é conferida a cada impressão, não memorizada para sempre**
  (02/09/2026). O `garantirBancosDoTrabalho` pula a consulta apenas enquanto
  `state._bancosPedidoDe` aponta para aquele pedido — ou seja, enquanto os bancos
  dele ainda estão no state. A tela de Amostras esvazia `bancosDoPedido` e
  `vinculosDeBanco` ao trocar de pedido, de propósito; a marca antiga de "já
  consultei" sobrevivia a essa limpeza e mandava imprimir sobre estado vazio.
  Sintoma: imprimir o pedido, abrir outro, voltar e imprimir de novo — a segunda
  saía sequencial.
- **Banco que não desceu** — vínculo apontando para banco ausente **recusa a
  impressão**, nas duas telas (`modelosSemBancoDoTrabalho`, em `script.js` e
  `pedido.js`). Motivo: o motor decide entre banco e numeração sequencial pelo
  tamanho de `rows`; banco que não chegou sairia impresso como número, sem erro em
  tela nenhuma. O recado diz o que fazer — *feche e abra o pedido de novo*.
- **Coluna que falta** — `colunasQueFaltam` avisa, ao subir o banco e ao abrir o
  🔤 Colunas, quais colunas a peça lê e o banco não tem.
- **Peça em produção** — salvar uma numeração lida por vários pedidos avisa antes.
- **Renomear coluna do banco** arrasta o **mapa** de cada modelo, não os elementos
  da peça (`aplicarRenomeacoesNoMapa`). A armadilha é a coluna *implícita*: a peça
  pede `NOME`, o banco tem `NOME`, não há entrada no mapa — renomear a coluna
  perderia o apontamento em silêncio. Por isso a reconstrução parte do que cada
  coluna lê hoje, e não das entradas que o mapa por acaso tem.

## Duas pedras já encontradas

**O modelo ativo é `{ itemId, osId }` — e nada mais** (02/09/2026). É assim que
`enviarParaPedido` e `enviarParaImposicao` o gravam. Quem precisar do item usa
`itemAtivoDoPedido()`, que procura pelo `itemId`. Os dois pontos de resolução do
modelo único nas telas de imposição liam um `idx` que ninguém grava: o item não
era achado, a resolução pelo banco do pedido era pulada e a peça ia crua ao
motor — o terceiro relato do 21460, em que marcar os cinco modelos funcionava e
abrir um só não. Um teste (`test_o_modelo_ativo_e_achado_pelo_itemId...`) impede
o `idx` de voltar. A lição de método: eu tinha "provado" duas vezes que o caminho
funcionava semeando `idx: 1` no estado — um campo que a tela nunca põe. Medir o
caminho do operador é medir com o estado **que a tela grava**.


**O id do modelo não é UUID.** A `pedidos_modelos_banco.modelo_id` nasceu `UUID`,
por analogia com as tabelas nossas. Mas `pedidos_modelos` é do parceiro Vibe e o id
dela é um **número** (`1000409`): toda tentativa de ligar um modelo morria com
*"invalid input syntax for type uuid"*, e o operador ficava com o banco criado e
sem vínculo. A coluna é **TEXT** desde 28/08/2026 — aceita o número de hoje e o
formato de amanhã, e o painel já compara os dois lados com `String()`. Conserto do
banco existente: `sql/pedidos_modelos_banco_modelo_id_texto.sql`.

**Vínculo que falha desfaz o banco recém-criado.** Sem isso, cada tentativa deixava
um banco órfão na lista do pedido — foi assim que apareceram três entradas do mesmo
arquivo no "Vem de:", sem porta para apagá-las.

## O banco pode nascer de um link compartilhado

O **🌐 Buscar de link** do box aceita o link de uma planilha do Google
(compartilhada como "qualquer pessoa com o link") ou de um CSV na web. A busca
passa pelo **mesmo** `baixarCsvDaWeb` da numeração. Planilha de várias páginas
cria **um banco por página** — nome = planilha + página, cada um com o link da
sua aba —, e a coluna "Página" não existe dentro deles, porque o banco *é* a
página. Link com `#gid=` traz só aquela página, num banco só.

O link fica gravado em `pedidos_bancos.csv_url`. Quando a lista mudar lá, o
botão **🔄 Planilha** (no 🗂️ Renomear ou excluir bancos…) traz o conteúdo de
novo — com o mesmo cuidado do atualizar da numeração: `__id` e `__ativo` são
herdados **posição a posição**, porque a distribuição de linhas dos modelos
aponta para o `__id` destas linhas, e a confirmação avisa que inserir, apagar ou
reordenar linhas na planilha desloca a distribuição. Coluna que sumiu e algum
modelo ainda lê (já através do mapa dele) entra no aviso antes da troca.

## Fotos com banco do pedido (28/08/2026)

A foto sempre viajou **dentro da linha do CSV** (`__fotos[coluna]`, gravado pelo
Gerenciador de Fotos, ou uma URL/caminho direto na célula) — e o motor lê dali,
com cache em disco na estação, sem saber de onde o CSV veio. O que prendia o
fluxo à numeração era só a porta. Agora são duas:

- **`abrirFotosDoElemento`** (a de sempre): dentro do editor da peça, sobre o
  CSV **da peça**. Continua igual — e, quando a peça não tem CSV, o aviso
  ensina o caminho novo.
- **`abrirFotosDoBanco`** (a nova): o botão **🖼️ Fotos** na linha do banco, no
  box Gerenciamento de Bancos de Dados. Abre o mesmo Gerenciador sobre as
  linhas **do banco** e **grava na hora** (`salvarLinhasDaFonte`) — não existe
  aqui o passo "Salvar a numeração", então um F5 não perde o lote.

As regras da porta nova:

- O 🖼️ **só aparece** quando algum modelo aponta uma janela de foto para o
  banco (`colunasDeFotoDoBanco`, resolução por elemento — `el:<id>` do 🔤 ou
  `csv_column` legado). Sem janela apontada, o clique não teria o que fazer.
- A **janela de enquadramento** (tamanho/encaixe) vem do **elemento** que lê a
  coluna. Modelos com janelas diferentes: vale a primeira, e a tela avisa qual.
- Mais de uma coluna de foto no mesmo banco: o operador escolhe qual abrir.
- O upload vai para `fotos/banco-<id>/<hash>.jpg` no bucket de sempre; a
  sessão de fotos sobrando é `banco:<id>|<coluna>`.
- O 📊 do banco marca célula sem foto e conta o uso das colunas **também para
  peça nova**: `colunasDeFoto`/`colunasEmUso` resolvem por elemento.

O fluxo completo: peça desenha a janela (sem coluna, sem foto) → pedido carrega
o CSV no box → 🔤 aponta a coluna da foto → 🖼️ Fotos no box: importa o lote,
casa foto com linha, enquadra, grava → imprime (trava e aquecimento de cache já
existiam). O modo direto continua valendo: coluna com URLs públicas imprime sem
Gerenciador.

## O que ainda falta
- **A impressão de verdade** com banco do pedido nunca aconteceu — nem com
  fotos. Antes de um trabalho grande, tirar uma folha de prova.

## Como verificar uma mudança

```bash
node tests/banco_do_pedido_regressao_harness.js   # a rede: o caminho antigo intacto
node tests/banco_do_modelo_harness.js             # as regras puras
node tests/banco_do_pedido_etapa2_harness.js      # fonte, colunas, conferência
node tests/pedidos_bancos_sql_harness.js          # o SQL não converte nada
```

Para ver na tela, suba o app pela skill `rodar-app` e semeie `state.numeracoes`,
`state.bancosDoPedido`, `state.vinculosDeBanco` e `state.osItens` — as funções do
card (`atualizarBotoesCsvDaAmostra`, `abrirColunasDoModelo`) são globais.
