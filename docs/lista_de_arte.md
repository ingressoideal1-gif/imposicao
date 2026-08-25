# Lista de Arte

A tela onde o atendimento e os designers acompanham os pedidos enquanto a arte
está sendo feita. É a primeira tela do dia para quem trabalha na arte, e a que
mais mudou em 19/08/2026 — este documento descreve como ela está hoje.

Ela vive em `frontend/index.html` (e, igual, em `frontend/producao.html`), na
tabela `#table-arte`. Todo o comportamento está em `frontend/script.js`, na
função `renderOrdens()`.

---

## Os cinco cards

Os cards no topo não são enfeite: cada um é um filtro, e clicar em qualquer um
deles troca a tabela de baixo e o título dela.

| Card | Fila interna | O que reúne |
|------|--------------|-------------|
| 🌐 Todos os Pedidos Pendentes | `todos` | Em Arte + Fila de Aprovação |
| 🎨 Em Arte | `fila` | O trabalho do designer ainda está aberto |
| ⏳ Fila de Aprovação | `aprovacao` | Foi para o cliente e aguarda resposta |
| ✅ Fila de Aprovados | `aprovados` | Arte **e** dados de entrega aprovados |
| 🏆 Pedidos Concluídos | `concluidos` | Já saiu da arte para a produção |

Quem decide em qual card cada pedido cai é **`classificarPedidoNaArte(os)`**,
que devolve `{ statusCalculado, fila }`. Ela lê quatro fontes — `propostas`,
`pedidos_modelos`, `pedidos_artes` e os links do cliente — e responde na ordem:

1. **Saiu da arte?** (`pedidoSaiuDaArte`) → `concluidos`. Esta pergunta vem
   primeiro de propósito: sem isso, o pedido liberado para produção voltaria a
   ser contado em "Em Arte" e reapareceria na tabela.
2. **Arte aprovada E entrega aprovada?** → `aprovados`
3. **Está com o cliente?** → `aprovacao`
4. Senão → `fila`

### Quais palavras tiram um pedido da arte

`pedidoSaiuDaArte` compara `status` e `status_interno` com `SINAIS_SAIU_DA_ARTE`.
As palavras vêm do ERP do parceiro, então a lista foi escolhida em 20/08/2026
contando o que existe de verdade nas 8.268 propostas:

| Sai da arte | Fica na arte |
|-------------|--------------|
| `EM PRODUCAO` · `PRODUCAO` | `NOVO` (941) |
| `EM IMPRESSAO` · `IMPRESSO` | `AGUARDANDO` (358) |
| `EM ACABAMENTO` | `NOVO_ARTE_APROVADA` |
| `REVISAO PRODUCAO` | `REVISAO ATENDENTE` |
| `EXPEDICAO` · `EM TRANSITO` · `ENTREGUE` | **`APROVADO` (3.363)** |
| `FINALIZADA` · `FINALIZADO` | **`LIBERADO` (3.224)** |

> [!CAUTION]
> **`APROVADO` e `LIBERADO` são a armadilha.** Soam como fim de linha e são dois
> terços do ERP inteiro — o pedido mais recente do dia costuma estar em
> `LIBERADO`. Pôr qualquer um dos dois na lista esvaziaria a Lista de Arte.
>
> `CANCELADO` (32) também fica de fora, mas por outro motivo: pedido cancelado
> não *saiu* da arte, ele deixou de existir, e "Pedidos Concluídos" é card de
> trabalho feito.
>
> `IMPRESSO` e `ENTREGUE` entram sem existir ainda em `status_interno`: são
> inequívocas, e são as palavras que o operador espera que funcionem.

Antes dessa revisão a lista tinha só produção, impressão e finalizada — e por
isso pedido já em trânsito ou no acabamento continuava ocupando a tela do
designer.

> [!IMPORTANT]
> Essa função é a **única** dona da regra. Ela nasceu como um trecho solto dentro
> do `renderOrdens`, e por isso só existia enquanto a tabela era desenhada — a
> caixa "Designers Ideal", que aparece dentro do pedido, contava os pedidos por
> conta própria e chegava a outro número. Quem precisar saber em que card um
> pedido está deve chamar `classificarPedidoNaArte` ou `pedidoEstaEmArte`, nunca
> reimplementar o critério.

