# Editor de CSV da numeração

Modal de tela cheia que mostra o banco de dados (CSV) de uma numeração como
planilha e permite editar, filtrar, ordenar e escolher quais linhas entram na
impressão. Introduzido na v524.

Arquivos: `frontend/csv-editor.js` (o modal inteiro, HTML e CSS incluídos),
`frontend/script.js` (a ponte), `engine.py` (o filtro das linhas desmarcadas).
Desenho: `docs/superpowers/specs/2026-08-11-editor-csv-design.md`.

## Como se chega nele

Três botões na box "Banco de Dados (CSV)" do editor de numeração, e um quarto
mais abaixo. Quem alterna a visibilidade de todos é `renderNumCsvInterface()`
(há CSV) e `clearNumCsvFile()` (não há):

| Botão | Aparece quando | Chama |
|---|---|---|
| 📊 Upload CSV | sempre | `handleNumCsvSelected()` |
| ➕ Criar vazio | **não** há CSV | `criarCsvVazioDaNumeracao()` |
| 📋 Ver / Editar | há CSV | `abrirEditorCsvDaNumeracao()` |
| 📋 Ver / Editar CSV (barra "Colunas do Banco de Dados") | há CSV | idem |

### Começar do zero

`criarCsvVazioDaNumeracao()` abre o modal com **zero colunas e zero linhas**.
Não é uma tela morta: no lugar da grade aparece um painel com os três caminhos —
**📋 Colar do Excel…**, **⬆ Importar CSV** e **+ Criar coluna**. Quando já há
colunas mas nenhuma linha, o terceiro vira **+ Nova linha** e o texto muda.

Se o banco já existir, o botão não aparece; e mesmo que seja chamado, a função
desvia para `abrirEditorCsvDaNumeracao()` em vez de jogar fora o que está lá.

**Colar do Excel** é o caminho principal de quem monta o banco na hora: uma caixa
de texto onde se cola o TSV copiado da planilha, com a opção *"A primeira linha é
o cabeçalho"* marcada por padrão, e a escolha entre substituir tudo e anexar ao
final. Existe porque depender do Ctrl+V direto na grade exige foco no lugar certo
e não é descobrível. O Ctrl+V na grade continua funcionando, e **numa tabela sem
colunas ele promove a primeira linha colada a cabeçalho** — não haveria "a partir
do cursor" a respeitar.

Aplicar um banco que ficou **sem nenhuma linha** limpa o CSV da numeração em vez
de gravar um array vazio. Um array vazio deixaria a numeração marcada como "tem
CSV" e a Imposição tentaria imprimir zero itens.

## O contrato

O `csv-editor.js` não enxerga o `state` do editor de numeração. Recebe tudo pelo
argumento e devolve tudo pelo callback:

```js
window.abrirEditorCsv({
    headers, rows, filename,
    colunasEmUso,        // () => { 'Fila': 2, ... }  nome -> nº de elementos
    onAplicar({ headers, rows, filename, renomeacoes })
})
```

Ele trabalha sobre uma cópia das linhas. **Cancelar descarta; Aplicar comita na
memória.** Nada vai ao banco antes do "Salvar Numeração" de sempre — e o toast
de sucesso diz isso, porque a confusão é fácil.

As funções puras ficam em `window.CsvEditor`: `parseCsv`, `serializarCsv`,
`detectarDelimitador`, `linhaAtiva`, `contarAtivas`, `apenasAtivas`,
`gerarSequencia`, `parseColado`. Nenhuma delas toca no DOM.

## As quatro coisas que enganam

### 1. Uma linha desmarcada continua guardada

Desmarcar não apaga. A linha ganha `__ativo: false` dentro dela mesma e some da
impressão, mas continua no CSV e volta a imprimir se for remarcada. Quem quer
apagar de verdade usa "Remover" (uma linha) ou "🗑 Remover desmarcadas" (todas).

A **ausência** da chave significa ativa. Foi assim de propósito: todo CSV salvo
antes da v524 continua valendo sem migração, e o `jsonb` não engorda com uma
chave por linha.

O filtro fica num ponto só, no construtor de `ImpositionConfig` em `engine.py`.
Como todo o resto do motor lê `cfg.csv_data`, isso resolve de uma vez o
`total_items` e os seis lugares que fazem `cfg.csv_data[item_index]`. Se **todas**
as linhas estiverem desmarcadas, o motor levanta `ValueError` com recado claro em
vez de cair no ramo sequencial e imprimir numeração errada.

No frontend, `linhasAtivasCsv()` faz o mesmo filtro nos dois pontos que derivam o
total de itens da Imposição e no rótulo da box.

### 2. Ordenar pelo cabeçalho não muda a impressão

