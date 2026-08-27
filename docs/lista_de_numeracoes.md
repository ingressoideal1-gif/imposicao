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
a partir de um pedido — é omitida da lista. Elas aparecem se você digitar na busca
**exatamente aquele número de cliente**, ou se marcar a caixa **Mostrar exclusivas de
cliente** (26/08/2026), ao lado dos filtros. Desmarcada, a lista é a de sempre.

A caixa existe porque, sem ver o registro, não há como renomeá-lo — e renomear é
justamente o que decide a quem a numeração pertence (ver "A regra do nome", abaixo).

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

Pede confirmação com `confirm()` e apaga. Desde **27/08/2026** a confirmação
diz antes **em que pedidos a numeração está em uso** — número, data, quantos
modelos e o cliente:

```
A numeração "020 - Lisa" está em uso por 23 modelo(s), em 5 pedidos:

  • Pedido 21229 — 26/08/2026 — 1 modelo — LISITON DOCUMENTOS SEGUROS LTDA
  • Pedido 21074 — 21/08/2026 — 13 modelos — LISITON DOCUMENTOS SEGUROS LTDA
  ...

Excluir deixa esses modelos apontando para uma numeração que não existe mais:
eles perdem número, QR e código de barras.
```

Antes a pergunta era só "Excluir esta numeração?". O registro saía do
`producao_numeracoes` e os modelos que apontavam para ele ficavam com um
`amostra_num_id` que não resolve mais — sem número, sem QR, sem código de
barras, e sem aviso. Continua sendo decisão do operador (a numeração de um
pedido antigo e entregue pode muito bem ser lixo a limpar); o que não pode é
ele não saber.

Quem responde é **`pedidosQueUsamNumeracao(numId)`**, que agrupa o resultado de
`modelosQueUsamNumeracao` por pedido — um pedido com nove modelos vira uma
linha, não nove, porque é pelo número do pedido que o usuário reconhece o
trabalho. A **data sai de `propostas.created_at`**: conferido contra a produção
em 27/08/2026, `propostas` responde por todos os pedidos, enquanto
`propostas_os` (onde moram o `data_pedido` e o prazo de entrega) tinha 40
linhas e deixaria a maioria sem data. Uma fonte só também evita uma lista com
datas de origens diferentes, que não se comparam.

#### `modelosQueUsamNumeracao` nunca tinha falado com o banco

Achado no mesmo dia, medido no navegador contra a produção. A consulta pedia
`nome_produto`, `modelo_descri` e `amostra_status` — e **nenhuma das três
existe** em `pedidos_modelos`. O PostgREST recusa a consulta inteira quando uma
coluna não existe (`column pedidos_modelos.nome_produto does not exist`), então
a função caía calada no `emMemoria()` desde sempre: o aviso de "esta numeração
é compartilhada por N modelos", no save, só enxergava os pedidos já carregados
na tela. Corrigido para `id, id_int, nome_modelo, status_arte`. Ao acrescentar
coluna ali, confira no banco antes — o harness lista as colunas conhecidas e
recusa nome fora dela.

Dois detalhes continuam valendo: ela **não passa por `api()`** quando há `supabaseClient` — fala direto
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

## A regra do nome: exclusiva do modelo × compartilhada do cliente

Regra do usuário, 26/08/2026:

> *"se ela tiver o nome apenas com o numero do modelo ela é exclusiva daquele modelo,
> mas se ela for renomeada continua sendo exclusiva do cliente mas compartilhada
> entre modelos"*

Uma numeração criada de dentro de um modelo nasce com `name` = o id daquele modelo e
`os_item_id` = esse mesmo modelo. Daí:

| Situação | Significado |
|---|---|
| `name === String(os_item_id)` | exclusiva **daquele modelo** |
| `name` trocado por um nome próprio | exclusiva **do cliente**, compartilhada entre os modelos dele |

Quem responde é `numeracaoEhCompartilhadaDoCliente(n)`. A comparação é com o
`os_item_id`, e **não** com um teste de "o nome é só dígitos": uma numeração batizada
de `2026` é um nome próprio, e o teste de dígitos a devolveria calada ao modelo de
origem. Registro sem `os_item_id` (legado anterior ao campo) conta como compartilhado
— não há modelo a que pertencer.

A metade "compartilhar" já funcionava antes desta regra: o select de numeração de
cada modelo sempre listou toda numeração `is_custom` com o `Cli_Num` do cliente da OS
(`frontend/script.js`, em `renderAmostrasOSItens` e `onItemCorSelect`). O que faltava
era o save.

### O nome também decide o que o Salvar faz

Regra do usuário, no mesmo dia:

