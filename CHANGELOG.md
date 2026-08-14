# Changelog — Ideal Imposition

Registro historico de todas as alteracoes, correcoes e melhorias aplicadas ao sistema.

---

## Versão atual: **v560** — 2026-08-13 | Agente **1.2.59**

---

## [não publicado] — Controle de acesso, parte 2: o código chega à nuvem

O ingresso já saía da impressora com o QR Ideal, mas aquele código não existia em lugar
nenhum fora da estação que o imprimiu. O cliente não tinha como cadastrar o evento, e a
nuvem não sabia que aqueles ingressos existiam. Esta parte é a ponte.

**Sete tabelas novas** (`producao_acesso_*`), criadas por
[sql/schema_acesso.sql](sql/schema_acesso.sql). Elas nascem com RLS ligado e **zero
políticas**: com a chave anônima — que é pública — não se lê nem se escreve uma linha.
Verificado contra o banco, não assumido: uma escrita anônima volta `42501, new row violates
row-level security policy`.

**A nuvem nunca vê o código.** Guarda um hash lento com sal por pedido. O sal é por pedido,
e não por evento, porque o agente publica quando imprime — e nessa hora o evento pode nem
existir. O teste que mais importa do projeto roda o hash do navegador dentro de um
navegador de verdade e compara com o do Python: se os dois divergirem, todo ingresso do
evento é recusado na portaria, e não há como descobrir antes.

**O agente publica sozinho ao fechar a impressão**, em thread de fundo, depois que os PDFs
saíram — o operador está de pé na frente da impressora. Publica a **tiragem inteira**, não
a folha impressa: quem imprime 2.000 hoje e 3.000 na semana que vem ficaria com 3.000
ingressos recusados na porta. Reabrir devolve o **mesmo** sal, senão os ingressos já
entregues parariam de validar. Reenviar o mesmo lote não duplica nada.

**O QR do Pedido** é uma URL curta com token assinado, gerada por um botão no painel. Ele
não carrega os dados do evento de propósito: o app lê o esqueleto do ERP na hora, então o
QR nunca envelhece. Gerar um novo mata o anterior — é o conserto de quando ele cai na
pessoa errada.

**A tela onde o QR cai** (`evento.html`) é auto-contida e feita para telefone: o cliente
chega pela câmera, quase sempre no 4G. Dois passos numerados, campos de 16px para o iOS não
dar zoom, alvos de toque de 48px. Um evento pode reunir vários pedidos — a pista num, o
camarote noutro.

A chave-mestra do banco **não vai para as estações**: o agente publica falando com o Render,
e se identifica com um segredo que só autoriza publicar faixa. O build do agente para sem
ele, pela mesma razão do pool.

Detalhes em [docs/controle_acesso.md](docs/controle_acesso.md).

**Antes de publicar:** três variáveis no Render — `SUPABASE_SERVICE_KEY`,
`ACESSO_AGENTE_SEGREDO` e `QR_PEDIDO_SEGREDO`. Rode
`.\ferramentas\copiar_para_render.ps1`: ele confere o formato das três e põe uma de cada
vez na área de transferência, sem mostrar o valor na tela. Depois de salvar,
`GET /api/acesso/saude` responde as três de uma vez e diz quais faltam.

---

## [não publicado] — A suíte de testes voltou a rodar inteira

Eram **dez** arquivos em `tests/` que não rodavam. Nove eram scripts de depuração que uma
faxina varreu para lá em 09/08 — nenhum com uma única asserção, e cinco chamando APIs do
motor que já não existiam. O décimo era um teste de verdade, gravado em cp1252 declarando
utf-8, que o Python recusava compilar.

O pior deles disparava um **POST de verdade contra o Render de produção** no momento em que
o pytest o importava, com timeout de 60 segundos. Era ele quem fazia a suíte demorar 32
segundos; agora ela roda inteira em 11.

O estrago nunca foi o arquivo quebrado em si. É que o pytest reporta erro de coleta no meio
de muita saída, e a pessoa aprende a ignorar: com dez erros permanentes na tela, o décimo
primeiro — que seria regressão de verdade — passaria batido.

`tests/test_a_suite_esta_sa.py` trava as três formas de isso voltar.

---

## [v558] — O QR Ideal na tela: cor cheia e a logo no meio

Duas correções no desenho do elemento, ambas pedidas depois de ver a tela.

**A explicação de como o código é gerado saiu da interface.** Ela estava em dois
lugares: o painel de propriedades do elemento e o balão do botão que o cria. Não
é detalhe de redação — o QR Ideal só resiste a falsificação porque o código é
imprevisível e a lista mestra não circula. Contar na tela que existe uma lista
finita, e que a posição dentro dela vem de números impressos no próprio ingresso,
entrega as duas primeiras peças de qualquer tentativa de forjar. A tela do editor
aparece em print de suporte, em treinamento, e é servida também pela nuvem: não é
lugar reservado. A explicação técnica continua completa em `docs/qr_ideal.md`, na
skill `qr-ideal` e nos comentários do código.

O texto do painel também estilhaçava numa linha por fragmento, porque
`.form-group` é `display:flex; flex-direction:column` e cada `<b>` virava um item
de flex. Agora é um `<p>` só, e o texto flui.

**O desenho passou a sair igual ao que vai ao papel.** Antes, quando a tela não
sabia o código — o editor de numeração não tem pedido —, o QR era pintado a 30%
de opacidade com a palavra "exemplo" embaixo. Ficava desbotado e não dava para
conferir cor nenhuma. Agora sai na cor escolhida no elemento, preto 100% por
padrão, com opacidade cheia. Quem avisa que aquilo é exemplo é o painel, em
texto.

**E ganhou a logo no centro, como marca de layout.** Ela ocupa 30% do lado, sobre
uma placa branca arredondada, e **nunca é impressa** — o QR é gerado com correção
de erro baixa, então logo no papel apagaria módulos de verdade e o leitor
recusaria o ingresso na portaria, com o lote já entregue. A separação se apoia em
dois pontos: o `engine.py`, que é quem imprime, não sabe que ela existe; e
`criarCanvasNumeracaoRasterizada` — o único canvas do frontend que vira PDF de
produção — pede o QR sem logo explicitamente. `tests/test_qr_ideal_logo_de_tela.py`
cobra os dois, e mais a cor e a opacidade.

Nas demais janelas a logo aparece, e ali ainda ajuda: a imagem de amostra que o
cliente recebe leva o QR com a marca por cima, o que impede extrair um código
legível da imagem de aprovação.

---

## [v557] — QR Ideal: o ingresso que a portaria sabe ler

O elemento `QR` que existe desde sempre codifica o número sequencial do ingresso.
É **adivinhável**: quem recebe o 1234 sabe que existe o 1235 e imprime. Serve para
consulta; nunca serviu para portão.

O **QR Ideal** é o elemento novo, e ele carrega um código de 8 caracteres tirado
de uma lista de 3 milhões que só existe nas estações da gráfica. Não há campo
para preencher: o código sai do número do pedido, do número do modelo e do número
do ingresso.

A regra da coluna é `(últimos2(pedido) − últimos2(modelo)) mod 100`, com o zero
ocupando a coluna 100. O `mod` não é enfeite: a subtração crua vai de −99 a 99, e
sem ele **50,5% das combinações não teriam coluna nenhuma** — além de a coluna 100
ser inalcançável, porque a diferença máxima é 99. A linha é o número do ingresso,
e a tiragem que passa de 30.000 avança sozinha para a coluna seguinte, porque o
pool é lido como uma fita contínua de 3.000.000 de posições.

A planilha de origem foi auditada célula a célula antes de qualquer código:
30.000 linhas × 100 colunas, todos os códigos com 8 caracteres de `A–Z0–9`, e
**zero repetidos**. Ela virou um arquivo binário de 24.000.000 de bytes exatos,
lido por posição direta — `seek` e `read`, sem parser no caminho de quem está
esperando o papel sair.

O que fica gravado é `27202HM4IKCBY`: o pedido 20272 de trás para frente, colado
no código. Os últimos 8 caracteres são sempre o código, o que torna a leitura
não-ambígua. E o prefixo é **string do começo ao fim** — o pedido 20270 vira
`07202`, e tratá-lo como número o transformaria em `2027`, outro pedido.

Três travas, todas porque o erro aqui não aparece na tela nem na impressão:
aparece na portaria, com a fila na porta. Dois modelos do mesmo pedido cujos `id`
diferem em exatamente 100 caem na mesma coluna e sairiam com QRs **idênticos no
mesmo evento** — o motor recusa a folha e o painel avisa sobre o pedido inteiro.
Sem pedido ou sem modelo o trabalho falha em vez de imprimir em branco. E refazer
a célula 7 imprime o código do item 7, mesmo caindo na primeira pose da folha
compactada.

O pool não entra no git — é o segredo mestre, e o `publicar.ps1` commita com
`git add -A`. Ele viaja no instalador, ao lado do `NewProd.exe` e não dentro dele,
porque o agente é `onefile` e dado embutido seria extraído a cada abertura da
estação. O `build_agent.ps1` para se o arquivo faltar ou se o tamanho não bater.

Fica para as próximas partes o **QR do Pedido** — o QR assinado que o atendente
manda ao cliente e que é a única forma de cadastrar o evento no aplicativo — e o
**Ideal Control**, a portaria offline com login de cliente, reentrada, setor,
lotação ao vivo e relatórios.

De quebra: o selo do elemento na lista mostrava `undefined` para o tipo novo, e
mostrava para `FOTO` também, desde que a janela de foto foi criada.

---

## [v557] — A foto escapava por fora do contorno no canto arredondado

Com contorno e canto arredondado, a foto aparecia **por cima da moldura** ao
longo da curva dos cantos — meio milímetro de foto do lado de fora do traço.

A causa: o contorno era desenhado num retângulo recuado meia espessura, e o raio
do canto desse retângulo saía menor e deslocado em relação ao raio da máscara que
recorta a foto — 2,76 mm contra 3,0 mm numa janela 25×32 com contorno de 2 mm.
Nas retas os dois coincidiam, e é por isso que nenhum teste pegou: todos mediam
faixas retas.

Agora o traço vai **centrado na borda da janela com o dobro da espessura**, e a
metade de fora é aparada pela própria janela — pela página no `engine.py`, pelo
`clip` no `foto-lib.js`. Sobra exatamente a espessura pedida para dentro, e a
borda externa do contorno passa a ser, por construção, a mesma curva que recorta
a foto. De quebra, a tela e o papel passaram a concordar: antes o contorno da
tela crescia meia espessura **para fora** do retângulo do elemento.

O teste novo varre linha a linha e exige que, vindo do papel para dentro, quem
apareça primeiro seja sempre o contorno. Ele falha no motor antigo em 60 linhas.

---

## [v556] — Ampliar a tela da foto e completar o fundo

A foto que chega **enquadrada demais** é o problema mais comum de credencial:
não sobra fundo para o recorte da janela, e a única saída era cortar mais — o
ombro, ou o alto da cabeça. Agora o editor cresce a moldura e completa o que
passou a faltar.

- **⤢ Ampliar**: margem igual dos quatro lados, em % do menor lado.
- **⧉ Caber na janela**: cresce só o eixo que falta até a foto ficar na
  proporção da janela daquela credencial. Nada é cortado.
- Três preenchimentos: **borda esticada** e **espelhado**, instantâneos, e
  **IA** — LaMa (Apache-2.0, 88 MB), rodando na própria estação.

**Só o anel novo vem do modelo.** O LaMa olha a tela reduzida a 512×512; se a
saída dele virasse a foto, o trabalho sairia com 512 px. O resultado é recortado
pela máscara e colado apenas na moldura, com a costura suavizada — os pixels da
câmera continuam intactos, e o teste prova isso comparando rosto e ombro antes e
depois.

Tempo: **~20 s por foto** só no processador, poucos segundos onde há WebGPU (que
é tentado primeiro e cai para o processador sozinho). Os modos instantâneos
existem para o operador não pagar essa espera quando o fundo é liso, e a
mensagem diz os dois números antes de começar. O modelo é baixado uma vez por
estação e guardado no Cache Storage, não só no cache HTTP.

Dois defeitos encontrados pelo teste antes de existirem em produção: o desfoque
do anel chupava transparência de fora da tela e deixava a beirada
semitransparente — vinheta preta no JPEG final —, e o modo espelhado ancorava as
abas laterais fora da tela, deixando o anel vazio dos dois lados.

---

## [v556] — A queima 350→300 passou a aparecer na tela

A redução automática para 300 dpi existia desde o v555 e funcionava, mas era
**muda**: acontecia durante o envio, sem selo, sem contador e sem aviso. O
operador foi procurá-la na tela e não achou — do ponto de vista dele, o recurso
não existia.

Agora ela tem três vozes, todas contando o mesmo número ao vivo:

- uma **faixa fixa** abaixo da barra da folha de contato, que enuncia a regra
  mesmo quando não há nenhuma foto acima do teto, e acende em azul com a
  contagem quando há;
- o **selo do cartão**, que passa a `390 dpi · ⤓ 300 no Gravar` antes e
  `300 dpi · reduzida` depois;
- o **aviso do Gravar**, que soma quantas subiram reamostradas.

O contador usa `dpiEmExcesso()`, que repete a mesma condição do `aplicar()` —
só foto que ainda vai subir (`blob`) — para não prometer redução que não
aconteceria nas fotos já gravadas no banco. De quebra, o selo do cartão saiu de
duas fórmulas duplicadas para uma só (`seloDpi()`): era essa duplicação que
apagava o marcador `interp.` no primeiro arrasto do enquadramento.

---

## [v555 — 2026-08-13] — Editor de Fotos e a régua de qualidade

Pedido: destacar em vermelho abaixo de 200 dpi (era 150), desvincular foto da
linha, editor de foto com IA, interpolar as fracas para 200, e reamostrar para
300 o que passar de 350 depois de enquadrado.

### A régua: 200 · 300 · 350

Selo vermelho abaixo de **200 dpi**; corredor bom entre 200 e 350; acima de
**350** no enquadramento decidido, o Gravar reamostra a foto que vai subir para
**300** — arquivo menor e RIP mais rápido, sem mexer nas antigas do banco, que
não pagam reupload. O botão **⬆ Interpolar fracas** é fixo na folha de contato
e conta as fracas ao vivo; o cartão interpolado diz `interp.`, porque
interpolação suaviza serrilhado e não recupera detalhe.

### ✕ Desvincular, com memória

Desfaz o vínculo: linha volta a "sem foto" com a célula limpa, foto volta a
"sem linha" sem perder o upload, e a dupla entra na lista de **divórcios** — o
casamento automático não os junta de novo, nem reabrindo a tela. Religar na
mão anula o divórcio.

### ✏️ Editor de Foto (`frontend/editor-foto.js`)

Recorte com alça, girar, espelhar, brilho/contraste/saturação ao vivo, nitidez,
auto-nível, reamostragem por dpi — e **remover fundo** com um modelo de
segmentação leve rodando no navegador da estação, compondo sobre a cor
escolhida. O modelo (u2netp, Apache-2.0) mora no nosso Storage, subido e
conferido por sha256 pela ferramenta `subir_modelo_fundo.ps1` — asset de
GitHub não manda CORS, e produção não depende de github.com no ar. Aplicar
substitui o arquivo da pessoa mantendo o enquadramento; o envio continua
acontecendo só no Gravar.

**Eliminar objetos** e **completar fundo** ficam para a próxima etapa, com IA
generativa por API externa — decisão de provedor e custo por imagem em aberto.

Verificação: 72 casos no harness (inclui a conta da reamostragem), 31 testes de
motor/painel, e dois drivers de navegador — o fluxo completo (selo, desvincular,
interpolar, editor, queima no Gravar medida no blob subido: 610→300 dpi) e a
remoção de fundo de verdade, com modelo baixado do Storage em ~3 s.

---

## [v555 — 2026-08-13] — O Acrobat rejeitava a máscara do canto redondo

Relato: *"a geração aconteceu até o final, sem apresentar erros. Mas o pdf
gerado está sem as fotos, que aparecem na janela de preview da imposição"* — e o
Acrobat abrindo o arquivo com *"Há um erro nesta página"*.

O PDF **tinha** as fotos: o MuPDF (e portanto todas as telas do app) as
renderizava perfeitamente. O que o Acrobat rejeitava era a **máscara do canto
arredondado**: o caminho `insert_image(mask=PNG)` do PyMuPDF guardava o PNG como
veio, e a SMask saía com ColorSpace ICCBased de 1 bit — a especificação PDF
exige SMask em **DeviceGray**. O Acrobat, estrito, descartava todas as fotos da
página e mostrava o aviso; o MuPDF, tolerante, mostrava tudo certo. A tela não
tinha como avisar: ela concorda com o MuPDF.

Agora a forma do recorte entra como **canal alfa do próprio pixmap**
(`Pixmap.set_alpha`), e é o MuPDF que escreve a SMask canônica — DeviceGray,
como toda imagem com transparência que ele produz. Dois testes novos prendem a
regra: um lê a SMask do arquivo salvo e exige DeviceGray sem ICC; o outro mede
pixel para garantir que o recorte continua recortando.

Lição de método, registrada na skill: **medir pixel com MuPDF prova a tinta, não
a validade**. O validador de PDF agora combina qpdf (estrutura) com a regra da
SMask (semântica que só o Acrobat aplicava).

O `1000287.pdf` do trabalho real foi consertado no lugar
(`1000287_corrigido.pdf`, na mesma pasta): a máscara única — compartilhada pelas
88 fotos via `garbage=4` — foi reescrita como DeviceGray de 8 bits, sem tocar em
nenhum outro objeto.

---

## [v554 — 2026-08-12] — A prévia parou de repintar a cada foto, e os acentos voltaram

Relato: *"Ficou tudo muito pesado e lento, problemas com o cache?"*, e um print
com `— SaÃ­da —` na caixa da fila de OS.

Cache não deixa lento — deixa **errado**. Eram duas causas, e a primeira era da
v553.

### Uma foto chegando redesenhava a folha inteira

A prévia do Painel de Produção passou a desenhar fotos na v553, e cada foto que
chegava do Storage pedia um repinte. Só que uma passada dessa prévia redesenha a
**folha toda** — arte rasterizada, todas as poses, os dois gabaritos. Com 88
pessoas, são dezenas de redesenhos completos disputando a mesma aba.

Agora as linhas daquela folha são colhidas durante o desenho, as fotos **dessa
folha** são carregadas de uma vez e a prévia repinta **uma** vez. Só as da folha:
pedir as 88 para mostrar as 21 que cabem é rede paga à toa.

### Depuração esquecida no código

`[CAPA-DEBUG]` despejava a numeração inteira — as 88 linhas do banco, com as URLs
das fotos — no console a cada atualização do resumo, e o `drawPedPreview CALLED`
marcava cada passada. Com o console aberto, isso pesa sozinho. Os dois saíram.

### Acentos gravados errados desde a v420

`— SaÃ­da —`, `â–¼`, `cÃ©lula`, `100Ã—60`: o `pedido.js` teve os acentos
gravados em dupla codificação no commit `ab27911` (v420) e desde então mostrava
isso na tela. Reparadas as 44 linhas, conferindo que a mudança mexeu **só** em
acento — cada linha alterada é idêntica à anterior quando se removem os
caracteres não-ASCII.

O defeito só apareceu agora porque a caixa que o exibe fica na `producao.html`,
que estava sem dois scripts e nem chegava a montá-la.

---

## [v553 — 2026-08-12] — Nome de arquivo não é foto

Relato: *"Janela de visualização da imposição no Painel de Produção não mostra as
fotos da lista, não gera o pdf e retorna: Erro ao impor a foto do elemento
'el_18' (origem: JAQUE ROSSI.jpeg): No such file or directory"*.

Dois defeitos independentes, com a mesma origem: **três lugares discordavam sobre
o que conta como "esta linha tem foto"**.

### A prévia do Painel de Produção pulava a foto

`drawVdpElements` do `pedido.js` é uma cópia divergente da função homônima do
`script.js`. A do `script.js` ganhou o tipo FOTO; esta ficou para trás e
desenhava nome, cargo e código de barras — tudo menos a foto, justamente na peça
em que a foto **é** o conteúdo. Agora ela desenha, com a linha daquele item, e um
lote de fotos chegando repinta a janela uma vez só.

### Um nome de arquivo na célula parecia foto

A célula da coluna pode trazer um **endereço** (o que o Gerenciador grava), um
**caminho de arquivo** (o modo BarTender, para quem já tem o lote numa pasta) ou
só um **nome escrito**. O terceiro não aponta para lugar nenhum — mas a
conferência prévia do motor o dava por resolvido, e a tiragem morria ao chegar
naquele item, com o PVC na bandeja.

Agora `_origem_de_foto` (motor) e `origemDeFoto` (tela) são gêmeas e recusam nome
solto. A conferência acusa **antes do primeiro papel**, dizendo linha, coluna e
motivo — "a célula tem 'JAQUE ROSSI.jpeg', que é só um nome de arquivo" é
diferente de "célula vazia" e de "arquivo não encontrado". Na tela, essas linhas
passam a mostrar o quadro vermelho com "?" em vez de um relógio de espera que
nunca terminava.

### O editor de CSV não podia mais trocar a foto em silêncio

Quem manda na impressão é o vínculo `__fotos[coluna]`, não o texto da célula.
Trocar o texto e deixar o vínculo de pé fazia a grade dizer "MARIA.jpg" e a
credencial sair com a foto da Ana. Agora, mexer no texto da célula de foto
**desfaz o vínculo** — a célula fica vermelha e o operador reanexa pelo
Gerenciador.

Na mesma linha: renomear a coluna arrasta o vínculo junto (antes ele ficava
órfão, que é uma das maneiras de produzir exatamente o erro relatado), remover a
coluna limpa o vínculo, duplicar linha não faz as duas dividirem o mesmo
enquadramento, e desfazer/descartar volta atrás de verdade — o editor passou a
trabalhar sobre cópia própria do `__fotos`, e não sobre o objeto do banco vivo.

### E mais

- A tela do pedido abre o editor de CSV com a lista de colunas de foto, que ela
  não passava: lá as células não ficavam vermelhas e nenhuma das proteções valia.
- O gabarito rasterizado espera as fotos antes de virar PNG — ele desenha uma vez
  só, e uma janela vazia no PDF entregue à produção não seria descoberta olhando
  a tela, que repinta.
- O Criador de Arte repinta a camada quando a foto chega.
- `producao.html` passou a carregar `texto-ajuste.js`, `foto-lib.js` e
  `gerenciador-fotos.js`. O `script.js` chama funções desses três **sem guarda**:
  faltando um, o primeiro elemento de texto ou de foto derrubava o desenho
  inteiro do canvas naquela página.

---

## [v548 — 2026-08-12] — A foto vira dado variável

Pedido: *"A dificuldade maior em fazer artes de credenciais fica por conta das
imagens, geralmente fotos... dificuldade em tornar as fotos como dados variáveis,
ajustar seus formatos (geralmente dentro de janelas pré definidas), cortes,
identificar em qual linha do arquivo ela deve ser inserida... Mesmo depois de
ajustadas, sempre vai precisar posterior ajuste de enquadramento."*

O texto variável de credencial já estava resolvido. A foto não estava, e é ela
que dá trabalho. Agora existe o **elemento FOTO** e o **Gerenciador de Fotos**.

### O elemento FOTO

Botão 🖼️ Foto na paleta do editor de numeração. Nasce 25 × 32 mm — a 3×4 de
credencial — e sempre ligado ao banco: foto que não varia por linha é arte de
fundo, não dado variável. O retângulo do elemento **é** a janela pré-definida.
Encaixe `cobrir` ou `caber`, cantos reto, arredondado ou círculo.

### Importar o lote e casar com as linhas

Solte a pasta inteira. Cada arquivo é corrigido pelo EXIF, convertido para sRGB e
reduzido a 300 dpi da janela com 30 % de folga para o zoom — de 4 MB para ~150 KB.
Isso não é economia de espaço: um lote de 500 fotos cruas seriam 2 GB de rede
dentro do caminho crítico do operador.

O casamento por nome segue a cascata do mercado — exato, sem extensão,
normalizado (sem acento, sem caixa, sem separador), só os dígitos (o caso do CPF)
— e uma sugestão aproximada que nunca é aplicada sozinha. Na dúvida o sistema não
escolhe: a disputa vira pendência com os candidatos à vista, porque uma
credencial com a foto trocada só é descoberta pelo cliente.

O que sobrar aparece em quatro pilhas: **casadas · ambíguas · fotos sem linha ·
linhas sem foto**. Um clique na foto, outro na linha, e as duas ficam ligadas.

### Folha de contato

A segunda aba mostra o lote inteiro já dentro da janela real do modelo. Roda do
mouse aproxima, arrastar move, as setas trocam de foto, duplo clique volta ao
automático, e um selo vermelho marca a foto abaixo de 150 dpi antes de ela virar
PVC borrado. É a tela que cardPresso, BarTender e o Data Merge do InDesign não
têm — todos eles corrigem um registro por vez.

O enquadramento inicial vem da detecção de rosto do navegador, feita uma vez na
importação. Só o retângulo é guardado: o executável do agente não ganhou nenhuma
biblioteca de visão computacional.

### No motor

