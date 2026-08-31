# Changelog — Ideal Imposition

Registro cronológico de todas as funcionalidades implementadas, correções e melhorias.

---

## [2026-08-31] — A escala da arte vale também para o upload comum

Pedido do usuário, logo depois de a escala entrar no modo PDF Multi-Página:
**"utilizar mesma regra para escalar o pdf multi-pagina para escalar artes feitas
pelo upload normal"**.

Os dois campos **H** e **V** deixaram de morar só na janela do modo PDF: agora
ficam embaixo da prévia de qualquer modelo, e **aparecem sempre que houver arte na
tela** — PDF ou imagem, subida pelo botão 🖼️ Arte ou pelo modo multi-página.

**No motor não mudou uma linha**, e é esse o ponto: a régua já era a mesma. O
`_arte_na_celula()` não sabe de onde veio o arquivo — ele centraliza, escala e
recorta a arte que estiver colada na célula. O que estava preso ao modo PDF era só
a interface.

Na tela, a escala entrou nas duas camadas de arte do `drawAmostraFace()`:

- **Arte em PDF**: multiplica a escala do tamanho real e desenha já na medida
  final, com o `transform` do PDF.js — nada é ampliado depois, então a arte
  continua nítida em qualquer escala.
- **Arte em imagem**: multiplica o encaixe proporcional que já existia (o mesmo
  que o motor faz em `_load_base_as_pdf`) e recentraliza na peça.

A caixa de campos passou a ser escrita uma vez e usada nos três desenhos do card
(modo PDF, arte comum, arte com verso), e quem decide se ela aparece é
`atualizarCaixaDeEscalaDaArte()` — uma regra só, em um lugar só. Salvar redesenha
pelo caminho daquele card: o leitor de páginas no modo PDF, a composição das
camadas na arte comum.

Medido no navegador com uma arte de 180 × 50 mm numa célula de 200 × 60: a 100% a
tinta sai 1063 px de largura, a 50% sai 531, e a célula continua 1181 px nas duas
— só a arte muda, e o centro não se move.

O harness subiu de 37 para 48 conferências.

---

## [2026-08-31] — Modo PDF Multi-Página: escala da arte, em % por eixo

Pedido do usuário: **"quando a arte for feita upload pelo modo 'PDF Multi-Página',
além de trazer o pdf a janela de visualização, vamos adicionar 2 inputs de escala
para o pdf, % horizontal e % vertical, vai escalar apenas o pdf, apenas a camada
da arte (pdf) e vai utilizar mesma escala para arte no motor de impressão,
imposição, gerar pdf"** — e, sobre o ponto de apoio: **"ao escalar o pdf
multi-páginas vai manter centralizado a célula de impressão e visualização"**.

Dois campos, **H** e **V**, embaixo da navegação de páginas da janela do modo PDF.
Eles esticam **só a camada de arte**, cada eixo por conta própria, sempre em torno
do centro da célula. A numeração não muda de tamanho nem de lugar.

**100% é o tamanho natural do arquivo** — exatamente o que o motor sempre fez —,
então nenhum pedido que já existe muda de comportamento.

Decisões que o usuário tomou junto com o pedido:

- **A escala é do modelo**, e fica gravada: colunas `arte_escala_h` e
  `arte_escala_v` em `pedidos_modelos` (`sql/arte_escala_do_modelo.sql`). Reabrir
  o pedido, reimprimir ou refazer uma célula semana que vem sai igual.
- **Passando de 100%, a arte é aparada** na célula mais metade do vão até a
  vizinha — dá para usar o vão como sangria, e nenhum ingresso invade o outro. O
  limite nunca é menor do que o espaço que a arte já ocupava a 100%, senão uma
  arte que já nascia sangrada encolheria ao receber 101%.
- **Frente e verso usam a mesma escala**: é um arquivo só, e as duas faces têm de
  bater no corte.
- Vale na janela do modo PDF, na **prévia da imposição** do Pedido e no motor
  (imposição, impressão e o Gerar PDF).

No motor, as **sete** colagens de arte — frente e verso, com e sem giro, folha de
um modelo ou folha combinada — passaram a usar uma função só,
`_arte_na_celula()`, que centraliza, escala e devolve o recorte. Numa folha
combinada cada arte leva a sua escala (`multi_artes[].escala_h`/`escala_v`), então
o modelo A pode sair a 98% ao lado do B a 100%.

**Nada é rasterizado**: esticar é trocar o retângulo de destino do
`show_pdf_page`. O `keep_proportion=False` é o que faz os dois eixos valerem —
com `True` o PyMuPDF encaixaria a arte proporcionalmente e ignoraria metade do que
o operador digitou.

Na janela, o canvas passou a ser a **célula**, com a arte desenhada dentro. Antes
ele era a própria página da arte, e por isso escalar não teria como aparecer: a
moldura crescia junto com o desenho.

- `tests/test_escala_da_arte.py`: oito medições que impõem de verdade e leem a
  tinta da folha — centralização, eixos independentes, recorte, pose girada.
- `tests/escala_da_arte_harness.js`: 37 conferências da janela, do valor digitado
  e da fiação até o motor.

Documentado em `docs/DOCUMENTACAO.md`, seção 11.

> [!NOTE]
> A tela do cliente (link de aprovação) desenha o PDF por conta própria e continua
> mostrando a arte no tamanho natural. Combinado com o usuário na hora do pedido.

---

## [2026-08-31] — Lista de Arte: pedido novo volta a nascer em "Em Arte"

Relato do usuário, no pedido 21413: **"o status real dele é em_arte, deveria estar
em arte, não em aguardando"** e, logo depois, **"está acontecendo com todos os
pedidos, estão indo para status Aguardando, mesmo sem ter sido marcada arte como
pronto ou encaminhada ao atendimento"**.

O ERP cria a linha de `pedidos_artes` com `status = 'AGUARDANDO'`, que quer dizer
que a arte espera **o designer**. Essa palavra estava dentro da lista
`ARTE_EM_APROVACAO` do `script.js`, ao lado de `AGUARDANDO_APROVACAO`, que quer
dizer o **contrário** — a arte já foi ao cliente e espera a resposta dele.

O efeito: todo pedido novo nascia classificado como "Aguard. Aprovação" e caía na
Fila de Aprovação. A fila do designer aparecia vazia enquanto o trabalho se
acumulava fora dela.

O banco confirmava a leitura do usuário sem ambiguidade: dos pedidos com
`AGUARDANDO`, **nenhum** tinha link do cliente gerado — ou seja, nada tinha sido
enviado a ninguém — e todos tinham `propostas.em_arte = true`.

- `AGUARDANDO` saiu de `ARTE_EM_APROVACAO` e entrou na lista nova
  `ARTE_COM_O_DESIGNER`, junto com `EM ARTE` e `ARTE_EM_ANDAMENTO`.
- O ramo novo é consultado **depois** do de aprovação: link do cliente gerado
  continua mandando mais do que a palavra do ERP.
- O mapa do filtro de status passou a mandar `AGUARDANDO` para "Em Arte", para o
  filtro concordar com o badge.
- 16 verificações novas no `tests/lista_arte_harness.js`, incluindo uma que
  proíbe a palavra crua de voltar à lista de aprovação — o erro se refaz com uma
  vírgula.

Documentado em `docs/lista_de_arte.md`, na seção "As duas palavras AGUARDANDO".

---

## [2026-08-29] — Montagem: a linha da lista volta ao modelo

Pedido do usuário: **"depois de ter modelos carregados na montagem, ao selecionar
a linha do modelo, carrega o modelo para possibilitar adição de novas células
deste modelo"**.

Clicar numa linha devolve aquele pedido e aquele modelo ao compositor, com o
cursor já no campo de posições. Refazer célula é trabalho de descoberta — o
operador acha mais uma pulseira estragada depois de já ter montado a folha —, e
sem isso eram quatro gestos para dizer o que a linha já sabe.

O campo fica **vazio**, e não preenchido com o que já foi pedido: ele vem
acrescentar, e o `adicionarNaMontagem` soma ao grupo que existe.

A linha ativa fica marcada, e é **derivada** do que o compositor mostra — não um
índice guardado à parte, que ficaria mentindo assim que o operador escolhesse o
modelo pelos seletores. O × continua sendo o ×: ele para a propagação, senão
tirar um modelo também levaria o compositor de volta a ele.

Harness da tela: 61 → 69.

---

## [2026-08-29] — Montagem: o PDF parou de sumir, e agora tem para onde ir

Relato do usuário: **"parou de gerar o pdf, deve ter a opção de escolher o folder
onde será gerado o pdf, e a opção de abrir o pdf gerado na tela"**.

### O PDF não parou de ser gerado — ele era jogado fora

O log de diagnóstico do agente registrou as três tentativas, todas com as duas
artes, e uma reprodução do mesmo payload contra a estação devolveu
`HTTP 200 · application/pdf · 121 KB`. O motor gerava; o painel é que perdia o
arquivo.

A entrega era `window.open(blobUrl, '_blank')`. O navegador só deixa abrir janela
nova enquanto o gesto do operador ainda vale — no Chrome, **cinco segundos** —, e
uma folha montada demora mais. O bloqueio é **silencioso**, e o aviso seguinte
ainda dizia *"Montagem gerada"*: a tela afirmava sucesso com o PDF no lixo.

É um defeito que passa em qualquer teste rápido — trabalho pequeno termina dentro
dos cinco segundos — e falha em produção.

### Onde gravar o PDF

Seletor novo no rodapé da prévia, com as pastas que **esta estação** já
autorizou, e um botão que abre o **seletor nativo do Windows na estação**. Mesma
lista, mesmo seletor e mesmo `soltar()` do hot folder do Pedido — e a estação
recusa gravar em pasta que não esteja na lista.

Quem abre o seletor e quem escreve no disco é o **agente**, nunca o navegador:
cada estação da gráfica usa um navegador diferente, e nada aqui pode depender de
permissão ou configuração feita nele. A escolha fica lembrada na máquina, e a
dica embaixo do seletor diz o que vai acontecer com o arquivo **antes** de gerar.

Sem pasta escolhida, o PDF desce pelos downloads do navegador — caminho que
sempre funciona, e por isso ele é a primeira opção da lista. Se a gravação falhar
por motivo do disco, o trabalho **não se perde**: desce pelo navegador e o aviso
diz o que falhou.

### Abrir o PDF na tela

Caixa nova, **marcada por padrão**: ao terminar, o PDF abre sobre o painel, na
mesma *lightbox* que o anexo do pedido já usa. A lightbox passou a aceitar o tipo
**dito** — um `blob:` não tem o nome do arquivo dentro do endereço, e adivinhar
mostraria o PDF como imagem quebrada.

### Testes

O harness da tela foi de 45 para 61 verificações, inclusive as três que importam:
sem pasta o PDF desce pelo navegador; com pasta quem grava é a estação; e pasta
que falha na hora de gravar **não perde o trabalho**. Mais dois testes de fonte,
um deles pela ausência do `window.open` — com os comentários removidos antes da
busca, porque a explicação no código **cita** a função.

---

## [2026-08-29] — Montagem: o número do modelo no papel, e a tiragem na tela

Dois pedidos do usuário sobre a tela nova.

### Imprimir o número do modelo em cada item

O mesmo conceito das *Opções do modelo* do Pedido, com a mesma mecânica: o motor
imprime `arte["nome"]` deitado na borda de cada item, e **esse campo é o único**
que decide se ele sai. Marcada a caixa, o payload leva o número; desmarcada, leva
vazio. Nasce **desmarcada**.

Numa folha que mistura pedidos, é por essa marca que se separa o material depois
de cortar — ela serve mais aqui do que no Pedido.

Duas diferenças, deliberadas: é **uma escolha para a montagem inteira** (a folha
mistura modelos, e uma caixa por linha faria decidir o mesmo N vezes para o mesmo
papel), e ela **não é gravada no modelo** — a Montagem é reposição avulsa, e
marcar aqui não pode mudar como aquele modelo sai na próxima tiragem dele.

### A tiragem de cada modelo, na lista

Coluna nova, entre Modelo e Posições: quantos itens aquele modelo imprime ao
todo. É contra esse número que a posição vale — `#340` só existe num modelo de
1.920, e sem ele na tela o operador digita no escuro. Vem do **banco** quando há
banco, e não da quantidade contratada.

**Sete verificações novas** (38 → 45), inclusive a que importa: marcada, cada
arte leva o número do **seu** modelo, e não um número só para a folha inteira.

---

## [2026-08-29] — O banner "Atualizar Agora" apontava para um arquivo que não existe

Relato do usuário: **"Erro ao atualizar agente: Failed to fetch"**.

### O que a investigação achou

O banner do painel carregava **dois contratos mortos**, e os dois foram
conferidos, não deduzidos:

| O que ele fazia | O que é hoje |
|---|---|
| mandava `download_url` = `.../app/ideal-imposition-agent.exe` | esse endereço responde **404** — o agente virou MSI no Storage do Supabase |
| mandava o campo no corpo da requisição | o `/api/update` **ignora** o corpo de propósito |

A segunda é a que importa: aceitar a origem do download vinda da requisição
transformava o endpoint numa **porta de execução remota** — qualquer site aberto
no navegador do operador conseguia mandar o agente baixar e executar um binário.
Isso foi fechado no agente; o painel é que continuou falando o contrato antigo.

E o `/api/update` daqui responde **200**, com preflight e tudo — medido contra o
agente 1.2.262 desta máquina. Ou seja: o "Failed to fetch" não vinha do endpoint,
vinha de **para onde** o banner estava pedindo.

### As três correções

1. **O agente é procurado no momento do clique** (`_baseDoAgenteAgora`). O banner
   nascia com um `baseUrl` capturado na criação, e ele é mostrado por **dois**
   caminhos — um deles sonda uma lista que começa pelo endereço da **própria
   página**. Pedir a atualização para a Vercel não atualiza agente nenhum, e
   falha exatamente assim.
2. **O POST virou requisição simples**: sem corpo e sem `Content-Type`. Cada
   preflight é mais um jeito de dar "Failed to fetch" sem dizer por quê — e o
   corpo que ele carregava nem era lido.
3. **A falha diz a saída**: *"Use o menu da bandeja do NewProd → Atualizar
   agora"*. Aquele caminho não passa pelo navegador e sempre funciona. Toda trava
   desta aplicação precisa dizer como sair dela.

**Cinco testes novos** (`tests/test_banner_de_atualizacao.py`), inclusive o que
guarda a trava do lado do agente: o `/api/update` não pode voltar a **ler** a
origem do download da requisição.

> Nota de método, terceira vez hoje: o primeiro desses testes reprovou porque eu
> procurei a **palavra** `download_url`, e ela está na docstring que explica a
> remoção. Procurar a citação reprova a explicação junto com o defeito — a busca
> tem de ser pela **leitura** do campo, não pelo nome dele.

---

## [2026-08-29] — A Montagem não sabia o formato (v772)

Relato do usuário logo depois da v771, ao gerar o PDF:

```
Erro 500: 400: Formato não encontrado.
```

### A causa, e a segunda falha que ela escondia

**`formato_id` não existe em `pedidos_modelos`.** Quem o preenche na memória é o
**desenho da fila do Pedido** (`renderPedOSQueue`), a partir do produto do ERP. A
Montagem carrega os modelos com o `loadOSItens` e nunca desenha aquela fila —
então os itens chegavam ali **sem formato**.

O erro do motor foi o sintoma visível. **O invisível era pior:** o
`porQueNaoCabeNaMontagem` comparava `'' !== ''`, falso nas quatro conferências, e
devolvia *"cabe"* **sempre**. A regra que o usuário decidiu — formato, cor, saída
e face — estava **inerte**. Uma folha com dois materiais diferentes teria passado
sem um aviso, e a descoberta seria na impressora.

### O conserto

A Montagem passou a resolver o formato pela **mesma regra** do desenho da fila —
produto do item → `id_formato` do produto → o formato cujo `id_formato_num` casa
—, a guardar o resultado numa **peça normalizada** que a conferência e o payload
leem (antes cada um resolvia por um caminho, e podiam discordar), e a **recusar**
a célula cujo formato ela não consegue resolver, dizendo o que fazer.

Ela **não grava** o resultado de volta: o desenho da fila escreve com
`autoSaveOSItemField`, mas a Montagem é tela de leitura e não carimba pedido de
ninguém.

### A lição, que vale além desta tela

Um campo que **parece** vir do banco pode ser preenchido pelo *desenho* de outra
tela. Tela nova que lê modelos não pode supor que outra tela já rodou.

E o formato do defeito repete: **a conferência que compara campos vazios não
falha — ela passa.** É a forma mais silenciosa de uma regra morrer, e é a
terceira vez em dois dias: a trava da gerência (28/08) e a trava do Hot Folder
(29/08) também nasceram inertes, as duas pegas por harness.

**20 verificações novas** no núcleo (42 → 62), e o harness da tela passou a montar
o item **sem `formato_id`**, como ele chega do banco, exercitando a resolução de
verdade em vez de semear o resultado pronto.

---

## [2026-08-29] — Montagem: refazer células de pedidos diferentes numa folha só

> *"vamos criar uma nova página/menu, vai se chamar Montagem, ela será utilizada
> para refazer células de um mesmo produto (triband, Mobi, pvc, etc...) mesmo
> quando elas são de pedidos diferentes"*

O **Refazer Célula** da tela do Pedido já repõe o item que estragou: o operador
digita `1,6,22` e o motor compacta numa folha, sem buraco. O limite é que a folha
é de **um modelo de um pedido** — e a gráfica não estraga assim. Estraga uma
célula de um pedido, duas de outro, todas do mesmo Triband, e paga uma folha
inteira de PVC para repor três cartões.

Tela inteira em [`docs/montagem.md`](montagem.md).

### Nenhum Python mudou, e esse é o achado

Duas coisas já existiam no motor, e a soma delas fez a Montagem ser só de tela:

- **O motor já monta folha com pedidos diferentes** (18/08/2026, o `multi_artes`
  do aproveitamento de folha). Cada arte carrega o seu `pedido`, e item que chega
  sem saber de onde veio **levanta erro** em vez de sair com a coluna do pool de
  outro pedido.
- **O `refazer_celulas` indexa o `multi_map`** — a lista ordenada dos itens do
  trabalho inteiro —, e cada entrada carrega `modelo`, `pedido`, `csv_row` e
  `local_idx` do item **original**.

**E é isso que torna a tela segura.** O código do QR Ideal é
`indice(pedido, modelo, item)`, determinístico: refazer a posição 6 do modelo X
do pedido Y devolve **exatamente o mesmo código** do original. A célula refeita
substitui o ingresso perdido — não cria um segundo ingresso válido para a mesma
entrada. Sem essa propriedade, esta tela seria uma fábrica de entradas
duplicadas.

Um teste falha se alguém mexer no `engine.py` por causa desta tela.

### O que a tela faz: traduzir

O operador pensa em *"a posição 6 do modelo 1000565"*; o motor espera posições no
fluxo combinado, porque monta o `multi_map` arte por arte, cada uma com a **sua
tiragem inteira**:

```
1000565  qtd 3000  #1 #6 #22   →  1, 6, 22
1000589  qtd 1920  #340        →  3000 + 340 = 3340
1000412  qtd  150  #7          →  4920 + 7   = 4927
```

> ⚠️ O deslocamento é a **tiragem** do modelo anterior, e não o número de células
> pedidas dele. Somar 3 em vez de 3.000 imprimiria os itens errados, com os
> códigos de QR de outros ingressos — descobertos na portaria, com a fila na
> porta. É a função mais delicada do arquivo, e tem teste próprio.

Pelo mesmo motivo, cada arte leva a **tiragem inteira** no payload: recortar o
banco seria mais leve e embaralharia todos os índices.

### As regras, decididas com o usuário

Ele abriu o pedido dizendo que a única condição seria o mesmo **formato**.
Apontado que três das seis conferências do `porQueNaoCombina` são
**impossibilidade física** — cor (a folha é de um material só), saída (o tamanho
da folha) e face (o verso existe ou não) —, ele decidiu manter quatro:

| Impede | Não impede |
|---|---|
| formato, cor, saída, face | Sequencial × Blocado, modo PDF |

Sequencial × Blocado ficou de fora **de propósito**: ali a ordem das células
decide como a pilha é cortada, e aqui não há pilha — a montagem compacta numa
folha, na ordem digitada. Recusar por isso barraria combinação legítima sem
proteger nada.

Mais três decisões dele: escolher por **pedido → modelo → posições, acumulando**
(sozinho, "6" é ambíguo entre pedidos); oferecer os pedidos **impressos nos
últimos 30 dias**, mais busca por número; e **sem senha da gerência** — é
trabalho normal do operador.

### A tela

Abre **vazia**, e é aí que precisa se explicar: o operador chega com uma folha
estragada na mão, não com a documentação lida. A **trava do formato nasce
escondida** e aparece com a primeira célula — não há seletor de formato para
preencher, a folha passa a dizer o que aceita a partir do que ele já fez. A
**recusa aparece ao escolher o modelo**, não ao clicar em Adicionar, e diz o que
fazer além do que está errado. O **selo é o mesmo do Pedido**, com a mesma regra
de cor.

Adicionar o mesmo modelo duas vezes **soma ao grupo** em vez de criar um segundo:
duas artes iguais fariam o deslocamento contar aquela tiragem duas vezes.

### Testes

**80 verificações novas** — 42 no núcleo e 38 na tela, desenhada num Chrome de
verdade.

Vale registrar como método: dois dos testes da tela falharam na primeira
execução por **erro de conta no próprio teste** — eu somei as bases errado, e o
código estava certo. Foi o harness corrigindo quem o escreveu, que é exatamente
para isso que ele serve.

**E a suíte pegou o que faltava para a gráfica receber a tela.** O
`test_painel_estacao.py` reprovou porque o `montagem.js` não estava na lista de
sincronismo da estação (`security_config.py`): o `index.html` que a estação baixa
já pedia o script, e sem o nome ali o menu novo abriria **em branco**, com um 404
no console. A tela estava pronta e a gráfica não a receberia — mesmo caso do
`acabamento.js` em 20/08 e do `avisos.js` em 23/08.

**Uma promessa que a tela não cumpria também foi consertada antes de sair.** O
seletor de pedido dizia *"escolha ou digite o número"*, e um `<select>` não se
digita. A busca por número — que o usuário escolheu — virou um campo próprio ao
lado.

---

## [2026-08-29] — Acabamento da tela do Pedido, e um freio que faltava

Continuação da reforma do dia anterior (v764 a v769), em duas sessões de
trabalho. A tela inteira, com as regras e as armadilhas, virou documento:
[`docs/tela_do_pedido.md`](tela_do_pedido.md).

### O que mudou na tela

- **Uma escala só, a 100%.** A fila tinha sido desenhada contando com o
  `zoom: 0.8` que foi removido na véspera, então passou a desenhar 25% maior do
  que sempre foi — enquanto a janela de visualização, que usa os tamanhos do
  aplicativo, já estava certa. O usuário descreveu a distorção com precisão: *"ao
  entrar na tela do pedido ela é melhor representada quando visualizada em 80%,
  e ao clicar no modelo ele fica melhor representado em 100%"*. Cada medida da
  fila foi multiplicada por 0,8.
- **A largura foi repartida.** Qtd, N. inicial, N. final, Bloco e Cor a 65% do
  que tinham; os 230 px liberados foram para o **nome do modelo** (150 → 380 px),
  que é por onde o operador reconhece a peça.