A ordem das linhas **é** a ordem de impressão: o motor consome a linha `N` para o
item `N`. Clicar no cabeçalho ordena só a visualização — a coluna `#` continua
mostrando a posição real, então ela aparece fora de ordem, e isso está certo.

Para reordenar de verdade existe o botão separado **"⇅ Aplicar ordem à
impressão"**, que só aparece quando há ordenação ativa e pede confirmação.

### 3. Renomear coluna mexe nos elementos

Um elemento com `source: "database"` aponta para a coluna pelo nome, em
`csv_column`. Renomear a coluna sem mais nada deixaria o elemento apontando para
um nome que não existe.

Por isso o modal acumula as renomeações e as devolve em `onAplicar`, e a ponte no
`script.js` atualiza o `csv_column` dos elementos afetados. O painel de colunas
mostra em âmbar quantos elementos usam cada coluna, e remover uma coluna em uso
avisa antes.

Encadeamento é colapsado: renomear A→B e depois B→C devolve um único A→C.

### 4. Arrastar linha fica travado com filtro ou ordenação ativos

A alça `⠿` some de ação quando há busca, filtro ou ordenação, porque a posição na
tela deixaria de corresponder à posição real e o operador arrastaria uma linha
para um lugar que não é o que ele está vendo. O `title` da alça explica.

## Detalhes de implementação que valem saber

- **A grade é virtualizada.** Só as linhas visíveis viram DOM (~32 de cada vez,
  com sobra). Um mapa de teatro tem milhares de linhas; renderizar tudo trava o
  navegador. Altura de linha fixa em `ROW_H`, cabeçalho `sticky` dentro do mesmo
  contêiner de rolagem para que a rolagem horizontal arraste os dois juntos.
- **O input de edição é um só**, filho permanente do spacer, reposicionado sobre
  a célula do cursor. Ele **para a propagação** de todo `keydown` e `paste`: sem
  isso, o Enter que confirma a edição borbulha até a grade, que o trata como
  "começar a editar", e `ed.editando` fica preso em `true` engolindo todos os
  atalhos. O mesmo valia para o colar, que era aplicado duas vezes.
- **Clique em célula é tratado no `mousedown` com `preventDefault()`**, para que o
  `blur` padrão do input não dispare depois de o cursor já ter mudado — o que
  gravaria o valor antigo na célula nova.
- **O parser é RFC 4180**: aspas, aspas duplicadas, campo com quebra de linha, BOM,
  e delimitador detectado por contagem *fora* de aspas. O `parseCSVRows()` do
  `script.js` delega para ele; o código antigo ficou só como reserva caso o
  `csv-editor.js` não carregue.
- **Desfazer/refazer** guarda instantâneos inteiros. O limite cai conforme o CSV
  cresce (50 passos até 5 mil linhas, 18 até 20 mil, 6 acima disso).
- O painel de colunas usa o id `csv-ed-cols` e os diálogos usam `csv-ed-dlg`, com
  z-index diferentes: um diálogo aberto por cima do painel precisa ganhar o Esc.

## O segundo modo: distribuir entre os modelos do pedido

Um mesmo CSV serve a vários modelos do mesmo pedido — o mapa do teatro vira um
modelo por setor. O banco fica **uma vez** na numeração; a fatia de cada modelo
mora em `pedidos_modelos.csv_selecao`. Desenho completo em
`docs/superpowers/specs/2026-08-11-distribuir-csv-entre-modelos-design.md`.

Entrada: uma faixa no topo da fila da OS (`renderImpOSQueue`), que só aparece
quando dois ou mais modelos apontam para a mesma numeração com CSV. Ela mostra a
cobertura e o botão **🧩 Distribuir entre os modelos**, que chama
`abrirDistribuicaoCsv(osId, numId)`.

O modal entra em modo distribuição quando recebe `modelos: [{id, nome, selecao}]`.
Nesse modo:

- Coluna fixa **Modelo** com bolinha colorida, e barra **"Atribuir a"** com um
  botão por modelo.
- **A caixa de marcar muda de sentido**: aqui ela é a seleção do momento, não o
  "imprime / não imprime". Clicar numa célula seleciona a linha em vez de editar.
- Sem edição de célula, sem coluna nova, sem colar, sem importar — trocar o banco
  no meio da distribuição daria identidade nova às linhas e nenhum modelo as
  reconheceria. Cancelar/reativar linha continua, porque faz parte do trabalho.
- **A atribuição é exclusiva.** Dar uma linha a um modelo tira dela o dono
  anterior. Linha repetida em dois modelos não acontece por construção.
- O rodapé responde a única pergunta que sobra — ficou alguém sem dono? — e
  clicar nele filtra a grade para essas linhas.

