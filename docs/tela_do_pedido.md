# A tela do Pedido

Referência da tela onde o operador escolhe o modelo, confere a prévia e manda
imprimir. Reformada em 28 e 29 de agosto de 2026, da **v764 à v769**.

A tela viva é **[`frontend/index.html`](../frontend/index.html)** com
**[`frontend/pedido.js`](../frontend/pedido.js)**. O `frontend/producao.html`
guarda uma cópia antiga da mesma tela e **não é a página que está no ar** — mexer
nele não muda nada para o operador. Quem for conferir alguma coisa, confira no
`index.html`.

---

## 1. A janela de visualização abre abaixo do modelo

Antes, a janela morava num card no **fim da página**. O operador escolhia o
modelo no topo da fila e descia a tela inteira, passando por todas as caixas de
produto, para ver a prévia do que tinha acabado de escolher. O pedido do usuário
foi direto: *"os modelos após selecionados ficam distantes da janela de
visualização, a ideia era abrir a janela abaixo de cada modelo ao selecionar"* —
com a condição de **não perder nenhuma funcionalidade atual**.

Hoje ela abre numa linha-abrigo logo abaixo da linha do modelo, dentro da própria
caixa do produto.

### A janela é movida, nunca recriada

Este é o ponto que mais importa para quem for mexer aqui. Existe **uma** janela
só, `#ped-preview-card-container`, que **muda de lugar**. Ela nunca é escrita
dentro do HTML da fila.

A razão é cara de aprender e barata de respeitar. Recriar a janela custaria:

- o **canvas já pintado** — a prévia sumiria e teria de ser desenhada de novo;
- o **painel de impressão remontado**, o que significa uma ida nova ao agente
  local para ler as capacidades da impressora;
- **bandeja, papel e número de cópias** voltando ao padrão, jogando fora o que o
  operador tinha escolhido;
- todos os **ouvintes de evento** pendurados nos controles.

Mover custa **3,4 ms** e não cresce com o tamanho do pedido.

As três funções que sustentam isso:

| Função | O que faz |
|---|---|
| `janelaDeVisualizacao()` | devolve o elemento único |
| `recolherJanelaParaCasa()` | devolve a janela ao `#ped-preview-home` e apaga a linha-abrigo |
| `moverJanelaParaModelo(itemId)` | insere um `<tr>` de abrigo logo depois da linha do modelo e leva a janela para dentro dele |

O `renderPedOSQueue()` **recolhe antes** de reescrever o `innerHTML` do wrapper e
**move depois** de aplicar os filtros. Sem o recolhimento, a janela seria
destruída junto com o HTML antigo — e voltaríamos a pagar tudo que está na lista
acima.

O harness `tests/janela_do_modelo_harness.js` roda num Chrome de verdade e trava
justamente isso: pinta o canvas, escolhe uma bandeja, redesenha a fila e confere
que o canvas continua pintado e a bandeja continua escolhida.

### O clique virou interruptor

A tela **abre sem nenhum modelo selecionado**. Clicar num modelo abre a janela
dele; clicar de novo no mesmo modelo fecha e desseleciona. Antes sempre havia um
modelo carregado, e não existia estado neutro.

Três regras vieram junto, todas por causa do lugar novo da janela:

- **A prévia se apaga no instante do clique** (`limparPreviaEnquantoCarrega()`) e
  diz que está montando. O carregamento é encadeado em 400/600/800 ms; sem
  apagar, por quase um segundo a janela mostraria a folha do modelo *anterior*
  debaixo do nome do modelo *novo* — e agora os dois estão a um centímetro um do
  outro na tela.
- **Modelo escondido pelo filtro fecha a janela.** É a mesma razão que já o
  tirava da marcação: o que sumiu da tela não pode continuar mandando na
  impressão.
- **Vir pelo menu devolve a tela ao estado inicial** — nenhum modelo aberto,
  nenhuma liberação de senha de pé.

### A janela em três colunas

- **Cabeçalho** (`.ped-janela-cabecalho`): de que modelo é esta janela, e o selo
  da imposição — *"📄 20 folha(s) · 200 itens · a folha fecha certo, sem sobra"*.
- **Esquerda** (`.ped-janela-esquerda`): Folha, Set, Parte, Face, AMOSTRA e as
  **Opções do modelo** (modo de impressão sequencial/blocado, imprimir o número
  do modelo em cada item).
