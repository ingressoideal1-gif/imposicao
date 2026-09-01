# Painel do Acabamento

> Menu criado em 20/08/2026, a pedido do usuário, para o setor que recebe o
> material **depois** da imposição e da impressão.

| | |
|---|---|
| Onde fica | `frontend/index.html`, seção `view-acabamento`, menu **Produção → Painel do Acabamento** |
| Quem desenha | [`frontend/acabamento.js`](../frontend/acabamento.js) |
| Banco | `pedidos_modelos.acabamento_status`, `.acabamento_responsavel`, `.acabamento_foto_url`, view `imposition_operadores`, as tabelas nossas `producao_volumes` (com `foto_url`; `peso_kg` virou espelho da soma) e `producao_volume_itens` (com `peso_kg` e `registrado_em`), e `propostas_os_setores.peso_real_kg` (do parceiro — ver REGRAS_BANCO). Só leitura: `produtos_proposta.peso_total` (o estimado) e `imposition_segredos.PESO_LIBERACAO_SEGREDO` (a senha semanal) |
| SQL | [`sql/painel_do_acabamento.sql`](../sql/painel_do_acabamento.sql) + [`sql/acabamento_foto_do_modelo.sql`](../sql/acabamento_foto_do_modelo.sql) + [`sql/acabamento_status_pronto.sql`](../sql/acabamento_status_pronto.sql) + [`sql/volumes_do_acabamento.sql`](../sql/volumes_do_acabamento.sql) + [`sql/pacotes_do_acabamento.sql`](../sql/pacotes_do_acabamento.sql) + [`sql/foto_do_volume.sql`](../sql/foto_do_volume.sql) + [`sql/volumes_por_registro.sql`](../sql/volumes_por_registro.sql) |
| Permissão | módulo **Painel do Acabamento** (`perm_acabamento_view` / `perm_acabamento_edit`) — **ver e editar ligados em todo perfil** desde 22/08/2026 (decisão do usuário); [`sql/acabamento_para_todos.sql`](../sql/acabamento_para_todos.sql) ligou nas grades que já existiam |
| Testes | [`tests/acabamento_harness.js`](../tests/acabamento_harness.js) + [`tests/test_painel_do_acabamento.py`](../tests/test_painel_do_acabamento.py) |

---

## Quem vê e quem edita

