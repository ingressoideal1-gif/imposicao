# Painel do Acabamento

> Menu criado em 20/08/2026, a pedido do usuário, para o setor que recebe o
> material **depois** da imposição e da impressão.

| | |
|---|---|
| Onde fica | `frontend/index.html`, seção `view-acabamento`, menu **Produção → Painel do Acabamento** |
| Quem desenha | [`frontend/acabamento.js`](../frontend/acabamento.js) |
| Banco | `pedidos_modelos.acabamento_status`, `.acabamento_responsavel`, `.acabamento_foto_url`, view `imposition_operadores`, e `propostas_os_setores.peso_real_kg` (do parceiro — ver REGRAS_BANCO). Só leitura: `produtos_proposta.peso_total` (o estimado) e `imposition_segredos.PESO_LIBERACAO_SEGREDO` (a senha semanal) |
| SQL | [`sql/painel_do_acabamento.sql`](../sql/painel_do_acabamento.sql) + [`sql/acabamento_foto_do_modelo.sql`](../sql/acabamento_foto_do_modelo.sql) + [`sql/acabamento_status_pronto.sql`](../sql/acabamento_status_pronto.sql) |
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

Desde 22/08/2026, a pedido do usuário, cada modelo se lê da esquerda para a
direita, numa linha só:

| Coluna | O que traz | Largura |
|---|---|---|
| Amostra | a arte aprovada, para conferir contra o papel | elástica — sobrou espaço, é dela |
| Especificação | a tabela abaixo | estreita (280px) |
| Decisões | os quatro botões de status **empilhados** e o responsável **abaixo** deles, **sem caixa em volta** | 210px |

Antes as decisões eram uma faixa no rodapé do card, com os botões deitados: de pé
na estação, o operador percorria a linha inteira do card para chegar até elas.
A coluna também não tem moldura própria — os botões já têm contorno e cor, e uma
caixa em volta deles só competia com a do bloco do modelo (pedido do usuário,
22/08/2026).

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

## O status: quatro botões, e não um seletor

Pedido do usuário em 22/08/2026: *"alterar o drop dos Status para 4 botões, do
mesmo tamanho; o botão do status atual estará selecionado; ao selecionar, o
status deve ficar muito bem destacado"*.

Cada modelo mostra os quatro estágios lado a lado — **⏳ Aguardando**, **🖨️
Impresso**, **✂️ Em acabamento**, **✅ Pronto** — numa grade de quatro colunas de
`1fr`, então têm o mesmo tamanho em qualquer largura de tela. O do estágio atual
vem **pintado por dentro** na cor daquele estágio, com anel, sombra e um ✓ à
frente; os outros ficam só contornados. Um clique muda o estágio: não há mais
abrir a lista e escolher.

As cores são as mesmas dos selos (`COR_DO_ESTAGIO` espelha `SELO`), e o texto do
botão pintado é escuro de propósito — branco sobre âmbar ou ciano fica abaixo de
2,5:1 de contraste. O fundo do bloco do modelo continua mudando com o estágio,
como já fazia (`FUNDO_DO_ESTAGIO`).

Sem permissão de editar, os quatro aparecem apagados e travados — mas o marcado
continua marcado: quem só vê precisa ler em que ponto o modelo está.

**O status só se mexe depois do responsável** (regra do usuário, 22/08/2026).
Modelo sem responsável escolhido tem os quatro botões travados e um recado ao pé
deles: *"⬅️ Escolha o Responsável ao lado para liberar o status"*. Marcar um
estágio é dizer que **alguém** fez aquele trabalho; sem nome, o registro não
responde à pergunta que o setor faz depois — quem acabou este material. Escolhido
o responsável, os botões liberam na hora, sem ATUALIZAR. A trava vale também na
função (`mudarEstagio` confere antes de gravar): botão cinza não impede ninguém
de chamar pelo console, e essa é a única porta por onde o status é gravado.

Desenha `botoesDeEstagio` (`frontend/acabamento.js`); o harness confere que há um
botão por estágio em cada modelo, que só um está marcado, e que todos travam
para quem não edita.

### A hora em que o modelo ficou Pronto