O `renderOrdens` grava o `statusCalculado` no pedido (`os.status_calculado`)
porque a tabela da Lista de Impressão usa esse campo para o badge — inclusive
nos pedidos que já saíram da arte.

---

## As colunas da tabela

| Coluna | O que mostra |
|--------|--------------|
| Nº Pedido | O número, em caixa colorida conforme o estado |
| Cliente / Evento | `20928 Patrick Soares Furtado - 28449` e o nome do evento |
| Vendedor / Designer | Atendente e, embaixo, o designer do pedido |
| **Preview** | Miniatura da arte do modelo de número mais baixo |
| **Tempo** | Há quanto tempo o pedido está no card atual — e, nos Concluídos, quando ele entrou em produção |
| Entrega/Faturam. | Estado dos dados de entrega |
| Status | Badge do status calculado + progresso das aprovações |
| **Pagamento** | O carimbo PAGO nos pedidos quitados; um traço nos demais |
| Itens | Quantidade de modelos |
| Ações | Botões conforme o papel de quem está logado |

### O número do cliente

O rótulo `20928 Patrick Soares Furtado - 28449` é montado por
`rotuloDoCliente(os)`. O número que aparece ao lado do nome é
`propostas.id_cliente` → `clientes.id_cliente`.

> [!CAUTION]
> Não confundir com `id_faturado`. Os dois divergem — no pedido 20940 são 43520 e
> 66163. O `id_faturado` continua sendo usado internamente para casar numerações
> de cliente (`Cli_Num`); quem vai para a tela é o `id_cliente`.

### Preview

Vem de `previewDaArteDoPedidoHtml(os)` — a **mesma** função que desenha a coluna
Preview do Painel de Produção. "Igual ao do Painel de Produção" só continua sendo
verdade enquanto for o mesmo código desenhando os dois.

Ela escolhe o modelo de **número mais baixo** que tenha arte, e:

- imagem → miniatura de 126 × 42, que amplia no clique;
- **PDF → um atalho 📄 que abre o arquivo**, nunca uma miniatura rasterizada;
- sem arte → moldura vazia com 🖼️.

### Pagamento

Pedida em 25/08/2026: uma coluna entre Status e Itens, com o carimbo PAGO nos
pedidos sinalizados como pagos. A imagem é o arquivo que o usuário mandou, no
Storage do Supabase, usado como veio — arte da empresa não se redesenha.

**Só o pago ganha marca.** O pedido em aberto fica com um traço discreto, e não
com um selo vermelho. Medido no banco naquele dia, dos 2.629 pedidos então na
Lista de Arte 1.950 estavam pagos: um selo em cada um dos outros 679 encheria a
coluna de alarme para o estado *normal* de um pedido que acabou de entrar. Quem
precisa saltar aos olhos é o que já foi pago — que é o que libera o trabalho.

O `title` de cada célula diz qual é o caso: "Pedido pago", "Cobrança em aberto",
"N cobranças, nem todas pagas", "Sem cobrança gerada".

**Quando um pedido está pago** é decidido por `pedidoEstaPago()`, em
`frontend/pagamento-do-pedido.js`:

- **todas** as cobranças vivas precisam estar em `PAID`. Um pedido pode ter mais
  de uma — entrada mais parcela, com a referência indo `20927-A`, `20927-B` —, e
  no banco há 12 com uma paga e a outra em aberto. Nesses, o selo verde na frente
  do atendente o faria deixar de cobrar;
- a cobrança **CANCELADA não conta**. São 331 no banco, e são cobrança que a
  gráfica desfez: contá-las impediria para sempre o selo de um pedido recotado;
- pedido **sem cobrança nenhuma não é pago**. Ali a cobrança ainda não saiu — não
  que alguém pagou;
- qualquer status novo que o parceiro invente cai em "não pago", que é o lado
  seguro do erro.

> [!IMPORTANT]
> Essa regra mora num módulo à parte porque a aba 💳 Pagar do **link do cliente**
> faz a mesma pergunta. Duas contas diferentes sobre o mesmo dinheiro fariam o
> cliente e a gráfica verem coisas diferentes — e é a gráfica que descobre por
> último. O `statusDoPagamento` do portal conta pela mesma função.

