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

## As três chaves de sistema da linha

Uma linha do banco carrega, além das colunas do operador, chaves que **nunca
viram coluna da grade e nunca são exportadas**: `__ativo` (imprime ou não),
`__id` (identidade estável da linha) e `__fotos` (o enquadramento das fotos
daquela pessoa, gravado pelo Gerenciador de Fotos — ver
`docs/gerenciador_de_fotos.md`). As três estão em `COLS_INTERNAS`, no
`csv-editor.js`, e todo ponto que derive cabeçalhos das chaves da linha precisa
filtrá-las.

`__fotos` mora dentro da linha, e não numa tabela à parte, pelo mesmo motivo que
o `__id`: é o que faz o enquadramento acompanhar a pessoa quando a tabela é
reordenada, quando a numeração é dividida entre modelos, e quando uma célula é
refeita.

**O vínculo manda; a célula é legenda.** O que imprime é `__fotos[coluna]` — o
texto da célula existe para o operador reconhecer a foto na grade. Por isso a
edição da célula de uma coluna de foto (digitada ou colada) **desfaz o vínculo**,
via `escreverCelula`: a célula fica vermelha e a foto é reanexada pelo
Gerenciador. Sem isso, a grade diria "MARIA.jpg" e a credencial sairia com o
rosto da Ana — o erro que só o cliente descobre. Pela mesma razão, renomear a
coluna arrasta o vínculo junto, remover a coluna o apaga, duplicar linha dá a
cada cópia o seu próprio, e `copiarLinha` separa o `__fotos` do objeto do banco
vivo, para desfazer e descartar voltarem atrás de verdade.

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

**Lista vazia não é a mesma coisa que nulo.** Nulo é "nunca distribuído"; lista
vazia é "houve distribuição e este modelo não ficou com nenhuma linha". Até a
v629 o código lia as duas do mesmo jeito, e o modelo esquecido na distribuição
imprimia o banco inteiro — o oposto do que a tela dizia, e em silêncio. Desde a
v630 lista vazia devolve zero linhas.

### Onde a fatia entra na impressão

`updateImpSummary()` carrega a fatia do item ativo em vez do banco inteiro; e no
caminho `multi_artes` cada arte recebe uma cópia da numeração com `csv_data` já
reduzido. Nesse segundo caminho a quantidade da arte passa a ser o tamanho da
fatia — **só quando o modelo tem `csv_selecao`**, para não mudar o comportamento
de pedidos que já estão em produção.

Como o `csv_data` viaja pronto no payload, **o `engine.py` não muda por causa
disso** e o agente não precisa ser republicado.

#### São duas telas, e as duas precisam do corte

`frontend/pedido.js` é um **clone** do `script.js` (a primeira linha do arquivo
diz isso), com os ids `imp-*` renomeados para `ped-*`. A aba **Pedido** e a aba
**Imposição** impõem por códigos diferentes, e o corte precisa existir nos dois:

| | Imposição | Pedido |
|---|---|---|
| resumo / total | `updateImpSummary` | `updatePedSummary` |
| gerar / imprimir | `runImposition` | `runPedImposition` |

A fatia nasceu só no `script.js`, e o `pedido.js` ficou dois meses imprimindo o
banco inteiro. Apareceu no **pedido 20495** em 17/08/2026: um caderno de
credenciais de 238 linhas repartido entre oito países, imposto pela aba Pedido,
saiu com as 238 células na folha da Bulgária em vez das 37 dela. O sintoma
enganava porque a regra estava certa, testada e documentada — só que na outra
tela.

`tests/csv_fatia_do_modelo_harness.js` guarda isso: além de testar a regra, ele
lê os dois arquivos e exige que os dois passem pelo `fatiaCsvDoItem`, no ramo do
banco embutido e no caminho multi-artes. **Ao mexer numa regra de impressão,
procure a gêmea no outro arquivo.**

#### Fatia vazia não pode virar folha impressa

