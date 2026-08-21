# Painel do Acabamento

> Menu criado em 20/08/2026, a pedido do usuário, para o setor que recebe o
> material **depois** da imposição e da impressão.

| | |
|---|---|
| Onde fica | `frontend/index.html`, seção `view-acabamento`, menu **Produção → Painel do Acabamento** |
| Quem desenha | [`frontend/acabamento.js`](../frontend/acabamento.js) |
| Banco | `pedidos_modelos.acabamento_status`, `.acabamento_responsavel`, `.acabamento_foto_url`, view `imposition_operadores` |
| SQL | [`sql/painel_do_acabamento.sql`](../sql/painel_do_acabamento.sql) + [`sql/acabamento_foto_do_modelo.sql`](../sql/acabamento_foto_do_modelo.sql) |
| Permissão | módulo **Painel do Acabamento** (`perm_acabamento_view` / `perm_acabamento_edit`) |
| Testes | [`tests/acabamento_harness.js`](../tests/acabamento_harness.js) + [`tests/test_painel_do_acabamento.py`](../tests/test_painel_do_acabamento.py) |

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
| Progresso | modelos impressos / total | modelos **revisados** / total |
| Status | Aguardando / Parcial / Impresso | Aguardando / Impresso / Em acabamento / Revisado |

O botão de recorte no topo, que na Produção é "Impresso", aqui é **"Revisado"**:
pedido com todos os modelos revisados sai da fila de trabalho e só reaparece com
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

## O pedido aberto

Clicar numa linha **não** abre a Imposição: abre, no lugar da lista, a mesma
listagem de modelos separada por produtos que o Portal do Pedido desenha — uma
caixa por produto, com nome real e selo do setor PCP, e dentro dela uma linha
por modelo. O botão **VOLTAR** devolve a lista.

A caixa de cada modelo é dividida **ao meio**: amostra de um lado, informações
do outro (pedido do usuário em 20/08/2026). Em tela estreita as duas metades
empilham.

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

### Os dois únicos controles

Por modelo, dois seletores, e nada mais é editável:

1. **Status do acabamento** — *— Status —* · Impresso · Em acabamento ·
   Revisado. Grava em `pedidos_modelos.acabamento_status`.
2. **Responsável** — os operadores de acesso local da gráfica, por nome. Grava
   em `pedidos_modelos.acabamento_responsavel`.

Os dois gravam na hora, direto no Supabase, pelo mesmo caminho que o painel já
usa para o `status_impressao`. A tela anda na frente do banco de propósito — o
operador não espera a rede para ver a própria escolha — e um aviso aparece se a
gravação falhar.

Quem tem só **VER** do módulo encontra os dois seletores travados; alterar exige
o **EDITAR**.

### A foto do material

Cada modelo tem um botão **📷 Fotografar**. Ele abre a webcam da estação numa
janela, com *Fotografar*, e depois *Repetir* ou *Salvar foto*. A foto vai para o
Storage e o endereço dela fica em `pedidos_modelos.acabamento_foto_url`; a
miniatura aparece na própria caixa do modelo, e amplia no mesmo lightbox da
amostra. Refazer grava um arquivo novo e troca a URL — o anterior fica no
bucket, porque apagar arriscaria remover a foto que outra estação acabou de
tirar.

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

**Aguardando · Impresso · Em acabamento · Revisado.**

Quando ninguém escolheu nada, o estágio é **derivado** do setor anterior: modelo
com a impressão concluída entra como *Impresso*; qualquer outra coisa entra como
*Aguardando*, e a caixa dele fica **marrom**. Foi o pedido do usuário em
20/08/2026, ao ver a tela pronta: um modelo que ainda não saiu da impressora não
pode aparecer como impresso, e a opção vazia *"— Status —"* não dizia nada a
quem estava olhando.

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

## A paleta: a mesma forma, em marrom escuro

A tela usa, de propósito, a **mesma marcação** da tela de Produção — as mesmas
classes `prod-*`, os mesmos cards, a mesma tabela. É isso que faz as duas se
parecerem e envelhecerem juntas: mexer no layout de uma mexe na outra sem
ninguém precisar lembrar.

O preço apareceu com a tela rodando: de relance, na estação, as duas eram a
mesma tela. Em 20/08/2026 o usuário pediu o Acabamento derivado de **marrom
escuro**, para o olho separar uma da outra.

A pintura mora em dois lugares, e nenhum deles alcança a Produção:

- **`frontend/style.css`**, no fim do arquivo, num bloco em que **toda regra
  começa por `#view-acabamento`**. Trocar a cor das classes `prod-*` resolveria
  aqui e repintaria a tela que a gráfica usa todo dia. Está no fim porque o
  bloco `prod-*` aparece **duas vezes** neste CSS (resto de colagem antiga), e
  regra escrita depois vence as duas. Há teste varrendo o bloco atrás de
  qualquer seletor sem o id.
- **`frontend/acabamento.js`**, na constante `MARROM`, para os tons que o
  arquivo escreve inline (a caixa do produto, o contorno, o número do pedido).

| | Produção | Acabamento |
|---|---|---|
| Superfície dos cards | `#1e293b` ardósia | `#2a1d13` marrom |
| Cabeçalhos | `#334155` | `#3d2b1c` |
| O que está ligado | azul `#3b82f6` | âmbar `#f59e0b` |
| Nº do pedido | gradiente azul | gradiente âmbar/marrom |
| Progresso | verde | âmbar |

Os quatro estágios também são da família terra, separados pela luz e por um
passo pequeno de matiz — *Aguardando* `#3a2a1c`, *Impresso* `#2f2216`,
*Em acabamento* `#3a3324`, *Revisado* `#1e3320`. O azul escuro que o *Impresso*
tinha era o que sobrava da Produção dentro desta tela.

**O que continua igual ao da Produção, de propósito:** o selo de prazo de
entrega (`formatPrazoBadge`) e a miniatura da coluna Preview
(`previewDaArteDoPedidoHtml`). As duas funções são compartilhadas com a Produção
e com a Lista de Arte; recolori-las aqui mudaria as três telas.

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

## Duas armadilhas de quem for mexer

1. **Id repetido.** As duas telas vivem no MESMO documento. Todo id do
   acabamento termina em `-acab`; `getElementById` devolve o primeiro que
   encontrar, e um id repetido faria o painel de um setor escrever no do outro.
   Há teste varrendo o `index.html` inteiro atrás de ids duplicados.

2. **`data-prazo` é da Produção.** O `updateFiltroPrazoBotoes` do `script.js`
   varre `button[data-prazo]` no documento inteiro. Os botões de prazo do
   acabamento usam **`data-prazo-acab`** justamente para não serem repintados
   pelo painel vizinho — e vice-versa.

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