`process()` passa a conferir as fotos antes do primeiro papel e acusa **todas** as
linhas vazias de uma vez — descobrir a décima depois de nove credenciais impressas
é PVC no lixo. Passada a conferência, as fotos únicas são baixadas em paralelo e
guardadas em `%LOCALAPPDATA%\NewProd\cache\fotos`; reimprimir a mesma tiragem não
baixa nada.

O recorte não toca nos bytes da imagem: a foto é desenhada maior que a janela numa
página do tamanho exato dela, e o que sobra fica de fora. Enquadrar não custa
qualidade.

### Correção que apareceu no caminho

`texto-ajuste.js` entrou no painel com o "espremer letras" (v547) e **nunca foi
incluído em `PAINEL_ARQUIVOS`**. Em toda estação ele dava 404, então o conferidor
de estouro e o modo condense simplesmente não existiam na gráfica. É exatamente o
buraco que a suíte `test_painel_estacao` nasceu para fechar — ela estava
acusando, e o alerta não tinha sido lido.

---

## [v540 — 2026-08-12] — Cada um entra vendo o proprio trabalho

Pedido: *"Login Designer, deve entrar sempre filtrando no drop o designer
logado, Login Atendente deve sempre entrar filtrando o atendente logado no
drop."*

Na Lista de Arte, quem entra como **Designer** ja chega com o filtro de designer
apontado para si; quem entra como **Atendimento**, com o filtro de atendente
apontado para si. Admin, Gerente, Impressor, Financeiro e Visualizador continuam
entrando sem filtro — o trabalho deles e justamente olhar a operacao inteira.

### O que faltava

Metade da regra ja estava escrita e nao acontecia: `populateDesignerFilter` tinha
um parametro `forceDefault` que selecionava o designer logado, e **nenhuma
chamada no projeto o passava**. O parametro saiu; a regra agora vive em
`aplicarFiltroPadraoDoUsuario`, num lugar so.

A outra metade nao existia. Reconhecer quem entrou exige e-mail ou `user_id`, e a
lista de atendentes guardava so o nome — nao havia como casar a conta logada com
a pessoa da lista. Agora `atendentesObjetosSupabase` tem a mesma forma que a dos
designers, e a funcao que identifica o usuario logado passou a receber a lista
como argumento, servindo aos dois filtros.

### Duas coisas que o filtro nao faz

**Nao briga com o operador.** Trocar para "Todos os Designers" vale pelo resto da
sessao; o padrao so se aplica uma vez por carregamento. Sem essa trava ele
voltaria a cada desenho, porque `renderOrdens` repopula os dois seletores toda
vez que redesenha a lista.

**Nao chuta quando os dados ainda nao chegaram.** O perfil vem das permissoes e a
lista de pessoas vem do Supabase, por caminhos independentes. Sem os dois em
mao, a funcao nao marca nada e tenta de novo no proximo desenho — e desiste de
vez, sem filtro, se a lista carregar e a conta nao estiver nela.

Na estacao, onde nao ha conta do site, o casamento e feito pelo nome do acesso
local.

---

## [v539 — 2026-08-12] — O aviso de permissao diz QUAL permissao falta

Relatado: *"designer continua sem conseguir entrar no pedido"*, com tres avisos
identicos empilhados sobre a Lista de Arte.

O bloqueio em si estava certo, e era dado: a conta continuava com
`perm_pedidos_view` desligado. O defeito era o aviso. **"Voce nao tem permissao
para acessar esta tela"** nomeia o problema sem dar a ninguem como resolve-lo: o
designer nao sabe o que pedir, e o administrador que recebe o recado nao sabe
qual das vinte e oito caixas ligar. Foi exatamente o que aconteceu — duas das
tres contas foram destravadas, a terceira ficou, e nada na tela dizia por que.

Agora o aviso nomeia a tela e a permissao: *"Voce nao tem permissao para abrir
📦 Pedido. Peca ao administrador a permissao VER de 'Pedido' em Usuarios."* O
recado que chega ao administrador ja e a instrucao.

O mesmo aviso tambem parou de se repetir em menos de 4 s. Clicar em tres pedidos
seguidos empilhava tres avisos identicos, escondendo a lista atras deles.

---

## [v538 — 2026-08-12] — Permissoes: a tela parou de mentir sobre o que gravou | Agente **1.2.37**

> Este release saiu junto com a correcao do painel da estacao, descrita na secao
> seguinte: as duas foram ao ar no mesmo commit `v538`. Os numeros v539 e v540,
> usados enquanto o trabalho estava em andamento, nunca existiram como tag.

Relatado: *"Nao esta funcionando corretamente o gerenciamento de usuarios,
revisar, inclusive layout que esta bem ruim, regras por login pararam de
funcionar tambem... Designers nao conseguem mais entrar na tela do pedido em
arte"*.

Eram quatro defeitos distintos, e o mais grave e o que ninguem tinha como ver.

### O card de Usuarios dizia "salvo" para gravacoes que nao aconteceram

Marcar uma caixa, trocar o perfil e conceder acesso chamavam `fetch` e **nunca
olhavam a resposta**. O motor devolvia `{"ok": false}` com HTTP 200 quando o
Supabase recusava, e a tela mostrava "✅ ativada" do mesmo jeito. Um
administrador nao tem como desconfiar de um visto verde: ele aplicava o perfil
Designer em quatro contas, via quatro confirmacoes, e as quatro continuavam com
a grade antiga.

O card de Acesso Local, ao lado, sempre fez isso certo (`salvarAcessoLocalNoMotor`
lanca erro se o motor nao confirma). Agora os dois usam o mesmo desenho: o motor
responde **503** com o motivo, e a caixa de marcar **volta sozinha** quando a
gravacao nao e confirmada.

### Motor lento rebaixava quem so estava entrando de novo

`get_user_permissions` devolvia `None` tanto para "este usuario nao tem linha"
quanto para "nao consegui perguntar ao banco" — e a consulta tem 8 s de
paciencia, enquanto o Render dorme. Bastava um login numa hora ruim para o painel
concluir "primeiro acesso" e **gravar o perfil visualizador por cima das
permissoes reais**. As duas respostas agora sao diferentes (`BancoIndisponivel`
→ 503), e o painel so cria a linha quando o banco confirma que ela nao existe.
Quando a grade nao pode ser lida, a entrada e barrada com um botao de tentar de
novo — antes esse caminho deixava a grade vazia, e grade vazia liberava tudo.

### Cada perfil abre na sua tela

Havia um roteador fixo no fim do `script.js` mandando **todo mundo** para o
Painel de Producao, 50 ms depois do DOMContentLoaded — com a grade de permissoes
ainda em viagem, portanto sem chance de olhar o perfil de quem entrou.
Atendimento e Designer abrem na **Lista de Arte**; Impressor, Gerente, Financeiro
e Admin, no **Painel de Producao**. A escolha ainda passa pelo porteiro: quem nao
pode ver a tela do proprio perfil cai na primeira que puder.

### A tela de permissoes ficou legivel

Treze modulos numa coluna de 260 px com tipo de 0,62 rem viravam uma parede de
vistos. Agora: duas colunas, cada uma com o proprio cabecalho VER/EDITAR, e cada
modulo dizendo **que tela ele abre** — foi um rotulo so "Pedidos", sem explicar
que era a tela onde o designer trabalha o dia inteiro, que deixou quatro
designers trancados do lado de fora. A grade fica recolhida atras de "Ajustar
permissoes", e o que fica a vista e o que se le: perfil, **em que tela a pessoa
abre**, quantos modulos ela ve, e um selo **"grade personalizada"** com botao de
restaurar quando a grade ja nao e a do perfil.

---

## [v539 — 2026-08-12] — A estacao para de servir tela velha com motor novo | Agente **1.2.37**

Relatado: *"Refazer Celula funciona perfeitamente na minha maquina, mas nao
funcionou nas estacoes da grafica, agente esta desatualizado?"*

Estava, em tres estacoes — mas nao na que importava. A DESKTOP-5N8AF7D rodava o
agente 1.2.36, o mais novo, e mesmo assim marcar "Refazer Celula" nao trocava a
previa e digitar as posicoes separadas por virgula nao respondia. Esse e, nos
detalhes, o comportamento da **v528** do painel: nove releases atras. O
executavel estava certo; velha estava a tela que ele servia.

### O HTML do painel nao fica mais em cache

Os scripts se protegem com `?v=NNN`. Quem carrega esse carimbo e o proprio
`index.html`, e ele nao tinha como se invalidar: servido sem `Cache-Control`, o
navegador da estacao aplicava cache heuristico e segurava o HTML antigo por
horas — pedindo `pedido.js?v=528` do proprio cache. O agente trocava os arquivos
no disco a cada 30 minutos e nada disso chegava a tela.

Agora todo `text/html` servido pela estacao sai com `Cache-Control: no-store`.
Vale so para o HTML: e o unico arquivo sem carimbo, e e ele que carrega os
outros. O resto continua cacheavel, que e o que mantem a tela rapida.

### Tres arquivos que nunca se atualizavam

`PAINEL_ARQUIVOS` listava dez arquivos; o HTML do painel carrega treze. Os tres
de fora nunca chegavam a estacao:

- **`amostra-modal.js` dava 404 em toda estacao.** Ele nasceu na v533, depois do
  build do agente 1.2.36, e `window.abrirAmostraModal` e `window.AmostraModal` so
  existem nele — ampliar a amostra estava quebrado em todas as maquinas.
- **`csv-editor.js` estava tres releases atras**, congelado na data do build.
- **`pdf-lib.min.js`** pelo mesmo motivo.

A causa era a soma de duas coisas: a lista de sincronismo nao os incluia, e o
`_semear_painel` do `app.py` copiava da copia embutida **so o que ainda nao
existia**, nunca sobrescrevendo. Quem instalou o agente uma vez ficava com o
arquivo daquela instalacao para sempre.

Agora a lista tem os treze, e o semeador tambem repoe o que for mais antigo que
a copia embutida. A comparacao e por data de arquivo e e segura nos dois
sentidos: o painel baixado da nuvem e sempre mais novo que o build, entao nunca
volta atras. `tests/test_painel_estacao.py` le os tres HTML do painel e cobra que
todo `.js` e `.css` local que eles carregam esteja na lista — a regra deixa de
depender de alguem lembrar.

### A estacao passa a dizer qual painel esta servindo

O heartbeat reportava a versao do executavel, e so. Saber qual painel a maquina
servia exigia ir ate ela — foi o ponto cego que custou a investigacao inteira.
Agora `printers_json` leva tambem:

```json
"painel": { "versao": "537", "quando": "2026-08-12T12:58:45+00:00" }
```

A versao sai do carimbo `?v=NNN` do proprio `index.html`, e `quando` e a data do
arquivo em disco — que denuncia sincronizacao parada mesmo quando o carimbo nao
muda. Agente e painel tem ciclos de vida separados, entao os dois numeros
precisam viajar juntos.

> **Na pratica, hoje:** `Ctrl+F5` no painel da estacao resolve na hora. As
> estacoes CESAR-CPD e PRD-ACABAMENTO estao abaixo da 1.2.7 (nao reportam versao)
> e precisam do MSI instalado a mao uma vez — elas sao anteriores ao auto-update
> por manifesto e nunca vao se atualizar sozinhas.

---

## [v541 — 2026-08-12] — Planilha inteira, campos no ticket e vinculo com a origem

> NOTA DE NUMERACAO: esta entrada foi escrita como v538 e renumerada para v541.
> A frente de permissoes correu em paralelo, em outra janela, e acabou saindo
> antes — em tres publicacoes proprias: **v538**, **v539** e **v540**. As duas
> frentes NAO dividiram um release, ao contrario do que esta nota dizia enquanto
> o trabalho estava em andamento. Esta aqui e a v541, sozinha.

### Planilha de varias paginas vem inteira
Pedido: *"Identificar quando a planilha URL possuir mais de uma pagina e carregar
todas as paginas no editor"*.

Um caderno de credenciais tem uma pagina por pais, e o pedido imprime todas.
Colar o link de compartilhamento de uma planilha com mais de uma pagina agora traz
**todas de uma vez**, empilhadas numa tabela so. Medido na planilha do usuario:
**238 linhas de 8 paginas em 1,5 s** — Bulgaria 37, Chile 29, Colombia 24,
Eslovaquia 30, Espanha 29, Tchequia 25, Macedonia 28, Paraguay 36.

O `/export?format=csv` entrega uma pagina so, e o `gid` de cada uma e um numero
arbitrario. Quem lista as paginas sem exigir chave de API e a pagina `/htmlview`,
que o Google serve com CORS e que carrega um `items.push({name, gid})` por aba.
Cada pagina e entao baixada pelo caminho normal, em paralelo. **E leitura do HTML
dos outros**, entao qualquer falha ali devolve lista vazia em vez de erro, e a
busca cai no comportamento anterior — a primeira pagina.

- **Colunas sao a uniao das paginas**; pagina sem uma coluna fica com o campo
  vazio, em vez de desalinhar.
- **Uma coluna `Página`**, criada por nos, diz de onde veio cada linha — e e por
  ela que se filtra no editor e se reparte as linhas entre os modelos. Colide com
  uma coluna existente? Vira `Página 2`.
- **Essa coluna nao vira campo no ticket**: e metadado, nao conteudo impresso.
- **Pagina vazia e ignorada**, pagina que falhou nao derruba as outras, e as duas
  coisas aparecem no aviso.
- **Para trazer uma pagina so**, abra-a no Google antes de copiar o endereco: o
  link fica com `#gid=`, e gid explicito e respeitado. Esta escrito na tela.

### O banco que chega poe os campos no ticket
Relatado: *"quando clicar em buscar, deve add os elementos para posicionamento na
janela de visualizacao"*.

Trazer o banco era metade do trabalho: o ticket continuava em branco e apareciam
so os botoes `📊 Pais`, `📊 Nome`, `📊 Cargo` para o operador clicar um a um. Quem
conhece a tela sabe; quem nao conhece conclui que a busca falhou.

Agora cada coluna vira um campo de texto assim que o banco entra — pelo upload,
pela busca na web ou pela atualizacao —, ja desenhado com o dado da primeira
linha, pronto para arrastar.

- **So entra coluna sem elemento.** Reabrir, trocar o arquivo ou atualizar nunca
  duplica um campo, e **nunca move** um que ja foi posicionado. Coluna nova entra
  abaixo do campo de banco mais baixo.
- **A distribuicao respeita o formato.** Sem campos ainda, o bloco nasce centrado
  na altura, com passo entre 5 mm e 9 mm conforme couber, preso entre 1 mm e
  `altura − 1`. Sem formato conhecido, passo fixo de 7 mm.

Efeito colateral aceito: numeracao esvaziada de proposito volta a receber os
campos ao trocar o banco.

### A numeracao lembra de qual planilha veio o banco
A busca da v537 era uma importacao de uma vez so: o endereco era usado e jogado
fora. Agora a numeracao guarda o link em `producao_numeracoes.csv_url`, mostra na
tela que esta ligada a uma planilha, e ganha o botao **🔄 Atualizar da planilha**.

```
🌐 Da web  [ …/spreadsheets/d/1_Yj…/edit?usp=sharing ]  ⬇ Buscar  🔄 Atualizar da planilha
🔗 Este banco veio da planilha acima. 🔄 Atualizar troca o conteudo pelo que estiver nela agora.
```

Guarda-se **o link que o operador colou**, e nao o de exportacao derivado: e o
que ele reconhece ao reabrir a numeracao meses depois. Banco vindo de arquivo do
computador, ou montado a mao, fica sem link e sem botao — nao tem de onde
atualizar. Trocar o CSV por um arquivo local, ou remove-lo, **limpa** a coluna.

### O cuidado que sustenta o recurso
Cada linha do CSV carrega um `__id`, e e por ele que
`pedidos_modelos.csv_selecao` sabe quais linhas cada modelo do pedido imprime. A
planilha baixada de novo chega **sem `__id` nenhum** — ids novos fariam toda
selecao ja feita apontar para o vazio. Entao `__id` e `__ativo` sao herdados
**posicao a posicao**, e so as linhas alem do fim do banco antigo recebem ids
novos, continuando do maior ja usado.

Isso vale enquanto a planilha so mudar de conteudo. Inserir, apagar ou reordenar
linhas la desloca tudo abaixo do ponto. A confirmacao diz isso com todas as
letras, mostra a contagem dos dois lados antes de trocar, avisa que o que foi
editado a mao no CSV sera substituido, e aponta a coluna que sumiu quando algum
elemento ainda a usa.

### Migracao
`sql/alter_producao_numeracoes_csv_url.sql` — rodado em producao em 12/08/2026,
**antes** de publicar o frontend. O app escreve a numeracao direto no Supabase,
entao salvar com uma coluna inexistente faria o PostgREST recusar o registro
inteiro.

### Arquivos
`frontend/index.html`, `frontend/script.js`,
`sql/alter_producao_numeracoes_csv_url.sql`, `docs/editor_de_csv.md`.
So frontend — o agente nao precisa ser republicado.

---

## [v537 — 2026-08-12] — Banco de dados direto da web (Planilha Google)

### O que entrou
Na caixa **Banco de Dados (CSV)** do editor de numeracao, um campo de endereco:

```
🌐 Da web  [ https://docs.google.com/spreadsheets/d/1_Yj…/edit?usp=sharing ]  ⬇ Buscar
```

Cola-se o link da Planilha Google — o mesmo que se copia da barra do navegador —
e o banco entra igual a um upload de arquivo. Serve tambem para qualquer `.csv`
publico na web.

O link de compartilhamento devolve HTML; quem devolve CSV e o endereco de
exportacao, e a traducao e automatica. Se o link tiver `#gid=`, vem a **aba**
correspondente; sem ele, vem a primeira. O nome do arquivo sai do cabecalho
`Content-Disposition`, entao a numeracao fica com o nome real da planilha.

### Roda no navegador, sem servidor no meio
O endereco de exportacao do Google devolve os cabecalhos de CORS — verificado,
nao presumido. Por isso o recurso **nao toca no `app.py` e nao exige publicar o
agente**.

### As falhas que a tela distingue
- **Planilha privada ou inexistente**: 404, e o aviso diz para compartilhar como
  "Qualquer pessoa com o link".
- **Pagina de login com 200**: chegaria HTML, e sem guarda o parser o aceitaria
  como uma tabela de uma coluna so. O texto e recusado.
- **Erro de rede/CORS**: o `fetch` rejeita com um `TypeError` sem detalhe; a tela
  traduz para o que quase sempre e a causa.

Em qualquer falha **o banco que ja estava carregado permanece**.

### Arquivos
`frontend/index.html`, `frontend/script.js`, `docs/editor_de_csv.md`.
So frontend — o agente nao precisa ser republicado.

---

## [v536 — 2026-08-12] — A amostra entrava escura, como se multiplicasse duas vezes

Relatado: *"toda vez que entro no pedido, quando contem elemento .csv na
numeracao, a janela combinada aparece escura como se tivesse aplicado varios
multiply sobre a arte, mas ao navegar e voltar pelo seletor de paginas ela volta
ao normal"*.

### A causa
O `drawAmostraFace()` e `async` e espera a rede: o PDF da cor, a arte do Storage,
as fontes. **Enquanto ele espera, outro desenho comeca no mesmo canvas** — ao
abrir o pedido, o `preloadAmostraItemPdfElements()` termina de carregar o
elemento PDF/SVG da numeracao e dispara um segundo `renderItemAmostraCombinada`
com o primeiro ainda esperando a arte.

Os dois chegam ao fim e executam o mesmo trecho:

```js
ctx.globalCompositeOperation = 'multiply';
ctx.drawImage(grupoCanvas, 0, 0);
```

O grupo multiplica **duas vezes** sobre a mesma cor. Sumia ao navegar porque ai o
elemento ja estava em cache e o desenho ficava sozinho.

Nao era do CSV: era de numeracao com elemento PDF ou SVG mais arte lenta. O CSV
so tornou o problema visivel, porque foi ele que trouxe o seletor de paginas que
o consertava por acidente.

### A correcao
Um carimbo de geracao no proprio canvas: quem chega depois carimba, quem estava
em voo desiste antes de encostar no contexto. Vale no painel e no link do
cliente.

Medido no mesmo cenario, luminancia media do canvas: **148 ao entrar contra 182
depois de navegar** antes da correcao; **182 nos dois** depois dela.

### Arquivos
`frontend/script.js`, `frontend/cliente.js`, `docs/editor_de_arte.md`.
So frontend — o agente nao precisa ser republicado.

---

## [v535 — 2026-08-12] — Seletor de linhas: intervalo e semaforo verde/vermelho

### A coluna Modelo virou semaforo
Aberta pelo 🧩 de um modelo, a coluna deixa de mostrar a cor de paleta de cada
um e passa a responder a pergunta de quem abriu:

| | |
|---|---|
| 🟢 **Disponivel** | ninguem pegou; este modelo pode levar |
| 🔴 **Nome do outro** | ja e de outro modelo do pedido |
| 🔵 **Nome deste** | e deste modelo (fica na cor dele) |

A legenda entrou na faixa de instrucao. Vindo do aviso da fila — em que se
reparte entre todos ao mesmo tempo — vale a cor de cada modelo, que ali e a
informacao util: nao ha um "outro" para alertar.

### Selecionar por intervalo
Repartir 3.000 assentos entre setores e trabalho de intervalo, nao de clique:
rolar ate a linha 1.500 segurando Shift nao e caminho. O botao **Intervalo…**,
na barra *Selecionar*, pede da linha N ate a M pelo numero da coluna `#`, com
duas opcoes:

- **Pular as linhas que ja sao de outro modelo (as vermelhas)** — ligada por
  padrao. A posse e exclusiva: sem ela, um intervalo que invade a fatia do
  vizinho **rouba** as linhas dele, em silencio.
- **Somar a selecao atual** — desligada por padrao, para juntar faixas soltas.

Linhas desmarcadas sao ignoradas, e o aviso final diz quantas entraram, quantas
ficaram de fora por serem de outro modelo e quantas estavam desmarcadas.

### Arquivos
`frontend/csv-editor.js`, `docs/editor_de_csv.md`.
So frontend — o agente nao precisa ser republicado.

---

## [v534 — 2026-08-12] — A tela do banco de dados passou a se explicar

Relatado direto: *"Não ficou claro a edição do .csv e a forma de seleção para
cada modelo"*. O codigo estava certo; a interface e que nao dizia nada.

### No card do modelo
Eram dois emojis nus (📊 🧩) espremidos na linha do titulo "Numeracao
Cadastrada" — sem texto, so tooltip. Medindo, o quarto botao da fila ainda
ficava **cortado** pela largura do painel. Viraram uma faixa propria:

```
🗂️ Banco de dados: assentos.csv
[ 📊 Ver / editar ]  [ 🧩 Linhas: 5 de 10 ]
```

A contagem saiu do tooltip e foi para dentro do botao. Modelo sem nenhuma linha
fica com o botao vermelho — ele nao imprimiria nada.

### Na tela de distribuir
Ela abria com os botoes de modelo apagados e **nada** explicava por que. Ganhou
uma faixa fixa no topo com o fluxo inteiro:

```
① Clique nas linhas que um modelo vai imprimir → ② Clique no nome do modelo
                                                  3 linha(s) selecionada(s)
Aqui só se reparte. Para corrigir o conteúdo das células, feche e use
📊 Ver / editar no card do modelo.
```

O indicador da direita e ambar sem selecao e verde com a contagem. O `title` dos
botoes de modelo passou a dizer por que estao apagados. E a ultima linha avisa o
que aquela tela **nao** faz — sem isso o operador tenta editar celula, nao
consegue, e conclui que esta quebrada.

### Arquivos
`frontend/script.js`, `frontend/csv-editor.js`, `docs/editor_de_csv.md`.
So frontend — o agente nao precisa ser republicado.

---

## [v534 — 2026-08-12] — O link do cliente pagina os ingressos, e ficou mais leve

### O problema
O cliente via sempre o **primeiro** ingresso do banco. Com o banco dividido
entre os modelos do pedido ficou pior: todos os modelos mostravam a mesma linha
1, mesmo cada um imprimindo um bloco diferente.

E a pagina ja era pesada por outro motivo. O `cliente.js` fazia `select('*')` em
`producao_numeracoes` e baixava o banco de dados de **todas** as numeracoes do
sistema: 569 KB (89 KB comprimidos), dos quais **84% eram CSV de pedidos
alheios**. O `Whisper.csv` (3.000 linhas) e o `Avra.csv` (2.000) desciam para o
celular de qualquer cliente que abrisse qualquer link, e nenhum era usado.

### O que entrou
O cliente folheia os ingressos do modelo dele:

```
       CONFIRA OS INGRESSOS
   ◀   Ingresso 3 de 5   [3]   ▶
   Fila: A · Assento: 03 · Setor: Pista
```

**O desenho e refeito no navegador dele**, e nao vem pronto do servidor. Uma
imagem por linha seria inviavel: 3.000 linhas dariam centenas de MB no Storage e
um download a cada clique. Desenhando ali, virar pagina **nao gera nenhuma ida a
rede** — verificado com o contador de requisicoes do navegador: zero.

So os modelos que paginam trocam a imagem aprovada por canvas, e so quando ha
com o que desenhar (`arte_url` presente). Todo o resto continua exatamente como
estava, com a imagem aprovada.

E o catalogo passou a vir em duas consultas: colunas explicitas sem `csv_data`
(11 KB comprimidos) e o `csv_data` **apenas das numeracoes do pedido**. O link
ficou mais leve do que era antes da paginacao.

