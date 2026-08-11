# Editor de CSV da numeração

Modal de tela cheia que mostra o banco de dados (CSV) de uma numeração como
planilha e permite editar, filtrar, ordenar e escolher quais linhas entram na
impressão. Introduzido na v524.

Arquivos: `frontend/csv-editor.js` (o modal inteiro, HTML e CSS incluídos),
`frontend/script.js` (a ponte), `engine.py` (o filtro das linhas desmarcadas).
Desenho: `docs/superpowers/specs/2026-08-11-editor-csv-design.md`.

## Como se chega nele

Dois botões, os dois chamando `abrirEditorCsvDaNumeracao()`:

- **📋 Ver / Editar**, na box "Banco de Dados (CSV)" do editor de numeração
  (`frontend/index.html`, perto do "Upload CSV").
- **📋 Ver / Editar CSV**, o primeiro botão da barra "Colunas do Banco de Dados
  (CSV)", que só aparece quando há CSV carregado.

Ambos ficam escondidos enquanto não há CSV. Quem os mostra é
`renderNumCsvInterface()`; quem os esconde é `clearNumCsvFile()`.

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

## Como verificar uma mudança

- `pytest tests/test_engine_csv_ativo.py` cobre o filtro no motor.
- Não há runner de teste JavaScript no projeto. Para o modal, use a skill
  `rodar-app`: semeie `state.numCsvHeaders/numCsvData/numCsvFilename/numElements`
  e chame `abrirEditorCsvDaNumeracao()`. Atenção: `window.state` **não** é o
  `state` do `script.js` — ele é declarado com `const` e não vira propriedade do
  `window`, então dentro do `page.evaluate` use o `state` nu.