As cobranças chegam por `carregarPagamentosGlobais()`, **depois** do primeiro
desenho da tabela: a coluna é informação de apoio, e segurar a lista por ela
atrasaria a tela que o atendimento abre de manhã. Enquanto não chega, a célula
mostra o traço. A consulta traz só `id_int` e `status` — link de cobrança e PIX
não têm o que fazer numa listagem.

Se a imagem não carregar, a célula cai num badge de texto `✅ PAGO`. Sem isso,
uma falha de rede deixaria a célula visualmente igual à do pedido **não** pago, e
o atendente leria "não pago" onde a verdade é "não carregou".

### Tempo

Substituiu a coluna "Data Liberação" em 19/08/2026. Mostra `HH:MM` desde a
entrada no card atual, e continua em horas depois de um dia (`26:30`), para o
número poder ser comparado com o do vizinho sem conversão de cabeça.

**As cores, nos três cards de trabalho:**

| Faixa | Cor |
|-------|-----|
| até 00:59 | verde `#22c55e` |
| 01:00 a 01:59 | azul `#3b82f6` |
| 02:00 a 02:59 | laranja `#f97316` |
| 03:00 em diante | vermelho `#ef4444` |

As duas datas que ficavam nessa coluna não se perderam: estão no título da
célula, junto com "Em *card* desde *quando*".

O relógio anda sozinho a cada 30 segundos por `atualizarRelogiosDaLista()`, que
mexe **só** no texto e na cor das células `td.celula-tempo` — redesenhar a lista
fecharia menu aberto e perderia a rolagem de quem estivesse lendo.

#### Nos Concluídos a coluna não é relógio: é carimbo

Pedido do usuário em 23/08/2026. No card **Pedidos Concluídos** o trabalho de
arte acabou, e um número que só cresce não mede mais nada — diz apenas há
quanto tempo aquele pedido saiu da tela. Ali a célula mostra, parada, a **data e
a hora em que o pedido entrou em produção** (dia em cima, hora embaixo), e o
título da coluna passa de "Tempo" a **"Entrou em Produção"**.

O instante é o mesmo `desde` da tabela `imposition_tempo_no_card` — o momento em
que o painel viu o pedido chegar aos concluídos. Não há outro registro dessa
hora: `liberarParaProducao()` grava o status `EM PRODUCAO` na proposta, sem data.
Como todo pedido nunca visto nasce com `desde = agora`, o histórico anterior a
19/08/2026 carrega a hora da primeira vez que o painel o viu, e não a da
liberação real.

> [!IMPORTANT]
> A célula do carimbo sai **sem** a classe `celula-tempo` e sem
> `data-tempo-inicio`. É só isso que a mantém parada: o tique de meio minuto
> (`atualizarRelogiosDaLista`) procura exatamente esses dois. Quem alargar o
> seletor do tique faz o carimbo voltar a andar.

**O pedido de maior tempo fica no topo**, nos cards de trabalho. A ordenação é
feita pelo instante de início: quanto mais antigo, mais tempo. Pedido ainda sem
relógio vai para o fim, e o desempate continua sendo o número maior primeiro.

**Menos em 🏆 Pedidos Concluídos**, que sai **do mais novo ao mais antigo**
(pedido do usuário, 23/08/2026). Aquele card é histórico, não fila: não há nada
a fazer nele, e quem o abre quer ver o que acabou de sair — enquanto nas filas o
topo é do pedido mais parado, porque é ele que precisa de atenção.

"Mais novo" ali é o **número do pedido**, que cresce com o tempo
(`ordenarConcluidosDoMaisNovo`). De propósito não é o relógio dos cards: ele só
existe desde 19/08/2026 e carimba `desde = agora` na primeira vez que vê um
pedido, então todo o histórico anterior nasceu com a mesma data e sairia
empatado. Pedido sem número vai para o fim, em vez de virar zero e encabeçar.

A regra está presa à **base** dos concluídos (`listaEhDosConcluidos`), e não ao
card aceso: com um filtro de estágio ligado o card continua aceso mas a lista já
é outra, e ali vale a ordem da fila de trabalho.

---

## Como o relógio funciona

O card é **calculado**; o relógio precisa de **memória** — quando o pedido entrou
ali. Essa memória é a tabela `imposition_tempo_no_card`, uma linha por pedido.