- **Centro** (`.ped-janela-centro`): a prévia, com a largura inteira.
- **Direita** (`.ped-janela-direita`): cinco grupos que abrem e fecham, nesta
  ordem — Imprimir e PDF, **Hot Folder**, Configuração de Impressão,
  Gerenciamento de Cores, Refazer Folhas.

**Um** par de Gerar PDF / Imprimir, não dois. O par próprio do Refazer saiu; com
o Refazer ligado, o par único passa a valer para a faixa escolhida. Isso obrigou
a escrever uma exceção que antes se resolvia sozinha: modelo já impresso perde o
botão Imprimir, mas **com o Refazer ligado ele volta** — reimprimir uma faixa só
faz sentido depois que a tiragem já saiu.

O selo da sobra e as Opções do modelo ficavam no **topo da página**, longe do
modelo de que falavam; foram para dentro da janela por pedido do usuário. As seis
fichas de sumário que havia no topo (Formato, Grade, Total de Itens, Folhas
Estimadas, Células vazias, Saída) saíram: o selo diz numa frase o que elas diziam
em seis.

Duas coisas **voltaram a aparecer** na reforma; estavam no código e ninguém via,
escondidas dentro do bloco do formulário antigo: o **Sumário** e o botão
**Cancelar Impressão**.

> ⚠️ O `#ped-summary` continua existindo dentro do bloco escondido do
> `index.html`, com um comentário explicando por quê: a `updatePedSummary()`
> escreve nele sem conferir se ele existe. Apagar o elemento quebra a tela.

---

## 2. A fila dos modelos

### Uma escala só

A fila tinha sido desenhada contando com um `zoom: 0.8` na `#view-pedido`. Quando
o zoom saiu (porque encolhia 20% uma fonte feita grande de propósito para leitura
em pé, na frente da impressora), a fila passou a desenhar 25% maior do que sempre
tinha sido — enquanto a janela de visualização, que usa os tamanhos do
aplicativo, já estava certa.

O usuário descreveu a distorção com precisão cirúrgica: *"ao entrar na tela do
pedido ela é melhor representada quando visualizada em 80%, e ao clicar no modelo
ele fica melhor representado em 100%"*. Cada medida da fila foi multiplicada por
0,8 e o `zoom` ficou em `1`.

> **Regra geral deste projeto:** tirar um zoom de tela exige reescalar junto tudo
> o que estava dentro dele. Senão a tela fica com duas escalas convivendo.

### A largura foi repartida

| Campo | Antes | Depois |
|---|---|---|
| Qtd, N. inicial, N. final, Bloco | 110 px | **72 px** |
| Cor | 190 px | **124 px** |
| **Nome do modelo** | 150 px | **380 px** |

Os campos numéricos e o de cor foram a 65% da largura que tinham; os ~230 px
liberados foram para o nome do modelo, que é por onde o operador reconhece a
peça na bancada.

### Cada modelo é um quadro

```css
tr.fila-linha         { outline: 1px solid #918f8c; border-radius: 10px; }
tr.fila-linha.marcada { outline: 2pt solid #920fc3; background: #2c1669 !important; }
tr.fila-linha.aberta  { outline: 2pt solid #920fc3; background: #2c1669 !important; }
```

Cantos arredondados, 10 pt de respiro entre uma linha e outra
(`border-spacing: 0 10pt`), e as cores do modelo selecionado escolhidas pelo
usuário: fundo `#2c1669`, fio `#920fc3`.

O arredondamento mora nas **células das pontas**, não no `<tr>`: com
`border-collapse: separate`, o `<tr>` sozinho não arredonda as extremidades.

> O bloco de CSS desta tela fica **acima** do bloco do PAINEL DO ACABAMENTO no
> `style.css`. Um teste lê do marcador do Acabamento até o fim do arquivo para
> garantir que a paleta dele não vaza para o Painel de Produção; escrever depois
> daquele marcador quebra o teste.

### Os rótulos viraram cabeçalho

Cada linha carregava os próprios rótulos — QTD, NI, NF, Bloco, COR, Núm., Verso e
Status escritos dentro de cada célula. Oito rótulos × N linhas empurravam a
largura para ~2.130 px, e era isso que obrigava o `zoom: 0.8`.