Zero linhas não sai como folha em branco — sai pior. O motor recebe `csv_data`
vazio, o `if csv_data:` do construtor de `ImpositionConfig` não entra, e a
imposição **cai no ramo sequencial**: a credencial sairia com um número no lugar
do nome da pessoa, e o operador só descobriria com o material na mão.

Por isso `recadoDeFatiaVazia()` trava as duas telas antes de qualquer coisa ser
aberta, e o recado diz a saída, e não só o problema: *"Sem nenhuma linha do banco
de dados: Bulgaria. Modelo sem linha não imprime nada. Abra 🧩 Linhas no card do
modelo, escolha as linhas que ele imprime e imponha de novo."*

A trava só vale quando houve distribuição de verdade — `csv_selecao` presente e a
numeração com banco. Modelo nunca distribuído continua levando o banco inteiro, e
modelo cuja numeração não tem CSV nunca é barrado.

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

**O CSV solto só vale quando veio de fora de uma numeração.** Corrigido em
22/08/2026: a numeração "Expointer 2026", sem CSV nenhum no banco, mostrava
"1 de 19.500" no card do modelo — eram as linhas da numeração 1000475, que
tinham ficado em `state.csvData` (a fatia montada quando o operador olhou um
modelo dela) e em `state.numCsvData` (o editor). Como a Expointer tinha um
elemento de banco de dados, a tela pedia linhas, não achava nenhuma dela e
pegava emprestadas as da vizinha; um F5 fazia sumir. Agora a fatia de uma
numeração é marcada como derivada (`state.csvDataDerivado = true`, nas duas
telas de imposição — `script.js` e o clone `pedido.js`) e nunca é emprestada;
o arquivo subido na caixa da Imposição e o mapa de teatro continuam servindo a
amostra avulsa (`csvDataDerivado = false`); e o estado do editor
(`numCsvData`) não entra mais no desenho do modelo. O harness
`tests/csv_fatia_do_modelo_harness.js` lê a função de verdade do `script.js` e
exercita o cenário da Expointer.

Detalhes que importam:

- **Um seletor comanda as duas faces.** Frente e verso mostram sempre a mesma
  linha; seria confuso de qualquer outro jeito.
- **Todos os elementos variáveis da face leem a mesma linha.** O
  `drawAmostraFace` resolve `_linhaCsv` uma vez e a usa em TEXT, TEATRO_* e QR.
- **Folhear o banco folheia a PEÇA inteira, e não só os campos do banco**
  (21/08/2026). Até essa data o seletor trocava só o que vinha do CSV: o número
  sequencial, o QR Ideal, o QR sequencial e o camarote ficavam parados na
  primeira peça. A tela mostrava a linha 3 do banco casada com o ingresso 1 —
  uma peça que o motor nunca imprime. A conta é a do `engine.py`: a página da
  tela é o `local_idx` do motor, o item `i` do modelo nasce com `val1 = n1 + i` e
  recebe `csv_row[i]`. Ela mora em `frontend/numero-da-pagina.js`
  (`NumeroDaPagina.sequencial` e `.camarote`), um arquivo só, porque quem a
  repete são o card do painel (`script.js`) e o card do link do cliente
  (`cliente.js`), que já divergiram antes. Página 0 devolve exatamente o valor
  de antes — nenhuma visualização parada na primeira linha mudou.
- **O QR Ideal repinta quando a estação responde.** O código não se calcula no
  navegador: cada página pede um à estação, e a resposta chega depois do
  desenho. O `repintar()` do `qr-canvas.js` passou a chamar também
  `repintarAmostrasCombinadas`, senão o card ficaria com o QR de exemplo a cada
  página virada.
- **O código de barras é o único que não acompanha.** Ele é um padrão de barras
  decorativo em todas as janelas do navegador — não codifica valor nenhum, nem
  antes nem depois desta mudança. Quem imprime barra de verdade é o `engine.py`.
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

### O link do cliente também pagina

