# Painel do Acabamento

> Menu criado em 20/08/2026, a pedido do usuário, para o setor que recebe o
> material **depois** da imposição e da impressão.

| | |
|---|---|
| Onde fica | `frontend/index.html`, seção `view-acabamento`, menu **Produção → Painel do Acabamento** |
| Quem desenha | [`frontend/acabamento.js`](../frontend/acabamento.js) |
| Banco | `pedidos_modelos.acabamento_status`, `.acabamento_responsavel`, `.acabamento_foto_url`, view `imposition_operadores`, e `propostas_os_setores.peso_real_kg` (do parceiro — ver REGRAS_BANCO) |
| SQL | [`sql/painel_do_acabamento.sql`](../sql/painel_do_acabamento.sql) + [`sql/acabamento_foto_do_modelo.sql`](../sql/acabamento_foto_do_modelo.sql) + [`sql/acabamento_status_pronto.sql`](../sql/acabamento_status_pronto.sql) |
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
| **Estação** (agente na 9000 ou localhost) | `/api/peso-setores/<pedido>`, `/api/setor-concluido/<pedido>` e `/api/expedicao/<pedido>` do agente → Edge Function `acesso-estacao` com o `ACESSO_AGENTE_SEGREDO` → `service_role` |
| **Site, com login do Vibe** | direto no PostgREST, que é o que a sessão autoriza |
| **Site, sem login** | o box mostra os setores e a frase que resolve: entrar com a conta |

É o mesmo desenho do catálogo de fontes, e pela mesma razão: a `service_role`
nunca vai para as estações — ela abre cliente, proposta e financeiro do parceiro.

A regra de gravação mora **uma vez só**, em
[`supabase/functions/_compartilhado/pesos.ts`](../supabase/functions/_compartilhado/pesos.ts).
O agente não valida nada por conta própria: converter a vírgula e conferir a
lista de setores nos dois lugares criaria duas verdades, e a que vale é a do
servidor, que conhece o `CHECK` da tabela.

São **três** as chamadas ao agente em toda a tela — o peso, o carimbo do setor e
o envio para a expedição —, e todas são da ficha de expedição. Impor, gerar PDF,
imprimir e perguntar a versão do NewProd continuam fora; há teste contando as
rotas e exigindo que exista **um único** `/api/` no arquivo.

`propostas` passa pela mesma porta, e não porque precise: hoje a política
`Enable read access for all` daquela tabela é ALL/public/true, então a chave
anônima escreve nela. A rota existe assim mesmo para que o caminho da estação
seja **um só** — no dia em que aquela política for fechada, a expedição não cai
junto.

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
produção. O pedido sai da fila do Acabamento na hora, e a tela volta para a
lista.

A conferência é refeita **dentro** da função, e não só no `disabled`: quem
digitar `AcabamentoPainel.expedir(...)` no console passaria direto pelo atributo,
e o preço seria um pedido expedido com material na mesa.

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

Por modelo, dois seletores, e nada mais é editável:

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
| `#0a2472` | superfície dos cards | `#4a61e8` | azul royal |
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
| Superfície dos cards | `#1e293b` ardósia | `#0a2472` azul profundo |
| Cabeçalhos | `#334155` | `#123a99` |
| O que está ligado | azul `#3b82f6` | `#4589d7` |
| Nº do pedido | gradiente azul-ardósia | gradiente `#2b32af` → `#120a8f` |
| Progresso | verde | `#4589d7` |

### O que a paleta NÃO alcança: a cor por status

As quatro cores de fundo da caixa do modelo — *Aguardando* `#3a2a1c`,
*Impresso* `#162037`, *Em acabamento* `#32352e`, *Pronto* `#14301f` — **não
acompanham a paleta da tela**, e já atravessaram duas repaginações sem mudar.

Eu as tinha trazido para a família terra em 20/08/2026, e o usuário mandou
devolver: elas dizem em que ponto o modelo está, e é a primeira coisa que se lê
na tela. Mexer nelas para combinar com o fundo é trocar informação por
decoração. Há teste travando as quatro.

Com a tela azul isso ficou mais visível: o marrom do *Aguardando* contrasta
forte com a página, e o azul escuro do *Impresso* quase se confunde com ela.
Isso é para o usuário decidir, não para eu ajustar sozinho — a regra é que cor
de estado não acompanha paleta.

**O que MUDA junto com a paleta, e por quê:** os números das métricas da coluna
lateral. Eles não dizem estado — são a identidade de cada métrica, iguais em
todo desenho. A única exceção ali é *Pedidos em Atraso*, que fica vermelho:
alerta não se repinta para combinar com a tela.

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