**Quem escreve é o próprio painel**, quando desenha a lista e percebe que o card
mudou (`anotarTempoNoCard`). Foi decisão do usuário em 19/08/2026, contra a
alternativa de um robô no servidor: o robô seria fiel ao relógio real mesmo com
todos os painéis fechados, mas exigiria reescrever a classificação em SQL,
criando uma segunda cópia da regra que divergiria da do painel no primeiro
ajuste.

> [!NOTE]
> Consequência conhecida e aceita: troca de card que acontece de madrugada só é
> registrada quando alguém abre o painel de manhã, e o tempo passa a contar dali.
> Na prática isso aproxima o número do tempo de trabalho observado.

### A regra dos 60 minutos

No card **Em Arte** o tempo não se perde numa ida rápida a outro card:

- saiu e voltou em **até 60 minutos** → a contagem segue de onde parou;
- ficou **mais de 60 minutos** fora → volta ao zero, em verde.

Nos demais cards a contagem zera a cada troca.

O que conta é há quanto tempo o pedido saiu **da arte**, e não do card anterior —
ele pode passear por Aprovação e Aprovados antes de voltar, e o crédito
sobrevive às duas trocas se o total fora couber nos 60 minutos.

### Como isso está guardado

| Coluna | Para que serve |
|--------|----------------|
| `id_int` | O número do pedido (PK) |
| `card` | `fila`, `aprovacao`, `aprovados` ou `concluidos` |
| `desde` | Quando entrou **neste** card |
| `credito_segundos` | Tempo já acumulado em Em Arte, à espera de uma volta rápida |
| `saiu_da_fila_em` | Quando saiu de Em Arte pela última vez |

O crédito é **descontado do início** em vez de somado ao total
(`inicioDoTempoNoCard`). Assim um número só serve para desenhar a célula, para o
relógio andar sozinho e para ordenar a lista.

O SQL está em [`sql/tempo_no_card.sql`](../sql/tempo_no_card.sql). Sem a tabela,
a coluna mostra `--` e a lista continua funcionando: o painel não tenta escrever
nem enche o console.

---

## A caixa "Designers Ideal"

Aparece dentro do pedido aberto e serve a duas coisas: escolher o designer e ver
quanto trabalho cada um tem. Os números ao lado de cada nome contam **apenas os
pedidos do card "Em Arte"**, pela mesma função que os cards usam.

Contando tudo, como fazia até 19/08/2026, a caixa somava pedido já aprovado,
pedido esperando o cliente e pedido que foi para a produção meses atrás — o
número só crescia e não dizia quanto trabalho a pessoa tem hoje.

Trocar o designer é ação do **atendimento ou do administrador**
(`podeDefinirDesigner`). Para os outros a caixa vira o que ela realmente é: uma
consulta de quem está com o quê.

---

## As regras de bloqueio do negócio

Não há painel de permissões para elas: são regras do negócio, escritas no código.

### 1. O designer não muda o designer

Quem define o designer de um pedido é o atendimento. `podeDefinirDesigner()`
libera para `admin` e `atendimento`.

### 2. Modelo aprovado não se altera

Modelo com `amostra_status` aprovado fica congelado: nem cor, nem numeração, nem
tabelas, nem nada. `bloqueioDeModeloAprovado()` barra a escrita no único ponto
por onde ela passa — `saveAmostraToDB`.

O que continua liberado é o botão **Em Alteração** e a descrição, e só para
atendimento, gerente e administrador (`podeDestravarModeloAprovado`).

E o **🔗 Copiar link da arte**, para **designer, atendimento e administrador**
(`podeCopiarDeModeloAprovado`, regra do usuário de 25/08/2026). Copiar não é
alterar: o link vai para a área de transferência para ser **colado em outro
modelo**, e o modelo aprovado sai da operação como entrou. O **📥 Colar**
continua travado, porque esse sim escreve.

São duas saídas com listas de gente diferentes, e a trava do card as distingue
por atributo: `data-libera-aprovado` para o que altera, `data-libera-copia` para
o que só lê. Controle que não declara nenhum dos dois nasce travado — é o
padrão que impede um controle novo de aparecer solto dentro de um modelo
aprovado.