O cliente folheia os ingressos do modelo dele, com o mesmo seletor — no
vocabulário dele: `◀ Ingresso 3 de 5 ▶`.

**O desenho é refeito no navegador do cliente**, e não vem pronto do servidor.
Uma imagem por linha seria inviável: um banco de 3.000 linhas daria centenas de
MB no Storage e um download a cada clique no ◀▶. Desenhando ali, virar página
**não gera nenhuma ida à rede** — está verificado.

Por isso, e só nos modelos que paginam, a `<img>` da imagem aprovada dá lugar a
um `<canvas>`. A decisão está em `paginaCsv`, dentro do `renderAmostrasOSItens`
do `cliente.js`, e ela exige **três** coisas:

1. a numeração tem banco e um elemento `source: "database"`;
2. o modelo **não** está em modo PDF — esse já tem o seletor de páginas dele;
3. o modelo tem `arte_url` (e `verso_arte_url`, se tiver verso).

A terceira condição não é preciosismo: o `drawAmostraFace` do cliente lê a arte
de `item.arte_url` e **não** cai para `amostra_arte_base64`. Sem ela, o canvas
sairia com a cor e a numeração e sem a arte — pior do que não paginar. Quem não
passa nas três continua exatamente como antes, com a imagem aprovada e sem
seletor.

#### A página ficou mais leve do que era

O `cliente.js` fazia `select('*')` em `producao_numeracoes`: **569 KB** (89 KB
comprimidos) com o banco de dados de **todas** as numerações do sistema. Medido
em 12/08/2026: 84% disso era `csv_data` de pedidos alheios — o `Whisper.csv` de
3.000 linhas e o `Avra.csv` de 2.000 desciam para o celular de qualquer cliente
que abrisse qualquer link, e nenhum era usado.

Agora são duas consultas: o catálogo com colunas explícitas e sem `csv_data`
(11 KB comprimidos), e o `csv_data` **apenas das numerações que o pedido usa**.
Ao acrescentar coluna nova em `producao_numeracoes` que o link do cliente
precise ler, lembre de incluí-la nessa lista — ela é explícita de propósito.

### Buscar o banco direto da web

Na caixa **Banco de Dados (CSV)** do editor de numeração há um campo de endereço:
cola-se o link de uma Planilha Google (ou de qualquer `.csv` público) e o banco
entra igual a um upload de arquivo.

```
🌐 Da web  [ https://docs.google.com/spreadsheets/d/1_Yj…/edit?usp=sharing ]  ⬇ Buscar  🔄 Atualizar da planilha
🔗 Este banco veio da planilha acima. 🔄 Atualizar da planilha troca o conteúdo…
```

O botão de atualizar e a linha verde só aparecem quando a numeração tem uma
planilha ligada — ver "O vínculo com a planilha", adiante.

**Roda no navegador, sem servidor no meio.** O endereço de exportação do Google
devolve `Access-Control-Allow-Origin`, então o `fetch` da página funciona — foi
verificado, não presumido. Por isso o recurso não toca no `app.py` e **não exige
publicar o agente**.

O que o `urlCsvDaPlanilha()` faz com o link:

| Cola-se | Busca-se |
|---------|----------|
| `…/spreadsheets/d/ID/edit?usp=sharing` | `…/spreadsheets/d/ID/export?format=csv` |
| `…/edit#gid=1234567` | `…&gid=1234567` (a **aba** do link) |
| um endereço que já exporta CSV | ele mesmo, intacto |
| qualquer outro `.csv` público | ele mesmo |

O `gid` importa: sem ele vem sempre a primeira aba, que raramente é a que o
operador estava olhando.

O nome do arquivo sai do cabeçalho `Content-Disposition` da resposta — que o
Google expõe ao navegador —, então a numeração fica com o nome real da planilha,
e não com um rótulo genérico.

### Planilha de várias páginas vem inteira

Um caderno de credenciais costuma ter **uma página por país**, e o pedido imprime
todas. Por isso, colar o link de compartilhamento de uma planilha com mais de uma
página traz **todas de uma vez**, empilhadas numa tabela só.