### Um erro que estava escondido no modo PDF
No modo PDF — que ja paginava, nos dois lados — a pagina N indexava o **banco
inteiro** em vez da fatia do modelo. Um modelo cuja fatia comeca na linha 601
exibia a linha 1 na primeira pagina. Corrigido no painel e no link do cliente.

### Arquivos
`frontend/cliente.js`, `frontend/script.js`, `docs/editor_de_csv.md`.
So frontend — o `engine.py` nao muda e o agente nao precisa ser republicado.

---

## [v533 — 2026-08-11] — Banco de dados no card do modelo e janela de visualizacao ampliada

> Saiu na mesma leva que a paginacao da amostra, logo abaixo: os dois commits
> foram publicados juntos, sob a mesma tag v533.

### O problema
Para mexer no banco de dados de um modelo era preciso sair do pedido e abrir o
editor da numeracao — uma tela de catalogo — enquanto o trabalho acontecia ali,
no card. E a imagem do modelo, apesar do cursor de lupa, nao abria nada: o
`onclick` chamava `openClienteLightbox()`, que so existe no `cliente.js`. No
aplicativo interno o clique dava `ReferenceError` em silencio.

### O que entrou
**Dois botoes no card de cada modelo**, ao lado do seletor de numeracao:

- **📊** abre o editor comum do banco (celula, coluna, quais linhas imprimem) e
  grava de volta na numeracao.
- **🧩** abre a distribuicao entre os modelos do pedido, ja **destacando o modelo
  de onde partiu**, e grava a fatia em `pedidos_modelos.csv_selecao`.

Aparecem so quando a numeracao tem banco de dados, e o `title` do 🧩 diz quantas
linhas o modelo leva ("5 de 10"). Ele fica vermelho quando o modelo esta sem
nenhuma — modelo sem linha nao imprime nada.

A distribuicao passou a valer **com um modelo so**: recortar uma fatia para o
unico modelo do pedido e legitimo e nao havia caminho para isso.

**Clicar na imagem abre a janela ampliada** (`frontend/amostra-modal.js`): frente
e verso lado a lado, grandes, com o seletor de linhas do CSV, os mesmos dois
botoes de banco, `←`/`→` para virar a pagina, `Esc` para fechar e um botao de
tamanho real para conferir numeracao miuda.

### O cuidado que definiu o desenho
A janela **nao desenha nada** — copia o bitmap dos canvases que o
`drawAmostraFace()` ja pintou no card. O card e o renderizador canonico; uma
segunda implementacao divergiria dele no primeiro ajuste de fusao de camadas, e
o operador aprovaria numa tela o que sairia diferente no papel.

### Arquivos
`frontend/amostra-modal.js` (novo), `frontend/script.js`,
`frontend/csv-editor.js`, `frontend/index.html`, `docs/editor_de_csv.md`.
So frontend — o `engine.py` nao muda e o agente nao precisa ser republicado.

---

## [v533 — 2026-08-11] — Visualizacao da amostra paginada, uma pagina por linha do CSV

### O problema
Numeracao com elemento de CSV nao tem "uma" amostra: tem uma por linha de dado.
O card do modelo, na Lista de Arte, sempre desenhava a **primeira linha** do banco
— para conferir o assento 340 nao havia caminho nenhum. E com o banco agora
dividido entre os modelos do pedido, ficou pior: os tres modelos mostravam a mesma
linha 1, mesmo cada um imprimindo um bloco diferente.

### O que entrou
A visualizacao virou multipagina, com um seletor abaixo do desenho — o mesmo
idioma que o modo PDF ja usava:

```
◀   Linha 3 / 5   [3]   ▶
   Fila: A · Assento: 03 · Setor: Pista
```

**Cada modelo navega apenas pela sua fatia**: as paginas saem das linhas que lhe
foram atribuidas na distribuicao. Modelo sem fatia navega pelo banco inteiro, que
e o comportamento de sempre. O resumo abaixo dos botoes diz que linha e aquela sem
precisar abrir o banco.

Um seletor comanda as duas faces — frente e verso mostram sempre a mesma linha — e
todos os elementos variaveis da face (texto, teatro, QR) leem essa mesma linha.

### Dois cuidados que a verificacao expos
- **A pagina vive em `state.amostraCsvPaginas`, com chave `osId:itemId`**, e nao no
  objeto do item. O pedido recarrega os itens em segundo plano e substitui os
  objetos; guardada no item, a pagina se perdia no meio da navegacao e voltava
  sozinha para a primeira linha.
- **Navegar nao marca `_needsSnapshot`.** Senao o instantaneo enviado ao link do
  cliente passaria a ser a linha que o operador estava olhando por acaso.

### Fora de escopo
O link do cliente tem a sua propria copia do `drawAmostraFace` e continua
mostrando a primeira linha. Pagina-lo muda o que o cliente ve — e decisao de
produto, nao consequencia tecnica.

So frontend: o `engine.py` nao mudou, o agente nao precisa ser republicado.

---
## [v532 — 2026-08-11] — "Célula" passou a ser o item do modelo, não a pose da folha

Relatado da produção: *"Pq não permitiu colocar na mesma folha as numerações 1,
6, 22, 77, 99? deve permitir qualquer célula do modelo"*.

### O mal-entendido
Eu tinha lido "célula" como a **pose da folha imposta** — a posição física dentro
da folha de saída, o `P + 1` do laço. Num formato de dez poses, o campo recusava
22, 77 e 99. Mas "célula do modelo", no vocabulário da gráfica, é o **ticket
individual**: o 1º, o 6º, o 22º item da tiragem daquele modelo.

### O que mudou
O campo passou a receber **posições do item no modelo**, 1 a Quantidade. O índice
interno é `posição - 1`, e mais nada — nenhuma conta de esquema entra na
compactação, porque onde o item caiu na tiragem original (cut_stack, multi-artes,
sequencial) é irrelevante para quem só quer o ticket de volta. Isso apagou
`_indice_de_origem` do `engine.py` e a sua cópia no `pedido.js`: duas
reimplementações da matemática de índice que tinham de concordar entre si, e
agora simplesmente não existem.

O teto do campo virou a quantidade do modelo. A prévia rotula cada célula com
`#posição` em vez de `f2·c5`, e o cabeçalho diz "5 de 200 item(ns) do modelo".

### Os dois modos ficaram excludentes
Marcar "Refazer Folhas" desmarca "Refazer Célula" e vice-versa. Combiná-los
deixou de fazer sentido: as posições são absolutas no modelo, e uma faixa de
folhas só poderia contradizê-las. O motor ignora a faixa quando há posições,
porque também atende o agente local e a API.

> Toca `engine.py` — **o agente precisa ser publicado junto com o site**.

---

## [v531 — 2026-08-11] — Refazer célula: uma folha por vez, na ordem digitada

Dois erros de comportamento na v529/v530, relatados da produção: *"ao digitar 7,
vem todas as celulas com o 7, 17, 27, deveria vir apenas a 7. Ao seguir digitando
novos numeros embaralha tudo"*.

### 1. A célula pertence a UMA folha
A lista de células estava sendo aplicada a **todas as folhas da tiragem**. Pedir a
célula 7 devolvia a célula 7 de cada folha — dezenas de tickets onde o operador
queria um.

Agora, sem faixa em "Refazer Folhas", a origem é a **folha 1**, uma só. Para
repetir a mesma posição em várias folhas — que é o defeito típico de cilindro
sujo, sempre no mesmo lugar — marca-se "Refazer Folhas" e a faixa multiplica de
propósito. O cabeçalho da prévia passou a dizer de onde as células vêm: "3
item(ns) da folha 1" ou "das folhas 1 a 3".

### 2. A ordem é a digitada, não a crescente
A lista era ordenada. Com a prévia desenhando a cada tecla, digitar "7" e depois
"7,3" fazia o 7 **saltar da primeira posição para a segunda** diante do operador —
o "embaralha tudo". As células ocupam a folha na ordem em que foram digitadas:
"4,1" põe a célula 4 na primeira posição.

A correção vale nos dois lados. No `engine.py`, `refazer_celulas` deixou de ser
`sorted(set(...))` e virou `dict.fromkeys(...)` — dedup preservando a ordem — e os
três laços que iteravam `sorted(r_cels)` passaram a iterar a lista. No frontend,
`parseRefazerCelulas` deixou de ordenar (o `Set` do JavaScript já preserva a ordem
de inserção).

> Toca `engine.py` — **o agente precisa ser publicado junto com o site**.

---

## [v530 — 2026-08-11] — A folha se monta enquanto se digita as células

Marcar "Refazer Célula" agora **esvazia a folha na prévia na hora**, antes de
qualquer coisa ser digitada. Cada célula digitada vai aparecendo, ocupando a
próxima posição vaga; as que faltam ficam tracejadas e vazias.

Antes, com o campo em branco, a prévia mostrava a folha da tiragem inteira — o
operador digitava às cegas e só via o resultado depois de fechar a lista. Montar
vendo o que se monta é o ponto do recurso.

Duas mudanças pequenas sustentam isso:

- `getRefazerCelulasSelecionadas()` passou a devolver **lista vazia** em vez de
  `null` quando o checkbox está marcado. Vazio deixou de significar "sem filtro"
  e passou a significar "nenhuma célula ainda", que é um estado legítimo da tela.
- A célula sem item deixou de ter véu escuro com X e virou **tracejado claro**.
  No papel essas células saem em branco; o véu escuro dava a entender que havia
  ali algo bloqueado.

Só frontend — `engine.py` não mudou, o agente não precisa sair junto.

---

## [v529 — 2026-08-11] — Refazer célula compacta os itens na folha

### O que mudou desde a v528
Na v528, refazer as células 2 e 5 de dez folhas devolvia **dez folhas** com dois
tickets cada e o resto em branco. Numa gráfica isso é papel jogado fora: a
reposição de vinte tickets custava dez folhas.

Agora os itens escolhidos são **recolhidos e reimpostos preenchendo a folha,
célula a célula, sem buraco**. Vinte tickets numa folha de seis células viram
quatro folhas — a última com as células vagas marcadas na prévia.

### A ordem
Ordem de leitura: **folha, depois célula**. As células 2 e 5 das folhas 1 a 3
saem na sequência f1·c2, f1·c5, f2·c2, f2·c5, f3·c2, f3·c5, ocupando as células
1 a 6 da folha de saída.

### O que não muda
**A numeração.** O item troca de lugar na folha, nunca de número: o que estava na
célula 5 da folha 2 pode cair na célula 1 da folha compactada, e continua sendo o
mesmo ticket. É a propriedade que `tests/test_engine_refazer.py` trava — inclusive
comparando a ordem física em que os números aparecem na folha, lida pelas
coordenadas do texto no PDF.

Células da última folha da tiragem que não existem como item (a tiragem raramente
fecha redonda) não entram e não ocupam espaço.

### Onde isso mora
A conta de "(folha, célula) da tiragem → índice do item" foi extraída para
`_indice_de_origem`, no `engine.py`, e a lista `fontes` é consumida pelo laço
principal, que passou a só ler dela quando se compacta. O `strict_assembly` tem o
seu próprio caminho, sobre `cell_allocations`. **Os dois lugares que fazem essa
conta — motor e prévia — têm de concordar**; se um mudar sem o outro, o refazer
repõe o ticket errado, e é exatamente aí que `test_cut_stack_refazer_celula_compacta_a_coluna`
morde.

### A prévia mostra a folha compactada
Não a folha original com buracos — senão a tela contaria uma história e o papel,
outra. Cada célula ganha o rótulo da origem (`f2·c5`) no canto inferior, em verde,
e as células vagas do fim recebem o véu. O cabeçalho diz "Folha 1 de 2 ·
compactada · 8 item(ns) de 4 folha(s)".

Um detalhe que engana: **"De/Até" continua contando folhas da TIRAGEM**, não da
saída compactada. Por isso o total usado na validação é guardado antes da
compactação. Com células ligadas, digitar em "De:" leva a prévia para a primeira
folha compactada, porque a folha 7 da tiragem deixou de ser uma página da saída.

> Toca `engine.py` — **o agente precisa ser publicado junto com o site**.

---

## [v528 — 2026-08-11] — Refazer folhas: os freios que faltavam, e refazer célula

### O que o recurso é
"Refazer Folhas" existe para o momento em que a tiragem já saiu e uma parte dela
se perdeu — folha amassada na saída, célula borrada. O motor filtra as folhas com
um `continue` dentro do laço, sem recalcular índice nenhum, e é por isso que a
folha 7 refeita traz **exatamente** os números que a folha 7 trazia. Essa
propriedade agora está travada em `tests/test_engine_refazer.py`.

### O que estava errado

**O checkbox contaminava o botão principal.** Os botões da caixa passavam um
segundo argumento (`runPedImposition('pdf', true)`) que a função simplesmente não
recebia: a assinatura era `function (mode)`. O payload lia os checkboxes direto do
DOM, então uma caixa esquecida marcada fazia o 🚀 Gerar PDF e o 🖨️ Imprimir
principais saírem filtrados, sem nenhum aviso. O mesmo valia para a view
Imposição, que nem caixa tem e mesmo assim lia os campos `ped-refazer-*` do Painel.

**Só "Até" preenchido refazia o trabalho inteiro.** `refazer_de = 0` desliga o
filtro. O operador digitava "Até: 10" achando que pedia as dez primeiras folhas e
recebia as quinhentas.

**Faixa impossível terminava em sucesso.** De maior que Até, ou De 500 num
trabalho de 40: zero páginas geradas, nenhum arquivo emitido, e a tela dizendo
"concluído e arquivos salvos". Numa gráfica isso é uma pilha que ninguém
reimprimiu.

**O arquivo saía com o nome do trabalho inteiro** e gravava por cima dele na mesma
pasta.

**O Imprimir do refazer sumia quando o modelo estava IMPRESSO** — o único momento
em que o recurso serve. E o botão só tinha `id` no `index.html`, então no
`producao.html` a regra nunca chegava a valer: as duas páginas se comportavam
diferente.

### O que mudou

- `runPedImposition(mode, isRefazer)` honra o segundo argumento. A faixa só entra
  quando o botão da caixa é quem chamou; os botões principais sempre produzem o
  pedido inteiro. `runImposition()` (view Imposição) nunca refaz.
- `montarRefazerPayload()` valida antes de bloquear a tela: "De" obrigatório,
  Até ≥ De, faixa dentro do total de folhas do set, células dentro do total de
  poses. O motor repete as guardas, porque também atende o agente local e a API.
- O nome do arquivo ganha sufixo: `12345_refazer_folhas2-3_cel1-3-5.pdf`.
- Zero arquivos gerados virou erro, no motor (`_avisar_refazer_vazio`, que
  substituiu o `_apply_refazer_filter` — um `return` puro deixado para trás) e no
  frontend, que agora conta os arquivos do stream.
- Refazer não pergunta mais se o modelo deve ser marcado como impresso.
- As desistências anteriores ao `try/finally` deixavam `isImposing = true` e os
  botões escondidos até um F5. Todas passam por `desistir()` agora.
- Bug latente junto: gravar o miolo de um set completo estava sob a mesma condição
  que gerar a capa. Com mais de um set passando pelo filtro, o miolo era
  descartado em silêncio.

### Refazer Célula
Segundo checkbox, campo com os números das células separados por vírgula (faixas
`2-4` também valem). As células são as poses da folha, numeradas 1..N na ordem de
leitura — o mesmo `P + 1` que a prévia e o motor usam. As não escolhidas saem em
branco; capa e contracapa não são reimpressas. Os dois modos se combinam: folhas
2-3, célula 5.

Na prévia, as células fora da escolha recebem um véu escuro com um X, e todas
ganham o número no centro — verde nas escolhidas, vermelho nas demais. É anotação
de tela, desenhada depois de `fecharGrupo()`, fora do grupo arte+numeração: não
multiplica sobre a cor nem entra no PDF.

### E o campo "De:" agora mostra a folha
Digitar em "De:" leva a prévia para aquela folha, no set escolhido. O campo virou
conferência: o operador vê a folha antes de mandar refazê-la.

> Toca `engine.py` e `app.py` — **o agente precisa ser publicado junto com o
> site**, senão a estação continua com o motor antigo.

---


## [v527 — 2026-08-11] — O banco de dados dividido entre os modelos do pedido

### O problema
Um mesmo CSV serve a mais de um modelo dentro do mesmo pedido: o mapa do teatro
vira um modelo por setor. Como o CSV morava na numeração e cada modelo aponta para
uma numeração, o único caminho era duplicar a numeração por modelo — três cópias
do mesmo banco, três correções a cada erro de digitação, três re-uploads quando o
cliente manda o arquivo corrigido. E, o pior, **nada garantia que as fatias
fechassem**: dava para imprimir o assento A-01 em dois modelos, ou esquecer um
bloco inteiro, e só descobrir com o material na mão.

### Onde a fatia passou a morar
O banco continua uma vez só na numeração. O que muda por modelo é a fatia,
guardada em `pedidos_modelos.csv_selecao` (migração em
`sql/alter_pedidos_modelos_csv_selecao.sql`, já rodada em produção):

```json
{ "tipo": "linhas", "ids": ["1-400", "612", "700-712"] }
```

**Modelo sem `csv_selecao` imprime o banco inteiro** — o comportamento de todo
pedido anterior. A migração é aditiva e não converteu nada.

Para a seleção sobreviver a uma edição do CSV, cada linha ganhou `__id`: um
inteiro sequencial gravado dentro dela, nunca reaproveitado, nunca exportado.
Posição não serviria de referência — inserir uma linha no meio faria toda seleção
salva escorregar.

### A tela: distribuir uma vez, não três
O mesmo modal do editor de CSV, num segundo modo, aberto por uma faixa no topo da
fila do pedido — que só aparece quando dois ou mais modelos dividem a mesma
numeração com CSV. Coluna **Modelo** com bolinha colorida, barra **"Atribuir a"**
com um botão por modelo, e a caixa de marcar virando seleção do momento.

Três decisões que fazem isso funcionar:

- **A busca e o filtro viram a ferramenta de atribuição.** Filtra `Setor =
  Camarote`, clica em "Visíveis", clica no modelo: três cliques resolvem 340
  linhas — o poder de uma regra por coluna sem precisar salvar regra nenhuma.
- **A atribuição é exclusiva.** Dar uma linha a um modelo tira dela o dono
  anterior, e a tela avisa de quem saiu. Imprimir o mesmo assento em dois modelos
  deixa de ser possível **por construção**, não por aviso.
- **Distribuir não edita dado.** Sem célula, sem coluna nova, sem colar, sem
  importar: trocar o banco no meio daria identidade nova às linhas e nenhum modelo
  as reconheceria. Cancelar/reativar linha continua, porque "esse assento foi
  interditado" é parte do trabalho.

### A cobertura, que é o ganho de verdade
Como a posse é exclusiva, sobra uma pergunta só: ficou alguém sem dono? O rodapé
responde o tempo todo e a faixa do pedido repete a conta. Quando o cliente manda o
CSV corrigido, as linhas novas entram sem dono e **aparecem no aviso** — antes,
simplesmente não seriam impressas por ninguém, em silêncio.

### Impressão
`updateImpSummary()` carrega a fatia do modelo ativo; no caminho `multi_artes`
cada arte recebe a numeração com `csv_data` já reduzido, o que permite os três
modelos saírem numa imposição só. A quantidade da arte passa a ser o tamanho da
fatia **apenas quando o modelo tem `csv_selecao`**, para não mexer em pedidos que
já estão em produção.

O `csv_data` viaja pronto no payload, então **o `engine.py` não mudou e o agente
não precisa ser republicado**.

### Uma correção de rota registrada
A primeira migração proposta foi em `producao_os_itens` — tabela que os arquivos
de `sql/` descrevem mas que o aplicativo abandonou. Os modelos de um pedido vivem
em `pedidos_modelos`. Os arquivos de schema descrevem um desenho que o código
deixou para trás; ao mexer em pedido, confira o `loadOSItens` antes do `sql/`.

### Também nesta versão: montar o banco do zero, sem ter o CSV pronto

#### O problema
O editor de CSV só existia para quem já tinha o arquivo. Numeração sem banco
mostrava apenas "Upload CSV", e não havia caminho nenhum para criar um: era
preciso abrir o Excel, montar, salvar como .csv e subir — para depois editar
dentro do sistema mesmo assim.

(O buraco irmão — banco invisível quando faltava `csv_headers` — saiu antes, na
v526.)

#### O que entrou
Um botão **➕ Criar vazio** na box, visível só quando não há CSV. Ele abre o
modal com zero colunas e zero linhas — e no lugar da grade, um painel com os três
caminhos: **📋 Colar do Excel…**, **⬆ Importar CSV** e **+ Criar coluna**.

**Colar do Excel** ganhou lugar próprio na barra de ferramentas: uma caixa onde
se cola o TSV copiado da planilha, com "A primeira linha é o cabeçalho" marcada
por padrão e a escolha entre substituir tudo e anexar. Depender do Ctrl+V direto
na grade exigia foco no lugar certo e não era descobrível. O Ctrl+V continua
valendo, e numa tabela sem colunas ele promove a primeira linha a cabeçalho.

#### Detalhe que evita numeração fantasma
Aplicar um banco que ficou sem nenhuma linha **limpa** o CSV da numeração em vez
de gravar um array vazio — que a deixaria marcada como "tem CSV" e faria a
Imposição tentar imprimir zero itens.

Só frontend: o `engine.py` não mudou, o agente não precisa ser republicado.

---
## [v525 — 2026-08-11] — Hot Folder: o RIP não via o arquivo que o agente gravava

### O sintoma
O Epson Edge Print não processava o PDF que o agente gravava na pasta observada.
Fechar e reabrir o RIP fazia o mesmo arquivo ser importado sem problema. Um PDF
gerado em outra pasta e arrastado pelo Explorer sempre funcionou.

### O que esses três fatos dizem
A suspeita natural — o RIP lendo o PDF ainda incompleto — é **descartada pelo
segundo fato**: se o arquivo estivesse truncado, reabrir o Edge Print não o
salvaria. O conteúdo estava bom o tempo todo.

Sobra o evento do sistema de arquivos. O Edge Print varre a pasta ao iniciar e,
em regime, depende de uma notificação do Windows. O agente gravava
`<nome>.pdf.tmp` e **renomeava** para `<nome>.pdf` — o Windows anuncia isso como
`FILE_ACTION_RENAMED_NEW_NAME`. Criar um arquivo anuncia `FILE_ACTION_ADDED`. Um
observador que só trate "arquivo criado" — o caso comum, e o padrão de quem usa
`FileSystemWatcher.Created` — **nunca enxerga um arquivo renomeado para dentro da
pasta**.

A ironia: o rename existia justamente para proteger contra leitura parcial, e ao
fazer isso escondia o arquivo do RIP que deveria proteger.

### O conserto
O arquivo passa a ser **criado já com o nome final**, numa única escrita. Do ponto
de vista do sistema de arquivos é exatamente o que o Explorer faz ao copiar — o
único caminho observado como funcional nesta máquina.

Perde-se a atomicidade. Em troca, o arquivo aparece. E a evidência mostra que o
Edge Print lida bem com arquivo ainda crescendo: arrastar um PDF grande pela rede
leva segundos e sempre deu certo.

**Cuidado novo que isso exige:** com o nome final desde o início, uma escrita
interrompida deixaria um PDF truncado com nome de PDF bom, e o RIP importaria
lixo. Qualquer falha no meio agora remove o arquivo da pasta.

### Confirmado em produção
Com o agente **1.2.32** na estação, a impressão direta para o hot folder passou a
funcionar. O método `direto` é o certo para o Epson Edge Print.

Fica uma pergunta em aberto, e vale registrá-la para quem voltar aqui: o operador
relatou que gerar o PDF pelo botão "Impor" e salvar na pasta também funcionava —
e esse caminho é o gerenciador de download do Chrome, que grava
`nome.pdf.crdownload` e **renomeia**, a mesma forma de evento que falhava. Ou
seja, "o RIP ignora renomeação" descreve o que observamos mas não explica esse
caso. O `diagnostico_hotfolder.ps1` responde isso em dois minutos, se um dia
importar saber.

### Escape hatch, porque não dá para testar contra o RIP
`hot_folders.json` aceita `"metodo"` por pasta; trocar exige só reiniciar o
agente, não um release novo:

| Método | Como o arquivo aparece |
|---|---|
| `direto` (padrão) | criado com o nome final, escrita única |
| `exclusivo` | idem, trancado (`dwShareMode=0`) enquanto escreve — quem ler no meio recebe `SHARING_VIOLATION` e repete |
| `rename` | o comportamento antigo; só serve para RIP que trate renomeação |

### Onde
- `hotfolder.py` — `soltar()` reescrita, três gravadores, limpeza do parcial
- `db.py` — `metodo_hot_folder()`
- `app.py` e `agent_worker.py` — passam o método configurado
- `ferramentas/diagnostico_hotfolder.ps1` — larga o mesmo PDF por seis caminhos
  diferentes e relata qual o RIP consome. PowerShell puro, sem Python e sem o
  repositório: roda na estação, pelo operador
- `tests/test_hotfolder.py` — 47 testes, um deles falha se alguém voltar a
  renomear para dentro da pasta

---


## [v524 — 2026-08-11] — Editor de CSV: ver e mexer no banco de dados da numeração

