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
| **Tempo** | Há quanto tempo o pedido está no card atual |
| Entrega/Faturam. | Estado dos dados de entrega |
| Status | Badge do status calculado + progresso das aprovações |
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

### Tempo

Substituiu a coluna "Data Liberação" em 19/08/2026. Mostra `HH:MM` desde a
entrada no card atual, e continua em horas depois de um dia (`26:30`), para o
número poder ser comparado com o do vizinho sem conversão de cabeça.

**As cores, nos quatro cards:**

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

**O pedido de maior tempo fica no topo**, em cada card. A ordenação é feita pelo
instante de início: quanto mais antigo, mais tempo. Pedido ainda sem relógio vai
para o fim, e o desempate continua sendo o número maior primeiro.

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

### 5. Só o administrador libera para produção

O botão **PRODUÇÃO** (`podeLiberarParaProducao`) é de contingência. O caminho
normal é o parceiro atualizar `propostas.status_interno` para `EM PRODUCAO`, o
que leva o pedido para o card "Pedidos Concluídos" e para o Painel de Produção.

---

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

## Onde mexer

| O quê | Onde |
|-------|------|
| Em que card o pedido cai | `classificarPedidoNaArte` |
| O pedido está em arte? | `pedidoEstaEmArte` |
| A miniatura da arte | `previewDaArteDoPedidoHtml` |
| O relógio e a cor | `anotarTempoNoCard`, `inicioDoTempoNoCard`, `corDoTempoNoCard`, `celulaDeTempoHtml` |
| A caixa de designers | `renderDesignersBoxHTML` |
| As travas do negócio | `podeDefinirDesigner`, `bloqueioDeModeloAprovado`, `divergenciaDeCelulasDoModelo`, `podeLiberarParaProducao` |
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