O `/export?format=csv` entrega uma página apenas, e o `gid` de cada uma é um
número arbitrário que não dá para adivinhar. Quem lista as páginas sem exigir
chave de API é a página **`/htmlview`**, que o Google serve com os cabeçalhos de
CORS e que carrega um trecho de javascript com um
`items.push({name: "…", gid: "…"})` por aba, na ordem certa e com o nome já
legível. `paginasDaPlanilhaGoogle()` lê esse trecho; cada página é então baixada
pelo caminho normal, `export?format=csv&gid=N`, em paralelo.

**Isso é leitura do HTML dos outros e pode parar de funcionar sem aviso.** Por
isso qualquer falha ali devolve lista vazia em vez de erro: a busca cai no
caminho de sempre e traz a primeira página, que era o comportamento anterior.

O que a junção faz:

- **Colunas são a união de todas as páginas**, na ordem em que aparecem. Página
  que não tem uma coluna fica com o campo vazio, em vez de desalinhar.
- **A primeira coluna é criada por nós**, chamada `Página`, e diz de onde veio
  cada linha. Sem ela, 238 linhas de 8 países viram um bloco indistinguível — e é
  justamente por ela que o operador filtra no editor e reparte as linhas entre os
  modelos. Se a planilha já tiver uma coluna `Página`, a nossa vira `Página 2`.
- **Essa coluna não vira campo no ticket.** É metadado de organização, não
  conteúdo impresso; quem quiser imprimi-la clica no botão `📊 Página`.
- **Página vazia é ignorada**, e página que falhou não derruba as outras — as
  duas coisas são relatadas no aviso.
- **O nome fica `<caderno> (N páginas).csv`**, derivado do
  `Content-Disposition` da primeira página com o sufixo ` - <página>` removido.

**Para trazer uma página só**, abra-a no Google antes de copiar o endereço: o
link fica com `#gid=`, e um `gid` explícito é respeitado como escolha deliberada.
É a única forma de pedir uma página específica, e está escrita embaixo do campo.

**Os modos de falha que a tela precisa distinguir:**

- **Planilha privada ou inexistente** → resposta 404, e o aviso diz para
  compartilhar como "Qualquer pessoa com o link".
- **Planilha que responde 200 com a página de login** → chegaria HTML. Sem
  guarda, o parser aceitaria esse HTML como uma tabela de uma coluna só; por
  isso o texto é recusado quando começa com `<!doctype` ou `<html`.
- **Erro de rede/CORS** → o `fetch` rejeita com um `TypeError` sem detalhe
  nenhum, e a mensagem genérica do navegador não ajudaria ninguém; a tela
  traduz para o que quase sempre é a causa, o compartilhamento.

Em qualquer falha **o banco que já estava carregado permanece**: buscar não
apaga o que existe antes de ter o substituto em mãos.

### A planilha de várias páginas: linha enxuta, e uma numeração por aba

Em 23/08/2026 a planilha do Expointer — **19 abas**, uma por setor, cada uma com
as suas duas colunas — não conseguia salvar. O erro chegava como
`TypeError: Failed to fetch`, junto com a falha do preview no Storage.

**A causa, medida naquele dia:**

| | |
|---|---|
| Linhas empilhadas | 46.921 |
| Colunas na tabela | 39 (as 38 das abas + a coluna `Página`) |
| Campos por linha | 39, dos quais **37 vazios** |
| Pacote do save | **45,4 MB** |
| Dado real ali dentro | 3,5 MB |

Nem o Supabase nem o navegador eram o gargalo — no mesmo dia, o banco aceitou
16 MB em 4 s e o navegador montou 18 MB de JSON em 51 ms. O que não completava
era a **subida** de 45 MB pela internet da gráfica.

**As duas correções:**