Caixa que mistura **Camarote e comum** continua com os rótulos na linha: as
quatro colunas do meio mudam de significado ali, e um cabeçalho único mentiria
para metade das linhas.

O resumo do produto passou a dizer **três** números — *Total, Impressas, Faltam* —
no centro da linha. O nome da tinta no seletor de Cor calcula texto claro ou
escuro pela luminância (`textoLegivelSobre`), em vez de preto fixo: em tinta
escura o nome sumia dentro da própria caixa.

---

## 3. Os seletores só se enchem quando alguém os abre

Os seletores de **Cor** e **Numeração** nasciam com a lista inteira: 124 opções
por linha, quase três quartos de todos os elementos da tela, para o operador ver
uma linha de cada vez.

Hoje nascem com **a opção escolhida** e se enchem no gesto de abrir
(`encherSeletorDaFila`, `encherSeletoresDaLinha`).

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

### A rede de segurança que desfazia a própria economia

A primeira versão tinha uma rede: 1,5 s depois de cada redesenho, encher **todos**
os seletores que ninguém tinha aberto, porque cada estação da gráfica usa um
navegador diferente e eu não queria depender de um evento só.

O usuário trouxe um INP do navegador — *"Event handlers on this element blocked
UI updates for 368,6ms"* — e a medição mostrou que a rede era o culpado:

| | com a rede | sem ela |
|---|---|---|
| encher tudo em lote | **121 ms** de interface travada | não acontece |
| redesenho seguinte | **158 ms** (fila de volta a 8.533 elementos) | **44 ms** |

Ela devolvia a fila ao tamanho de antes, e o clique seguinte pagava a demolição
daqueles elementos. Saiu. No lugar ficaram cinco gatilhos que cobrem teclado,
toque e qualquer navegador, sem lote nenhum:

- **passar o mouse pela linha** prepara os dois seletores dela (~2 ms);
- no próprio seletor: `mousedown`, `focus`, `keydown`, `touchstart`.

---

## 4. O Hot Folder

A Epson SureColor F9470H não recebe trabalho pela fila do Windows: quem a conduz
é o RIP Epson Edge Print, que **observa uma pasta**, importa o PDF que aparece
ali e aplica a ele o preset daquela pasta. Escolhido um hot folder, o material
imposto é gravado na pasta em vez de ir para a impressora.

> Pedido do usuário em 29/08/2026: *"vamos tirar as opções de Hot Folder de
> dentro das configurações de impressão, será um botão à parte, ao clicar e
> selecionar ele já estará ativo e vai mostrar abaixo do botão ícones de pastas
> coloridas e com nomes das pastas, selecioná-las escolhe o hot folder"*.

### Grupo próprio, e antes da Configuração de Impressão

Ele decide **para onde** o material vai, e o resto daquele grupo só faz sentido
depois dessa escolha: com hot folder ligado, bandeja, papel, frente/verso, cor e
cópias vêm do preset da pasta no RIP, e o painel do driver fica inerte.

**Impressão Reversa e Folha a Folha continuam valendo** — elas são aplicadas ao
PDF pelo navegador antes do envio, e por isso o `#ped-print-modes-box` fica de
fora da desabilitação, de propósito.

### Escolher a pasta É ativar

Não existe mais caixa de "ativar". Antes eram **dois** estados guardados
separados — uma caixa e um caminho — e eles podiam discordar: caixa marcada sem
pasta atravessava a tela inteira e só era barrada no botão Imprimir. Agora:

| Gesto | O que acontece |
|---|---|
| clicar num ladrilho | aquela pasta passa a ser o destino, **na hora** |
| clicar no ladrilho já escolhido | desliga, e a impressora volta a valer |
| clicar em outro ladrilho | troca a escolha (nunca duas ativas) |

O botão do grupo carrega um **selo com o nome da pasta** enquanto está ativo —
o estado não se esconde ao fechar o grupo, mesma regra do Gerenciamento de Cores.

### Os ladrilhos

A lista de pastas autorizadas **sempre existiu** na estação, no `hot_folders.json`
— mas era invisível. Cada trabalho recomeçava do seletor nativo do Windows, e o
operador tinha de reencontrar no disco uma pasta que a máquina já conhecia.

