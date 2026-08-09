# Lista de Numerações (Catálogo)

Documento de referência para quem for mexer na view `#view-catalogo` — o item
**📚 Lista de Numerações** do menu lateral.

Escopo: `frontend/index.html` (seção `#view-catalogo`, por volta da linha 619) e
`frontend/script.js` (a função `renderNumeracoes()`, por volta da 2593).
`frontend/producao.html` tem uma cópia antiga desta view e **não** é a página viva —
`app.py:103` redireciona para `/app/index.html`.

## O que a tela é

Uma tabela agrupada por formato base, com as numerações cadastradas. Cada linha
mostra nome, tipo, os tipos de elemento presentes e três ações: duplicar, editar e
excluir. Acima, três filtros — busca por nome, formato e tipo — e o botão **+ Nova
Numeração**.

Não há preview de imagem na lista. A coluna `preview_jpg` da tabela
`producao_numeracoes` existe e é preenchida ao salvar, mas **nada neste
repositório a lê** — nem esta tela. Ver "A coluna `preview_jpg`", abaixo.

## Como os dados chegam

`state.numeracoes` é preenchido por `loadAll()` (`frontend/script.js:863`), que
chama `api('GET', '/numeracoes')`. Quando há `supabaseClient`, `api()` fala direto
com o Supabase e nem passa pelo backend FastAPI (`frontend/script.js:642`).

`renderNumeracoes()` é chamada em três situações: no fim de `loadAll()`
(`:929`) e pelos handlers `oninput`/`onchange` dos três filtros, declarados no
próprio HTML. Ela lê tudo de `state` e do DOM — não busca nada por conta própria.

O `<select>` de formato é repovoado à parte, em `:2350`, a partir de
`state.formatos`. Ele preserva a seleção corrente ao repovoar.

## As quatro armadilhas

Estas são as razões de este documento existir. Cada uma já pode fazer alguém
concluir que "a lista está bugada" quando ela está fazendo exatamente o que foi
programada para fazer.

### 1. A lista esconde boa parte dos registros, e o contador não

Qualquer numeração com `Cli_Num` preenchido — as **exclusivas de cliente**, criadas
a partir de um pedido — é omitida da lista (`frontend/script.js:2620-2622`). Elas só
aparecem se você digitar na busca **exatamente aquele número de cliente**.

Medido no banco em 08/08/2026: **49 registros no total, 16 com `Cli_Num`, 33
visíveis na tela**.

O badge do menu lateral, porém, mostra `state.numeracoes.length`
(`frontend/script.js:949`) — ou seja, **49**. Contador e tabela discordam por
projeto, não por bug. Se for mexer aqui, decida conscientemente qual dos dois
números você quer que o operador veja.

### 2. Digitar só números troca a semântica do filtro inteiro

`isSearchNum` (`:2610`) testa `/^\d+$/` sobre a busca. Se der positivo, o filtro
inverte: passa a mostrar **apenas** as numerações daquele cliente e esconde todas as
outras (`:2614-2616`). Não é "busca por nome que por acaso tem dígitos" — é outro
modo de operação.

Consequência prática: uma numeração chamada `90x140` **nunca** será encontrada
digitando `90140` ou qualquer sequência só de dígitos. É preciso digitar algo com
pelo menos um caractere não numérico.

### 3. Agrupar e filtrar usam campos diferentes

- O agrupamento usa `n.formato_id` — o **formato base** (`:2663`).
- O filtro de formato usa `n.formato_ids`, a lista de **formatos compatíveis**, com
  fallback para `[n.formato_id]` (`:2626-2627`).

Portanto, filtrar pelo formato X pode legitimamente devolver uma numeração exibida
sob o cabeçalho do formato Y — porque X está entre os compatíveis dela, mas o base
é Y. Não é inconsistência acidental; é o que o código pede.

### 4. O estado vazio mente quando há filtro ativo

Se nenhum registro passa nos filtros, a tela mostra o `#empty-catalogo`, cujo texto
é *"Nenhuma numeração cadastrada ainda no catálogo."* (`frontend/index.html`, dentro
de `#view-catalogo`). Com 49 registros no banco e um filtro que não casa com nada, o
operador lê que não há nada cadastrado. `renderNumeracoes()` não distingue "vazio" de
"filtrado a zero" (`:2643-2651`).

## As três ações da linha

### Editar — `editNumeracao(id)`

Leva para a view do editor (`#view-numeracao`) e carrega tudo: elementos, CSV, SVG,
PDF, formatos compatíveis, e a arte de fundo da cor do formato base. Está em
`frontend/script.js:2774`. Ver também `docs/superpowers/specs/2026-08-08-arte-de-fundo-automatica-por-cor-design.md`
para o comportamento da arte de fundo.

### Excluir — `deleteNumeracao(id)`

`frontend/script.js:3033`. Pede confirmação com `confirm()` e apaga.

Dois detalhes: ela **não passa por `api()`** quando há `supabaseClient` — fala direto
com `supabaseClient.from('producao_numeracoes').delete()` (`:3040`) —, e **não remove
o `.jpg` do preview** do bucket de Storage. Cada exclusão deixa um objeto órfão em
`artes/previews-numeracoes/`. É lixo lento e inofensivo (os ids são UUID e nunca são
reusados), mas é bom saber antes de estranhar arquivos sem dono.