Todo perfil — e todo acesso local da estação — **vê e edita** o Painel do
Acabamento. Foi decisão do usuário em 22/08/2026 (*"deve aparecer e ser
editável a todos os usuários"*), depois de o menu não aparecer na estação por
mais que se marcasse a caixa na grade dos usuários do site.

São **duas grades**, e marcar numa não muda a outra:

- **Site** (sessão do Supabase): `imposition_user_permissions`, uma coluna por
  permissão. É a grade do card *Usuários → Permissões*.
- **Estação** (código local, sem sessão): `imposition_acessos_locais.permissoes`,
  um JSON gravado quando o acesso é criado ou troca de perfil. É a grade do card
  *Usuários → Acesso Local — NewProd*. O agente baixa a lista a cada 5 minutos;
  o painel reconfere o código no F5.

Chave que a grade local **não tem** — acesso gravado antes de um módulo existir,
que foi o caso de três operadores — segue o padrão do perfil em `ROLE_DEFAULTS`
(`permsDoOperadorLocal`, em `script.js`), em vez de valer "não". Chave presente
manda, inclusive quando diz "não": a grade é editável caixa a caixa. Testes:
[`tests/grade_do_acesso_local_harness.js`](../tests/grade_do_acesso_local_harness.js).

---

## O card do modelo, em três colunas

Refeito em 29/08/2026 a pedido do usuário. Cada modelo se lê da esquerda para a
direita, numa linha só:

| Coluna | O que traz | Largura |
|---|---|---|
| Foto | o botão **📷 Fotografar** numa faixa em cima, e a **janela da foto do material** abaixo dele | 180px |
| Amostra | a arte aprovada, para conferir contra o papel | elástica — sobrou espaço, é dela |
| Especificação | a hora do Revisado numa faixa em cima, e a tabela abaixo dela | estreita (280px) |

**O responsável e o Revisado ficam na barra de título**, lado a lado, no fim
dela.

### O que mudou em 29/08/2026, e por quê

O usuário pediu três coisas na mesma conversa: *"deixar apenas a opção de marcar
'pronto', que passaria a ser 'Revisado'"*; *"botão fotografar vai para a esquerda
do preview do modelo, com sua janela própria para mostrar a foto"*; e *"perde
muito espaço com as informações de título, poderiam ser quase todas na mesma
linha, drop do responsável pode ser menor e sem legenda, legenda pode ficar
dentro do próprio box, precisamos ganhar espaço vertical"*.

**A coluna das decisões saiu.** Eram quatro botões empilhados em 210 px —
Aguardando · Impresso · Em acabamento · Pronto —, e dois deles nunca foram
escolha deste setor: são derivados da impressão (ver *O estágio*). Sobrou uma
decisão de verdade, e ela virou um botão só, ao lado do **Responsável** que a
libera. Enquanto o seletor morava no alto da barra e os botões no pé da terceira
coluna, a tela precisava de um recado com uma seta ligando um ao outro; lado a
lado, o comando e a trava se explicam sozinhos.

**A foto tomou o lugar dela.** Era uma miniatura de 46 px encostada no botão, e
para ver o material era preciso ampliar. Numa janela do tamanho da amostra, do
outro lado dela, o revisor compara o que o cliente aprovou com o que está na mesa
**lado a lado** — que é o trabalho dele.

**E o card encolheu.** A barra de título perde 8 px de recheio; o seletor do
responsável fica menor e leva a palavra "Responsável" **dentro** da caixa, na
mesma linha do nome; e as legendas das janelas ("Foto do material", "Amostra
aprovada pelo cliente no link") saíram de baixo das molduras e entraram nelas,
sobre um degradê. Medido na tela: a barra caiu de 61 para 49 px, e o card de 408
para 392.

O ganho grande de altura, porém, não foi esse: foi o **box de peso sair de cima
dos modelos** (ver *O Resumo do pedido*). O primeiro modelo passou a começar a
162 px do topo, contra 380 antes — 218 px.

> [!NOTE]
> **As larguras cabem numa linha só.** 180 + 200 + 280, mais os dois vãos de 18,
> dão 696 dentro dos ~780 px úteis do corpo do detalhe. Quem decide a quebra é a
> soma dos `flex-basis`, e não os `min-width`. Estourar essa conta joga a última
> coluna para a linha de baixo, que é o rodapé que o desenho de 22/08 veio
> desfazer.

### As cores por estágio

O bloco de cada modelo **e** a linha do pedido na fila levam o fundo do estágio,
para ele se ler de relance sem procurar o selo:

| Estágio | Cor |
|---|---|
| Aguardando | `#003768` |
| Impresso | `#001249` |
| Em acabamento | `#000000` |
| Pronto | `#00471c` |

Estas cores **são ditadas pelo usuário** — os valores acima vieram dele em
22/08/2026, um a um — e não acompanham a paleta da tela: elas dizem estado, e
quem lê a tela lê primeiro isto. Já houve uma reversão por tê-las unificado com
a paleta; há teste travando cada uma.

**Cuidado ao mexer nas larguras.** As três colunas precisam caber numa linha só
dentro do corpo do detalhe (~780px úteis). Quem decide a quebra é a soma dos
`flex-basis` mais os dois vãos — 200 + 280 + 210 + 40 = 730 —, e não os
`min-width`. Estourar essa conta joga a coluna das decisões de volta para baixo,
que é exatamente o rodapé que este desenho veio desfazer.

---

## A tabela de especificação do modelo

Desenho pedido pelo usuário em 22/08/2026, com a imagem da tabela em mãos. Cada
modelo mostra, ao lado da amostra, uma tabela **ESPECIFICAÇÃO** — cabeçalho azul,
uma linha por informação, o rótulo à direita da primeira coluna e o valor na
segunda, **em negrito**:

| Linha | O que traz |
|---|---|
| Quantidade Total | a quantidade do modelo, com `un` |
| Numeração de | o intervalo `inicial a final`, numa linha só |
| Bloco | o tamanho do bloco, com `unidades` |
| **Numeração** | o nome da numeração — faltava no desenho, e o usuário pediu que entrasse |
| Cor | o nome da cor |
| Impressão | Frente ou FxVerso |
| Situação | o que a Produção diz: Impresso, Aguardando… |

O negrito nos valores é pedido dele: são as informações **variáveis**, as que o
operador confere contra o material na mesa. Falta de dado vira `—`, nunca meia
informação: sem o número final, a linha "Numeração de" não mostra intervalo
nenhum.

Numeração de mapa de teatro (`CAMAROTE`) troca as três primeiras linhas por
**Quadrantes**, **Lugares** e **Cadeira inicial**, porque ali não há numeração
inicial e final.

Antes eram oito quadradinhos numa grade que se reorganizava conforme a largura da
tela — ler "qual é o bloco deste modelo" exigia procurar o rótulo no meio dos
outros sete. Desenha `tabelaDeEspecificacao` e `linhaEspec`
(`frontend/acabamento.js`).

---

## O cabeçalho do pedido aberto

Pedido do usuário em 22/08/2026: *"ao abrir o pedido, no Painel de Acabamento,
destacar Número do pedido e Evento, como já aparece no pedido do Painel de
Produção"*.

O cabeçalho traz **VOLTAR**, o título do pedido e o contador de prontos — e nada
de faixa em volta: o `prod-table-header` saiu em 22/08/2026, a pedido do usuário
("sem box").

### Duas linhas, desde 23/08/2026

Pedido do usuário: *"vamos mostrar o título em 2 linhas, em cima número e Evento
(como já está) e na segunda linha com fonte 20% menor e em amarelo o Nome e
número do cliente"*.

```
21085 - Expointer 2026 - Parte 2          ← calc(2.2rem + 5pt), degradê claro
ANGELA BEATRIZ DA COSTA SALOMAO - 53193   ← 0.8em, #fbbf24
```

A primeira linha é a **mesma da tela de Pedido** (`ped-view-title`, que é para
onde o Painel de Produção leva ao abrir um pedido): número e evento separados
por ` - `, no mesmo tamanho de fonte, com o degradê do `.page-header-text h1`.
A segunda é o cliente, em amarelo e 20% menor. Quem monta as duas é o
`tituloDoPedidoHtml`, sobre o `tituloDoPedido` (linha de cima) e o
`clienteDoPedido` (linha de baixo).

O tamanho da segunda linha é `0.8em`, e não um valor em `rem`: assim ela
continua sendo 20% menor que a primeira mesmo que um dia o título inteiro mude
de tamanho.

O cliente vem do `rotuloDoCliente`, que já devolve "NOME - NÚMERO" — escrever o
número à parte faria a mesma pessoa aparecer de dois jeitos em duas telas. Linha
que não existe não é desenhada: pedido sem evento no briefing tem a primeira
linha só com o número, em vez de terminar num hífen solto.

> [!CAUTION]
> **A segunda linha precisa devolver o `-webkit-text-fill-color`, e isso não é
> decoração.** O `.page-header-text h1` pinta o texto com um degradê por
> `-webkit-background-clip: text` e `-webkit-text-fill-color: transparent`. Esse
> transparente é **herdado**, e o degradê do `<h1>` se recorta também no texto
> dos filhos: uma segunda linha só com `color: #fbbf24` sairia **cinza clara**,
> igual à de cima, com o amarelo todo certo no código e ninguém vendo amarelo na
> tela. É o que o `ESTILO_LINHA_DO_CLIENTE` resolve, e o que o
> `tests/titulo_do_acabamento_harness.js` mede num Chrome de verdade — inclusive
> desenhando ao lado o controle sem o `text-fill`, para a armadilha ficar
> visível na imagem `tests/_titulo_do_acabamento.png`.

> [!NOTE]
> A **tela de Pedido** ganhou a mesma forma no mesmo dia, com tamanhos próprios
> (a primeira linha 20% menor, a do cliente 30% menor — pedido do usuário, com
> os dois números medidos a partir do mesmo tamanho de referência). Ela é
> montada por `pintarTituloDaTelaDePedido`, no `script.js`, e cai na mesma
> armadilha do `-webkit-text-fill-color` descrita acima. Ver
> [`lista_de_arte.md`](lista_de_arte.md).

Duas miúdezas do degradê que custaram tempo e valem para quem for mexer:

- ele foi refeito inline terminando em `#cbd5e1`, e não no `#94a3b8` do CSS: com
  evento de nome longo o título ocupa duas linhas, e a segunda saía quase
  apagada;
- ele precisa ser `background-image`, nunca o atalho `background`: o atalho
  reescreve também o `background-clip`, e o título vira uma barra branca sólida
  em vez de texto pintado.

A ordem não é casual: quem trabalha no acabamento tem na mão o material de um
**evento**, não de um cliente — é por ele e pelo número que se confere, de
relance, que o que está na mesa é o deste pedido. O nome do evento vem de
`pedidos_artes.nome_evento` (`eventoDoPedido`), a mesma origem que a fila usa;
quando o briefing ainda não o tem, o campo **some** em vez de deixar um buraco.

Na **lista** de pedidos, o número continua no crachá grande
(`ESTILO_CRACHA_NUMERO`), igual ao da fila do Painel de Produção — lista com
lista, cabeçalho com cabeçalho.

---

## O status: um botão, e não quatro

Até 29/08/2026 cada modelo mostrava os quatro estágios lado a lado, numa grade de
quatro colunas de `1fr` — desenho pedido pelo usuário em 22/08/2026, quando o
seletor virou botões. Naquele dia ele pediu para *"reavaliar a possibilidade de
retirarmos os Status sem perder as funcionalidades existentes hoje"*, deixando
**apenas a opção de marcar "pronto", que passaria a ser "Revisado"**.

O levantamento mostrou que dava, e por quê: **dois dos quatro nunca foram escolha
deste setor**. "Aguardando" e "Impresso" são *derivados* do Painel de Produção
sempre que ninguém escolheu nada, e desde 21/08/2026 marcar "Aguardando" num
modelo já impresso nem gruda. Sobravam dois cliques com informação — "Em
acabamento" e "Pronto" —, e o primeiro já era respondido por outro campo da mesma
tela (abaixo).

**O botão fica na barra de título, à direita do Responsável.** Aceso, ele é o
carimbo de quem conferiu; clicar nele de novo **desmarca**, gravando vazio — e o
estágio volta a ser derivado da impressão, que é a verdade sobre o material.

**O status só se mexe depois do responsável** (regra do usuário, 22/08/2026).
Sem nome escolhido o botão fica travado, e o recado ao pé da barra diz
*"Escolha o **Responsável** ao lado para liberar o Revisado."* A seta saiu junto
com a distância: ela apontava para o alto porque o seletor estava longe, e seta
que aponta para o lugar errado é pior do que seta nenhuma. A trava vale também na
função (`mudarEstagio` confere antes de gravar): botão cinza não impede ninguém
de chamar pelo console, e essa é a única porta por onde o status é gravado.

### O que se perdeu com "Em acabamento", e quem responde por ele agora

Perdeu-se a possibilidade de **afirmar** que alguém começou a trabalhar num
modelo. Isso apagaria dois lugares da tela — o card de métrica *Modelos em
acabamento* e o filtro *✂️ Em acabamento* da lista —, que iriam a zero para
sempre.

A saída já estava na tela: **o responsável é obrigatório antes do Revisado**.
Modelo com nome escolhido e ainda não revisado **é** um modelo em cima da mesa, e
é assim que os dois passaram a contar (`emAcabamentoAgora`). A conta ficou mais
honesta do que a de antes, que dependia de o operador lembrar de um clique a
mais — a mesma ideia que já tinha resolvido o "Aguardando": deixar a tela
*derivar* o que ela consegue observar.

O selo da linha do pedido não mudou: `estagioDoPedido` já respondia "Em
acabamento" quando **algum** modelo estava em acabamento **ou** revisado, então o
pedido com pelo menos um revisado continua se anunciando igual.

### A hora em que o modelo foi revisado

Pedido do usuário em 23/08/2026: *"Modelos prontos devem indicar a hora em que
ficaram prontos"*. O modelo revisado mostra `🕒 Revisado às 14:32` — e
`🕒 Revisado em 22/08 às 14:32` quando não foi hoje. A data só aparece nos
outros dias porque o operador lê isto de pé na estação, quase sempre no mesmo
dia; ali ela só atrapalharia.

Desde 29/08/2026 ela mora na **faixa acima da tabela de especificação** — a faixa
que era do botão Fotografar. Ela é a régua daquela coluna e não pode sumir, e a
hora não tinha mais onde morar depois que a pilha de botões saiu.

**Quem escreve a hora é o banco**, não a tela: a coluna
`pedidos_modelos.acabamento_pronto_em` é carimbada pelo gatilho
`trg_carimba_acabamento_pronto_em` ([`sql/hora_do_pronto_no_acabamento.sql`](../sql/hora_do_pronto_no_acabamento.sql)). O
estágio é gravado daqui, da estação e mexido pelo ERP — um carimbo feito no
frontend deixaria buracos justamente nos modelos que a gráfica tocou pelo acesso
local. O gatilho **apaga** a hora quando o modelo sai de Revisado, e **não a
renova** quando alguém reclica no botão que já estava aceso (a tela repete essa
segunda regra no espelho otimista, para não piscar uma hora que o banco não vai
gravar).

Modelo marcado antes de 23/08/2026 não tem hora, e a migração não inventou uma:
`updated_at` muda a cada foto, responsável ou observação, e uma hora aproximada
seria lida como a de verdade. Esses cards simplesmente não mostram carimbo.

### O peso do setor antes do último Revisado

Pedido do usuário em 23/08/2026: *"ao marcar o último modelo como pronto deve
exigir indicar a informação do peso do setor que está pronto, só alterar status
após o peso real for indicado"*.

Quando o clique em **Pronto** é o que **fecha um setor** — ou seja, é o último
modelo daquele setor fora do Pronto —, o status **não é gravado**. Abre um popup
que pede o peso real daquele setor, com o estimado ao lado; só depois de o peso
entrar no banco é que o modelo vira Pronto (`concluirProntoPendente`). É o
momento certo de cobrar: o material está na mesa e a balança está do lado.
Depois disso o operador já foi para o próximo pedido.

A cobrança é **por setor**, e não pelo pedido: um pedido com Laser e PVC termina
o Laser primeiro, e é o peso do Laser que se pesa naquela hora.

O peso pode cair no popup da **senha de liberação** (acima de 5 % do estimado).
Nesse caso o Pronto continua pendurado: senha certa fecha o setor, senha errada
não fecha nada, e cancelar a senha traz o popup do peso de volta — em vez de
deixar o operador olhando um botão que não obedeceu, sem nada na tela dizendo
por quê.

**Três situações em que a trava não se aplica**, todas por não ter onde gravar o
peso — e trava sem saída é a coisa que esta tela não pode ter:

- o modelo não tem setor (`(sem setor)`): não existe linha de peso para ele na
  ficha do ERP;
- o setor **já tem** peso registrado;
- não há caminho para gravar (nem estação servindo a página, nem sessão do
  Vibe): ali o box de peso já diz "entre com a sua conta" e o campo nem existe.

A trava mora no `mudarEstagio`, que é a única porta por onde o
`acabamento_status` é gravado — botão cinza não impede ninguém de chamar a
função pelo console.

---

## O perfil "Acabamento", e quem pode ser responsável

Criado a pedido do usuário em 22/08/2026, para o **Acesso Local — NewProd**: é
pela estação que este setor entra na aplicação.

- **O que o perfil dá.** Ver e editar o **Painel do Acabamento**, e nada mais —
  nem a fila da impressora, nem o pedido, nem os cadastros. Está em
  `ROLE_DEFAULTS` (`frontend/script.js`); há teste travando as duas únicas caixas
  ligadas.
- **Onde ele abre o dia.** `ROLE_HOME.acabamento = 'view-acabamento'`. Sem essa
  linha o operador cairia no Painel de Produção, que ele não pode ver.
- **Quem aparece no seletor "Responsável".** Só os acessos locais **ativos** com
  esse perfil (`PERFIL_DO_RESPONSAVEL`, em `frontend/acabamento.js`). Antes o
  seletor listava todo acesso ativo — designers, impressores, o administrador —,
  e escolher o responsável virava procurar três nomes no meio de quinze.
- **O nome já gravado num modelo continua aparecendo**, mesmo que a pessoa não
  tenha (ou não tenha mais) o perfil: apagá-lo da tela faria o trabalho parecer
  sem dono, e o próximo operador regravaria por cima sem saber que houve alguém.
- **Quando ninguém tem o perfil**, o seletor diz o que fazer, na própria tela:
  escolher ✂️ Acabamento em *Usuários → Acesso Local — NewProd* e voltar em
  **ATUALIZAR** (que relê a lista de operadores).

O perfil é atribuído **na tela**, um acesso de cada vez, no seletor de perfil do
card *Acesso Local — NewProd*. Não há SQL de migração: quem é do setor é decisão
de quem administra, e trocar o perfil pela tela pergunta antes de reescrever a
grade daquele acesso.

---

## O que a tela é

Um **espelho do Painel de Produção**: mesmo layout, mesmos cards, mesmos
filtros, mesmas métricas ao lado, mesma tabela, mesma formatação. Lista os
pedidos com `status_interno` de produção — exatamente a mesma população da Fila
de Produção, porque é esse o material que chega ao acabamento.

Duas colunas falam de acabamento em vez de impressão, porque é o trabalho desta
tela:

| Coluna | Na Produção | No Acabamento |
|--------|-------------|---------------|
| Progresso | modelos impressos / total | modelos **prontos** / total |
| Status | Aguardando / Impresso | Aguardando / Impresso / Em acabamento / Pronto |

O botão de recorte no topo, que na Produção é "Impresso", aqui é **"Pronto"**:
pedido com todos os modelos prontos sai da fila de trabalho e só reaparece com
esse botão ligado. É a mesma regra, aplicada ao estágio seguinte.

### A coluna Frete traz o rastreio (25/08/2026)

Embaixo da logo da transportadora aparece o **número do conhecimento**, clicável,
que abre o rastreamento nos Correios. Pedido do usuário: *"quando já existir o
link do número de conhecimento do sedex, ao clicar abrir o rastreamento"*.

O código já existia em `propostas_os.codigo_rastreamento` e já virava link — mas
só na aba de Entrega do **link do cliente**. Quem posta o pacote é a gráfica, e
ela não o via em tela nenhuma: uma varredura por `codigo_rastreamento` no
`frontend/` devolvia um arquivo só.

Três decisões que valem conhecer:

- **Sem código, nada é desenhado.** Um traço embaixo da logo se leria como "sem
  rastreio", quando a verdade é "ainda não despachou" — e é o estado da maioria
  dos pedidos desta tela.
- **A consulta não é nova.** `propostas_os` já era lida no
  `loadOrdensFromVibecode` pelo prazo de entrega; bastou pedir mais uma coluna.
  Uma segunda ida ao banco por um campo de treze caracteres seria desperdício num
  painel que abre com milhares de pedidos.
- **O clique não abre o pedido junto.** A linha inteira da tabela é clicável, e o
  link traz `event.stopPropagation()`. Sem isso, tocar no código abriria o
  rastreamento *e* o pedido ao mesmo tempo.

Quem monta o link é `rastreioHtml()`, em **`frontend/logo-do-frete.js`** — o
módulo que esta tela e o link do cliente já carregam. Ele mudou de casa nesse dia
(vinha do `cliente-dados.js`) para que as duas telas não montassem o endereço dos
Correios cada uma por si.

## O que a tela não é

**Não fala com o motor de imposição nem com o agente local.** Não impõe, não
gera PDF, não imprime, não escolhe formato, saída, cor, numeração nem verso, e
não pergunta a versão do NewProd. A coluna de métricas do Acabamento não tem o
bloco de versão do agente que a da Produção tem no rodapé — ele é do agente.

Isso é medido, e não só combinado: o harness varre o `acabamento.js` inteiro
atrás de `/api/impose`, `API_BASE_URL`, `127.0.0.1:9000`, `runImposition` e
companhia, e a suíte de Python varre a marcação da seção atrás de botão de
imprimir e de campo digitável.

### O que fica de fora: pedido encerrado como teste

Proposta com `propostas.encerrado_teste_em` preenchido **não aparece** — nem na
tabela, nem nas métricas, nem no badge do menu. É o carimbo de "isto foi um
teste, pode sumir", e o usuário pediu esse recorte em 20/08/2026.

A leitura é uma consulta **própria** desta tela (`carregarEncerradosComoTeste`),
pelo mesmo motivo da leitura do estágio: o `loadOrdensFromVibecode` do
`script.js` pede colunas nomeadas de `propostas` e alimenta o Painel de Produção
e a Lista de Arte. Uma coluna que sumisse ali derrubaria as três telas; aqui,
não derruba nenhuma. O filtro é do lado do banco (`.not('encerrado_teste_em',
'is', null)`) e só volta o número do pedido — eram doze linhas quando isto foi
escrito.

**Falhar a leitura não esconde ninguém.** Sem resposta do banco, o conjunto fica
vazio e a fila aparece inteira — o comportamento de antes deste recurso.
Esconder por engano é o erro caro: o pedido some da tela de quem trabalha nele.

Nas outras telas — Painel de Produção e Lista de Arte — esses pedidos continuam
aparecendo. O recorte é só daqui.

## O botão "Expedição" é o arquivo desta bancada (01/09/2026)

Ele é a lista do que **esta bancada já entregou**, e não uma tela de trabalho.
Duas coisas mudaram nele no mesmo dia, a pedido do usuário: *"o botão EXPEDIÇÃO
deve mostrar os 30 últimos mas deve disponibilizar todos os pedidos quando
pesquisado"*.

### Ele vê também o que já embarcou

Até aqui a régua era `ehExpedido` — `status_interno` igual a `EXPEDICAO`, e nada
mais. Bastava a expedição embarcar o material para o ERP trocar por `EM TRANSITO`
e o pedido sumir daqui: **o comprovante do trabalho se apagava justamente quando
o trabalho terminava**.

Agora vale o `jaPassouDaGrafica` inteiro — `EXPEDICAO`, `EM TRANSITO` e
`ENTREGUE`.

> [!IMPORTANT]
> Isso **não** afrouxa a regra de 27/08/2026. As palavras dela são *"devem sair
> da **tela inicial** dos painéis"*, e a tela inicial é Geral, Para Hoje e
> Atrasados — de onde os três status continuam saindo, e onde o harness continua
> travando isso. O botão "Expedição" é uma tela que o operador abre de
> propósito para procurar o que despachou; nunca foi a tela inicial.

### E pagina de 30 em 30

Como o card "Pedidos Concluídos" da Lista de Arte e o botão "Impresso" da
Produção — as três listas de arquivo do sistema. O tamanho da página e o desenho
do rodapé vêm do `script.js` (`HISTORICO_POR_PAGINA` e `desenharRodapeDePaginas`),
e não de uma cópia aqui: três telas do mesmo sistema com três tamanhos de página
seria pior do que não paginar.

**O recorte é o último passo** — filtrar, ordenar, só então cortar. Por isso o
contador do topo continua dizendo quantos pedidos a busca achou na expedição
inteira, e a pesquisa alcança o pedido que está na página 8. Trocar a busca ou um
card de setor volta para a primeira página.

As telas de trabalho continuam inteiras: o operador precisa ver de uma vez tudo
o que tem pela frente.

## Os cards de setor somam

Clicar num card de setor **liga ou desliga** aquele setor, e a lista mostra a
**soma**: entra o pedido que tenha item em qualquer um dos setores acesos. Dois
cards acesos listam os dois conjuntos juntos; clicar de novo num card aceso tira
só aquele; **Todos os Setores** limpa a escolha inteira.

Soma, e não interseção. Interseção pediria um pedido com item nos dois setores
ao mesmo tempo — raro, e não é o que o operador quer ver quando pede "Flexo e
PVC juntos". Pedido do usuário em 21/08/2026, para as duas telas ao mesmo tempo:
a mesma mudança está no Painel de Produção.

O recorte é **de cada tela**: o Acabamento guarda em `tela.setores` e a Produção
em `state.filtroSetores`, e um não mexe no outro. Cada card diz de quem ele é
pelo `data-setor` — antes o código procurava o nome dentro do `onclick`, o que
deixou de funcionar com vários acesos ao mesmo tempo.

A linha *"Clique em mais de um setor para somar os pedidos"*, embaixo da grade,
existe porque a soma não se descobre olhando: um card aceso e outro apagado
parecem exatamente a tela de antes.

### E recortam o pedido, não só a lista

Regra do usuário em 27/08/2026: *"ao selecionar o filtro por setor, deve levar em
consideração apenas o setor selecionado"*. O exemplo dele: um pedido com **Laser
e Têxtil**, o card **Laser** aceso e o Laser todo pronto mostra **Pronto**, mesmo
com o Têxtil ainda na bancada.

Até aqui o card era filtro de **linhas**: escolhia quais pedidos apareciam, e
tudo o que a linha dizia continuava sendo do pedido inteiro — o exemplo acima
saía como "Em acabamento", que é o oposto. Agora, com card aceso, a linha fala só
do recorte: **selo, barra de progresso, contagem de itens, quantidade e
ordenação**. Com dois cards, o recorte é a união dos dois. Sem card nenhum, a
linha volta a falar do pedido inteiro.

O recorte se anuncia onde age: a célula do progresso ganha `◧ LASER` embaixo da
barra, e o selo explica no `title` que aquele estágio é do setor. Sem isso a
mesma linha diria "1/1 mod. · 100 %" com o card aceso e "3/8 mod." sem ele, e o
operador leria o pedido inteiro como pronto.

O mesmo recorte corrigiu um defeito **anterior** a ele, no cruzamento com o
filtro de Estágio. As duas cláusulas eram independentes: a de setor perguntava
"tem item em Laser?" e a de estágio, "tem *algum* modelo Pronto?", sem exigir que
fosse o mesmo modelo. Com *Laser* e *Pronto* acesos entrava na lista o pedido
cujo Laser estava aguardando e cujo Têxtil estava pronto — uma afirmação que não
era verdade em setor nenhum. Hoje o estágio pergunta pelos modelos do recorte.

**As três bordas da regra**, decididas com o usuário na mesma conversa:

1. **A Expedição continua sendo do pedido inteiro.** Um setor não se despacha
   sozinho, e `pedidoProntoParaExpedicao` continua exigindo todos os setores. O
   recorte muda o que a linha *diz*, nunca o que o pedido *é* para a expedição.
2. **Modelo sem setor some do recorte.** Não há pílula "(sem setor)" na lista —
   ele só volta a ser contado quando nenhum card está aceso. Isso não é raro: 43
   dos 68 produtos do catálogo do parceiro não têm `setor_pcp`, porque são itens
   de estoque e revenda, que a produção não enxerga por definição. Por isso a
   tela vazia sob um recorte diz que o botão **Todos os Setores** devolve o que
   sumiu, em vez de parecer que não há trabalho.
3. **As métricas laterais e o alerta de atraso contam a fila inteira.** Elas
   medem trabalho a fazer, e trabalho a fazer não muda porque o operador filtrou
   a vista.

### De onde sai o setor de cada modelo

A lista é desenhada com `modelosGlobais`, e essa consulta **não traz setor
nenhum** — o recorte precisou de uma fonte. `pedidos_modelos.setor` existe no
banco e seria o caminho óbvio, mas estava preenchida em **105 das 355** linhas
quando isto foi escrito: filtrar por ela esconderia 70 % dos modelos.

A fonte é `pedidos_modelos.id_produto_proposta_origem` (**355 das 355**
preenchidos), que fecha a cadeia que o detalhe do pedido sempre usou:

```
pedidos_modelos.id_produto_proposta_origem
    -> produtos_proposta.id
    -> produtos.setor_pcp
```

O último salto não custa consulta: o `script.js` pré-carrega os produtos da
proposta de **todos** os pedidos em `state.osItens`, com o setor já resolvido e o
id da linha em `_vibe_produto_id`. A coluna nova pega carona na consulta de
estágio que a tela já fazia — uma coluna a mais, nenhuma requisição a mais —, e
não foi acrescentada ao `carregarModelosGlobais` do `script.js` justamente para
não deixar o Painel de Produção refém desta tela.

## O pedido aberto

Clicar numa linha **não** abre a Imposição: abre, no lugar da lista, a mesma
listagem de modelos separada por produtos que o Portal do Pedido desenha — uma
caixa por produto, com nome real e selo do setor PCP, e dentro dela uma linha
por modelo. O botão **VOLTAR** devolve a lista.

A caixa de cada modelo tem **três andares**, refeitos em 21/08/2026 a pedido do
usuário (a versão anterior empilhava tudo numa coluna só, "muito mal
distribuída" nas palavras dele):

1. **Topo — quem.** Bolinha da cor, nome, código e selo do estágio à esquerda;
   à direita, o seletor do **Responsável** (era o botão da foto até 26/08/2026;
   ver *O rearranjo de 26/08/2026*).
2. **Meio — o quê.** A amostra de um lado e os dados do outro, **metade a
   metade** (pedido de 20/08/2026; em tela estreita as metades empilham). Os
   dados vão numa grade alinhada em colunas, centrada na altura da amostra.
3. **Base — a decisão.** *Status do acabamento* e *Responsável*, numa faixa
   própria mais escura, separada por fio. São os dois únicos campos que esta
   tela escreve, e é onde o olho cai.

A ordem conta a história do trabalho; o fundo do card inteiro continua dizendo o
estágio (ver *A cor por status*).

Tudo em somente leitura. O que na Produção é `<input>` ou `<select>` aqui é
texto: código do modelo, nome, bolinha da cor com o nome dela, Qtd, Nº Inicial,
Nº Final, Bloco, Numeração, Verso e o status de impressão. Em modelo de
CAMAROTE, `Q_CAM`, `L_CAM` e `C_INI` no lugar de Qtd/NI/NF.

### A amostra

Cada modelo mostra, em bom tamanho (até 320 px de altura, clicável para
ampliar), **a amostra que foi enviada ao cliente pelo link** — a imagem composta
de cor + arte + numeração que ele aprovou. É o que o revisor compara com o papel
que saiu da impressora.

A origem é `pedidos_modelos.amostra_arte_base64` **quando ela é um render do
bucket `amostras_renderizadas`** (o campo guarda duas coisas: a arte do modelo e,
quando existe snapshot, a URL da prévia composta). Sem snapshot, vale
`arte_url`, e a legenda muda de "Amostra aprovada pelo cliente no link" para
"Arte do modelo" — a tela não chama de aprovado o que não foi.

As imagens desta tela seguem o padrão das outras janelas de imagem do projeto:
**sem chapa branca atrás, sem canto arredondado e sem fio de contorno**, e
**centradas na altura** da caixa. A arte traz o próprio fundo, e a moldura em
volta recortava um retângulo no meio da caixa escura. Vale para a amostra, para
a miniatura da foto do material e para a imagem ampliada. Há teste varrendo cada
`<img>` do arquivo atrás de `border-radius` e de fio.

Amostra que só existir em PDF sai como atalho 📄 que abre o arquivo.
**Rasterizar a arte do cliente está fora de cogitação neste projeto**, aqui como
em qualquer outro lugar dele.

O lightbox é próprio, de vinte linhas, e não o `openClienteLightbox`: aquele
mora no `cliente.js`, que o painel da gráfica não carrega. Chamá-lo daqui seria
um clique que não faz nada — e ampliar é justamente o que faz a amostra servir
para conferir a impressão.

### Clicar no menu volta para o começo

Abrir a tela pelo menu **sempre** traz a lista, mesmo que um pedido tenha ficado
aberto na visita anterior. Antes disso, quem abria o pedido 123, saía para outra
tela e voltava pelo menu reencontrava o detalhe do 123 — sem topo, sem filtros e
sem lista —, e precisava achar o botão VOLTAR para chegar onde o menu prometia
levá-lo. Pedido do usuário em 21/08/2026.

O `aoAbrir()` fecha o pedido e **desliga a câmera** junto: ela pertence ao
detalhe, e deixá-la ligada manteria a webcam acesa atrás de uma tela que sumiu.

### Os botões de setor, acima do número do pedido

Pedido do usuário em 29/08/2026: *"adicionar um drop seletor, para que sejam
visualizados apenas os modelos do setor que está visualizando"* — e, logo em
seguida, *"melhor colocar botões seletores, mostrando setores selecionados"*.

São os **mesmos botões da fila**: mesma forma, mesma cor de aceso, e **somam**
quando se clica em mais de um. O gesto já é conhecido da lista; repeti-lo aqui
não pede aprendizado nenhum. Ficam acima do número do pedido, que é onde ele
aparece na fila também.

Os quatro setores da casa aparecem **sempre**, na ordem do `SETORES_DO_BANCO`,
com quantos modelos deste pedido cada um tem. Setor que o pedido não usa fica
apagado e sem clique, em vez de sumir: sumindo, a fileira mudaria de tamanho de
pedido para pedido e o olho perderia a referência — e a conta ao lado do nome
diz, antes do clique, o que há lá dentro.

**Escolher um setor recorta a tela inteira do pedido**: os modelos desenhados, o
progresso, a quantidade, os setores e o bloco de peso passam a ser só daquele
setor, e o resumo se anuncia com **◧ SÓ LASER**. É a mesma regra que os cards da
fila já aplicam à lista (ver *E recortam o pedido, não só a lista*).

O recorte é **leitura desta visita**: abrir ou fechar um pedido o zera. E ele
limpa a escolha de modelos para volume junto — um modelo marcado que sumiu da
tela continuaria contando na barra da escolha sem ninguém poder desmarcá-lo.

**O que NÃO entra no recorte é a expedição** (abaixo).

---

## O Resumo do pedido, fixo à direita

Pedido do usuário em 29/08/2026: *"dentro do pedido vamos retirar o painel com as
métricas do dia e os estágios do acabamento; em seu lugar vamos passar para a
lateral direita um painel redesenhado e melhorado do box de pesos por volume e o
encaminhar à Expedição, um painel resumo do pedido, fixo na tela"*.

A coluna da direita tem **duas moradoras, e nunca as duas juntas**: com a lista
aberta, as *Métricas do Dia*; com um pedido aberto, o *Resumo do pedido*. Quem
troca as duas é o `mostrarLista()`.

O que havia antes respondia sobre outra coisa: as métricas falam da **fila
inteira**, e dentro de um pedido elas não respondem nada. E o peso e a expedição
moravam numa faixa larga **acima dos modelos**, que rolava junto com eles — quem
estava no terceiro modelo já não via nenhum dos dois.

O resumo traz, de cima para baixo:

1. o **progresso** (`24/52 revisados`) e a barra, que saíram do cabeçalho: ter o
   mesmo número em dois lugares, a dois palmos um do outro, só confundiria;
2. a **ficha** — prazo, modelos, quantidade, setores e frete;
3. **⚖️ Peso e volumes**, um card por setor, empilhados: a coluna tem 288 px, e
   os cards de 340 px da faixa antiga não cabem lado a lado ali;
4. o **rodapé**, preso embaixo, com o **📦 ENCAMINHAR À EXPEDIÇÃO**.

Os ids dos campos do peso são os mesmos de antes (`acab-peso-*`), de propósito:
é por eles que o `pintarPesos` devolve o valor gravado a cada desenho.

#### Dois caminhos, porque a estação não tem sessão

A tabela tem RLS e as quatro políticas são de `authenticated`. O operador da
estação entra pelo código de acesso local, **sem sessão do Supabase** — para o
banco ele é `anon`, e para `anon` aquela tabela devolve `[]` com HTTP 200: vazia,
sem erro nenhum. Foi medido com a chave pública em 21/08/2026.

Esse é o pior jeito de falhar que existe: não há erro para mostrar. O operador
digitaria o peso, veria o campo aceitar o número, e nada teria sido gravado.

E é justamente ali que o peso é digitado — o usuário decidiu no mesmo dia que a
digitação do peso e a escolha dos drops seriam feitas **pelo acesso local no
agente**. Então há dois caminhos, e quem escolhe é **quem serviu a página**:

| Onde | Caminho |
|---|---|
| **Estação** (agente na 9000 ou localhost) | `/api/peso-setores/<pedido>`, `/api/setor-concluido/<pedido>`, `/api/expedicao/<pedido>` e `/api/senha-liberacao/conferir` do agente → Edge Function `acesso-estacao` com o `ACESSO_AGENTE_SEGREDO` → `service_role` |
| **Site, com login do Vibe** | direto no PostgREST, que é o que a sessão autoriza |
| **Site, sem login** | o box mostra os setores e a frase que resolve: entrar com a conta |

É o mesmo desenho do catálogo de fontes, e pela mesma razão: a `service_role`
nunca vai para as estações — ela abre cliente, proposta e financeiro do parceiro.

A regra de gravação mora **uma vez só**, em
[`supabase/functions/_compartilhado/pesos.ts`](../supabase/functions/_compartilhado/pesos.ts).
O agente não valida nada por conta própria: converter a vírgula e conferir a
lista de setores nos dois lugares criaria duas verdades, e a que vale é a do
servidor, que conhece o `CHECK` da tabela.

São **cinco** as chamadas ao agente em toda a tela — o peso, o carimbo do setor,
o envio para a expedição, a conferência da senha de liberação (a única que não é
da ficha: ver a seção seguinte) e, desde 24/08/2026, a **balança** da estação.
Impor, gerar PDF, imprimir e perguntar a versão do NewProd continuam fora; há
teste contando as rotas e exigindo que exista **um único** `/api/` no arquivo.

`propostas` passa pela mesma porta, e não porque precise: hoje a política
`Enable read access for all` daquela tabela é ALL/public/true, então a chave
anônima escreve nela. A rota existe assim mesmo para que o caminho da estação
seja **um só** — no dia em que aquela política for fechada, a expedição não cai
junto.

### A balança, lida pelo agente (24/08/2026)

Pedido do usuário: *"No painel do acabamento, na edição do pedido para o modelo,
nós utilizamos a webcam para tirar foto. Também utilizamos uma balança para medir
o peso. Precisamos fazer a leitura da balança para que o peso seja preenchido
automaticamente no campo peso."*

O modelo é uma **Urano CP 3/0.5 POP** — 3 kg de capacidade, divisão de 0,5 g. Um
botão **⚖** ao lado dos campos de peso da tela (o peso de cada setor, o "Peso na
balança" da janela do registro — e o de cada linha, quando se pesa um a um — e a
janela do peso que fecha o setor) lê a
balança e preenche o campo. O valor preenchido segue o caminho de sempre: a régua
dos 5 %, a senha de liberação, a mesma gravação. Digitar à mão continua valendo.

#### O protocolo, do manual da Urano

Manual de operação da linha CP POP, item 11.13.2 (senha 191249):

- **9600 bps, 8 data bits, sem paridade, 2 stop bits.**
- O computador pede o peso mandando **um byte** (`0x04` ou `0x05`), e a balança
  responde um quadro só:

  ```
  [sinal][estável] DD/MM/AA _ <descrição, 20 caracteres> _ TTTTTTg _ LLLLLLg
    __ MMM,MMMg _ PPPPPP <CR><LF><CK><CK>
                             tara      líquido   peso médio   peças
  ```

- O **peso líquido vem em gramas**, seis dígitos; os campos da tela são em quilos.

Duas leituras do quadro são deliberadamente frouxas, e o
[`balanca.py`](../balanca.py) explica por quê: o sinal e a marca de estável são
lidos como **conjunto** (o desenho do manual não diz qual dos dois vem primeiro,
e apostar errado daria um peso "sempre instável" sem nada que explicasse), e o
**checksum não recusa o quadro** (ele é mostrado no diagnóstico; recusar por ele
transformaria uma balança que funciona numa que nunca lê).

#### Por que a leitura é do agente

Porta serial no navegador só existe com **WebSerial**: Chrome, e com permissão
concedida à mão em cada máquina. Nenhuma solução deste projeto pode depender de
configurar navegador — cada estação usa um diferente. Então o agente lê a porta, e
o painel pergunta a ele por `/api/balanca/peso`, do mesmo jeito que já pergunta o
peso por setor. **O botão não existe no site**: a balança está numa mesa, ligada a
um computador, e botão que não faz nada é pior que botão nenhum.

A porta escolhida fica em `balanca_config.json`, ao lado do executável, como o
`print_configs.json` — em qual porta COM a balança está é propriedade física
daquela máquina, e a escolha sobrevive à atualização do agente.

#### Quando não achar a balança, a tela diz o que fazer

As três rotas (`/api/balanca/peso`, `/api/balanca/portas`, `/api/balanca/porta`)
respondem **HTTP 200 mesmo sem achar balança**, com `ok: false`, `motivo` e
`comoResolver`. Não achar balança quase nunca é defeito:

- na CP POP a saída de dados é **opcional de fábrica** — o conector serial RJ45 e
  o USB são acessórios, e sem um deles não há o que ler;
- mesmo instalada, a saída precisa ser **ligada no teclado da balança**: `FUNÇÃO`
  `8`, senha `191249`, opção **"Tipo 1"** (responde ao computador). "Deslig"
  também é uma das opções.

Nada disso o operador adivinha, e um 502 chegaria à tela como "erro interno"
escondendo justamente a parte útil. Por isso a falha abre uma caixa com o motivo,
os passos do teclado, e o **"Procurar a balança nas portas deste computador"** —
que lista cada porta COM da máquina, o que ela respondeu e quanto está marcando,
para conferir contra o visor. É a saída na própria tela, como toda trava daqui
precisa ter.

### O peso estimado, e a senha que libera a divergência

Pedido do usuário em 21/08/2026, depois do peso real: cada setor mostra, ao lado do
campo, o **peso estimado** — `est. 4,160 kg` — e, com peso digitado, a divergência
em porcentagem (`· +8,2%`, em âmbar acima de 5 %). Desenho completo em
[`docs/superpowers/specs/2026-08-21-peso-estimado-e-senha-de-liberacao-design.md`](superpowers/specs/2026-08-21-peso-estimado-e-senha-de-liberacao-design.md).

**De onde vem o estimado.** O ERP não guarda peso por setor; guarda por linha da
proposta: `produtos_proposta.peso_total` é coluna gerada (`peso_uni × qtd`), em
**gramas**, e `peso_uni = peso_base + peso_extra` (o `peso_base` vem de
`produtos.peso`). O setor é o `setor_pcp` do produto — a mesma origem dos cards.
Então o estimado do setor é a **soma de `peso_total` das linhas do pedido daquele
setor, ÷ 1000**. É leitura pública, feita na tela nos dois caminhos, sem rota nova.
Setor sem linha com peso mostra `est. —`. `propostas.peso` existe, mas está vazia em
todas as propostas — não é fonte.

**A regra dos 5 %.** `|real − estimado| / estimado` até 5 % **inclusive** grava
como sempre. Acima disso a gravação fica **pendente** e abre o popup *Peso fora do
esperado*, com o digitado, o estimado e a divergência, e o campo da **senha de
liberação**. *Cancelar* devolve o valor anterior ao campo (nada foi gravado);
senha errada avisa e continua no popup; senha certa grava pelo caminho de sempre
(estação → agente; site → PostgREST). Sem estimado não há com o que comparar, e o
peso grava direto. A regra mora na tela, como a conferência da expedição; o
servidor confere **só a senha**. Não se registra quem liberou — não foi pedido.

**A senha.** 1 letra + 2 números (ex.: `K47`), **derivada** — HMAC do segredo
`PESO_LIBERACAO_SEGREDO` (em `imposition_segredos`, sorteado dentro do banco em
21/08/2026) com a **semana** no fuso de São Paulo. Muda sozinha toda segunda-feira
00:00; ninguém gera nada e não existe tabela de senhas. Módulo único:
[`supabase/functions/_compartilhado/senha_liberacao.ts`](../supabase/functions/_compartilhado/senha_liberacao.ts).

| | |
|---|---|
| **Aparece** | menu **Usuários** (Administração), card *Senha de liberação de peso*, com a semana de validade. Quem vê: quem pode ver aquele menu (`perm_admin_view`/`perm_admin_edit`). `GET painel/api/senha-liberacao` |
| **Confere (site)** | `POST painel/api/senha-liberacao/conferir` `{senha}` → `{confere}`; exige sessão |
| **Confere (estação)** | agente `POST /api/senha-liberacao/conferir` → `acesso-estacao` com o segredo do agente → `{confere}` |

A senha **nunca desce para a tela do operador**: a tela manda o que foi digitado e
recebe sim ou não. O endereço das rotas continua montado num lugar só (`urlDeApi`),
com um único `/api/` no arquivo — a rota nova entra na lista que o harness confere.

### O botão da expedição, no rodapé do Resumo

Ele **não** fica escondido quando o pedido não está pronto, e isso é de
propósito: apagado e clicável, ele responde o que falta. Escondido, o operador
ficaria procurando um botão que a tela não mostra.

E ele **não entra no recorte por setor**. A expedição é do pedido **inteiro** —
um setor não se expede sozinho —, então com um setor aceso o botão continua
falando dos modelos todos. Sem aviso, o operador leria "3 de 3 revisados" no
resumo e não entenderia por que o botão segue apagado: por isso, e só quando há
recorte na tela, a linha *"a expedição é do pedido inteiro"* aparece logo acima
dele.

### O pedido expedido continua na lista de PRONTO

> "ao clicar e enviá-lo para a Expedição, ele deve ir para a lista de 'PRONTO'"
> — usuário, 23/08/2026, olhando o pedido 21030

Até aí o pedido **sumia da tela** no instante do envio: `EXPEDICAO` não passa no
`ehDeProducao`, o pedido saía do recorte, e o operador clicava, a tela voltava
para a lista e o trabalho dele não estava em lugar nenhum.

Agora `EXPEDICAO` entra no recorte da **lista** — e só dela. Quem faz isso é o
`pedidosDoPainel`, separado do `pedidosEmProducao` de propósito:

| | `pedidosEmProducao` | `pedidosDoPainel` |
|---|---|---|
| A tabela | | ✅ |
| PEDIDOS EM FILA, o número do menu, o alerta de atraso | ✅ | |

A razão é simples: as métricas contam **trabalho a fazer**, e pedido que já saiu
do setor não é mais trabalho. A lista é onde o operador procura o que ele acabou
de mandar.

**Onde ele aparece.** Na "lista de PRONTO" — o botão de recorte `Pronto`, que
existe justamente porque pedido com todos os modelos prontos sai das outras
listas. Isso não mudou; o que mudou é que o expedido agora chega lá em vez de
desaparecer. Ele vai marcado com **📦 NA EXPEDIÇÃO** embaixo do número, para não
se confundir com um pedido pronto que ainda está na bancada esperando o envio.

**Aberto**, o botão vira comprovante: **📦 NA EXPEDIÇÃO — já entregue, sai da
lista ao embarcar**, sem oferecer enviar de novo. E o aviso do envio diz onde
reencontrá-lo.

**A lista não incha.** Assim que a expedição embarca, o ERP troca o status para
`EM TRANSITO` e o pedido sai daqui sozinho. Em 23/08/2026 havia 11 pedidos em
`EXPEDICAO`, todos dos últimos quatro dias, contra 7 em `EM TRANSITO` e 4 em
`ENTREGUE` — a bandeja se esvazia sozinha.

### O CONCLUIDO de cada setor, que não depende do botão

Assim que o **último modelo de um setor** fica "Pronto", a linha daquele setor
recebe **`CONCLUIDO`** em `propostas_os_setores.status_producao` — mesmo com os
outros setores ainda trabalhando. É o que permite ao ERP ver o Laser fechado
enquanto o PVC continua.

E o contrário também: se alguém marcar "Pronto" por engano e corrigir, o setor
volta para **`EM ACABAMENTO`**, que descreve a verdade — o material está na mesa
de novo. Esse desfazer é **estreito de propósito**: só acontece quando o valor
atual é exatamente `CONCLUIDO`. Qualquer outra coisa ali foi o ERP quem pôs, e
não se toca.

Falha no carimbo **não desfaz a escolha do operador**: o estágio já está gravado,
e o carimbo é consequência. O aviso diz as duas coisas — *"O estágio foi gravado,
mas não deu para marcar o setor Laser como concluído"*.

### Os dois únicos controles

Por modelo, dois controles — na **barra de título** do card, desde 29/08/2026 —
e nada mais é editável:

1. **Revisado** — um botão que alterna. Aceso grava `'Pronto'` em
   `pedidos_modelos.acabamento_status`; apagado LIMPA a coluna, e o estágio
   volta a ser derivado da impressão.
2. **Responsável** — os operadores de acesso local da gráfica, por nome. Grava
   em `pedidos_modelos.acabamento_responsavel`.

Os dois gravam na hora, direto no Supabase, pelo mesmo caminho que o painel já
usa para o `status_impressao`. A tela anda na frente do banco de propósito — o
operador não espera a rede para ver a própria escolha — e um aviso aparece se a
gravação falhar.

Quem tem só **VER** do módulo encontra os dois seletores travados; alterar exige
o **EDITAR**.

### A foto do material

Cada modelo tem uma **coluna própria para a foto**, à esquerda da amostra
(29/08/2026): o botão **📷 Fotografar** numa faixa em cima, e abaixo dele uma
janela do tamanho da amostra. Assim o revisor compara o que o cliente aprovou com
o que está na mesa **lado a lado**, sem ampliar nada — antes a foto era uma
miniatura de 46 px encostada no botão, numa faixa acima da especificação, e para
vê-la era preciso ampliar.

O botão abre a webcam da estação numa janela, com *Fotografar*, e depois
*Repetir* ou *Salvar foto*. A foto vai para o Storage e o endereço dela fica em
`pedidos_modelos.acabamento_foto_url`; ela preenche a janela, o texto do botão
vira *Refazer*, e ela amplia no mesmo lightbox da amostra. Sem foto, quem diz isso é o **próprio rótulo do botão** — a frase
"Nenhuma foto do material ainda" saiu em 26/08/2026, porque na faixa cabe uma
linha só. O rótulo "Foto do material" segue existindo, no `title` do botão e da
miniatura, e o harness confere os textos. Refazer grava um
arquivo novo e troca a URL — o anterior fica no bucket, porque apagar
arriscaria remover a foto que outra estação acabou de tirar.

A imagem é reduzida para 1600 px no lado maior e salva em JPEG a 85%: chega para
ler tipografia miúda numa credencial e mantém o arquivo em algumas centenas de
KB, que a estação sobe sem o operador esperar na frente da tela.

**Onde a foto é guardada, e por quê ali.** No bucket `artes`, prefixo
`acabamento-fotos/`. Bucket novo com escrita anônima **já foi tentado neste
projeto e não funcionou** — `sql/criar_bucket_previews.sql` começa com "NÃO
EXECUTE ESTE ARQUIVO" e registra a tentativa. O `artes` já tem INSERT, UPDATE e
SELECT liberados para a chave pública, conferido política por política antes de
escrever isto. Há teste travando o bucket e o prefixo.

**As duas coisas que mordem na webcam**, e o que a tela faz com elas:

1. **Contexto seguro.** A câmera só abre em `https://…` ou em `127.0.0.1`. O
   painel servido por IP da LAN em `http://` não vale, e o navegador nem
   pergunta: `navigator.mediaDevices` simplesmente não existe.
2. **Permissão.** A câmera pede autorização uma vez por navegador e endereço, e
   negada não há como pedir de novo por código.

Para os dois casos a tela oferece a mesma saída, escrita nela mesma e **sem
depender de configurar navegador nenhum**: **🗂️ Escolher arquivo**. No celular
isso abre a câmera do aparelho; no computador, o seletor de arquivos. A imagem
entra pelo mesmo caminho, é reduzida igual e vai para o mesmo lugar.

A câmera é desligada assim que a foto é tirada, e ao fechar a janela: webcam
acesa depois que a tela sumiu é defeito, não detalhe.

## O estágio: quatro no banco, um botão na tela

**Aguardando · Impresso · Em acabamento · Pronto.** Os quatro continuam existindo
na coluna e na leitura; o que mudou em 29/08/2026 é que **só um deles se escolhe
na tela** (ver *O status: um botão, e não quatro*).

Quando ninguém escolheu nada, o estágio é **derivado** do setor anterior: modelo
com a impressão concluída entra como *Impresso*; qualquer outra coisa entra como
*Aguardando*, e a caixa dele fica **marrom** — a cor do estágio, que não
acompanha a paleta da tela. Foi o pedido do usuário em
20/08/2026, ao ver a tela pronta: um modelo que ainda não saiu da impressora não
pode aparecer como impresso, e a opção vazia *"— Status —"* não dizia nada a
quem estava olhando.

*Em acabamento* continua sendo lido de linhas antigas, mas ninguém o grava mais:
quem responde por ele hoje é o **responsável** do modelo.

### O nome, que foi e voltou

O último estágio se chamava **Revisado** quando a tela nasceu. Em 21/08/2026 o
usuário trocou por **Pronto**: "Revisado" descrevia o que o conferente fez;
"Pronto" descrevia o que interessava a quem olhava a fila de longe. Em
29/08/2026 ele voltou a **Revisado** — com um botão só, o estágio deixou de ser o
quarto de uma escala e virou o carimbo de quem conferiu, e a palavra antiga
descreve isso melhor.

**A volta foi só de vocabulário.** A coluna `acabamento_status` continua
guardando **'Pronto'**, e é a tela que traduz, pelo `ROTULO_NA_TELA`. Trocar
também o valor gravado pediria migração nova, mexeria no gatilho
`trg_carimba_acabamento_pronto_em` (que compara com `'PRONTO'`) e abriria de
novo a janela em que uma estação com a versão anterior em cache grava o nome
velho — foi exatamente o que aconteceu na troca de 21/08, no sentido inverso, e é
o que a migração [`sql/acabamento_status_pronto.sql`](../sql/acabamento_status_pronto.sql)
teve de consertar.

A coluna guarda o **próprio rótulo, em texto**, e não um código. Foi decidido de
propósito — o conjunto é pequeno, só esta tela lê, e um texto legível dispensa
uma tabela de domínio para quatro valores. O preço dessa escolha é justamente
esse: o valor gravado não pode acompanhar cada troca de nome na tela.

A constante `NOME_ANTIGO` traduz "Revisado" para "Pronto" **na leitura**, e
continua valendo: ela cobre as linhas gravadas antes da migração de 21/08.

### "Aguardando" gravado não trava o que a impressora já terminou

Corrigido em **21/08/2026**, com o pedido **19775** na mão: os modelos *AVRA* e
*WHISPER* estavam `IMPRESSO` na Produção e `Aguardando` no acabamento, e a tela
mostrava **Aguardando** — a camada 1 vencendo a 2 para sempre. O usuário
reportou exatamente isso: *"modelos marcados como IMPRESSO no painel de Produção
aparecem no Painel de Acabamento com status IMPRESSO"*.

A causa não era o dado, era o vocabulário. **"Aguardando" aqui quer dizer *o
material ainda não chegou nesta mesa*** — é a ausência de trabalho, não uma
decisão sobre ele. Quando a impressora termina, o material chegou; insistir em
"Aguardando" é a tela mentindo sobre o mundo físico.

Então `acabamento_status = 'Aguardando'` **cai para a derivação**, como se
estivesse vazio. As outras três escolhas — *Impresso*, *Em acabamento*, *Pronto*
— continuam vencendo tudo.

A consequência que é preciso saber: **marcar "Aguardando" num modelo já impresso
não gruda**. Para devolver material à fila, o caminho é o status de impressão, na
Produção — que é de quem imprimiu, e é o registro que manda.

Nada foi reescrito no banco para isso: as linhas continuam com "Aguardando", e é
a leitura que ficou honesta.

Derivar **não é gravar**. Desenhar a tela não escreve no banco — é a regra que o
`renderOrdens` do `script.js` aprendeu do jeito difícil, e ela vale aqui também.
A coluna continua nula até alguém escolher; a partir daí, a escolha vence o
derivado, inclusive quando a escolha é voltar para *Aguardando*.

Só `'Impresso'` conta como impresso. Desde 28/08/2026 a impressão só tem dois
status (Aguardando e Impresso), mas valores legados gravados antes disso
(*Parcial*, *Revisão*) ainda podem existir no banco — e derivam para
*Aguardando*, que é a verdade do ponto de vista desta tela: meia impressão ou
problema não chegou ao acabamento.

### Por que a coluna é separada da impressão

`status_impressao` é do setor de impressão e anda em
Aguardando/Impresso. Espremer os dois vocabulários na mesma
coluna faria uma tela mentir sobre a outra — e mexeria no que já está aprovado e
rodando na gráfica. O Acabamento **lê** aquele campo para saber por onde começar,
e **nunca o escreve**.

## De onde vem a lista de responsáveis

Da view **`imposition_operadores`**, que expõe `id`, `nome`, `role` e `ativo` da
`imposition_acessos_locais` — e mais nada.

A tabela por trás não pode ser lida pelo painel, e isso é proposital: ela guarda
os códigos de seis caracteres em texto claro, e cada um destranca uma estação.
Por isso `sql/rls_passo3_fechar_leitura.sql` revogou tudo das chaves públicas, e
por isso a rota `/api/acessos-locais` da Edge Function exige o módulo Usuários
**inclusive para ler**.

Um operador do acabamento não tem esse módulo, e na estação da gráfica ele nem
sessão do Supabase tem — entra só pelo código local. Se o seletor dependesse
daquela rota, nasceria vazio nas duas situações. A view é a resposta mínima que
funciona no site e na estação sem passar pelo agente, e **nunca deve receber a
coluna `codigo` nem `permissoes`** (há teste travando isso).

Acesso desativado não aparece na lista. Um responsável já gravado continua
aparecendo mesmo que tenha saído da lista de acessos: o nome está no modelo, e
apagá-lo da tela faria o trabalho parecer sem dono.

## Por que a leitura das duas colunas é separada

O `carregarModelosGlobais` do `script.js` — que alimenta a tabela do Painel de
Produção — pede colunas **nomeadas**, não `*`. Acrescentar `acabamento_status`
ali deixaria a tela da gráfica refém desta: enquanto o SQL não tivesse rodado, o
PostgREST recusaria a consulta **inteira**, e a lista da Produção perderia
progresso, itens e quantidade de uma vez, sem erro visível.

Então o Acabamento faz a própria consulta, ao abrir a tela e ao ATUALIZAR, e
guarda o resultado num mapa por id de modelo. Quando o pedido é aberto, o
`loadOSItens` traz a linha inteira (`select('*')`) e ela vence o mapa — inclusive
quando o valor é nulo, que quer dizer "não começou" e não pode ser confundido com
"ainda não perguntei".

Se as colunas não existirem, a tela **continua listando os pedidos** e avisa uma
única vez: *"O Painel do Acabamento ainda não foi ligado ao banco. Peça ao
administrador para rodar a atualização do banco."* A tela de Usuários, essa sim,
para de gravar — por isso a ordem de publicação abaixo não é sugestão.

## A paleta

A tela usa, de propósito, a **mesma marcação** da tela de Produção — as mesmas
classes `prod-*`, os mesmos cards, a mesma tabela. É isso que faz as duas se
parecerem e envelhecerem juntas: mexer no layout de uma mexe na outra sem
ninguém precisar lembrar.

A pintura mora em dois lugares, e nenhum deles alcança a Produção:

- **`frontend/style.css`**, no fim do arquivo, num bloco em que **toda regra
  começa por `#view-acabamento`**. Trocar a cor das classes `prod-*` resolveria
  aqui e repintaria a tela que a gráfica usa todo dia. Está no fim porque o
  bloco `prod-*` aparece **duas vezes** neste CSS (resto de colagem antiga), e
  regra escrita depois vence as duas. Há teste varrendo o bloco atrás de
  qualquer seletor sem o id.
- **`frontend/acabamento.js`**, na constante `AZUL`, para os tons que o arquivo
  escreve inline (a caixa do produto, o contorno, o número do pedido).

### Os dez tons, entregues pelo usuário em 21/08/2026

| Escura (superfícies) | | Clara (realces) | |
|---|---|---|---|
| `#06070d` | fundo de campo | `#120a8f` | navy profundo |
| `#0d0e20` | cabeçalho de caixa | `#2b32af` | índigo — contorno e hover |
| `#0a2472` → **`#001249`** | superfície dos cards — escurecido pelo usuário em 21/08 (v677) | `#4a61e8` | azul royal |
| `#123a99` | cabeçalhos e botões | `#4589d7` | o que está ligado |
| `#1a438f` | | `#4cc8f0` | ciano — texto de realce |

O único tom que não veio da imagem é **`#cfe6fb`**, o texto de leitura: a paleta
não traz um tom claro o bastante para corpo de texto, e ele é puxado do ciano.
`#9fd8f2` e `#7fa9d4` são derivações do mesmo ciano, para as métricas que
precisavam se distinguir entre si.

### O cuidado que esta paleta exige

Antes de 21/08/2026 esta tela era **marrom escuro** — pedido de 20/08, para o
olho separar uma tela da outra de relance na estação, já que as duas usam a
mesma marcação.

Agora as duas são azuis, e o que as separa é o **tipo** de azul: a Produção é
ardósia dessaturada (`#1e293b`, `#334155`, `#3b82f6`) e esta é índigo saturado.
Isso é mais frágil do que a distinção anterior, e por isso o teste
`nadaDeMotorNemDeAgente` proíbe os cinco tons da Produção dentro do
`acabamento.js`. É ele que impede as duas de convergirem com o tempo.

| | Produção | Acabamento |
|---|---|---|
| Superfície dos cards | `#1e293b` ardósia | `#001249` azul profundo |
| Cabeçalhos | `#334155` | `#123a99` |
| O que está ligado | azul `#3b82f6` | `#4589d7` |
| Nº do pedido | gradiente azul-ardósia | gradiente `#2b32af` → `#120a8f` |
| Progresso | verde | `#4589d7` |

### O que a paleta NÃO alcança: a cor por status

As quatro cores de fundo da caixa do modelo — *Aguardando* `#001f3e`,
*Impresso* `#001249`, *Em acabamento* `#32352e`, *Pronto* `#14301f` — **não
acompanham a paleta da tela**: quem as muda é o usuário, e só ele. Desde 21/08
(v676) a **linha do pedido na lista** leva a mesma cor que a caixa do modelo —
antes só tinha a classe `os-row`, comum às duas telas, e um pedido ainda não
impresso saía na mesma cor da lista da Produção.

Eu as tinha trazido para a família terra em 20/08/2026, e o usuário mandou
devolver: elas dizem em que ponto o modelo está, e é a primeira coisa que se lê
na tela. Mexer nelas para combinar com o fundo é trocar informação por
decoração. Há teste travando as quatro.

Com a tela azul, o marrom do *Aguardando* (`#3a2a1c`) destoava e o azul do
*Impresso* (`#162037`) se confundia com a página. Era para o usuário decidir, e
ele decidiu em 21/08 (v677 e v678): *Aguardando* passou a `#001f3e` e
*Impresso* ao azul da própria tela, `#001249`. A regra não mudou — cor de
estado não acompanha paleta por conta própria; o que mudou foi a decisão dele.
A fila do Pedido e a Produção continuam com o `#162037` para o mesmo
"Impresso": o pedido foi sobre esta tela.

**O que MUDA junto com a paleta, e por quê:** os números das métricas da coluna
lateral. Eles não dizem estado — são a identidade de cada métrica, iguais em
todo desenho. A única exceção ali é *Pedidos em Atraso*, que fica vermelho:
alerta não se repinta para combinar com a tela.

**O que continua igual ao da Produção, de propósito:** o selo de prazo de
entrega (`formatPrazoBadge`) e a miniatura da coluna Preview
(`previewDaArteDoPedidoHtml`). As duas funções são compartilhadas com a Produção
e com a Lista de Arte; recolori-las aqui mudaria as três telas.

## Os volumes

Pedido do usuário em 23/08/2026, logo depois de o peso por setor entrar, e
**refeito por ele em 29/08/2026**, que é a versão que vale:

> "pedido sem criação de volumes seguem o fluxo existente, ao criar volumes cada
> modelo registrado como pronto precisa indicar a qual volume pertence e
> registrar seu peso, esse registro pode ser feito em grupos, volumes já criados
> podem receber novos modelos ou grupos de modelos, somando os pesos ao volume,
> retirar o conceito de caixa e pacote e rolo, teremos apenas o conceito de
> volumes."

E, sobre o gesto na estação, no mesmo dia:

> "modelos são pesados antes de colocados no volume, as somas dos pesos dos
> modelos são o peso do volume. pedidos sem volume criado é pesado ao final"

**Só existe VOLUME.** Caixa, pacote, fardo e rolo saíram do vocabulário — da
tela e do código. O que vai dentro de um volume é um **registro**: um modelo,
uma quantidade, um peso, quem fez e quando.

### Três consequências, e delas sai todo o resto

1. **O volume deixa de ser um cadastro paralelo e vira a condição do PRONTO.**
   Num pedido que tem volume, clicar em *Pronto* abre a janela do registro em
   vez de gravar o status.
2. **O peso é do REGISTRO, não do volume.** Cada modelo vai à balança antes de
   entrar; o peso do volume é a soma (`pesoDosRegistros`), e ninguém digita peso
   de volume em lugar nenhum.
3. **O peso do setor, com volumes, é leitura.** Ele é a soma dos volumes daquele
   setor, gravado na ficha do parceiro pelo `gravarPeso` de sempre.

### Pedido sem volume não mudou em nada

Peso por setor digitado à mão, *"Sem volumes — este setor sai como 1 volume
único de 3,240 kg, pesado no fim"*, e a cobrança do peso ao marcar o último
modelo do setor como Pronto — que é o **"pesado ao final"** da regra. É a
maioria dos pedidos, e ela não ganhou cadastro nenhum.

O que liga o outro fluxo é criar o primeiro volume, pelo botão **Dividir em
volumes** (ou **+ Volume**) da faixa do setor. Ele nasce **vazio** e a tela
avisa: *"A partir de agora, marcar um modelo como Pronto pergunta em qual volume
ele entra."* Volume vazio é estado legítimo e **excluível** — criar um por engano
não tranca a tela, que é a regra da casa: toda trava diz como sair dela.

### O caminho do operador

| Passo | O que ele faz | O que a tela faz |
|---|---|---|
| 1 | Clica em **Pronto** num card (ou marca vários e usa **Registrar num volume**) | Abre a janela do registro |
| 2 | Escolhe o volume nos chips — ou **＋ Novo volume** | O último volume do setor já vem escolhido |
| 3 | Confere a quantidade | Já vem com o que **ainda está fora** de volume |
| 4 | Põe o material na balança e clica em **⚖ Pesar** | Mostra `est. 12,150 kg · +6,2%` e a régua dos 5 % |
| 5 | Diz quem fez e, se quiser, fotografa o volume | A foto vale para todos os modelos que estão dentro dele |
| 6 | **Gravar e marcar Pronto** | Grava o registro, soma no volume, atualiza o peso do setor e fecha os modelos que entraram por inteiro |

As caixas de marcar dos cards ficam **sempre visíveis**, sem modo: até
28/08/2026 escolher vários era um MODO que apagava os cards de outro setor,
grudava uma faixa no topo e tomava a tela do pedido. Com o registro nascendo do
Pronto, o modo perdeu a razão de ser. O primeiro modelo marcado **fixa o setor**
— um volume não atravessa setor, porque o peso é conferido por setor.

A barra da conta continua **fixa contra a janela**, no `#acab-barra-escolha`.
Isso não é detalhe de estilo: ela já errou de lugar duas vezes na estação, e
`tests/escolha_de_volume_harness.js` mede sete tamanhos de tela por causa disso.

### Uma pesagem só, repartida — ou uma por modelo

Quando vários modelos vão juntos ao prato, a balança devolve **um** número. Ele
é repartido entre as linhas na **proporção do peso estimado** de cada uma
(quantidade × peso da peça, que é o número mais preciso que o ERP tem);
sem base no ERP para nenhuma linha, cai para a proporção da quantidade. A conta
é feita em gramas inteiras e a **última linha recebe a sobra do arredondamento**,
para a soma das parcelas ser exatamente o peso lido.

O botão **Pesar um a um** abre um campo de peso por linha, para quando cada
modelo foi à balança sozinho. `repartirPeso` é pura e tem teste.

### Registro parcial não fecha o modelo

Diminuir a quantidade é o que reparte um modelo entre volumes: o resto continua
livre para o próximo. O modelo só fica **Pronto** quando a última leva entra —
é o `fecharModelosEmbalados`, que assina com o nome de quem fez quando é uma
pessoa só e com o **nome do setor** quando são várias. A janela avisa antes de
gravar: *"⚠ um modelo entra em parte — ele continua em acabamento até o resto
entrar noutro volume."*

### Duas coisas que a tela aprendeu em 29/08/2026, à noite

**O `<select>` do responsável não pode ter fundo transparente.** Quando ele
perdeu a moldura própria para caber dentro da caixa, foi posto em
`background: transparent` — a caixa continuou igual e a **lista sumiu**. No
Windows o Chrome pinta o balão do `<select>` com a cor de fundo dele; sem cor, o
balão sai branco, e com o texto em `#ffffff` os nomes ficam brancos no branco. O
operador abria o drop e via um retângulo vazio: *"drops dos responsáveis não
está trazendo os usuários"*.

A cor de `ESTILO_SELECT` é a **mesma** de `ESTILO_CAIXA_DO_SELECT`, então o
controle fechado continua idêntico ao desenho aprovado — quem muda é só o balão,
que passa a ter onde se pintar. `ESTILO_OPCAO` repete a cor em cada `<option>`,
porque nem todo navegador herda a do select, e `tests/escolha_de_volume_harness.js`
mede a cor **computada** num Chrome de verdade: o harness de regra não alcança
isso, porque o HTML estava certo o tempo todo.

**A lista do que falta saiu do Resumo.** *"retirar informação dos ainda sem
volume na lateral direita, não é necessário"* — com nomes de modelo de verdade
(`11/set CAMAROTE CORPORATIVO (DO 01 AO 140) 25 UND CADA`) ela virava um
parágrafo dentro da coluna estreita, e não dizia nada que o card do modelo já
não diga: cada um carrega o seu próprio *"ainda sem volume"*. Ficou só a
confirmação, que é curta e responde a pergunta que se faz antes da expedição.

### O modelo PRONTO já está alocado

Regra do usuário em 29/08/2026, olhando a tela publicada:

> "pedidos marcados prontos, já estão alocados a um volume, não podem oferecer
> opção de serem adicionados a outros volumes, precisam sair do status de pronto
> para liberar o checkbox, e ao sair de pronto sai do volume e atualiza peso do
> volume. modelos marcados prontos vão para final da lista"

Três coisas, e as três são a mesma ideia — o que está pronto está **fechado**:

- **A caixa de marcar de um modelo Pronto aparece marcada e travada**, em verde.
  Oferecê-la convidaria a pôr o mesmo material num segundo volume, e a carga
  contaria duas vezes. O `title` diz em qual volume ele está e como sair:
  *"Para mexer nele, tire-o de Pronto — o material sai do volume e o peso sai da
  soma."* `marcavelNaEscolha` recusa também quando alguém chama pelo console.
- **Sair de Pronto tira o modelo do volume**, com pergunta antes, porque apaga
  peso já conferido. Um modelo repartido sai de **todos** os volumes em que
  estava. Cancelar a pergunta cancela o clique inteiro: sem isso o modelo sairia
  de Pronto continuando dentro do volume, que é o estado que a regra existe para
  impedir.
- **Os Prontos vão para o fim da lista** de cada produto (`ordenarProntosNoFim`,
  pura e estável). De pé na estação o operador rola a lista para achar o que
  falta, e não o que acabou.

### O peso do volume acompanha o que sai dele

> "ao excluir modelos de um volume, peso do volume deve atualizar"

Vale para os dois caminhos — o **Tirar** da janela do volume e a saída do
Pronto. O espelho `producao_volumes.peso_kg` é **recalculado do que sobrou**
(`atualizarPesoDoVolume`), e não subtraído do total: num volume anterior a
29/08/2026 o peso pode vir do `peso_kg` gravado em vez da soma dos registros, e
a subtração partiria do número errado.

E o peso do **setor** encolhe junto — inclusive até zero. Quando o último
registro sai, ou quando o **último volume é excluído**, o peso do setor é
**apagado** em vez de ficar no número velho.

Isso deu trabalho, e vale saber por quê. Soma zero quer dizer duas coisas
opostas, e o estado final das duas é idêntico:

- setor que **nunca** teve volume — o peso é digitado à mão e pesado no fim.
  Gravar zero ali apagaria o número do operador.
- setor que **acabou de perder** o conteúdo — o peso é zero de verdade, e o
  número velho é uma mentira.

Quem sabe a diferença é o **chamador**, não a função: por isso
`atualizarPesoDoSetorPelosVolumes` recebe `{ saiuVolume: true }` de quem acabou
de tirar alguma coisa. Sem isso, o pedido 21074 mostrou 104 kg num setor cujos
volumes já não existiam (29/08/2026).

### Excluir pergunta para onde vai o que está dentro

Pedido do usuário em 29/08/2026, depois de usar a janela do volume:

> "ao clicar em 'Tirar' (mudar para excluir) o volume, perguntar se deseja mover
> o conteúdo para outro volume (indicar o volume) ou excluir o volume e
> desmarcar a revisão (atualizando os pesos)"

Vale para os **dois** botões da janela — o do volume inteiro e o de cada modelo
da lista, que deixou de se chamar "Tirar". O que muda entre eles é o que se
move: tudo, ou uma linha.

A razão de ser é que excluir era um caminho só, e destrutivo: material
registrado no volume errado só voltava desfazendo o registro e refazendo tudo,
**inclusive a pesagem**, que é o trabalho de verdade. Mover conserva o peso que
já foi à balança.

| Caminho | O que acontece |
|---|---|
| **Mover para outro volume** | Os registros trocam de `volume_id`. O peso vai junto, os dois volumes se atualizam, e ninguém deixa de estar Revisado. No caso do volume inteiro, o de origem é excluído depois de esvaziado. |
| **Excluir e desmarcar a revisão** | Os registros somem, o peso sai da soma do volume e do setor, e os modelos deixam de estar Revisados — a coluna é **limpa**, e o estágio volta a ser derivado da impressão. |

Por isso não é um `confirm`: a janela precisa **mostrar** os volumes do setor
para o operador escolher um, e `caixaConfirmar` só responde sim ou não. Sem
outro volume no setor, a opção de mover diz por que não dá e o que fazer — criar
um com **+ Volume** — como toda trava daqui.

### O botão da expedição fica no topo do Resumo

*"deixar o botão Encaminhar à Expedição no topo do painel"*. Embaixo, num Resumo
comprido, era preciso rolar a coluna inteira para chegar nele. Ele fica logo
abaixo do título e **fora** da área que rola, e continua não entrando no recorte
por setor: a expedição é do pedido inteiro.

### Tirar do volume desfaz as duas coisas

**Tirar** é a saída de quem registrou no volume errado, e ele desfaz o que o
registro fez: o material sai do volume (e o peso sai da soma) **e** o modelo
volta para *Em acabamento*. Deixar o Pronto de pé mostraria um modelo concluído
que não está em volume nenhum — exatamente o estado que a regra existe para
impedir.

Excluir o volume inteiro é diferente: ele leva os registros junto (pelo
`on delete cascade`) e **não** desfaz o Pronto de ninguém. Desfazer decisão de
gente é do Tirar, um a um.

### A foto é uma só para os modelos do volume

Uma foto por volume, compartilhada por todos os modelos que estão dentro dele
(28/08/2026). O ganho é de trabalho: um volume com quatro modelos dentro é UMA
foto, e não quatro. Ela **não substitui** a foto do material, que é o registro
do revisor e continua sendo do modelo — `blocoDaFoto` mostra a própria primeiro,
e só cai para a do volume quando o modelo ainda não tem a dele.

O "Salvar foto" sobe ao Storage (`artes/acabamento-fotos/`) e guarda só o
endereço na janela; quem grava no banco é o **Gravar e marcar Pronto**. Trocar
de volume nos chips troca a foto que a janela está mexendo — sem isso,
fotografar carimbaria a foto do volume anterior no volume novo.

### A régua dos 5 %, agora mais precisa

É a **mesma** função do peso do setor (`precisaDeLiberacao`, uma tolerância só
no arquivo inteiro), aplicada ao registro. E ela ficou melhor: no setor a base é
a tiragem inteira; aqui é exatamente o que foi ao prato. Acima de 5 % a gravação
espera a **senha de liberação**, e cancelar a senha devolve a janela com tudo o
que o operador já tinha digitado — `esconderRegistro` esconde sem desmontar.

### Onde isso mora, e por que ali

Duas tabelas **nossas**: `producao_volumes` e `producao_volume_itens` — esta
última é a tabela dos **registros**, e não mudou de nome de propósito (renomear
quebraria a estação com o painel da versão anterior aberto na tela).
[`sql/volumes_do_acabamento.sql`](../sql/volumes_do_acabamento.sql) cria as
duas; [`sql/pacotes_do_acabamento.sql`](../sql/pacotes_do_acabamento.sql)
acrescenta o nome do volume e, no registro, a chave própria e o responsável;
[`sql/volumes_por_registro.sql`](../sql/volumes_por_registro.sql) acrescenta o
**peso** e a **hora** do registro, e desce para eles o peso dos volumes que já
existiam.

`producao_volumes.peso_kg` **não** foi removida, e passou a ser **espelho**: a
tela lê a soma dos registros, mas o painel escreve a soma ali a cada gravação,
para a estação que ainda estiver com a versão anterior aberta continuar
desenhando um número certo. `producao_volumes.tipo` continua no banco com o que
já está gravado e simplesmente deixa de ser escrita.

A ficha `propostas_os_setores` tem `qtd_volumes` e `tipo_volume`, e daria para
gravar ali. O usuário decidiu que **não** — ver
[REGRAS_BANCO.md](REGRAS_BANCO.md). Além de manter a exceção do parceiro
estreita, é o que faz o recurso funcionar na estação: a ficha do parceiro tem
RLS de `authenticated`, e o operador da gráfica entra pelo código local, sem
sessão. Em tabela nossa, com política de `public`, a estação grava direto pelo
PostgREST — os volumes **não têm** o par de caminhos que o `gravarPeso` precisa,
e não passam pelo agente.

### Detalhes que já custaram caro em outros recursos daqui

- **A soma é feita em gramas inteiras** e dividida no fim. Somar `0.1 + 0.2` em
  ponto flutuante dá `0.30000000000000004`, e um centésimo de grama fantasma
  viraria aviso âmbar em cima de um trabalho certo.
- **`pesoDosRegistros` só cai para o `peso_kg` gravado enquanto NENHUM registro
  tiver peso.** É a saída para o volume anterior a 29/08/2026; assim que um
  registro ganha peso, manda a soma — misturar os dois faria o peso contar duas
  vezes.
- **`faltaEmbalar` nunca é negativo.** Se alguém registrar mais do que a tiragem,
  o que a tela precisa dizer é "não falta nada", não um número negativo.
- **`UNIQUE (id_int, setor, numero)`** protege contra dois operadores criando o
  V3 ao mesmo tempo. A tela traduz o erro do banco em *"Outro operador acabou de
  criar este volume. Clique em + Volume de novo"* — a trava tem saída.
- **Os campos do registro são numerados pela POSIÇÃO** (`acab-reg-qtd-0`), e não
  pelo id do modelo. Duas linhas do mesmo modelo dariam dois campos com o mesmo
  id, e o navegador entregaria sempre o primeiro.
- **Tirar uma linha e trocar para "Pesar um a um" leem o DOM antes de
  redesenhar.** Sem isso, as quantidades das linhas de cima voltariam ao valor
  de quando a janela abriu. E o redesenho é **só da lista** — remontar a janela
  inteira apagaria o peso que o operador já digitou.
- **O "livres" de cada linha desconta as outras linhas da mesma janela.** Sem
  essa parcela, duas linhas do mesmo modelo apareceriam as duas com a tiragem
  inteira disponível, e o operador registraria o dobro sem a tela dizer nada.
- **O registro é ACRÉSCIMO, e não substituição.** Um volume recebe modelos ao
  longo do dia; reescrever a lista a cada gravação apagaria o que já estava lá.
- **Tudo o que o `agruparVolumes` lê tem de estar no `select`.** O `select` do
  PostgREST é uma projeção: coluna que não está na lista não volta, e não há
  erro nenhum — o campo chega `undefined`. Foi assim que `peso_kg` e
  `registrado_em` do registro ficaram fora por quatro versões: o código os lia,
  a consulta não os pedia, e `pesoDosRegistros` caía no espelho do volume sem
  ninguém notar. O buraco só apareceu ao **mover** conteúdo entre volumes, onde
  o peso precisa viajar com o material.

  O banco de mentira do harness passou a **honrar a projeção** por causa disso:
  até então ele devolvia todas as colunas, e por isso deixou o defeito passar.
  Com o `select` errado, oito verificações falham.

## Como a tela se pendura no que já existe

Sem reescrever nada. O `acabamento.js` **embrulha** `renderOrdens` e `showView`:
o original roda primeiro e inteiro, e só depois esta tela se redesenha, dentro
de `try/catch`.

- **`renderOrdens`** — garante que as duas listas leiam o mesmo `state` no mesmo
  instante. A do acabamento nunca fica atrás da da produção, e não há disputa de
  quem carrega os dados.
- **`showView`** — só age depois de confirmar que a seção abriu mesmo; o
  porteiro de permissão do `showView` original pode ter recusado, e carregar
  pedidos para uma tela que não abriu seria trabalho jogado fora.

Um defeito aqui não pode derrubar a tela que a gráfica usa todo dia.

## Três armadilhas de quem for mexer

1. **Id repetido.** As duas telas vivem no MESMO documento. Todo id do
   acabamento termina em `-acab`; `getElementById` devolve o primeiro que
   encontrar, e um id repetido faria o painel de um setor escrever no do outro.
   Há teste varrendo o `index.html` inteiro atrás de ids duplicados.

2. **`data-prazo` é da Produção.** O `updateFiltroPrazoBotoes` do `script.js`
   varre `button[data-prazo]` no documento inteiro. Os botões de prazo do
   acabamento usam **`data-prazo-acab`** justamente para não serem repintados
   pelo painel vizinho — e vice-versa.

3. **`state.osItens` nem sempre tem modelos.** Antes de o pedido ser aberto, o
   que mora ali é o cache da **proposta** do parceiro (`_source: 'vibecode'`),
   montado de `produtos_proposta`: uma linha por *produto contratado*, sem
   `status_impressao` nem `acabamento_status`. Em 21/08/2026 (v679) isso fazia a
   lista mostrar *Aguardando* e "0/1 mod." no pedido 20975, que tinha oito
   modelos impressos no banco. `modelosDoPedido` só deixa `osItens` vencer
   quando todas as linhas trazem `_dbLoaded` — a marca que o `script.js` põe ao
   buscar os modelos de verdade; sem ela, valem os `modelosGlobais`. Há teste
   com o cenário do 20975.

## Ordem de publicação

O SQL vem **primeiro**, sempre. `imposition_user_permissions` tem uma coluna por
permissão, e mandar uma coluna que não existe faz o PostgREST recusar a gravação
inteira com 400 — publicar o painel antes de rodar o SQL quebraria a tela de
Usuários por completo e trancaria quem entra pela primeira vez.

1. Rodar `sql/painel_do_acabamento.sql` e `sql/acabamento_foto_do_modelo.sql`,
   conferindo a saída dos SELECTs do fim de cada um. Da máquina de trabalho dá
   para rodar sem abrir o painel: `.\ferramentas\rodar_sql.ps1 <arquivo>`.
   Para os volumes, na ordem: `sql/volumes_do_acabamento.sql`,
   `sql/pacotes_do_acabamento.sql`, `sql/foto_do_volume.sql` e
   `sql/volumes_por_registro.sql` — este último tem de terminar com
   `volumes_fora_da_conta = 0`, que é a prova de que o peso dos volumes antigos
   desceu para os registros sem mudar nenhuma soma.
2. `.\publicar.ps1 "mensagem"` — publica o site e a Edge Function `painel`.
3. `.\publicar_agente.ps1 <versão nova>` — o agente vai junto, sempre: é ele que
   leva o `acabamento.js` novo para as estações, pela lista `PAINEL_ARQUIVOS`
   embutida no executável instalado.