A busca e o filtro do modo edição são a ferramenta de atribuição: filtre por
coluna, clique em "Visíveis", clique no modelo.

### `__id`: a identidade que faz isso funcionar

Marcar à mão só sobrevive a uma edição do CSV porque cada linha tem `__id`, um
inteiro sequencial gravado dentro dela. Nunca reaproveitado, nunca exportado,
nunca oferecido como coluna. Garantido em `recalcular()`, que é por onde toda
mutação passa — com uma armadilha: **duplicar linha precisa apagar o `__id` da
cópia**, senão nascem duas linhas com a mesma identidade.

`csv_selecao` guarda faixas compactas desses ids:
`{ "tipo": "linhas", "ids": ["1-400", "612"] }`. **Nulo significa o banco
inteiro**, que é o comportamento de todo pedido anterior — por isso a migração
não converteu dado nenhum.

### Onde a fatia entra na impressão

`updateImpSummary()` carrega a fatia do item ativo em vez do banco inteiro; e no
caminho `multi_artes` cada arte recebe uma cópia da numeração com `csv_data` já
reduzido. Nesse segundo caminho a quantidade da arte passa a ser o tamanho da
fatia — **só quando o modelo tem `csv_selecao`**, para não mudar o comportamento
de pedidos que já estão em produção.

Como o `csv_data` viaja pronto no payload, **o `engine.py` não muda por causa
disso** e o agente não precisa ser republicado.

### A visualização da amostra é paginada

Numeração com elemento de CSV não tem "uma" amostra: tem uma por linha de dado.
Por isso o card do modelo, na Lista de Arte, ganha um seletor de linhas abaixo do
desenho — o mesmo idioma que o modo PDF já usava (`amostra-pdf-nav-N`):

```
◀   Linha 3 / 5   [3]   ▶
   Fila: A · Assento: 03 · Setor: Pista
```

**Cada modelo navega apenas pela sua fatia.** As páginas saem de
`linhasDaAmostra(item, num)`, que é a fatia do modelo quando ele tem uma, o banco
inteiro quando não tem, e o CSV solto da Imposição em último caso (o que atende à
amostra avulsa).

Detalhes que importam:

- **Um seletor comanda as duas faces.** Frente e verso mostram sempre a mesma
  linha; seria confuso de qualquer outro jeito.
- **Todos os elementos variáveis da face leem a mesma linha.** O
  `drawAmostraFace` resolve `_linhaCsv` uma vez e a usa em TEXT, TEATRO_* e QR.
- **O seletor só aparece quando há o que navegar**: a numeração precisa ter ao
  menos um elemento com `source: "database"` e a fatia precisa ter mais de uma
  linha.
- **A página vive em `state.amostraCsvPaginas`, com chave `osId:itemId`** — e não
  no objeto do item. O pedido recarrega os itens em segundo plano e substitui os
  objetos; um campo posto no item se perderia no meio da navegação e a página
  voltaria sozinha para a primeira linha. Isso apareceu na verificação.
- **Navegar não é editar.** O `amostraCsvPagina()` não marca `_needsSnapshot`,
  senão o instantâneo enviado ao link do cliente passaria a ser a linha que o
  operador estava olhando por acaso.

O link do cliente (`frontend/cliente.js`) tem a sua própria cópia do
`drawAmostraFace` e **não** foi paginado. Ele continua mostrando a primeira
linha. Se um dia isso mudar, é decisão de produto: muda o que o cliente vê.

### A tabela é `pedidos_modelos`

Não é `producao_os_itens`. Os arquivos em `sql/` descrevem `producao_os_itens`,
mas o aplicativo deixou essa tabela para trás — `loadOSItens` lê `pedidos_modelos`
e é ela que recebe toda escrita ([script.js:14719](../frontend/script.js#L14719)).
Nessa tabela a numeração do modelo é **`amostra_num_id`**; `numeracao_id` só
existe no objeto já mapeado em memória. E cuidado com `item.modelo`: apesar do
nome, o `loadOSItens` o preenche com o **id** do registro — o nome de gente está
em `nome_modelo`.

## Como verificar uma mudança

- `pytest tests/test_engine_csv_ativo.py` cobre o filtro no motor.
- Não há runner de teste JavaScript no projeto. Para o modal, use a skill
  `rodar-app`: semeie `state.numCsvHeaders/numCsvData/numCsvFilename/numElements`
  e chame `abrirEditorCsvDaNumeracao()`. Atenção: `window.state` **não** é o
  `state` do `script.js` — ele é declarado com `const` e não vira propriedade do
  `window`, então dentro do `page.evaluate` use o `state` nu.