> [!NOTE]
> A trava é silenciosa quando o que está sendo gravado é só a prévia
> (`amostra_arte_base64`), que o desenho do card reescreve a cada renderização.
> Sem isso o operador levaria um aviso a cada segundo, sem ter feito nada.

### 3. Qtd × células geradas

A `Qtd` do modelo vem do ERP e é a quantidade contratada. O número de células
geradas tem de bater: **igual** à Qtd quando a numeração imprime só a frente, e
**o dobro** quando é Frente × Verso.

Divergiu, o designer **não consegue marcar PRONTO** — e o pedido não anda até
alguém corrigir.

> [!CAUTION]
> A correção é sempre nas linhas da numeração. **A `Qtd` nunca é escrita de
> volta** no banco: ela é a quantidade contratada, e mexer nela mexe no valor do
> pedido.

### 4. Elemento de banco de dados sem banco ou sem coluna

Regra do usuário, 22/08/2026. Se a numeração do modelo tem um elemento do tipo
**Banco de Dados** (`source: 'database'`), ela precisa ter um **CSV carregado**
e cada um desses elementos precisa apontar para uma **coluna que exista** nesse
CSV. Faltando qualquer um dos dois, o card mostra uma faixa vermelha dizendo o
que falta (sem CSV; QR sem coluna; coluna "X" não existe) e o **MARCAR PRONTO**
fica trancado — no botão e no clique (`decisionAmostraItem`), porque botão
cinza não impede ninguém de chamar a função pelo console.

Nasceu do pedido 21085: onze modelos apontavam para uma numeração com QR de
banco de dados e nenhum CSV, e nada na tela dizia isso. Impresso, o QR sairia
vazio. A regra é `bancoDeDadosIncompletoDoModelo(item)`, ao lado da de células;
no link do cliente ela não aparece, porque o cliente não tem como consertar a
numeração. O harness da Lista de Arte exercita os seis casos.

### 5. Caractere que a fonte não desenha

O buraco no nome estrangeiro. Quando falta um caractere na fonte, o **navegador
troca de fonte só naquele caractere**, em silêncio, e a tela mostra o nome
inteiro; o PyMuPDF não empresta nada — deixa o vão. Mesmo dado, mesma fonte,
dois resultados, e o único que alguém vê antes de imprimir é o que mente.

Se algum texto que o modelo imprime tiver um caractere fora da fonte escolhida,
o card mostra faixa vermelha com **qual fonte, qual elemento, quais caracteres e
um exemplo do antes e depois** — `"Ondřej Pek" sai "Ond ej Pek"` — e o **MARCAR
PRONTO** fica trancado, nos três caminhos (botão, `decisionAmostraItem` e o
lote). A regra é `fonteSemGlifoDoModelo(item)`; no link do cliente ela não
aparece, porque o cliente não tem como trocar a fonte.

Ela olha **a fatia de linhas daquele modelo**, e não o banco inteiro. No pedido
21146 os três modelos dividem o mesmo CSV de 13 linhas, e só a Tchéquia é
acusada: as linhas ativas de Macedônia e Organização não têm caron nenhum.

Nasceu do pedido 21146, e do 20495 antes dele — mesma cliente, mesmo evento, 185
credenciais impressas em 11/08/2026 com a Gotham Book, que não tem `ř`, `ě` nem
`č`; Tchéquia e Macedônia do Norte voltaram `REPROVADA_CLIENTE`, e o 21146 é o
retrabalho delas. Das 273 fontes ativas do catálogo, 173 não conseguem imprimir
aquela planilha.

> [!IMPORTANT]
> **Fonte que não deu para ler não acusa ninguém.** WOFF2, fonte do sistema,
> arquivo que não baixou — a trava se cala. Uma trava falsa pararia a gráfica
> por causa de um arquivo que o leitor de fontes não entendeu.

A saída fica no próprio seletor de fontes do editor: ele confere a fonte atual
ao abrir e tem o botão **🔤 Conferir quais fontes servem**, que varre o catálogo
e marca ✅/⚠️ cada uma contra o banco daquela numeração. Fonte não conferida sai
sem selo — marcar de verde o que ninguém leu seria a mesma mentira.

### Aviso: células do banco repetidas entre modelos