### O problema
Uma numeração pode carregar um CSV cujas colunas viram elementos variáveis, e o
motor consome a linha `N` para imprimir o item `N`. Só que **não havia como ver
esse CSV**. A interface inteira era o botão "Upload CSV" e um rótulo com o nome do
arquivo e a contagem de linhas. Corrigir um assento errado num mapa de 1.240
linhas obrigava a abrir o arquivo fora do sistema, editar e subir de novo — sem
conferência possível. E não havia jeito de tirar uma linha da impressão sem
apagá-la, o que transformava uma reimpressão parcial em recorte de CSV à mão.

### O que entrou
Um modal de tela cheia, aberto pelo botão **📋 Ver / Editar**, que mostra o CSV
como planilha: editar célula, linha e coluna; buscar, filtrar e ordenar;
selecionar quais linhas imprimem; preencher, gerar sequência e
localizar/substituir em massa; colar do Excel; importar e exportar; desfazer e
refazer. A grade é virtualizada — só as linhas visíveis viram DOM, senão um mapa
de teatro trava o navegador.

O código vive em `frontend/csv-editor.js`, separado do `script.js`, e conversa com
o editor de numeração por um contrato estreito, sem enxergar o `state`.

### Linha desmarcada não é linha apagada
Desmarcar a caixinha grava `__ativo: false` dentro da linha: ela some da impressão
e continua guardada. A **ausência** da chave significa ativa, então todo CSV já
salvo continua valendo sem migração.

O motor filtra num ponto só, no construtor de `ImpositionConfig`, o que corrige de
uma vez o total de itens e os seis lugares que indexam `cfg.csv_data`. Se **todas**
as linhas estiverem desmarcadas, ele levanta erro com recado claro em vez de cair
no ramo sequencial e imprimir numeração errada.

**Isto mexe no `engine.py`, que é embutido no `NewProd.exe`** — publicar o site não
fecha a mudança, o agente precisa sair na mesma leva.

### Cuidados que a tela toma
- **Ordenar pelo cabeçalho é só visual.** A ordem das linhas *é* a ordem de
  impressão; reordenar de verdade exige o botão "⇅ Aplicar ordem à impressão", com
  confirmação. A coluna `#` continua mostrando a posição real.
- **Renomear coluna arrasta os elementos junto.** Um elemento `source: "database"`
  aponta para a coluna pelo nome; o painel mostra em âmbar quantos elementos usam
  cada coluna e avisa antes de remover uma em uso.
- **Arrastar linha trava com busca, filtro ou ordenação ativos**, senão o operador
  arrastaria para um lugar diferente do que está vendo.

### O parser de CSV foi trocado
O antigo fazia `split` cru pelo delimitador: quebrava em campo com aspas contendo
vírgula, em campo com quebra de linha, e não tratava BOM. Ninguém via porque
ninguém via o CSV. Entrou um parser RFC 4180 de verdade, usado também pelo upload
do CSV da Imposição.

### Onde está documentado
`docs/editor_de_csv.md` e `docs/superpowers/specs/2026-08-11-editor-csv-design.md`.
Teste: `tests/test_engine_csv_ativo.py`.

---

## [v519 — 2026-08-11] — Hot Folder: enviar o PDF para uma pasta em vez da impressora

### O problema
A Epson SureColor F9470H não recebe trabalho pela fila do Windows. Quem a conduz
é o RIP **Epson Edge Print**, que observa uma pasta, importa o PDF que aparece ali
e aplica a ele o preset associado àquela pasta. O painel só sabia falar com o
spooler, então o operador exportava o PDF à mão e o arrastava para a pasta —
desfazendo justamente o ganho de tempo que faz o agente local existir.

### Como funciona
Uma caixa **HOT FOLDER** no painel "Configuração de Impressão". Ao marcá-la, o
seletor nativo de pasta abre **na estação** e o caminho escolhido fica gravado
junto do resto da configuração daquele produto. A partir daí o material imposto é
gravado na pasta, não enviado à impressora.

Vale nos dois caminhos de envio: no painel local o PDF vai direto ao agente; pelo
relay da nuvem o caminho viaja dentro do `ppd_options`, que já é coluna JSON —
**nenhuma coluna nova no Supabase**.

### As regras que evitam o estrago clássico
- **Gravação atômica.** O arquivo é escrito como `<nome>.pdf.tmp` *dentro da pasta
  de destino* e só então renomeado. Sem isso o RIP importa um PDF pela metade — e
  isso não chega como erro, chega como arte cortada horas depois.
- **Nunca sobrescreve.** Nome repetido vira `(2)`, `(3)`. Sobrescrever poderia
  apagar em silêncio um trabalho que o RIP ainda não leu.
- **Ordem preservada.** O prefixo `00001_`, `00002_` do `nomeParaSpool()` passa a
  servir também à ordem alfabética em que o watcher importa.
- **Só pastas registradas recebem arquivo.** O endpoint que grava um PDF num
  caminho qualquer é uma primitiva de escrita em disco, e o agente aceita origem
  externa por CORS. Entra na lista branca (`hot_folders.json`) apenas o que o
  operador escolheu no seletor ou validou explicitamente. O nome do arquivo é
  reduzido ao último componente, sanitizado e forçado a `.pdf`.

### O que a interface deixa claro
Com a caixa marcada, **bandeja, papel, frente/verso, cor e cópias ficam
desabilitados** — eles vêm do preset da pasta no RIP, e numa impressora de rolo
para sublimação metade desses conceitos nem existe. Sem isso o operador marcaria
"Duplex" no painel, receberia simplex no papel e concluiria que o sistema errou.

**Impressão reversa e Folha a Folha continuam valendo**: são aplicadas ao PDF pelo
navegador antes do envio, então independem do driver. Por isso saíram de dentro
de `#ped-driver-options` para o próprio bloco.

### Confirmação de consumo
O Edge Print importa o arquivo e o remove. Doze segundos depois do envio o painel
pergunta ao agente quais caminhos ainda estão lá; sobrando arquivo, avisa que o
watcher pode não estar rodando. É **aviso, nunca erro** — depois de largar o PDF,
esse é o único sinal barato de que o outro lado está vivo.

### Onde
- `hotfolder.py` (novo) — validação, sanitização, colisão, gravação atômica,
  seletor nativo e conferência. O seletor é `SHBrowseForFolderW` por `ctypes`, e
  não o `filedialog` do tkinter: o tkinter está em `excludes` no `agent_tray.spec`
  e não existe dentro do executável.
- `db.py` — `hot_folders.json`, a lista branca de pastas da estação
- `app.py` — `/api/hotfolder/{escolher,validar,drop,conferir}`
- `agent_worker.py` — `_soltar_no_hot_folder()` e o desvio no `process_queue()`
- `frontend/index.html` e `frontend/script.js` — a caixa, o estado e o envio
- `tests/test_hotfolder.py` — 38 testes

### Decidido de fora
Job ticket XML/JDF foi **descartado**: o Epson Edge Print não aceita job ticket de
terceiros. Ficaram para depois: várias pastas nomeadas por produto (uma por
preset), cópia de segurança em `_enviados/` e intervalo configurável entre
arquivos.

---

## [v518 — 2026-08-11] — Ordem de envio no nome do trabalho no spool

### O problema
A fila do Windows é ordenada por nome, e os nomes que chegavam nela não diziam
nada sobre a ordem. Um lote de capa/miolo/contracapa aparecia em ordem
alfabética, não na ordem em que foi enviado — e `1234_set10_...` vinha antes de
`1234_set2_...`. Pelo relay da nuvem era pior: o título era `Cloud Print Job
3f2a1b9c`, um hash que não identifica material nenhum.

### A regra nova
O trabalho entra no spool como **`{ordem}_{nome do arquivo}.pdf`**. O prefixo tem
5 dígitos, é a ordem de envio (não o número do arquivo) e reinicia em `00001` a
cada lote:

```
00001_1234_set1_01_capa.pdf
00002_1234_set1_02_miolo.pdf
00003_1234_set1_03_contracapa.pdf
```

A referência "Ideal Imposition" saiu do nome. O título do job agora é só o nome
do arquivo — em `app.py`, `local_print_agent.py` e nos padrões do
`print_service.py`.

### Onde
- `nomeParaSpool()` e `nomeObjetoStorage()` em `frontend/script.js` — o prefixo é
  atribuído no envio, que é onde a ordem existe de fato
- os quatro pontos de envio (modal de impressão e `sendPrintJobDirect`, cada um
  no caminho local e no relay) e o fallback do `pedido.js`
- `titulo_do_job()` em `agent_worker.py` tira o nome do último pedaço da URL do
  Storage; job antigo na fila, sem esse nome, continua caindo no hash
- no relay o carimbo de tempo virou **pasta** do lote
  (`{agente}/{lote}/00001_....pdf`), para não sujar o nome que o operador lê

> Exige agente **1.2.27** nas estações: o título pelo relay é montado no agente.
> Até a atualização chegar, o caminho local já sai com a ordem correta.

---

## [v517 — 2026-08-10] — Os quatro filtros de setor não devolviam nada

### O sintoma
Flexo, PVC, Têxtil e Laser: nenhum devolvia linha nenhuma. Também pareciam lentos, "às vezes parando de funcionar".

### A medição
`renderOrdens()` leva **5 ms** e `setFiltroSetor()` **3 ms**. O filtro nunca foi lento — o que parecia lentidão era a lista voltando vazia. Mas a fila estava assim:

```
comSetor: 0     semSetor: 35     produtosGlobais: 64
```

Nenhum item tinha setor, embora todos tivessem `_vibe_id_produto` e a tabela de produtos estivesse carregada. Refazendo o mesmo `find` com tudo em memória, **33 dos 35** resolviam. O join estava certo; rodava cedo demais.

### A corrida

```
itens mapeados  ->  1.501 ms
produtosGlobais ->  3.207 ms
```

Os itens são montados quando as OS chegam, e o setor sai de `produtos.setor_pcp` via `state.produtosGlobais`. As duas cargas são independentes, e o `loadAll` só atribui `produtosGlobais` quando **todas as seis buscas do `Promise.all`** terminam. Na janela entre uma coisa e outra, o `find` não acha nada, o item nasce sem setor — e fica assim, porque ninguém remapeia.

> O log do console engana quem for investigar: `[loadAll] vibeProdutos carregados: 64` é impresso dentro do `.then()` daquele fetch (linha 881), mas a atribuição ao `state` acontece na linha 907, depois do `Promise.all`. O log anuncia a chegada; o `state` só recebe quando a mais lenta das seis buscas terminar.

### Por que só apareceu agora
O defeito é antigo, mas estava mascarado: até a v515, item sem setor virava `'PVC'` por padrão. O sintoma era outro — PVC mostrava tudo, os demais mostravam pouco. Removido o padrão, a corrida ficou exposta e os quatro filtros zeraram.

### A correção
Em vez de tentar ordenar duas cargas assíncronas, o setor passa a ser reparado sempre que for possível:

- `repararSetoresDosItens()` preenche o setor de quem está sem, a partir de um índice `id_produto -> setor_pcp`
- chamado no `loadAll`, logo após `produtosGlobais` ser atribuído
- e no início do `renderOrdens`, como rede de segurança para qualquer outro caminho que carregue pedidos antes dos produtos

É idempotente e só toca em item sem setor, então não desfaz escolha alguma.

### Como foi verificado
Chrome real contra a página de produção, com o `script.js` corrigido injetado:

```
[loadAll] Setor preenchido em 33 item(ns) mapeado(s) antes dos produtos chegarem.

           antes   depois
Flexo        0       2
PVC          0       1
Têxtil       0       1
Laser        0       5
Todos        9       9
```

`renderOrdens` continua em 5 ms e a segunda passada do reparo devolve 0 — idempotente. Os 2 itens que seguem sem setor são produtos sem `setor_pcp` cadastrado, que é o comportamento correto.

### Achado colateral, não corrigido
O `loadAll` roda **duas vezes** no boot — dois `vibeProdutos carregados` e dois `Re-renderizando` no console. É trabalho duplicado e provável parte da lentidão do carregamento inicial. Não foi investigado.

---

## [v516 — 2026-08-10] — Impressoras voltam a aparecer no painel servido pela nuvem

### O sintoma
Abrindo `https://imposicao.vercel.app`, não era possível localizar o driver das impressoras. Na verdade o painel de impressão inteiro estava morto ali — não só as opções de driver.

### A causa, medida no navegador
Não era CORS (o agente já libera a origem) nem o endereço errado. É o **Local Network Access** do Chrome:

```
Access to fetch at 'http://127.0.0.1:9000/api/status' from origin
'https://imposicao.vercel.app' has been blocked by CORS policy:
Permission was denied for this request to access the `loopback` address space.
```

Uma página HTTPS pública não fala mais com o `localhost`, **em endereço nenhum** — testados `127.0.0.1`, `localhost` e o hostname da página. A causa foi confirmada por eliminação: com `--disable-features=LocalNetworkAccessChecks` a mesma chamada devolve `200` e as 10 impressoras. Conceder a permissão programaticamente também não funciona; o Chrome 150 não a reconhece como concedível.

O ponto de quebra era o `descobrirAgentIdLocal()`, que identificava a estação perguntando ao `127.0.0.1:9000/api/status`. Sem identificar o agente, `_activeAgentData` ficava nulo e tudo desabava a partir dali.

Havia também um bug real, mas secundário: em três lugares o endereço do agente era montado com `window.location.hostname`, que na nuvem virava `http://imposicao.vercel.app:9000` — endereço inexistente. Corrigido para `127.0.0.1`, mas isso sozinho não resolveria nada.

### A saída
O agente **já publica tudo** no heartbeat: impressoras, capacidades do driver, IP e versão. Faltava saber qual agente é o da estação sem chamar o localhost. Agora o operador escolhe uma vez, e a escolha fica no navegador.

- a escolha salva tem prioridade; a auto-detecção continua na frente quando funciona, para quem abre pelo `localhost` não precisar escolher nada
- estação escolhida que para de dar sinal tem a escolha descartada sozinha, em vez de deixar o operador preso nela
- botão **Escolher estação** quando não há agente, e um **trocar** discreto quando há
- a lista de impressoras passa a vir da nuvem primeiro; o localhost virou último recurso

### Renomear a estação
Os nomes vinham do hostname (`DESKTOP-5N8AF7D`, `LAPTOP-9BSK81S0`) e não diziam nada a quem precisa escolher. Cada operador pode renomear a sua pelo ✏️ na lista.

O apelido **não** pode ir na coluna `name`: o heartbeat faz upsert dela a cada ciclo com o hostname, e a edição sumiria em segundos sem erro aparecer. Vai em `print_agents.apelido`, que o agente nunca escreve — ver `alter_print_agents_apelido.sql`.

> **Enquanto o SQL não for executado**, a renomeação vale no localStorage de quem renomeou. Depois de executado, passa a ser vista por todas as estações. Nenhum estado quebrado no meio do caminho.

### Como foi verificado
Chrome de verdade (via Puppeteer) contra a página real da Vercel, com o `script.js` corrigido injetado por interceptação:

| | sem estação escolhida | com estação escolhida |
|---|---|---|
| agente ativo | não (correto) | sim — `PC-JR-HOME` |
| impressoras | 0 | **10** |
| driver | — | **10 impressoras com bandejas, papéis e duplex** |

E a renomeação com a coluna ainda ausente: não lança erro, o apelido passa a ser exibido na lista e o hostname original é preservado.

---

## [v515 — 2026-08-10] — Produto sem setor deixa de cair em PVC

### O que acontecia
Os filtros de setor do Painel de Produção (Flexo, PVC, Têxtil, Laser) já funcionavam pela regra certa: `item.setor` vem de `produtos.setor_pcp`, resolvido pelo `id_produto`, e o teste é um `.some()` sobre os itens — basta **um** produto do pedido pertencer ao setor para ele aparecer ali. Um pedido com produtos de dois setores aparece nos dois filtros ao mesmo tempo, como deve.

O defeito estava no valor padrão. Em três pontos o código fazia:

```js
let setor = prodObj && prodObj.setor_pcp ? prodObj.setor_pcp : 'PVC';
```

Produto sem `setor_pcp` cadastrado **virava PVC em silêncio** — uma invenção do código, não o que a coluna diz.

### O tamanho do problema

Consulta ao Supabase em 2026-08-10: `setor_pcp` está vazio em **49 dos 64 produtos**.

| valor | produtos |
|---|---|
| *(vazio)* | 49 |
| LASER | 8 |
| TEXTIL | 3 |
| FLEXO | 3 |
| PVC | 1 |

Na fila de produção do dia, 5 dos 6 pedidos eram LASER (Triband, ColorBand, MOBI) e um era Cordão 30mm, sem setor cadastrado — que aparecia sob **PVC**, para um operador que não tem nada a ver com ele.

### A correção
Nos três pontos, o padrão passou de `'PVC'` para `''`. Sem `setor_pcp`, sem setor: o pedido aparece apenas em "Todos os Setores". Quem manda é a coluna da tabela.

### O que isso expõe
O pedido do Cordão some dos quatro botões. É a regra aplicada corretamente, mas o problema de dado deixou de ser mascarado e passou a ser **ausência** — mais silenciosa que um alerta. Conforme entrarem pedidos com os outros 48 produtos sem setor, o mesmo vai acontecer. A correção de verdade é preencher `setor_pcp` na tabela `produtos`.

Vale para a Lista de Arte também: o `filtroSetorArte` usa o mesmo `item.setor`.

### Como foi verificado
Nove casos sobre os dados reais da fila, incluindo um pedido sintético com produtos de dois setores para confirmar que ele aparece nos dois filtros. Depois da mudança: Laser mostra os 5, PVC fica vazio, o Cordão só aparece em Todos. Não foi verificado na tela.

---

## [v513 — 2026-08-10] — O cache passou a valer: 1,8 MB que deixam de ser baixados

### O que faltava
A regra de cache foi escrita na v510, mas **não teve efeito** até aqui. Foram três publicações sem mudança nenhuma no cabeçalho, e o motivo eram duas coisas que só o erro ensinou:

1. **O arquivo que vale é o `frontend/vercel.json`, não o da raiz.** O `publicar.ps1` roda `vercel --prod` de dentro de `frontend/`, então é a configuração daquela pasta que a Vercel lê. Existem os dois arquivos no repositório; o da raiz é ignorado.
2. **Quando mais de uma regra casa, vale a última.** A regra geral estava depois das específicas e as sobrescrevia — sem erro nenhum, apenas sem efeito. Invertida a ordem, funcionou.

O deploy de prévia não serviu para testar: prévia da Vercel fica atrás da proteção de acesso e responde 302 para o SSO, então o cabeçalho que volta é o da tela de login, não o do arquivo.

### O resultado, medido em produção
| | arquivos JS/CSS | da rede | tempo |
|---|---|---|---|
| 1º carregamento | 7 | **1.806 KB** | 3.050 ms |
| 2º carregamento | 7 (todos do cache) | **0 KB** | 1.487 ms |

Antes, os dois carregamentos baixavam os 1,8 MB. Agora o segundo não baixa nada e leva **metade do tempo**.

Cabeçalhos conferidos um a um em produção: `script.js`, `style.css` e `pedido.js` com `public, max-age=3600`; a raiz e o `app/index.html` seguem `no-cache, no-store, must-revalidate`, que é o que garante que uma publicação nova chegue na hora.

---

---

## [v510 — 2026-08-10] *(a publicar)* — O site parava de rebaixar 1,6 MB a cada carregamento

### O que estava acontecendo
Relato de que a janela tinha ficado mais lenta depois da v509. **Medido lado a lado, não tinha:** v509 em 386 ms de média contra 527 ms da v508, com as mesmas contagens de etapa, e a função de limpeza da v509 rodando **zero vezes** no caminho de carregamento — ela só é chamada quando não há arte.

Mas a medição levou ao motivo real de o carregamento ser lento, e ele não é de agora: o `vercel.json` mandava `no-cache, no-store, must-revalidate` para **todo** arquivo do site. O `script.js` sozinho tem **1,07 MB**; com `pedido.js`, `cliente.js`, `criador-arte.js` e `style.css`, são **~1,6 MB baixados de novo a cada carregamento de página**, para sempre.

Esse cabeçalho entrou em 01/07/2026 ("force Vercel cache bypass"). O sistema **já usava `?v=NNN` nos assets desde 10/06** — dois mecanismos para o mesmo problema, e a marreta ficou por cima do bisturi.

### O que mudou
Duas regras, com padrões disjuntos para não haver disputa de precedência:

- **HTML e tudo que não é `.js`/`.css`** continua `no-store`. O `index.html` não tem versão na URL; cacheá-lo faria uma publicação nova não chegar ao operador — que foi exatamente o problema de julho.
- **`.js` e `.css`** passam a `public, max-age=3600`. Eles carregam `?v=NNN`, e o `publicar.ps1` bumpa esse número em toda publicação: URL nova, arquivo novo, na hora.

O teto é **1 hora, e não um ano, de propósito**: nem todo `.js` local é versionado — `supabase-config.js` e `pdf-lib.min.js` entram sem `?v=`. Com uma hora, uma mudança neles se corrige sozinha; com um ano, ficaria presa no navegador do operador. O `supabase-config.js` guarda a URL e a chave pública do Supabase.

O raciocínio ficou escrito no `docs/PUBLICAR.md`, junto com as três coisas que não se pode quebrar — senão o próximo a olhar volta a pôr `no-store` em tudo.

---

---

## [v509 — 2026-08-10] *(a publicar)* — Excluir a arte no modo PDF: a pergunta que sumia e o desenho que ficava

### O sintoma
Na janela combinada do pedido em arte, com o modelo em **modo PDF**, ao excluir a arte não aparecia a pergunta de confirmação e a visualização continuava na tela.

São dois defeitos distintos, com causas independentes.

### 1. A visualização não saía da tela
Reproduzido e medido. O ramo de modo PDF do `drawAmostraFace()` faz `canvas.style.display = 'none'` — mas esse `canvas` é o **tradicional** (`#amostra-item-canvas-N`). O modo PDF desenha em **outro elemento**, o `#amostra-pdf-canvas-N`, e ninguém o escondia.

Resultado: depois de excluir, o estado vazio aparecia ("Faça upload de um PDF") **e a página do PDF excluído continuava desenhada logo acima**. Para quem olha, a exclusão não funcionou — embora o registro já estivesse limpo no banco.

Entrou `limparVisualizadorPdf(idx)`, que esconde o canvas, **zera o bitmap** (`width`/`height` para 1 — é o que solta a memória e garante que nenhum pixel da arte anterior sobreviva se o canvas voltar a aparecer antes da próxima renderização) e recolhe o navegador de páginas. O mesmo trecho foi espelhado no `cliente.js`.

### 2. A pergunta de confirmação podia sumir
Não reproduziu em teste — com clique de mouse real na tela visível, o `confirm()` aparece e o fluxo roda inteiro. A explicação que sobra é o próprio navegador: depois de algumas caixas seguidas, o Chrome oferece **"Impedir que esta página crie caixas de diálogo adicionais"**. Marcada — inclusive sem querer, num dia de muitos testes —, toda chamada a `confirm()` passa a devolver `false` **sem mostrar nada**.

Numa ação de apagar, isso vira o pior tipo de botão: o que não faz nada e não explica. O operador clica, não aparece pergunta, e a arte continua lá.

A confirmação desta ação passou a ser desenhada na própria página (`confirmarNaTela()`), então não há como o navegador suprimi-la. Três decisões deliberadas:

- **O foco nasce no Cancelar**, e o Enter mantém o comportamento nativo de acionar o botão em foco. Interceptar o Enter para confirmar transformaria um toque distraído em arte apagada.
- **Clicar fora cancela**, nunca confirma.
- **Esc cancela.**

Os outros 15 `confirm()` do sistema continuam como estavam. Este é o que apaga trabalho e foi o que apareceu; trocar todos de uma vez seria mexer em quinze fluxos sem sintoma relatado.

### Como foi verificado
Com o navegador dirigido por Puppeteer, montando um item em modo PDF com um PDF real e clicando com o mouse de verdade:

| | |
|---|---|
| Antes de excluir | canvas visível, com pixels, navegador de páginas à mostra |
| Ao clicar em Remover | a caixa da página aparece; **nenhum diálogo nativo** é criado |
| Cancelando | arte intacta, visualização intacta |
| Confirmando | `arte_url` nula, canvas escondido e **sem bitmap**, navegador recolhido, estado vazio de volta |

Regressões dos elementos SVG/PDF no modo PDF (v497) e da fusão de camadas (v496) repetidas sem quebra.

---

## [v508 — 2026-08-10] — O checkbox 🎨 AMOSTRA passa a mostrar os elementos de Layout

### O que mudou
Na prévia de imposição do **Painel de Produção** (view Pedido), o checkbox **🎨 AMOSTRA** agora também revela os elementos de numeração marcados como **Layout** — os que a v506 introduziu.

| Checkbox | O que a prévia mostra |
|---|---|
| desmarcado | o que vai sair na impressão — elemento de Layout **fica de fora** |
| marcado | a peça acabada — camada base da Cor por baixo **e** os elementos de Layout |

### Por que isso é coerente, e não uma exceção à regra da v506
A regra da v506 não é "elemento de Layout nunca aparece": é **cada tela mostra o que ela promete**. O 🎨 AMOSTRA existe justamente para trocar a promessa daquela janela — o próprio `title` do checkbox já dizia *"Adicionar a camada base da COR (Amostra) à visualização da imposição (Apenas visualização, NUNCA é impressa)"*. Marcado, a prévia deixa de ser a folha da impressora e passa a ser a peça pronta; é exatamente onde o elemento de Layout deve aparecer.