1. **Cada linha guarda só as colunas da própria página** (`juntarPaginas`). O
   cabeçalho continua sendo a união de todas — é dele que o editor tira a grade,
   e é ele que todo consumidor prefere antes de olhar as chaves da linha —, mas a
   linha do EXPOSITOR não carrega mais as 37 células vazias das outras 18 abas.
   Chave ausente é lida como vazia em todo lugar que consome estas linhas: o
   `csv_row.get(col, "")` do motor, o `escaparCampo` do editor, a Conferência de
   dados. **45,4 MB → 4,9 MB**, sem perder um dado.
2. **A escolha, ao buscar uma planilha de várias páginas:** *tudo numa numeração
   só* (o caminho de antes) ou **uma numeração por página**. A segunda cria uma
   numeração para cada aba, copiando o formato, o tipo e os elementos da
   numeração aberta, com o banco daquela aba — e com o `csv_url` apontando para
   ela pelo `#gid=`, de modo que o **🔄 atualizar da planilha** continua valendo
   uma a uma depois de separadas. Maior pacote: **1,04 MB**.

**Os elementos são reapontados pela POSIÇÃO da coluna.** Cada aba tem os seus
nomes — `EXPOSITOR ok` numa, `JURADOS ok` noutra —; o que se mantém entre elas é
a ordem. Coluna sem correspondente na página fica como está e é **relatada** ao
operador, em vez de adivinhada (`elementosParaAPagina`). E os elementos são
copiados, não reaproveitados: sem isso, criar 19 numerações reapontaria os da
numeração aberta 19 vezes e a última aba venceria.

O preview não vai junto: ele nasce do canvas ao salvar, e gerar 19 previews ali
custaria mais do que vale — cada numeração ganha o dela na primeira vez que for
aberta e salva.

Testes: `tests/planilha_por_pagina_harness.js` e `tests/test_planilha_por_pagina.py`.

---

### O banco que chega NÃO desenha nada — a coluna entra quando escolhida

Regra do usuário, 23/08/2026: *"Ao carregar arquivos .csv ou indicar a url na
numeração, não deve carregar as colunas na janela de visualização, deve trazer
para janela apenas quando selecionadas"*.

Os três caminhos que trazem um banco — **upload de arquivo**, **busca na web** e
**🔄 atualizar da planilha** — carregam as linhas e as colunas, e **não põem
campo nenhum no ticket**. A coluna vai para a janela quando o operador clica no
botão `📊 Coluna` da barra "Colunas do Banco de Dados (CSV)", que é a única porta
por onde ela entra (`addCsvColumnElement`).

**Por que isso precisou de um substituto.** Entre a v537 e a v698 valia o
contrário: `adicionarColunasComoElementos()` desenhava um campo por coluna assim
que o banco entrava. A razão era boa — o canvas vazio depois do upload fica igual
ao de antes dele, e quem não conhece a tela conclui que a busca falhou. Essa
razão continua de pé, então a criação automática não saiu sozinha: o que responde
a mesma pergunta agora é a **tela dizendo o passo seguinte**, em dois lugares:

- no aviso do upload e da busca (`CONVITE_DAS_COLUNAS`): *"Clique numa coluna
  abaixo para pô-la no ticket."*;
- dentro da barra de colunas (`#num-csv-columns-recado`), que muda conforme o
  estado: *"Nenhuma coluna está no ticket ainda — clique na que você quer
  imprimir"* enquanto não houver campo de banco, e *"Clique numa coluna para pôr
  mais um campo no ticket"* depois do primeiro.

Tirar a criação automática sem esses dois recados traria de volta exatamente o
problema que a v537 resolveu. Há teste travando os dois
(`tests/test_colunas_so_quando_escolhidas.py`).


### O vínculo com a planilha

O endereço fica guardado em `producao_numeracoes.csv_url` (migração
`sql/alter_producao_numeracoes_csv_url.sql`). O que se guarda é **o link que o
operador colou**, normalmente o de compartilhamento — e não o de exportação, que
o `urlCsvDaPlanilha()` deriva na hora de buscar. É deliberado: o link de
compartilhamento é o que um humano reconhece ao reabrir a numeração meses depois.