> *"ao salvar com mesmo nome deve repassar, ao mudar o nome deve duplicar, sem
> alterar modelos com a outra numeração"*

No editor, numa numeração **de cliente**:

| No campo Nome | O que o 💾 Salvar faz |
|---|---|
| o mesmo nome | atualiza o registro — vale para todos os modelos que o usam |
| um nome diferente | grava uma **cópia nova**; o original e os modelos dele ficam como estavam |

É o "salvar como" de sempre, e é ele que atende o pedido de **duplicar uma
numeração exclusiva para editar e seguir na cópia**. O modelo de onde se está
editando passa a apontar para a cópia (o `saveAmostraToDB` do fim do
`saveNumeracao`); os outros modelos continuam no original.

Três recortes deliberados:

- **Só na numeração de cliente.** Na genérica do catálogo, corrigir um erro de
  digitação no nome continua sendo corrigir o nome — duplicar ali encheria o
  catálogo de gêmeas sem ninguém pedir.
- **Duplicando, o aviso de "esta numeração é usada por N modelos" não aparece.**
  Ele existe para quando o save vai mexer em quem já usa; a cópia não mexe em
  ninguém, e perguntar seria atrito em cima do caminho seguro.
- **A cópia leva a arte de fundo no arquivo dela** (`duplicarFundoNoStorage`
  reenvia os bytes sob o id novo). Apontar para o objeto do original faria as
  duas compartilharem um arquivo só — o defeito que o `preview_jpg` ensinou.

Quem quer **apenas renomear**, sem criar cópia, usa o 🏷️ da Lista de Numerações.
Os dois gestos convivem porque resolvem coisas diferentes, e a dica embaixo do
campo Nome (`#num-name-dica-modelo`) diz isso na tela.

### Editar não bifurca mais

Os dois caminhos de entrada — `editCustomNumeracao` (o ✏️ no card do modelo) e
`editImposicaoCustomNumeracao` (o clone da imposição) — apagavam o `num-id` para
**forçar INSERT**, e o `saveNumeracao` reencontrava a versão anterior **pelo nome**.
Enquanto o nome fosse o id do modelo isso funcionava por acidente; bastava renomear
para o nome não casar mais, nascer um registro novo e o antigo virar órfão invisível.
Era mais uma porta para a numeração fantasma de 25/08.

Agora a decisão está em `comoEditarNumeracaoDoModelo(baseNum, itemId, cliNum)`:

| Base aberta | Resultado |
|---|---|
| a exclusiva **deste** modelo (`os_item_id` bate) | edita no lugar (UPDATE) |
| uma **compartilhada deste cliente** | edita no lugar (UPDATE) — é o que faz o save valer para todos |
| a exclusiva de **outro** modelo | clona (INSERT, nome = id deste modelo) |
| uma numeração genérica do catálogo | clona (INSERT, nome = id deste modelo) |

"Edita no lugar" é o que acontece **abrindo**. Na hora de salvar, o nome ainda
pode transformar aquilo numa cópia — ver a seção acima.

> [!CAUTION]
> **`os_item_id` é a origem, não o último lugar por onde alguém passou.** O
> `saveNumeracao` o reescrevia com o modelo de onde se estava editando, e zerava o
> `is_custom` de uma exclusiva aberta pelo catálogo. Os dois quebram a regra acima,
> que compara `name` com `os_item_id`. Hoje os três campos de vínculo
> (`is_custom`, `os_item_id`, `Cli_Num`) vêm do **registro** quando ele já existe, e
> só o INSERT os recebe do editor.

### Salvar uma compartilhada avisa quem mais será afetado

Antes de gravar, `modelosQueUsamNumeracao(id)` consulta `pedidos_modelos` por
`amostra_num_id` e o operador vê em quantos modelos aquilo vai bater. Dois desfechos:

- **Nenhum aprovado**: confirma, listando os modelos. Cancelar não grava nada.
- **Algum aprovado**: gravar por cima está fora (modelo aprovado não se altera), e a
  saída está escrita no próprio aviso — gravar uma **cópia exclusiva deste modelo**,
  deixando a compartilhada intacta. É por isso que `id` e `name` no `saveNumeracao`
  são `let`.

O modelo atual é excluído da conta pelos **dois** ids que ele tem: `item.id` (que
vira `os_item_id`) e `_pedidoModeloId` (a linha de `pedidos_modelos`, onde mora o
`amostra_num_id`).

### Renomear — `renomearNumeracao(id)`