Cada ladrilho traz:

- **o ícone de pasta**, colorido;
- **o nome**, que é o último trecho do caminho (`C:\RIP\Epson\Sublimação 160g` →
  *Sublimação 160g*). O caminho inteiro não caberia nos 342 px da coluna, e fica
  na dica do ladrilho;
- **um ✕**, que aparece ao passar o mouse e tira a pasta da lista.

**A cor é derivada do caminho**, não escolhida: um hash do próprio caminho
escolhe entre 12 matizes espaçadas de 30°. Cor guardada seria mais um campo para
alguém preencher, mais uma tela para editá-lo, e um valor a menos que a estação
responde sozinha. Derivada, a mesma pasta tem sempre a mesma cor — hoje, amanhã e
na estação do lado —, e é isso que faz o operador reconhecer o ladrilho sem ler.
O hash usa o caminho em minúsculas, porque no Windows o mesmo caminho aparece
escrito de vários jeitos.

> ⚠️ **O ícone é SVG, e não emoji — de propósito.** A primeira versão usava 📁.
> O emoji vem colorido pela fonte do sistema, **ignora `color` e ignora
> `filter`**: as pastas sairiam todas do mesmo amarelo, e "ícones coloridos"
> viraria "ícones iguais", sem erro nenhum na tela. O SVG pinta com
> `fill="currentColor"`, então a cor do ladrilho chega ao desenho. O harness
> confere a **cor do pixel que o Chrome pintou**, e não a existência da regra
> de CSS — foi assim que o erro apareceu.

Dois ladrilhos especiais:

- **Pasta que a estação não acha** aparece tracejada, em vermelho, com o nome
  riscado (`.hf-sumiu`). Se ela só falhasse na hora do envio, o operador
  descobriria com o material pronto e a impressora parada.
- **`＋ Adicionar pasta…`** abre o seletor nativo pela estação. Sem ele, pasta
  nova nunca entraria.

A altura do ladrilho é **fixa**: o ícone de adicionar é menor que o de pasta, e
nome de uma linha é mais baixo que o de duas. Deixados ao natural, os ladrilhos
ficariam desencontrados e a grade pareceria quebrada.

### A saída quando o agente não responde

O seletor nativo depende do agente local, e a lista também. Estação com o agente
parado, ou painel servido pela nuvem: os ladrilhos nascem vazios. Por isso existe
o campo **"ou cole o caminho da pasta…"** — sem ele a tela seria uma trava sem
saída. O caminho colado passa pela mesma validação (`/api/hotfolder/validar`):
só pasta que existe e aceita escrita entra na lista.

### O que o agente responde

| Rota | Para quê |
|---|---|
| `GET /api/hotfolder/listar` | as pastas registradas, com `nome` e `existe` |
| `POST /api/hotfolder/escolher` | abre o seletor nativo **na estação** e registra |
| `POST /api/hotfolder/validar` | valida um caminho colado e registra |
| `POST /api/hotfolder/esquecer` | tira da lista (nada é apagado do disco) |
| `POST /api/hotfolder/drop` | grava o PDF — **exige** que a pasta esteja registrada |
| `POST /api/hotfolder/conferir` | o RIP consumiu o arquivo? |

> ⚠️ **A listagem tem prazo, e o prazo tem uma armadilha.** `os.path.isdir` num
> caminho de rede cujo servidor não responde **não devolve `false` — ele trava**,
> até o timeout do SMB: 26,64 s medidos. Essa rota é esperada ao abrir o modelo.
> As pastas são conferidas em paralelo com prazo **total** de 1,5 s, e quem não
> responde volta como `existe: null` — *"não sei"*, que a tela não marca como
> quebrada.
>
> O prazo sozinho não bastava: com o pool num `with`, o `__exit__` chama
> `shutdown(wait=True)` e espera **todas** as threads, inclusive a travada — a
> resposta continuava saindo 26 s depois. Sem o `with`, com
> `shutdown(wait=False)`: **1,52 s**.

