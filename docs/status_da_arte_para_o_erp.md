# Vocabulário da Arte — o que o Ideal Imposition reconhece

> Documento para o **ERP parceiro**. Diz quais palavras o Ideal Imposition entende no
> fluxo de arte de um pedido, em que campo cada uma é gravada, e em qual card da Lista
> de Arte o pedido aparece por causa delas.
>
> Conferido em 31/08/2026, na versão **v782**. A regra mora em
> `frontend/script.js`, na função `classificarPedidoNaArte` — ela é a única dona do
> critério, e as listas citadas aqui são as dela.

**A comparação ignora maiúsculas/minúsculas e espaços nas pontas, mas o acento conta.**
Por isso `EM ALTERAÇÃO` e `EM ALTERACAO` precisam estar as duas na lista, e estão.

---

## Mudança de 31/08/2026: o Imposition passou a escrever também

Até esta data, `pedidos_artes.status` era escrito **só pelo ERP**. A partir dela, o
Ideal Imposition grava dois estágios nesse mesmo campo, porque são estágios que só ele
sabe que aconteceram:

| Palavra | Quem grava | Quando |
|---|---|---|
| `ENVIAR ARTE` | **Ideal Imposition** | o designer terminou a arte e devolveu o pedido ao atendimento |
| `AGUARDANDO_APROVACAO` | **Ideal Imposition** | o cliente abriu o link e olhou a arte |

O ERP continua dono do resto. **A marca nunca anda para trás:** arte já aprovada não
volta para um estágio anterior por causa dessas gravações.

O que mudou no fluxo, em uma linha: **o link de aprovação passa a nascer junto com a arte
pronta**, e não mais quando o atendimento decide gerá-lo. Por isso o estágio 3 deixou de
significar "o link existe" e passou a significar "o cliente olhou".

---

## Onde cada palavra é gravada

| Campo | Responde | Efeito na Lista de Arte |
|---|---|---|
| `pedidos_artes.status` | Em que estágio está a arte do **pedido**. | Decide o badge e o card. É o campo principal deste documento. |
| `pedidos_artes.entrega_dados` | Os dados de entrega e faturamento foram conferidos? | `APROVADO` junto com arte aprovada leva o pedido para **Fila de Aprovados**. Também aceita `ALTERADO`. |
| `pedidos_modelos.status_arte` | Em que estágio está a arte de **cada modelo**. | Todos aprovados aprovam o pedido inteiro; um reprovado manda o pedido para Em Alteração. |
| `propostas.status_interno` | Em que estágio está o **pedido** no ERP. | É o campo que **tira** o pedido da Lista de Arte quando ele vai para a produção. |

> [!IMPORTANT]
> Não usar `propostas.status_pedido`. Ele é campo morto — está em `NAO_INICIADO` em
> praticamente toda a base, e nenhuma tela do Ideal Imposition o lê.

---

## Os cinco estágios da arte (`pedidos_artes.status`)

A primeira palavra de cada linha, em **negrito**, é a que recomendamos gravar.

### 1 · 🎨 Em Arte — card "Em Arte", a fila do designer

**`AGUARDANDO`** · `EM ARTE` · `ARTE_EM_ANDAMENTO`

O trabalho ainda está com o designer. `AGUARDANDO` significa **aguardando o designer** —
nada foi enviado a ninguém. É o valor com que a linha da arte nasce.

### 2 · 📤 Enviar Arte — card "Fila de Aprovação"

**`ENVIAR ARTE`** · `ARTE PRONTA`

A arte ficou pronta e espera ser mandada ao cliente. **O link de aprovação já existe
neste momento** — ele é criado junto com a arte pronta, e a linha do pedido traz o botão
**Copiar Link**. O pedido permanece neste estágio até o cliente abrir o link.

### 3 · ⏳ Aguard. Aprovação — card "Fila de Aprovação"

**`AGUARDANDO_APROVACAO`** · `AGUARD. APROVAÇÃO` · `AGUARD. APROVACAO` · `AGUARD. APROVAÇAO`

A arte foi ao cliente **e ele já a abriu**. Desde 31/08/2026 quem grava esta palavra é o
próprio Ideal Imposition, no instante em que o cliente faz o primeiro gesto na tela do
link — rolar, tocar ou clicar.

**Não confundir com `AGUARDANDO` do estágio 1** — as duas palavras se parecem e dizem o
contrário uma da outra.

### 4 · ⚠️ Em Alteração — card "Em Arte", volta ao designer

**`EM ALTERACAO`** · `EM ALTERAÇÃO` · `REPROVADO` · `REPROVADA` · `REPROVADA_CLIENTE` ·
`ARTE_EM_CORRECAO`

O cliente pediu alteração. O pedido volta para a fila do designer e a linha ganha o botão
**Reenviar Link**.

### 5 · ✅ Aprovada — card "Fila de Aprovação", ou "Fila de Aprovados"

**`APROVADO`** · `APROVADA` · `APROVADA_CLIENTE` · `ARTE_APROVADA` · `ARTE APROVADA` ·
`LIBERADA`

O cliente aprovou a arte. O pedido só passa para a **Fila de Aprovados** quando
`entrega_dados` também vale `APROVADO` — arte aprovada sozinha não basta.

