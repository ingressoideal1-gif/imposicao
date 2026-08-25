# Lista de Numerações (Catálogo)

Documento de referência para quem for mexer na view `#view-catalogo` — o item
**📚 Lista de Numerações** do menu lateral.

Escopo: `frontend/index.html` (seção `#view-catalogo`, por volta da linha 619) e
`frontend/script.js` (a função `renderNumeracoes()`, por volta da 2593).
`frontend/producao.html` tem uma cópia antiga desta view e **não** é a página viva —
`app.py:103` redireciona para `/app/index.html`.

## O que a tela é

Uma tabela agrupada por formato base, com as numerações cadastradas. Cada linha
mostra nome, **miniatura**, tipo, os tipos de elemento presentes e três ações:
duplicar, editar e excluir. Acima, três filtros — busca por nome, formato e tipo — e
o botão **+ Nova Numeração**.

A miniatura sai da coluna `preview_jpg`, e clicar nela abre a imagem em tamanho
grande. Ver "A coluna `preview_jpg`" e "A coluna Preview", abaixo.

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

### A saída do editor: `← Voltar sem salvar`

Pedida pelo usuário em 25/08/2026. Ela só aparece para quem chegou ao editor **de
dentro de um pedido** — pelo ✏️ no card de um modelo (`editCustomNumeracao`) ou
pelo clone da imposição. No catálogo a saída é o próprio menu lateral.

Ela é mais do que conveniência, e o motivo é o `window.customNumeracaoEditState`.
Esse objeto diz *"a numeração que for salva agora pertence ao modelo X do pedido
Y"*, e é ele que faz o save gravar `is_custom`, `os_item_id` e `Cli_Num` e depois
amarrar a numeração ao modelo.

Até então o único caminho de volta era o menu lateral, que sai da tela e **deixa
esse vínculo pendurado**. Com ele vivo, a próxima numeração salva — qualquer uma,
inclusive uma do catálogo geral aberta pelo menu — nascia marcada como exclusiva
daquele modelo e era amarrada a ele. Nada na tela denunciava.

Por isso `cancelNumEdit()` passou a zerar o vínculo junto com o formulário, e o
Voltar apenas o usa em vez de repetir a limpeza.

> [!CAUTION]
> **A ordem no `saveNumeracao` não pode inverter.** Ele também chama
> `cancelNumEdit()`, e o código que amarra a numeração ao modelo roda **depois**.
> Se lesse `window.customNumeracaoEditState` nesse ponto encontraria `null`, e o
> modelo ficaria sem a numeração nova, calado. Por isso o save guarda o estado
> numa variável (`customState`) **antes** de limpar.

Dois detalhes de projeto:

- **Não pergunta "tem certeza?".** O rótulo já diz "sem salvar", e pedir
  confirmação para uma saída que a pessoa acabou de escolher é atrito em cima de
  uma decisão consciente. O que se perde é o posicionamento não salvo; o que
  estava no banco continua lá.
- **É aceso DEPOIS do `editNumeracao()`**, nos dois caminhos de entrada, porque
  ele passa pelo `cancelNumEdit()` — que esconde o botão junto com o resto.

### Excluir — `deleteNumeracao(id)`

`frontend/script.js:3033`. Pede confirmação com `confirm()` e apaga.

Dois detalhes: ela **não passa por `api()`** quando há `supabaseClient` — fala direto
com `supabaseClient.from('producao_numeracoes').delete()` (`:3040`) —, e **não remove
o `.jpg` do preview** do bucket de Storage. Cada exclusão deixa um objeto órfão em
`artes/previews-numeracoes/`. É lixo lento e inofensivo (os ids são UUID e nunca são
reusados), mas é bom saber antes de estranhar arquivos sem dono.

### Duplicar — `duplicateCatalogNumeracao(id)`