> ⚠️ **O nome da pasta é calculado nos dois lados, e eles têm de concordar.** O
> agente responde `nome` para as pastas da lista; o `_nomeDaPasta` do frontend
> responde pela pasta gravada num produto que a estação não lista. Numa **raiz de
> compartilhamento** (`\\servidor\travada`) o Windows trata o caminho inteiro
> como raiz e `os.path.basename` devolve `''` — o agente dizia o caminho completo
> e a tela dizia *travada*. O agente passou a espelhar a regra do frontend:
> separar por barra e pegar o último trecho não vazio.

> ⚠️ **O `hot_folders.json` é uma autorização, não um histórico.** Ele existe
> porque gravar num caminho qualquer é uma primitiva de escrita em disco, e o
> agente aceita requisição de origem externa por CORS. Sem a lista, uma página
> aberta no navegador do operador poderia gravar arquivos na estação. Mostrar a
> lista na tela **não afrouxou nada**: o `/drop` continua exigindo o registro, e
> o registro continua saindo só do seletor nativo ou da validação explícita.

### O que o envio lê

O caminho da impressão está aprovado e rodando na gráfica, e não mudou. As duas
funções que ele consulta continuam com o mesmo nome e o mesmo contrato:

| Função | Devolve |
|---|---|
| `_hotFolderPath()` | o caminho escolhido, ou `''` |
| `_hotFolderAtivo()` | se há caminho escolhido |

O `#ped-hotfolder-path` continua sendo o campo que as duas leem — agora
escondido. Trocá-lo por uma variável obrigaria a mexer nos quatro pontos do
envio, e é o material da gráfica que paga um engano ali.

---

## 5. A trava da gerência

> Pedido do usuário, textual: *"os imputs, drops, cores, etc... da linha do modelo
> só podem ser alteradas mediante apresentação da senha da gerência, mesma senha
> apresentada na divergência de peso no painel do acabamento"* — e, logo em
> seguida: *"o status da impressão continua livre"*.

### O que fica travado

Na linha do modelo, atrás da senha:

| Campo | Como é travado |
|---|---|
| Qtd, N. inicial, N. final, Bloco | `readonly data-trancado="1"` + porteiro no `mousedown`/`keydown` |
| Campos de camarote (q_cam, l_cam, c_ini) | idem |
| **Cor** e **Numeração** (seletores) | `portaDoSeletor` nos quatro eventos |
| **Verso** | porteiro |

Um **cadeado (🔒)** aparece na linha travada, com o texto que explica a regra e
abre a caixa da senha ao ser clicado — a trava tem saída visível, não é um campo
que simplesmente não responde.

### O que NÃO fica travado

- **O Status da impressão.** Marcar o que já saiu é o trabalho normal do
  operador; pedir senha para isso pararia a produção. Decisão explícita do
  usuário.
- **A caixinha de marcar para a folha combinada**, que escolhe o que imprimir e
  não altera dado nenhum do modelo.

### O alcance

Liberado um modelo, ele fica liberado **até a janela dele ser fechada**. Abrir
outro modelo, fechar a janela ou sair da tela tranca tudo de novo
(`trancarCamposDoModelo`). Estado guardado em `state.modeloLiberado`, que é o id
do único modelo liberado por vez.

### Onde a senha é conferida

**No servidor, nunca no navegador.** A `liberarCamposDoModelo()` chama
`window.conferirSenhaDeLiberacao(senha)`, que é a **mesma função do Painel do
Acabamento** — exportada de lá justamente para não existirem duas políticas de
senha no produto. Ela bate na Edge Function `senha-liberacao`.

Duas posturas herdadas do popup do Acabamento:

- **Senha errada ou rede fora:** a caixa fica aberta com o motivo e **nada é
  liberado**.
- **Sem quem conferir** (a função não carregou): também nada é liberado. Uma
  trava que se abre sozinha quando a conferência falha não é trava.

### O defeito que essa trava teve ao nascer

A trava nasceu **inerte**. Os seletores de Cor e Numeração acabaram com **dois
atributos `onmousedown`** — um do preenchimento tardio, outro da trava. O
navegador guarda o primeiro e ignora o segundo **em silêncio**: nenhum erro,
nenhum aviso, e o seletor abria normalmente com a trava supostamente de pé.

O harness pegou. A correção foi unificar os dois cuidados numa função só,
`portaDoSeletor(evento, el, itemId)` — primeiro a trava, depois a lista — porque
os dois moram no mesmo gesto.