---

## No nível do modelo (`pedidos_modelos.status_arte`)

Duas listas menores, e só elas contam:

| Aprovam o modelo | Reprovam o modelo |
|---|---|
| `APROVADO` · `APROVADA` · `APROVADA_CLIENTE` · `ARTE_APROVADA` · `ARTE APROVADA` · `LIBERADA` | `REPROVADO` · `REPROVADA` · `REPROVADA_CLIENTE` · `EM ALTERAÇÃO` · `EM ALTERACAO` · `ARTE_EM_CORRECAO` |
| Com **todos** os modelos assim, o pedido inteiro conta como aprovado. | **Um** modelo assim já manda o pedido para Em Alteração. |

Qualquer outra palavra — `PENDENTE`, `AGUARDANDO`, `AGUARDANDO_CLIENTE`, as três que o ERP
grava hoje — não aprova nem reprova: o modelo apenas não conta como aprovado, que é o
comportamento certo para um modelo que ainda não passou pelo cliente.

---

## Duas coisas que mandam mais que a palavra

**1. O cliente abriu o link.** Registrado no primeiro gesto dele na tela. O pedido vai
para a Fila de Aprovação mesmo que a palavra ainda diga `AGUARDANDO`. O link **existir**
não conta — desde 31/08/2026 ele nasce junto com a arte pronta, e refazer a arte apaga o
registro da abertura anterior.

**2. `propostas.status_interno` com palavra de produção.** Ela tira o pedido da Lista de
Arte inteira: ele passa a ser trabalho da Lista de Impressão e conta só em **Pedidos
Concluídos**.

As palavras que tiram o pedido da arte (todas valem com e sem acento):

`EM PRODUCAO` · `PRODUCAO` · `EM IMPRESSAO` · `IMPRESSO` · `EM ACABAMENTO` ·
`REVISAO PRODUCAO` · `EXPEDICAO` · `EM TRANSITO` · `A RETIRAR` · `RETIRADO` · `ENTREGUE` ·
`FINALIZADA` · `FINALIZADO`

`CANCELADO` e `CANCELADA` também levam o pedido para Pedidos Concluídos, com o badge
❌ Cancelada.

> [!CAUTION]
> **`APROVADO` e `LIBERADO` NÃO tiram o pedido da arte.** São estados comerciais e juntos
> somam dois terços das propostas do ERP — 6.939 das 8.728 conferidas em 31/08/2026. Se
> qualquer um dos dois passasse a valer como "saiu da arte", a Lista de Arte esvaziaria: o
> pedido mais novo do dia costuma estar em `LIBERADO`. `REVISAO ATENDENTE` também fica de
> fora, porque o atendente revisa **antes** do cliente.

---

## O que o ERP escreve hoje

Contagem real do banco em 31/08/2026.

| Campo | Palavra gravada | Pedidos | Como o painel lê |
|---|---|---:|---|
| `pedidos_artes.status` | `APROVADO` | 56 | ✅ Aprovada |
| `pedidos_artes.status` | `EM ARTE` | 9 | 🎨 Em Arte |
| `pedidos_artes.status` | `AGUARDANDO` | 1 | 🎨 Em Arte |
| `pedidos_artes.status` | `APROVADO PARCIAL` | 3 | **não reconhecida** — cai em 🎨 Em Arte por omissão |
| `propostas.status_interno` | `AGUARDANDO / EM ARTE` | 1 | **não reconhecida** — fica na arte por omissão |
| `pedidos_artes.entrega_dados` | `APROVADO` / `ALTERADO` | 35 / 1 | conforme a tabela acima |

As duas linhas marcadas como não reconhecidas não quebram nada — o painel apenas
classifica o pedido por omissão, e não por regra.

---

## O conjunto que pedimos

Uma palavra por estágio, sem acento e sem ambiguidade. **Todas já são aceitas hoje** —
nada precisa mudar no Ideal Imposition para o ERP passar a usá-las.

| Estágio | Palavra | Quando gravar |
|---|---|---|
| 1 | `AGUARDANDO` | a arte entrou na fila do designer |
| 2 | `ENVIAR ARTE` | o designer terminou; falta mandar ao cliente |
| 3 | `AGUARDANDO_APROVACAO` | a arte foi ao cliente |
| 4 | `EM ALTERACAO` | o cliente pediu mudança |
| 5 | `APROVADO` | o cliente aprovou a arte |
| — | `entrega_dados` = `APROVADO` \| `ALTERADO` | campo separado, para os dados de entrega |

---

## Uma decisão que continua nossa

Se `APROVADO PARCIAL` deve continuar caindo em **Em Arte** ou ganhar tratamento próprio.
Enquanto não se decidir, o ERP pode continuar gravando a palavra — ela não quebra nada.

---

Listas de origem no `frontend/script.js`: `ARTE_COM_O_DESIGNER`, `ARTE_EM_APROVACAO`,
`ARTE_APROVADOS`, `ARTE_REPROVADOS`, `SINAIS_SAIU_DA_ARTE` e `SINAIS_CANCELADO`.
Documentação interna em `docs/lista_de_arte.md`.