`frontend/script.js:3058`. **É a ação mais delicada de mexer**, porque o objeto
`clone` copia uma lista **explícita** de campos: o que alguém esquecer de acrescentar
ali simplesmente não é copiado, em silêncio, e só aparece quando um operador abre a
cópia e nota que ela está diferente do original.

Foi o que aconteceu até a v487. `print_mode`, `ticket_qtd` e `ticket_logica` não
estavam na lista, então duplicar uma numeração **FxVerso** produzia uma cópia
**Frente**, e duplicar uma **TICKET** produzia uma cópia com quantidade `1` e lógica
`PILHA` — os defaults de `db.py:593-594` — em vez dos valores do original. Corrigido:
os três agora são copiados, com fallbacks que repetem exatamente como
`editNumeracao()` interpreta um campo ausente (`'front'`, `1`, `'HORIZONTAL'`), para
que a cópia abra no editor idêntica ao original.

Dois campos continuam **deliberadamente** fora da lista:

| Campo | Por quê |
|---|---|
| `Cli_Num` | A cópia nasce genérica, não presa ao cliente do original. |
| `preview_jpg` | Copiar a URL faria dois registros apontarem para o mesmo arquivo no Storage, e salvar um mudaria o preview do outro. A cópia nasce sem preview até ser salva pela primeira vez. |

Ao acrescentar campo novo a `producao_numeracoes`, lembre de decidir conscientemente
se ele entra aqui — e note que `print_mode` precisa vir da **coluna**, nunca dos
`elements`: o `METADATA` que também o carregava é removido na leitura (ver abaixo).

Isso vale para campos da **numeração**. Campos novos de **elemento** — como
`pdf_filename`, `svg_filename` e `natural_w_mm`, que a v490 acrescentou — vêm de
graça, porque o `clone` copia o array `elements` inteiro com um `map`. Só cuidado com
uma consequência: a cópia aponta para os **mesmos arquivos** no Storage que o
original. Hoje isso é inofensivo, porque o save só reenvia o arquivo de um elemento
quando o conteúdo ainda não é URL — trocar o arquivo na cópia gera um objeto novo e
não toca no do original.

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

Desde 24/08/2026 quem a lê é a **coluna Preview** desta lista (abaixo). O custo é
zero: o GET da lista é `select('*')`, então a URL já vinha em `state.numeracoes` sem
que ninguém a usasse, e o arquivo já existia no bucket.

Cuidado ao consumir: o valor pode voltar a ser base64 se o upload ao Storage falhar
ou se o navegador ficar sem `supabaseClient`. Qualquer leitor precisa aceitar as
duas formas, ou testar `startsWith('http')`. Detalhes em
`docs/superpowers/specs/2026-08-08-preview-jpg-no-storage-design.md`.

Medido no banco em 24/08/2026: **83 registros, 81 com preview — todos como URL,
nenhum em base64**.

## A coluna Preview

Fica entre **Nome** e **Tipo**, e a imagem é o `preview_jpg` cru num `<img>` — as
duas formas do valor (URL pública e data URL base64) servem direto, e é por isso que
ali não há nenhum teste de `startsWith('http')`.

Três decisões que valem conhecer antes de mexer:

- **A caixa tem a forma do papel, não uma forma fixa.** A escala é
  `min(200 / width_mm, 60 / height_mm)`, e largura e altura saem dela. A primeira
  versão travava a altura em 54 px e só calculava a largura: num bracelete de
  245×20 mm a arte virava uma tira fina no meio de uma chapa branca alta. Como o
  agrupamento é por formato base, todas as linhas de um grupo saem com a mesma forma.

- **As miniaturas são `loading="lazy"`.** São 26 linhas visíveis hoje e 83 registros
  no banco; sem isso, abrir a lista dispararia dezenas de downloads de uma vez.
  Consequência ao testar: uma miniatura fora da tela tem `naturalWidth === 0` e
  parece quebrada. Role até ela antes de concluir qualquer coisa.