**Lição que fica:** dois atributos de evento iguais no mesmo elemento não é um
erro que o navegador reporte. Se dois recursos precisam do mesmo gesto, eles
precisam da mesma função.

---

## 6. O que foi retirado da tela

- **Regra de Paginação** (o seletor no topo) e o **Formato do produto** — o
  usuário circulou os dois numa captura e disse: *"esses 2 drops não devem
  aparecer nesta página"*.
- **As seis fichas de sumário** do topo — substituídas pelo selo dentro da
  janela.
- **O botão "Mostrar"** de dentro do Gerenciamento de Cores: com o grupo já
  abrindo e fechando, eram dois interruptores para a mesma coisa. A trave
  continua de pé — o **estado** não se esconde com os controles, e um selo no
  botão do grupo diz que há conversão de cor ligada mesmo com o grupo fechado.
- `selectStyleDisabled`, `selectHeaderStyleDisabled`,
  `agendarRedeDosSeletores`, `encherSeletoresPendentes`,
  `alternarGerenciamentoDeCores` — código que ficou sem uso.

---

## 7. Testes que travam esta tela

| Harness (Chrome de verdade) | Verificações | O que trava |
|---|---|---|
| `tests/janela_do_modelo_harness.js` | 24 | a janela é **movida**, não recriada: canvas ainda pintado, bandeja ainda escolhida, e sobrevive ao redesenho da fila |
| `tests/janela_tres_colunas_harness.js` | 19 | desenha a janela real com o CSS real e confere o layout mais os **62 controles** que ela não pode perder |
| `tests/fila_do_pedido_harness.js` | 51 | roda a `renderPedOSQueue` de verdade com os 52 modelos, mede se a fila cabe em 100%, e confere a trava da gerência |
| `tests/hot_folder_ladrilhos_harness.js` | 48 | os ladrilhos das pastas: nome, cor derivada do caminho, clique que ativa, pasta que sumiu, e se a grade cabe na coluna |

Os arquivos `tests/test_janela_do_modelo.py`, `tests/test_janela_tres_colunas.py`,
`tests/test_fila_do_pedido.py`, `tests/test_senha_da_gerencia_no_pedido.py` e
`tests/test_hot_folder_ladrilhos.py` embrulham os harnesses no pytest e somam
asserções de código-fonte.

Todos os harnesses **extraem as funções do arquivo de verdade pelo nome**
(`extrairFuncao`), para nunca aprovarem uma cópia velha.

---

## 8. Armadilha conhecida: um dado com dois nomes

`state.pedidoAberto` (o pedido) e `activeOSItem` (o modelo aberto) são coisas
diferentes e foram confundidas uma vez. O `renderPedOSQueue()` lê
`state.pedidoAberto` — se ler `activeOSItem`, a fila some quando nenhum modelo
está aberto, que é exatamente o estado inicial da tela depois da reforma.

---

## 9. O que ficou em aberto

**Um INP de 2.105 ms num clique de `span`.** O usuário capturou no DevTools da
estação: `span click 2.105,3ms · render 52,2ms · total 2.157,9ms`. Investigação
e o que já foi descartado com medição estão em
[`docs/conferencia_pedido_21202.md`](conferencia_pedido_21202.md#5-o-inp-de-2105-ms-ainda-em-aberto).

**A divergência entre contratado e banco não é mostrada na janela.** A função
`divergenciaDeCelulasDoModelo` já existe e já está ligada em quatro lugares — mas
**todos na tela de Amostras**: o card do modelo, o bloqueio da aprovação, o
bloqueio da promoção do pedido e o relatório do botão *🔎 Conferência de dados*.

Na tela do Pedido, onde o operador manda imprimir, o selo da janela diz *"20
folha(s) · 200 itens · a folha fecha certo"* e **nunca compara com o contratado**.
Trazer a verificação para esse selo foi oferecido ao usuário e ainda não foi
decidido. O sintoma concreto que motivou a oferta está no documento acima: o
número de folhas que **muda sozinho** segundos depois de abrir o modelo, quando a
faixa contratada e o banco ligado não falam da mesma quantidade.

> Quem for fazer isso: a função só varre o banco quando a tiragem ficou **curta**,
> de propósito, porque roda a cada redesenho de card. Numa tela que redesenha 52
> linhas a cada clique, esse cuidado é obrigatório.