Com a coluna preenchida a tela ganha o botão **🔄 Atualizar da planilha**. Vazia,
o botão nem aparece — banco vindo de arquivo do computador ou montado à mão não
tem de onde atualizar. Trocar o CSV por um arquivo local, ou removê-lo, **limpa**
a coluna: deixar o link apontando para um banco que já não veio dele seria mentira
na tela.

**Atualizar preserva a identidade das linhas pela posição.** Este é o ponto que
merece atenção. Cada linha carrega um `__id`, e é por ele que
`pedidos_modelos.csv_selecao` sabe quais linhas cada modelo do pedido imprime. A
planilha baixada de novo chega **sem `__id` nenhum** — deixar o editor criar ids
novos faria toda seleção já feita apontar para o vazio. Então a 5ª linha da
planilha herda o `__id` e o `__ativo` da 5ª linha do banco atual, e só as linhas
além do fim do banco antigo recebem ids novos, continuando do maior já usado.

Isso está correto **enquanto a planilha só mudar de conteúdo**. Inserir, apagar ou
reordenar linhas lá desloca tudo abaixo do ponto, e a fatia de um modelo passa a
valer para outra pessoa — impressão com o dado errado, que é exatamente o estrago
que esta tela pode causar. Por isso a confirmação diz isso com todas as letras,
mostra a contagem dos dois lados antes de trocar, e avisa quando uma coluna usada
por algum elemento sumiu da planilha.

A confirmação também avisa que **o que foi editado à mão no CSV é substituído**:
atualizar traz a planilha inteira, não um merge.

Como todo o resto do editor, atualizar **carrega no editor e não grava**: quem
grava é o botão de salvar da numeração.

### O banco também se abre do card do modelo

Chegar ao banco de dados exigia abrir o editor da numeração — uma tela de
catálogo — enquanto o trabalho acontecia no pedido. Por isso o card de cada
modelo, na Lista de Arte, ganhou uma faixa própria logo abaixo do seletor de
numeração:

```
🗂️ Banco de dados: assentos.csv
[ 📊 Ver / editar ]  [ 🧩 Linhas: 5 de 10 ]
```

| Botão | Abre | Grava em |
|-------|------|----------|
| 📊 Ver / editar | O editor comum: célula, coluna, quais linhas imprimem | `producao_numeracoes` (o banco é da numeração) |
| 🧩 Linhas | A distribuição entre os modelos do pedido | `pedidos_modelos.csv_selecao` (a fatia é do modelo) |

São dois trabalhos diferentes e por isso são duas telas — a mesma separação que o
editor já fazia. Consertar o dado é uma coisa; repartir as linhas é outra.

A faixa **só aparece quando a numeração escolhida tem banco de dados**, e quem
decide isso é `atualizarBotoesCsvDaAmostra()`, a cada redesenho — não o template.
A numeração muda pelo seletor sem redesenhar o card inteiro, então uma decisão
tomada na montagem do HTML ficaria velha na primeira troca.

**A contagem fica no próprio botão** ("5 de 10"), e ele fica vermelho quando o
modelo está sem nenhuma linha — modelo sem linha não imprime nada, e descobrir
isso aqui é mais barato do que descobrir na frente da impressora.

> A primeira versão eram dois emojis nus (📊 🧩) espremidos na linha do título
> "Numeração Cadastrada". O usuário respondeu que não ficou claro — e, medindo, o
> quarto botão da fila ficava cortado pela largura do painel. Rótulo em texto não
> é enfeite aqui.

O 🧩 abre a distribuição **já destacando o modelo de onde partiu** (o `foco` do
`abrirEditorCsv`): com seis faixas coloridas na barra, achar a sua é o primeiro
trabalho do operador. E a distribuição passou a valer **com um modelo só** —
recortar uma fatia para o único modelo do pedido é legítimo, e antes não havia
caminho para isso.

### A tela de distribuir diz o que fazer