- **Miniatura que não carrega vira uma marca 🖼️, não o ícone de imagem partida.**
  É o `onerror` chamando `previewDaNumeracaoFalhou()`. O caso real existe:
  `deleteNumeracao()` não apaga o `.jpg` do bucket, então uma faxina em
  `artes/previews-numeracoes/` pode tirar o preview de baixo de um registro vivo.
  O registro sem `preview_jpg` nenhum (2 dos 83) mostra a mesma marca.

O clique abre `abrirLightboxImagem(src, legenda)`, que vive no `script.js` porque
`openClienteLightbox` mora no `cliente.js` e o `index.html` não o carrega — a
miniatura da prévia do **Painel de Produção** chamava justamente esse fantasma desde
sempre, e o clique dela não fazia nada até 24/08/2026. A imagem abre numa caixa de
`92vw × 78vh` com `object-fit: contain`: preenche a tela em vez de abrir no tamanho
natural, que num monitor grande parecia que o clique não tinha funcionado.

`ampliarPreviewNumeracao(id)` recebe o **id**, não a URL, porque um preview em
base64 tem dezenas de KB e repetir isso dentro do `onclick` de cada linha incharia o
HTML da lista.

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

## Travar, frente/trás e o espaço do texto (v546)

Três controles nos cartões de elemento do editor de numeração, todos gravados no
próprio elemento (`elements` da numeração), sem migração — a ausência do campo é
o comportamento antigo:

- **🔓/🔒 Travar** (`locked`): elemento travado **não é arrastado** no canvas,
  **não é movido** pelas ferramentas de alinhamento e **não é excluído** — nem
  pelo ✕ do cartão, nem pelo ✕ da lista de arquivos, nem pela tecla Delete (os
  três passam por `deleteSelectedElements`, que é onde mora a guarda). Continua
  selecionável, editável pelos campos do cartão, duplicável e reordenável: nada
  disso destrói o que já estava posicionado. O sublinhado de seleção fica âmbar,
  o ✕ fica apagado com o motivo no `title`, e um toast responde a tentativa. O
  motor ignora o campo.

  Duas assimetrias deliberadas, e o critério é **o que se perde**:

  - **Excluir para a operação inteira; alinhar apenas pula os travados.** Apagar
    parte de uma seleção em silêncio é pior do que não apagar nada, enquanto
    alinhar o resto não destrói nada. Grupo com um membro travado também não é
    excluído, pela mesma razão do arrasto.
  - **A cópia nasce destravada.** Duplicar é para reposicionar; herdando a
    trava, a cópia nasceria imóvel e — depois que a trava passou a impedir a
    exclusão — sem como sair da tela. O original continua protegido.

  > A primeira versão travava só o arrasto, e eu havia registrado aqui que
  > excluir seguia liberado por ser "ação deliberada". O usuário corrigiu:
  > *"Elementos de numeração 'Travados' também não podem ser excluidos"*.
  > Arrastar por engano e excluir por engano são o mesmo acidente para quem
  > opera — perder trabalho já posicionado.

- **⬆/⬇ Frente/trás**: os botões trocam o elemento com o vizinho no array
  `state.numElements` — e **a ordem do array É a ordem de desenho** em todas as
  janelas, no hit-test (invertido) e no `engine.py`. Não existe `z_index`; não
  crie um. A lista de cartões não muda de ordem porque ela ordena por
  `last_interaction`.