Não é trava — é aviso. Regra do usuário, 22/08/2026: o card avisa, em âmbar,
quando uma célula de banco de dados que **este** modelo imprime (o valor da
coluna apontada por cada elemento de banco, nas linhas da fatia dele) também
está no banco de **outro** modelo do mesmo pedido — quantas, com quem e três
exemplos. Vale para dois modelos que dividem o mesmo CSV sem repartir as linhas
(os três "Veículo" do pedido 21085 herdaram a numeração do Expositor SIMERS e
imprimiriam os mesmos 4.000 códigos) e para dois CSVs diferentes com um código em
comum. A conta é feita uma vez por pedido (`celulasRepetidasDoPedido`), cada
card consulta o seu id, e no link do cliente ela não é feita. O harness da
fatia exercita os quatro cenários.

### 6. Só o administrador libera para produção

O botão **PRODUÇÃO** (`podeLiberarParaProducao`) é de contingência. O caminho
normal é o parceiro atualizar `propostas.status_interno` para `EM PRODUCAO`, o
que leva o pedido para o card "Pedidos Concluídos" e para o Painel de Produção.

---

## Conferência de dados

Botão **🔎 Conferência de dados** no cabeçalho do pedido aberto (regra do
usuário, 22/08/2026). Ele relê do banco as numerações dos modelos e mostra, numa
janela, a revisão que foi feita à mão no pedido 21085 naquele dia — para
qualquer pedido, num clique:

- resumo no topo: **✅ nenhum problema** ou a lista dos pontos de atenção;
- uma linha por modelo: numeração e arquivo CSV, **linhas da fatia × Qtd**,
  códigos distintos, **repetidos dentro do próprio CSV**, **células vazias**,
  a **1ª linha** daquele modelo e a situação (as três regras do card — banco
  incompleto, Qtd × células, células repetidas com outro modelo);
- **📋 Copiar relatório** (texto puro) e Fechar.

"Códigos" são os valores das colunas apontadas pelos elementos de banco de
dados — o que vai para o papel. Modelo cuja numeração não usa banco aparece como
"não usa banco" e não é cobrado por CSV. A conta é `conferenciaDeDadosDoPedido`
(pura; o harness da fatia a lê do `script.js` com um pedido misto e um limpo);
a janela é `abrirConferenciaDeDados`.

### A coluna "1ª linha"

Pedido do usuário em 23/08/2026. Vem **logo depois de "Numeração / arquivo"** e
mostra **apenas os valores** da primeira linha, separados por ` · `. É por onde a
fatia daquele modelo **começa** —
numa numeração dividida entre vários modelos, ler a primeira linha de cada um é o
jeito mais rápido de ver que a distribuição saiu certa (um começa no 1001, o
outro no 1051) sem abrir o CSV modelo a modelo.

Como ela é montada (`primeiraLinhaDoModelo`):

- vem da **fatia** do modelo, nunca do topo do banco inteiro — é essa distinção
  que faz a coluna valer alguma coisa;
- **só entram as colunas que a numeração lê** — as apontadas em `csv_column` por
  elementos `source: 'database'`. Coluna que existe no arquivo mas que nenhum
  elemento usa **não aparece** (regra do usuário, 23/08/2026): este relatório
  responde uma pergunta só — o que vai sair no papel está certo? —, e um dado que
  não é impresso em lugar nenhum é ruído aqui. O pedido 21085 mostrou por quê: os
  CSVs tinham uma segunda coluna que só repetia o nome do setor como valor, e ela
  dobrava o texto da célula sem dizer nada sobre a produção;
- **coluna do banco vazia aparece como `(vazio)`** — uma coluna apontada que está
  em branco na primeira linha é exatamente o que este relatório existe para
  mostrar;
- `__id`, `__ativo` e `__fotos` não têm por onde entrar: nenhum elemento aponta
  para elas;
- a numeração **sem** elemento de banco fica com a célula vazia, mesmo tendo CSV —
  nada daquele arquivo vai para o papel;
- **o nome da coluna não aparece na célula**: repetido em cada linha, era a
  mesma palavra dezenas de vezes na mesma tela, e a largura que ele comia
  empurrava "Vazios" e "Situação" para fora da janela. Ele fica no `title`
  (passar o mouse) e no relatório copiado, onde o texto precisa se explicar
  sozinho;
- na tela cabem dez valores e o resto vira `+N`.