O 🏷️ da linha, ao lado do duplicar. É o gesto de **renomear de verdade**, e existe
justamente porque no editor trocar o nome significa outra coisa (duplicar).
Renomeia **sem criar outra numeração**: o nome
não vai ao papel, é rótulo, então não pede as travas de modelo aprovado. O que ele
muda é a quem a numeração pertence — e o efeito está escrito dentro do próprio
`prompt`, não só aqui.

A gravação fala **direto com o Supabase**, como o `deleteNumeracao`, e manda só o
campo `name`. O PUT do `db.py` (`update_numeracao`) reconstrói a linha a partir de
uma lista fixa de campos: mandar a ele um payload só com o nome apagaria o resto.

O editor de numeração também mostra a dica (`#num-name-dica-modelo`) quando foi
aberto de dentro de um modelo — acesa e apagada junto com o `← Voltar sem salvar`,
pelo mesmo motivo: as duas só valem para quem chegou ali por um pedido.

## A arte de fundo fica guardada — só na numeração de cliente

Pedido do usuário em 26/08/2026: *"quando a numeração for exclusiva do cliente e
for carregado uma arte de fundo, ao salvar a numeração deve salvar a arte de fundo
(referência), deve ser persistente"*.

A **Arte de Fundo** é a referência por baixo do canvas do editor: é contra ela que o
operador posiciona a numeração. Ela **não é impressa** — no papel, quem desenha o
fundo é a camada da cor. Por isso ele a chama de referência.

Havia dois jeitos de ela aparecer, e nenhum sobrevivia ao save:

| Origem | O que acontece hoje |
|---|---|
| `autoLoadCorBg()` — o PDF da cor mais antiga do formato base | continua igual: a arte é da **cor**, já vive em `producao_cores`, e não se copia para dentro da numeração |
| upload manual pelo 🖼️ **Arte de Fundo** | vivia só em memória; reabrir a numeração trazia de volta a arte da cor |

Agora o upload manual fica guardado nas colunas `bg_url` e `bg_filename`
(`sql/alter_producao_numeracoes_arte_de_fundo.sql`), e `editNumeracao` o traz de
volta — a arte da numeração **vence** a arte da cor, senão guardá-la não teria efeito.
Sem `bg_url`, nada muda: cai no `autoLoadCorBg` de sempre.

### Só a numeração de cliente

`numeracaoDoEditorGuardaFundo()` responde. A genérica do catálogo continua tirando o
fundo da cor do formato base — um desenho compartilhado, que já tem dono. Duplicar
aquilo por numeração seria manter duas verdades sobre a mesma coisa.

A barra da Arte de Fundo diz na tela em qual dos dois casos se está
(`#bg-persistencia-aviso`), porque nada mais denunciaria a diferença: no catálogo o
arquivo é descartado ao sair; na do cliente, fica.

### Três coisas que não podem inverter

- **O que sobe é o arquivo ORIGINAL** (`state.bgFile`), nunca o `state.bgImage`. A
  imagem do canvas é uma rasterização feita para a tela; gravá-la transformaria em
  imagem o PDF vetorial do cliente, que é justamente o que está fora de cogitação
  neste projeto. Há teste estático para isso.

- **As colunas só entram no payload quando existem.** `bancoGuardaArteDeFundo()` olha
  se a chave `bg_url` está numa linha de `state.numeracoes` — que vem de `select('*')`,
  então a chave existe sempre que a coluna existir. Mandar coluna inexistente faz o
  PostgREST **recusar o registro inteiro**, e nenhuma numeração seria salva. Enquanto
  o ALTER não roda, a barra avisa qual arquivo SQL rodar em vez de fingir que guardou.

- **`clearBgImage()` zera os três campos** (`bgFile`, `bgUrl`, `bgFilename`). Sem isso,
  o ✕ tiraria a arte da tela e a numeração continuaria carregando o mesmo arquivo na
  próxima abertura — a tela dizendo uma coisa e o banco outra.

O arquivo vai para `artes/fundos-numeracoes/<id da numeração>.<ext>`, com upsert:
há no máximo um fundo por numeração. Trocar um PDF por um PNG deixa o anterior órfão
no bucket, do mesmo tipo de lixo que `deleteNumeracao()` já deixa em
`previews-numeracoes/`.

`duplicateCatalogNumeracao()` leva o `bg_url` — mas **reenviando os bytes** sob o
id da cópia, nunca copiando a URL: dois registros apontando para o mesmo objeto do
Storage é o defeito que o `preview_jpg` ensinou a evitar.

## `is_custom` não é o mesmo que `Cli_Num`

São dois campos distintos, e a diferença importa porque só um deles esconde o
registro da lista. Medido em 08/08/2026: **24 registros com `is_custom = true`, mas
só 16 com `Cli_Num`**. Os 8 restantes são `is_custom` sem cliente associado — legado
de antes de o `Cli_Num` existir — e **aparecem normalmente na lista**. Há um
"fallback legado" para eles em outros pontos do código
(`frontend/script.js:18197` e `:19200`), que casa pelo `os_item_id` em vez do
cliente.