Nada do que é impresso muda. O checkbox é só de visualização: o payload enviado ao motor continua sem os elementos de Layout **nos dois estados**, e isso está coberto por asserção no teste.

### O cuidado que isso exigiu
O checkbox mora no `index.html`, ou seja, no **mesmo documento** que a view Imposição. Se a prévia de lá também lesse o `#ped-preview-toggle-amostra`, quem marcasse o checkbox no Painel de Produção e depois fosse para a Imposição veria elementos de Layout numa tela onde esse controle não existe nem é visível — voltando ao problema que a v506 resolveu. Por isso a leitura ficou **só** no `pedido.js`; a `drawVdpElements` do `script.js` continua estrita.

### Como foi verificado
Sete asserções na prévia real do Painel de Produção, com o app rodando e uma numeração de dois elementos PDF (um Impressão à esquerda, um Layout à direita):

| Estado | Tinta à esquerda | Tinta à direita |
|---|---|---|
| AMOSTRA desmarcado | 6.998 | **598** (só bordas e marcas) |
| AMOSTRA marcado | 6.998 | **6.998** |
| controle, os dois em Impressão | 6.998 | 6.998 |

Com o checkbox marcado, a metade direita fica idêntica ao controle — o elemento de Layout aparece inteiro. A metade esquerda não muda em nenhum dos três casos, então o checkbox não mexe no elemento de impressão.

E a asserção que fecha o vazamento: com o 🎨 AMOSTRA **marcado**, a prévia da view Imposição continua com 2.878 de tinta à direita contra 150.334 do controle — ou seja, lá o elemento de Layout segue escondido.

A bateria da v506 e a da v507 foram reexecutadas por inteiro, todas passando.

---

## [v507 — 2026-08-10] — Link do cliente: a página 1 do PDF multipáginas abria desconfigurada

### O sintoma
Ao abrir o link de aprovação de um pedido com item em **modo PDF (multipáginas)**, a visualização vinha errada — a página saía em torno de metade do tamanho, encolhida no quadrante superior esquerdo e espelhada, com o resto do canvas em branco. Bastava navegar para outra página e voltar à 1 para tudo se recompor.

### A causa
`renderAmostrasOSItens()` do `cliente.js` agendava **dois** temporizadores que inicializavam o mesmo viewer:

| Quando | Caminho |
|---|---|
| 50 ms | `renderItemAmostraCombinada` → `drawAmostraFace` → ramo modo PDF → `initPdfViewer` |
| 200 ms | um segundo laço, **sem guarda nenhuma**, chamando `initPdfViewer` direto |

O segundo laço era redundante desde sempre: a condição do primeiro já inclui `item.modo_pdf`. Os dois baixavam o PDF e chamavam `renderPdfViewerPage(idx, 1)` sobre o **mesmo canvas**.

`renderPdfViewerPage` começa reatribuindo `canvas.width`/`height` — o que zera o canvas **e a transformação** que o pdf.js tinha aplicado ao contexto. Fazendo isso no meio do desenho do outro, o pdf.js levantava `Cannot use the same canvas during multiple render() operations`, o `catch` engolia num `console.error` que ninguém lê, e sobrava no canvas o resultado meio-desenhado com a matriz errada — daí a escala pela metade e o espelhamento.

Navegar de página chama um `renderPdfViewerPage` sozinho, sem concorrência: por isso voltar à página 1 consertava.

O painel interno (`script.js`) **nunca teve** esse segundo laço — o problema era exclusivo do link do cliente.

### O conserto, em duas camadas
1. **A raiz**: o laço duplicado dos 200 ms saiu. O `drawAmostraFace` já cobre todo item em modo PDF, e é assim que o painel interno sempre funcionou.
2. **A barreira**: `renderPdfViewerPage` agora enfileira os desenhos por item, um de cada vez. A fila vive num mapa próprio, **fora** do `pdfViewerState` — de propósito: o `initPdfViewer` substitui `pdfViewerState[idx]` por um objeto novo, e uma fila guardada lá dentro não serializaria justamente as duas chamadas que se atropelam.

### Como foi verificado
Reproduzido primeiro, com o app rodando e o PDF servido com atraso de rede controlado. A trilha instrumentada mostrou `initPdfViewer` entrando **2×** para o mesmo item (t=62 ms e t=216 ms) e dois `renderPdfViewerPage` **simultâneos**, com o erro do pdf.js no console. A imagem do canvas ao abrir ficou salva ao lado da imagem depois de navegar: a primeira, espelhada e em metade da escala; a segunda, correta.

A corrupção é intermitente — depende de como os dois downloads se intercalam. Por isso o teste roda com quatro atrasos de rede (100, 250, 400 e 700 ms) e afirma quatro coisas em cada um: uma única inicialização, nenhum desenho sobreposto, nenhum erro do pdf.js, e o canvas ao abrir **idêntico pixel a pixel** ao canvas depois de navegar e voltar. Antes: falhava. Depois: passa nos quatro.

A fila foi testada à parte, disparando duas inicializações concorrentes de propósito. Com o conserto: nenhum erro. Sem o conserto, o mesmo teste acusa dois erros `same canvas` — a barreira protege algo real.

---

## [v506 — 2026-08-10] — Finalidade do elemento PDF/SVG: Layout ou Impressão

### O que mudou
Todo elemento de numeração do tipo **PDF** ou **SVG** ganhou, na sua configuração dentro do editor da Lista de Numerações, um seletor **Finalidade** com duas opções:

| Opção | Comportamento |
|---|---|
| **Impressão** (padrão) | Visualizado e impresso, exatamente como antes. |
| **Layout** | Só visualização: aparece nas janelas de arte, mas **não é impresso, não entra em PDF gerado e não aparece na prévia de imposição**. |

O elemento nasce em Impressão, e elemento gravado antes desta versão — que não tem o campo — também é Impressão. Nada do acervo muda de comportamento.

A separação que decide cada tela é **quem promete o quê**:

| Tela | Elemento de Layout | Por quê |
|---|---|---|
| Canvas do editor de numeração | **aparece**, com borda tracejada âmbar e o selo `LAYOUT` | é onde se posiciona o elemento |
| Janela de arte do pedido, modo PDF, link do cliente, Criador de Arte | **aparece** | são janelas de visualização: mostram como a peça vai ficar |
| **Prévia de imposição** (view Imposição e painel de Pedido) | **não aparece** | essa janela reflete sempre o comportamento esperado na impressão |
| PDF Gabarito | **não aparece** | é um PDF de produção |
| PDF gerado pelo motor / impressão | **não aparece** | — |

O campo novo é `render_mode` no JSON do elemento, com valor `"print"` ou `"layout"`. Como vive dentro de `elements`, não houve mudança de esquema no banco, e duplicar uma numeração já o carrega junto.

### As duas barreiras, de propósito
O `engine.py` descarta o elemento de Layout nos **três** pontos em que ingere elementos (as duas cargas do `ImpositionConfig` e o `parse_elements` do `process`), mais uma guarda final no `_render_element` para qualquer caminho novo.

O frontend **também** o retira do payload antes de enviar, nos dois construtores (`script.js` e `pedido.js`). Não é redundância inútil: o `NewProd.exe` carrega uma **cópia congelada** do `engine.py`, então uma estação com agente antigo imprimiria o que a tela prometeu que não seria impresso. Filtrar na origem fecha essa janela sem depender de republicar o agente.

O fundo vetorial do PDF Gabarito passou a procurar o primeiro elemento PDF **de impressão**, em vez de ler a coluna `pdf_content` da numeração primeiro. A coluna é apenas derivada do primeiro elemento PDF ao salvar; o arquivo é do elemento, e é lá que dá para saber a finalidade. A coluna continua como fallback para os registros legados, sem elemento PDF.

### De quebra
O selo do card de todo elemento **PDF** exibia `undefined`: o mapa `typeLabel` de `renderElementsList()` tinha entrada para `SVG` mas não para `PDF` (o `typeBadge` ao lado já tinha). Agora mostra `📄 PDF`.

### Como foi verificado
**No motor**, impondo de verdade: uma folha de 100×50 mm com dois elementos PDF idênticos (um quadrado preto de 20 mm), o da esquerda em Impressão e o da direita em Layout. O PDF gerado tem **6.241 pixels escuros à esquerda e 0 à direita**. Controle com os dois em Impressão: 6.241 e 6.320 — ou seja, o teste mede mesmo o que promete.

**No navegador**, contra o app rodando: 18 asserções, todas passando. As que importam — o editor desenha os dois; a janela de visualização desenha os dois; a prévia de imposição perde 147.456 pixels na metade direita quando o elemento vira Layout, enquanto a metade esquerda não muda um pixel; o gabarito rasterizado sai com 25.600 pixels à esquerda e 0 à direita, e 25.600 dos dois lados no controle.

---

## [v505 — 2026-08-10] — Prazo Entrega em badge colorido, no fim da lista

### O que mudou
No Painel de Produção, a coluna **Prazo Entrega** deixa de ser texto e passa a um badge colorido com a data em `dd/MM`. Também foi movida para o **fim** da lista:

```
Nº Pedido · Cliente/Evento · Progresso · Preview · Itens · Quantidade · Frete · Status · Prazo Entrega
```

### As cores

| Cor | Regra | Equivale ao botão |
|---|---|---|
| 🔴 `#ef4444` | data **e hora** anteriores ao momento atual | Atrasados |
| 🟠 `#f97316` | entrega hoje, ainda não vencida | Para Hoje |
| 🔵 `#2f9fe8` | data futura | — |

`formatPrazoBadge` reaproveita `pedidoEstaAtrasado` e `pedidoEhParaHoje`, as mesmas funções que alimentam os botões de filtro. Não é economia de código: é a garantia de que a cor da linha nunca discorde do filtro selecionado — tudo que está vermelho aparece em "Atrasados", tudo que está laranja aparece em "Para Hoje". Pedido sem prazo, ou com prazo inválido, mostra `--`.

A regra ser por **hora** e não por dia veio da referência visual do pedido, que trazia dois badges com a mesma data `10/08`, um vermelho e outro laranja — só a hora separa os dois casos. Data e hora completas ficam no `title`.

`formatPrazoDestaque` continua no arquivo, agora sem uso.

### Seletor de setor

No `index.html`, o botão "Impressão" (`setFiltroSetor('IMPRESSAO')`, ícone de impressora) virou "Laser" (`setFiltroSetor('LASER')`, ícone de sol). Trocado **o valor junto com o rótulo** — mudar só o texto deixaria um botão escrito "Laser" filtrando pelo setor `IMPRESSAO`. Alinha com o `producao.html`, que já tinha esse botão como Laser.

> Se os itens estiverem cadastrados com setor `IMPRESSAO` em vez de `LASER`, o botão passa a não filtrar nada. Vale conferir num pedido de laser.

### Como foi verificado
Nove casos de data cobrindo a cor e o formato (hoje com hora vencida, hoje ainda por vir, ontem, amanhã, semana seguinte, sem prazo, prazo inválido) — todos com o resultado esperado. Conferida a correspondência de 9 cabeçalhos para 9 células, na ordem nova. Não foi verificado na tela.

---

## [v503 — 2026-08-10] — A primeira pose ficava sem numeração por causa de um trabalho anterior

### A causa
O aviso que a v502 acrescentou entregou o caso na primeira ocorrência: gabarito com 2 elementos, 3 poses desenharam, 1 não, regra `pdf_multiple`.

A prévia do painel de produção decidia usar o modo **multi-artes** assim:

```js
const artesList = isMultiSelected ? tempMultiArtes : state.impMultiArtes;
if (schema === "multi_artes" || (artesList && artesList.length > 0)) { ... }
```

A segunda condição é o defeito. A `state.impMultiArtes` é preenchida pelo painel de Multi-Artes e **nunca é limpa** — não há um único ponto no projeto que a esvazie. Bastava o operador ter usado multi-artes antes, na mesma sessão, para que o trabalho seguinte — de qualquer esquema — herdasse a lista.

A partir daí, as poses cujo índice caísse na faixa de quantidade da primeira arte passavam a buscar a numeração **da arte** (`num1_id`), que já não existe, e desenhavam **nenhum elemento**. Como essa faixa começa no índice 0, era sempre a **primeira pose da folha**.

O papel saía certo porque o payload do motor só leva `multi_artes` quando o esquema é multi-artes. Divergência de tela contra papel — de novo, e de novo pela mesma raiz: duas fontes de verdade para a mesma decisão.

A prévia da view de Imposição (`script.js`) sempre usou o gate correto, `if (schema === "multi_artes")`. Era o `pedido.js` que estava fora de linha.

### O conserto
Uma variável só, resolvida uma vez por desenho: a lista de multi-artes só existe quando o esquema é multi-artes. `isMultiSelected` já força `schema = 'multi_artes'` antes, então a condição cobre os dois casos. Ela alimenta tanto a resolução por pose quanto o `buildStrictAssemblySets`, que tinha a mesma exposição no caminho `cut_stack` + *strict assembly*.

### Como foi verificado
Reproduzido primeiro — o que cinco tentativas anteriores não conseguiram, porque faltava justamente o resíduo de sessão. Com uma lista de multi-artes de uma unidade e regra Pdf Paginado: pose 1 com **0 pixels** de numeração, poses 2, 3 e 4 com ~1.700. Depois do conserto, pose 1 com **1.706** — igual às vizinhas.

Multi-artes de verdade continua intacto, medido com a numeração do modelo em azul e as das artes em vermelho e verde: as poses usam a cor **da arte**, e nenhuma cai na do modelo.

Regressões das v496 a v502 repetidas sem quebra.

---

---

## [v502 — 2026-08-10] — A prévia denuncia a pose que ficou sem numeração

### Por que existe
Foi relatado que, numa folha de quatro poses, **só a primeira** aparecia sem a numeração do modelo — sem o QR e sem as guias do gabarito —, enquanto o PDF gerado saía correto. Confirmado que é defeito de tela, não de papel: o primeiro ingresso do PDF impresso tem tudo.

Cinco reproduções foram tentadas e **nenhuma falhou**: folha 1×8 com texto; 2×2 com texto e QR; 2×2 com gabarito SVG, texto e QR; o caminho passando pelo `updatePedSummary()`, que é quem carrega o gabarito; e a navegação indo até a folha 2 e voltando. A leitura do código também não encontrou nenhuma condição que trate o primeiro item de forma diferente — nem no cálculo do valor sequencial, nem nos filtros de face, nem no laço de elementos.

Quando um defeito só aparece com os dados de quem usa, o caminho não é adivinhar: é fazer o desenho contar o que fez.

### O que passou a existir
A prévia agora conta, **por pose**, quantos elementos de numeração realmente pintou. Se algumas poses pintaram e outras não, ela emite um aviso no console com o que permite entender o caso sem reproduzi-lo: quais poses ficaram sem, o índice e a página de cada uma, a regra de paginação, a folha, a face, o id da numeração e quantos elementos o gabarito tem.

O aviso é para a **assimetria**, não para a ausência: uma folha inteira sem numeração é configuração (gabarito vazio, elementos só do verso), não defeito, e não gera ruído. Verificado que não dispara em nenhum dos dois casos legítimos.

Isso não conserta o sintoma — conserta a cegueira. A próxima ocorrência diz onde olhar.

---

---

## [v501 — 2026-08-10] — O rótulo de página encolhe para um terço

### O ajuste
O rótulo `p. N` que a v498 pôs em cada pose ficou grande demais: ele é referência de conferência, não conteúdo da folha, e competia visualmente com a arte. O tamanho caiu para **um terço** — o fator sobre a altura da célula foi de `0,13` para `0,043`.

Nas escalas em que a prévia realmente é usada: uma célula de 150 px de altura tinha rótulo de 20 px e passa a ter 6 px; uma de 220 px vai de 29 px para 9 px. O piso subsiste em 5 px, porque abaixo disso o rótulo deixa de ser legível — é o que acontece em folhas com muitas poses pequenas, onde o tamanho anterior também já estava no piso.

---

## [v500 — 2026-08-10] — O upload da imposição para de passar pela Vercel

### A causa, agora identificada
A mensagem clara que a v499 destravou entregou o culpado na primeira ocorrência:

> Erro 413: o arquivo enviado é grande demais para o servidor (Request Entity Too Large **FUNCTION_PAYLOAD_TOO_LARGE** gru1::…)

`FUNCTION_PAYLOAD_TOO_LARGE` e `gru1` são da **Vercel**, não do motor. As chamadas de API do site passam por `/api/*`, que o `vercel.json` reescreve para o Render — ótimo para tudo, menos para esta requisição, que carrega o PDF da arte e, num modelo em modo PDF com centenas de páginas, chega a centenas de MB. O intermediário recusa antes de o motor ver qualquer coisa.

### O conserto
O upload da imposição passa a ir **direto ao motor**, pulando o intermediário — o destino final era o Render de qualquer forma. O `security_config.ALLOWED_ORIGINS` já libera o domínio do site, e o regex cobre os previews e o localhost, então o CORS responde sem mudança nenhuma no servidor.

O servidor local e o agente **não são afetados**: quando a imposição roda em `localhost` ou `127.0.0.1` não há Vercel no meio, e o endereço é mantido. Só a rota de nuvem muda.

### Como foi verificado
Medido contra a produção, com o mesmo corpo de **150 MB** nos dois caminhos:

| Caminho | Resultado |
|---|---|
| Direto no motor (novo) | **chega** — o motor responde o próprio erro de validação, em JSON |
| Pelo rewrite da Vercel (antigo) | **falha** — `502 ROUTER_EXTERNAL_TARGET_CONNECTION_ERROR`, na mesma região `gru1` do erro relatado |

Antes disso, a escada de tamanhos mostrou que 3, 4, 5, 6, 20, 40 e 60 MB atravessam a Vercel sem problema: o teto não é baixo, é alto — e um modelo em modo PDF passa dele.

A decisão de rota foi verificada nos seis casos que importam: site na nuvem, preview da Vercel, site respondendo como se fosse agente, agente local na 9000, servidor local na 8080 e desenvolvimento. Só os três primeiros são desviados.

Regressões das v496 a v499 repetidas sem quebra.

---

## [v499 — 2026-08-10] — O erro da imposição volta a dizer o que aconteceu

### O sintoma
Ao gerar o PDF, a tela mostrava:

> Erro: Unexpected token 'R', "Request En"... is not valid JSON

Uma mensagem que não diz nada ao operador e esconde a causa de quem for investigar.

### A causa
O tratamento de erro da imposição fazia `await res.json()` direto na resposta. Só que **a resposta de erro nem sempre é JSON**: entre o navegador e o motor há proxy, gateway e CDN, e qualquer um deles responde texto puro — `Request Entity Too Large` — ou uma página HTML de erro. Nesses casos o `res.json()` estoura com um erro de sintaxe, e é esse erro que chega à tela, no lugar da mensagem verdadeira.

Reproduzido no navegador: `new Response('Request Entity Too Large', {status: 413}).json()` produz exatamente `Unexpected token 'R', "Request En"... is not valid JSON`.

### O conserto
`descreverErroHttp()` lê o corpo **uma vez, como texto**, e só então tenta interpretá-lo como JSON. O `detail` do motor continua aparecendo igual; um texto de proxy vira frase legível; HTML é limpo de tags; corpo vazio cai no `statusText`. Para o 413 há orientação prática — gerar em partes menores ou usar o agente local, que não passa pela nuvem.

E, para a próxima vez, ela registra no console a **URL, o status, o content-type e o começo do corpo**. Essa é a pergunta difícil quando o erro acontece na gráfica e não na máquina de quem programa: *qual servidor da cadeia recusou?*

Corrigido nos dois pontos que tinham o mesmo defeito: a imposição do painel de produção (`pedido.js`) e a da view de Imposição (`script.js`).

### O que ainda não sabemos
**Não foi possível reproduzir a recusa em si.** Enviando corpos de 5, 10, 20, 30 e 60 MB para `/api/impose` na nuvem, e de 2 a 120 MB para o agente local, **nenhum dos dois recusou** — todos responderam JSON normalmente. Ou seja, o teto não está em nenhum dos dois servidores nas faixas testadas, e o `Request Entity Too Large` veio de outro ponto da cadeia: um proxy da rede, um antivírus que inspeciona upload, ou um job muito maior que os testados.

O conserto não depende dessa resposta — ele vale para qualquer erro não-JSON. Mas a próxima ocorrência vai dizer no console exatamente quem recusou.

### Como foi verificado
Cinco casos medidos no navegador: 413 em texto puro vira *"Erro 413: o arquivo enviado é grande demais…"*; erro JSON do motor preserva o `detail`; página HTML de gateway vira *"Erro 502: 502 Bad Gateway nginx"*; corpo vazio vira *"Erro 504: Gateway Timeout"*; e o comportamento antigo, reproduzido lado a lado, produz a mensagem exata que o operador viu.

Regressões das v496, v497 e v498 repetidas sem quebra.

---

## [v498 — 2026-08-10] — A janela de imposição passa a paginar o modo PDF

### O problema
Um modelo em **modo PDF** tem, como arte, um arquivo de várias páginas em que cada página é um ingresso diferente. Para imprimir certo, a imposição precisa consumir uma página por pose — a regra "Pdf Paginado". Só que nada ligava uma coisa à outra: o modelo chegava na janela com a regra do formato, quase sempre "Sequencial", e a folha saía com **a página 1 repetida em todas as poses**. Silenciosamente.

Junto veio à tona um defeito maior, que não depende do modo PDF: **a prévia e a impressão liam a regra de paginação de lugares diferentes**. A prévia sobrescrevia com o `default_schema` do formato; o botão que gera lê o campo "Regra de Paginação" e é esse valor que vai ao engine. Quando os dois divergem, a tela mostra uma coisa e o papel sai outra — e isso já acontecia com qualquer item com blocos, cujo formato não fosse Cut & Stack.

O `engine.py` sempre esteve certo e não mudou: página `item_index` na simplex, par `2i`/`2i+1` na duplex. Todo o trabalho foi fazer a tela contar a mesma história.

### O que mudou
1. **Uma fonte de verdade para a regra de paginação.** As duas prévias — a do painel de produção e a da view de Imposição — passam a desenhar a regra do campo, que é a que o engine recebe. A saída continua vindo do formato, que não faz parte desta escolha.
2. **Modo PDF liga "Pdf Paginado" sozinho** ao carregar o modelo, e trava o campo com o motivo à vista: *🔒 Modo PDF: cada página do arquivo é um ingresso*. Para sair, desliga-se o modo PDF na tela de arte, que é onde a decisão pertence. **Modo PDF vence blocos** — um PDF multipáginas não pode ser Cut & Stack da mesma página.
3. **Cada pose mostra sua página** — `p. 12`, ou `p. 11 / 12` em duplex, e `p. 1 (repetida)` quando a página pedida não existe e o engine recua para a primeira. Oito poses de páginas diferentes são visualmente idênticas a oito cópias da mesma; sem o rótulo, não há como perceber que a paginação parou de funcionar. É anotação de tela: desenhada fora do grupo arte+numeração, não multiplica sobre a cor e nunca entra no PDF.
4. **O cabeçalho mostra a conta**: "Folha 1 de 63 · 500 páginas do PDF · 8 por folha". E, quando o arquivo não bate com a quantidade do pedido, um aviso acima da prévia — *⚠️ O PDF tem 500 página(s) e o pedido pede 5000. Vai imprimir 500*. Avisa, não bloqueia: em Pdf Paginado quem manda na quantidade é o arquivo, e reimpressão parcial é caso legítimo.
5. **Teto no cache de páginas rasterizadas** (60 por documento, descartando as mais antigas). Uma folha de N poses rasteriza N páginas; sem teto, um PDF de centenas de páginas acumulava centenas de canvases enquanto o operador navegava.

### Junto: a prévia não deixa mais folha velha na tela
As duas prévias tinham um `if (!fmt || !sai) return;` **silencioso**. Um canvas só muda quando alguém desenha nele, então sair dali sem desenhar deixava **a folha do desenho anterior na tela**, sem nenhum sinal de que ela parou de ser atualizada — e o operador conferia uma folha que já não correspondia ao que estava configurado.

Não é hipotético: apareceu durante a verificação deste trabalho, quando uma recarga de catálogo apagou o formato entre um desenho e outro e a prévia continuou mostrando a face anterior. Também acontece com formato apagado, ou com uma OS aberta antes de o cadastro terminar de carregar.

Agora as duas desenham o aviso — *Não encontrei o formato no cadastro. Recarregue a página e abra o pedido de novo.* — e o selo vira **Sem Formato**.

### Como foi verificado
Teste que falha antes e passa depois: PDF de 8 páginas, cada uma de uma cor sólida, formato de 8 poses, formato em "Sequencial" e campo em "Pdf Paginado". Antes, **1 das 8 cores** aparecia na folha — a página 1, oito vezes. Depois, **as 8**.

Para a folha velha: desenha-se uma folha, apaga-se o formato do cadastro em memória, redesenha-se e compara-se a assinatura de pixels do canvas. Antes ela ficava idêntica — a folha anterior, intacta. Agora muda para o aviso, nas duas telas.

Mais seis verificações: cabeçalho informando as páginas; aviso silencioso quando a quantidade bate e visível quando não bate, citando os dois números; trava aplicando e soltando com a nota; modo PDF vencendo `cut_stack`; teto do cache cortando 75 entradas para 60 e mantendo as mais novas; e o duplex, medido face a face — **frente consome as páginas 1, 3, 5, 7 e o verso 2, 4, 6, 8**, estável em três execuções seguidas.