- **📏 Espaço do texto** (`max_width_mm`, `overflow`, `text_align`): só na UI de
  elementos `TEXT` com origem Banco de Dados, mas o mecanismo vale para qualquer
  elemento da família texto que tenha os campos. `text_align`
  (`center`/`left`/`right`) só age quando há largura. Com o elemento selecionado,
  o editor desenha a guia tracejada do espaço. Trocar a origem para Sequencial
  apaga os três campos. `overflow` tem três valores:

  | Valor | O que faz |
  |---|---|
  | `"shrink"` (padrão) | reduz o corpo na razão exata até caber |
  | `"condense"` | espreme as letras na horizontal e **mantém a altura** — as linhas do ticket seguem alinhadas de um ingresso ao outro. No piso de `PISO_CONDENSA` (75%) a compressão para e o resto vira redução de corpo, senão o dado sairia ilegível |
  | `"wrap"` | quebra por palavra, com quebra por caractere para palavra maior que o espaço |

  A compressão viaja junto com a rotação num `morph` só, no pivô `(cx, cy)`:
  `Matrix(escala_x, 1) * Matrix(-angle)` — comprime primeiro, gira depois. Como
  a escala acontece em torno do pivô, o ponto de inserção de cada linha é
  pré-corrigido (`cx + (borda_esq − cx) / escala_x`) para ela cair no lugar
  certo **depois** de comprimida. No canvas o equivalente é `ctx.scale(esc, 1)`
  com o `x` dividido pela escala — o `ctx` já está na âncora, que é o mesmo
  pivô. Inverter a ordem das matrizes comprime o eixo errado quando há rotação;
  há teste para isso.

- **O conferidor de estouro**, dentro da própria box 📏: varre o banco inteiro
  pelo mesmo ajuste do desenho e responde as três perguntas que custam caro na
  produção — quantas linhas têm a **coluna vazia** (ticket em branco), quantas
  ficam **abaixo de `CORPO_MINIMO_PT` (6 pt)** e quantas produzem um bloco que
  **passa da altura do ticket**. Linha desmarcada (`__ativo: false`) é ignorada,
  porque não vai ao papel. Quando não há nada a apontar, a linha fica verde e
  diz o corpo da linha mais apertada.

  O botão **🔍 Ver essas linhas** abre o editor de CSV já filtrado nelas
  (`abrirEditorCsv({ destacar: { indices, motivo } })`). As posições viram
  `__id` na abertura, depois do `garantirIds` — id sobrevive a ordenar, filtrar
  e desfazer; posição não. As linhas ficam com a marca âmbar mesmo com o filtro
  desligado, e `soDestacadas` entra em `ordenacaoOuFiltroAtivo()` para travar o
  arrasto, pela mesma razão dos outros filtros.

  O resultado é cacheado por elemento em `_cacheEstouro`, porque
  `renderElementsList()` roda a cada tecla e varrer 3.000 linhas a cada uma
  seria desperdício. A chave inclui **a própria lista de linhas**: trocar o CSV
  sempre cria um array novo, então a invalidação acontece sozinha, sem depender
  de alguém lembrar de limpar o cache em cada caminho.

  O algoritmo vive em **dois espelhos que precisam mudar juntos**:
  `frontend/texto-ajuste.js` (`window.ajustarTextoNaLargura` +
  `window.desenharTextoAjustado`, carregado por `index.html` e `cliente.html`) e
  `_ajustar_texto_na_largura` no `engine.py` (aplicado em `_render_element`, por
  onde todos os caminhos de texto do motor passam). Todos os dez renderizadores
  de texto do frontend desenham via `desenharTextoAjustado` — ao criar um
  renderizador novo, use-o também. Folga de 0,5% na comparação para a mesma
  palavra não quebrar diferente entre a régua do canvas e a do fitz.

  Testes: `tests/test_engine_ajuste_texto.py` (a função, nos três modos) e
  `tests/test_engine_largura_maxima.py` (o texto desenhado no PDF respeita a
  largura; no `condense` dentro do piso a **altura medida no PDF é igual à do
  texto livre**, e além do piso ela cai). As larguras dos testes de `condense`
  saem de `fitz.get_text_length` do próprio dado, não de número mágico — 40 mm
  parecia "dentro do piso" e estava além dele. Mexeu no `engine.py` ⇒ o agente
  publica junto com o site.

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
5. Duplicar uma numeração FxVerso e TICKET preserva `print_mode`, `ticket_qtd` e
   `ticket_logica`. Dá para verificar sem gravar em produção: intercepte
   `supabaseClient.from('producao_numeracoes').insert` e inspecione o payload.
