# Editor de CSV da numeração — desenho

Data: 11/08/2026

## O problema

Uma numeração pode carregar um banco de dados em CSV: as colunas viram elementos
variáveis (`source: "database"`, `csv_column`), e o motor consome a linha `N` para
imprimir o ticket `N`. Hoje o operador **não tem como ver esse CSV**. A única
interface é o botão "Upload CSV" e um rótulo com o nome do arquivo e a contagem de
linhas. Para corrigir um assento errado num mapa de teatro com 1.240 linhas, ele
precisa abrir o arquivo fora do sistema, editar, e subir de novo — e não tem como
conferir se subiu certo.

Também não há como **excluir uma linha da impressão sem apagá-la**. Reimprimir só
os assentos que falharam exige criar um CSV recortado à mão.

## O que vamos construir

Um modal de tela cheia que mostra o CSV como planilha e permite editar, filtrar,
ordenar e marcar quais linhas serão impressas.

## Onde vive

Arquivo novo `frontend/csv-editor.js`, carregado no `index.html` junto do
`criador-arte.js`. O HTML e o CSS do modal são gerados pelo próprio JS — o
`index.html` já passa de 230 KB e o `script.js` de 28 mil linhas, e não faz sentido
engordar nenhum dos dois.

O modal é um overlay `position: fixed` sobre a página, no mesmo documento. Isso foi
escolhido em vez de uma página HTML separada em outra aba porque o CSV que está
sendo editado pode nunca ter sido salvo no banco: ele vive em `state.numCsvData`. Uma
aba separada exigiria serializar tudo para a `sessionStorage` e devolver por
`BroadcastChannel`, e uma recarga da aba de origem perderia a edição.

## Contrato com o resto do sistema

O modal **não** enxerga o `state` do editor de numeração. Ele recebe tudo pelo
argumento e devolve tudo pelo callback:

```js
window.abrirEditorCsv({
    headers,                    // string[]
    rows,                       // Array<Record<string,string>>
    filename,                   // string
    colunasEmUso,               // () => Record<string, number>  nome -> nº de elementos
    onAplicar({ headers, rows, filename, renomeacoes })
})
```

`renomeacoes` é a lista de `{ de, para }` das colunas renomeadas durante a sessão,
para que o chamador atualize o `csv_column` dos elementos afetados.

O modal trabalha sobre uma cópia (`structuredClone`). Cancelar descarta; Aplicar
chama `onAplicar`. Nada vai ao banco antes do "Salvar Numeração" de sempre.

O `script.js` ganha `abrirEditorCsvDaNumeracao()`, que faz a ponte com
`state.numCsvHeaders / numCsvData / numCsvFilename`.

As funções puras (`parseCsv`, `serializarCsv`, `gerarSequencia`, `linhaAtiva`,
`contarAtivas`) ficam expostas em `window.CsvEditor` sem tocar no DOM.

## Linhas desmarcadas: a chave `__ativo`

Uma linha desmarcada guarda `__ativo: false` dentro dela mesma. A **ausência** da
chave significa ativa, de modo que todo CSV já salvo continua válido e o `jsonb` não
incha com uma chave por linha.

`__ativo` nunca entra em `csv_headers`, nunca aparece no seletor "Coluna do CSV" dos
elementos, e nunca é exportada para arquivo.

No motor, o filtro fica num ponto só, no construtor de `ImpositionConfig`:

```python
if csv_data:
    csv_data = [r for r in csv_data if r.get("__ativo", True) is not False]
self.csv_data = csv_data
```

Como todo o resto do `engine.py` lê `cfg.csv_data`, isso corrige de uma vez o
`total_items` e os seis pontos que indexam `cfg.csv_data[item_index]`.

No frontend, os dois lugares que derivam o total de itens do CSV passam a contar só
as linhas ativas, senão a Imposição anunciaria mais itens do que vai imprimir.

**`engine.py` é embutido no `NewProd.exe`.** Publicar o site não fecha esta mudança:
o agente precisa sair na mesma leva, senão a estação mostra a tela nova e imprime com
o motor velho.

## O parser

O `parseCSVRows` atual faz `split` cru pelo delimitador. Ele quebra em campo com
aspas contendo vírgula, em campo com quebra de linha, e não trata BOM. Isso passa
despercebido hoje porque ninguém vê o resultado; com a planilha na tela, o estrago
fica visível.

Entra um parser RFC 4180 em `csv-editor.js`: aspas, aspas duplicadas (`""`), campo
multilinha, BOM, e detecção de delimitador (`,` `;` tab) por contagem **fora** de
aspas. O `script.js` passa a usar esse parser nos dois pontos de upload — o CSV da
numeração e o CSV da Imposição.

## A tela

Cabeçalho com nome do arquivo, total de linhas e total de marcadas. Três faixas de
ferramentas: busca/filtro/desfazer/importar/exportar; operações de linha e coluna;
seleção e operações em massa. Rodapé com "N de M serão impressas" e os botões
Cancelar/Aplicar.

**Grade virtualizada.** Só as linhas visíveis viram DOM. Um mapa de teatro tem
milhares de linhas, e renderizar milhares de células editáveis trava o navegador.
Altura de linha fixa, cabeçalho `sticky` dentro do mesmo contêiner de rolagem para
que a rolagem horizontal arraste cabeçalho e corpo juntos.

**Células.** Clique abre a edição da célula (um único input por vez, sobreposto à
célula). Enter, Tab e setas movem o cursor. Colar do Excel (TSV) despeja a matriz a
partir da célula do cursor, criando linhas e colunas se precisar.

**Linhas.** Nova, duplicar, remover, e reordenar arrastando pela alça. O arrastar é
desabilitado enquanto houver ordenação ou filtro ativo, porque a posição na tela
deixaria de corresponder à posição real.

**Colunas.** Adicionar, renomear, remover, reordenar. Renomear ou remover uma coluna
quebra os elementos que apontam para ela por `csv_column`. Ao renomear, o modal
registra a renomeação e o `script.js` atualiza os elementos junto; ao remover, a tela
avisa quantos elementos ficarão órfãos antes de confirmar.

**Busca, filtro e ordenação.** A ordenação pelo cabeçalho muda **só a visualização**.
Existe um botão separado, com confirmação, para aplicar aquela ordem à impressão de
verdade — porque a ordem das linhas *é* a ordem de impressão, e reordenar por engano
troca o assento de todo mundo.

**Seleção.** Marcar tudo, nada, inverter, marcar por intervalo de linhas, e marcar o
resultado do filtro atual.

**Massa.** Preencher com um valor, gerar coluna sequencial (prefixo + número +
sufixo, com passo e zeros à esquerda), e localizar/substituir. Cada operação pergunta
o escopo: linhas marcadas, linhas visíveis, ou todas.

**Desfazer/refazer.** Pilha de instantâneos, limitada em quantidade e reduzida quando
o CSV é muito grande. Com edição em massa isso não é luxo.

## Verificação

O projeto não tem runner de teste JavaScript — o `package.json` traz apenas `pdf-lib`
e `puppeteer`. Então:

- `tests/test_engine_csv_ativo.py`, em pytest: um CSV com linhas desmarcadas produz
  menos itens, e a linha certa cai no ticket certo.
- Navegador, pela skill `rodar-app`: abrir uma numeração com CSV, editar uma célula,
  renomear uma coluna e conferir que o elemento acompanhou, desmarcar linhas e
  conferir o total da Imposição, salvar e reabrir.

## Fora de escopo

- Editar o CSV pela tela do pedido ou pela tela do cliente.
- Guardar histórico de versões do CSV no banco.
- Validação de tipo por coluna (numérica, data).