Pedido do usuário em 23/08/2026: *"Modelos prontos devem indicar a hora em que
ficaram prontos"*. Abaixo dos botões, o modelo em **Pronto** mostra
`🕒 Pronto às 14:32` — e `🕒 Pronto em 22/08 às 14:32` quando não foi hoje. A
data só aparece nos outros dias porque o operador lê isto de pé na estação,
quase sempre no mesmo dia; ali ela só atrapalharia.

**Quem escreve a hora é o banco**, não a tela: a coluna
`pedidos_modelos.acabamento_pronto_em` é carimbada pelo gatilho
`trg_carimba_acabamento_pronto_em` (`sql/hora_do_pronto_no_acabamento.sql`). O
estágio é gravado daqui, da estação e mexido pelo ERP — um carimbo feito no
frontend deixaria buracos justamente nos modelos que a gráfica tocou pelo acesso
local. O gatilho **apaga** a hora quando o modelo sai de Pronto, e **não a
renova** quando alguém reclica no botão que já estava aceso (a tela repete essa
segunda regra no espelho otimista, para não piscar uma hora que o banco não vai
gravar).

Modelo marcado Pronto **antes de 23/08/2026 não tem hora**, e a migração não
inventou uma: `updated_at` muda a cada foto, responsável ou observação, e uma
hora aproximada seria lida como a de verdade. Esses cards simplesmente não
mostram carimbo.

### O peso do setor antes do último Pronto

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
| Status | Aguardando / Parcial / Impresso | Aguardando / Impresso / Em acabamento / Pronto |

O botão de recorte no topo, que na Produção é "Impresso", aqui é **"Pronto"**:
pedido com todos os modelos prontos sai da fila de trabalho e só reaparece com
esse botão ligado. É a mesma regra, aplicada ao estágio seguinte.

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

## O pedido aberto

Clicar numa linha **não** abre a Imposição: abre, no lugar da lista, a mesma
listagem de modelos separada por produtos que o Portal do Pedido desenha — uma
caixa por produto, com nome real e selo do setor PCP, e dentro dela uma linha
por modelo. O botão **VOLTAR** devolve a lista.