Sobre a largura: a janela vai a `min(1360px, 96vw)`, as quatro colunas de
contagem levam `white-space: nowrap` (número quebrado em duas linhas não se lê, e
era a quebra delas que empurrava o resto para fora) e a tabela rola na horizontal
dentro do próprio box quando ainda assim não couber. Conferido em 1280, 1366,
1600 e 1920 px: as oito colunas cabem sem rolagem.

## O link para o sistema parceiro

O ícone do Vibe aparece **dentro do pedido aberto**, no cabeçalho, ao lado do
número — e não mais na linha da lista, que ficou só com o número.

Ele nasce de `botaoDoVibeHtml(numero)`, que usa `linkDoPedidoNoVibe(numero)`:

```
https://vibe.ai-ideal.com.br/orcamentos/{numero}/editar?tab=pedido
```

O menu em que a tela do parceiro abre é a constante `ABA_DO_PEDIDO_NO_VIBE`.

Todas as âncoras usam `target="vibe-ideal"` — um **nome** de aba, para que abrir
cinco pedidos não deixe cinco abas do Vibe. Elas **não** podem levar
`rel="noopener"` nem `rel="noreferrer"`: foi medido num Chrome que, com eles, o
navegador ignora o nome e cria uma aba por clique.

---

## O link direto para um pedido

```
https://ideal-imposition.vercel.app/pedido/20928
```

Abre o painel **já dentro** do pedido 20928. É o endereço que se manda ao
parceiro. Não há botão para copiá-lo — ele foi retirado da lista em 19/08/2026,
junto com o ícone do Vibe, e o endereço se monta pelo número do pedido.

Três detalhes que fazem esse link funcionar:

- É **caminho**, e não `?pedido=20928`: quando a pessoa não está logada, o login
  do Supabase volta para `origin + pathname`, e a query string se perderia.
- A Vercel precisa da reescrita `/pedido/:match*` → `/frontend/index.html`,
  declarada **antes** da regra genérica.
- O `index.html` precisa do `<base href="/">`. Sem ele, os 23 scripts que a
  página carrega por caminho relativo resolveriam para `/pedido/script.js`, e a
  reescrita devolveria o próprio HTML no lugar de cada um.

Quem abre o link sem sessão para no login, como qualquer outra tela do painel.

### Por que esse link já foi lento

Até 20/08/2026 o parceiro reclamava que clicar nele demorava. Não era a rede dele
nem o tamanho do `script.js`: os arquivos do site chegam em cerca de 300 ms. Era
**uma consulta só**, `producao_cores?select=*`, medida em **7,6 s** no
carregamento — a tabela guarda o PDF de referência de cada cor dentro da linha,
em base64, e as 24 linhas somam 17,8 MiB.

O catálogo passou a pedir só as colunas que a tela mostra (2 KB) e quem vai
desenhar a cor chama `garantirPdfDaCor(cor)`, que busca uma cor por vez. Se algum
dia a lista voltar a ficar lenta, o primeiro lugar a olhar é a aba Rede do
navegador ordenada por duração: neste projeto o gargalo tem sido sempre uma
coluna `base64` viajando junto com o catálogo, e não a quantidade de arquivos.

---

## O catálogo de numerações é relido ao abrir o pedido

Abrir um pedido nesta tela **sempre** relê do banco os modelos dele (é o
`_dbLoaded: false` antes do `loadOSItens`) — e, desde 22/08/2026, relê também
**as numerações que esses modelos usam**, por `recarregarNumeracoesDoPedido`.
Até então o catálogo (`state.numeracoes`) só era recarregado inteiro quando a
própria aba salvava alguma coisa, e uma aba aberta de manhã mostrava, no
pedido 21085, a "Expointer 2026" com um CSV de 19.500 linhas que outra aba já
tinha tirado, e não conhecia a 1000496, criada em outra aba — o seletor caía na
primeira opção e a conta de células (seção 3 acima) usava um banco que não
existia mais.

A releitura é pequena (só os ids que o pedido usa), mescla por id no catálogo
em memória (`mesclarNumeracoesNoCatalogo`, pura e testada no harness) e nunca
lança: sem rede, a tela segue com o que tem. Ela roda também ao **mandar um
modelo para a Imposição** e ao **abrir o pedido inteiro na Imposição**, porque
o que vai para a folha tem de ser a numeração do banco, nunca a da aba.