As seis verificações das v496 e v497 foram repetidas sem regressão: fusão 249,0,0 nos cinco pontos, `drawImageContain` mantendo a proporção 1,89, e os elementos SVG/PDF aparecendo na janela em modo PDF.

O design está em `docs/superpowers/specs/2026-08-10-imposicao-modo-pdf-design.md`.

---

## [v497 — 2026-08-10] — O modo PDF não desenhava elemento SVG nem PDF

### O sintoma
Editando um pedido em arte, com o item em **modo PDF (multipáginas)**, a janela de visualização mostrava todos os elementos da numeração — menos os do tipo **PDF**. Os do tipo **SVG** também sumiam, o que ninguém tinha conferido ainda.

### A causa
Nesse modo a janela **não passa por `drawAmostraFace()`**. Ela renderiza a página do PDF e carimba a numeração por cima com `drawNumeracaoElementsOverCanvas()` — um caminho separado, com uma cópia no `script.js` e outra no `cliente.js`.

Essa função tratava `TEXT`/`FIXED`, os tipos de teatro e camarote, `QR`, `BARCODE` e `PICOTE`, e **não tinha ramo algum para `SVG` nem para `PDF`**. O `forEach` caía fora de todos os `else if`, dava `ctx.restore()` e não pintava nada.

Não era falta de dado: medido com a arte já carregada (`el._pdfCanvas` e `el._svgImage` prontos), os dois tipos desenhavam **zero pixel**, enquanto no mesmo gabarito um `FIXED` desenhava 10.349 e um `BARCODE` 4.118. Faltava só desenhar.

### O conserto
Duas partes, as duas necessárias:

1. O ramo `SVG`/`PDF`, espelhando o de `drawAmostraFace()`: recorte na caixa, `drawImageContain()` — tamanho original, sem distorção — e, sem arte carregada, a caixa com o nome do tipo, o mesmo aviso visual dos outros renderizadores.
2. `await precarregarArtesDosElementos(num.elements)` antes de desenhar, nos dois pontos de chamada. As funções que chamam são `async`, então dá para esperar de verdade e sair certo de primeira, sem carregar e mandar redesenhar depois.

A `cliente.html` não carrega o `script.js`, então o `cliente.js` ganhou uma `precarregarArtesDosElementos()` própria — que também carrega **SVG**, coisa que a `preloadAmostraItemPdfElements()` de lá não fazia. As duas versões passaram a compartilhar o mesmo carregador em vez de duplicá-lo.

Com isso, a conta de renderizadores de elemento SVG/PDF do projeto fecha em **nove**, não nos quatro que a varredura da v489 encontrou. O `docs/fluxo_elementos_pdf_svg.md` lista todos.

### Como foi verificado
Teste que falha antes e passa depois, com quatro elementos de cores distintas no mesmo gabarito e contagem de pixels por cor. Antes: `FIXED` 10.349 · `BARCODE` 4.118 · **PDF 0** · **SVG 0**. Depois, nos dois arquivos, com números idênticos entre eles: `FIXED` 10.349 · `BARCODE` 4.118 · **PDF 27.495** · **SVG 27.378**.

As seis verificações da v496 foram repetidas sem regressão: fusão 249,0,0 nos cinco pontos e o elemento PDF 2:1 continuando em proporção 1,89 na caixa quadrada. Sem erros de console.

---

## [v496 — 2026-08-10] — A numeração cobre a arte; o multiply é do grupo

### Resumo
A regra de fusão das três camadas mudou. Antes cada camada multiplicava em cascata sobre o resultado acumulado: a arte multiplicava sobre a cor, e a numeração multiplicava sobre cor+arte — então a numeração **escurecia** onde caísse em cima de arte escura. Agora a numeração **cobre** a arte com fusão normal, e é o **grupo arte+numeração** que multiplica, uma vez só, sobre a cor do papel.

### Onde a regra vale
Nos cinco lugares que empilham as três camadas, que precisam concordar entre si para a tela não mostrar uma coisa e o papel outra:

| Onde | Arquivo | Como |
|---|---|---|
| Card do pedido / janela combinada | `script.js`, `drawAmostraFace()` | canvas transparente do grupo, composto com `multiply` |
| Link de aprovação do cliente | `cliente.js` | idem, espelhando a função acima |
| Tela de Amostras | `script.js`, `renderAmostraCombinada()` | idem |
| Prévia de imposição | `pedido.js`, `drawPedPreview()` | um grupo por célula, com a mesma matriz e o mesmo clip da folha |
| Criador de Arte | `style.css` + `criador-arte.js` | `#editor-blend-group` com `isolation: isolate` + `mix-blend-mode: multiply` |

No editor a fusão é CSS, não JavaScript, e por isso exigiu um elemento novo. O `mix-blend-mode` ficava no `.canvas-container` do Fabric, onde ele alcança **só a arte** — a numeração, canvas irmão, ficava de fora do grupo. A `#editor-blend-group` envolve as duas: o `isolation: isolate` faz a numeração compor sobre a arte com fusão normal, e o `mix-blend-mode: multiply` faz o resultado já composto multiplicar contra a cor. As duas propriedades só funcionam em par.

Na prévia de imposição, o grupo é um canvas do tamanho da folha que recebe a mesma matriz de transformação e o mesmo clip da célula — a composição final é pixel a pixel, sem reamostragem, para não distorcer a arte. O nome do modelo (multi-artes) passou a ser desenhado dentro do grupo, para continuar por cima da arte como estava antes.

O `engine.py` não muda: o PDF impresso nunca aplicou blend mode: a numeração já era uma camada por cima da arte. O multiply existe só para simular, na tela, a tinta sobre o papel colorido.

### Junto: três renderizadores de elemento SVG/PDF que ainda esticavam
A v489 estabeleceu que elemento SVG e PDF vai em **tamanho original, escala 100%, sem distorção**, e mandou todo renderizador passar pela `drawImageContain()`. A varredura contou quatro renderizadores — e eram sete. Três ficaram esticando desde então, porque estão em arquivos que a busca não alcançou:

- **`pedido.js`** — existem **duas** `drawVdpElements()` no projeto; a v489 corrigiu a de `script.js:7339` e não viu a outra.
- **`cliente.js`** — a `cliente.html` não carrega o `script.js`, então a `drawImageContain()` nem existia ali. Agora há uma cópia declarada no topo do arquivo, com o aviso de que as duas andam juntas.
- **`criador-arte.js`** — a Camada 2 do editor, no elemento do tipo PDF.

Medido na prévia de imposição: um elemento PDF de proporção 2:1 numa caixa quadrada de 20×20 mm agora ocupa 17×9 px na tela (proporção 1,89) em vez dos 17×17 px que o `drawImage` cru produzia.

### Como foi verificado
Com o app rodando e o navegador dirigido por Puppeteer, medindo pixel: papel laranja (249,115,22), arte cinza (128,128,128), tinta da numeração vermelha (255,0,0). A tinta sobre a arte tem de sair **249,0,0** (regra nova) e não 125,0,0 (cascata antiga); o pixel só com arte continua **125,58,11** nos dois casos.

Resultado nos cinco pontos: `drawAmostraFace` 249,0,0 · `cliente.js` 255,0,0 (variante de papel branco) · `renderAmostraCombinada` 249,0,0 · prévia de imposição 249,0,0 · editor 249,0,0 em 11.566 pixels da tela composta. Todos repetidos depois da correção do `drawImageContain`, sem regressão e sem erro de console. Pester 50/50.

---

## [v495 — 2026-08-10] — Escapar dado externo, apagar clientes fictícios e fechar as telas por permissão

> Entrada escrita depois, reconstruída a partir do diff do commit `7659f2c`. O que
> está descrito aqui é o que o código mostra; não houve registro de verificação
> na época.

### 1. Dado de fora do sistema entrava cru no HTML
Nome de cliente, nome de evento, designer, frete, nome de modelo e nome de arquivo vêm do Vibe — sistema parceiro — ou do banco. Não são digitados aqui e não estão sob nosso controle. Eles eram interpolados crus em templates de `innerHTML`, o que significa que **um apóstrofo no nome já quebrava a linha da tabela e um `<` quebrava a tabela inteira**.

Entraram duas funções, com papéis distintos que é importante não confundir:

- **`escapeHtml()`** para texto dentro de uma tag ou de um atributo.
- **`escapeJsAttr()`** para valor que vai parar **dentro de uma string JS** num `onclick`. Ali são duas camadas de parsing — HTML e depois JS — e escapar só uma não resolve. Ela escapa primeiro para a string JS e depois para o HTML, porque o navegador desfaz a camada HTML ao ler o atributo e entrega ao JS exatamente o texto que ele espera.

O escape que existia antes tratava só o apóstrofo, e só para a camada JS: um nome com aspas ou `<` quebrava os selects de designer e de vendedor.

### 2. Clientes e vendedores fictícios apagados
`getFallbackCliente()` e `getFallbackVendedor()` escolhiam um nome de uma lista fixa — "Hospital Metropolitano", "Prefeitura Municipal", "Carlos Souza" — pelo resto da divisão do número do pedido, quando a proposta não trazia o dado. O nome aparecia na Lista de Arte **com a mesma cara de um cliente de verdade**, e não havia como distinguir na tela.

Numa gráfica isso é pior do que campo vazio: alguém pode ligar para o "cliente" errado. As duas funções foram removidas e, sem dado real, a coluna mostra `--`.

O `getFallbackPrazo()` continua, e por um motivo declarado: o prazo de entrega ainda não tem campo real, e o filtro "Para Hoje / Atrasados" do Painel de Produção depende dele. Sai quando o campo verdadeiro existir.

### 3. Esconder o botão do menu nunca trancou a porta
Havia o `PERM_NAV_MAP`, que esconde os botões do menu conforme a permissão. Isso não impedia nada: a `<section>` continua no DOM e `showView()` é chamada de vários pontos do código, não só do menu.

Entrou o `PERM_VIEW_MAP`, que espelha o mapa do menu e associa cada permissão às telas que ela protege, mais um porteiro no `showView()`. Duas decisões de projeto ficaram registradas no código:

- **Enquanto as permissões não carregaram, libera.** Negar durante a inicialização trancaria o usuário para fora da aplicação.
- **Se o acesso for negado e não houver tela aberta** — o caso do F5 restaurando uma tela cujo acesso o usuário perdeu —, manda para a primeira tela permitida, em vez de deixar a aplicação em branco.

> **Isto é defesa em profundidade, não substitui o RLS no banco.** Enquanto as tabelas do Supabase estiverem sem RLS, quem abrir o console do navegador continua alcançando os dados. O RLS está adiado por decisão registrada.

---

## [v494 — 2026-08-10] — Lista de Arte: cor certa no carregamento, KPIs que dizem algo e o render que gravava no banco

> Entrada escrita depois, reconstruída a partir do diff do commit `434d06f`. O que
> está descrito aqui é o que o código mostra; não houve registro de verificação
> na época.

### 1. A função de desenhar a tela gravava no banco
A regra "pedido cujos modelos estão todos prontos passa a Enviar Arte" existia em **duas cópias**: uma no carregamento, lendo `pedidos_modelos`, e outra dentro do `renderOrdens()`, lendo o `state.osItens` que estivesse carregado. As duas já tinham divergido nos status aceitos como "pronto".

A cópia do render era a pior: como `renderOrdens()` é o `oninput` da caixa de busca, **digitar no filtro disparava UPDATE no Supabase**.

Ficou só a do carregamento, agora em `sincronizarPedidosProntosParaEnvio()`. Ela lê do banco, então cobre todos os pedidos da lista e não apenas aqueles cujos itens por acaso já tinham sido abertos na tela. As gravações eram disparadas com `.then(function(){})` e qualquer falha sumia sem rastro; passaram a ser aguardadas com `Promise.allSettled`, e uma gravação que falha aparece no console em vez de o status divergir do banco em silêncio.

### 2. O status adiantado desta máquina não caducava
Quando uma estação muda o status de um pedido, ela guarda o valor novo no `localStorage` para a tela refletir a mudança na hora. É um **adiantamento**, não uma fonte de verdade — mas cada entrada valia para sempre, e o `savedStatus || dbStatus` da leitura fazia o valor local vencer o banco indefinidamente naquela estação.

Numa gráfica com várias estações isso significa: a máquina A grava um status, outra máquina muda o pedido depois, e a máquina A **segue mostrando o valor velho, sem nenhum sinal na tela de que está desatualizada**.

As entradas passaram a ter hora e a caducar em 5 minutos — folga confortável sobre a ida ao banco. Entradas no formato antigo (string pura, sem hora) são tratadas como vencidas e apagadas na leitura. As sete gravações espalhadas pelo `script.js` passaram a usar `gravarStatusOverride()`, e o `cliente.js` grava no mesmo formato `{ status, ts }` — se gravasse sem hora, o `script.js` descartaria.

### 3. A cor do pedido anterior era atribuída ao pedido novo
`resolveItemCorNumIds()` era chamada dentro do `map()` que monta os itens, antes de a lista existir, e lia os selects de amostra que estavam na tela. No carregamento esses selects **ainda são os do pedido anterior** — e a cor errada era atribuída ao pedido novo.

A resolução passou a acontecer depois de a lista estar montada, com um parâmetro explícito que manda **não procurar nos selects da tela**.

### 4. Dois KPIs que não diziam nada
"Pedidos Concluídos" repetia o valor de "Pedidos Aprovados" — dois cartões, o mesmo número, nenhuma informação nova. Passou a contar os pedidos que saíram da arte para a produção, que é o sinal que `liberarParaProducao()` grava, mais os já finalizados.

E a contagem de itens impressos comparava `item.impressao` com `'IMPRESSO'` em caixa alta, enquanto `normalizarStatusImpressao()` entrega `'Impresso'`. A comparação nunca dava certo, e o KPI ficava travado em zero.

### 5. `producao.html` sincronizado com o `index.html`
O Painel de Produção tinha ficado para trás: cartões de estatística sem clique, sem o cartão "TODOS", sem "Em Aprovação", e o título da tabela fixo em "Fila de Arte" mesmo quando o filtro mudava. Recebeu o mesmo conjunto do `index.html`, inclusive o `autocomplete="one-time-code"` na caixa de busca, que impede o navegador de oferecer preenchimento automático num campo que não é de formulário.

---

## [v493 — 2026-08-09] — Conferência de saúde, e o freio de segredo que travava a si mesmo

### Resumo
`ferramentas\conferir.ps1`: seis perguntas, sempre as mesmas, só consultando. Na primeira execução ele encontrou um defeito no freio de segredo criado na v491.

### O que o conferir pergunta
Há commits feitos que ainda não foram publicados? Há trabalho pendente na pasta? O agente está em sincronia entre repositório, manifesto publicado e esta máquina? Há branch ou rascunho acumulando? Há segredo em arquivo versionado? Os testes passam?

Não altera, não publica, não commita — pode rodar a qualquer momento, quantas vezes quiser. Existe para que a vigilância não dependa de alguém lembrar os comandos certos. Termina em **TUDO EM ORDEM** ou na lista do que precisa de atenção.

A checagem do agente consulta o manifesto com um cache-buster (`?t=<carimbo>`): o Storage fica atrás de CDN e, sem isso, responderia a versão anterior e faria a conferência acusar divergência onde não há.

### O defeito que ele achou
Três arquivos do próprio repositório disparavam o detector de `service_role` — o teste que exercita o freio e os dois documentos que explicam a regra, todos com chaves fabricadas. O `publicar.ps1` só varre arquivos **alterados**, então a trava nunca chegou a aparecer; mas qualquer edição nesses três travaria a publicação. Era exatamente o "alarme que sempre toca" que a regra original queria evitar.

A saída é uma declaração explícita: um arquivo que contenha a marca de chave falsa — a constante `MarcaSegredoFalso` em `ferramentas\Publicacao.psm1` — fica dispensado da checagem. É uma porta com placa, não um buraco: quem a usa declara por escrito que a chave é de mentira, e a declaração aparece no diff da revisão. Três testes novos cobrem os dois lados da regra, mais uma regressão que roda o detector contra os arquivos reais do repositório.

O texto exato da marca **não aparece aqui de propósito**. A comparação é por substring, então escrever a marca em qualquer arquivo isenta aquele arquivo — inclusive um changelog que só queria explicá-la. Use a marca apenas em arquivos que de fato precisem conter uma chave fabricada.

### Como foi verificado
578 arquivos versionados varridos, nenhum segredo. Pester 50/50. Agente em sincronia nos três lugares.

---

## [v492 — 2026-08-09] — O teto do agente: perguntado ao bucket, não gravado no script

### Resumo
O `NewProd.exe` passou a não caber no limite de upload do Storage, e a investigação achou tanto a causa do crescimento quanto um erro no jeito de tratar o limite. Junto saiu o agente **1.2.23**, o primeiro a se atualizar sozinho de ponta a ponta.

### O pacote cresceu de uma vez, não aos poucos
A documentação dizia "~47 MB, com 3 MB de folga"; o pacote compilado deu 51,63 MB. Tirar a pasta `ppds/` do executável — 5,19 MB de arquivos — economizou só **0,65 MB**, porque texto comprime quase todo. Foi o primeiro sinal de que a estimativa por tamanho de arquivo não serve: o que importa é o tamanho **comprimido dentro do exe**, medido com o `CArchiveReader` do PyInstaller.

Medindo assim e comparando com o executável publicado da 1.2.22: `lxml` foi de 0,00 para 3,32 MB e o total de 46,54 para 50,74. O culpado é identificável — foi a **imposição de SVG** da v489, que trouxe `svglib`, que traz `lxml`. Não houve crescimento gradual.

> **Não exclua `lxml` do pacote.** Nada no projeto o importa diretamente, então ele parece órfão em qualquer varredura. Ele vem por `svglib`, exigida em `engine.py:14` para impor SVG. Tirá-lo faz o SVG sumir do papel sem erro visível.

### Dois limites, e o menor vence
O bucket dizia 200 MB, mas um upload de 50,98 MB voltava `EntityTooLarge`. São dois limites independentes: o **global do projeto** e o **por bucket**, e o por bucket nunca ultrapassa o global. No plano Free o global era 50 MB, e era ele que barrava.

Com o global elevado para 300 MB, os testes passaram a aceitar 55 MB e 120 MB e a recusar 250 MB — ou seja, o teto efetivo virou os 200 MB do bucket. Com essa folga, a exclusão do `cryptography` (que dava 47,35 MB) foi **desfeita**: economizar 3,4 MB não paga um risco não verificado no TLS.

A lição virou código: o `publicar_agente.ps1` agora **pergunta o limite ao bucket** antes de subir, em vez de carregar um número gravado que envelhece em silêncio.

### O build que falhava deixava versão pela metade
Se a compilação quebrasse no meio, os três arquivos de versão já tinham sido reescritos — e a tentativa seguinte com o mesmo número era recusada. Agora o script guarda os arquivos **byte a byte** antes de tocá-los e um `trap` os devolve em qualquer falha, preservando a presença ou ausência de BOM (restaurar com BOM num `.py` ou `.wxs` que não tinha é um estrago silencioso).

### Achado de arrumação
O bucket `NewProd` não é usado por nada no projeto. O agente publica e lê de `agent-releases`.

---

## [v491 — 2026-08-09] — Publicação segura: freios, ponto de restauração e volta

### Resumo
Publicar era um `git push` seguido de um `vercel --prod`, sem rede de proteção e sem caminho de volta. Passou a ser um comando com quatro freios antes de qualquer escrita, um ponto de restauração por versão publicada e dois caminhos de volta.

### As três peças, e o que anda junto
**Site** (Vercel), **motor** (Render) e **agente** (`NewProd.exe` nas estações). Site e motor saem no mesmo `git push`, porque o Render escuta o mesmo repositório que a Vercel — não existe publicar só um dos dois, e é bom que seja assim, porque eles precisam combinar. O agente é separado, tem numeração própria e sai por outro comando.

### `publicar.ps1` — os quatro freios
Antes do commit, e portanto antes de qualquer coisa ir ao ar: a lista do que vai junto, com aviso em arquivo acima de 1 MB; recusa de rascunho (`scratch_*`, `temp_*`, `test<N>.js` e afins, só na raiz); recusa de segredo; e um teste de que o motor sobe — o freio que evita o pior caso, um erro de digitação derrubar o Render sem ninguém perceber. Se algum falha, o script **para antes do commit**: nada foi ao ar e nada precisa ser desfeito. Ao terminar, grava a tag `vNNN`.

### O freio de segredo procura `service_role`, não "qualquer coisa que pareça chave"
A chave **anônima** do Supabase também é um JWT e está legitimamente versionada em `frontend/supabase-config.js` — o navegador precisa dela, ela é pública por natureza. Um detector por formato barraria toda alteração naquele arquivo. Por isso o freio **decodifica o payload** do JWT e só barra quando o papel é `service_role`, a chave que dá controle total do banco.

### `voltar.ps1` — dois níveis
`-Agora` devolve **só o site** em cerca de 30 segundos, promovendo um deploy anterior na Vercel; é curativo, para quando o cliente está vendo erro neste minuto. Sem parâmetro, desfaz por `git revert` e republica site e motor juntos. Nada é apagado: a volta vira registro novo, então dá para voltar da volta.

**Atenção ao escolher na lista:** cada publicação cria **dois** deploys de produção — um pela integração Git da Vercel, outro pelo `vercel --prod` do script. O item 2 costuma ser o gêmeo do item 1, e a versão anterior de verdade costuma ser o item 3.

### `publicar_agente.ps1` — e a armadilha de voltar o agente
As estações só instalam versão **estritamente maior** que a delas. Republicar o número antigo não faz nada, e não dá erro — cada estação ignora em silêncio, com toda a aparência de ter funcionado. Para voltar o agente, o número precisa ser **novo** com o código antigo: `.\publicar_agente.ps1 1.2.24 -Codigo agente-v1.2.22`.

### Testes e faxina
`ferramentas\Publicacao.psm1` isola as decisões dos freios em funções puras — nenhuma toca git, rede ou disco —, o que permite exercitá-las com Pester sem publicar nada. A raiz do repositório perdeu os rascunhos versionados, e os testes e SQL foram para as suas pastas.

### Documentação
`docs/PUBLICAR.md` passou a ser o documento único de publicação. O `docs/DEPLOY.md`, que ainda ensinava a publicar no Firebase, foi removido; o `DEPLOY.md` da raiz virou um ponteiro.

---

## [v490 — 2026-08-09] — Box "Adicionar Pdf e Svg", arquivo por elemento, e o fim do fantasma

### Resumo
Três pedidos que, no código, eram o mesmo conserto. Os elementos PDF e SVG ganharam uma box própria onde o upload já cria o elemento; passou a ser possível ter vários, cada um com o seu arquivo; o elemento PDF ganhou controle de escala; e o PDF parou de aparecer como fantasma no lugar da Arte de Fundo.

### O que ligava os três
Até a v489 o arquivo era **da numeração**, não do elemento. `state.numPdfContent` e `state.numSvgContent` guardavam um arquivo cada, `addElement('PDF')` copiava desse estado global, e `saveNumeracao()` sobrescrevia o conteúdo de **todos** os elementos com esse arquivo único — a inconsistência E3 de `docs/fluxo_elementos_pdf_svg.md`. Um segundo PDF diferente era impossível de manter: sumia no primeiro save.

O fantasma era a mesma confusão vista de outro ângulo. `state.numPdfImage` servia a dois donos: era a arte do elemento **e** a arte de fundo de referência do canvas. Ao reabrir a numeração, `editNumeracao()` recuperava o `pdf_content` do primeiro elemento PDF, ele virava `numPdfImage`, e o canvas o pintava como fundo a 55% de opacidade.

### O arquivo passou a ser do elemento
Cada elemento PDF/SVG carrega o próprio conteúdo, o próprio nome (`pdf_filename`/`svg_filename`) e o próprio tamanho natural em mm (`natural_w_mm`/`natural_h_mm`, para o botão de 100% funcionar sem reabrir o arquivo). O save sobe o arquivo de cada elemento separadamente, pulando os que já são URL, e não achata mais tudo num arquivo só.

As colunas `svg_content` e `pdf_content` da **numeração** continuam sendo escritas, agora derivadas do primeiro elemento de cada tipo. Não é redundância: `svg_content` da numeração é um marcador de CAMAROTE load-bearing — `engine.py:222` faz `if "CAMAROTE" in str(numeracao.get("svg_content", ""))` para forçar `num_tipo = "CAMAROTE"`, e o mesmo teste aparece em mais três pontos do engine e dois do frontend. Parar de escrever a coluna quebraria a detecção em silêncio.

### A box "Adicionar Pdf e Svg"
Card novo no painel de elementos, com os botões `📄 + PDF` e `🎨 + SVG` — que abrem o seletor de arquivo e já criam o elemento, no tamanho natural — e a lista do que foi adicionado: ícone, nome, tamanho em mm, remover, e clique para selecionar no canvas. Saíram os botões SVG e PDF de "Adicionar Elementos" e os dois campos de upload do topo do editor.

### Escala do elemento PDF
O PDF ganhou o mesmo bloco que o SVG tem desde a v489: Largura e Altura em mm travadas na proporção, o botão `↺ Tamanho original (100%)`, e uma linha mostrando o arquivo e o tamanho original. Antes ele não tinha campo de tamanho nenhum. As funções `updateElDimensaoSvg`/`resetSvgTamanhoOriginal` viraram `updateElDimensaoArte`/`resetArteTamanhoOriginal` e atendem aos dois tipos.