- **Cada modelo virou um quadro**: cantos arredondados e respiro entre um e outro.
- **O que é daquele modelo desceu para a janela dele**: o selo da sobra ("20
  folha(s) · 200 itens · a folha fecha certo") foi para o cabeçalho, e as
  **Opções do modelo** (modo de impressão, imprimir o número) para a coluna
  esquerda. As duas ficavam no topo da página, longe do modelo de que falavam. As
  seis fichas de sumário saíram: o selo diz numa frase o que elas diziam em seis.
- **Cores dos estados** revistas pelo usuário — modelo selecionado com fundo
  `#2c1669` e fio `#920fc3` —, e a janela passou a alinhar a própria base com a
  base da tela ao abrir.
- **Dois seletores saíram da página**: a *Regra de Paginação* e o *Formato* do
  produto. O usuário circulou os dois numa captura: *"esses 2 drops não devem
  aparecer nesta página"*.

### A linha do modelo passou a pedir a senha da gerência

> *"os imputs, drops, cores, etc... da linha do modelo só podem ser alteradas
> mediante apresentação da senha da gerência, mesma senha apresentada na
> divergência de peso no painel do acabamento"* — e, em seguida: *"o status da
> impressão continua livre"*.

Ficam atrás da senha **Qtd, N. inicial, N. final, Bloco, os campos de camarote,
Cor, Numeração e Verso**. Continuam livres o **Status da impressão** (marcar o
que já saiu é o trabalho normal do operador; pedir senha ali pararia a produção)
e a caixinha da folha combinada, que não altera dado nenhum.

A linha travada mostra um **cadeado** que explica a regra e abre a caixa da
senha — trava com saída visível, não campo que não responde. Liberado um modelo,
ele fica liberado **até a janela dele ser fechada**.

A senha é conferida **no servidor**, pela *mesma* função do Painel do Acabamento
(`conferirSenhaDeLiberacao`, exportada de lá), para não existirem duas políticas
de senha no produto. Senha errada, rede fora ou função ausente: nada é liberado.

**Ela nasceu inerte, e o harness pegou.** Os seletores de Cor e Numeração
acabaram com **dois atributos `onmousedown`** — um do preenchimento tardio, outro
da trava. O navegador guarda o primeiro e ignora o segundo **em silêncio**. A
correção foi unificar os dois cuidados numa função só, `portaDoSeletor`, porque
os dois moram no mesmo gesto.

### Por que o mesmo modelo mostrava 70 e depois 192 folhas

Pergunta do usuário sobre o modelo 1000589 do pedido 21202. A `drawPedPreview`
conta os itens **pela faixa numérica** enquanto o banco não desceu, e **pelo
número de linhas do banco** assim que ele chega. 1.920 ÷ 10 = 192; 700 ÷ 10 = 70.

A regra está certa — o banco manda, porque é ele que vira papel. O número
oscilando é sintoma de **divergência no dado**: o banco ligado não entregava a
quantidade contratada. O dado foi corrigido no ERP entre as duas consultas.

Isso levou a uma **conferência somente-leitura dos 51 modelos** do pedido, a
pedido do usuário (*"apenas analizar, não alterar"*). **Os 51 estão certos** — o
que cada modelo imprime bate com o contratado.

**Mas a primeira versão dessa conferência acusou uma divergência que não
existia**, e vale registrar: eu disse que o modelo 1000565 tinha 3.000
contratadas contra 12.806 linhas no banco, e que imprimi-lo geraria 12.806 peças.
O usuário desfez com a tela: *"o 1000565 mostra 300 folhas e já foi impresso
corretamente"*.

Erro meu, com nome. Eu contava `jsonb_array_length(csv_data)` — o banco **cru** —
e comparava com a quantidade contratada. O produto não usa esse número: o
`fatiaCsvDoItem` aplica antes o corte de **`linhasComDadoDaNumeracao`**, e linha
sem dado nas colunas que *aquela* numeração lê não é célula daquele modelo. O
"CAMAROTE PRESIDENTE" é banco-mestre de 12.806 linhas com 3.000 preenchidas na
coluna `Codigo`. A tela nunca esteve errada.

**A regra que fica:** conferência SQL tem de reproduzir a regra que o código
aplica, não uma aproximação dela — e quando a tela discorda da minha consulta, o
errado é a consulta. As duas consultas afetadas foram reescritas com o corte
certo, e trazem o episódio no cabeçalho: alarme falso ensina o operador a ignorar
o aviso, e aí ele não serve no dia da divergência de verdade.

As quatro consultas ficaram em [`sql/consultas/`](../sql/consultas/), e tudo está
em [`docs/conferencia_pedido_21202.md`](conferencia_pedido_21202.md) — junto com
a investigação, ainda aberta, de um INP de 2.105 ms.

### O freio que faltava no `publicar.ps1`

A **v765 foi ao ar com erro de sintaxe no `script.js`** — uma edição que removia
um *toast* levou junto o `}` de um bloco. Erro de sintaxe derruba o **arquivo
inteiro**: 41 mil linhas que o navegador não carrega, e o painel morre. A v766
consertou três minutos depois.

Nenhum freio da publicação lia o frontend: rascunho, segredo e "o motor sobe?"
olham outra coisa, e os harnesses exercitam **pedaços** do script, nunca o
arquivo todo. Agora existe o **"Conferindo se o painel abre"** — um
`node --check` em cada `.js` do frontend, que custa menos de um segundo e teria
parado aquela publicação. Quatro testes novos travam o freio, e um quinto
confere que o painel que está na pasta agora passa por ele.

### O Hot Folder virou botao proprio, com ladrilhos de pasta

> *"no painel de producao, ao editar o pedido, vamos tirar as opcoes de Hot
> Folder de dentro das configuracoes de impressao, sera um botao a parte, ao
> clicar e selecionar ele ja estara ativo e vai mostrar abaixo do botao icones de
> pastas coloridas e com nomes das pastas, selecionalas escolhe o hot folder"*

Ele era uma caixa de marcar dentro de *Configuracao de Impressao*, com o caminho
da pasta num campo de texto. Agora e' o **segundo grupo da coluna direita**, antes
da Configuracao — ele decide **para onde** o material vai, e o resto daquele grupo
so' faz sentido depois dessa escolha.

**A lista de pastas ja existia, e era invisivel.** O `hot_folders.json` da estacao
guarda as pastas autorizadas desde sempre, mas nada a mostrava: cada trabalho
recomecava do seletor nativo do Windows, e o operador tinha de reencontrar no
disco uma pasta que a maquina ja conhecia. Faltava so' a casca HTTP —
`GET /api/hotfolder/listar`.

Cada pasta virou um **ladrilho**: icone de pasta colorido, o nome (o ultimo trecho
do caminho), o caminho inteiro na dica, e um **x** que a tira da lista. Um
ladrilho `+ Adicionar pasta...` abre o seletor nativo.

**A cor sai do proprio caminho**, e nao de uma escolha: um hash decide entre 12
matizes espacadas de 30 graus. Cor guardada seria mais um campo para alguem
preencher, mais uma tela para edita-lo, e um valor a menos que a estacao responde
sozinha. Derivada, a mesma pasta tem sempre a mesma cor — e e' isso que faz o
operador reconhecer o ladrilho sem ler.

**Nao ha mais caixa de "ativar": escolher a pasta E' ativar.** Antes eram dois
estados guardados separados, e eles podiam discordar — caixa marcada sem pasta
atravessava a tela inteira e so' era barrada no botao Imprimir. Clicar no ladrilho
ja escolhido desliga; clicar em outro troca. O botao do grupo leva um **selo com o
nome da pasta** enquanto esta ativo, porque o estado nao pode se esconder junto
com os controles.

Duas coisas que a lista visivel obrigou a criar:

- **Pasta que a estacao nao acha** aparece tracejada, riscada, em vermelho. Se ela
  so' falhasse na hora do envio, o operador descobriria com o material pronto e a
  impressora parada.
- **O x para tirar da lista** (`POST /api/hotfolder/esquecer`). Enquanto a lista
  era invisivel, pasta velha nao incomodava ninguem; mostrada, ela vira entulho
  que esconde a pasta certa.

**O caminho da impressao nao mudou.** `_hotFolderAtivo()` e `_hotFolderPath()`
ficaram com o mesmo nome e o mesmo contrato — o que mudou por dentro foi so' de
onde vem o "ativo" —, e o `#ped-hotfolder-path` continua sendo o campo que as duas
leem, agora escondido. Sao quatro pontos do envio que dependem delas, e e' o
material da grafica que paga um engano ali.

E a autorizacao continua de pe: o `/drop` exige que a pasta esteja registrada, e o
registro continua saindo so' do seletor nativo ou da validacao explicita. Mostrar
a lista nao afrouxou nada — sem ela, uma pagina aberta no navegador do operador
poderia gravar arquivos na estacao.

**48 verificacoes novas** no `hot_folder_ladrilhos_harness.js`, num Chrome de
verdade. A que mais importa nao e' visual: um caminho como `C:\novo\tab\rip
d'agua` entra dentro de um `onclick` entre aspas simples, e sem dobrar a
contrabarra o `\n` vira quebra de linha dentro do JavaScript — o ladrilho
nasceria morto, sem erro nenhum na tela.

**O icone teve de virar SVG.** A primeira versao usava o emoji da pasta. Ele vem
colorido pela fonte do sistema e **ignora `color`** — as tres pastas sairiam do
mesmo amarelo, e "icones de pastas coloridas" viraria "icones de pastas iguais",
sem erro nenhum na tela. O desenho passou a ser um SVG com `fill="currentColor"`,
e o harness le a **cor do pixel que o Chrome de fato pintou**, em vez de conferir
que a regra de CSS existe.

**E o harness da entrega imediata pegou a mudanca de semantica.** Ele montava o
caso "sem destino" desmarcando a caixa `ped-hotfolder-enabled` — que deixou de
existir — enquanto o cenario-base deixava uma pasta no campo. Com a caixa fora,
"desligar" passou a ser apagar a pasta, e o teste falhou dizendo exatamente isso.
Foi corrigido para a regra nova, e ganhou o caso do outro lado: sem pasta e com
impressora, a entrega nasce e vai para a impressora.

**A rota que lista as pastas precisou de prazo.** `os.path.isdir` num caminho de
rede cujo servidor nao responde **nao devolve `False` — ele trava**, ate o timeout
do SMB. Medido com um IP inalcancavel: **26,64 s**. A tela espera essa rota ao
abrir o modelo, e o operador esta de pe na frente da impressora. Agora as pastas
sao conferidas em paralelo com prazo TOTAL de 1,5 s, e quem nao responde a tempo
volta como `existe: null` — *"nao sei"*, que e' diferente de *"nao existe"*:
acusar de sumida uma pasta que apenas demorou seria mentir.

O prazo sozinho nao bastou, e essa foi a parte que quase escapou: com o pool num
`with`, o `__exit__` chama `shutdown(wait=True)` e **espera todas as threads**,
inclusive a travada. A resposta continuava saindo 26 s depois, com o `wait()` de
1,5 s tendo retornado havia muito. Sem o `with`, e com `shutdown(wait=False)`:
**1,52 s**.

**E o nome da pasta divergia entre o agente e a tela.** Numa raiz de
compartilhamento (`\\servidor\travada`) o Windows trata o caminho inteiro como
raiz, e o `os.path.basename` devolve string vazia: o agente caia no caminho
completo enquanto o `_nomeDaPasta` do frontend dizia *"travada"*. A mesma pasta
com dois nomes, dependendo de onde a resposta veio. O agente passou a espelhar a
regra do frontend — separar por barra e pegar o ultimo trecho nao vazio.

> Esta leva **exige publicar o agente**: as duas rotas novas moram nele.

### O cabeçalho do CHANGELOG parou de ser escrito à mão

O `CHANGELOG.md` da raiz abre com *"Versão atual: vNNN | Agente X.Y.Z"*. Escrito à
mão, ele **ficou parado em v707 por onze publicações** — o próprio arquivo tinha
registrado o episódio e pedido que se consertasse ali quando voltasse a divergir.
Voltou: estava em v744 com a v769 no ar.

Consertar o número de novo só adiaria o problema. Agora quem escreve a linha é o
`publicar.ps1`, logo depois do bump dos assets e **antes do commit**, com a versão
que acabou de subir e a versão do agente lida do `agent_version.py`. O arquivo
entra na leva também no caminho recortado (`-Somente`), senão ficaria mentindo na
pasta até a próxima publicação inteira.

Cinco testes travam isso — inclusive o que mais importa: **o padrão casa com o
cabeçalho que está na pasta agora**. Um padrão que não casa não dá erro nenhum;
ele simplesmente não troca nada, e o cabeçalho voltaria a envelhecer calado. A
suíte da publicação foi de 80 para **85**.

O `docs/PUBLICAR.md` também estava desatualizado — dizia "quatro freios" com
cinco no ar — e foi corrigido.

### Onze links quebrados na documentação, e o teste que impede o próximo

Ao ligar os documentos novos aos antigos, uma varredura achou **onze** links
apontando para arquivo que não existe. Dez eram a mesma coisa: caminhos absolutos
`file:///C:/Users/...` gravados por editores antigos, alguns apontando para
pastas que **nem existem mais nesta máquina** (`c:/Antigravity Projetos/`).
Nenhum funcionava em computador nenhum, e ficaram anos ali sem que nada acusasse.

Todos viraram caminho relativo. O `schema_imposition.sql` estava sendo procurado
na raiz e mora em `sql/`; o `portaria.webmanifest` virou `app.webmanifest` e a
entrada histórica agora diz as duas coisas.

O novo `tests/test_os_links_da_documentacao.py` confere duas coisas: que **todo
link entre documentos aponta para arquivo que existe**, e que nenhum documento
usa caminho absoluto do Windows — este segundo pela **forma**, não pela sorte,
porque um `file:///` que por acaso resolve nesta máquina não resolve na próxima.

O custo desses links não é o clique perdido: a documentação deste projeto é a
memória de uma gráfica que roda de verdade. Quando ela manda ler outro documento
e o documento não abre, quem está com o problema na mão desiste e resolve de
cabeça.

### O que ficou documentado

- **[`docs/tela_do_pedido.md`](tela_do_pedido.md)** — a tela inteira: a janela que
  se move (e por que recriá-la é caro), o clique-interruptor, a escala, a trava da
  gerência, os testes que a travam e as armadilhas de quem for mexer.
- **[`docs/conferencia_pedido_21202.md`](conferencia_pedido_21202.md)** — a
  conferência somente-leitura dos 51 modelos, o alarme falso que ela produziu na
  primeira versão e a regra que evita repeti-lo, as notas de esquema do banco, e
  o INP de 2.105 ms com tudo o que já foi descartado.
- **[`sql/consultas/`](../sql/consultas/)** — as quatro consultas de conferência,
  cada uma com o marcador `<<< TROQUE AQUI o numero do pedido`, para servirem a
  qualquer pedido.
- **[`ferramentas/medir_varredura_csv.mjs`](../ferramentas/medir_varredura_csv.mjs)**
  — o medidor que roda as funções reais do `script.js` contra bancos do tamanho
  dos de verdade.
- O `STATUS_PROJETO.md` ganhou um índice de **onde procurar cada coisa** e as
  quatro pendências abertas hoje.

### A rede de segurança dos seletores desfazia a própria economia

O usuário trouxe um INP do navegador: *"Event handlers on this element blocked UI
updates for 368,6ms"*. Medido, o culpado era a rede que enchia **todos** os 104
seletores 1,5 s depois de cada redesenho:

| | antes | depois |
|---|---|---|
| encher tudo em lote | 121 ms de interface travada | não existe mais |
| redesenho seguinte (fila já cheia) | 158 ms | 44 ms |

Ela devolvia a fila a 8.533 elementos, e o clique seguinte pagava a demolição
deles. Saiu. No lugar: **passar o mouse pela linha** prepara os dois seletores
dela (~2 ms), mais os quatro eventos do próprio seletor (`mousedown`, `focus`,
`keydown`, `touchstart`), que cobrem teclado, toque e qualquer navegador.

---

## [2026-08-28] — A tela do Pedido: a janela abre abaixo do modelo

Pedido do usuário: *"o ponto principal é que os modelos após selecionados ficam
distantes da janela de visualização, a ideia era abrir a janela abaixo de cada
modelo ao selecionar"* — com a condição de **não perder nenhuma funcionalidade
atual**. O estudo de layout que precedeu a execução está na prancheta
[Análise da Tela do Pedido](https://claude.ai/code/artifact/364af95b-12c8-492c-8557-3b851e2666ac).

### A janela mudou de lugar

Ela morava num card no **fim da página**: o operador escolhia o modelo no topo
da fila e ia procurar a prévia depois de todas as caixas de produto. Agora abre
numa linha-abrigo **logo abaixo do modelo**, dentro da caixa do produto.

É **um** elemento só, que **muda de lugar** — nunca escrito dentro do HTML da
fila. Recriá-la custaria o canvas já pintado, remontaria o painel de impressão
(nova ida ao agente para ler as capacidades da impressora) e devolveria bandeja,
papel e cópias ao padrão. Mover custa 3,4 ms e **não cresce com o tamanho do
pedido**.

### O clique virou interruptor

A tela passa a abrir **sem nenhum modelo selecionado**. Clicar num modelo o abre;
clicar de novo no mesmo fecha e desseleciona. Antes sempre havia um modelo
carregado e não existia estado neutro.

Três regras vieram junto, todas por causa do lugar novo da janela:

- **A prévia se apaga no instante do clique** e diz que está montando. O
  carregamento é encadeado em 400/600/800 ms; sem isso, por quase um segundo ela
  mostraria a folha do modelo *anterior* debaixo do nome do modelo novo.
- **Modelo escondido pelo filtro fecha a janela** — mesma razão que já o tirava
  da marcação: o que sumiu da tela não pode continuar mandando na impressão.
- **Vir pelo menu** devolve a tela ao estado inicial.

### A janela em três colunas

O cabeçalho tem **uma linha** (de que modelo é esta janela, mais os números da
imposição). Os controles da prévia ficam à **esquerda**; a prévia fica com o
**centro inteiro**; as ações ficam à **direita**, em quatro grupos que abrem e
fecham: Imprimir e PDF, Configuração de Impressão, Gerenciamento de Cores,
Refazer Folhas.

**Um** par de Gerar PDF / Imprimir. O par próprio do Refazer saiu; com o Refazer
ligado, o par único vale para a faixa escolhida. Isso obrigou a escrever uma
exceção que antes se resolvia sozinha: modelo já impresso perde o botão Imprimir,
mas com o Refazer ligado ele volta — reimprimir uma faixa só faz sentido depois
que a tiragem saiu.

Duas coisas **voltaram a aparecer**; estavam no código e ninguém via, dentro do
bloco escondido do formulário antigo: o **Sumário** (Formato, Grade, Total,
Folhas, Células vazias, Saída) e o botão **Cancelar Impressão**.

O botão "Mostrar" de dentro do Gerenciamento de Cores saiu — com o grupo já
abrindo e fechando, eram dois interruptores para a mesma coisa. A trave continua
de pé: o **estado** não se esconde com os controles, e um selo no botão do grupo
diz que há conversão de cor ligada mesmo com o grupo fechado.

### A fila voltou aos 100%

Cada linha carregava os próprios rótulos — QTD, NI, NF, Bloco, COR, Núm., Verso
e Status escritos dentro de cada célula. Oito rótulos × N linhas empurravam a
largura para ~2.130 px, e era isso que obrigava a tela a abrir com `zoom: 0.8`,
encolhendo 20% a fonte feita grande de propósito para leitura em pé.

Os rótulos viraram **cabeçalho de coluna** e o zoom saiu. Caixa que mistura
Camarote e comum continua com os rótulos na linha: as quatro colunas do meio
mudam de significado ali, e um cabeçalho único mentiria para metade das linhas.

Junto: o resumo do produto passou a dizer **três** números — *Total, Impressas,
Faltam* — no centro da linha; e o nome da tinta no seletor de Cor calcula texto
claro ou escuro pela luminância, em vez de preto fixo (em tinta escura o nome
sumia dentro da própria caixa).

### O redesenho ficou 4× mais rápido

Os seletores de Cor e Numeração nasciam com a lista inteira: 124 opções por
linha, quase três quartos dos elementos da tela, para o operador ver uma linha
de cada. Agora nascem com a opção escolhida e se enchem quando ele os abre —
com uma rede de segurança que preenche o que sobrou 1,5 s depois, porque cada
estação usa um navegador diferente.

Medido num Chrome de verdade, com a `renderPedOSQueue` real dos dois lados, no
pedido 21202 (52 modelos — o maior real):

| máquina | antes | depois | ganho |
|---|---|---|---|
| esta estação | 179,5 ms | 43,7 ms | 4,1× |
| 2× mais lenta | 396,7 ms | 100,8 ms | 3,9× |
| 4× mais lenta | 934 ms | 212,1 ms | 4,4× |
| elementos na tela | 8.932 | 2.033 | |

Isso importa porque a fila se redesenha a cada clique num modelo — e o clique
acabou de virar um interruptor que o operador usa mais vezes que antes.

### Testes

Três harnesses novos rodam num Chrome de verdade: `janela_do_modelo_harness.js`
(a janela é movida e não recriada — canvas ainda pintado, bandeja ainda
escolhida — e sobrevive ao redesenho da fila), `janela_tres_colunas_harness.js`
(desenha a janela real com o CSS real e confere o layout mais os 62 controles
que ela não pode perder) e `fila_do_pedido_harness.js` (roda a
`renderPedOSQueue` de verdade com os 52 modelos e mede se a fila cabe em 100%).

---

## [2026-08-28] — O banco de dados pode ser do pedido

O CSV deixa de ser obrigatoriamente parte da numeração. Uma peça só passa a servir
vários modelos e vários pedidos, cada um com as suas linhas e as suas colunas —
o que dispensa duplicar a numeração a cada evento. Documento completo:
[`docs/banco_do_pedido.md`](banco_do_pedido.md).

**Nada foi convertido.** As numerações que têm CSV dentro continuam exatamente como
estavam: modelo sem vínculo cai no mesmo código de antes, e o teste que trava isso
compara a peça por identidade (`===`), não por semelhança.

### O que apareceu na tela (v745/v746)

- **Vem de:** no card do modelo — a numeração (padrão), um banco do pedido, ou
  *+ Subir um CSV para este pedido…*
- **🔤 Colunas** — o de-para entre a coluna que a peça pede e a coluna do banco.
- **📊 Editar banco do pedido** — corrige o conteúdo dizendo antes quantos modelos
  leem dali.
- O 🧩 Linhas e a conferência de repetidos passaram a trabalhar sobre a **fonte** do
  modelo, e não sobre a numeração: sem isso o modal abriria o poço errado.

### Correções do mesmo dia

- **O "Vem de:" não aparecia** (v746). Duas causas: a busca dos bancos do pedido ia
  pendurada na dos CSV das numerações, atrás de um portão que só abria quando alguma
  numeração estava sem CSV — justamente o que nunca acontece num pedido de banco
  próprio; e a caixa só aparecia onde já havia dado, de modo que a porta para criar o
  primeiro banco só existia depois do primeiro banco existir.
- **`invalid input syntax for type uuid`** ao ligar um modelo. A coluna `modelo_id`
  nasceu UUID; o id de `pedidos_modelos`, que é do parceiro Vibe, é um número. Passou
  a TEXT (`sql/pedidos_modelos_banco_modelo_id_texto.sql`, já aplicado).
- **Vínculo que falha desfaz o banco recém-criado** — cada tentativa frustrada
  deixava um banco órfão na lista do pedido, sem porta para apagá-lo.

### Ainda em aberto

Excluir/renomear banco pelo pedido, "atualizar pela planilha" para banco do pedido,
fotos como dado variável com banco do pedido, e a impressão de verdade — que só
acontece com papel na mão.

---

## [2026-08-27] — A tela e o papel passam a medir com a mesma régua

Levantamento ponta a ponta da fidelidade dos elementos de numeração: onde as dez
janelas que desenham um ingresso e o motor que o imprime concordavam sobre **tamanho
e posição**, e onde não concordavam. Tudo medido na tinta — PDF gerado pelo próprio
motor e rasterizado, mancha lida pixel a pixel, contra a mesma mancha desenhada num
Chrome sem cabeça com o mesmo arquivo de fonte.

Seis eixos já conferiam: a grade da folha, a âncora central dos elementos, a largura
do texto, o QR, o tamanho de PDF e SVG e a janela da foto. **Sete divergiam**, e as
sete foram corrigidas. O documento completo, com a tabela do antes e depois e o molde
para medir um caso novo, é o [`docs/fidelidade_tela_papel.md`](fidelidade_tela_papel.md).

### 1. A altura do texto vinha de uma média, não do arquivo da fonte

O navegador centra o texto pelo `sTypoAscender`/`sTypoDescender` da tabela OS/2 do
arquivo, normalizados para somarem o corpo. O motor usava uma fração fixa (0,72 e
0,21) para toda fonte não embutida no PDF, e ainda por outra conta. Onde a fonte real
tem outras proporções, o papel depositava a linha mais alta do que a tela mostrava —
com Impact no corpo 40, **1,71 mm** mais alto.

Não dá para usar `fitz.Font.ascender`: ele devolve a tabela `hhea`, que erra até 0,049
do corpo — quatro vezes mais do que a média fixa que ela substituiria. A leitura é da
OS/2, direto dos bytes, cacheada por caminho, com volta para a média de sempre se o
arquivo não se deixar ler.

Medido no acervo: dos 287 elementos de texto com fonte disponível para medir, 85 % se
moviam menos de 0,15 mm e 16 passavam de meio milímetro, todos em Impact.

### 2. Girar um elemento girava só o conteúdo, não a caixa

Um SVG de 40 × 20 mm a 90 graus saía com **10,08 × 19,98** no papel — um quarto da
área — enquanto a tela mostrava 20 × 40. A foto de 25 × 32 saía com 25,06 × 19,64.
Quem monta o retângulo agora é `_caixa_girada()`.

### 3. O código de barras virou vetor, e a tela passou a desenhar o código real

A imagem do `python-barcode` traz 1 mm de branco em cima e outro embaixo, esticados
junto: um elemento de 60 × 12 mm imprimia barras de **60,03 × 10,67**. Recortar a
folga custaria 2,01 ms por código — mais de três minutos numa tiragem de 100.000.
As barras deixaram de ser imagem: o motor pede o padrão de módulos e desenha
retângulos vetoriais. Altura exata por construção, traço na resolução do RIP, e mais
rápido. De brinde, o giro passou a ser um `morph`, que gira a caixa.

Na tela, as dez janelas pintavam um padrão **fixo de 40 barras**, igual para qualquer
valor e qualquer simbologia. O novo `frontend/barcode-canvas.js` desenha o código de
verdade, com as tabelas extraídas da própria biblioteca do motor e os algoritmos
espelhados — inclusive a troca de conjunto A/B/C do Code 128, que é onde duas
implementações honestas divergem. O teste compara os dois lados valor a valor.

### 4. A sangria era aparada na pose girada

O formato `Credencial 90x140` gira as poses 2 e 3 em 180 graus, e nessas duas o motor
montava o ingresso numa página do tamanho exato dele — que recorta o próprio conteúdo
na borda. Medido numa imposição completa: poses 0 e 1 com **2,45 mm** de sangria,
poses 2 e 3 com **0,00**. Metade das credenciais de cada folha saía sem a sobra que
protege do desvio da guilhotina.

O levantamento do banco decidiu a regra: 45 elementos PDF de 21 numerações passam da
borda **de propósito**, e todos usam esse formato. Sangrar sempre. A página temporária
passou a nascer com um ingresso de folga para cada lado, simétrica, e a colagem estica
o retângulo da célula na mesma medida — o centro não se move.

### 5. Duas janelas desenhavam antes de a fonte chegar, e uma esquecia o QR Ideal

Canvas não reflui: fonte que chega depois do traço não redesenha. E como a
centralização usa a largura **medida** do texto, a fonte errada desloca também a
posição. A prévia do Painel de Produção e o Criador de Arte não esperavam.

No mesmo arquivo, a camada de numeração do Criador de Arte não tinha ramo para
`QR_IDEAL`: o elemento não pintava um pixel, nem a caixa vazia. Quem montava a arte
via o ingresso sem o QR que vai ser impresso.

### A rede da janela de sincronização

A lista `PAINEL_ARQUIVOS` mora dentro do `NewProd.exe`. Uma estação com agente antigo
baixa o `index.html` novo, que já pede o `barcode-canvas.js`, e recebe 404 — e a
primeira numeração com código de barras derrubaria o desenho inteiro do canvas. O
`script.js` e o `cliente.js` ganharam a mesma reserva que o `qr-canvas.js` tem desde a
v559: avisam no console e desenham a caixa vazia.

### O resultado

O estudo foi refeito pelo mesmo método contra o código corrigido: **19 de 19 eixos**
dentro do alvo. O pior erro que sobra é de 0,07 pt no texto, onde eram 4,86.

Cinco arquivos de teste novos prendem cada correção, e cada um falhou antes de o
conserto existir: `test_engine_altura_do_texto.py`, `test_engine_giro_do_elemento.py`,
`test_engine_codigo_de_barras.py`, `test_engine_sangria.py`, `test_barcode_canvas.py` e
`test_espera_de_fonte_nas_janelas.py`.

### O que ficou de fora, de propósito

A tela continua recortando na linha de corte, então a sangria que agora sai certa no
papel ainda não aparece em janela nenhuma — mostrá-la faz a arte de uma peça invadir a
vizinha na prévia, e isso é mudança visual numa tela já aprovada. E o PDF Gabarito
desenha um QR falso de 7 × 7 blocos, que pode ser guia de posição de propósito.

### Um caso real, para reconhecer o sintoma

A numeração `1000540` do pedido 21143 (pulseira Texband, elemento em Impact corpo 35 no
meio da tarja de 27 mm) foi relatada como *"na tela aparece centralizado, na impressão
imprimiu deslocado para cima"*. É o pior caso do acervo inteiro para o defeito nº 1:
medido, o papel depositava o número **1,50 mm acima** — 6,69 mm de folga em cima contra
10,15 embaixo. Depois do conserto, tela e papel ficam a 0,02 mm um do outro, sem tocar
na numeração: a âncora em 13,5 mm sempre esteve no meio exato da tarja.

**O conserto viaja dentro do agente.** A imposição roda na estação, então as quatro
correções que tocam o papel só chegam quando aquela estação atualiza o `NewProd.exe`.
Site e agente saem na mesma leva, sempre.

---

## [2026-08-27] — Pedido que já saiu do prédio sai da tela dos painéis

Regra do usuário: *"quando um pedido constar com Status posterior aos status do
painel de acabamento e do painel de produção (EXPEDICAO, EM TRANSITO, ENTREGUE)
devem sair da tela inicial dos paineis"*.

É a mesma razão que rege o Acabamento desde 24/08: o que fica na frente do
operador é o trabalho **daquela** mesa. Pedido despachado, em trânsito ou
entregue não é trabalho de ninguém aqui dentro.

### O que já estava certo

As duas telas se guiavam por listas **positivas** — a Produção aceita
`EM PRODUCAO`/`EM IMPRESSAO`, o Acabamento aceita esses mais o `EXPEDICAO` do
botão Expedição — e por consequência os três status já ficavam de fora. Mas por
**dedução**, não por regra escrita: bastava alguém alargar uma daquelas listas
para o pedido entregue voltar à tela sem ninguém perceber. A regra passou a ter
um lugar só — `SINAIS_DEPOIS_DA_GRAFICA` e `pedidoJaPassouDaGrafica`, no
`script.js` — e os dois painéis a consultam de lá.

`EXPEDICAO` continua alimentando o botão **Expedição** do Acabamento: ele não é
a tela inicial, é o comprovante do que a bancada acabou de despachar.
`A RETIRAR` e `RETIRADO` ficaram de fora de propósito — material no balcão
esperando o cliente ainda pode voltar para a bancada.

### O que faltava de verdade: a regra não era viva

`state.ordens` é montado **uma vez**, e o `status_interno` de cada pedido ficava
congelado nesse retrato. Quem move o pedido para EXPEDICAO, EM TRANSITO ou
ENTREGUE é o ERP do parceiro, em outra tela e a qualquer hora — e o painel da
gráfica continuava mostrando o pedido até alguém recarregar a página. A regra
valia no instante do carregamento e mais nada.

`ressincronizarStatusInterno` relê `id_int, status_interno` da tabela
`propostas` **uma vez por minuto**, e só quando um dos dois painéis está na
tela. Duas colunas, tráfego de controle, fora do caminho crítico do operador.
Nada é redesenhado quando nada mudou, e banco fora do ar não mexe na tela: sem
resposta, fica o que está.

Conferido por `tests/test_status_depois_da_grafica.py` e por 22 verificações
novas no `tests/acabamento_harness.js`, que passou a ler a regra de dentro do
`script.js` em vez de guardar uma cópia.

---

## [2026-08-27] — PDF Gabarito: o verso ganhou página, e a frente parou de sair suja

Relato do usuário: *"Na edição de um pedido em arte, ao clicar em PDF Gabarito,
verificar a geração do PDF para quando o modelo for frente e verso. Se tivermos
dois modelos, um apenas frente e outro frente e verso, o PDF deve ser gerado com
três páginas."*

O `exportarPdfGabarito` adicionava **uma página por modelo**, sem nenhuma noção de
face. Duas coisas saíam erradas ao mesmo tempo:

1. **O verso não existia.** Aquele pedido de dois modelos saía com duas páginas, e
   não três. O operador ficava sem o gabarito do lado que ele não tem como conferir
   de outro jeito.
2. **A frente vinha suja.** O `criarCanvasNumeracaoRasterizada` desenhava *todos* os
   elementos da numeração, inclusive os marcados **Apenas Verso** no editor. O
   gabarito da frente mostrava as duas faces empilhadas uma sobre a outra.

Agora o export percorre `['front']` ou `['front', 'back']` conforme o modelo, e cada
página leva só o que aparece naquela face — tanto os elementos PDF, que entram
vetoriais, quanto o resto, que é rasterizado por cima. O **PICOTE** espelha no verso
(`largura − x`), a mesma regra do card do pedido, porque o corte é o mesmo papel visto
do avesso. O fundo legado da coluna `pdf_content` entra só na frente: ele nunca foi
outra coisa. A etiqueta da página do verso é `<modelo> Verso`, igual à do PDF Arte.

### Os dois botões vizinhos já acertavam — e agora contam pelo mesmo lugar

O usuário pediu para conferir também o **Importar PDF Artes**. Ele já fatiava
contando frente e verso, e o **PDF Arte** já emitia a página do verso; só o gabarito
tinha ficado para trás. Mas os três liam o verso de jeitos diferentes, e o painel
guarda esse dado em **dois nomes na memória**: `verso`, booleano, e `verso_tipo`, o
texto que vem do ERP (`Frente` / `FxVerso`, mais os legados `VERSO COMUM` e
`VERSO VARIÁVEL`). Os três passaram a chamar `modeloTemVerso(item)`, que lê os dois.

Isso importa porque o operador confere o gabarito **por cima** da arte: se as
contagens divergissem, a página 2 de um seria o verso do modelo 1 e a do outro seria
a frente do modelo 2.

Conferido por `tests/test_gabarito_frente_e_verso.py` e pelo harness em node
`tests/gabarito_frente_e_verso_harness.js`, que lê o cálculo das faces de dentro do
próprio `exportarPdfGabarito` — apagar o verso de lá reprova a suíte.

---

## [2026-08-26] — O dia em que o painel parou de travar: oito publicações e o que cada relato escondia

Um dia inteiro de relatos do usuário, cada um apontando para um lugar diferente do
que parecia. Vale ler junto, porque três das correções nasceram do preço da anterior.

### 1. "APLICAÇÃO TRAVOU" — não era a aplicação (v727)

O banco do projeto Supabase do parceiro ficou fora do ar das **15:46 às 15:54**. A
internet estava perfeita (Google em 206 ms), as Edge Functions do próprio projeto
respondiam em 110 ms, e o agente local servia o painel em 47 ms. Só `/rest/v1/` e
`/auth/v1/` estouravam, com **código 522** — o gateway dizendo que a origem não
atendeu.

Na tela não apareceu erro nenhum: apareceu uma tela **parada**. As 71 chamadas ao
banco do painel não tinham tempo limite, e promessa que nunca se resolve não cai no
`catch` de ninguém.

`frontend/banco-nao-responde.js` conta o tempo de cada chamada e, passados 15
segundos, põe uma barra no alto da tela com um botão de recarregar; quando o banco
volta, ela se anuncia e sai sozinha. **Nenhuma chamada é cancelada** — uma gravação
abortada aos 15 s pode já ter chegado ao banco, e o operador refazendo deixaria o
registro duplicado. Tela congelada é um problema; pedido gravado duas vezes é outro,
bem maior.

### 2. O catálogo baixava 29 MB para listar 105 nomes (v728)

| | dados | rede |
|---|---|---|
| `select('*')` | **29,17 MB** | 1.772 ms |
| a lista enxuta | 0,19 MB | 273 ms |

A diferença inteira é **uma coluna**: `csv_data` pesa 30,1 MB dos 30,3 MB da tabela.
Abrir o painel baixava isso antes de qualquer tela e deixava **187.021 linhas de CSV**
vivas na memória da aba. O sintoma que o usuário via era outro — um INP de 208 ms num
clique qualquer. Quem paga a conta da memória é sempre o próximo clique.

O perigo da correção, e as três peças contra ele: quase todo leitor pergunta
`if (!num.csv_data)` e conclui *"não tem banco"* — e uma numeração **com** banco não
baixado responde igual a uma **sem**, fazendo o motor cair na numeração sequencial.
Por isso a lista **não traz** a coluna (deixando `undefined`, distinguível do `null`
de "procurei e não tem"), `numeracaoTemBanco()` responde sem as linhas, e
`garantirCsvDoTrabalho()` abre as **duas** telas de imposição.

### 3. O pedido grande esperava 2 segundos para abrir (v729)

No 21202 — 52 modelos, 17 numerações, 115.846 linhas — o `recarregarNumeracoesDoPedido`
baixava **22,01 MB em 2.015 ms** antes de a tela aparecer. Era o caminho que a correção
anterior deixara de fora "porque são poucas numerações".

A tela de Amostras passa a abrir enxuta (**0,03 MB, 72 ms**) e os bancos chegam depois,
um a um, com o card se redesenhando a cada chegada — o mesmo desenho que a cobertura
de glifos já usava ali dentro. Quem precisa das linhas na hora (Conferência de dados,
as duas telas de imposição) continua pedindo tudo.

As duas armadilhas do meio do caminho: o card diria **"SEM nenhuma linha"** em
vermelho enquanto o banco desce (agora diz `carregando…`), e o aviso de repetidas
sairia com a conta pela metade (agora fica calado até os bancos chegarem).

### 4. "O modelo 1 vira B" — o botão certo no lugar errado (v730 e v732)

Dois modelos na mesma numeração: marcar linhas no **Ver / editar** de um desmarcava no
outro. Está correto — a marca de imprimir mora **dentro da linha** (`__ativo`), e a
linha pertence à numeração, não ao modelo. O defeito era a tela não dizer isso.

Decisão do usuário: **"vamos deixar o Ver/editar apenas na edição da numeração"**. Ele
saiu do card do modelo e do modal da amostra; editar o banco tem uma porta só, a box
"Banco de Dados (CSV)" do editor da numeração. Dentro do pedido ficou só o que é **do
modelo**: a fatia.

Como consequência, quatro modelos ficaram com uma **fatia órfã** — `csv_selecao`
apontando para `__id` de um banco que já não usavam, e a tela dizia *"o banco não fecha
com a quantidade"* mandando corrigir um banco que estava perfeito.
`distribuicaoOrfaDoModelo` reconhece os dois casos legítimos e oferece o botão que
remove. Fatia vazia num banco que **dois** modelos dividem não entra: aquilo é o estado
legítimo de "ficou de fora da divisão".

### 5. O PDF Prova saía com 36 páginas para 52 modelos (v731)

Ele fotografa a **tela**, não os dados: copia o canvas de cada card e pula, em silêncio,
o que ainda não desenhou. Os 52 modelos estavam certos no banco — os 16 que faltaram é
que não tinham terminado de desenhar.

Agora ele termina de baixar os bancos, força o desenho de todos os cards, espera cada
canvas aparecer (teto de 60 s) e, se ainda faltar alguém, **diz quais pelo nome** e só
gera com o "Gerar sem eles". Um PDF de prova incompleto parece completo para quem
recebe.

### 6. Quais colunas contam na conferência de repetições (v732)

Pedido do usuário: *"ao clicar em Linhas as colunas que são verificadas na conferência
de dados devem vir marcadas (checkbox); ao desmarcar devem ignorar a conferência de
repetições"*.

A numeração do CAMAROTE CORPORATIVO lê `Codigo` (único por ingresso) e `Camarote` (1 a
140, repete por natureza). A conferência somava as duas e acusava **3.640 repetições
sem nenhum código repetido** — número inflado por construção ensina o operador a
ignorar o aviso.

Nascem todas marcadas; a marca de **fora** é que é explícita, e mora nos elementos
(`sem_conferencia`), não numa coluna nova da tabela do parceiro. A separação que torna
isso seguro tem teste próprio: `colunasDoBancoDaNumeracao` decide quais linhas
**imprimem**, `colunasConferidasDaNumeracao` decide quais **contam na busca por
repetido**.

### 7. Cards desenham ao aparecer — e a regressão que isso causou (v732 e v734)

Abrir um pedido disparava um laço que desenhava **todos** os cards, em série, com 20 ms
de pausa entre um e outro. Nos 52 modelos: 52 desenhos completos enquanto o operador
olha para os dois primeiros. Agora cada card desenha quando entra no campo de visão.

**Duas armadilhas, e a segunda chegou a ir ao ar:**

A primeira foi evitada: observar o canvas do card não funciona, porque ele nasce
`display:none` e o `IntersectionObserver` **nunca dispara para elemento escondido** — o
pedido ficaria em branco para sempre, sem erro no console. A âncora é o cabeçalho do
modelo. Por isso o arnês roda num Chrome de verdade; um dublê diria que está tudo certo.

A segunda passou: a conta de "já desenhei" valia **por pedido**, e cada renderização
reescreve o `container.innerHTML`, destruindo os canvases. A segunda renderização
recusava desenhar sobre um DOM recém-nascido — e quem redesenha logo depois da abertura
é justamente a chegada dos bancos da correção 3. **Os cards desenhavam e sumiam.** A
conta passou a valer por renderização.

O teste que acompanhava a versão com defeito afirmava exatamente o comportamento
errado — *"redesenhar o mesmo pedido não refaz o trabalho todo"* — e por isso não pegou
nada: era um teste da suposição de quem escreveu, e não do que o operador vê na tela.

### 8. A Vercel mandava cachear e não cacheava (v732)

`script.js?v=731` chegava com `no-cache, no-store`, apesar de o `vercel.json` pedir
`max-age=3600`: a regra genérica `/(.*)` vinha **depois** e sobrescrevia — quando duas
casam, a de baixo manda. Eram **1,9 MB baixados de novo a cada abertura e a cada F5**.

Desperdício puro, porque o cache já é resolvido pelo `?v=NNN` que o `publicar.ps1`
bumpa. Cinco referências estavam **sem** o carimbo (`supabase-config.js` em três
páginas, `pdf-lib.min.js` em duas) e ficariam presas uma hora depois de publicar —
carimbadas, com teste varrendo as páginas.

O `no-store` continua para o HTML: é ele que impede a estação de servir painel velho.

**A participação da Vercel na velocidade do painel é entregar os arquivos, e só.** Os
redesenhos rodam no navegador, os dados vêm do Supabase, e na estação ela nem está no
caminho — lá o agente serve do disco: **32 ms contra 972 ms da nuvem**.

### 9. "Aplicar" dizia que nada mudou, e tinha mudado (v733)

Quem só desmarcava uma coluna e clicava em Aplicar lia *"nada foi mudado"* logo depois
de a escolha ser gravada — a frase que faz o operador concluir que o checkbox não
pegou. Agora ela diz o que aconteceu.

### O dado: o pedido 21202 reorganizado

Não foi só código. O pedido de 52 modelos tinha **11 bancos divididos entre vários
modelos, nenhum com distribuição** — o mesmo código sairia em até cinco modelos de dias
diferentes. Pior: as únicas 3.500 linhas ativas do CAMAROTE CORPORATIVO eram todas de
**12/09**, e quem apontava para ele eram os modelos de 05, 06 e 11/set.

Por decisão do usuário — **uma numeração por dia** —, foram criadas 44 numerações novas
(`CAMAROTE VIP 05`, `FRONT STAGE 06`, …), cada uma com as linhas do seu dia, e os
modelos reapontados. Dois modelos apontavam para o banco errado e foram corrigidos.

| | antes | depois |
|---|---|---|
| numerações distintas para 52 modelos | 17 | **52** |
| bancos divididos entre 2+ modelos | 11 | **0** |
| modelos sem banco (imprimiriam sequencial) | 1 | **0** |
| modelos com linhas ≠ Qtd | 1 | **0** |
| modelos com aviso de células repetidas | 46 | **0** |

**Ressalva registrada:** a arte de fundo não pôde ser copiada para arquivos próprios —
o Storage recusa a chave anônima, porque o painel faz esse upload com a sessão do
operador. As cópias apontam para o arquivo do original, o que é seguro (o
`deleteNumeracao` só apaga a linha, nunca o arquivo), **mas as numerações originais não
devem ser apagadas** enquanto as cópias existirem.

### O que ficou no caderno

1. Levar a separação por dia para dentro do painel, onde o upload da arte de fundo tem
   permissão — aí cada cópia ganha arquivo próprio e a ressalva acima deixa de existir.
2. `test_controle_tela` e o harness da escolha de volume falham de vez em quando sob a
   carga da suíte inteira e passam sozinhos: instabilidade do teste, não do código.

---

## [2026-08-26] — O catálogo de numerações para de baixar 29 MB para listar 105 nomes

Pergunta do usuário, depois de a tela travar de novo: *"onde esta o gargalo? o que precisa
melhorar na infraestrutura?"*.

### O gargalo não era a infraestrutura

Medido contra o banco real, `producao_numeracoes` tem 105 registros e 27 colunas:

| | dados | rede |
|---|---|---|
| `select('*')` — o que o painel fazia | **29,17 MB** | **1.772 ms** |
| a lista enxuta | 0,19 MB | 273 ms |

**A diferença inteira é uma coluna.** `csv_data` sozinho pesa 30,1 MB dos 30,3 MB da tabela; as
outras 26 somadas dão 209 KB. O maior banco é o `FRONT STAGE - Codigos.csv`, com 56.000 linhas ×
7 colunas = 10,6 MB numa numeração só.

O que isso custava não aparecia como erro em lugar nenhum: abrir o painel baixava 29 MB antes de
qualquer tela e deixava **187.021 linhas de CSV vivas na memória da aba** — de bancos que a lista
não mostra e ninguém pediu.

O sintoma que o usuário via era outro. O DevTools acusou um INP de 208 ms no `select` do filtro do
editor de CSV; medido sozinho, esse mesmo handler custa **14 ms com 56.000 linhas** — a grade é
virtualizada e o trabalho dela é pequeno. Quem paga a conta da memória é sempre o próximo clique,
não quem a encheu.

### O perigo que a correção cria, e as três peças contra ele

Quase todo leitor do painel pergunta `if (!num.csv_data)` e conclui *"esta numeração não tem
banco"*. Uma numeração **com** banco que ainda não desceu responde igual a uma **sem** banco — e o
motor, sem linhas, ignora o banco e cai na numeração sequencial: sai número impresso no lugar do
nome da pessoa, sem erro em tela nenhuma, e quem descobre é o cliente olhando o papel.

1. **A lista não traz a coluna**, em vez de trazê-la vazia. `csv_data` fica `undefined`, que é
   distinguível do `null` de "já procurei e não tem".
2. **`numeracaoTemBanco()`** responde "tem banco?" por `csv_filename`/`csv_headers`, sem precisar
   das linhas — as duas continuam na lista de propósito.
3. **`garantirCsvDoTrabalho()`** abre as **duas** telas de imposição: o banco de toda numeração do
   trabalho está em mãos antes de o payload ser montado.

### Onde o banco desce agora

`garantirCsvDaNumeracao(num)`, nos moldes do `garantirPdfDaCor()` que já existia: uma numeração por
vez, só a que vai ser aberta, desenhada ou impressa; duas telas pedindo junto fazem uma consulta;
falha de rede não lança e não envenena a próxima tentativa. Os pontos: abrir no editor, duplicar do
catálogo, desenhar a amostra e impor. **As numerações do pedido aberto continuam vindo inteiras**
pelo `recarregarNumeracoesDoPedido`, que lê por id — é de propósito que ela mantenha o `select('*')`.

Gravar por cima do `csv_data` esquece o que foi baixado, e releitura do catálogo limpa o cache
inteiro: o banco que a tela mostra é sempre o que está gravado.

### Um detalhe que envelhece em silêncio

Não existe "select tudo menos uma" no PostgREST, então a lista de colunas é escrita à mão e uma
coluna nova na tabela chegaria como `undefined`, sem erro. O teste
`test_a_lista_traz_toda_coluna_que_a_duplicacao_copia` trava isso contra o `duplicateCatalogNumeracao`,
que copia campo a campo e é a enumeração mais completa que o código tem.

---

## [2026-08-26] — O "Ampliar" cobria a seta de avançar página

Pergunta do usuário: *"verificar layout para arquivos com paginação, pdf e numeração com .csv, onde
ficaram as setas para paginar no link do cliente"*.

### Elas estavam lá — e alguém estava em cima delas

Os dois folheadores renderizam normalmente. Medido no navegador, com pedidos reais:

| caso | pedido | folheador |
|---|---|---|
| PDF multipágina | 20144 | `◀ Página 1 / N ▶`, 330×31px, visível |
| Numeração com CSV | 21146 | `◀ Ingresso 1 de 10 ▶`, 330×114px, visível |

O que havia era **sobreposição**. O chip "Ampliar" é `position: absolute; right: 10px; bottom: 10px`
e estava ancorado na **moldura da arte** (`.amostra-preview-container`) — que deixou de terminar na
arte no dia em que os folheadores entraram dentro dela. Resultado, medido no pedido 20144:

```
seta ▶      x 250 - 287
chip        x 275 - 360     <- mesma linha
```

O cliente tinha **o botão de avançar página parcialmente coberto**. No caso do CSV o chip caía sobre
o fim do resumo do ingresso (`pais: TCHÉQUIA · nome: Ondřej Pek · cargo: dancer`).

### O conserto

O chip passou a ser ancorado na **arte**, e não na moldura: `blocoDeArteDoCliente` embrulha a arte
da frente num `.amostra-arte-lugar` (`position: relative`) e o chip vai dentro dele. São quatro
pontos — o PDF nas duas variações de cartão, a frente do cartão com verso e a do cartão sem verso.

O `max-width: 100%` no embrulho não é enfeite: sem ele, um canvas de 620px dentro de uma tela de
330 faria o `max-width: 100%` do próprio canvas medir 620, e a arte transbordaria a moldura.

Conferido depois, nos mesmos dois pedidos e em três larguras (320, 390 e 1280): o chip fica **dentro
do retângulo da arte**, não cruza as setas nem o resumo, e não há rolagem horizontal.

### Uma coisa que não era defeito

No pedido 21146 o terceiro modelo não mostra setas, e está certo: a numeração tem 13 linhas
repartidas entre os modelos pela Qtd (10 + 2 + 1), e aquele modelo tem **um ingresso só**. Não há o
que folhear.

### Cicatriz do caminho

Na primeira tentativa o chip foi movido para perto do `ctxDaArte`, ~40 linhas acima — e o `icone`,
que é um `const` declarado mais abaixo dentro do cartão, caiu na zona morta temporal. A seção da
arte **deixou de desenhar inteira**, com um `icone is not defined` no console. Por isso ele hoje é
atribuído ao contexto depois que o `icone` existe, com o motivo escrito ao lado.

---

## [2026-08-26] — Banco fora do ar: a tela avisa em vez de congelar

Relato do usuário: *"APLICAÇÃO TRAVOU, PESQUISAR O MOTIVO"*.

### O que aconteceu naquele dia

Das **15:46 às 15:54** o banco do projeto Supabase do parceiro ficou fora do ar. O log do agente
marcou os dois extremos:

```
15:46:35  Heartbeat OK                      <- último normal
15:46:4x  Erro GET print_queue: timed out
15:54:21  Heartbeat OK                      <- voltou sozinho
```

**Não foi a internet nem o agente.** Medido de fora, com a mesma chave e o mesmo endereço, durante a
queda: o Google respondia em 206 ms; as Edge Functions do próprio projeto, que moram no mesmo
endereço do banco, respondiam em 110 ms; o `/api/status` do agente local, em 47 ms. Só o `/rest/v1/`
e o `/auth/v1/` estouravam — e o código que voltava era **522**, o gateway dizendo que a origem não
atendeu. Ou seja: o caminho até lá estava aberto; quem estava fora era o serviço de banco.

### Por que isso apareceu como tela travada

As 71 chamadas ao banco espalhadas pelo painel **não tinham tempo limite**. Uma promessa que nunca
se resolve não cai no `catch` de ninguém — ela fica pendurada, junto com a tela que a espera. Não
havia erro, não havia mensagem, não havia nada para tocar.

### A barra

`frontend/banco-nao-responde.js` conta o tempo de cada chamada ao banco. Passados **15 segundos**
sem resposta, uma barra aparece no alto da tela dizendo o que está acontecendo — e separando o que
**não** é o problema, que é a internet da gráfica — com um botão de recarregar. Quando o banco
volta, ela se anuncia em verde e sai sozinha em 5 segundos.

**Nenhuma chamada é cancelada, e essa foi a decisão mais importante do desenho.** Uma gravação
abortada aos 15 segundos pode já ter chegado ao banco; a tela diria "falhou", o operador refaria, e
a gráfica ficaria com o registro duplicado. Tela congelada é um problema; pedido gravado duas vezes
é outro, bem maior. A chamada segue viva — o que muda é a tela parar de mentir que está trabalhando.

**O embrulho fica num lugar só**, o `window.fetch`. Mexer nos 71 pontos de chamada seria 71 chances
de errar num caminho que a gráfica usa o dia inteiro; nenhum deles foi tocado.

**Só `/rest/v1/` e `/auth/v1/` entram na conta.** O agente local fica de fora porque impor e gerar
PDF levam minutos por natureza; o Storage porque subir fonte ou foto grande passa dos 15 s numa
internet ruim sem que exista problema; a Edge Function porque ela nem depende do banco para atender.

15 segundos é folga de 75 a 250 vezes sobre o tempo normal medido (60 a 200 ms). Errar para baixo
custaria caro: barra piscando com o banco de pé é o tipo de aviso que o operador aprende a ignorar —
e aí ela não serve para o dia em que o banco cair de verdade.

Carrega **antes** do `supabase-config.js` nas quatro páginas que falam com o banco (`index.html`,
`producao.html`, `cliente.html`, `controle.html`), e entrou na `PAINEL_ARQUIVOS`: sem o nome lá, a
estação serviria essas páginas com um 404 no lugar da barra — e a estação é justamente onde o
operador fica esperando na frente da impressora. A `portaria.html` ficou de fora de propósito: o
aparelho da portaria fala com as Edge Functions e nunca com `/rest/v1/`.

---

## [2026-08-25] — "Falar com meu Atendimento": cada atendente com o seu WhatsApp

Pedido do usuário: trocar *"Ligar para o meu atendimento"* por *"Falar com meu Atendimento"*, e
dar a cada atendente o seu link — ele ditou os cinco endereços.

### O que os cinco links têm em comum

**Todos apontam para o mesmo telefone**, `555195343478`. O que separa um atendente do outro é o
recado que já vai escrito na conversa: *"Olá André Toniazzo, preciso de atendimento..."*. Por
isso o código guarda **um número só** e monta o texto — cinco linhas seriam cinco coisas a
manter, e o telefone mudaria em cinco lugares.

Conferido antes de escrever: reconstruindo com `encodeURIComponent`, os cinco endereços batem
**byte a byte** com os que ele mandou. O harness compara contra os literais.

### De onde sai o nome

De `propostas.vendedor`, que a `link_cliente_pedido` passou a devolver. Os quatro nomeados são
também os quatro maiores do banco — 3.700 dos 3.981 pedidos dos últimos 90 dias. Os outros
nomes que existem por lá (Lisiane Colbeich, Everton Dev, Edison Jr, Everton Farias) caem no
recado genérico, que é o link "Outros" dele — e é a rede de segurança para o atendente novo
que o ERP cadastrar amanhã: ninguém fica sem botão por não estar na lista.

O casamento **ignora acento e caixa**: `propostas.vendedor` é texto livre, e um acento perdido
não pode tirar o cliente do atendente dele.

### O botão agora existe sempre

Antes ele saía de `grafica.telefone`: sumia quando o cadastro não tinha número, e num fixo
virava um `tel:` — disparado de dentro do navegador embutido do WhatsApp, que é justamente por
onde este link é aberto. Agora é sempre conversa, com o recado pronto.

### A logo

Neste projeto, marca de terceiro é **arquivo** — é assim que estão SEDEX, VEPPO, São Miguel e
Motoboy, todas em `app-imagens` (ver `LOGO_DO_FRETE`). Desenhá-la à mão seria fazer com a de
outro o que este projeto não faz com a da casa, e o traço monocromático do conjunto de ícones
não reproduz um logo colorido.

Procurei no bucket e não havia nenhuma; **o usuário mandou o arquivo** e ele entrou como
`<img>` de 20×20, PNG com fundo transparente, direto sobre o botão.

O `onerror` **remove** a imagem em vez de trocá-la por texto: o rótulo ao lado já diz o que o
botão é, e um segundo "WhatsApp" escrito quando a imagem não carrega seria pior do que botão
sem logo. É a mesma decisão da logo da transportadora, na aba de Envio. E ela vai com `alt=""`
e `aria-hidden`: para quem usa leitor de tela, ouvir o nome duas vezes é ruído.

Coberto por `tests/test_whatsapp_do_atendimento.py` e 26 conferências no harness.

---

## [2026-08-25] — A aba Nota mostra o endereço do CNPJ que ela pede para conferir

Pedido do usuário: *"no link onde mostra e pede confirmação dos dados da nota fiscal, deve
mostrar também o endereço relativo ao CNPJ mostrado"*.

### O detalhe que decide tudo

**Não serve o endereço que a aba de Entrega já mostra.** Aquele é o endereço da ENTREGA,
escolhido no pedido; a nota é emitida contra `id_faturado`, que pode ser outro cadastro. Em 6
dos 62 links ativos os dois diferem — o pedido 20974 entrega na *Rua General Osório* e fatura
na *Rua Marechal Deodoro*, CEPs diferentes. Repetir ali o da entrega poria, embaixo de um CNPJ,
o endereço de outra empresa.

Por isso a função do banco busca pelo **mesmo id que preenche o cadastro da nota**.

### De onde ele vem

Do endereço **PRINCIPAL** do faturado. Não existe endereço de faturamento no banco: medido em
25/08/2026, `enderecos.tipo_endereco` só tem três valores — `PRINCIPAL`, `ENTREGA` e nulo. O
principal é o endereço de cadastro da pessoa jurídica, que é o que a nota usa.

Cobertura: dos 63 links ativos, **62 passaram a ter endereço na nota**. O mesmo desempate do
bloco da entrega — sem principal, vale o endereço só quando ele é o único.

O bloco não manda `recebedor` nem `cpf_recebedor`: aqueles são de quem recebe o PACOTE, e esta
página é pública — campo que a tela não mostra não sai do banco.

### Duas decisões de tela

**O endereço entra logo depois do documento**, e não no fim do cartão: a proximidade é o que
diz que ele é *daquele* CNPJ, sem precisar de um rótulo explicando.

**Endereço que falta aparece em âmbar**, escrito "Não informado", e não some. Mesma regra da
aba de Entrega, e pelo mesmo motivo: campo escondido é campo que ninguém corrige — quem
descobre é o contador, com a nota já emitida.

### De quebra: o documento ganhou máscara

`14302058000102` virou `14.302.058/0001-02`, e o CPF virou `042.561.770-00`. O cartão inteiro
existe para o cliente **conferir**, e catorze dígitos grudados não se conferem olhando. É a
mesma decisão do CEP, tomada no mesmo dia. Documento incompleto continua passando cru: máscara
em número truncado o faria parecer completo.

A função `link_cliente_pedido` foi executada no banco — a mudança é **aditiva** (só acrescenta
uma chave ao JSON), então a página antiga continuou funcionando na janela entre o SQL e o
deploy.

Coberto por 24 conferências novas no `portal_confirmacoes_harness.js` (81 no total) e 2 em
`tests/test_portal_do_pedido.py`.

---

## [2026-08-25] — O número do conhecimento do SEDEX, clicável, no Painel do Acabamento

Pedido do usuário: *"quando já existir o link do número de conhecimento do sedex, ao clicar
abrir o rastreamento"*.

### O que já existia

O código já virava link — mas **só na aba de Entrega do link do cliente**. Conferi no navegador
antes de escrever qualquer linha, no pedido 20975: `AD831882537BR ↗` apontando para
`rastreamento.correios.com.br`, HTTP 200. Funcionando.

Quem posta o pacote, porém, é a **gráfica** — e ela não via o código em tela nenhuma. Uma
varredura por `codigo_rastreamento` no `frontend/` devolvia um arquivo só: `cliente-entrega.js`.

### Onde ele passou a aparecer

Na coluna **Frete** do Painel do Acabamento, embaixo da logo da transportadora — a tela onde o
pedido é entregue à expedição e onde fica a lista do que já foi despachado.

**Sem código, nada é desenhado no lugar.** Um traço embaixo da logo se leria como "sem
rastreio", quando a verdade é "ainda não despachou" — o estado da maioria dos pedidos ali.

**O clique não abre o pedido junto.** A linha inteira da tabela é clicável; o link traz
`event.stopPropagation()`. Sem isso, tocar no código abriria as duas coisas.

### Duas decisões de estrutura

**A função mudou de casa.** `linkDeRastreio` saiu do `cliente-dados.js` e foi para o
`logo-do-frete.js`, que é o módulo que as duas telas já carregam e o lugar temático — ali mora
o que sabe de transportadora. Duas telas montando o endereço dos Correios por conta própria é a
mesma armadilha da regra de "pago", resolvida do mesmo jeito. Junto veio `rastreioHtml()`, que
devolve string vazia quando não há código.

**A consulta não é nova.** `propostas_os` já era lida no `loadOrdensFromVibecode` pelo prazo de
entrega; bastou pedir mais uma coluna. Uma segunda ida ao banco por um campo de treze
caracteres seria desperdício num painel que abre com milhares de pedidos.

### Conferido

No navegador, com dois pedidos semeados: o que tem código mostra `AD831882537BR ↗` em azul
sublinhado embaixo da logo do SEDEX; o que não tem mostra só a logo. E o link do cliente segue
funcionando igual.

`tests/test_rastreio_do_sedex.py` (5 casos) e 16 conferências novas no
`logo_do_frete_harness.js` (47 no total). **Esse harness era órfão** — nenhum `test_*.py` o
chamava, então as 31 conferências que ele já tinha só rodavam se alguém digitasse `node` à mão.
Agora ele entra na suíte.

---

## [2026-08-25] — O PDF Gabarito parou de sair do tamanho da logo

Relato do usuário: *"na lista de arte, ao editar um pedido, quando uma numeração possui um PDF
como elemento, ao tentar baixar o PDF gabarito, não está levando o gabarito correto. Está
levando somente o elemento PDF da numeração"*. Estava certo.

O `exportarPdfGabarito` fazia `copyPages(arquivoDoElemento, [0])` e usava aquela página **como**
a página do modelo. O arquivo do elemento virava a folha inteira, e a posição e o tamanho dele
na arte eram ignorados. Medido com os arquivos que estão no banco:

| Numeração | Formato do modelo | Página que saía |
|---|---|---|
| `001 - Padrão Ideal` (Triband) | 245,00 × 20,00 mm | **14,76 × 20,30 mm** |
| `1000547` (pedido 21146) | 105,00 × 148,00 mm | **105,71 × 146,21 mm** |

A Triband é a que mostra o tamanho do estrago: o elemento é a logo `Logo_Tri.pdf`, de
10,18 × 14 mm, encostada na ponta direita da pulseira. O gabarito de uma pulseira de 24,5 cm
saía com 1,5 cm — só a logo. E a numeração rasterizada era desenhada nessa página com 245 mm de
largura, 16,6× maior que o papel: tudo transbordava.

O botão vizinho, **PDF Arte**, sempre acertou — ele faz `copiedPage.setSize(ptW, ptH)` depois de
copiar. Era uma linha de diferença entre os dois.

Agora a página do gabarito nasce sempre no tamanho do modelo, e os elementos PDF entram
**vetoriais**, cada um no retângulo dele (`embedPage` + `drawPage`), sem distorção e com a
opacidade do elemento — o mesmo que o motor faz no papel com `show_pdf_page(keep_proportion=True)`.
A geometria mora em `caixaDoElementoPdfNaPagina`, função pura, e quatro conferências comparam o
resultado com o do próprio motor, medindo a tinta na página em milímetros.

Três coisas melhoraram junto, todas pelo mesmo caminho:

- **Todos** os elementos PDF entram. O código antigo fazia `pdfEls.find(...)` e parava no
  primeiro; uma numeração com dois PDFs impressos perdia o segundo.
- O raster deixou de redesenhar por cima o que já entrou vetorial. Rasterizar arte vetorial do
  cliente é proibido neste projeto.
- O elemento marcado como **Layout** continua fora, e o registro legado que guarda a arte na
  coluna `pdf_content` continua saindo como fundo do modelo inteiro.

> [!NOTE]
> Isto é PDF interno de conferência: o botão existe no `index.html` e no `producao.html`, e não
> no link do cliente. O que vai ao cliente e o que vai à impressora não mudaram.

---

## [2026-08-25] — O editor de numeração de um modelo ganhou saída

Pedido do usuário: *"ao editar a numeração de um modelo, precisa ter o botão Voltar para poder
sair sem salvar"*.

Quem abre a numeração de um modelo (pelo ✏️ no card do pedido, ou pelo clone da imposição) cai
no editor com `window.customNumeracaoEditState` armado — o objeto que diz *"a numeração que for
salva agora pertence ao modelo X do pedido Y"*. Não havia botão de saída: o único caminho de
volta era o menu lateral.

E o menu lateral sai da tela **sem desfazer o vínculo**. Com ele pendurado, a próxima numeração
salva — qualquer uma, inclusive uma do catálogo geral aberta pelo menu — nascia marcada como
exclusiva daquele modelo (`is_custom`, `os_item_id`, `Cli_Num`) e ainda era amarrada a ele por
`saveAmostraToDB`. Era mais um caminho para a numeração fantasma investigada no mesmo dia, e
nada na tela denunciava.

Agora `cancelNumEdit()` zera o vínculo junto com o formulário, e o `← Voltar sem salvar` apenas
o usa: limpa, e devolve o operador para de onde veio — o pedido (redesenhando os cards) ou a
imposição. Sem estado nenhum, cai no catálogo, que é de onde esta tela nasce.

> [!CAUTION]
> A ordem no `saveNumeracao` não pode inverter. Ele também chama `cancelNumEdit()`, e o código
> que amarra a numeração ao modelo roda **depois**. Se lesse `window.customNumeracaoEditState`
> nesse ponto encontraria `null` e o modelo ficaria sem a numeração nova, calado. Por isso o
> save guarda o estado numa variável antes de limpar — e um teste prende essa ordem.

**Não pergunta "tem certeza?".** O rótulo já diz "sem salvar", e pedir confirmação para uma
saída que a pessoa acabou de escolher é atrito em cima de uma decisão consciente. O que se
perde é o posicionamento não salvo; o que estava no banco continua lá.

Conferido no navegador pelo caminho real (`editCustomNumeracao` com os dois `setTimeout` do
fluxo): o vínculo sobrevive ao `editNumeracao`, o botão acende, e o clique devolve ao pedido
com o vínculo desfeito e o formulário limpo. Coberto por
`tests/test_voltar_da_numeracao_do_modelo.py` (7 casos).

---

## [2026-08-25] — A numeração fantasma: duas com o mesmo nome, e o modelo trocando sozinho

Relatado pelo usuário: *"estamos tendo problemas com numerações salvas com mesmo nome, não
está avisando que já existe nem sobrescrevendo, está ficando numeração fantasma, hora carrega
uma hora carrega a outra"*.

### O que o banco mostrou

`producao_numeracoes` **não tem UNIQUE em `name`** — só a chave primária, o
`UNIQUE (id_gabarito)` e a FK do formato. Três nomes repetidos em 86 registros:
`001 - Padrão Ideal` (2, criadas com 4 dias de diferença), `Personalizada` (2, 22 horas) e
`1000535` (2, **28 minutos**).

O `1000535` é o caso que dói: as duas são exclusivas do **mesmo modelo** — mesmo `Cli_Num`
(61567), mesmo `os_item_id`. Uma ficou com 678 bytes de elementos e 77 kB de CSV; a outra,
com 1.140 e 90 kB. O modelo aponta para a segunda, e o trabalho da primeira virou órfão —
invisível na tela, porque registro com `Cli_Num` não aparece no catálogo.

### O mecanismo do "hora uma, hora outra"

Depois de salvar, o vínculo do modelo com a numeração exclusiva era feito **pelo nome**:

```js
const newNum = state.numeracoes.find(n => n.name === newNumName);
```

Com dois homônimos, `.find()` devolve o **primeiro da lista**. E a lista não tinha ordem: o
`api('GET', '/numeracoes')` fazia `select('*')` sem `order`, então o Postgres devolvia na
ordem **física** do heap — e um UPDATE grava uma versão nova da linha e a **move de lugar**.
Conferido pelo `ctid`: as duas `1000535` estavam em `(19,6)` e `(19,7)`, e editar uma trocaria
as posições. O modelo era vinculado a uma numeração diferente conforme quem tinha sido salvo
por último.

### O conserto

**O vínculo passa a ser pelo id.** `idDaNumeracaoGravada` sai dos três caminhos de gravação —
editar, substituir a homônima e criar. O de criar é o que engana: sem `supabaseClient` quem
cunha o id é a própria `api()`, então ele vem do retorno do POST, que é a linha inserida.

**O catálogo vem em ordem fixa.** `.order('id')` na consulta de `producao_numeracoes` — id, e
não nome, porque ordenar por nome deixaria justamente as homônimas indefinidas entre si. É a
segunda linha de defesa, para o próximo leitor.

**O recado de falha diz o que aconteceu com o modelo.** Era `Numeração "X" NÃO encontrada
após salvar!`, que soa como se a numeração tivesse se perdido; ela foi gravada, o que falhou
foi o vínculo.

### A outra metade: o aviso quando o nome já existe

Escolhido pelo usuário no mesmo dia, entre duas saídas: **conferir no banco e perguntar**.

Até então o `saveNumeracao` procurava a homônima em `state.numeracoes` — um retrato tirado no
`loadAll()` — e, achando, **substituía calada**; o toast "Numeração substituída!" chegava como
fato consumado, em cima do trabalho de outra pessoa que por acaso escolheu o mesmo nome. Não
achando, criava a segunda. Foi assim que as três duplicatas nasceram: em todas, as criações
estão longe o bastante (4 dias, 22 horas, 28 minutos) para a página da segunda ter sido aberta
antes de a primeira existir.

`homonimasDoCatalogo()` pergunta **ao banco** a cada salvamento. Três detalhes que parecem
detalhe e não são: traz `id, name` de todas e compara aqui, em vez de filtrar no servidor com
`ilike` — `%` e `_` são curinga ali, e `Ticket_A` casaria com `TicketXA`; compara sem caixa e
sem espaço nas pontas, que é como um operador lê dois nomes e os considera o mesmo; e ignora a
própria linha, senão editar sem renomear colidiria consigo mesma.

O que acontece na colisão depende de onde ela é:

| Situação | O que acontece |
|---|---|
| Numeração **exclusiva de um modelo** | Substitui direto, sem perguntar — o nome É o id do modelo, e a homônima é a versão anterior dele mesmo |
| **Criando** no catálogo | Pergunta. Confirmou, substitui; cancelou, não grava nada e diz para trocar o nome |
| **Editando** e renomeando para o nome de outra | Recusa — "substituir" ali seria fundir dois registros vivos |
| O nome **já está repetido** no catálogo | Recusa e diz quantas são; escolher uma por conta própria repetiria o defeito |

O `confirm` que não aparece devolve `false`, e aqui isso vale por cancelar: nada é destruído e
o operador vê um recado. Falhar fechado é o certo quando o outro lado é apagar trabalho.

As três duplicatas continuam no banco, intocadas — mexer em dado de produção é decisão do
usuário. `producao_numeracoes` também segue **sem UNIQUE em `name`**; enquanto não tiver, esta
consulta é a única guarda.

Coberto por `tests/test_numeracao_homonima.py` e `tests/numeracao_homonima_harness.js`
(26 conferências, os seis caminhos de decisão exercitados com o bloco recortado do `script.js`).

---

## [2026-08-25] — O caractere que a fonte não desenha: a tela mentia, o papel saía furado

Pedido do usuário: *"o arquivo .csv é composto por nomes estrangeiros, com caracteres
pouco comuns, esses caracteres visualizam corretamente nas janelas de visualização, mas
geram pdf e impressão falhas — analisar se este tipo de divergência poderia ser evitado"*.

**Podia, e o preço de não ter evitado já tinha sido pago.**

### O defeito

Quando falta um caractere na fonte, o **navegador troca de fonte só naquele caractere**, em
silêncio, e a tela mostra o nome inteiro. O PyMuPDF não faz isso: desenha o que a fonte tem
e deixa o vão. Mesmo dado, mesma fonte, dois resultados — e o único que alguém vê antes de
imprimir é o que mente.

Medido no pedido **21146** (credenciais do FITNP/FIDAF): a Gotham Book não tem `ř`, `ě` nem
`č`. Gerando o PDF com a própria fonte do catálogo e lendo o texto de volta, `Ondřej Pek`
volta `Ond ej Pek` — oito dos dez nomes tchecos daquele modelo. A amostra que o cliente
**aprovou** às 12:37 daquele dia mostra o nome inteiro.

E não era a primeira vez. O pedido **20495**, da mesma cliente e do mesmo evento, imprimiu
**185 credenciais em 11/08** com as mesmas fontes e os mesmos nomes; Tchéquia e Macedônia do
Norte voltaram `REPROVADA_CLIENTE`. O briefing do 21146 diz, com todas as letras, que ele é
o retrabalho daquilo — e ia repetir o erro.

Não é azar com uma fonte: das **273 fontes ativas do catálogo, 173 não conseguem imprimir
aquela planilha**. As 100 que conseguem são quase todas fontes do Windows; as de marca
(Gotham, Swis721, Swiss 911, Bodoni, Abril Fatface) falham em bloco. Varrendo o acervo,
**7 das 19 numerações** com banco imprimiriam buraco.

### O leitor de glifos

`frontend/fonte-glifos.js` lê a tabela `cmap` do próprio arquivo da fonte — formatos 0, 4, 6
e 12, em TTF, OTF, TTC e WOFF — e responde quais caracteres ela realmente desenha. Conferido
contra o `has_glyph` do PyMuPDF, que é a verdade do motor, nas **273 fontes reais do
catálogo: 271 idênticas, 0 divergentes**, 2 ilegíveis (PhagsPa) que viram "desconhecida".

**A regra de ouro: fonte que não deu para ler não acusa ninguém.** WOFF2, fonte do sistema,
arquivo que não baixou, binário torto — todos devolvem "não falta nada". Uma trava falsa
pararia a gráfica por causa de um arquivo que o leitor não entendeu, e isso é pior do que o
defeito que ela conserta.

As Base-14 do PDF (`helv`, `times`, `cour`) são caso à parte e **não** se perguntam ao
`fitz.Font`: nesta versão do PyMuPDF ele devolve uma fonte completa, que tem o `ř`, mas o
que vai ao PDF é a Base-14 em WinAnsi. Medido: `insert_text` com `helv` grava
`Ond·ej Pek` — não é um vão, é um caractere **trocado**, que é pior, porque ninguém
estranha um ponto no meio do nome. A pergunta certa ali é o cp1252, e um teste trava as duas
listas juntas.

### As quatro camadas

**1. A trava do card.** `fonteSemGlifoDoModelo` entra na mesma engrenagem de
`divergenciaDeCelulasDoModelo` e `bancoDeDadosIncompletoDoModelo`: faixa vermelha, PRONTO
desabilitado, e o pedido inteiro parado até alguém trocar a fonte — porque o pedido só vira
"Enviar Arte" com todos os modelos PRONTO. A recusa está nos três caminhos (botão,
`decisionAmostraItem` e o lote), não só no botão. Ela olha **a fatia de linhas daquele
modelo**, não o banco inteiro: no 21146 só a Tchéquia é acusada; Macedônia e Organização,
cujas linhas ativas não têm caron nenhum, passam.

**2. A prévia mostra o buraco.** `comoSaiNoPapel`, no `texto-ajuste.js`, troca o caractere
sem glifo por espaço **antes** do ajuste de largura — no traço e na medida. O `ř` emprestado
tem uma largura e o vão do papel tem outra, e é a medida que decide o shrink e a quebra de
linha.

**3. O motor grita no log.** `_avisar_glifos_faltando` é a última defesa, para o caminho que
não passa pela tela — hotfolder, reimpressão, API. Nunca levanta: um erro ali pararia uma
impressão que ia sair de qualquer jeito.

**4. O seletor de fontes é a saída da trava.** A faixa manda trocar a fonte; o seletor diz
por qual. Ao abrir, ele confere a fonte atual (um arquivo, imediato) e marca ✅/⚠️ o que já
estiver no cache; o botão **🔤 Conferir quais fontes servem** varre o catálogo em lotes de
12. Fonte não conferida sai **sem selo nenhum** — marcar de verde o que ninguém leu seria a
mesma mentira que este trabalho inteiro desfaz.

### Dois defeitos vizinhos, encontrados no caminho

**O cache de fonte do motor nunca rebaixava.** Era `fonts/<família>.ttf` puro, com
`if not os.path.exists`: trocar o arquivo da fonte no catálogo — que é justamente o conserto
de "esta fonte não tem o `ř`" — não chegava a nenhuma estação que já tivesse a versão velha.
Cada máquina ficaria num estado diferente, em silêncio. O nome agora carrega um hash da URL.

**O editor nunca pré-carregou as fontes.** `drawPreview` lia `state.elements`, que **nunca
existiu** no state (é `state.numElements`): `fontesDosElementos` recebia `undefined`,
devolvia lista vazia, e o pré-carregamento inteiro era letra morta — o editor desenhava com
fonte genérica na primeira pintura e ficava assim, porque canvas não reflui.

### E o nome do modelo no chat do cliente

No `cliente.js`, o `onclick` do botão passa o id como **texto** e o banco devolve **número**:
o `===` cru nunca achava o item, e a mensagem caía no rótulo genérico. No 21146 as três
aprovações viraram três linhas idênticas dizendo `O cliente APROVOU a amostra do item:
"Produto"` — o atendimento não tinha como saber qual dos três modelos foi aprovado, e com
ALTERAR a observação da mudança chegava igualmente sem dono. O `script.js` já tinha a
correção; esta cópia ficou para trás.

### Conferido

`tests/fonte_glifos_harness.js` (21 casos) e `tests/test_fonte_sem_glifo.py` (25 casos).
No navegador, com os dados reais do 21146: antes da cobertura chegar, nenhuma acusação;
depois, a Tchéquia acusa `"ř" (U+0159), "ě" (U+011B), "č" (U+010D)`, o PRONTO sai
`disabled` com o motivo no `title`, e os outros dois modelos seguem liberados.

---

## [2026-08-25] — Link do cliente: a arte antes da decisão, a trilha do pedido e os ícones desenhados *(v718)*

Pedido do usuário: *"reavaliar e propor melhorias visuais e de usabilidade no link do cliente,
deixar mais fluido e prático"* — desenhado antes numa prancheta de proposta, com a tela de hoje ao
lado da redesenhada, e aprovado com *"muito bom, executar"*.

Nada aqui mudou regra de negócio nem o que sai impresso. As cores são as mesmas do `style.css`, os
textos de aviso continuam sendo os que o código já escrevia, e o par de decisão continua com o
mesmo peso visual dos dois lados — de propósito, para não empurrar ninguém a aprovar sem ler.

### O cartão do modelo inverteu

Ele abria com os botões **APROVAR** / **ALTERAR** e com uma caixa de texto rotulada *"Anotações /
Observações de Alteração"*; a arte vinha **depois**. Lendo de cima para baixo — que é como se lê um
celular — o cliente era convidado a decidir antes de ver o que estava decidindo, e a caixa aberta
sugeria que escrever nela fazia parte de aprovar. O rótulo, ainda por cima, é vocabulário do painel
interno.

Agora: nome do modelo e estado no topo, **a arte**, o que ela é (produto, quantidade, frente e
verso), e por último os dois botões — **Aprovar** e **Pedir alteração**.

**A caixa de alteração nasce fechada** e abre no toque de *Pedir alteração*, com o botão *Enviar
pedido de alteração* dentro dela. A exigência antiga continua de pé: o `decisionAmostraItem` recusa
`REPROVADA` sem descrição, porque a gráfica não sabe o que refazer. Por isso o `<textarea>`
**continua no HTML mesmo com a caixa fechada** — sem ele, a recusa cairia num `focus()` de elemento
inexistente e o cliente ficaria com o aviso e nenhum lugar para escrever. O `display` vai no
`style=""`, e não numa classe: regra de folha de estilo perde para atributo `style`, e nesta mesma
tela um `hidden` já deixou de esconder dois botões por causa disso.

### A trilha do pedido, acima das seções

O Portal tem cinco abas, mas só **três** pedem alguma coisa do cliente: aprovar a arte, conferir a
entrega e conferir os dados da nota. Orçamento e Pagamento são consulta.

Essa distinção não existia na tela: as cinco abas eram idênticas, e o que faltava só era dito
**dentro** de cada uma, no fim da rolagem. Quem abrisse na aba de Orçamento não tinha como saber que
havia duas conferências esperando em outro lugar.

A trilha mora fora das seções e vale para as cinco: *"Para fechar o pedido — 1 de 3 concluídas"*,
com uma barra e três etapas. **Cada etapa é um botão que abre a aba dela** — dizer o que falta sem
oferecer o caminho é a metade do trabalho — com o piso de toque de 44px, porque é controle e não
rótulo.

A conta da arte usa a **mesma** pergunta do cartão de finalização (`artesJaAprovadas`), e não uma
conta paralela: duas contas sobre a mesma coisa acabam divergindo, e o cliente veria a trilha dizer
"concluída" com o botão de finalizar ainda travado. Pedir alteração **também conta como decidir**: o
pedido dele já está registrado e vai para o atendimento.

### O sinal de pendência em cada aba

Ponto âmbar quando a aba espera uma ação, visto verde quando já foi resolvida, e nada quando é só
informação. O estado vai também em `aria-label`, para quem não enxerga a cor.

**Pagamento só acende quando há o que o cliente possa fazer ali**: cobrança em aberto **com link que
abre**. Pedido faturado, ou cobrança sem link liberado, não ganha ponto — sinal de pendência sem
botão do outro lado é cobrança em cima de quem não pode resolver.

### Ícones desenhados no lugar dos emoji

Novo `frontend/icones-cliente.js`, e o `cliente.html` guarda só o **nome** de cada ícone
(`data-icone="arte"`).

Emoji não é desenho nosso: é uma **fonte do aparelho de quem abre**. Quem abre este link é o cliente
da gráfica, no celular, pelo navegador embutido do WhatsApp — e ali o 🎨 do Android tem outra forma,
outra paleta e outro peso que o do iPhone. Pior no detalhe que ninguém antecipa: emoji é colorido por
definição, então ele **não acompanha a cor do texto ao lado** — a aba ativa fica azul e o ícone dela
continua multicolorido.

Traço de 1,8px numa grade de 24px resolve os três: mesmo desenho em todo aparelho, herda a cor por
`currentColor`, escala sem borrar. **O rótulo em texto continua obrigatório** — ícone sozinho não diz
para onde leva. Se o módulo não carregar, as abas ficam sem desenho e **com** o rótulo.

> `icones-cliente.js` entrou na `PAINEL_ARQUIVOS` do `security_config.py` na mesma leva. Sem isso a
> estação serviria uma `cliente.html` pedindo um script que dá 404 — o teste
> `test_todo_arquivo_que_o_painel_carrega_esta_na_lista_de_sincronismo` pegou isso antes de sair.

### Entrega: "quando chega?" virou a resposta que abre a aba

A soma dos dois prazos já era calculada pelo `prazoDeEntrega` desde 20/08 — faltava o **lugar**. Ela
saía como a segunda de sete linhas dentro do cartão de Envio, do mesmo tamanho do código de rastreio.

Agora abre a aba: *"Seu pedido chega em **7 dias úteis**"*, com produção e transporte em duas caixas
embaixo e a forma de envio na linha de baixo. Continua sendo **"a partir de"** — é o piso do prazo, e
a gráfica não promete o dia exato; inventar uma data aqui criaria uma promessa que ninguém fez.

O painel **não nasce** quando falta número dos dois lados: painel grande escrito "a combinar" é
espaço nobre gasto para não dizer nada, e o cartão de Envio abaixo já diz isso. E o `linhasDoEnvio`
continua devolvendo tudo (é a função com teste); quem filtra as linhas de prazo repetidas é o
`envioSemOsPrazos`, na camada de tela.

**O que falta virou uma linha com o botão ao lado.** Os avisos de recebedor terminavam em *"toque em
ALTERAR abaixo"* — e o ALTERAR fica noutro cartão, depois de sete linhas de endereço. O botão
*Informar* faz exatamente o que o Alterar faz (`decidirDados('entrega', false)`): mesma porta, na
altura de quem leu o problema.

### Pagar: um painel só

A aba abria com **duas** caixas de destaque empilhadas — *"Status do pagamento"* e *"Total do
pedido"* —, e o total já era o mesmo número que a aba de Orçamento mostra em destaque. Duas caixas do
mesmo tamanho, uma repetindo outra aba, e nenhuma respondendo o que o cliente vem perguntar aqui:
**quanto eu ainda devo?**

Agora o número grande é o que **falta**, com o já pago e o total em letra menor embaixo da barra. A
conta sai das **cobranças**, e não de `propostas.valor_total`: são números diferentes quando o pedido
foi cobrado com entrada mais parcelas, ou quando o financeiro cancelou uma e emitiu outra — dizer
"falta R$ 5.700" para quem já pagou a entrada seria cobrá-lo duas vezes na tela.

Pedido **sem cobrança** não entra nessa conta: ali o painel mostra o valor do pedido, porque "falta
R$ 0,00" se lê como "está pago". E a barra some quando os valores não vieram — uma barra que anda por
engano diz uma mentira sobre dinheiro; aí a legenda conta **cobranças** ("1 de 2 pagas").

Na lista, a cobrança **em aberto vem à frente** e a paga fica recolhida: o que o cliente veio fazer
aqui é pagar o que falta.

### O cabeçalho encolheu

A logo e o selo dividem a primeira faixa; o pedido vem embaixo. Antes o cabeçalho empilhava em quatro
andares no celular e o selo — que é a resposta a *"como está meu pedido?"* — nascia por último.
**202px → 154px**, e a arte começa mais acima.

O selo passou a ser **preenchido, com um ponto na cor**, no lugar do contorno vazado: no escuro do
fundo, e na tela de um celular no sol, âmbar (`aguardando aprovação`) e laranja (`alteração
solicitada`) ficavam indistinguíveis — e são justamente os dois estados em que o cliente precisa
fazer alguma coisa.

> **Uma armadilha do CSS, para quem vier depois:** o aperto do celular (logo a 38px, selo menor) teve
> de ir para um `@media` no **fim** do `style.css`. `.cliente-logo` e `.portal-selo` são redefinidos
> no bloco do Portal, e uma media query escrita **antes** perde para eles — mesma especificidade,
> vence quem vem depois. Na primeira tentativa a regra existia, era ignorada em silêncio, e a logo
> continuava a 47px.

### Conferido no navegador, e não só nos testes

Puppeteer a 390px e a 1200px, com sete modelos semeados: a arte acima dos botões, a caixa de
alteração fechada e abrindo no toque, a trilha e os pontos acompanhando cada decisão, o cabeçalho com
logo e selo na mesma linha, sem erro de console e sem rolagem horizontal. Também no estado de **só
leitura** (pedido em produção): contador escondido, botões fora, aviso com o ícone no círculo.

Os harnesses do Portal ganharam **42 conferências novas** para prender as decisões acima. Suíte
inteira: 1.857 testes.

---

## [2026-08-25] — Link do cliente: a aba da arte diz o que falta, e vira sozinha

Conferência do fluxo de aprovação, dirigido de ponta a ponta num iPhone simulado nos
pedidos 21114 (3 modelos) e 21143 (7 modelos), com as gravações interceptadas — nada foi
escrito no banco (conferido depois: os dois seguem com zero modelos aprovados).

**O que o fluxo fazia:** marcar uma arte como aprovada não mudava de página. Só acendia o
botão FINALIZAR no rodapé, e apenas quando o **último** modelo era aprovado. Duas coisas
saíram daí.

**1. A barra não dizia quantos modelos faltavam.** Com 4 de 7 aprovados o cliente
encontrava um botão cinza morto, sem uma palavra explicando por quê — medido na tela:
nenhum contador na aba, e o único texto da barra era o rótulo do próprio botão. Ele não
tinha como saber se faltava rolar de volta ou se o sistema tinha travado. As abas de
Entrega e Nota sempre disseram o que falta; a da arte era a única trava do portal sem a
saída escrita ao lado.

Agora: *"Faltam **3 modelos** para aprovar. Role a página e toque em APROVAR ou ALTERAR em
cada um."*, com singular e plural certos, sumindo quando chega a zero.

**2. Aprovar a última leva o cliente para a aba de Entrega**, sem ele ter de achar e tocar
o botão FINALIZAR para dizer de novo o que acabou de dizer modelo a modelo. A barra mostra
*"✅ Todas as artes aprovadas. Levando você para os dados de entrega..."*, espera 1,2 s e
chama o mesmo `clienteFinalizarFluxo('APROVAR_TUDO')` de sempre.

> [!CAUTION]
> O salto nasce de um **clique**, e nunca da carga da página. Existem pedidos com todos os
> modelos já em `APROVADA_CLIENTE` e status ainda em `Aguard. Aprovação` — o 21112 é um.
> Decidido pelo estado, esse cliente abriria o link e seria empurrado para a Entrega antes
> de ver a arte, gravando aprovação e mensagem no chat do parceiro sem ter tocado em nada.
> Conferido: abrir esse link não dispara escrita nenhuma.

Dois detalhes que só aparecem na tela: a trava do salto é uma **bandeira**
(`state.arteSeguindoSozinho`), e não uma corrida com o relógio — o
`atualizarBarraFinalCliente` roda 50 ms depois e faria o botão verde piscar no meio do
caminho; e na última arte o toast "Item aprovado!" cede lugar ao aviso, porque ele nasce
no rodapé e tapava a frase.

Quem marca um modelo como ALTERAR continua sem salto: a barra vira o botão vermelho
**SOLICITAR ALTERAÇÃO DE ARTE**, como antes.

Coberto por 15 conferências novas em `tests/portal_abas_harness.js` (104 no total).

---

## [2026-08-25] — Lista de Arte: a coluna Pagamento, com o carimbo PAGO

Pedido do usuário: uma coluna entre **Status** e **Itens**, com o carimbo PAGO nos pedidos
sinalizados como pagos. A imagem é o arquivo que ele mandou, no Storage do Supabase, usada
como veio.

**Só o pago ganha marca.** O pedido em aberto fica com um traço discreto. Medido no banco
naquele dia, dos 2.629 pedidos então na Lista de Arte 1.950 estavam pagos: um selo em cada
um dos outros 679 encheria a coluna de alarme para o estado *normal* de um pedido que
acabou de entrar. O `title` diz qual é o caso — "Pedido pago", "Cobrança em aberto",
"N cobranças, nem todas pagas", "Sem cobrança gerada".

**A regra de "pago" ganhou casa própria**, em `frontend/pagamento-do-pedido.js`, porque a
aba 💳 Pagar do link do cliente faz a mesma pergunta sobre o mesmo dinheiro. Duas contas
diferentes fariam o cliente e a gráfica verem coisas diferentes — e é a gráfica que
descobre por último. O `statusDoPagamento` do portal passou a contar pela mesma função.

Ela diz PAGO quando **todas** as cobranças vivas estão em `PAID`:

- há 12 pedidos no banco com uma paga e outra em aberto (entrada mais parcela, referência
  `20927-A`, `20927-B`). Ali o selo verde faria o atendente deixar de cobrar;
- a cobrança **CANCELADA não conta** — são 331, e são cobrança que a gráfica desfez;
  contá-las impediria para sempre o selo de um pedido recotado;
- pedido **sem cobrança** não é pago: ali ela ainda não saiu, não que alguém pagou;
- status novo que o parceiro invente cai em "não pago" — o lado seguro do erro.

As cobranças chegam por `carregarPagamentosGlobais()` **depois** do primeiro desenho: a
coluna é apoio, e segurar a lista por ela atrasaria a tela que o atendimento abre de manhã.
A consulta traz só `id_int` e `status`; link de cobrança e PIX não se espalham por
listagem. Se a imagem não carregar, a célula cai num badge `✅ PAGO` — sem isso, uma falha
de rede deixaria a célula igual à do pedido **não** pago.

Conferido no navegador com os dados reais: 684 pedidos na tela, 411 com cobrança, 284 com o
carimbo. E o mesmo pedido #21111 aparece "Pago" nas duas telas.

Coberto por `tests/pagamento_do_pedido_harness.js` (42 conferências) e pelo contador de
colunas que já existia no `lista_arte_enxuta_harness.js`, atualizado de nove para dez.

---

## [2026-08-25] — Conferência geral do Link do cliente: seis defeitos

Varredura da página do link do cliente (o Portal do Pedido), lida arquivo a arquivo e
aberta num iPhone simulado com dois pedidos reais — um em produção e um aguardando
aprovação. Seis defeitos, todos confirmados no navegador antes e depois do conserto.

**1. Pedido já em produção ainda mostrava APROVADO / ALTERAR.** Os botões de decisão
saíam com o atributo `hidden`, e o `[hidden] { display: none }` vem da folha do
*navegador* — perde para `.amostra-decisao-btns { display: flex }`, que é nosso. Medido no
pedido 20596, já na impressora: atributo presente, `display` calculado `flex`, botões
clicáveis. O ALTERAR morria num beco (pedia a caixa de anotações, que o modo leitura tinha
removido), mas o **APROVAR gravava**: regravava o status no banco e postava mais um
"o cliente APROVOU a amostra" no chat do atendimento. Agora os botões saem do HTML.

**2. A barra FINALIZAR era transparente e cobria o conteúdo.** O `.cliente-actions` é uma
barra `sticky` sem fundo — quem tapa o que passa por baixo é o próprio botão. O estado
desabilitado vinha com `opacity: 0.6`, então o card do modelo seguinte aparecia *através*
do rótulo. É o primeiro estado que todo cliente vê. O cinza ficou opaco, e a barra ganhou
fundo como segunda linha de defesa.

De quebra, o `atualizarBarraFinalCliente` reescreve o `.cliente-actions` e devolvia
`height: 48px` e `font-size: 1.1rem` **inline**, desfazendo em silêncio o conserto
documentado no `cliente.html` (`min-height`, sem tamanho de fonte preso — atributo `style`
ganha de media query). O rótulo cabia por dois pixels. Os três botões passam a dividir a
mesma forma do HTML.

**3. Quem já tinha conferido era obrigado a conferir de novo.** `portalConfirmacoes`
nascia zerado a cada abertura, e o selo `entrega_dados` — que a carga do portal já trazia —
não era lido em lugar nenhum. O cliente confirmava, finalizava, voltava pelo link no dia
seguinte para ver o prazo e lia *"Para finalizar, falta: conferir os dados na aba
Entrega"*. Refazia, e o atendimento recebia a mesma mensagem duas vezes. Agora
`reidratarConfirmacoes` devolve o que ele já decidiu: `APROVADO` volta confirmado,
`CORRIGIR` volta com o texto que ele escreveu. `ALTERADO` **não** volta — esse selo nasce
do atendente pedindo nova conferência, e reidratá-lo apagaria o pedido dele.

**4. O frete sumia do orçamento de reserva.** `linhasDoOrcamento` chamava
`rotuloDoFrete(pedido)` com um argumento só. O segundo cobre os nomes que
`propostas.frete_escolhido` não tem — "Frete Incluso", "Transportadora Parceira" —, e sem
ele um pedido cujo frete só existe na cotação saía como "A combinar", com a transportadora
já escolhida.

**5. 82 kB de numerações alheias no 4G do cliente.** O catálogo vinha com `elements` de
todas as 86 numerações do sistema, e o pedido usa uma ou duas. Medido: a consulta caiu de
116 kB para 34 kB. As *linhas* continuam vindo todas de propósito — o
`reconciliarCorNumDoModelo` acerta a numeração pelo nome quando o parceiro a troca, e uma
lista filtrada por id deixaria de fora justamente a linha que só o nome acha.

O cuidado que isso exigiu: `numIsDuplex` decide o verso e pergunta ao `elements`. No banco,
**nenhuma** das 86 numerações tem `print_mode = 'duplex'` e **cinco** têm elemento no
verso — ou seja, quem responde é só o `elements`. Por isso `carregarMioloDasNumeracoes`
roda ANTES da montagem dos itens; buscado depois, essas cinco perderiam o verso em
silêncio.

**6. Polimento.** CEP com hífen (`94574-110`, não `94574110`) na aba de entrega e no
endereço da gráfica; jargão interno fora do card do cliente (`NI: 1 → NF: 65`, `🏭 --`,
`-- S/ VERSO`); a moldura vazia que sobrava no lugar do painel de decisão; e a
`mostrarResultadoCliente` com a `<div id="cliente-resultado">`, mortas desde o Portal.

**Os testes do Portal entraram na suite.** Varredura no mesmo dia mostrou que
`portal_abas`, `portal_dados`, `portal_confirmacoes` e `portal_orcamento` não eram citados
por nenhum `test_*.py`: 250 conferências que só rodavam se alguém digitasse `node` à mão.
`tests/test_harnesses_do_portal.py` fecha isso — sem ele, as travas escritas para estes
seis consertos nasceriam mortas. Total agora: 338 conferências nos quatro.

---

## [2026-08-20] — O acento se perdia no caminho até o banco *(banco e ferramenta, sem versão nova do site)*

Quando o cliente pedia alteração da arte, o status do link não mudava. A função
`link_cliente_status` recusava o valor que a página manda:

```
P0001 -- status nao permitido pela pagina do cliente: Em Alteração
```

A causa não era a lista de valores — era **codificação**. No Windows PowerShell 5.1,
`Invoke-RestMethod -Body <string>` com `application/json` sem charset codifica o texto em
**Latin-1**: todo acento chega estropiado ao servidor, e chega em silêncio, porque a API
aceita e o SQL roda. Foi assim que a função nasceu, meses atrás, com um literal que nunca
casou com o que o navegador envia.

Descoberto ao rodar o conserto e ver o resultado: a versão **sem** acento passou a ser
aceita, e a **com** acento continuou recusada — no mesmo arquivo, na mesma linha.

Dois consertos:

1. **`ferramentas/rodar_sql.ps1` manda o corpo em bytes UTF-8**, com o charset declarado. O
   que a API recebe passa a ser exatamente o que está no arquivo. Coberto por quatro
   verificações novas em `tests/Publicacao.Tests.ps1`.
2. **A função monta o acento por código de caractere** (`'Em Altera' || chr(231) || chr(227)
   || 'o'`), então a linha é ASCII pura e não há o que estropiar em nenhum transporte
   futuro. Ela aceita as duas grafias e **grava sempre a canônica** — o painel compara o
   texto, e duas grafias no banco virariam dois comportamentos.

A lista continua fechada: `qualquer coisa` segue recusado. Aprovar arte é autorizar
impressão, e sem a lista quem tivesse um token escreveria qualquer texto naquele status.

`sql/link_cliente_status_aceita_em_alteracao.sql`

---

## [2026-08-20] — O Prazo de Entrega deixa de ser inventado

A coluna PRAZO ENTREGA do Painel de Produção nunca mostrou prazo real: `getFallbackPrazo`
devolvia a data de criação mais 3 a 7 dias, escolhidos pelo resto da divisão do número do
pedido. Existia só para o filtro "Para Hoje / Atrasados" ter em que se apoiar enquanto o
campo verdadeiro não fosse definido.

O usuário apontou o campo — **`propostas_os.data_termino`**, casado por `id_int` — e o prazo
de mentira saiu. Pedido sem linha nessa tabela fica sem prazo e a coluna mostra `--`: ela é
nova do parceiro e ainda não cobre todo pedido, e data de entrega chutada numa gráfica é pior
do que campo vazio.

Como `data_termino` é data pura (sempre meia-noite), "atrasado" passou a ser **o dia do prazo
já passou**, e não mais o instante — senão todo pedido que vence hoje apareceria vermelho o
dia inteiro. `_prazoDoPedido` também protege o caso de a data vir sem hora, que o JavaScript
leria em UTC e faria o pedido vencer um dia antes no Brasil.

Coberto por `tests/test_prazo_de_entrega.py`.

---

## [2026-08-20] — Pedido já embalado sai da Lista de Arte

A lista reconhecia só produção, impressão e finalizada como "saiu da arte". Pedido em
acabamento, em trânsito, na expedição ou já impresso continuava ocupando a tela do designer.

A revisão foi feita contando o que existe nas 8.268 propostas do ERP. Entraram `IMPRESSO`,
`EM ACABAMENTO`, `EXPEDICAO`, `EM TRANSITO`, `ENTREGUE` e `REVISAO PRODUCAO`, com e sem
acento. Ficaram de fora `APROVADO` (3.363 pedidos) e `LIBERADO` (3.224) — soam como fim de
linha, mas são dois terços do banco e o pedido mais novo do dia está em `LIBERADO`; qualquer
um dos dois esvaziaria a lista. `REVISAO ATENDENTE` também fica: o atendente revisa antes de
mandar ao cliente. E `CANCELADO` fica de fora porque pedido cancelado não saiu da arte — ele
deixou de existir.

Coberto por `tests/test_lista_arte.py`, que trava as duas palavras proibidas com o número de
pedidos ao lado.

**A revisão nasceu de um erro meu na v654:** o reparo que criou linha em `pedidos_artes` para
12 pedidos antigos os trouxe de volta para a Lista de Arte — em produção, ter linha nessa
tabela é o que faz o pedido aparecer. Desfazer: `sql/desfazer_reparo_da_linha_de_arte.sql`.

---

## [2026-08-20] — A alteração de nota fiscal e entrega que o cliente escreve sumia

O que o cliente registra no link do cliente sobre os dados de nota fiscal e entrega não
estava sendo salvo. O painel mostrava sempre a frase de reserva — *"O cliente solicitou
revisão nos dados de entrega e faturamento"* — no lugar do texto dele.

Três causas somadas, todas silenciosas:

1. A tela do cliente gravava com `.update()`. Um UPDATE que não acha linha nenhuma **não é
   erro** no PostgREST: responde `200` com `[]`. O `supabase-js` também não lança — o
   `try/catch` em volta era enfeite.
2. A linha do pedido quase nunca existia: **38 linhas em `pedidos_artes` para 8.263
   propostas**; dos 12 pedidos mais recentes, um só tinha linha. Ela nascia apenas quando
   alguém preenchia o briefing no painel.
3. E a tela do cliente não pode criá-la: roda como `anon` e a RLS recusa o INSERT
   (`42501`). Ler e atualizar, pode — e isso está certo, não mudou.

O conserto tem os dois lados. O painel cria a linha ao gerar o link do cliente
(`garantirLinhaDePedidoArte`), com usuário logado; a tela do cliente grava por
`gravarCorrecaoDoCliente`, que pede as linhas afetadas de volta e devolve o resultado. Se
não gravou, o cliente vê um aviso com o número do pedido em vez de "Pedido Aprovado com
Sucesso". O botão "Salvar Correção", que só pintava a tela, passou a gravar.

Junto, o nome da coluna do chat do parceiro: as sete gravações mandavam `remetente_nome`,
que não existe em `propostas_chat` (é `autor_nome`), e o PostgREST recusava a linha
inteira. Nenhuma mensagem nossa jamais chegou àquele chat — nos três pedidos que têm a
correção gravada (18570, 19370, 20925) não há uma linha com `setor='Cliente'`.

Pedidos que já estavam com o cliente: `sql/correcao_do_cliente_precisa_de_linha.sql`.
Coberto por `tests/test_correcao_do_cliente.py`.

---

## [2026-08-20] — O catálogo de cores parou de carregar os PDFs

O parceiro Vibe reclamou que clicar no link da página dele para a nossa Lista de Arte
demorava. A medição no navegador apontou **uma consulta**: `producao_cores?select=*`,
**7,6 s**. A tabela guarda o PDF de referência de cada cor dentro da própria linha, em
base64 — 24 linhas, **17,8 MiB** de JSON, dos quais 11,7 KiB é o que a tela mostra. Só a
cor Mobi são 3,6 MiB; `preview_base64` são mais 1 MiB de uma coluna que nenhum arquivo do
frontend lê.

A lista passou a pedir só as colunas da tela (**2 KB**) e quem desenha a cor chama
`garantirPdfDaCor(cor)`, que busca uma cor por vez e guarda o resultado na linha.
`pdf_filename` e `name_verso` dizem que o arquivo existe sem baixá-lo. Medido com o mesmo
navegador contra o mesmo banco: **5.022 ms → 510 ms**.

A página de aprovação do cliente (`cliente.html`) fazia a mesma consulta e recebeu o mesmo
remédio — ali o cliente costuma abrir o pedido no celular, e via uma cor. É o mesmo
conserto que o `csv_data` das numerações já tinha recebido naquela página.

Coberto por `tests/test_pdf_da_cor.py`, que recorta `garantirPdfDaCor` do `script.js` e a
executa contra um banco de mentira: busca uma vez, guarda, não repete para cor sem
arquivo, e duas chamadas simultâneas viram uma consulta só.

---

## [2026-08-18] — A janela da amostra mostra 100% da arte, do tamanho que vai imprimir

Três releases seguidos (v641, v642 e v643) sobre a mesma queixa: *"parece visualizar com uma
borda, como se a janela tivesse um fio de contorno que acaba cortando parte da imagem"*. Eram
três causas diferentes, empilhadas, e todas só de tela — o papel sempre saiu inteiro, porque o
motor redesenha tudo do zero.

**v641 — o fio do CSS.** As caixas de amostra e o canvas do editor de numeração tinham
`border: 1px solid`. Com `box-sizing: border-box` a borda entra na largura: o desenho encolhia
2 px (a proporção de um canvas 1200 × 500 saía 2,3927 em vez de 2,4000) e a conta do clique em
`getCanvasPos()` ficava alguns pixels fora no extremo direito. Removida também a moldura
arredondada do canvas de numeração. E a centralização por flexbox passou a ser `safe`: um item
maior que a caixa transbordava pelos dois lados e a rolagem não alcançava o começo — medido em
308 px de arte inacessíveis acima do topo.

**v642 — a moldura pintada dentro do bitmap.** O fio que sobrou não era CSS: eram três
`strokeRect` desenhados no próprio desenho da amostra (`// Borda decorativa`,
`// contorno do formato` e `// Borda final da amostra`). Como a janela ampliada copia o canvas
do card e o JPEG de aprovação é esse mesmo canvas, o enfeite viajava para todo lugar. Medido
com uma arte que tem faixa vermelha colada no topo: a primeira fileira de pixels saía
`165,54,64` em vez de `255,0,0`; depois, `255,0,0`. Uma fileira recuperada em cima e outra
embaixo.

**v643 — a arte no tamanho real.** A tela e o motor tinham regras diferentes para encaixar a
arte na peça: o `engine.py` põe a arte em PDF no tamanho real da página, centrada, e deixa de
fora o que passar; a amostra encolhia a arte até o arquivo inteiro caber. Onde a arte não bate
com a peça, a tela mostrava a arte menor do que ela sai no papel, com faixa branca que o papel
não tem. Medido nos 25 modelos mais recentes: as credenciais (arte 98 × 148 numa peça
105 × 148) apareciam a 98,3%, e dois modelos do pedido 20508 (arte 245 × 20 numa peça Mobi
148,5 × 52,25) apareciam a **60%**. Arte em **imagem** continua em "contain", porque é o que o
motor faz com ela em `_load_base_as_pdf()`. O Criador de Arte foi alinhado junto.

No mesmo dia, a cor **Credencial PVC** foi corrigida de 145,5 para 148 mm de altura: era a
única das 24 cores fora de sincronia com o formato dela, e fazia a peça na tela nascer 2,5 mm
mais curta do que a que imprime — a camada de numeração, montada pelo formato, perdia 1,25 mm
em cima e embaixo. Decisão do usuário: manda o formato, porque é ele que a impressão usa.
(`sql/cor_credencial_pvc_alinha_com_o_formato.sql`)

A regra inteira, com as medições e o que conferir ao mexer em qualquer uma das quatro janelas
que desenham arte, está em [`como_a_arte_entra_na_peca.md`](como_a_arte_entra_na_peca.md).
Dois testes novos prendem o resultado — `tests/test_amostra_sem_moldura.py` e
`tests/test_arte_da_amostra_no_tamanho_real.py` —, e o segundo vigia também o `engine.py`: se o
motor mudar de regra, ele avisa que as telas precisam mudar junto.

---

## [2026-08-13] — Elemento travado também não pode ser excluído

A trava (🔒) dos elementos de numeração impedia apenas o arrasto e o alinhamento. Agora
impede também **excluir**, pelos três caminhos: o ✕ do cartão, o ✕ da lista "Adicionar Pdf
e Svg" e a tecla Delete — os três passam por `deleteSelectedElements`, que é onde a guarda
foi posta. O ✕ fica apagado com o motivo no `title`, e a tentativa responde com um toast.

Arrastar por engano e excluir por engano são o mesmo acidente para quem opera: perder
trabalho já posicionado. Numa gráfica isso só aparece quando o material saiu errado da
impressora.

Duas decisões que acompanham, com o critério de **o que se perde**:

- Excluir **para a operação inteira** quando há um travado na seleção (ou no grupo);
  apagar parte de uma seleção em silêncio é pior do que não apagar nada. O alinhamento
  continua apenas pulando os travados, porque lá nada é destruído.
- **A cópia nasce destravada.** Herdando a trava, uma cópia nasceria imóvel e — com a
  regra nova — sem como sair da tela. O original continua protegido.

Continuam liberados: selecionar, editar os campos do cartão, duplicar e mudar a ordem de
sobreposição.

---

## [2026-08-12] — Dado variável em espaço limitado: espremer as letras e conferir o banco antes de imprimir

As duas ideias que ficaram anotadas no release anterior.

### Funcionalidade 1 — Espremer as letras mantendo a altura (`overflow: "condense"`)
Terceira opção do "Se não couber", ao lado de *Reduzir a fonte* e *Quebrar em linhas*.
As letras estreitam na horizontal e o corpo não muda, então a linha do ticket fica na
mesma altura em todos os ingressos — é o truque do cartão de embarque, e o que permite
usar um grid rígido com nomes de tamanhos diferentes. A compressão para no piso de 75%
(`PISO_CONDENSA`); daí para baixo a fonte também reduz, senão o dado sairia ilegível.

No motor, compressão e rotação viajam num `morph` só — `Matrix(escala_x, 1) * Matrix(-angle)`,
pivô no centro do bloco — com o ponto de inserção pré-corrigido para a linha cair no lugar
certo depois de comprimida. No canvas, o equivalente é `ctx.scale(esc, 1)` com o `x`
dividido pela escala. Medido na tela: no mesmo espaço, o texto espremido sai com 6,0 mm de
altura contra 3,7 mm do reduzido.

### Funcionalidade 2 — Conferidor de estouro do banco de dados
A box 📏 passou a varrer o banco inteiro pelo mesmo ajuste do desenho e responder, antes de
o papel sair: quantas linhas têm a **coluna vazia** (ticket em branco), quantas ficam
**abaixo de 6 pt** e quantas produzem um bloco que **passa da altura do ticket**. Linha
desmarcada é ignorada, porque não vai à impressão. Sem nada a apontar, a linha fica verde e
informa o corpo da linha mais apertada.

O botão **🔍 Ver essas linhas** abre o editor de CSV já filtrado nelas, com faixa explicando
o motivo, marca âmbar que permanece quando o filtro é desligado, e o arrasto travado como em
qualquer outro filtro. O resultado é cacheado por elemento, com a própria lista de linhas na
chave — trocar o CSV cria um array novo e invalida sozinho.

**Testes:** os três modos na função pura, e no PDF gerado a prova que interessa — dentro do
piso a altura medida do `condense` é igual à do texto livre; além do piso, cai. Mais o caso
rotacionado, que discrimina a ordem das matrizes. Verificação no app real: aviso correto
("De 3 linhas: 1 com a coluna vazia · 1 abaixo de 6 pt"), editor abrindo com as 2 linhas
apontadas e marcadas, zero erros de console.

**Publicação:** `engine.py` mudou — o agente NewProd sai junto com o site.

---

## [2026-08-12] — Editor de numeração: travar elemento, frente/trás e largura máxima do dado variável

### Funcionalidade 1 — 🔒 Travar elemento
Botão no cartão de cada elemento (inclusive PICOTE). Elemento travado (`locked` no
elemento) não é arrastado no canvas nem movido pelo alinhamento — mas continua
selecionável e editável pelo cartão, e pode ser duplicado, excluído e reordenado.
Seleção/grupo com um membro travado não arrasta ninguém (senão o arrasto quebraria o
layout relativo), e um toast explica. Sublinhado de seleção âmbar indica a trava.

### Funcionalidade 2 — ⬆⬇ Trazer para frente / Enviar para trás
Dois botões no cartão trocam o elemento com o vizinho no array `numElements`. A ordem
do array já era a ordem de desenho em todas as janelas e no `engine.py`, então a
sobreposição muda na tela e no papel sem nenhuma alteração nos renderizadores.

### Funcionalidade 3 — 📏 Espaço do texto (largura máxima em mm para colunas do CSV)
Elementos TEXT com origem Banco de Dados ganham `Largura máxima (mm)`, `Se não couber`
(**Reduzir a fonte até caber** ou **Quebrar em linhas**, com quebra por caractere para
palavra maior que o espaço) e `Alinhamento` (Centro/Esquerda/Direita dentro do espaço).
Com o elemento selecionado, o editor mostra a guia tracejada do espaço delimitado.

O ajuste é uma função pura em dois espelhos que mudam juntos: `frontend/texto-ajuste.js`
(novo arquivo, carregado por `index.html` e `cliente.html`; todos os dez renderizadores
de texto do frontend desenham por `window.desenharTextoAjustado`) e
`_ajustar_texto_na_largura` no `engine.py`, aplicada em `_render_element` — por onde
todos os caminhos de texto do motor passam. Folga de 0,5% na comparação para a mesma
palavra não quebrar diferente entre a régua do canvas e a do fitz.

De tabela, os renderizadores que desenhavam multilinha com passo apertado (prévia da
amostra na Imposição e prévia do Painel de Produção, 2 linhas fixas com passo `fs`)
passaram ao mesmo `1.2 × corpo` do engine.

**Testes:** `tests/test_engine_ajuste_texto.py` (shrink na razão exata, wrap
determinístico, palavra gigante, parágrafo vazio) e `tests/test_engine_largura_maxima.py`
(o texto desenhado no PDF respeita a largura e o alinhamento encosta nas bordas da
caixa). Verificação visual por Puppeteer: shrink cravado no limite, wrap dentro da
guia, trava segurando o arrasto e frente/trás refletido no array.

**Publicação:** `engine.py` mudou — o agente NewProd sai junto com o site na próxima
publicação.

---

## [2026-06-13] — Integração: Tabelas de Catálogo no Supabase do Vibecode (Aprovação Parcial)

### Funcionalidade 1 — Criação do Schema Isolado de Catálogo com RLS Habilitado
Conforme a aprovação parcial e ressalvas do parceiro Vibecode, estruturamos o banco de dados centralizado do ecossistema. Foram isoladas as tabelas do catálogo de layout (configurações geométricas) no arquivo `schema_catalogo.sql` com o Row Level Security (RLS) habilitado e políticas de acesso configuradas por padrão.

**Tabelas de Catálogo Criadas:**
- `producao_formatos` — Gabarito geométrico de imposição.
- `producao_numeracoes` — Templates de VDP.
- `producao_saidas` — Dimensões de papel de saída.
- `producao_cores` — Cadastro de cores e calibração de fundos.
- `producao_modelos_imposicao` — Receitas prontas de motor.
- `producao_produtos_formatos` — **Nova tabela** adicionada com base no feedback do usuário para mapear o `id_produto` (do ERP) ao `formato_id` correspondente do catálogo.

**Políticas RLS Aplicadas:**
- `SELECT` permitido de forma pública/anônima (`anon` e `authenticated`) para leitura da API e do frontend.
- `ALL` (escrita/edição) restrito exclusivamente a conexões autenticadas (`authenticated`).

**Dados Semente (Seed) Cadastrados:**
- Formato padrão: **Mobi** (`152x53mm`, 2 colunas × 4 linhas).
- Saídas padrão: **A3** e **A4**.

---

### Correção 2 — Execução do Script de Servidores Locais (`iniciar_servidores.bat`)
- **Problema:** O console de terminal CMD filha aberto pelo comando `start` não abria no diretório do projeto, fazendo com que ele tentasse carregar o executável do Python e os scripts em `C:\Windows\system32` (onde não existiam) e fechando silenciosamente sem que o usuário visse o erro. Além disso, havia um parêntese não escapado no bloco condicional `if/else` que quebrava o parser de lotes do CMD.
- **Solução:** Adicionado o parâmetro `/D "%~dp0"` nos comandos `start` para forçar o diretório de trabalho correto na inicialização e removidos os parênteses do bloco condicional do assistente de lotes para evitar conflito com o parser. O servidor agora inicia normalmente em background e ouve nas portas `8080` (FastAPI) e `9000` (Agente de Impressão).

---

## [2026-06-08] — Correção: Transparência do PDF no Canvas e Renderização na Imposição

### Problema 1 — Fundo branco nas numerações com elemento PDF (visualizador)
Numerações contendo elementos do tipo **PDF** exibiam fundo **branco** no preview de
imposição e no editor de numeração. O PDF.js preenche o canvas com branco por padrão
antes de renderizar o conteúdo.

### Solução 1 — `frontend/script.js`
Adicionado `background: 'rgba(0,0,0,0)'` no objeto `renderContext` do PDF.js em
**3 locais**:

- `loadNumPdfFile()` — carregamento inicial do arquivo PDF no editor
- `drawPreview()` — bloco de renderização do elemento PDF no canvas de preview
- `preloadNumPdfElements()` — pré-carregamento assíncrono ao selecionar numeração

Isso instrui o PDF.js a respeitar a transparência do canvas em vez de preencher com branco.

---

### Problema 2 — Elemento PDF não renderizava no PDF final da imposição
O `_get_url_bytes()` do engine usava timeout de **5 segundos** para baixar o PDF
do Firebase Storage, insuficiente para a primeira requisição. O PDF era silenciosamente
ignorado sem renderizar na imposição.

### Solução 2 — `engine.py`
- Timeout de download de URL aumentado de **5s → 30s**
- Adicionado `pdf_doc.close()` após renderizar o elemento (evita leak de memória)
- Logs de diagnóstico melhorados para rastrear URL, tamanho e status do download

### Solução 2b — `app.py`
- Adicionados logs `[impose]` que mostram os elementos PDF recebidos na numeração
  (url/base64 e dimensões) para facilitar diagnóstico futuro

---



### Problema
Numerações que continham elementos do tipo **PDF** geravam corretamente o PDF final
(o motor backend via PyMuPDF renderizava o conteúdo corretamente), mas o elemento
ficava **invisível na janela de preview** de imposição — o `drawVdpElements` não
tinha nenhum tratamento para `el.type === 'PDF'`.

### Solução

**`frontend/script.js` — 3 alterações:**

1. **`drawVdpElements` (preview de imposição)**  
   Adicionado bloco `else if (el.type === 'PDF')` que:
   - Verifica se `el._pdfCanvas` já existe (canvas offscreen cacheado).
   - Se não, dispara carregamento assíncrono via `pdfjsLib.getDocument()`.
   - Renderiza a 1ª página em canvas offscreen com escala 2× para alta resolução.
   - Armazena em `el._pdfCanvas` e chama `drawPreview()` para redesenhar.
   - Enquanto carrega: exibe placeholder cinza com texto "PDF...".
   - Se sem conteúdo: exibe placeholder "📄 PDF".

2. **`updateImpSummary` — função `preloadNumPdfElements(numeracao)`**  
   Função utilitária que itera sobre todos os elementos da numeração selecionada
   e pré-carrega `el._pdfCanvas` para cada `el.type === 'PDF'` com `pdf_content`.
   Executada para `num` e `num2` toda vez que a numeração muda no dropdown.
   Segue o mesmo padrão já existente para SVG (`num._svgImage`).

3. **`hitTest` (editor de numeração)**  
   Adicionada linha `else if (el.type === 'PDF') { w = el.width_mm || 20; h = el.height_mm || 20; }`
   para o elemento PDF ter hitbox correta ao clicar/arrastar no canvas do editor.

---

## [2026-06-08] — Diagnóstico: Servidor FastAPI Offline

### Problema
O PDF imposicionado não era gerado. O servidor FastAPI (porta 8080) estava parado.

### Causa
O servidor não é iniciado automaticamente com o sistema. Precisa ser iniciado manualmente
via `iniciar_servidores.bat` ou `venv\Scripts\python.exe app.py`.

### Solução
Servidor reiniciado. Confirmado respondendo HTTP 200 em `/api/formatos`.

---

## [2026-06-07 ou anterior] — Multi-Artes

### Funcionalidade
Novo esquema de imposição `multi_artes` que permite colocar múltiplas artes
diferentes na mesma chapa de imposição.

**Frontend (`script.js`):**
- Array `state.impMultiArtes` com objetos `{pdf_url, pdf_name, qtd, num1_id, num2_id}`.
- UI renderizada por `renderMultiArtes()` / `renderMultiArtesList()`.
- Upload individual por arte via `uploadMultiArtePdf(index, fileInput)`.
- Preview: `drawPreview()` acumula `item_index` percorrendo cada arte pela quantidade.

**Backend (`engine.py`):**
- Schema `multi_artes`: itera pelas artes da lista, coluna por coluna (column-first).
- Cada arte tem sua própria numeração 1 e 2.
- `_load_multi_arte_pdf(arte)` carrega o PDF da URL via `_get_url_bytes()`.

---

## [Anterior] — Modo Duplex (Frente e Verso)

### Funcionalidade
Geração automática de PDF com frente e verso para impressão duplex.

- Cada folha lógica gera 2 páginas no PDF final.
- Colunas do verso espelhadas horizontalmente: `col_verso = cols - 1 - col`.
- Rotação do verso: `(360 - rot_frente) % 360`.
- Elementos filtrados por `face`: `front`, `back`, `both`.
- Em modo `pdf_multiple + duplex`: pares de páginas (ímpar=frente, par=verso).

---

## [Anterior] — Rotação Individual de Células

### Funcionalidade
Permite aplicar rotações diferentes (0°, 90°, 180°, 270°) para cada célula da grade.

- `formato.rotations`: dicionário `{indice_celula: angulo}`.
- UI: clicar no canvas do formato seleciona a célula; botões aplicam a rotação.
- Backend: rotação aplicada por `show_pdf_page(..., rotate=angle)`.
- Verso: rotação automicamente invertida.

---

## [Anterior] — Elemento SVG nas Numerações

### Funcionalidade
Suporte a SVG como elemento VDP, permitindo logos e ícones vetoriais.

- Backend: `svglib.svg2rlg()` + `reportlab` converte SVG para PDF temp → `show_pdf_page`.
- Frontend editor: `state.numSvgImage` renderizado via `data:image/svg+xml`.
- Frontend preview: `currentNum._svgImage` pré-carregado em `updateImpSummary`.

---

## [Anterior] — Elemento PDF nas Numerações (Backend)

### Funcionalidade
Suporte a PDF como elemento VDP — permite timbre, logo em PDF vetorial, etc.

- Backend: decodifica `pdf_content` (base64 ou URL) → `fitz.open(stream)` → `show_pdf_page`.
- Frontend editor: `state.numPdfImage` (renderizado via pdfjsLib).
- *(Frontend preview de imposição: implementado em 2026-06-08, ver acima.)*

---

## [Anterior] — Picote

### Funcionalidade
Linha tracejada vertical no canvas do editor como guia visual de picote/corte.

- Renderizado apenas no frontend (canvas do editor e preview).
- **Ignorado no PDF final** (não aparece na impressão).
- Inicializa em `x_mm = 25` por padrão.

---

## [Anterior] — Barra de Progresso com ETA

### Funcionalidade
Barra de progresso visual durante a geração do PDF com estimativa de tempo restante.

- Calcula total de itens antes de iniciar (considerando CSV, pdf_multiple, multi_artes).
- Detecta se o processamento é local (180 itens/s) ou remoto (~35 itens/s + latência).
- Progresso sintético avança até 95%, completa em 100% ao receber a resposta.
- Botão de cancelamento via `AbortController`.

---

## [Anterior] — Centralização Absoluta e Correção de CropBox

### Funcionalidade
PDFs com CropBox deslocado (CorelDraw, Illustrator, InDesign) são corretamente
centralizados na célula via `clip=page_base.rect` no PyMuPDF.

> Ver documentação técnica completa em `docs/regra_centralizacao.md`.

---

## [Anterior] — Autenticação Firebase

### Funcionalidade
- Login com email/senha e Google OAuth via Firebase Auth.
- Claims personalizadas: `admin`, `editor`.
- Backend valida JWT via `firebase_admin.auth.verify_id_token()`.
- Painel de administração para alterar papéis de usuários.
- Fallback local (sem auth) para desenvolvimento.

---

## [Anterior] — Serviço de Impressão Local

### Funcionalidade
- Agente HTTP local (porta 9000) para enviar PDFs diretamente a impressoras da rede.
- Parser de arquivos PPD para opções avançadas de impressão.
- Mapeamento impressora → PPD persistido em `printer_ppd_map.json`.

---

## [Anterior] — Tela de Amostras

### Funcionalidade
Geração de amostra combinada (cor + numeração) para aprovação antes da tiragem.

- Três canvases separados: Cor, Numeração, Combinado.
- Escala 1:1 entre os três para comparação fiel.
- PDF de referência de cor carregado via `state.cores`.

---

## [Anterior] — Esquema PDF Múltiplo

### Funcionalidade
Carrega um PDF de múltiplas páginas e impõe cada página em uma posição da grade.

- `total_items = pdf.numPages`.
- Em duplex: `total_items = ceil(pages / 2)`.
- Campos início/fim travados automaticamente.

---

*Changelog mantido pela equipe Ideal / Antigravity.*