## O título da tela de Pedido

Abrir um pedido leva à tela de **Pedido**, e o cabeçalho dela sai em duas
linhas desde 23/08/2026, a pedido do usuário:

```
21085 - Expointer 2026 - Parte 2            ← 20% menor que o tamanho de antes
ANGELA BEATRIZ DA COSTA SALOMAO - 53193     ← 30% menor, em #fbbf24
```

Os dois números saem do **mesmo** tamanho de referência
(`TAMANHO_DO_TITULO_DO_PEDIDO`), e não um em cima do outro: 30% menor que a
primeira linha daria 56% do título, e não 70%. Por isso as duas linhas são
medidas em `em`.

O cliente vem do `rotuloDoCliente`, que já devolve "NOME - NÚMERO" — o mesmo de
todo o resto do painel. Pedido sem evento no briefing fica com a primeira linha
só no número, em vez de terminar num hífen solto.

> [!CAUTION]
> A linha do cliente **devolve o próprio `-webkit-text-fill-color`**, e isso não
> é decoração. O `<h1>` herda o degradê de `.page-header-text h1`, que pinta o
> texto por `-webkit-background-clip: text` com fill transparente; esse
> transparente é herdado, e o degradê se recorta no texto dos filhos também —
> uma segunda linha só com `color: #fbbf24` sairia **cinza clara**, igual à de
> cima. O `tests/titulo_do_pedido_harness.js` mede a cor no pixel e desenha ao
> lado o controle sem o `text-fill`, para a armadilha ficar visível na imagem.

**Dois caminhos chegam a esse cabeçalho** — abrir um modelo pela tela de Pedido
(`pedido.js`) e voltar a ela pelo histórico do painel (`script.js`). Os dois
chamam a mesma `pintarTituloDaTelaDePedido`: escrito duas vezes, o título
passaria a depender de por onde a pessoa entrou. Há teste travando isso.

O **Painel do Acabamento** tem a mesma forma no cabeçalho do pedido aberto, com
tamanhos próprios — ver [`painel_do_acabamento.md`](painel_do_acabamento.md).

## Onde mexer

| O quê | Onde |
|-------|------|
| Em que card o pedido cai | `classificarPedidoNaArte` |
| O pedido está em arte? | `pedidoEstaEmArte` |
| A miniatura da arte | `previewDaArteDoPedidoHtml` |
| O relógio e a cor | `anotarTempoNoCard`, `inicioDoTempoNoCard`, `corDoTempoNoCard`, `celulaDeTempoHtml` |
| O carimbo dos concluídos | `celulaDeEntradaEmProducaoHtml` (e o `th-tempo-arte` em `renderOrdens`) |
| O título da tela de Pedido | `pintarTituloDaTelaDePedido`, `ESTILO_CLIENTE_DO_PEDIDO` |
| A caixa de designers | `renderDesignersBoxHTML` |
| As travas do negócio | `podeDefinirDesigner`, `bloqueioDeModeloAprovado`, `divergenciaDeCelulasDoModelo`, `bancoDeDadosIncompletoDoModelo`, `fonteSemGlifoDoModelo`, `podeLiberarParaProducao` |
| O botão do parceiro | `botaoDoVibeHtml`, `linkDoPedidoNoVibe` |
| O link direto | `linkDiretoDoPedido`, `pedidoDoLinkDireto`, `abrirPedidoDoLinkDireto` |

### Testes

| Arquivo | Cobre |
|---------|-------|
| `tests/test_lista_arte.py` | Os cinco cards e a separação de quem saiu da arte |
| `tests/test_lista_arte_enxuta.py` | Designers contando só o Em Arte, linha sem links, coluna Preview |
| `tests/test_tempo_no_card.py` | O relógio, a regra dos 60 minutos, as cores e a tela |
| `tests/test_regras_de_bloqueio.py` | As quatro travas do negócio |
| `tests/test_link_do_pedido.py` | O link direto, as abas nomeadas e o menu do Vibe |
| `tests/test_vibe_no_pedido.py` | O botão do Vibe dentro do pedido |
| `tests/test_numero_do_cliente.py` | O número ao lado do nome |
| `tests/test_frete_do_painel.py` | As logomarcas de frete (Painel de Produção) |