### O fantasma
A arte de fundo passou a ser **só** `state.bgImage`, em três pontos: o canvas do editor, a face verso (que lia `state.numPdfImageVerso`, uma variável que nada no repositório atribuía — já era código morto) e o gerador do `preview_jpg`, onde o fantasma também ficava assado dentro da imagem salva.

Junto saiu a trava de `autoLoadCorBg` — a regra "arte própria vence" da v486 —, que impedia a cor do formato base de carregar quando a numeração tinha PDF ou SVG. Ela fazia sentido enquanto o PDF era o fundo; agora a cor carrega sempre. **Mudança visível:** numerações que usavam o PDF como fundo de referência passam a mostrar a cor do formato base no lugar dele.

### De quebra, o E1
O preview de imposição lia a imagem do SVG de `currentNum._svgImage`, campo que nada preenchia, e por isso **sempre** desenhava o placeholder "SVG" em vez da arte. Agora ele lê `el._svgImage` e carrega sob demanda, no mesmo molde do elemento PDF ao lado.

### Como foi verificado
Puppeteer na porta 9123, adicionando dois PDFs diferentes e um SVG pela box: os três elementos entram com conteúdos distintos e no tamanho real de cada arquivo; a lista da box mostra os três; a escala trava a proporção e o botão de 100% devolve o tamanho original nos dois tipos; o payload do save leva três conteúdos distintos, sem nenhum cache de render, e as colunas da numeração vêm do primeiro elemento de cada tipo; e reabrir reconstrói a arte elemento por elemento.

O teste do fantasma tem controle: além de conferir que o canvas novo não pinta **nenhum** pixel de arte fora do elemento, ele repinta do jeito antigo e confirma que o detector enxergaria o fantasma — 1.007.016 pixels na metade direita da folha. Um detector cego passaria no teste sem provar nada.

No engine, os três elementos foram impostos de verdade e medidos no PDF gerado: 40,13 × 20,15 mm, 30,14 × 30,31 mm e 24,89 × 9,99 mm, contra 40×20, 30×30 e 25×10 esperados.

### Compatibilidade
Numerações existentes abrem sem migração: os elementos já carregam a URL no próprio `pdf_content`/`svg_content` — hoje a mesma para todos, o que continua sendo estado válido. Faltam só `pdf_filename` e `natural_w_mm`; a box mostra o nome derivado da URL e o pré-carregador mede o tamanho natural ao rasterizar. A partir do primeiro save no modelo novo, cada elemento fica com os seus.

---

## [v489 — 2026-08-09] — Elementos PDF e SVG saem no papel, em tamanho original e sem distorção

### Resumo
Correção dos dois bloqueadores levantados na análise de fluxo dos elementos PDF/SVG (`docs/fluxo_elementos_pdf_svg.md`). Elementos SVG voltaram a existir no PDF impresso, e tela e papel passaram a desenhá-los do mesmo jeito: no tamanho natural do arquivo, escala 100%, sem esticar.

### B1 — o SVG aparecia na tela e não saía no papel
`svglib` e `reportlab` não estavam instalados nem constavam do `requirements.txt`, e o `import` delas ficava **dentro** do `try` do `_render_element`, cujo `except Exception` apenas imprimia no console do servidor. Resultado medido antes da correção: `Erro ao impor SVG: No module named 'svglib'` e uma página sem desenho nenhum. A imposição terminava com sucesso, sem aviso, e o operador só descobria imprimindo.

As duas bibliotecas entraram no `requirements.txt` e o import subiu para o topo do `engine.py`, guardando a falha em `_SVG_IMPORT_ERROR`. Um elemento SVG imposto sem elas agora levanta `RuntimeError` com a instrução de instalação, e a mensagem chega ao usuário pelo evento de erro de `app.py` em vez de morrer num `print()`.

Os `except` silenciosos dos elementos SVG e PDF passaram a re-levantar. Um PDF impresso sem a arte custa papel e tempo; falhar a geração é mais barato. Também entrou uma checagem para um caso que não levantava exceção nenhuma: o `svglib` aceita um SVG malformado e devolve um desenho de tamanho zero, que não pinta nada — agora isso é erro explícito.

### B2 — a tela esticava, o motor preservava a proporção
Os renderizadores do frontend desenhavam com `ctx.drawImage(img, x, y, w, h)`, que **estica** para preencher a caixa; o `engine.py` usa `keep_proportion=True`, que **encaixa** preservando a proporção e centraliza a sobra. Enquanto ninguém redimensionava, coincidiam. Ao mudar a proporção da caixa, a tela mostrava a arte preenchendo e o papel saía com ela encolhida e centralizada.

A regra escolhida foi **tamanho original, escala 100%, sem distorção**, e ela vale dos dois lados:

- `drawImageContain()` é o novo equivalente exato, no canvas, do `keep_proportion=True` do PyMuPDF — inclusive na centralização, verificada por medição. Os quatro renderizadores de elemento SVG/PDF passam por ela: editor, janela combinada de arte, preview de imposição e export de gabarito.
- Os campos Largura/Altura de um elemento SVG ficaram **travados na proporção**: mexer num ajusta o outro. Distorcer pela interface deixou de ser possível — e não adiantaria, já que o motor encaixaria de volta deixando margem vazia. Um botão **Tamanho original (100%)** devolve o elemento ao tamanho do arquivo. Elementos PDF nunca tiveram campos de tamanho, então já entravam em 100%.

### Tamanho natural do SVG
Para "escala 100%" significar alguma coisa, o tamanho natural precisava estar certo — e não estava. O cálculo era `(img.width / 96) * 25.4`, ou seja, a medida que o **navegador** dá ao SVG. Isso só acerta quando o arquivo declara um tamanho absoluto: sem `width`/`height`, ou com eles em `%`, o navegador substitui pelo default de 300×150 px, que não tem relação nenhuma com o desenho. Um SVG só com `viewBox="0 0 100 50"` entrava com 79,4 × 39,7 mm em vez de 26,46 × 13,23 mm.

`svgNaturalSizeMm()` passa a ler o tamanho do texto do próprio arquivo, reproduzindo a interpretação do `svglib` — que é quem manda, porque é ele que gera o papel. As oito convenções foram medidas nos dois lados e batem:

| SVG | frontend | svglib |
|---|---|---|
| `width="100" height="50"` | 26,46 × 13,23 mm | 26,46 × 13,23 mm |
| só `viewBox="0 0 100 50"` | 26,46 × 13,23 mm | 26,46 × 13,23 mm |
| `width="100mm"` | 100 × 50 mm | 100 × 50 mm |
| `width="72pt"` | 25,4 × 12,7 mm | 25,4 × 12,7 mm |
| `width="10cm"` | 100 × 50 mm | 100 × 50 mm |
| `width="1in"` | 25,4 × 12,7 mm | 25,4 × 12,7 mm |
| `width="50%"` (do viewBox) | 13,23 × 6,61 mm | 13,23 × 6,61 mm |
| sem `width`, sem `viewBox` | indeterminável → aviso | desenho 0×0 → erro |

O último caso é o único que continua sem resposta, e agora é honesto: o upload avisa que o tamanho foi estimado pelo navegador, e a imposição falha com mensagem em vez de gerar papel em branco.

### Como foi verificado
Medindo, não lendo. No motor, um SVG de 40×20 mm e um PDF de 30×15 mm impostos de verdade: em caixa de tamanho natural saíram 39,86 × 19,76 mm e 30,34 × 15,17 mm; numa caixa 60×60 mm saíram com razão 2,02 e 1,99, encaixados sem distorcer. No navegador, o `drawElement()` do editor com a mesma arte deu 39,50 × 19,50 mm na caixa natural e razão ~2,0 nas caixas fora de proporção. E o `svgNaturalSizeMm()` foi conferido contra o `svglib` nas oito convenções da tabela acima.

### Fica pendente
As inconsistências estruturais E1–E4 da análise continuam abertas — em especial o preview de imposição, que lê a imagem do SVG de `currentNum._svgImage`, um campo que nada preenche. O preview desenha o placeholder "SVG" em vez da arte; a correção de proporção já está lá e passa a valer assim que a fonte da imagem for unificada.

---

## [v488 — 2026-08-08] — Duplicar numeração perdia frente/verso e os ajustes de TICKET

### Resumo
`duplicateCatalogNumeracao()` monta a cópia a partir de uma lista **explícita** de campos, e três não estavam nela: `print_mode`, `ticket_qtd` e `ticket_logica`. Duplicar uma numeração **FxVerso** produzia uma cópia **Frente**, e duplicar uma **TICKET** produzia uma cópia com quantidade `1` e lógica `PILHA` — os defaults do `db.py` — em vez dos valores do original.

### Por que passava despercebido
A falha era silenciosa em três camadas ao mesmo tempo: a cópia era criada com sucesso, sem erro nem aviso; a lista do catálogo não mostra nenhuma dessas três propriedades, então a linha nova parecia idêntica; e o `METADATA` que também carregava o `print_mode` é removido dos `elements` na leitura, então nem havia de onde recuperar o valor perdido. Só abrindo a cópia no editor dava para notar que o FxVerso tinha virado Frente.

### O conserto
Os três campos passaram a ser copiados, com fallbacks que repetem exatamente como `editNumeracao()` interpreta um campo ausente — `'front'`, `1` e `'HORIZONTAL'` — para que a cópia abra no editor idêntica ao original. `print_mode` é lido da coluna, nunca dos `elements`.

`Cli_Num` e `preview_jpg` continuam deliberadamente fora da cópia: o primeiro porque a cópia deve nascer genérica em vez de presa ao cliente do original, o segundo porque copiar a URL faria dois registros apontarem para o mesmo arquivo no Storage, e salvar um mudaria o preview do outro.

### Documentação
A tela ganhou um documento de referência em `docs/lista_de_numeracoes.md`, com a skill `lista-de-numeracoes` que dispara a leitura antes de qualquer alteração. Ele registra as quatro armadilhas do catálogo — todas confirmadas no app rodando —, entre elas o fato de que numerações com `Cli_Num` são ocultadas da tabela enquanto o badge do menu conta todas, e que uma busca só com dígitos deixa de ser busca por nome e vira filtro por cliente.

---

## [v487 — 2026-08-08] — Preview da numeração sai da tabela e vai para o Storage

### Resumo
O preview de 100 DPI gerado ao salvar uma numeração era gravado como data URL base64 na coluna `preview_jpg` de `producao_numeracoes`. Agora é um arquivo `.jpg` no bucket `artes`, sob o prefixo `previews-numeracoes/`, e a coluna guarda só a URL pública.

### Por que
Não era só armazenamento. `loadAll()` carrega as numerações com `select *`, então os 454,6 KB de base64 espalhados por 42 linhas atravessavam a rede a cada carregamento de página — para um dado que nenhuma tela usa. Depois da mudança a mesma coluna, nas mesmas 42 linhas, soma 5,41 KB — 0 KB em base64, só URLs. Isso é o ganho isolado desta tarefa. O carregamento completo de `producao_numeracoes` continua pesado (por volta de 535 KB por chamada) porque a coluna `csv_data` (426 KB) domina o payload — pré-existente, fora do escopo desta tarefa, e não afetado por ela.

### Um preview por numeração
O arquivo é nomeado com o id do registro (`previews-numeracoes/<id>.jpg`) e sobe com upsert, então salvar a mesma numeração dez vezes sobrescreve o mesmo objeto em vez de deixar dez órfãos no bucket. Substituir uma numeração homônima ao salvar sem id já era o comportamento de antes desta tarefa — o que mudou agora é só *onde* esse id é resolvido: antes do upload, no início de `saveNumeracao`, para que o preview suba com o nome definitivo do registro em vez de um provisório.

### Migração
As 42 linhas que já estavam em base64 foram convertidas de uma vez, com backup local do estado anterior. A conferência não se contentou com o PATCH ter retornado sem erro: cada URL foi baixada exigindo status 200 e `content-type: image/jpeg`.

### Se o Storage falhar
`uploadToStorage` mantém o comportamento antigo de cair para base64 quando o upload não passa. A coluna continua funcionando em vez de ficar vazia — é degradação, não quebra.

O mesmo fallback também dispara se o navegador simplesmente não tiver `supabaseClient` — modo offline (`?offline=true`, `localStorage.offline_mode`) ou o CDN do supabase-js não carregando. Nesse caso não há upload a falhar: o preview já nasce em base64. Pelo backend, se `db.py` estiver com Supabase ativo (o caso normal na estação), esse base64 chega à mesma `producao_numeracoes` de produção — o navegador se declarar offline não implica que o backend esteja. Reexecutar `migrar_previews_para_storage.py` limpa o que voltar a acumular assim.

E agora esse fallback avisa: quando o valor volta em base64, o save emite um toast de alerta e um `console.error`. Antes ele era mudo — se alguém apertasse o RLS do bucket `artes`, todo save voltaria a gravar base64 e a coluna regrediria sem uma linha de log.

### Corrigido de quebra: todos os avisos do app mostravam "undefined"
`toast()` tinha ícones para `success`, `error` e `info`, mas não para `warning` — e o app já chamava `toast(..., 'warning')` em 43 lugares. O usuário lia literalmente `undefined Mensagem...`, e sem cor própria, porque o `style.css` também não tinha `.toast-warning`. Foram adicionados o ícone ⚠️, a regra de CSS em âmbar, e um fallback para o ícone de informação, de modo que um tipo novo que apareça no futuro nunca mais renderize `undefined`.

---

## [v486 — 2026-08-08] — Arte de Fundo carrega sozinha a cor do formato base

### Resumo
No editor de numeração, o botão **🖼️ Arte de Fundo** deixa de exigir upload manual: ao abrir uma numeração para editar — e ao escolher o Formato Base numa numeração nova — o PDF da cor mais antiga cadastrada para aquele formato entra sozinho no canvas.

### Como a cor é escolhida
Entre as cores cuja coluna `formato_id` aponta para o formato base da numeração, vence a de `created_at` mais antigo. Os formatos compatíveis (`formato_ids`) são ignorados de propósito — só o formato base decide. Formato sem cor, ou cor mais antiga sem PDF, abre a barra vazia, sem erro: a ausência de cor é situação normal.

A arte não é gravada na numeração; a cor é re-resolvida a cada abertura, então reeditar a cor no catálogo se reflete na próxima vez que a numeração for aberta. Ao salvar, o `preview_jpg` gerado para o card do pedido inclui a arte da cor que estiver no canvas — decisão consciente, já que o preview existe justamente para mostrar como a numeração fica sobre a arte.

A arte específica da numeração (o PDF ou SVG de referência dela, quando cadastrado) tem precedência sobre a arte da cor: se ela existir, a arte da cor não é carregada.

### O que continua igual
O rótulo com o nome do arquivo, o botão **✕ Remover** e o upload manual por cima. Subir um arquivo sobrescreve a frente e descarta o verso automático, porque o botão governa só a frente e manter o verso de uma cor sob a frente de outra arte mostraria duas artes diferentes no mesmo par de canvas.

Numa numeração nova, trocar o Formato Base com um fundo já carregado não troca a arte — só o primeiro `onchange` carrega. Remover o fundo e só então trocar o formato recarrega, porque a condição "não há fundo" volta a valer.

### Frente e verso
Cores cadastradas como frente e verso carregam também a arte do verso, no canvas duplex. O campo `state.bgImageVerso` já era lido por `drawCanvasFace` mas nunca era escrito — era um caminho morto, agora ligado. O **✕ Remover** passa a limpar as duas faces.

### Corrigido
A arte de fundo de uma numeração vazava para a numeração aberta em seguida: `editNumeracao()` nunca limpava `state.bgImage`, então quem editava a numeração A e abria a B via o canvas de B com a arte da A.

---

## [v485 — 2026-08-08] — Arte funde com a cor no editor, e o `style.css` estava truncado

### Resumo
Duas coisas na mesma publicação: a arte carregada no Criador de Arte passa a fundir com a cor do papel (multiply), como já fundia no card do pedido; e a correção de um erro de sintaxe que fazia o navegador **descartar em silêncio as últimas ~290 linhas do `style.css`**.

### 1. A arte não tinha multiply

`drawAmostraFace()` sempre compõe a arte sobre a cor com `globalCompositeOperation = 'multiply'` — ou seja, a arte do fluxo convencional **é** uma camada multiply. Ao ser carregada no editor ela entrava como `source-over`: o checkbox "Efeito Multiply (Fusão)" abria desmarcado e um Salvar gravaria a arte sem a fusão com que ela foi feita para imprimir.

A propriedade sozinha não bastava. `globalCompositeOperation` funde o objeto com o que está no **mesmo** canvas, e as três camadas do editor são elementos `<canvas>` irmãos — composite de canvas não atravessa o DOM. Uma arte de fundo branco continuava tapando a Camada 1 e o operador editava sem ver o papel em que ia imprimir.

A fusão real exige `mix-blend-mode` em CSS, e **no `.canvas-container`**, não no `.lower-canvas`: o container tem `position` + `z-index`, o que cria um stacking context, e stacking context isola blending. Medido no pixel central da prancha: no `.lower-canvas` dá `rgb(255,255,255)`; no container dá exatamente a cor da Camada 1.

Como o container funde inteiro, inclusive o `.upper-canvas` onde o Fabric desenha as alças de seleção, as alças passaram a ser definidas no `criador-arte.js` com cantos preenchidos e escuros — o padrão do Fabric (cantos vazados em azul claro) praticamente somia sobre cores fortes.

### 2. O `style.css` parava de ser lido na linha 2054

A regra `.btn-pdf-active` abria `{`, tinha uma declaração e **nunca fechava**: a linha seguinte emendava direto em `.prod-search-input`. Um bloco de CSS do Painel de Produção havia sido colado no meio da regra. Daí até o fim do arquivo tudo ficava preso num bloco aberto e o navegador descartava.

Havia um segundo dano do mesmo tipo na linha 1392: um `}` órfão de uma duplicata de `.font-picker-dropdown` que perdeu o seletor.

Nos dois casos a cópia íntegra existia em outro ponto do arquivo (linhas 1189-1203 e 2254-2265), então só os fragmentos quebrados foram removidos. O `style.css` foi de 71.460 para 65.499 bytes e as chaves fecham em 454/454.

**Efeito colateral relevante:** ~54 regras que nunca aplicaram entraram em vigor de uma vez, quase todas do Painel de Produção. O painel foi verificado no navegador e renderiza corretamente, mas essa é a mudança visual mais perceptível da publicação.

---

## [v484 — 2026-08-08] — Publicador só bumpava três arquivos

### Resumo
`publicar.ps1` / `publicar.bat` atualizavam a versão de `script.js`, `pedido.js` e `cliente.js` por uma lista fixa. Todo o resto ficava congelado e suas alterações **não chegavam ao navegador de quem tinha o arquivo em cache**.

| Asset | Estava em | Deveria acompanhar |
|---|---|---|
| `style.css` | v=9 / v=7 / v=5 conforme a página | sim |
| `mapas.js` | v=2 | sim |
| `criador-arte.js` | v=2 | sim |

### Correção
A lista fixa deu lugar a uma regra por padrão: bumpar qualquer `.js?v=` ou `.css?v=` em todas as páginas de `frontend/*.html`. Nenhum asset novo cai mais no mesmo buraco, sem precisar editar o publicador. Os CDNs não são afetados — eles fixam versão no caminho (`/3.11.174/pdf.min.js`), nunca em querystring.

Uma armadilha encontrada ao escrever isso, registrada em comentário no código: **`-Path` do `Set-Content` aceita `string[]`**. Na forma posicional o PowerShell engole caminho *e* conteúdo no mesmo array de `-Path`, deixa `-Value` sem ligar e falha com um erro enganoso sobre `'Encoding'`. O script original escapava porque o valor chegava pelo pipeline. `-Path` e `-Value` agora são nomeados.

---

## [v483 — 2026-08-08] — Criador de Arte ignorava a arte do "Upload de Arte"

### Resumo
Abrir o Criador de Arte num modelo que já tinha arte enviada pelo fluxo convencional reabria a **arte antiga** da última edição, ignorando o arquivo recém-enviado.

### O que acontecia

O editor prioriza `arte_json` (a estrutura vetorial) sobre `arte_url`, e `onItemArteUpload` nunca invalidava o `arte_json` da edição anterior — só o botão *Remover* fazia isso. Num modelo que já passara pelo editor, o JSON residual no `localStorage` vencia a arte nova.

### Correção

**1. Upload e colagem descartam o vetorial obsoleto** — `invalidarArteVetorial()` limpa memória e `localStorage`. O `arte_json` não existe no banco (`saveAmostraToDB` o remove do payload), então esses são os dois únicos lugares.

**2. Desambiguação por origem do arquivo** — o item 1 só resolve uploads futuros; modelos já nesse estado continuariam quebrados. O editor passa a olhar o nome do arquivo: o editor sobe `arte_criada_*`, o upload sobe `arte_*`. Se a URL atual não veio do editor, o JSON do `localStorage` é resíduo e é ignorado.

**3. `carregarArteBaseNoCanvas()`** substituiu o bloco inline, com três correções: a detecção de PDF passa a ignorar querystring (uma URL do Supabase com `?token=...` dava falso negativo e o PDF ia para um `<img>`, falhando em silêncio); usa `fetchPdfBytes()`, que já tem fallback via `/api/proxy` quando o CORS bloqueia; e enquadra em "contain" como o `drawAmostraFace()`, em vez de encaixar só pela altura e ancorar no topo.

**4. Carregamento aguardado** — o `img.onload` era um callback solto, então o passo 0 do histórico era gravado com a prancha vazia e um Ctrl+Z logo após abrir apagava a arte recém-carregada.

Também publicado junto: correção de um `ReferenceError` de temporal dead zone na checagem inicial do agente de impressão (`initPrinterModule` rodava durante a avaliação do `script.js` e lia um `let` declarado ~2000 linhas abaixo). O erro era engolido por um `catch`, e o efeito era o indicador dizer "Agente Local Inativo" em todo carregamento até alguém abrir a aba Impressoras.

---

## [v481 — 2026-08-08] — Amostra de verso some ao voltar para numeração só Frente

### Resumo
Na Lista de Arte, trocar a numeração de FxVerso para uma só Frente deixava a amostra do verso viva no banco, e o cliente continuava vendo o verso no link de aprovação.

### O que acontecia

`onItemNumSelect` já ajustava `item.verso = false` e `verso_tipo = 'Frente'`, mas o payload salvo só levava `amostra_num_id`, `gabarito_operacional`, `tipo_numeracao` e `verso_tipo`. A coluna `verso_amostra_arte_base64` de `pedidos_modelos` nunca era tocada.

O fluxo inverso (Frente → FxVerso, que abre a segunda janela combinada e grava a amostra do verso) está correto e **não foi alterado**.

### Correção

**1. Zerar a amostra ao trocar para numeração só Frente** — `onItemNumSelect` passa a enviar:

```js
dataToSave.verso_amostra_arte_base64 = null;
dataToSave._isExplicitRemove = true;
```

A flag é obrigatória: `saveAmostraToDB` tem um guard que **descarta em silêncio** um `verso_amostra_arte_base64: null` quando o item local ainda tem valor, a menos que a remoção seja explícita. Sem ela a alteração não teria efeito algum, e sem erro. O guard só afeta as chaves presentes no payload, então a flag não põe em risco `arte_url` / `amostra_arte_base64`.

Preserva de propósito `verso_arte_url` e `verso_arte_json` — a arte enviada pelo operador continua no banco e pode ser recomposta se a numeração voltar a ser FxVerso. Limpar o select (sem numeração escolhida) não apaga nada; a regra vale para a troca por outra numeração.

**2. `cliente.js` reconhecer `'Frente'`** — a decisão de exibir o bloco de verso testava apenas `!== 'SÓ FRENTE' && !== 'SO FRENTE'`, mas o valor gravado pelo operador é `'Frente'`. Como a montagem do item no cliente faz `verso_amostra_arte_base64 || verso_arte_url`, o cliente voltaria a ver o verso pela URL da arte mesmo com a amostra zerada. Alinhado com a convenção que o `script.js` já usa nos demais pontos.

---

## [v1.5.1 (v481) — 2026-08-08] — Matching de produto: aceitar `_vibe_id_produto`

### Resumo
Correção de um bug pré-existente na resolução do formato a partir do produto, e **retificação** do que a entrada v480 afirmava sobre ele.

### O que havia de errado

Os itens de uma OS existem em dois formatos diferentes:

| Origem | Quando | Campos de id de produto |
|---|---|---|
| `mapVibecodeProdutoToOSItem` (pré-carga, aplicada a todas as ordens ao abrir a lista) | sempre | **só** `_vibe_id_produto` |
| mapeamento de `pedidos_modelos` em `loadOSItens` | ao abrir uma OS | `id_produto` **e** `_vibe_id_produto`, com o mesmo valor |

Dois consumidores liam apenas `item.id_produto || item.produto_id`:

- `enviarParaImposicao` — resolve formato/saída ao carregar um modelo
- `renderAmostrasOSItens` — resolve o formato para filtrar as cores da tela de Amostras