A caixa de cada modelo tem **três andares**, refeitos em 21/08/2026 a pedido do
usuário (a versão anterior empilhava tudo numa coluna só, "muito mal
distribuída" nas palavras dele):

1. **Topo — quem.** Bolinha da cor, nome, código e selo do estágio à esquerda;
   a foto do material à direita, num botão compacto (ver *A foto do material*).
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

### O peso por setor, acima dos modelos

Um box antes da lista de modelos, com **um campo de peso para cada setor dos
produtos daquele pedido**. Pedido do usuário em 21/08/2026, no exemplo dele:
*Triband + Credencial + Mobi* são dois setores, **Laser** e **PVC**, então duas
linhas.

Os setores saem do `setor` de cada item — o mesmo que o `script.js` resolve a
partir de `produtos.setor_pcp` e que alimenta os cards da fila. Setor que o banco
não aceita fica de fora: melhor não oferecer o campo do que oferecer um que
devolveria erro na hora de gravar.

O peso vai para **`propostas_os_setores.peso_real_kg`**, uma linha por setor. Essa
tabela é do parceiro, e escrever nela é a **única exceção** à regra de ouro do
[REGRAS_BANCO.md](REGRAS_BANCO.md) — está documentada lá, com a lista exata do que
pode ser tocado. Em resumo: só o peso e o `updated_at`; `prazo`, `hora`,
`status_producao` e as colunas de volume nunca são encostados.

Grava-se com **`UPDATE` primeiro, `INSERT` só quando não há linha**. É o caminho
que menos mexe na tabela do parceiro, e o comum: o ERP cria essas linhas na
expedição, então na maioria dos pedidos elas ainda não existem quando o
acabamento pesa o material. Se duas pessoas pesarem o mesmo setor ao mesmo tempo,
o `UNIQUE (id_int, setor)` derruba o segundo `INSERT` com 23505 e ele vira
atualização.

Vírgula e ponto valem o mesmo (`4,16` = `4.16`); campo vazio apaga o peso; letra
ou número negativo não chegam ao banco. Ao lado de cada campo aparece **✓ gravado**
ou **✕ não foi**, sem redesenhar o pedido — o operador não perde o que está
digitando.

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
botão **⚖** ao lado dos **três** campos de peso da tela (o peso de cada setor, o
"Peso na balança" do editor de caixa e a janela do peso que fecha o setor) lê a
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

### O botão EXPEDIÇÃO, à direita do peso

No mesmo box, à direita dos campos de peso. Pedido do usuário em 21/08/2026.

**Ele só fica ativo com TODOS os modelos de TODOS os setores em "Pronto".** Mas
não fica escondido nem travado: apagado, ele continua clicável, e clicá-lo cedo
responde exatamente **o que falta** — *"Ainda não dá para expedir: falta
terminar Laser (1 modelo)"*. Um botão escondido faria o operador procurar o que
a tela não mostra; um botão travado não explicaria por quê.

Modelo **sem setor** não some dessa conta: ele aparece como *(sem setor)*. É
material do pedido do mesmo jeito, e um pedido saindo da gráfica com modelo
pendente é o erro caro desta tela.

Clicado com tudo pronto, ele grava **`propostas.status_interno = 'EXPEDICAO'`** —
estado que o ERP já usa, e que o painel já escrevia no botão de liberar para
produção. A tela volta para a lista.

A conferência é refeita **dentro** da função, e não só no `disabled`: quem
digitar `AcabamentoPainel.expedir(...)` no console passaria direto pelo atributo,
e o preço seria um pedido expedido com material na mesa.

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

Por modelo, dois seletores — na **faixa da base** do card, desde 21/08/2026 —
e nada mais é editável:

1. **Status do acabamento** — Aguardando · Impresso · Em acabamento ·
   Pronto. Grava em `pedidos_modelos.acabamento_status`.
2. **Responsável** — os operadores de acesso local da gráfica, por nome. Grava
   em `pedidos_modelos.acabamento_responsavel`.

Os dois gravam na hora, direto no Supabase, pelo mesmo caminho que o painel já
usa para o `status_impressao`. A tela anda na frente do banco de propósito — o
operador não espera a rede para ver a própria escolha — e um aviso aparece se a
gravação falhar.

Quem tem só **VER** do módulo encontra os dois seletores travados; alterar exige
o **EDITAR**.

### A foto do material

Cada modelo tem um botão **📷 Fotografar**, compacto, no **canto superior
direito** do card (pedido do usuário em 21/08/2026 — até então era uma faixa
inteira na base, com rótulo próprio e botão grande, pesando mais que os
seletores, que são o trabalho de verdade desta tela). Ele abre a webcam da
estação numa janela, com *Fotografar*, e depois *Repetir* ou *Salvar foto*. A
foto vai para o Storage e o endereço dela fica em
`pedidos_modelos.acabamento_foto_url`; a miniatura (46 px) aparece **ao lado do
botão**, o texto dele vira *Refazer foto*, e ela amplia no mesmo lightbox da
amostra. Sem foto, o card diz "Nenhuma foto do material ainda" em texto miúdo
abaixo do botão — o rótulo "Foto do material" segue existindo, no `title` do
botão e da miniatura, e o harness confere os três textos. Refazer grava um
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

## O estágio: quatro, e nenhum deles nasce vazio

**Aguardando · Impresso · Em acabamento · Pronto.**

Quando ninguém escolheu nada, o estágio é **derivado** do setor anterior: modelo
com a impressão concluída entra como *Impresso*; qualquer outra coisa entra como
*Aguardando*, e a caixa dele fica **marrom** — a cor do estágio, que não
acompanha a paleta da tela. Foi o pedido do usuário em
20/08/2026, ao ver a tela pronta: um modelo que ainda não saiu da impressora não
pode aparecer como impresso, e a opção vazia *"— Status —"* não dizia nada a
quem estava olhando.

### O nome mudou em 21/08/2026: "Revisado" virou "Pronto"

O último estágio se chamava **Revisado** quando a tela nasceu. O usuário trocou
por **Pronto** no dia seguinte: "Revisado" descreve o que o conferente fez;
"Pronto" descreve o que interessa a quem olha a fila de longe — o material pode
ser embalado e entregue.

A coluna `acabamento_status` guarda o **próprio rótulo, em texto**, e não um
código. Isso foi decidido de propósito — o conjunto é pequeno, só esta tela lê,
e um texto legível dispensa uma tabela de domínio para quatro valores. O preço
dessa escolha é que renomear o rótulo exige reescrever as linhas já gravadas:
é o que faz [`sql/acabamento_status_pronto.sql`](../sql/acabamento_status_pronto.sql),
rodado no mesmo dia.

O código não depende dessa migração para estar certo. A constante `NOME_ANTIGO`
traduz "Revisado" para "Pronto" **na leitura**, e existe por dois motivos: o
intervalo entre publicar e migrar, e a estação que ainda tem a versão anterior
em cache e pode gravar o nome velho por alguns minutos. Toda gravação nova já
sai como "Pronto".

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

Só `'Impresso'` conta como impresso. *Parcial* é meia impressão, e meia
impressão não chegou ao acabamento; *Revisão* é problema na impressão, e também
não chegou. As duas derivam para *Aguardando*, que é a verdade do ponto de vista
desta tela.

### Por que a coluna é separada da impressão

`status_impressao` é do setor de impressão e anda em
Aguardando/Parcial/Impresso/Revisão. Espremer os dois vocabulários na mesma
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

Pedido do usuário em 23/08/2026, logo depois de o peso por setor entrar:

> "existe a situação em que 1 modelo grande é realizado por vários responsáveis
> e situações onde vários modelos são pesados juntos pelo mesmo usuário,
> situação onde precisaria selecionar vários modelos e criar um volume e pesar
> volumes individualmente, e situações onde precisa dividir o mesmo modelo em
> vários volumes, nada disso invalida o campo já existente onde precisa
> informar o peso total do setor."

**O volume é a caixa.** Ele tem número (V1, V2, V3…), **nome** ("Camarote",
"Staff dia 2" — opcional), tipo (Caixa, Fardo, Rolo, Palete), o peso da balança,
quem pesou, e uma lista de **pacotes**.

**O pacote é o maço.** Um modelo, uma quantidade, um responsável. É o nível que
o usuário pediu horas depois dos volumes, e é ele que faz as três situações
caberem num desenho só:

| A situação | Como ela cabe |
|---|---|
| 1 modelo grande, vários responsáveis | dois pacotes do mesmo modelo, um por pessoa, dentro da mesma caixa |
| vários modelos pesados juntos | uma caixa com um pacote de cada modelo |
| o mesmo modelo repartido em caixas | o modelo aparece em vários volumes, e as quantidades somam a tiragem |

O tipo **"Pacote"** saiu da lista de tipos de volume quando a palavra passou a
significar o maço de dentro — uma caixa do tipo "pacote" com três pacotes
dentro seria confusão garantida na estação. Volume já gravado com aquele tipo
não o perde: o seletor devolve à lista qualquer valor que já esteja no banco.

### Setor sem volume é 1 volume único

Isso é a decisão mais importante do desenho, e ela é para quem **não** usa o
recurso. A faixa de um setor sem volume nenhum não fica vazia: ela diz *"Sem
volumes — este setor sai como 1 volume único de 3,240 kg"* e oferece o botão
**Dividir em volumes**. O pedido simples, que é a maioria, não ganhou cadastro
nenhum, e o card do modelo nem mostra o bloco de volumes.

### O caminho do operador

1. **`+ Volume`** na faixa do setor põe a lista do pedido em **modo de escolha**.
   Os modelos daquele setor ganham caixa de marcar; os de outro setor continuam
   desenhados, apagados, dizendo por quê. A lista já está na tela, com foto, cor
   e tiragem — pedir que ele reconheça o mesmo material numa segunda lista, mais
   pobre, dentro de um popup, seria trabalho que a tela já fez por ele.

   **A barra da escolha é FIXA contra a janela**, no `#acab-barra-escolha`, fora
   das views — a mesma escolha que o Quadro de Avisos já tinha feito. Ela errou
   de lugar duas vezes antes de chegar aí, e as duas o usuário é que percebeu:

   1. **Solta no fim da lista de modelos**, dentro da área que rola. Numa tela
      de 1366×768, com **um** modelo no setor o botão já caía 144 px abaixo da
      área visível; com quatro, 1.416 px.
   2. **Grudada com `position: sticky`.** Resolveu de 1280 px de largura para
      cima e deixou tudo abaixo disso quebrado, por dois motivos somados: o
      `.prod-table-card` acima dela tem `overflow: hidden`, e **ancestral com
      overflow escondido desliga o `sticky` do descendente**; e abaixo de
      1024 px a media query vira o `.prod-panel-container` em coluna, passando a
      ser ele quem rola. Em 1024×768 o botão voltava a 2.214 px abaixo da
      janela; num celular, 4.828 px.

   Fixa contra a janela, ela não depende de layout nenhum. Três coisas moram
   nesse canto — o Quadro de Avisos, esta barra e os avisos flutuantes — e se
   empilham pela convenção que o quadro criou: cada uma publica a própria altura
   numa variável de CSS (`--avisos-altura`, `--escolha-altura`) e a de cima se
   apoia nela. Enquanto a escolha está em curso, o `#acab-detalhe-corpo` ganha
   folga embaixo, para o último card não ficar atrás da barra; e sair do
   Acabamento tira a barra junto, porque ela não pertence a view nenhuma.

   `tests/escolha_de_volume_harness.js` mede tudo isso num Chrome, em **sete
   tamanhos de tela** — foi um tamanho não medido que deixou a segunda versão
   passar. Ele traz o controle que dá sentido ao resto: devolvida para dentro do
   detalhe, em 1024×768, o botão volta a cair fora da janela.
2. **`Pesar este volume`** abre a janela. Cada modelo marcado vira **um
   pacote**, com a quantidade **cheia com o que ainda está fora de volume** — um
   clique para "esta caixa leva o resto" — e com o responsável que o card já
   mostra. Diminuir a quantidade reparte o modelo em várias caixas.
3. **`+ Pacote`**, dentro da janela, acrescenta outro maço à mesma caixa. Ele
   nasce do **mesmo modelo do anterior**, com o que sobrou dele — porque o caso
   que criou o botão é o modelo grande repartido entre duas pessoas. O seletor
   de modelo em cada linha deixa trocá-lo quando for outra coisa.
4. **`Ver volumes`** abre a lista do setor, com os pacotes de cada caixa —
   quantidade e responsável, um por linha — mais editar, excluir e a
   conferência.

### O peso do setor acompanha a soma das caixas

> "ao adicionar os volumes, volumes criados a soma de seus pesos vai atualizando
> o peso real do setor" — usuário, 23/08/2026

A cada caixa gravada, e a cada caixa excluída, a soma dos pesos entra no campo
do setor **sozinha**. A faixa anuncia isso em verde (*"o peso do setor acompanha
a soma das caixas — cada caixa gravada o atualiza"*), porque o que o sistema faz
sozinho tem de se anunciar: sem essa linha, o operador veria o campo mudar de
valor sem ter digitado nada.

Três coisas que essa automação **não** furou:

- **Passa pelo `gravarPeso` de sempre**, e não por um atalho. É ele que conhece
  os dois caminhos de escrita (agente na estação, PostgREST no site) e a senha de
  liberação.
- **A régua compara com o que já está embalado**, e não com a tiragem inteira.
  Com três das cinco caixas prontas, comparar a soma delas com o setor todo
  acusaria 40 % de divergência num trabalho perfeitamente certo. Quem calcula a
  base é `estimadoDoEmbalado`; o `gravarPeso` a aceita por `opcoes.estimado`, e
  um `null` explícito quer dizer *"não há régua"* — não *"use a do setor"*.
- **Caixa sem peso não escreve nada.** Gravar zero apagaria um peso que alguém
  digitou à mão no box.

Digitar outro número no box continua valendo — é o caso do setor pesado inteiro
na balança grande. Aí a diferença volta a aparecer em âmbar (*"o peso do setor
está 20 g acima da soma dos volumes — alguém o digitou à mão"*) e **não trava
nada**: caixa, fita e plástico pesam. Em "Ver volumes", o botão *"Usar 12,480 kg
como peso do setor"* é a saída para voltar à soma — e ele só aparece quando os
dois números divergem.

### O modelo embalado por inteiro fecha sozinho

> "modelos com mais de 1 volume ao atingir a quantidade total, quando mais de 1
> responsável mostra no drop responsável o nome do setor e marca status como
> pronto, se todos os pacotes do volume são mesmo responsável marca este como
> responsável." — usuário, 23/08/2026

Embalar **é** terminar. Quando o último pacote de um modelo entra numa caixa,
o modelo vira **Pronto** sem ninguém clicar, e quem assina sai dos pacotes:

| Os pacotes daquele modelo | Quem assina |
|---|---|
| todos da mesma pessoa | o nome dela |
| duas ou mais pessoas | **o nome do setor** ("Laser") |
| algum pacote sem responsável, junto com outros que têm | o nome do setor |
| todos sem responsável | ninguém — o modelo **não** fecha |

O nome do setor no lugar da pessoa é o que resolve o modelo grande que passou
por três mãos: ele não tem um dono, tem o setor. Quem fez o quê continua
escrito, pacote a pacote, na janela do volume. O seletor do card mostra "Laser"
escolhido, porque ele já devolvia à lista qualquer nome gravado que não fosse de
um operador.

Quatro limites, cada um por um motivo:

- **O peso entra antes do Pronto.** A regra da casa é que o setor não fecha sem
  peso registrado; invertida a ordem, o último Pronto automático fecharia um
  setor com o campo vazio.
- **A trava do peso continua valendo.** Se o modelo for o último pendente do
  setor e o setor ainda estiver sem peso — nenhuma caixa pesada, por exemplo —,
  ele fica de fora, e o operador recebe o popup que pede o peso, como sempre.
- **Pronto já dado não é reescrito.** É decisão de alguém, e a embalagem não
  desfaz nem sobrescreve decisão de gente.
- **Excluir a caixa não desfaz o Pronto.** O peso do setor desce junto com a
  soma, mas desmarcar um modelo concluído é do operador.

E um aviso na tela sempre que isso acontece: *"Credencial VIP (Laser, mais de
uma pessoa) — todos os pacotes embalados, modelo marcado como PRONTO"*. Sem
ele, o operador voltaria para a lista e encontraria cards verdes que não marcou.

Na janela que **cobra o peso ao fechar o setor**, o campo já nasce com a soma
dos volumes quando ela existe, e a janela diz de onde o número saiu. Sem volume,
aquela janela é exatamente a de antes.

### Cada caixa é conferida pela quantidade que leva

Pedido do usuário em 23/08/2026, no dia seguinte ao dos volumes:

> "Ao criar um volume de apenas 1 modelo (dividir um modelo em mais de um
> volume) deve ser informado a quantidade de itens do volume e calcular o peso
> da quantidade informada, seguindo a mesma regra dos 5% para cada volume, ao
> criar um volume de vários modelos, deve somar as quantidades dos modelos
> selecionados e seguir mesma regra dos 5%."

A janela de pesar mostra, ao lado do campo do peso, **`est. 10,400 kg`** — a
quantidade digitada vezes o peso da peça. Um modelo só ou cinco, a conta é a
mesma; o que muda é quantas parcelas ela tem. Acima de 5 % de diferença, gravar
**pede a senha de liberação**, exatamente como o peso do setor.

**A base vem do ERP.** `produtos_proposta.peso_total` é coluna gerada
(`peso_uni * qtd`), em gramas; dividida pela quantidade da linha devolve o peso
unitário que o ERP guardou. Conferido no pedido 21085: 141.128 g ÷ 27.140 un =
**5,2 g a peça**. O modelo chega na sua linha pelo `id_produto_proposta_origem`.

É por **unidade**, e não por modelo, de propósito: várias credenciais diferentes
saem da mesma linha da proposta — as oito do 21085 saem da linha 2281 — e o que
elas têm em comum é o peso de cada peça.

**O que isso fecha.** O peso por setor só é conferido quando o último modelo
dele fica pronto. Até lá, uma caixa pesada errado — 30 kg digitados numa caixa de
3 — passava sem ninguém ver, e a soma dos volumes só denunciava o engano no fim,
quando o material já estava fechado.

Três cuidados que o código carrega:

- **A conta se refaz a cada tecla.** No box do setor a base é fixa (a tiragem
  inteira), e basta repintar quando o peso é gravado. Aqui a base **muda com o
  que o operador digita**: baixar de 3.000 para 1.500 muda o peso esperado da
  caixa. Por isso as quantidades são lidas do DOM (`pacotesDigitados`), e
  não do estado de quando a janela abriu.
- **Sem base no ERP a tela não inventa uma.** O campo mostra `est. —` e o volume
  grava como gravava. Modelo sem peso no meio de outros que têm entraria como
  zero e faria a estimativa sair baixa — acusando divergência em cima de um
  volume certo —, então a tela diz `(1 modelo sem peso no ERP)` em vez de
  esconder o buraco.
- **Cancelar a senha não apaga o trabalho.** A janela do volume é **escondida**,
  não desmontada, enquanto o popup da senha está na frente; ao cancelar ela volta
  com os modelos escolhidos e as quantidades digitadas, mais um recado dizendo
  por que não gravou.

A régua é a **mesma função** do setor (`precisaDeLiberacao`), e a tolerância é a
mesma constante. Duas réguas para a mesma pergunta seriam o começo de uma
discordar da outra — o setor liberando o que o volume trava. Há teste contando as
ocorrências de `TOLERANCIA_DO_PESO`.

### Onde isso mora, e por que ali

Duas tabelas **nossas**: `producao_volumes` e `producao_volume_itens` — esta
última é a tabela dos **pacotes**, e não mudou de nome de propósito (renomear
quebraria a estação com o painel da versão anterior aberto na tela).
[`sql/volumes_do_acabamento.sql`](../sql/volumes_do_acabamento.sql) cria as
duas; [`sql/pacotes_do_acabamento.sql`](../sql/pacotes_do_acabamento.sql)
acrescenta o nome da caixa, e no pacote a chave própria e o responsável.

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
  ponto flutuante dá `0.30000000000000004`, e a diferença contra o peso do setor
  viraria um aviso âmbar em cima de nada.
- **`faltaEmbalar` nunca é negativo.** Se alguém embalar mais do que a tiragem,
  o que a tela precisa dizer é "não falta nada", não um número negativo.
- **`UNIQUE (id_int, setor, numero)`** protege contra dois operadores criando o
  V3 ao mesmo tempo. A janela traduz o erro do banco em *"Outro operador acabou
  de criar este volume. Feche e clique em + Volume de novo"* — a trava tem
  saída, como toda trava deste projeto.
- **No modo edição**, o que já está *naquele* volume não conta como ocupado.
  Sem isso, o próprio pacote apareceria como "0 livres" e o operador não
  conseguiria corrigir a quantidade que ele mesmo acabou de gravar.
- **Os campos do pacote são numerados pela POSIÇÃO** (`acab-vol-qtd-0`), e não
  pelo id do modelo. Dois pacotes do mesmo modelo na mesma caixa dariam dois
  campos com o mesmo id, e o navegador entregaria sempre o primeiro.
- **`+ Pacote` e `✕` leem o DOM antes de redesenhar.** Sem isso, as quantidades
  e os nomes das linhas de cima voltariam ao valor de quando a janela abriu. E o
  redesenho é **só da lista de pacotes** — remontar a janela inteira apagaria o
  peso que o operador já digitou.
- **O "livres" de cada linha desconta as outras linhas da mesma janela.** Sem
  essa parcela, dois pacotes do mesmo modelo apareceriam os dois com a tiragem
  inteira disponível, e o operador embalaria o dobro sem a tela dizer nada.
  Passar da tiragem não trava: a linha diz *"2.000 un a mais do que a tiragem"*
  em âmbar.

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
2. `.\publicar.ps1 "mensagem"` — publica o site e a Edge Function `painel`.
3. `.\publicar_agente.ps1 <versão nova>` — o agente vai junto, sempre: é ele que
   leva o `acabamento.js` novo para as estações, pela lista `PAINEL_ARQUIVOS`
   embutida no executável instalado.