### Duplicar — `duplicateCatalogNumeracao(id)`

`frontend/script.js:3058`. **Esta é a ação mais perigosa de mexer, porque ela já
perde campos hoje.** O objeto `clone` copia explicitamente uma lista de campos, e o
que não está nessa lista simplesmente não é copiado:

| Campo | Copiado? | Consequência |
|---|---|---|
| `print_mode` | **não** | Duplicar uma numeração **FxVerso** produz uma cópia **Frente**. Piora porque o `METADATA` que também carregava esse dado é removido dos `elements` na leitura (ver abaixo), então não há de onde recuperar. |
| `ticket_qtd` | **não** | Cai para o default de `db.py:593`, que é `1`. |
| `ticket_logica` | **não** | Cai para o default de `db.py:594`, que é `PILHA` — e o default do editor é `HORIZONTAL`. A cópia sai diferente do original **e** diferente de uma numeração nova. |
| `Cli_Num` | não | Proposital: a cópia nasce genérica, não presa ao cliente. |
| `preview_jpg` | não | Proposital e correto — copiar a URL faria dois registros apontarem para o mesmo arquivo, e salvar um mudaria o preview do outro. A cópia nasce sem preview até ser salva. |

Se for corrigir a duplicação, corrija os três primeiros juntos; e lembre que
`print_mode` precisa vir da coluna, não dos `elements`.

## `elements` nunca contém `METADATA` na leitura

`api()` remove o elemento de tipo `METADATA` de toda numeração assim que ela chega
do Supabase, tanto no GET individual (`frontend/script.js:683`) quanto no GET de
lista (`:713-720`), e antes disso aproveita o `print_mode` dele caso a coluna esteja
vazia. `saveNumeracao()` reinsere um `METADATA` novo ao gravar
(`frontend/script.js:6115`).

Duas consequências para esta tela: a contagem "(N itens)" da coluna Elementos
**não** inclui o METADATA, e qualquer código novo que leia `n.elements` esperando
achá-lo vai falhar.

## A coluna `preview_jpg`

Desde a v487 ela guarda uma **URL pública** para
`artes/previews-numeracoes/<id da numeração>.jpg`, não mais um data URL base64. O
arquivo é nomeado pelo id do registro e gravado com upsert, então há no máximo um
preview por numeração.

Nada lê essa coluna hoje — nem esta tela, nem nenhuma outra. Ela é escrita e
esquecida. Se um dia esta lista for ganhar miniaturas, é daqui que elas devem sair,
e o custo é zero: a URL já está em `state.numeracoes` e o arquivo já existe.

Cuidado ao consumir: o valor pode voltar a ser base64 se o upload ao Storage falhar
ou se o navegador ficar sem `supabaseClient`. Qualquer leitor precisa aceitar as
duas formas, ou testar `startsWith('http')`. Detalhes em
`docs/superpowers/specs/2026-08-08-preview-jpg-no-storage-design.md`.

## Ordenação

`filtradas.sort(...)` ordena **tudo** por nome, com `localeCompare` em `pt-BR`
(`:2640`), e só depois agrupa. Como o agrupamento monta um objeto simples
(`:2659-2669`), a ordem dos **grupos** na tela é a ordem em que cada `formato_id`
apareceu pela primeira vez na lista já ordenada por nome — não é a ordem alfabética
dos formatos nem a ordem da tabela `producao_formatos`. Trocar a ordenação das
numerações reordena os grupos junto, o que costuma ser surpresa.

## `is_custom` não é o mesmo que `Cli_Num`

São dois campos distintos, e a diferença importa porque só um deles esconde o
registro da lista. Medido em 08/08/2026: **24 registros com `is_custom = true`, mas
só 16 com `Cli_Num`**. Os 8 restantes são `is_custom` sem cliente associado — legado
de antes de o `Cli_Num` existir — e **aparecem normalmente na lista**. Há um
"fallback legado" para eles em outros pontos do código
(`frontend/script.js:18197` e `:19200`), que casa pelo `os_item_id` em vez do
cliente.

## Verificando uma mudança nesta tela

Não há framework de testes de frontend no projeto. Use a skill `rodar-app` para
subir o app na porta 9123 e dirigir o navegador com Puppeteer. Como a tela é
puramente derivada de `state`, dá para exercitá-la sem login semeando
`state.numeracoes` e `state.formatos` e chamando `renderNumeracoes()` direto.

Dentro de `page.evaluate`, use os nomes nus `state` e `supabaseClient`: `const state`
e `let supabaseClient` estão no topo de scripts clássicos e **não** viram
propriedade de `window`. O `window.state` que existe na página vem de
`frontend/mapas.js:6` e é outro objeto.

Cenários que valem cobrir, porque são justamente as armadilhas:

1. Um registro com `Cli_Num` não aparece com a busca vazia, e aparece ao digitar
   aquele número.
2. Busca só com dígitos esconde as numerações genéricas.
3. Filtro por um formato que está em `formato_ids` mas não é o `formato_id` exibe a
   numeração sob o cabeçalho do formato base.
4. Filtro que não casa com nada mostra o estado vazio.
5. Duplicar preserva (ou não) `print_mode`, `ticket_qtd` e `ticket_logica` —
   conforme você tenha ou não corrigido isso.