Recebendo um item da pré-carga, `prodId` era `undefined`, a busca por ID era pulada **em silêncio** e sobrava o matching por nome/apelido. Falhando esse, `enviarParaImposicao` caía em `formatoId = state.formatos[0].id` — o primeiro formato do sistema — aplicava-o ao `ped-formato` e a cor do modelo se perdia junto.

### Retificação da entrada v480

A nota de v480 dizia que esse matching "provavelmente nunca acerta". **Está errado.** No fluxo normal (abrir um pedido dispara `loadOSItens` antes de `enviarParaImposicao`) os itens já são os de `pedidos_modelos`, que têm `id_produto` preenchido — ali o matching funciona. A falha ocorre só quando um item da pré-carga chega a esses consumidores: `loadOSItens` falhando, ou OS sem linhas em `pedidos_modelos`.

### Correção

Ordem tolerante nos dois pontos, a mesma que `_getActiveProductInfo` e `initPedPrintPanel` já usavam:

```js
const prodId = item._vibe_id_produto || item.id_produto || item.produto_id;
```

Continua mascarado no dia a dia pela correção de v480 (a fila desenha antes e preenche `item.formato_id`), mas o caminho deixa de depender disso.

---

## [v1.5.0 (v480) — 2026-08-07] — Painel de Produção: ordenação, filtros de prazo e confirmação de impressão

### Resumo
Quatro mudanças no Painel de Produção e no fluxo de impressão. A mais importante em termos de operação: **imprimir não marca mais o modelo como IMPRESSO sozinho** — passa por confirmação do operador. As demais são de navegação e leitura da fila.

### 1. Confirmação de impressão

Antes, o status virava `IMPRESSO` automaticamente assim que o job era despachado — em alguns caminhos, *antes* mesmo de imprimir. Agora aparece um popup ao fim do envio e o status só muda no "Sim".

| Caminho | Comportamento antigo |
|---|---|
| Botão Imprimir da linha (`pedQueueImprimir`) | marcava IMPRESSO **antes** de imprimir |
| `runPedImposition('print')` — 3 ramos | marcava assim que o agente aceitava o job |
| 🖨️ Imp. Sel. (`pedQueueGerarPDFMulti`) | marcava logo após gerar o PDF, antes do modal abrir |
| Imprimir da fila da view Imposição (`impQueueImprimir`) | marcava antes de imprimir |

Quando a impressão passa pelo modal de seleção de impressora, a confirmação fica pendente (`marcarConfirmacaoPendente`) e dispara após o envio bem-sucedido; `closePrintModal` descarta a pendência se o modal for fechado sem enviar.

**Ações de PDF não alteram status nem pedem confirmação.** Removida a marcação automática de `IMPRESSO` de todos os caminhos de gerar/salvar/baixar PDF, em `pedido.js` e `script.js`. A única escrita automática restante é a de `confirmarImpressaoModelos`, sempre atrás do popup.

### 2. Pedido abre com o primeiro modelo selecionado

`abrirImposicaoDoPedido` selecionava `itemId: null` de propósito. Agora escolhe o primeiro modelo e delega para `enviarParaPedido`.

O "primeiro" é calculado por `getPrimeiroModeloDaOS`, que repete o agrupamento por produto de `renderPedOSQueue` — pegar `itens[0]` daria outro modelo, porque o JavaScript reordena chaves numéricas de objeto.

**Armadilha encontrada no caminho:** `renderPedOSQueue` não é só desenho — ela grava o formato padrão do produto em `item.formato_id`. Chamando `enviarParaPedido` sem essa render antes, `enviarParaImposicao` encontrava o formato vazio, descia toda a cadeia de matching e caía no fallback do primeiro formato do sistema; o `ped-formato` recebia o formato errado e a **cor do modelo se perdia**. A fila passou a ser desenhada antes de carregar o modelo.

> Bug pré-existente relacionado — **corrigido em v481, ver abaixo**. A nota original desta entrada dizia que o matching por produto "provavelmente nunca acerta"; isso estava errado e foi retificado na entrada seguinte.

### 3. Ordenação por coluna na lista "Pedidos Liberados"

Os títulos viraram botões. O ativo fica destacado com seta do sentido.

| Coluna | 1º clique | 2º clique |
|---|---|---|
| Nº Pedido, Itens, Quantidade, Progresso | maior → menor | inverte |
| Frete | agrupa por tipo (A→Z) | inverte |
| Status | ordem do fluxo: Aguardando → Parcial → Impresso → Revisão | inverte |

Sem coluna escolhida, a lista mantém exatamente a ordem anterior. O botão **ATUALIZAR** do painel zera a ordenação; os demais chamadores de `loadOrdens()` ficaram intactos, para a escolha não sumir ao voltar de um pedido. `aplicarProdSort` usa `slice()` — reordenar o array de origem embaralharia o `state` para as outras telas.

### 4. Filtros por Prazo de Entrega

Três botões centralizados no topo do box, à esquerda de "Todos os Setores", sempre com um selecionado:

- **Para Hoje** — prazo no dia corrente, qualquer hora
- **Atrasados** — data **e hora** anteriores ao momento atual
- **Geral** — sem filtro (padrão; ATUALIZAR volta para ele)

Combinam com busca, setor e estágio sem interferir neles. Pedido sem prazo aparece só no Geral.

**Alerta:** com "Para Hoje" selecionado e havendo atrasado na fila, o botão "Atrasados" fica vermelho. Só nessa condição. O alerta olha `ordensImpressao` — a fila inteira, antes de qualquer filtro — de propósito: é sinal global, não muda com setor, estágio ou busca. Para isso o eixo de prazo saiu do mesmo `filter` dos demais; com a lista já recortada em "Para Hoje" não haveria como enxergar os atrasados.

### Nota técnica: estilos aplicados inline

Os botões de cabeçalho e os de prazo têm o estilo aplicado por JS em `element.style`, não pela folha de estilos. As regras equivalentes foram escritas no `style.css` e **não venciam a cascata** dentro do `<th>` sticky — verificado que o arquivo chegava íntegro ao navegador (chaves e comentários balanceados, servido com o conteúdo certo) sem que a causa fosse identificada. As regras seguem no `style.css` como rede de segurança.

### Ferramental

| Arquivo | O que mudou |
|---|---|
| `.gitignore` | `print_configs.json` — configuração de impressão da estação, gravada em runtime pelo `db.py`, nunca deve ir para o repositório |
| `publicar.ps1` | mensagem de commit virou parâmetro obrigatório, no lugar de um texto fixo sobre `amostra_cor_id` que se repetia em toda publicação. Cada etapa passou a checar `$LASTEXITCODE`: `$ErrorActionPreference` não interrompe comandos nativos, então um commit falho seguia para o push e para o deploy assim mesmo |

### ⚠️ Pendência conhecida: o Prazo de Entrega é sintético

Consultando o Supabase em 2026-08-07: a tabela `propostas` **não tem** coluna `prazo_entrega` nem `prazo`, e `prazo_operacional` está `null` em todos os registros amostrados. Por isso `loadOrdensFromVibecode` sempre cai em `getFallbackPrazo(created_at, numero)`, que devolve `created_at + (3 + numero % 5)` dias.

Consequência: a coluna Prazo Entrega e os filtros "Para Hoje" / "Atrasados" operam sobre uma fórmula derivada da data de criação, não sobre um prazo real. É por isso que praticamente todo pedido aparece como "(Atrasado)". **Definir o campo real ficou pendente com o usuário**; o ponto de mudança é a linha que monta `prazo_entrega` em `loadOrdensFromVibecode` — `pedidoPassaFiltroPrazo` e `formatPrazoDestaque` acompanham automaticamente.

### Commits

- `6e07d43` — ordenação por coluna, confirmação de impressão e abertura com o 1º modelo
- `7cfafa4` — filtros por prazo de entrega, `.gitignore` e `publicar.ps1`

---

## [v1.4.0 (v454) — 2026-08-04] — Correção Crítica: Fontes Web nas Numerações

### Resumo
Correção do bug onde fontes carregadas do catálogo web (Roboto, Open Sans, Montserrat, etc.) eram substituídas por **Helvetica** na geração de PDF pelo motor Python. Fontes web agora renderizam corretamente em numerações (TEXT, FIXED, CAMAROTE_*, TEATRO_*) tanto em modo simples quanto multi-artes.

### Implementações Aplicadas

| # | Módulo / Função | O que mudou |
|---|---|---|
| 1 | `engine.py` — Resolução de Fontes (`v454`) | **Bug principal**: Ao usar `_font_data` (Base64 do TTF embutido), o engine criava o arquivo temporário mas mantinha `font_name = "helv"` (fallback Base-14). O PyMuPDF registrava o buffer da fonte Roboto com alias de Helvetica. **Fix**: Adicionado `font_name = family` no Step 1, idêntico ao que já existia no Step 2 (download por URL). |
| 2 | `script.js` — Multi-Artes (`v454`) | A função `_injectFontUrls()` injetava `arquivo_url` (URL do TTF) para `payloadNumeracao` e `numeracao_2`, mas **não** para os itens dentro de `payloadMultiArtes`. **Fix**: Adicionado loop de injeção para cada item de multi-artes. |
| 3 | Restrição do Catálogo (v453) | Confirmada remoção dos botões "Fontes do PC" e "Digitar Nome" no Criador de Arte. `populateFontFamilySelect()` agora usa exclusivamente `state_fonts.catalogo` (fontes hospedadas). |

### Diagnóstico Detalhado

O bug foi rastreado através de 5 hipóteses documentadas em `fontes_numeracao_debug.md`. A causa raiz confirmada:

```
engine.py linha 546:
  font_name = font_map.get("Roboto", "helv")  → "helv" (Roboto não é Base-14)

engine.py linha 557 (ANTES):
  font_file = tmp_font.name   ← arquivo OK, mas font_name continua "helv"

engine.py linha 614:
  page.insert_font(fontname="helv", fontbuffer=<bytes_da_Roboto>)  ← ERRADO!
```

**Após a correção:**
```
engine.py linha 558 (AGORA):
  font_name = family           ← "Roboto"

engine.py linha 615:
  page.insert_font(fontname="Roboto", fontbuffer=<bytes_da_Roboto>)  ← CORRETO!
```

---

## [v455 — 2026-08-04] — Pipeline de Impressão Vetorial (PDF RAW)

### Resumo
Refatoração do pipeline de impressão para enviar o PDF **diretamente** ao spooler como dados RAW, preservando 100% das fontes embutidas. O método anterior rasterizava cada página como imagem PNG/JPEG, destruindo as fontes e perdendo qualidade vetorial.

### O que mudou

| Aspecto | Antes (GDI Raster) ❌ | Agora (PDF RAW) ✅ |
|---------|----------------------|-------------------|
| Texto | Pixels (imagem) | Vetorial (TrueType) |
| Fontes web | Perdidas na rasterização | Preservadas intactas |
| Qualidade | Limitada ao DPI | Infinita (vetor) |
| Tamanho spool | ~50-100 MB por job | ~2-5 MB (tamanho real do PDF) |
| Velocidade | Lenta (rasterização) | Instantânea (envio direto) |

### Modos de impressão disponíveis

O `print_service.py` agora suporta 4 modos selecionáveis via `options["print_mode"]`:

| Modo | Descrição |
|------|-----------|
| `pdf_raw` (padrão) | Envia PDF direto ao spooler — requer impressora com interpretador PDF |
| `ghostscript` | Converte PDF→PS vetorial via Ghostscript — qualquer impressora PostScript |
| `gdi` | Rasteriza para imagem via GDI/PIL — fallback universal |
| `auto` | Cascata: pdf_raw → ghostscript → gdi |

---


## [v1.3.0 (v408) — 2026-07-29] — Suporte aos Modos de Impressão Reversa e Folha a Folha, Cores e Ajustes de Fila do Pedido

### Resumo
Implementação completa dos novos modos de impressão física (**Impressão Reversa** e **Folha a Folha**), persistência de parametrização de impressão por produto no Supabase, adição do círculo indicador de cor de referência nos modelos, e ajustes visuais nas linhas da fila do pedido.

### Implementações Aplicadas

| # | Módulo / Função | O que mudou |
|---|---|---|
| 1 | Modos de Impressão (`v407`) | Adicionados checkboxes **🔄 Impressão reversa** e **📄 Folha a Folha** no painel de configuração de impressão e no motor de spooling em tempo real (`processPrintQueueOptions`). |
| 2 | Persistência de Impressão (`v406`) | Integração da tabela `producao_print_config` no Supabase com sincronização automática (`savePrintConfigForProduct` e `loadPrintConfigForProduct`). |
| 3 | Estilo de Status Aguardando (`v408`) | Atualizada a cor de fundo das linhas de modelo com status "Aguardando" para **`#65625e`** em `pedido.js` e `script.js`. |
| 4 | Círculo Indicador de Referência (`v404`/`v405`) | Inserido círculo (60% da altura da linha) antes do nome do modelo preenchido com o Hexadecimal da cor de referência. |
| 5 | Dropdown de Cor (`v404`) | Cor de fundo dinâmica com o Hexadecimal da cor selecionada e texto forçado em preto 100% legível (`color: #000000 !important;`). |
| 6 | Resiliência do Supabase (`v403`) | Interceptador gracioso na função `api()` para tratar ausência da coluna `cor_referencia` sem travar a interface. |
| 7 | Ajustes de Layout na Fila (`v396`) | Atualizada a cor das bordas e delimitadores para `#918f8c` e aplicado espaçamento vertical de `3pt` entre linhas de modelos. |
| 8 | Compilação do Executável | Recompilado `dist/IdealImpositionAgent.exe` com tratamento robusto para liberação de portas e processos em segundo plano. |

---

## [v1.2.0 — 2026-06-28] — Novo motor de Blocos Estritos e Interface de Navegação

### Resumo
Adição da funcionalidade Cut & Stack Estrito (Blocos) e Colunas Independentes, juntamente com controles de paginação avançados no Visualizador de Imposição para conferência da matemática do PDF gerado.

### Implementações Aplicadas

| # | Função | O que mudou |
|---|---|---|
| 1 | `engine.py` (Cut & Stack) | Criação da matemática robusta para as modalidades "Colunas Independentes" (Total de Folhas = Altura da Coluna) e "Blocos Estritos" (Agrupamento fixo por tamanho de bloco/profundidade). |
| 2 | `app.py` | Correção na passagem dos parâmetros `cut_stack_mode`, `sheets_per_block` e `block_depth` do frontend para a instância do `ImpositionConfig`. |
| 3 | Visualizador (`script.js`) | Refatoração da lógica do Visualizador para desenhar perfeitamente a matemática de qualquer folha, batendo com a lógica final da geração de PDF do `engine.py`. |
| 4 | Visualizador Numerado (`script.js`) | Correção da formatação de valores numerados para respeitar tickets múltiplos dentro da mesma célula em tempo de Preview. |
| 5 | Controles Paginados (`index.html`) | Adição de `input` de página direta e setas de avanço/recuo de Folhas direto na tela de pré-visualização. |

---

## [v1.1.0 — 2026-06-27] — Fluxo de Status de Arte e Link do Cliente

### Resumo
Refatoração completa do fluxo de status entre o painel interno (designer/atendente) e o link público do cliente. Corrigidos 4 bugs críticos que faziam o link abrir a tela errada.

### Fixes aplicados

| # | Função | O que mudou |
|---|---|---|
| 1 | `getOrCreateLinkCliente()` | Não sobrescreve mais status finais (APROVADO, REPROVADO, Em Arte, Pendente) ao clicar em "Copiar Link" |
| 2 | `initClientePage()` — OS locais | `producao_ordens_servico` só complementa o status se o link ainda estiver em estado inicial |
| 3 | `initClientePage()` — detecção de aprovado | `'ARTE_APROVADA'` (aprovação interna) não ativa mais a tela "Artes Aprovadas!" do cliente |
| 4 | `statusProntoParaLink` | Somente `'Enviar Arte'` destaca o botão de link em azul |

### Fluxo de status definido

```
[OS Criada] → "Em Arte"
    │
    ├─ Designer marca TODOS modelos como PRONTO → "Enviar Arte" (AUTOMÁTICO)
    ├─ Designer marca PARCIALMENTE + clica "Voltar p/ Atendimento" → "Pendente Informação"
    └─ Atendente clica "Voltar para Arte" → "Em Arte"

[Status = "Enviar Arte"] → Link do cliente ATIVO
    ├─ Cliente APROVA TODOS → "APROVADO"
    └─ Cliente marca UM como "Alterar" → "REPROVADO"

[Status = "REPROVADO"] → Designer corrige → marca todos como PRONTO → "Enviar Arte" (AUTOMÁTICO)
```

### O que o cliente vê por status

| Status | Cliente vê |
|---|---|
| `Enviar Arte` | 🎨 Janelas de aprovação dos modelos |
| `APROVADO` | ✅ "Artes Aprovadas! Em breve seu pedido entra em produção." |
| `REPROVADO` | ❌ "Artes Reprovadas. Nossa equipe está realizando as correções." |
| `Em Arte` / `Pendente Informação` / outros | 🕐 "Artes em Preparação. Aguarde." |

### Commit
`ed6e17c` — `fix(arte): fluxo correto de status - Em Arte > Enviar Arte (auto) > APROVADO/REPROVADO`

---


### 1. fix: Menus do sistema pararam de funcionar (CRITICO)

**Commits:** `8fbcc2b`, `f9a3d4c`

**Causa raiz:** O `script.js` havia acumulado um erro de sintaxe fatal. Edicoes sucessivas no bloco `renderElementsList` desbalancaram as chaves `{` e `}` do arquivo. O Node.js detectou `SyntaxError: Unexpected token '}'` na linha 12767, impedindo que o **JavaScript inteiro carregasse**. Com o JS quebrado, nenhum botao do menu funcionava pois os event listeners nunca eram registrados.

**Solucao:**
1. `script.js` restaurado a partir do `script_backup.js` (backup valido e sintaticamente correto)
2. As melhorias de layout foram reaplicadas de forma segura e cirurgica
3. Sintaxe verificada com `node --check` apos cada edicao

---

### 2. feat: Ordenacao automatica de elementos no Editor de Numeracao

**Commits:** `8fbcc2b`, `5a7f1f0`
**Arquivo:** `frontend/script.js` -> funcao `renderElementsList()`

Os elementos no painel esquerdo do Editor de Numeracao agora sao exibidos sempre na mesma ordem logica, independente da ordem de criacao.

**Ordem aplicada:**

| Prioridade | Tipo    | Rotulo               |
|-----------|---------|----------------------|
| 1         | TEXT    | Numeracao sequencial |
| 2         | FIXED   | Texto Fixo           |
| 3         | QR      | QR Code              |
| 4         | BARCODE | Barcode              |
| 5         | SVG     | SVG                  |
| 6         | PDF     | PDF                  |
| 7         | PICOTE  | Picote (sempre ultimo) |

**Implementacao (2 linhas adicionadas):**
```js
const typeOrder = { TEXT: 0, FIXED: 1, QR: 2, BARCODE: 3, SVG: 4, PDF: 5, PICOTE: 6 };
const sortedElements = [...state.numElements].sort((a, b) => (typeOrder[a.type] ?? 99) - (typeOrder[b.type] ?? 99));
```

---

### 3. style: Layout em Grid Responsivo nos Cards de Elemento

**Commits:** `f9a3d4c`
**Arquivo:** `frontend/style.css`

Os cards de elementos no Editor de Numeracao foram reformulados de `flex nowrap` (causava rolagem horizontal e campos acavalados) para CSS Grid responsivo.

- `display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr))`
- Campos se distribuem automaticamente em multiplas linhas
- Sem rolagem horizontal, usa toda a area disponivel
- `input[type="color"]` com altura padronizada (30px)
- Classe `.el-full` para campos que ocupam a linha inteira

---

### 4. fix: Restauracao completa do painel de producao (CRITICO)

**Commits:** `5a7f1f0`

**Problema:** Ao restaurar o `script.js` do `script_backup.js`, foram perdidas funcionalidades criticas que estavam em commits posteriores do git mas anteriores ao backup. O backup estava DESATUALIZADO em relacao ao repositorio.

**Funcionalidades recuperadas:**

| Funcao | Descricao |
|---|---|
| `filtroSetor` (8x) | Filtro por setor no painel de producao |
| `filtroStatus` (8x) | Filtro por status das OSs |
| `clienteFinalizarFluxo` (6x) | Fluxo de aprovacao/rejeicao pelo cliente |
| `atualizarBarraFinalCliente` (2x) | Barra dinamica no link publico do cliente |
| Funcoes `renderOrdens` | Renderizacao completa das ordens de servico |
| Funcoes de amostras | Amostras por item, combinadas, individuais |

**Solucao:** Restauracao direta do commit `fc2688d` (14.477 linhas, UTF-8, sintaxe valida) que era o estado correto do `main` antes da nossa feature branch.

---

### 5. fix: Caracteres estranhos no browser (ÔÇö, â€", etc.)

**Commits:** `d534be5`
**Arquivo:** `frontend/script.js`

**Causa:** O `script.js` original (commitado no git) continha 2.236 caracteres Unicode especiais nos comentarios de secao (box-drawing, aspas tipograficas, em dashes). Dependendo do contexto do browser ou do encoding intermediario, esses bytes causavam exibicao de "ÔÇö", "â€"" e similares.

**Caracteres substituidos:**

| Caractere | Unicode | Aparecia como | Substituido por |
|---|---|---|---|
| `─` (box drawing) | U+2500-U+257F | `ÔÇö` | `-` |
| `—` (em dash) | U+2014 | `â€"` | `--` |
| `'` `'` (aspas curvas) | U+2018/2019 | `â€˜` | `'` |
| `"` `"` (aspas duplas) | U+201C/201D | `â€œ` | `"` |

**Resultado:** 1.602 caracteres substituidos, 0 box-drawing restantes, sintaxe JS validada.

---

### 6. docs: CHANGELOG.md criado

**Arquivo:** `CHANGELOG.md` (raiz do projeto)

Criado registro historico completo das alteracoes do projeto.

---

### 7. fix: Problema de DNS local resolvido para publicacao

**Situacao:** O DNS local do sistema nao resolvia `github.com` nem `vercel.com`, impedindo o `git push`.

**Solucao aplicada:**
- Resolucao dos IPs via DNS externo (8.8.8.8)
- Adicao de entradas fixas ao `C:\Windows\System32\drivers\etc\hosts` via PowerShell elevado:
  ```
  4.228.31.150  github.com
  4.228.31.150  api.github.com
  198.169.1.129 vercel.com
  216.198.79.130 imposicao.vercel.app
  216.24.57.9   imposicao.onrender.com
  ```

> **ATENCAO:** Essas entradas sao temporarias. Se o DNS local for corrigido, remova-as do arquivo hosts para evitar conflitos com mudancas de IP do GitHub/Vercel.

---

## Arquitetura do Sistema

```
ideal-imposition/
|-- frontend/                  <- SPA estatica (HTML + CSS + JS puro)
|   |-- index.html             <- Estrutura e views (Single Page App de secoes)
|   |-- script.js              <- Toda a logica frontend (~14.500 linhas)
|   |-- style.css              <- Design system + componentes (~1.800 linhas)
|   |-- supabase-config.js     <- Credenciais Supabase e API_BASE_URL
|   `-- vercel.json            <- Rewrites SPA + headers no-cache
|
|-- app.py                     <- FastAPI - endpoints REST do motor
|-- engine.py                  <- Motor Python de geracao de PDFs impostos (PyMuPDF)
|-- db.py                      <- Camada de acesso ao Supabase (servidor)
|-- requirements.txt           <- Dependencias Python (FastAPI, PyMuPDF, etc.)
|-- render.yaml                <- Configuracao de deploy no Render
|
|-- schema_unificado.sql       <- Schema completo do banco de dados
|-- DEPLOY.md                  <- Guia de deploy detalhado (Supabase + Vercel + Render)
`-- CHANGELOG.md               <- Este arquivo
```

### Fluxo de Dados

```
Browser (hospedado na Vercel)
    |
    |--[Supabase JS SDK]------> Supabase PostgreSQL
    |                           (formatos, numeracoes, cores, OSs, artes)
    |
    `--[fetch REST / JSON]----> Backend FastAPI (hospedado no Render)
                                    `-> engine.py (PyMuPDF - geracao de PDF)
                                            `-> Supabase Storage (upload PDF)
```

### Tabelas do Banco de Dados (prefixo `producao_`)

| Tabela                          | Descricao                                       |
|---------------------------------|-------------------------------------------------|
| `producao_formatos`             | Formatos do item (tamanho, grade, gaps)          |
| `producao_numeracoes`           | Conjuntos de elementos variaveis (VDP)           |
| `producao_saidas`               | Formatos de papel de saida                      |
| `producao_cores`                | Cores de referencia por formato                 |
| `producao_modelos_imposicao`    | Modelos salvos de imposicao                     |
| `producao_ordens_servico`       | Ordens de servico (pedidos)                     |
| `producao_os_itens`             | Itens de cada OS (produto, setor, cor, num.)    |
| `producao_links_aprovacao`      | Links publicos de aprovacao para o cliente      |

---

## Guia de Publicacao Rapida

```bash
# Commitar e publicar (Vercel detecta automaticamente e faz deploy em ~2min)
git add .
git commit -m "descricao da mudanca"
git push origin main
```

> Se o `git push` falhar com "Could not resolve host: github.com":
> Execute como Administrador e adicione ao `C:\Windows\System32\drivers\etc\hosts`:
> `4.228.31.150 github.com`

---

*Ultima atualizacao: 2026-06-16*