A tela abria com os botões de modelo **apagados** e nada explicava por quê: quem
não sabia que era preciso marcar as linhas primeiro via controles mortos. Agora
uma faixa fixa no topo carrega o fluxo inteiro:

```
① Clique nas linhas que um modelo vai imprimir  →  ② Clique no nome do modelo
                                                   3 linha(s) selecionada(s)
Aqui só se reparte. Para corrigir o conteúdo das células, feche e use
📊 Ver / editar no card do modelo.
```

O indicador da direita muda de estado: **âmbar** em "Nenhuma linha selecionada
ainda", **verde** com a contagem assim que houver seleção. E o `title` dos botões
de modelo diz por que estão apagados, em vez de só estarem apagados.

A última linha existe porque as duas telas se parecem: a de distribuir **não**
edita célula (é decisão de projeto — ver acima), e sem dizer isso o operador
tenta, não consegue, e conclui que está quebrada.

#### A coluna Modelo é um semáforo

Aberta pelo 🧩 de um modelo — quando existe `ed.foco` —, a coluna troca as cores
de paleta por três estados, lidos do ponto de vista de quem abriu:

| | |
|---|---|
| 🟢 **Disponível** | ninguém pegou; este modelo pode levar |
| 🔴 **Nome do outro** | já é de outro modelo do pedido |
| 🔵 **Nome deste** | é deste modelo (fica na cor dele) |

Sem foco — vindo do aviso da fila, em que se reparte entre todos ao mesmo tempo —
vale a cor de cada modelo, que ali é a informação útil: não há um "outro" para
alertar.

#### Selecionar por intervalo

Repartir 3.000 assentos entre setores é trabalho de intervalo, não de clique:
rolar até a linha 1.500 segurando Shift não é caminho. O botão **Intervalo…**, na
barra *Selecionar*, pede da linha N até a M — pelo número da coluna `#`, que é a
ordem de impressão — com duas opções:

- **Pular as linhas que já são de outro modelo (as vermelhas)**, ligada por
  padrão. A posse é exclusiva: sem ela, atribuir um intervalo que invade a fatia
  do vizinho **rouba** as linhas dele, em silêncio.
- **Somar à seleção atual**, desligada por padrão, para juntar faixas soltas.

Linhas desmarcadas (`__ativo: false`) são ignoradas — não vão ao papel, e
atribuí-las só inflaria a contagem da fatia. O aviso ao final diz quantas
entraram, quantas ficaram de fora por serem de outro modelo e quantas foram
ignoradas por estarem desmarcadas.

### A janela ampliada

Clicar na imagem do modelo abre a visualização em tela cheia: frente e verso
lado a lado, grandes, com o mesmo seletor de linhas do card e os mesmos dois
botões de banco. `←` e `→` viram a página, `Home`/`End` vão aos extremos, `Esc`
fecha, e "🔍 Tamanho real" troca entre caber na tela e o tamanho natural, para
conferir numeração miúda.

Vive em [`frontend/amostra-modal.js`](../frontend/amostra-modal.js) e **não
desenha nada**: ela copia o bitmap dos canvases que o `drawAmostraFace()` já
pintou no card. É de propósito — o card é o renderizador canônico (ver
[editor_de_arte.md](editor_de_arte.md)), e uma segunda implementação divergiria
dele no primeiro ajuste de fusão de camadas: o operador aprovaria numa tela o que
sairia diferente no papel.

Quem vira a página continua sendo o card. A janela chama
`amostraCsvPagina()` — que agora **devolve a promessa** do redesenho — e só
depois copia o bitmap. No sentido inverso, `renderItemAmostraCombinada()` avisa
`window.AmostraModal.atualizar(idx, osId)` ao terminar, para a janela não ficar
velha quando algo redesenha o card por baixo dela.

Até aqui o `onclick` dessas imagens chamava `openClienteLightbox()`, que **só
existe no `cliente.js`** — no aplicativo interno o clique dava
`ReferenceError` e não acontecia nada.

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