## No pedido, a exclusiva do cliente sai amarela (27/08/2026)

Isto não é da lista de numerações, mas é a mesma distinção vista do outro lado.
Na **lista de arte**, ao editar um pedido, o seletor **Numeração** de cada modelo
mistura duas famílias: o catálogo geral e as numerações com `Cli_Num` daquele
cliente. O filtro de `renderAmostrasOSItens` já deixa as duas passarem — e a de
outro cliente, não —, mas nada as distinguia a não ser o nome. Numa lista de
dezenas de itens, escolher a certa era escolher no escuro.

Desde 27/08/2026 a exclusiva do cliente aparece em **amarelo** (`var(--amber)`,
o mesmo do resto do painel); as demais continuam brancas. Três funções, no
`script.js`, ao lado de `numeracaoEhCompartilhadaDoCliente`:

- **`numeracaoEhDoCliente(n, idCliente)`** — a pergunta é mais larga que a de
  `numeracaoEhCompartilhadaDoCliente`: interessa se a numeração **pertence** ao
  cliente, e não se ela já foi batizada. As duas famílias da seção "A regra do
  nome" ficam amarelas. Compara com `String(...).trim()` porque o `Cli_Num` chega
  número do banco e o `id_cliente` da ordem chega ora número, ora texto.
- **`opcaoDeNumeracaoDoModelo(n, idCliente, selecionada)`** — monta a `<option>`.
  Existe porque são **dois** lugares que montam esse seletor: o desenho do card,
  em `renderAmostrasOSItens`, e o refiltro por formato, em `onItemCorSelect`.
  Pintar só um faria a cor sumir assim que o operador trocasse a Cor — que é
  justamente quando ele está escolhendo a numeração.
- **`pintarSelectDeNumeracao(select)`** — a caixa **fechada**. Ela mostra o texto
  com a cor do próprio `<select>`, não a da `<option>`, então a classe
  `num-select-exclusiva` é ligada à parte, lendo o `data-exclusiva` da opção
  escolhida. Chamada em três momentos: depois de desenhar o pedido inteiro
  (`pintarSelectsDeNumeracao(container)`), ao trocar a Cor, e ao trocar a própria
  numeração.

Uma armadilha de CSS, medida no navegador: a `<option>` **herda** a cor do
`<select>`. Com a caixa amarela, as opções comuns saíam amarelas também. Por isso
o `style.css` tem quatro regras, e não duas — `select.num-select-exclusiva option`
devolve o branco, e `select.num-select-exclusiva option.num-opt-exclusiva` recupera
o amarelo por cima dela.

O `frontend/cliente.js` tem uma cópia desse card e **não** recebeu a cor: ali todo
pedido é do cliente que está olhando, e a marca não distinguiria nada.

Testes: `tests/numeracao_amarela_do_cliente_harness.js` (35 verificações), pelo
`tests/test_numeracao_amarela_do_cliente.py`.

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
5. A caixa **Mostrar exclusivas de cliente** revela os registros com `Cli_Num` e o
   selo 👤 diz, por registro, se ele é "só deste modelo" ou "compartilhada".
6. `comoEditarNumeracaoDoModelo` devolve `noLugar` para a exclusiva do próprio modelo
   e para a compartilhada do mesmo cliente, e clone para a de outro modelo, a
   genérica e a de outro cliente.
7. `renomearNumeracao` manda ao Supabase um `update` **só com `name`**, recusa nome já
   usado por outra, e a numeração renomeada passa a contar como compartilhada.
7b. No editor, salvar uma numeração de cliente com o **mesmo nome** atualiza o
   registro; com **outro nome** grava uma cópia, o original não recebe UPDATE
   nenhum, a arte de fundo vai para o arquivo da cópia, e o modelo de onde se
   editava passa a apontar para ela. Numeração genérica continua só renomeando.
8. Numeração de cliente com arte de fundo carregada: salvar sobe o arquivo para
   `artes/fundos-numeracoes/<id>.<ext>` e grava `bg_url`; reabrir traz a arte de
   volta em vez da arte da cor. Numeração genérica não grava nada. Removida a arte,
   salvar limpa as colunas.
9. Duplicar uma numeração FxVerso e TICKET preserva `print_mode`, `ticket_qtd` e
   `ticket_logica`. Dá para verificar sem gravar em produção: intercepte
   `supabaseClient.from('producao_numeracoes').insert` e inspecione o payload.
