# Changelog — Ideal Imposition

Registro historico de todas as alteracoes, correcoes e melhorias aplicadas ao sistema.

---

## Versão atual: **v815** — 2026-09-04 | Agente **1.2.304**

> [!IMPORTANT]
> **O registro detalhado vive em [`docs/CHANGELOG.md`](docs/CHANGELOG.md).** Este
> arquivo tem as entradas por versão até a **v707** (24/08/2026); a partir da
> v708 as entradas passaram a ser escritas lá, por data, e é lá que está o
> histórico das telas.
>
> **A linha acima não é mais escrita à mão.** Ela ficou parada em v707 por onze
> publicações — número errado num arquivo que se lê justamente para saber o
> número. Desde 29/08/2026 quem a escreve é o `publicar.ps1`, a cada publicação,
> com a versão que acabou de subir e a versão do agente que está no repositório.
> Se ela voltar a divergir, o conserto é no script, não aqui.

---

## [v707 — 2026-08-24] — Acabamento: a balança preenche o campo de peso sozinha

Pedido do usuário: *"No painel do acabamento, na edição do pedido para o modelo, nós utilizamos a
webcam para tirar foto. Também utilizamos uma balança para medir o peso. Precisamos fazer a leitura
da balança para que o peso seja preenchido automaticamente no campo peso. A balança é da marca
Urano, CP 3/0.5 POP."*

Um botão **⚖** ao lado dos **três** campos de peso da tela — o peso de cada setor na ficha de
expedição, o "Peso na balança" do editor de caixa, e a janela do peso que fecha o setor. Apertado,
ele lê a balança e preenche o campo. O valor segue o caminho de sempre: a régua dos 5 %, a senha de
liberação, a mesma gravação. Digitar à mão continua valendo.

**A leitura é do agente, não do navegador.** Porta serial no navegador só existe com WebSerial:
Chrome, e com permissão concedida à mão em cada máquina — e nenhuma solução deste projeto pode
depender de configurar navegador, porque cada estação usa um diferente. O agente lê a porta e o
painel pergunta a ele por `/api/balanca/peso`, do mesmo jeito que já pergunta o peso por setor. No
site o botão **não existe**: a balança está numa mesa, ligada a um computador.

**O protocolo saiu do manual da Urano** (linha CP POP, item 11.13.2): 9600 bps, 8 data bits, sem
paridade, 2 stop bits; o computador manda um byte (`0x05`) e a balança responde um quadro com sinal,
marca de estável, tara, **peso líquido em gramas**, peso médio e total de peças. O agente espera até
4 segundos o peso estabilizar no prato antes de responder, e diz "sobrecarga" por nome quando o
material passa dos 3 kg da balança.

**Não achar a balança não é erro, e a tela diz o que fazer.** Na CP POP a saída de dados é opcional
de fábrica (o conector serial RJ45 e o USB são acessórios), e mesmo instalada precisa ser ligada no
teclado dela: `FUNÇÃO` `8`, senha `191249`, opção "Tipo 1". Nada disso o operador adivinha — então a
falha abre uma caixa com o motivo, com esses passos, e com o **"Procurar a balança nas portas deste
computador"**, que lista cada porta COM da máquina, o que ela respondeu e quanto está marcando, para
conferir contra o visor.

**Testes:** 25 verificações novas em `tests/test_balanca.py` (o quadro montado byte a byte a partir
do manual: estável, instável, negativo, sobrecarga, quadro truncado, lixo) e 691 no harness do
acabamento (eram 665).

---

## [v705 — 2026-08-24] — Acabamento: o pedido enviado à expedição continua na lista de PRONTO

Pedido do usuário, olhando o 21030: *"No Painel de acabamento, na edição do pedido, ao clicar e
enviá-lo para a Expedição, ele deve ir para a lista de 'PRONTO'"*.

Até aqui o pedido **sumia da tela** no instante do envio. O `status_interno` virava `EXPEDICAO`, que
não passa no recorte da fila do Acabamento, e o resultado para quem estava na estação era: clicou, a
tela voltou para a lista, e o trabalho dele não estava em lugar nenhum.

Agora `EXPEDICAO` entra no recorte da **lista** — e só dela. As métricas da coluna lateral continuam
contando apenas a fila de trabalho: **PEDIDOS EM FILA**, o número no menu e o alerta de atraso não
contam pedido que já saiu do setor. Quem cresce é a tabela, que é onde o operador procura o que
acabou de mandar.

Ele aparece na **lista de PRONTO** (o botão de recorte que já existia para pedidos com todos os
modelos prontos), marcado com **📦 NA EXPEDIÇÃO** embaixo do número — para não se confundir com um
pedido pronto que ainda está na bancada. Aberto, o botão de expedição vira comprovante em vez de
oferecer enviar de novo, e o aviso do envio passa a dizer onde reencontrá-lo.

**A lista não incha.** Assim que a expedição embarca, o ERP troca o status para `EM TRANSITO` e o
pedido sai daqui sozinho — hoje são 11 pedidos em `EXPEDICAO`, todos dos últimos quatro dias.

**Testes:** 665 verificações no harness do acabamento (era 639), incluindo o caminho inteiro
desenhado num Chrome. Sem a correção, 7 delas caem.

---

## [v704 — 2026-08-23] — Título do pedido em duas linhas, e o "Pesar este volume" na tela em qualquer tamanho

### Tela de Pedido: o título em duas linhas, com os tamanhos que ele pediu

Pedido do usuário: *"no Painel de Arte, na edição do Pedido, deixar o título 'número + Evento' 20%
menor e a segunda linha 'Cliente + Número' 30% menor"*.

```
21085 - Expointer 2026 - Parte 2            ← 20% menor que o tamanho de antes
ANGELA BEATRIZ DA COSTA SALOMAO - 53193     ← 30% menor, em amarelo
```

Mesma forma que o cabeçalho do Painel do Acabamento ganhou de manhã; o que muda são os tamanhos, que
ele deu aqui um a um. **Os dois saem do mesmo tamanho de referência**, e não um em cima do outro: 30%
menor que a *primeira linha* daria 56% do título, e não 70%. Por isso as duas são medidas em `em`
sobre o `TAMANHO_DO_TITULO_DO_PEDIDO`.

**Dois caminhos chegavam a esse cabeçalho e cada um escrevia o título por conta própria** — abrir um
modelo pela tela de Pedido e voltar a ela pelo histórico do painel. Agora os dois chamam a mesma
`pintarTituloDaTelaDePedido`; antes, bastava mexer num para o título passar a depender de por onde a
pessoa entrou. Há teste travando isso.

A linha do cliente devolve o próprio `-webkit-text-fill-color`, pela mesma razão do título do
Acabamento: o degradê do `<h1>` se recorta no texto dos filhos, e um `color` sozinho sairia cinza.
`tests/titulo_do_pedido_harness.js` (13 verificações) mede a cor e as duas proporções num Chrome de
verdade, com o controle ao lado.

### Acabamento: o "Pesar este volume" agora está na tela em qualquer tamanho

Relato do usuário depois da v703: *"estou na V703 e ainda não existe o botão pesar este volume"*.

Ele estava certo de novo, e a correção anterior tinha resolvido só metade. Medido em sete tamanhos
de tela:

| Largura da tela | v703 (`sticky`) | v704 (fixa) |
|---|---|---|
| 1920 / 1600 / 1366 / 1280 | na tela | na tela |
| **1024 × 768** | **2.214 px abaixo da janela** | na tela |
| 900 (tablet) | 2.217 px abaixo | na tela |
| 412 (celular) | 4.828 px abaixo | na tela |

**Por que o `sticky` não bastou.** Dois motivos somados. O `.prod-table-card` acima da barra tem
`overflow: hidden`, e **ancestral com overflow escondido desliga o `position: sticky` do
descendente**. E abaixo de 1024 px a media query vira o `.prod-panel-container` em coluna com
`overflow: auto`, passando a ser ele quem rola — outro contexto, outra conta.

**O conserto.** A barra saiu de dentro do detalhe e virou fixa contra a janela, no
`#acab-barra-escolha`, fora das views — a mesma escolha que o Quadro de Avisos já tinha feito no
mesmo dia, pelo mesmo motivo. Assim ela não depende de layout nenhum.

Três coisas moram naquele canto agora — o Quadro de Avisos, esta barra e os avisos flutuantes — e se
empilham pela convenção que o quadro criou: cada uma publica a própria altura numa variável de CSS
(`--avisos-altura`, `--escolha-altura`) e a de cima se apoia nela. Nenhuma cobre a outra. Enquanto a
escolha está em curso o corpo do pedido ganha folga embaixo, para o último card não ficar atrás da
barra, e sair do Acabamento tira a barra junto.

**O teste aprendeu a lição.** O harness de navegador que entrou na v703 media **um** tamanho de tela
— justamente um em que o `sticky` funcionava. Agora ele mede **sete**, do monitor grande ao celular,
passando pelo 1024, que é onde a chave vira. São 39 verificações, com o controle que dá sentido ao
resto: devolvida para dentro do detalhe, em 1024×768, o botão volta a cair fora da janela.

---

## [v703 — 2026-08-23] — Acabamento: o "Pesar este volume" estava fora da tela

Relato do usuário, logo depois de a v702 subir: *"Não localizei o 4. Pesar este volume, após
selecionar os modelos"*.

Ele estava certo, e o defeito era pior do que parecia. A barra do modo de escolha — a que traz a
conta do que foi marcado e o único botão que segue adiante — nascia **solta no fim da lista de
modelos**, dentro da área que rola. Medido numa tela de 1366×768, a que a gráfica usa: com **um**
modelo no setor o botão já ficava **144 px abaixo da área visível**; com quatro, **1.416 px**. O
operador marcava os modelos e não via acontecer nada.

Agora as duas pontas do modo de escolha ficam **grudadas na tela**: a faixa azul no topo, com o setor
e o Cancelar, e a barra na base, com a conta e o `Pesar este volume`. Rolar a lista inteira não perde
nenhuma das duas de vista.

**Por que nenhum teste pegou isso.** O harness de regra mede o HTML que a função devolve, e o HTML
estava certo o tempo todo — quem decidia se o botão existia *para o operador* era o layout. Entrou um
harness de navegador (`tests/escolha_de_volume_harness.js`, 10 verificações) que desenha a tela
inteira e pergunta uma coisa só: o botão está dentro da área visível? Ele traz o próprio **controle**
— tira o `position: sticky` e prova que o botão volta a sumir —, na mesma linha do harness do título.
Sem rede nenhuma: CDN, banco e agente respondem vazio de dentro do teste.

---

## [v702 — 2026-08-23] — Quadro de Avisos nos painéis, e os pacotes dentro da caixa do acabamento

### Quadro de Avisos: uma barra na base do painel, por setor

Pedido do usuário: *"um quadro de avisos que vai aparecer no Painel de Produção e Painel de
Acabamento, uma barra flutuante na base da página, teremos uma barra para cada painel para cada setor
(atualmente 8 barras), será gerenciada no menu ADM, aba Avisos, será para visualização de um aviso e
com um drop para os usuários marcarem seus nomes confirmando a leitura"*.

**Os oito quadros não se cadastram.** Um quadro é o par (painel, setor) — os quatro setores da
gráfica vezes os dois painéis. O que se publica e se tira do ar é o **aviso** que está nele; quadro
sem aviso não desenha nada, e o painel fica exatamente como era. O estado normal da gráfica é a
maioria dos setores sem recado nenhum, e esse estado não podia custar cadastro.

**A barra segue o filtro de setor do painel** — nenhum aceso, mostra os do painel inteiro; vários
acesos, soma os deles. Com mais de um aviso na fila ela mostra um por vez, com setas, e o urgente
assume o topo mesmo sendo mais antigo. Ela lê o filtro pelas **pílulas da tela**, e não pelo estado
interno de nenhum dos dois painéis: a Produção guarda em `state.filtroSetores`, o Acabamento num
`tela` fechado, e as pílulas são o único terreno comum — a mesma fonte que a lista embaixo já usa.

**A confirmação de leitura** é um dropdown com os operadores do acesso local com o perfil daquele
painel (`impressor` na Produção, `acabamento` no Acabamento) — a mesma lista, e a mesma regra, do
seletor de Responsável do Acabamento. Tocar no próprio nome grava a leitura com a hora. A marca
aparece antes de o banco responder, e é desfeita se ele recusar; dois toques não viram duas leituras
(a chave `(aviso_id, nome)` é a trava, e o conflito que ela devolve não é tratado como erro); quem
leu e depois perdeu o acesso local continua na lista, porque a leitura é um fato datado.

**No ADM, a aba 📢 Avisos** mostra os oito quadros numa grade e o editor de cada um, com o texto, a
prioridade, o prazo e quem já leu. Trocar o texto marcando *"pedir a confirmação de novo"* publica um
aviso **novo** e manda o antigo para o histórico com as leituras dele intactas — sem isso, "quem foi
avisado" passaria a responder pelo recado errado. Desmarcado, corrige no lugar.

**Duas coisas de tela que custaram atenção.** O `.toast-container` nasce no mesmo canto de baixo, a
24 px da base, e o operador o procura ali: em vez de movê-lo, a barra publica a própria altura em
`--avisos-altura` e o toast se apoia nela. E o menu lateral muda de natureza no 1024 px — gaveta
abaixo dele, encolhido no fluxo acima —, então a barra tem os dois casos.

Urgente pinta a barra de vermelho e **não deixa recolher** antes de alguém confirmar; a seta fica
apagada, com o motivo no título, em vez de sumir. Aviso com prazo vencido some sozinho da barra e
continua no ADM.

Nada disso derruba o painel: toda consulta falha para dentro, e sem banco ou sem tabela a barra não
aparece. A única tela que diz o que houve é o ADM, que manda rodar
`sql/avisos_dos_paineis.sql` — é lá que está quem pode resolver.

> ⚠️ **Antes de usar**: rode `sql/avisos_dos_paineis.sql` no editor SQL do Supabase. Enquanto as
> tabelas não existirem, a barra simplesmente não aparece.

Testes: `tests/avisos_harness.js` (61 verificações, o módulo inteiro num DOM de mentira),
`tests/avisos_na_tela_harness.js` (7, num Chrome de verdade, medindo que o toast sai de cima do
recado) e `tests/test_avisos_do_painel.py`. Documentação em `docs/avisos_dos_paineis.md`.

---

### Acabamento: pacotes dentro da caixa, e o modelo que fecha sozinho

Pedido do usuário, em duas mensagens no mesmo dia:

> "Ao criar o volume, opção de nomear volume, dentro do mesmo volume, podemos adicionar vários
> pacotes, ao adicionar os volumes, volumes criados a soma de seus pesos vai atualizando o peso real
> do setor, ao editar os volumes, mostra os pacotes, quantidades e responsáveis de cada pacote"

> "modelos com mais de 1 volume ao atingir a quantidade total, quando mais de 1 responsável mostra
> no drop responsável o nome do setor e marca status como pronto, se todos os pacotes do volume são
> mesmo responsável marca este como responsável."

#### O pacote

O **pacote** é o maço que uma pessoa fecha: um modelo, uma quantidade, um nome. Vários pacotes vão
para dentro da mesma caixa, e a caixa é o que vai à balança. É esse nível que resolve a primeira
situação do pedido dos volumes — *"1 modelo grande é realizado por vários responsáveis"*: cada
pessoa fecha o seu pacote, e a caixa que os reúne é pesada uma vez só.

Na janela de pesar, **`+ Pacote`** acrescenta um maço. Ele nasce do mesmo modelo do anterior, com o
que sobrou dele. Cada linha tem modelo, quantidade, quem fez, e o "livres" que **desconta as outras
linhas da mesma janela** — sem isso, dois pacotes do mesmo modelo apareceriam os dois com a tiragem
inteira disponível e o operador embalaria o dobro. Passar da tiragem não trava: a linha diz
*"2.000 un a mais do que a tiragem"* em âmbar.

A caixa ganhou **nome** (opcional: "Camarote", "Staff dia 2"), que aparece no chip da faixa e na
lista do setor. O tipo **"Pacote"** saiu da lista de tipos de volume — uma caixa do tipo "pacote"
com três pacotes dentro seria confusão garantida na estação. Volume já gravado com aquele tipo não
o perde.

Em **Ver volumes**, cada caixa mostra agora os seus pacotes um por linha: `P1 · Credencial VIP ·
3.000 un · 👤 Bernardo Farias`.

#### O peso do setor acompanha a soma

A cada caixa gravada — e a cada caixa excluída — a soma dos pesos entra no campo do setor sozinha, e
a faixa anuncia isso em verde. Continua passando pelo `gravarPeso` de sempre (agente na estação,
PostgREST no site, senha de liberação acima de 5 %), com uma diferença que importa: **a régua compara
com o que já está embalado**, e não com a tiragem inteira. Com três das cinco caixas prontas,
comparar a soma delas com o setor todo acusaria 40 % de divergência num trabalho perfeitamente certo.

Digitar outro número no box continua valendo — é o caso do setor pesado inteiro na balança grande. Aí
a diferença volta a aparecer em âmbar, dizendo que alguém a digitou à mão, e o botão *"Usar 12,480 kg
como peso do setor"* é a saída para voltar à soma.

**A exceção do parceiro não se alargou**: `qtd_volumes` e `tipo_volume` continuam sem receber escrita
nenhuma, e há teste contando quais colunas daquela ficha o painel toca.

#### O modelo embalado por inteiro fecha sozinho

Embalar é terminar. Quando o último pacote de um modelo entra numa caixa, o modelo vira **Pronto** sem
ninguém clicar, e quem assina sai dos pacotes: uma pessoa só assina com o nome dela; duas ou mais
assinam com **o nome do setor** ("Laser"). Quem fez o quê continua escrito, pacote a pacote, na
janela do volume.

Quatro limites, cada um por um motivo: o peso entra **antes** do Pronto (o setor não fecha sem peso);
a trava do peso continua valendo, e o modelo que a esbarra fica para o operador fechar pelo popup de
sempre; **Pronto já dado não é reescrito**, porque é decisão de alguém; e excluir a caixa desce o peso
do setor mas **não** desfaz o Pronto. Cada fechamento automático se anuncia num aviso na tela.

#### Banco

`sql/pacotes_do_acabamento.sql`, aditivo e idempotente: `producao_volumes.nome`, e no pacote uma
chave própria (`id`) mais o `responsavel`. A chave era `(volume_id, modelo_id)`, o que proibia
exatamente o caso pedido. A tabela **não** mudou de nome — renomear quebraria a estação que
estivesse com o painel da versão anterior aberto na tela.

**Testes:** 639 verificações no harness do acabamento (era 594) e 51 no pytest (era 42), incluindo o
caminho inteiro num Chrome de verdade.

---

## [v701 — 2026-08-23] — Acabamento: cada caixa é conferida pela quantidade que leva

Pedido do usuário, no dia seguinte ao dos volumes: *"Ao criar um volume de apenas 1 modelo (dividir
um modelo em mais de um volume) deve ser informado a quantidade de itens do volume e calcular o peso
da quantidade informada, seguindo a mesma regra dos 5% para cada volume, ao criar um volume de vários
modelos, deve somar as quantidades dos modelos selecionados e seguir mesma regra dos 5%"*.

A janela de pesar passa a mostrar, ao lado do campo do peso, **`est. 10,400 kg`** — a quantidade
digitada vezes o peso da peça. Um modelo só ou cinco, a conta é a mesma; o que muda é quantas
parcelas ela tem. Acima de 5 % de diferença, gravar **pede a senha de liberação**, exatamente como o
peso do setor — e é a mesma função e a mesma constante de tolerância, para as duas réguas nunca
discordarem uma da outra.

**A base vem do ERP.** `produtos_proposta.peso_total` é coluna gerada (`peso_uni * qtd`), em gramas;
dividida pela quantidade da linha devolve o peso unitário que o ERP guardou — conferido no pedido
21085: 141.128 g ÷ 27.140 un = **5,2 g a peça**. O modelo chega na sua linha pelo
`id_produto_proposta_origem`. É por unidade, e não por modelo, porque várias credenciais diferentes
saem da mesma linha da proposta — as oito do 21085 saem da linha 2281.

**O que isso fecha.** O peso por setor só é conferido quando o último modelo dele fica pronto. Até
lá, uma caixa pesada errado — 30 kg digitados numa caixa de 3 — passava sem ninguém ver, e a soma dos
volumes só denunciava o engano no fim, com o material já fechado.

Três cuidados que vieram junto:

- **A conta se refaz a cada tecla.** No box do setor a base é fixa (a tiragem inteira); aqui ela muda
  com o que o operador digita — baixar de 3.000 para 1.500 muda o peso esperado da caixa. Por isso as
  quantidades são lidas do DOM, e não do estado de quando a janela abriu.
- **Sem peso no ERP a tela não inventa uma base.** Mostra `est. —` e o volume grava como gravava.
  Modelo sem peso no meio de outros que têm entraria como zero e acusaria divergência em cima de um
  volume certo, então a tela diz `(1 modelo sem peso no ERP)` em vez de esconder o buraco.
- **Cancelar a senha não apaga o trabalho.** A janela do volume é escondida, não desmontada: ao
  cancelar ela volta com os modelos escolhidos e as quantidades digitadas, mais o recado de por que
  não gravou.

33 verificações novas no `tests/acabamento_harness.js` e 5 testes de ligação em
`tests/test_painel_do_acabamento.py`. Documentado em `docs/painel_do_acabamento.md`.

---

## [v700 — 2026-08-23] — Volumes do acabamento, a hora da produção nos Concluídos, e o título do pedido em duas linhas

### Acabamento: volumes por setor — a caixa com peso, dono e o que vai dentro

Pedido do usuário: *"a informação do peso para pedidos com vários volumes, existe a situação em que
1 modelo grande é realizado por vários responsáveis e situações onde vários modelos são pesados
juntos pelo mesmo usuário, situação onde precisaria selecionar vários modelos e criar um volume e
pesar volumes individualmente, e situações onde precisa dividir o mesmo modelo em vários volumes,
nada disso invalida o campo já existente onde precisa informar o peso total do setor"*.

**O volume é a caixa.** Ele tem número (V1, V2, V3…), tipo (Caixa, Pacote, Fardo, Rolo, Palete), o
peso da balança, quem pesou, e uma lista de modelos com **quantidade**. É a quantidade que faz as
três situações caberem num desenho só: um modelo grande vira dois ou três volumes, cada um com o
nome de quem o pesou; um volume leva vários modelos de uma vez; e o mesmo modelo aparece em vários
volumes, somando a tiragem.

**O caminho do operador.** O botão **+ Volume**, na faixa do setor, põe a lista do pedido em modo de
escolha: os modelos daquele setor ganham caixa de marcar, e os de outro setor continuam desenhados,
apagados, dizendo por quê. A lista já está na tela, com foto, cor e tiragem — pedir que ele
reconheça o mesmo material numa segunda lista, mais pobre, dentro de um popup, seria trabalho que a
tela já fez por ele. Em **Pesar este volume**, a quantidade de cada modelo nasce cheia com o que
ainda está fora de volume; diminuir esse número é o que reparte o modelo em várias caixas.

**Setor sem volume nenhum continua sendo 1 volume único**, dito em texto na tela. O pedido simples,
que é a maioria, não ganhou cadastro nenhum, e o card do modelo nem mostra o bloco de volumes.

**O campo do peso do setor não mudou.** Continua digitado à mão, comparado com o estimado e pedindo a
senha de liberação acima de 5 %. Os volumes só põem uma soma ao lado dele. Quando os dois divergem, a
faixa avisa em âmbar — *"o peso do setor está 20 g acima da soma dos volumes"* — e **não trava nada**:
caixa, fita e plástico pesam, e o setor pode ter sido pesado inteiro na balança grande. O botão
*Usar 12,480 kg como peso do setor* passa pelo `gravarPeso` de sempre, e não por um atalho — é ele que
conhece os dois caminhos de escrita e a senha; um atalho ali furaria a liberação. Na janela que cobra
o peso ao fechar o setor, o campo já nasce com a soma dos volumes, e a janela diz de onde o número veio.

**Onde isso mora, e por que ali.** Duas tabelas nossas, `producao_volumes` e `producao_volume_itens`
(`sql/volumes_do_acabamento.sql`). A ficha `propostas_os_setores` tem `qtd_volumes` e `tipo_volume`, e
daria para gravar ali — o usuário decidiu no mesmo dia que **não**. Além de manter estreita a exceção
aberta em tabela do parceiro, é o que faz o recurso funcionar na estação: a ficha do parceiro tem RLS
de `authenticated`, e o operador da gráfica entra pelo código local, sem sessão. Em tabela nossa, com
política de `public`, a estação grava direto pelo PostgREST — sem rota nova no agente e sem os dois
caminhos que a gravação do peso precisa.

77 verificações novas no `tests/acabamento_harness.js` e 8 testes de ligação em
`tests/test_painel_do_acabamento.py`. Documentado em `docs/painel_do_acabamento.md` e
`docs/REGRAS_BANCO.md`.

### Pedidos Concluídos: a coluna deixa de contar tempo e diz quando o pedido entrou em produção

Pedido do usuário: *"Na Lista de Arte, no Card 'Pedidos Concluidos' retirar a marcação de TEMPO,
deixar fixo a data hora em que pedido entrou em Produção"*.

Nos três cards de trabalho — **Em Arte**, **Fila de Aprovação**, **Fila de Aprovados** — a coluna
**Tempo** continua igual: `HH:MM` desde a entrada no card, verde até 1h, azul até 2h, laranja até 3h,
vermelho depois, e o pedido mais parado no topo. Ali o número cobra atenção.

Nos **Pedidos Concluídos** o trabalho de arte acabou, e um relógio que só cresce não mede mais nada:
diz apenas há quanto tempo aquele pedido saiu da tela. A célula passa a mostrar, **parada**, a data e
a hora em que o pedido entrou em produção — o dia em cima, a hora embaixo — e o título da coluna
troca de **Tempo** para **Entrou em Produção** enquanto esse card estiver aceso.

A hora vem do `desde` da tabela `imposition_tempo_no_card`: o momento em que o painel viu o pedido
chegar aos concluídos. Não há outro registro dela — `liberarParaProducao()` grava o status
`EM PRODUCAO` na proposta, sem data. Para o histórico anterior a 19/08/2026, quando a tabela nasceu,
o carimbo é o da primeira vez que o painel viu o pedido, e não o da liberação real.

O que mantém o carimbo parado é a célula sair **sem** a classe `celula-tempo` e sem
`data-tempo-inicio` — os dois que o tique de meio minuto (`atualizarRelogiosDaLista`) procura. Há
teste travando isso, junto com a prova, num Chrome de verdade, de que o carimbo não anda depois do
tique e não alarga a coluna: `tests/tempo_no_card_harness.js` (80 verificações) e
`tests/tempo_na_tela_harness.js` (29 verificações).

### Painel do Acabamento: o título do pedido aberto em duas linhas

Pedido do usuário: *"ao editar um pedido, vamos mostrar o título em 2 linhas, em cima número e Evento
(como já está) e na segunda linha com fonte 20% menor e em amarelo o Nome e número do cliente"*.

```
21085 - Expointer 2026 - Parte 2          ← como já estava
ANGELA BEATRIZ DA COSTA SALOMAO - 53193   ← 20% menor, em amarelo
```

Quem trabalha no acabamento tem o **evento** na mão — é por ele e pelo número que confere, de
relance, que o material na mesa é o deste pedido. O cliente é informação de apoio, e agora se lê sem
disputar espaço com a primeira linha. Linha que não existe não é desenhada: pedido sem evento no
briefing fica com a primeira linha só no número, em vez de terminar num hífen solto.

A segunda linha é `0.8em`, e não um tamanho fixo: ela continua 20% menor que a primeira mesmo que um
dia o título inteiro mude de tamanho.

**Uma armadilha que quase saiu para a gráfica em silêncio:** o `<h1>` do cabeçalho pinta o texto com
um degradê, por `-webkit-background-clip: text` e `-webkit-text-fill-color: transparent`. Esse
transparente é **herdado**, e o degradê se recorta também no texto dos filhos — a linha do cliente
com `color: #fbbf24` e mais nada sairia **cinza clara**, igual à de cima, com o amarelo todo certo no
código e nenhum teste de texto reclamando. Ela devolve o seu próprio `-webkit-text-fill-color`, e há
um harness novo (`tests/titulo_do_acabamento_harness.js`, 9 verificações) que mede a cor num Chrome
de verdade e desenha ao lado o controle sem essa linha, para a armadilha ficar visível na imagem em
vez de virar folclore.

---

## [v699 — 2026-08-23] — Planilha de várias páginas, colunas só quando escolhidas, e a 1ª linha do que é impresso

### Planilha de várias páginas: linha enxuta, e uma numeração por aba

A planilha do Expointer — **19 abas**, uma por setor — não conseguia salvar. O erro chegava como
`TypeError: Failed to fetch`, junto com a falha do preview no Storage.

**A causa, medida:** o app empilha as abas numa tabela só, e como cada aba tem as suas duas colunas, a
tabela ficava com **39 colunas**. Cada uma das 46.921 linhas passava a carregar 39 campos, **37 deles
vazios** — o pacote do salvamento chegava a **45,4 MB** para 3,5 MB de dado real. Nem o Supabase nem o
navegador eram o gargalo (o banco aceita 16 MB em 4 s; o navegador monta 18 MB de JSON em 51 ms): o
que não completava era subir 45 MB pela internet da gráfica.

**1. Cada linha guarda só as colunas da própria página.** O cabeçalho continua sendo a união de todas
— é dele que o editor tira a grade —, mas a linha do EXPOSITOR não carrega mais as células vazias das
outras 18 abas. Chave ausente já é lida como vazia em todo lugar que consome estas linhas (o motor, o
editor, a Conferência de dados), então a economia não custa nada: **45,4 MB → 4,9 MB**.

**2. A tela pergunta o que ela não pode adivinhar.** Ao buscar, a janela "Como trazer esta planilha"
mostra a primeira linha e pergunta se ela é **o nome das colunas** ou **já é dado** — e, quando há
várias páginas, se elas vêm *numa numeração só* (o caminho de antes) ou **uma numeração por página**. A segunda cria uma
numeração para cada aba, copiando formato, tipo e elementos da numeração aberta, com o banco daquela
aba — e cada uma fica ligada à SUA aba pelo `#gid=`, de modo que o 🔄 atualizar da planilha continua
valendo uma a uma. É o que o usuário já fazia à mão no pedido 21085. Maior pacote: **1,04 MB**.

**A pergunta da primeira linha corrigiu um erro que estava passando calado:** as abas dessa planilha
não têm cabeçalho, e o parser tomava a primeira credencial como nome das colunas — sumia **uma
credencial por aba**, 19 no total, e o primeiro código virava o nome da coluna. Marcando "já é dado",
as colunas passam a `Coluna 1`, `Coluna 2`… e a linha volta para o corpo: as 46.921 linhas viraram
46.940. A janela sugere a resposta (cabeçalho não se repete no corpo; cabeçalho todo numérico é raro)
mas quem decide é o operador, e ela só aparece quando há o que decidir.

Os elementos são reapontados pela **posição** da coluna (cada aba tem nomes próprios; a ordem é o que
se mantém). Coluna sem correspondente fica como está e é relatada, em vez de adivinhada.

Testes: `tests/planilha_por_pagina_harness.js` (37 verificações) e `tests/test_planilha_por_pagina.py`.
Conferido com a planilha real: a janela mostra `309013329788 · ESTRANGEIROS` e já sugere "já é dado";
as 19 numerações saem com 600, 40, 1300, 200… linhas — cada uma com a sua credencial de volta — e com
o `gid` da sua aba.

### O banco que chega não desenha nada: a coluna entra quando escolhida

Regra do usuário: *"Ao carregar arquivos .csv ou indicar a url na numeração, não deve carregar as
colunas na janela de visualização, deve trazer para janela apenas quando selecionadas"*.

Os três caminhos que trazem um banco — **upload de arquivo**, **busca na web** e **🔄 atualizar da
planilha** — passam a carregar as linhas e as colunas **sem pôr campo nenhum no ticket**. A coluna vai
para a janela quando o operador clica no botão `📊 Coluna`, que é a única porta por onde ela entra.

Entre a v537 e a v698 valia o contrário: o banco que chegava desenhava um campo por coluna. A razão
era que o canvas vazio depois do upload fica igual ao de antes dele, e quem não conhece a tela conclui
que a busca falhou. **Essa razão continua de pé**, então a criação automática não saiu sozinha — a
tela passou a dizer o passo seguinte, no aviso (*"Clique numa coluna abaixo para pô-la no ticket"*) e
dentro da barra de colunas, que muda conforme o estado: *"Nenhuma coluna está no ticket ainda —
clique na que você quer imprimir"* enquanto não houver campo, e *"Clique numa coluna para pôr mais um
campo no ticket"* depois do primeiro.

Conferido no navegador: com o CSV carregado o ticket fica com **zero** elementos e as quatro colunas
aparecem como botões; um clique em `CODIGO` põe **um** campo, só o dele.

Testes: `tests/test_colunas_so_quando_escolhidas.py` — a função da criação automática não existe mais,
nenhum dos três caminhos chama a porta de entrada da coluna, e os dois recados estão na tela (4 testes).

### Conferência de dados: a 1ª linha traz só o que a numeração imprime

Correção pedida pelo usuário, olhando o pedido 21085: *"esta coluna de células não foi incluída na
numeração, não deve aparecer no relatório"*.

A coluna "1ª linha" mostrava **todas** as colunas do CSV. Passa a mostrar **apenas as que algum
elemento da numeração lê** — as apontadas em `csv_column`. A Conferência de dados responde uma
pergunta só, *o que vai sair no papel está certo?*, e uma coluna que o cliente deixou no arquivo mas
que a numeração ignora não é impressa em lugar nenhum.

O 21085 é o caso que mostrou isso: os 17 CSVs têm duas colunas — o código que o QR lê e uma segunda
que só repete o nome do setor como valor (`"EXPOSITOR SIMERS": "EXPOSITOR SIMERS"`). Nenhum elemento
lia a segunda. Ela dobrava o comprimento do texto, fazia a célula cair para duas linhas em uns
modelos e não em outros, e não dizia nada sobre a produção. Agora cada modelo mostra o seu código,
numa linha só.

Numeração **sem** elemento de banco passa a ficar com a célula vazia, mesmo tendo CSV: nada daquele
arquivo vai para a peça.

Testes: `tests/csv_fatia_do_modelo_harness.js` — só a coluna apontada entrando, duas colunas lidas
saindo as duas, a coluna do banco vazia continuando visível, a coluna apontada que nem existe no CSV
idem, e a numeração sem banco sem linha nenhuma (86 verificações).

---

## [v698 — 2026-08-23] — Conferência de dados: a 1ª linha ao lado da numeração, e o layout que cabe

Ajuste pedido pelo usuário: *"em 'Conferência de dados' deve mostrar na coluna '1ª linha' apenas a
informação da linha, a coluna deve vir após a coluna 'Numeração / arquivo'; não está aparecendo as
últimas colunas, rever layout"*.

**A coluna mudou de lugar e de forma.** Agora vem logo depois de "Numeração / arquivo" e mostra
**apenas os valores** da primeira linha (`IDL1001 · Maria Aparecida da Silva · Construtora Horizonte
Ltda`), sem o nome da coluna na frente de cada um. Repetido linha a linha, esse nome era a mesma
palavra dezenas de vezes na mesma tela — e a largura que ele comia era o que empurrava "Vazios" e
"Situação" para fora da janela. Ele continua no hover e no relatório copiado, onde o texto precisa se
explicar sozinho.

**E o layout passou a caber.** A janela vai a `min(1360px, 96vw)`, as quatro colunas de contagem não
quebram mais em duas linhas, e a tabela rola na horizontal dentro do próprio box se ainda assim
faltar espaço. Medido em 1280, 1366, 1600 e 1920 px: as oito colunas cabem sem rolagem em todas.

Testes: `tests/csv_fatia_do_modelo_harness.js` — a ordem exata das oito colunas, a célula desenhando
valor e não par, e as colunas de contagem sem quebra (85 verificações).

---

## [v697 — 2026-08-23] — Acabamento: peso antes de fechar o setor e hora do Pronto; Concluídos do mais novo ao mais antigo

### Acabamento: o peso antes de fechar o setor, e a hora do Pronto

Pedido do usuário: *"No 'Painel de Acabamento' dentro do pedido, ao marcar o último modelo como pronto
deve exigir indicar a informação do peso do setor que está pronto, só alterar status após o peso real
for indicado. Modelos prontos devem indicar a hora em que ficaram prontos"*.

**O peso do setor virou condição para o último Pronto.** Quando o clique em PRONTO é o que fecha um
setor, o status **não é gravado**: abre um popup pedindo o peso real daquele setor, com o estimado ao
lado, e só depois de o peso entrar no banco é que o modelo vira Pronto. É o momento certo de cobrar —
o material está na mesa e a balança está do lado; depois disso o operador já foi para o próximo
pedido. A cobrança é **por setor**: um pedido com Laser e PVC termina o Laser primeiro, e é o peso do
Laser que se pesa naquela hora.

Se o peso fugir mais de 5 % do estimado, ele cai no popup da senha de liberação que já existia — e o
Pronto continua pendurado: senha certa fecha o setor, senha errada não fecha nada, e cancelar a senha
traz o popup do peso de volta. **A trava não se aplica** quando não há onde gravar o peso: modelo sem
setor, setor que já tem peso, ou tela sem estação e sem sessão do Vibe (ali o campo de peso nem
existe). Trava sem saída é a coisa que esta tela não pode ter.

**Modelo Pronto passou a mostrar a hora.** Abaixo dos botões: `🕒 Pronto às 14:32`, e
`🕒 Pronto em 22/08 às 14:32` quando não foi hoje. Quem escreve a hora é o **banco** — a coluna nova
`pedidos_modelos.acabamento_pronto_em`, carimbada pelo gatilho `trg_carimba_acabamento_pronto_em`
(`sql/hora_do_pronto_no_acabamento.sql`) — e não a tela: o estágio é gravado daqui, da estação e
mexido pelo ERP, e um carimbo feito no frontend deixaria buracos justamente nos modelos que a gráfica
tocou pelo acesso local. O gatilho apaga a hora quando o modelo sai de Pronto e não a renova quando
alguém reclica no botão que já estava aceso.

Modelo marcado Pronto **antes de hoje não tem hora**, e a migração não inventou uma: `updated_at`
muda a cada foto, responsável ou observação, e uma hora aproximada seria lida como a de verdade por
quem está de pé na estação. Esses cards não mostram carimbo nenhum.

Testes: `tests/acabamento_harness.js` — o texto da hora nos dois formatos, o card com e sem carimbo, o
último Pronto abrindo o popup em vez de gravar, o setor com peso passando direto, o modelo que não
fecha o setor passando direto, a tela sem caminho para o peso não prendendo nada, e o popup gravando
o peso e só então o Pronto (470 verificações); `tests/test_painel_do_acabamento.py` trava a migração,
o gatilho e a trava na única porta do status (28 testes). Conferido no navegador.

### Lista de Arte: Pedidos Concluídos sai do mais novo ao mais antigo

Pedido do usuário: *"Na lista de arte, no card Pedidos concluídos, listar os pedidos do mais novo ao
mais antigo"*.

Os cards da Lista de Arte são fila de trabalho, e neles o topo é do pedido **mais parado** — regra de
19/08/2026, porque é ele que precisa de atenção. **🏆 Pedidos Concluídos é outra coisa**: é
histórico. Não há nada a fazer ali, e quem abre quer ver o que acabou de sair. Agora ele sai do mais
novo ao mais antigo, e os outros quatro cards seguem exatamente como estavam.

"Mais novo" ali é o **número do pedido**, que cresce com o tempo. De propósito não é o relógio dos
cards: ele só existe desde 19/08/2026 e carimba `desde = agora` na primeira vez que vê um pedido, de
modo que todo o histórico anterior nasceu com a mesma data e sairia empatado. Pedido sem número vai
para o fim, em vez de virar zero e encabeçar a lista.

A regra está presa à **base** dos concluídos, e não ao card aceso: com um filtro de estágio ligado o
card continua aceso mas a lista já é outra, e ali vale a ordem da fila de trabalho.

Testes: `tests/tempo_no_card_harness.js` — a ordem decrescente, a lista de origem intacta, o pedido
sem número no fim, a lista vazia, a independência do relógio e a marcação na escolha da base; a regra
antiga dos outros cards continua travada logo acima (68 verificações). Conferido também no navegador:
com o card aceso a lista sai 21085, 21002, 20951, 20872, 20500, e a fila de aprovação continua na
ordem de antes.

---

## [v696 — 2026-08-23] — Conferência de dados: a coluna com a 1ª linha de cada modelo

Pedido do usuário: *"No botão 'Conferência de dados', que gera o relatório sobre o banco csv, incluir
uma coluna trazendo a primeira linha de cada modelo"*.

É por onde a fatia daquele modelo **começa**. Numa numeração dividida entre vários modelos — o caso
das credenciais —, ler a primeira linha de cada um é o jeito mais rápido de ver que a distribuição
saiu certa (`CODIGO: 1001` num, `CODIGO: 1051` no outro) sem abrir o CSV modelo a modelo. Por isso a
linha vem da **fatia**, e nunca do topo do banco inteiro.

As **colunas do banco vêm primeiro**, em branco forte, porque são as que vão para o papel — e
aparecem mesmo vazias, como `(vazio)`: coluna apontada em branco na primeira linha é exatamente o que
este relatório existe para mostrar. As outras colunas do CSV vêm depois, em cinza, e só quando têm
valor: numa credencial é o NOME que faz o operador reconhecer a fatia, mesmo que o QR leia outra
coluna. `__id`, `__ativo` e `__fotos` ficam de fora — são controle nosso dentro da linha, não dado do
cliente.

Numeração **sem** elemento de banco também mostra a 1ª linha, se tiver CSV: o dado existe, e é dele
que o operador quer ver o começo. O que ela continua não tendo é contagem de códigos. Na tela cabem
seis pares e o resto vira `+N`; a linha inteira fica no title e no **relatório copiado**.

Testes: `tests/csv_fatia_do_modelo_harness.js` — a 1ª linha saindo da fatia de cada modelo (e não do
topo do banco), a coluna do banco na frente e marcada, a vazia aparecendo e a coluna comum vazia não,
a coluna apontada que nem existe no CSV ficando visível, as chaves de controle fora, a numeração sem
banco, e a presença no texto copiado e na tabela (78 verificações no total).

---

## [v695 — 2026-08-22] — A lista do botão IMPRESSO sai do mais recente ao mais antigo

Pedido do usuário: *"No Painel de Produção, ao selecionar os pedidos 'Impressos' deve mostrar a lista
do mais recente ao mais antigo, pela data de status 'Impresso'. Apenas ao selecionar botão
'IMPRESSO'"*.

**O banco não guardava essa data.** Guardava o status, e nada sobre quando ele foi marcado.
`updated_at` não servia: ela muda em qualquer gravação do modelo — cor, gabarito, observação — e
estava **nula em 57 dos 129 modelos impressos**. Ordenar por ela poria no topo o pedido que alguém
abriu por último, e não o que saiu por último da impressora.

Então nasceu `pedidos_modelos.status_impressao_em`, carimbada por um **gatilho no banco**
(`sql/data_do_status_impresso.sql`), e não pela tela: quem marca "Impresso" pode ser o site, o
agente local pela estação ou o ERP do parceiro pela tela dele, e um carimbo escrito no frontend
deixaria a lista com buracos exatamente nos pedidos que a gráfica tocou pela estação. O gatilho
também **apaga** a data quando o modelo sai de Impresso, e **não renova** o carimbo quando alguém
regrava o mesmo status — senão reabrir o seletor e escolher o que já estava lá empurraria o pedido
de volta ao topo.

A data do **pedido** é a maior entre as dos modelos dele: o pedido só fica impresso quando o último
modelo é marcado. **Apenas o botão IMPRESSO** usa essa ordem — Geral, Para Hoje e Atrasados são
fila de trabalho, e ali quem vem na frente é quem precisa sair primeiro. E **clicar num cabeçalho
continua vencendo**: escolher uma coluna é decisão explícita do operador.

O histórico anterior a hoje foi preenchido por aproximação (`updated_at`, ou `created_at` onde ela
era nula), para os 42 pedidos já impressos não saírem todos empilhados no fim da lista. Conferido
com os dados de verdade: os 42 têm data, e a ordem cai do início ao fim.

Também corrigido um teste que mentia desde a v689: o `tests/lista_arte_harness.js` procurava
`return;` no trecho da trava de banco do MARCAR PRONTO, e a função passou a devolver `return false;`
quando ganhou as ações em lote. O produto estava certo; o teste é que envelheceu.

Testes: `tests/ordem_dos_impressos_harness.js` (17 verificações) e `tests/test_ordem_dos_impressos.py`
(7 testes) — a data do pedido como a do último modelo, a ordem decrescente, quem não tem data no
fim, o desempate pelo número maior, o gatilho só agindo quando o status muda, e a migração sem
tocar em tabela do parceiro.

---

## [v694 — 2026-08-22] — Acabamento: título do pedido como o da tela de Pedido, cores novas por estágio e decisões sem caixa

Pedido do usuário, com as duas telas lado a lado: *"Mostrar as informações do título acabamento igual
mostra título produção: número, evento, cliente, número cliente, mesmo tamanho de fonte, sem box"*.

O cabeçalho do pedido aberto perdeu a faixa cinza (`prod-table-header` — era ela o "box") e ganhou o
**mesmo título da tela de Pedido**: `21085 - Expointer 2026 - Parte 2 - ANGELA BEATRIZ DA COSTA
SALOMAO LTDA - 53193`, tudo numa linha, no mesmo tamanho de fonte (`calc(2.2rem + 5pt)`) e com o
degradê do título das outras telas. Antes eram três pedaços em tamanhos diferentes — "Itens do
Pedido #200" miúdo, o evento médio e o cliente pequeno.

O cliente vem do `rotuloDoCliente`, que já traz o número junto do nome. Pedaço que não existe não
deixa buraco: pedido sem evento vira `21085 - CLIENTE`, e não `21085 -  - CLIENTE`.

Duas miúdezas de CSS ficaram documentadas porque custaram tempo: o degradê termina em `#cbd5e1` (com
o `#94a3b8` do CSS, a segunda linha — o nome do cliente — saía apagada), e precisa ser
`background-image` e nunca o atalho `background`, que reescreve o `background-clip` e transforma o
título numa barra branca.

**E as cores por estágio mudaram**, por escolha do usuário: **Aguardando `#003768`**, **Impresso
`#001249`**, **Em acabamento `#000000`** e **Pronto `#00471c`**. Elas pintam o bloco de cada modelo e
a linha do pedido na fila, para o estágio se ler de relance sem procurar o selo. Continuam sem
acompanhar a paleta da tela, de propósito, e há teste travando cada uma.

**A coluna das decisões perdeu a caixa.** Os quatro botões e o seletor de responsável ficam direto
sobre o fundo do bloco: os botões já têm contorno e cor próprios, e a moldura em volta deles só
competia com a do modelo.

Testes: `tests/acabamento_harness.js` — o título com as três partes na ordem, o caso sem evento, o
tamanho de fonte e o degradê vindos da tela de Pedido, a ausência da faixa, e as cores novas de
Aguardando e Pronto (449 verificações); `tests/test_painel_do_acabamento.py` trava as quatro cores.

---

## [v693 — 2026-08-22] — Card do modelo em três colunas, e o título igual ao do Painel de Produção

Pedido do usuário: *"box das especificações ficou muito bom, mas pode reduzir a metade do tamanho na
horizontal, sem reduzir o conteúdo; à direita do box vamos mover os botões de Status para lateral
direita, um abaixo do outro, e o drop do responsável abaixo dos botões"* e, logo depois, *"Título do
pedido no painel de acabamento deve seguir mesma formatação do pedido do painel de produção"*.

**O card em três colunas.** Amostra (elástica), **Especificação** com metade da largura de antes
(280px, mesmo conteúdo — o que encolheu foi o respiro lateral das células, e o rótulo ganhou
`nowrap` para não quebrar em duas linhas) e, à direita dela, a coluna das **decisões**: os quatro
botões de status **um abaixo do outro** e o **responsável abaixo deles**. A faixa de decisões no
rodapé do card deixou de existir — de pé na estação, o operador percorria a linha inteira do card
para chegar até ela. O recado da trava passou a apontar para baixo ("⬇️ Escolha o Responsável abaixo
para liberar o status"), que é onde ele ficou.

**O título do pedido aberto** virou `📋 Itens do Pedido #200` — mesmo ícone, mesmo texto e mesmo azul
claro do pedido aberto no Painel de Produção. As duas telas são irmãs, e títulos diferentes faziam
parecer que eram dois programas. O **evento** continua ao lado, em destaque, com o cliente abaixo. Na
**lista** o número segue no crachá grande, igual ao da fila da Produção: lista com lista, cabeçalho
com cabeçalho.

Testes: `tests/acabamento_harness.js` — as três colunas na ordem certa, os botões empilhados numa
coluna só, o título com o número como na Produção, e o recado apontando para o responsável abaixo
(451 verificações no total).

---

## [v692 — 2026-08-22] — Pedido aberto no Acabamento: número e evento em destaque, e o modelo em tabela

Pedido do usuário: *"Ao abrir o pedido, no Painel de Acabamento, destacar Número do pedido e Evento,
como já aparece no pedido do Painel de Produção"*.

O cabeçalho do pedido aberto passa a mostrar o **número no mesmo crachá da fila** — número grande,
fundo em degradê, sombra, o desenho que o Painel de Produção usa — e o **nome do evento** em ciano
forte ao lado, com o cliente abaixo, menor. Antes havia só "Modelos do Pedido #200" em texto azul e
o cliente em cinza; o evento não aparecia em lugar nenhum depois de abrir o pedido.

A ordem segue o trabalho: quem está no acabamento tem na mão o material de um **evento**, e é por
ele e pelo número que se confere, de relance, que o que está na mesa é o deste pedido. O nome vem de
`pedidos_artes.nome_evento` (`eventoDoPedido`, agora escrito uma vez só e usado pela busca, pela
lista e pelo cabeçalho); sem evento no briefing, o campo some em vez de deixar um buraco. O crachá
do número virou `ESTILO_CRACHA_NUMERO`, compartilhado pela lista e pelo cabeçalho.

**E as informações de cada modelo viraram tabela.** No mesmo dia, com a imagem do desenho em mãos, os
oito quadradinhos ao lado da amostra deram lugar a uma tabela **ESPECIFICAÇÃO**: rótulo à direita da
primeira coluna, valor na segunda, **em negrito** — são as informações variáveis, as que o operador
confere contra o material na mesa. As linhas são Quantidade Total (`500 un`), Numeração de (`1 a
500`), Bloco (`50 unidades`), **Numeração** (o nome — faltava no desenho e o usuário pediu que
entrasse), Cor, Impressão (Frente/FxVerso) e Situação (o que a Produção diz). Falta de dado vira
`—`, nunca meia informação. Mapa de teatro (CAMAROTE) troca as três primeiras por Quadrantes,
Lugares e Cadeira inicial.

Testes: `tests/acabamento_harness.js` — o número aparece no crachá grande, o evento do pedido certo
(e não o de outro), o cliente ao lado, o campo do evento some quando não há briefing, e a tabela traz
as sete linhas com os valores em negrito (448 verificações no total).

---

## [v691 — 2026-08-22] — O status do acabamento só muda depois de escolher o responsável

Pedido do usuário: *"Só permitir alterar o status após selecionar o responsável"*.

No Painel do Acabamento, o modelo que ainda não tem responsável escolhido fica com os **quatro
botões de status travados**, e um recado ao pé deles diz o que falta: *"⬅️ Escolha o Responsável ao
lado para liberar o status"*. Marcar um estágio é dizer que **alguém** fez aquele trabalho — sem
nome, o registro não responde à pergunta que o setor faz depois: quem acabou este material.

Travar não é esconder: os quatro botões continuam à vista e o estágio atual continua marcado, porque
ler em que ponto o modelo está é o que todo mundo precisa. Escolhido o responsável, os botões
liberam **na hora**, sem precisar de ATUALIZAR. E a trava vale também na função que grava
(`mudarEstagio`), não só nos botões: botão cinza não impede ninguém de chamar pelo console, e essa é
a única porta por onde o status do acabamento é escrito.

Testes: `tests/acabamento_harness.js` — modelo sem responsável tem os quatro botões travados e o
recado, o com responsável fica livre, chamar a função direto não grava e avisa o porquê, e depois de
escolher o responsável o mesmo clique grava (420 verificações no total).

---

## [v690 — 2026-08-22] — Perfil "Acabamento" no Acesso Local, e o seletor de responsável só com ele

Pedido do usuário: *"No gerenciamento de usuários criar o Perfil 'Acabamento' para o Acesso Local —
NewProd; as permissões serão apenas para visualização e edição no Painel do Acabamento; apenas os
perfil 'Acabamento' aparecem como opção no drop 'responsável'"*.

**O perfil.** ✂️ **Acabamento** entra no seletor de perfil (card *Acesso Local — NewProd*, e também
o dos usuários do site) com **uma tela só**: ver e editar o Painel do Acabamento, e nada mais — nem
fila da impressora, nem pedido, nem cadastros, nem gerar PDF ou imprimir. Quem tem esse perfil abre
o dia direto no Painel do Acabamento (`ROLE_HOME`).

**O seletor "Responsável".** Passa a listar **só os acessos locais ativos com o perfil Acabamento**.
Antes vinham todos — designers, impressores, o administrador — e escolher o responsável virava
procurar três nomes no meio de quinze. O nome **já gravado** num modelo continua aparecendo mesmo
fora do perfil: apagá-lo faria o trabalho parecer sem dono. Sem ninguém no perfil, o seletor diz o
que fazer — escolher ✂️ Acabamento em *Usuários → Acesso Local — NewProd* e voltar em **ATUALIZAR**.

**Sem SQL de migração.** O perfil vive no código; quem é do setor é decisão de quem administra, um
acesso de cada vez na tela — que pergunta antes de reescrever a grade de alguém.

**E o status virou botão.** No mesmo dia, a pedido do usuário, o seletor de estágio de cada modelo
deu lugar a **quatro botões do mesmo tamanho** (⏳ Aguardando, 🖨️ Impresso, ✂️ Em acabamento, ✅
Pronto). O do estágio atual vem pintado por dentro na cor daquele estágio, com anel, sombra e um ✓
— os outros ficam contornados. Ver onde o modelo está deixou de exigir abrir uma lista, e mudá-lo
passou a ser um clique. As cores continuam sendo as dos selos, e o fundo do bloco segue mudando com
o estágio como já fazia. Sem permissão de editar, os quatro travam — e o marcado continua marcado.

Testes: `tests/grade_do_acesso_local_harness.js` (o perfil liga só as duas caixas do acabamento, e
declara todas as outras), `tests/acabamento_harness.js` (operador de outro perfil não aparece; o
responsável gravado fora do perfil continua aparecendo; sem ninguém no perfil a tela diz o caminho)
e `tests/test_painel_do_acabamento.py` (rótulo, tela inicial e o filtro).

---

## [v689 — 2026-08-22] — Ações em lote no pedido: Marcar PRONTO, Em Alteração e Aprovar todos os modelos

Pedido do usuário: *"Cria um botão (ação) dentro do pedido para Marcar Pronto, Reprovar e Aprovar
simultaneamente todos os modelos do mesmo pedido, respeitando que aprovação e reprovação somente
usuário ADM e Atendimento"*.

**O que muda.** No banner do pedido aberto (tela Amostras), uma linha nova **"Todos os modelos:"**
com três botões: **🎨 Marcar todos PRONTO**, **❌ Todos em ALTERAÇÃO** e **✅ Aprovar todos**. Cada um
faz, modelo a modelo, exatamente o que o botão do card faz — a mesma `decisionAmostraItem`, com as
mesmas travas (Qtd × linhas do banco, elemento de banco sem CSV ou coluna, modelo aprovado pelo
cliente), a arte de aprovação regerada no PRONTO e o "Enviar Arte" automático quando todos ficam
PRONTO. Nada novo é escrito no banco. No link do cliente a linha não existe.

**Quem pode o quê.** Marcar PRONTO: todo mundo que abre o pedido. Em ALTERAÇÃO e Aprovar: **só ADM e
Atendimento** (`podeAgirEmLoteNoPedido`, pela sessão do site ou pelo acesso local da estação) — os
outros papéis leem *"só ADM e Atendimento"* no lugar dos dois botões, e a função recusa mesmo se
chamada pelo console.

**Plano e confirmação.** Antes de agir, `planoDaAcaoEmLote` separa quem entra de quem fica de fora,
com o motivo: já está pronto / aprovado pelo cliente — não se altera / divergência de células / banco
incompleto (PRONTO); já está aprovado (Aprovar); já está em alteração / aprovado e quem clicou não
destrava (Alteração). Uma janela mostra o texto (`textoDoPlanoEmLote`: *"Marcar PRONTO em 3 de 5
modelos do pedido. Ficam de fora: …"*) e pede confirmação. **Todos em ALTERAÇÃO** pede uma anotação
única, obrigatória, que vai para os modelos sem anotação e é acrescentada nos que já têm. Os modelos
são processados em sequência, com aviso de progresso, e no fim um único recarregamento e um único
aviso com o resumo (feitos, de fora, falhas).

**Por baixo.** `decisionAmostraItem(itemId, osId, status, opts = {})` ganhou `opts.obs` (substitui o
textarea) e `opts.emLote` (sem aviso nem recarga por modelo) e passa a devolver `true`/`false`; sem
`opts` nada muda. O bloco "todos PRONTO → Enviar Arte" virou `promoverPedidoSeTodosProntos(osId)`,
chamada pelo caminho por modelo e pelo executor `acaoEmLoteNoPedido`. Testes:
`tests/acao_em_lote_harness.js` (84 casos: papéis × ações, cada motivo de pular, texto do plano,
nome do modelo) e `tests/test_acao_em_lote.py` (ligação: container no HTML, assinatura nova,
promoção nos dois caminhos, botões atrás de `podeAgirEmLoteNoPedido`).

---

## [v688 — 2026-08-22] — Painel do Acabamento para todos: ver e editar, no site e na estação

Pedido do usuário: *"o Menu Painel do Acabamento deve aparecer e ser editável a todos os usuários,
ajustar permissões, mesmo marcando não está visualizando"*.

**O que estava acontecendo.** São duas grades de permissão, e marcar numa não muda a outra. A dos
usuários do **site** (`imposition_user_permissions`) já tinha VER para quase todos, mas EDITAR só para
quem editava a Produção — atendimento e designer não marcavam o estágio do material. A da **estação**
(`imposition_acessos_locais.permissoes`, o JSON que o código local aplica) foi gravada antes de o
módulo existir em três acessos (Bernardo, Eduardo, Gustavo): sem a chave, a estação tratava como
"não" e o menu sumia — por mais que o administrador marcasse caixas na grade do site.

**O que muda.** `ROLE_DEFAULTS` e os padrões da Edge Function ligam VER e EDITAR do Acabamento em
todo perfil. Na estação, `permsDoOperadorLocal` passa a completar chave **ausente** com o padrão do
perfil, em vez de "não" (chave presente continua mandando, inclusive quando diz não). E
`sql/acabamento_para_todos.sql` ligou as duas chaves em todas as grades existentes — só essas duas;
o resto da grade fica como o usuário deixou. Rodado no banco em 22/08/2026: todos os usuários do
site e os 7 acessos locais vendo e editando.

**Quando vale.** No site, no próximo F5. Na estação, o agente baixa a lista em até 5 minutos e o
F5 seguinte traz a grade nova. Testes: `tests/grade_do_acesso_local_harness.js` (35 casos) e
`tests/test_painel_do_acabamento.py`.

---

## [v687 — 2026-08-22] — Botão 🔎 Conferência de dados no pedido

Pedido do usuário: *"criar um botão dentro do pedido que faça essa análise do pedido quando
clicado"* — a revisão que tinha sido feita à mão no 21085, agora na tela, para qualquer pedido.

No cabeçalho do pedido aberto, **🔎 Conferência de dados** relê do banco as numerações dos modelos e
abre uma janela com: o resumo (✅ nenhum problema, ou a lista dos pontos de atenção); uma linha por
modelo com numeração e arquivo CSV, **linhas da fatia × Qtd**, códigos distintos, **repetidos
dentro do próprio CSV**, **células vazias** e a situação segundo as três regras do card (banco
incompleto, Qtd × células, células repetidas com outro modelo); e **📋 Copiar relatório** em texto.
Modelo cuja numeração não usa banco aparece como "não usa banco", sem ser cobrado por CSV.

A conta é pura (`conferenciaDeDadosDoPedido`) e o harness da fatia a lê do `script.js` com um
pedido misto (limpo, repetido dentro, vazio, sem CSV, sem banco, repetido entre modelos) e um
pedido limpo.

---

## [v686 — 2026-08-22] — Aviso de células do banco repetidas entre modelos

Regra do usuário: *"informar nos modelos quando alguma célula de banco de dados utilizada na
numeração de um modelo corresponder a uma célula de outro modelo"*.

No card do modelo, uma faixa âmbar (aviso, não trava) quando um valor que **este** modelo imprime —
a coluna apontada por cada elemento de banco de dados, nas linhas da fatia dele — também está no
banco de **outro** modelo do mesmo pedido: quantas células, com quais modelos e até três exemplos,
mais a saída (repartir em 🧩 Linhas quando é o mesmo CSV; conferir os arquivos quando são bancos
diferentes). Valores vazios não contam; a comparação é pelo texto exato.

Nasceu do pedido 21085: os três modelos "Veículo" herdaram a numeração do Expositor SIMERS pelo
"aplicar a todos" e imprimiriam os mesmos 4.000 códigos — credencial repetida, porta que abre duas
vezes. A conta é feita uma vez por pedido (`celulasRepetidasDoPedido`); no link do cliente não. O
harness da fatia exercita: mesma numeração sem fatia (tudo repete), fatias disjuntas (nada),
bancos diferentes com um código em comum (os dois lados avisados), numeração sem elemento de banco
(fora da conta).

---

## [v685 — 2026-08-22] — Elemento de banco de dados sem CSV ou sem coluna trava o PRONTO

Regra do usuário: *"sempre que um elemento do tipo Banco de Dados estiver presente na numeração,
necessariamente precisa ter um banco de dados e uma coluna associados a ele; quando não houver,
mostrar uma mensagem no modelo e impedir marcar PRONTO"*.

No card do modelo, ao lado da regra de células: se a numeração tem elemento `source: 'database'`
e **não tem CSV**, ou algum desses elementos está **sem coluna** ou aponta para **coluna que não
existe** no CSV, aparece a faixa vermelha com o que falta e o que fazer (abrir a numeração no ✏️,
carregar o CSV, apontar a coluna), e o **MARCAR PRONTO** fica trancado — no botão e no clique.
Como o pedido só vira "Enviar Arte" com todos os modelos PRONTO, isso segura o pedido até a
numeração ficar completa.

Nasceu do pedido 21085: onze modelos apontavam para a "Expointer 2026", que tinha o QR de banco de
dados e nenhum CSV — impresso, o QR sairia vazio. No link do cliente a trava não aparece. A regra é
pura (`bancoDeDadosIncompletoDoModelo`) e o harness da Lista de Arte a lê do `script.js`.

---

## [v684 — 2026-08-22] — O lápis do card volta a abrir a numeração inteira

Relato do usuário logo depois da v683: o ✏️ do card do modelo abria o editor sem trazer a
numeração. Defeito meu, da v683: a releitura das numerações do pedido punha no catálogo em memória
a linha **crua** do banco — com o elemento `METADATA` ainda dentro de `elements`, que o `api()`
sempre removeu ao ler — e o editor recebia um elemento a mais.

A normalização virou uma função só, `normalizarNumeracaoLida` (tira o METADATA, preenche o
`print_mode`), usada nos três lugares que leem numeração do banco: a lista do catálogo, a leitura
por id e a releitura do pedido. O harness confere a função e os três usos.

---

## [v683 — 2026-08-22] — O catálogo de numerações é relido ao abrir o pedido

Relato do usuário, com print: no pedido **21085**, o card do modelo 1000496 dizia *"esperado 4000 ·
gerado 19500 · sobram 15500"* e o seletor mostrava **"Expointer 2026"** — enquanto o banco tinha o
modelo apontando para a numeração **1000496**, com 4.000 linhas.

O banco estava certo; a **aba** estava velha. Os modelos de um pedido já eram relidos do banco a
cada abertura na Lista de Arte, mas o **catálogo de numerações** (`state.numeracoes`) só era
recarregado inteiro quando *aquela* aba salvava alguma coisa. Numa aba aberta de manhã: a
"Expointer 2026" ainda constava **com** o CSV de 19.500 linhas que ela teve das 09:54 às 10:19 (e
que outra aba tirou), e a 1000496, criada às 10:43 em outra aba, nem constava — então o seletor caía
na primeira opção, e a conta de células usava um CSV que não existia mais. Foi o que o usuário leu
como "excluir o CSV não apaga os registros".

**O que mudou.** `recarregarNumeracoesDoPedido(osId)` relê do banco **só as numerações que os
modelos do pedido usam** (uma consulta pequena, pelos ids) e as mescla no catálogo em memória —
linha nova substitui a velha pelo id, a que não existia entra. Ela roda em três lugares: ao abrir o
pedido na **Lista de Arte** (logo depois de reler os modelos), ao **mandar um modelo para a
Imposição** e ao **abrir o pedido inteiro na Imposição** — assim o que vai para a folha é a
numeração do banco, nunca a da aba. Sem rede, ela não lança: a tela segue com o que tem, como antes.

A mescla é pura e o harness da Lista de Arte a lê do `script.js`; os três pontos de chamada também
são conferidos lá.

**Para quem estava com a tela aberta:** um F5 já trazia o estado certo; de agora em diante, abrir o
pedido basta.

---

## [v682 — 2026-08-22] — Numeração sem CSV não empresta as linhas da vizinha

Relato do usuário: a numeração **"Expointer 2026"**, sem CSV nenhum no banco, mostrava no card do
modelo que ele tinha **19.500 linhas** — e parecia que excluir o CSV não apagava os registros.

O banco estava certo: a Expointer foi salva sem CSV às 10:19, e excluir apagou mesmo. As 19.500
eram da numeração **1000475** (o `EXPOSITOR.csv`, 2 colunas, 1,1 MB), que tinham ficado na
**memória do navegador**: em `state.csvData` (a fatia montada quando o operador olhou um modelo
dela) e em `state.numCsvData` (o editor). `linhasDaAmostra` tenta três fontes — CSV da numeração,
CSV do modelo, CSV "solto" — e, como a Expointer tem um elemento de banco de dados, a tela pedia
linhas, não achava nenhuma dela e caía no terceiro degrau, pegando as da vizinha. Um F5 fazia sumir.

**O que mudou.** O terceiro degrau só existe para CSV que não pertence a numeração nenhuma: o
arquivo subido na caixa da Imposição ou o mapa de teatro. A fatia de uma numeração passa a ser
marcada (`state.csvDataDerivado`) nas duas telas de imposição — `script.js` e o clone `pedido.js` —
e nunca é emprestada; o estado do editor (`numCsvData`) deixa de contar para o desenho do modelo.
Há teste lendo a função de verdade do `script.js` (não uma cópia) com o cenário da Expointer, e
ele reprova o código antigo.

**O que não mudou.** Numeração com CSV continua entregando a fatia do modelo; CSV subido na caixa
da Imposição continua servindo a amostra avulsa; nada foi escrito no banco.

---

## [v681 — 2026-08-21] — O peso estimado por setor, e a senha semanal que libera a divergência

### O estimado ao lado do peso real

Pedido do usuário. No box *Peso por setor* do pedido, cada setor passa a mostrar, ao lado do
campo, o **peso estimado** — `est. 4,160 kg` — e, quando há peso digitado, a divergência em
porcentagem (`· +8,2%`, em âmbar acima de 5 %).

O estimado **não existe como coluna por setor** no ERP: ele é a soma de
`produtos_proposta.peso_total` (coluna gerada `peso_uni × qtd`, em **gramas**) das linhas do
pedido cujo produto tem aquele `setor_pcp`, convertida para quilos. É leitura, nos dois
caminhos (estação e site), e confere com o que a balança vem dando: 21000/FLEXO est. 4,160 ×
real 4,16; 20974/LASER 0,450 × 0,45. Setor sem peso cadastrado no produto mostra `est. —`.

### Até 5 % grava; acima, só com a senha de liberação

`|real − estimado| / estimado` até **5 % inclusive** grava como sempre. Acima disso a gravação
fica **pendente** e abre um popup com o digitado, o estimado e a divergência, pedindo a **senha
de liberação**. *Cancelar* devolve o valor anterior ao campo; senha errada avisa e não grava;
senha certa grava pelo caminho de sempre. Sem estimado não há com o que comparar, e o peso
grava direto.

Quem confere a senha é o **servidor**, nunca a tela: na estação o agente repassa à Edge
Function `acesso-estacao` (`POST /api/senha-liberacao/conferir`); no site é a função
`painel`. A senha nunca desce para a tela do operador — ela recebe sim ou não.

### A senha: automática, semanal, 3 caracteres

**1 letra + 2 números** (ex.: `K47`), derivada de um segredo novo (`PESO_LIBERACAO_SEGREDO`, em
`imposition_segredos`, sorteado dentro do próprio banco) e da **semana** no fuso de São Paulo.
Muda sozinha toda segunda-feira 00:00; ninguém gera nada e não há tabela de senhas. Ela
aparece no **menu Usuários**, num card próprio com a semana de validade, para quem pode ver
aquele menu (Administrador e Gerente) — a mesma regra da lista de códigos locais.

O que **não** mudou: a gravação do peso, as tabelas do parceiro (nada novo é escrito) e o
banco (nenhuma tabela ou coluna nova — só a linha do segredo). As rotas da estação no
`acabamento.js` passam de três para quatro; o endereço continua montado num lugar só.

---

## [v680 — 2026-08-21] — O card do modelo, refeito em três andares

Pedido do usuário, com a tela na mão: as informações do modelo no pedido aberto estavam "muito
mal distribuídas" — dados, seletores e a faixa da foto empilhados numa coluna só, o botão de
fotografar pesando mais que os seletores. Ele pediu o botão menor e no canto superior direito,
status e responsável na base, e "melhorar geral".

O card agora conta a história do trabalho de cima para baixo:

- **Topo — quem.** Bolinha da cor, nome, código e selo do estágio à esquerda; a **foto do
  material** à direita, num botão compacto. Quando há foto, a miniatura (46 px, sem canto
  arredondado) fica ao lado dele e o texto vira *Refazer foto*; sem foto, um "Nenhuma foto do
  material ainda" em texto miúdo, porque o card continua dizendo o que tem e o que não tem.
- **Meio — o quê.** A amostra de um lado e os dados do outro, **ainda metade a metade** (pedido
  de 20/08); os oito dados (Qtd, Nº inicial, Nº final, Bloco, Cor, Numeração, Verso, Impressão)
  saíram de duas fileiras tortas para uma grade alinhada em colunas, centrada na altura.
- **Base — a decisão.** *Status do acabamento* e *Responsável*, os dois únicos campos que esta
  tela escreve, numa faixa própria mais escura, separada por fio. É onde o olho cai.

Nada mudou no que é gravado, nem na cor do card (ela continua dizendo o estágio). Os testes que
travam a meia caixa e a imagem sem moldura continuam valendo — os dois pegaram a primeira versão
do desenho e foram respeitados.

---

## [v679 — 2026-08-21] — A lista do Acabamento lê os modelos do banco, não o cache da proposta

Relato do usuário, com print: pedidos já impressos apareciam na lista como **Aguardando**, e o
progresso dizia *0/1 mod.* num pedido de oito modelos. A cor da linha estava certa; o selo, não.

A causa não era o estágio nem o dado — o banco estava certo (`IMPRESSO` nas duas grafias, e a
tela normaliza as duas). Antes de o pedido ser aberto, `state.osItens` **não guarda modelo
nenhum**: guarda o cache da **proposta** do parceiro (`_source: 'vibecode'`), montado a partir
de `produtos_proposta`. Ali existe uma linha por *produto contratado*, sem `status_impressao` e
sem `acabamento_status`. O pedido 20975 é o retrato: um item de 320 no cache, contra oito modelos
de 40 que a gráfica criou no banco, todos impressos. Sem status de impressão, a derivação só
podia responder "Aguardando".

Agora `osItens` só vence quando todas as linhas trazem `_dbLoaded` — a marca que o `script.js`
põe quando busca os modelos de verdade; sem ela, vale `modelosGlobais`, que são os modelos do
banco. É a mesma decisão que o `renderOrdens` da Produção toma no `needsFullLoad`. Quando o
pedido é aberto, as linhas completas voltam a mandar, e o detalhe não perde nada.

Há teste com o cenário do 20975, conferido contra o código antigo: ele reprova sem a correção.

---

## [v676 a v678 — 2026-08-21] — A linha do pedido ganha a cor do estágio, e os azuis que o usuário escolheu

**v676.** Relato do usuário: na lista de pedidos do Acabamento, o selo dizia *Aguardando* ou
*Impresso* certinho, mas a cor da linha era a da lista do Painel de Produção — a linha do pedido
só tinha a classe `os-row`, comum às duas telas, e apenas a linha do *modelo* (dentro do pedido
aberto) levava o fundo do estágio. Agora a linha do pedido leva o mesmo `FUNDO_DO_ESTAGIO`, e o
estágio se lê de relance na lista inteira, antes de abrir o pedido.

**v677.** Pedido do usuário: o azul mais escuro da paleta, `#0a2472`, passa a **`#001249`** — em
tudo o que ele pintava (a superfície dos cards, a caixa do produto, o degradê do número do pedido,
a sombra do cabeçalho de coluna). E a cor do *Impresso* passa de `#162037` para `#001f3e`.

**v678.** Errata do usuário, e as duas trocaram de lugar: **Aguardando** fica em `#001f3e` e
**Impresso** no azul da tela, `#001249`. *Em acabamento* (`#32352e`) e *Pronto* (`#14301f`)
continuam como estavam. Cor de estado segue sendo decisão dele — o que mudou aqui foi a decisão,
não a regra. A fila do Pedido e a Produção, que usam o `#162037` para o mesmo "Impresso", ficaram
como estavam: o pedido foi sobre o Painel de Acabamento.

---

## [v675 — 2026-08-21] — O popup da expedição, e o IMPRESSO que vem da Produção

### Clicar em EXPEDIÇÃO abre um popup e espera o OK

Pedido do usuário. Antes o clique agia na hora; agora ele abre um popup com **o resumo do que
vai embora** — setor por setor, com a contagem de modelos, o peso digitado e o estado de cada um
— e espera a confirmação. Nada é gravado antes do OK.

Ele existe porque expedir **não tem volta por esta tela**: o pedido sai da fila do Acabamento e
quem o traz de volta é o ERP. Um clique sem confirmação, num botão grande ao lado de campos que
o operador está digitando, é o tipo de acidente que só se descobre depois.

O popup atende os dois estados. **Pronto**, mostra o resumo, avisa se algum setor foi sem peso
digitado, e oferece *OK — ENVIAR*. **Pendente**, mostra o que falta e o único botão é
*Entendi* — a lista do que falta é a informação que o operador vai usar, e ela não pode sumir
sozinha como sumia o aviso anterior. Sem permissão de editar, o popup explica e não oferece o
envio.

Falha no envio **mantém o popup aberto**, com o motivo escrito: o operador precisa ver o que
houve e poder tentar de novo sem refazer o caminho.

### Modelo impresso na Produção aparece impresso no Acabamento

Relato do usuário, e era defeito meu. Com o pedido **19775** na mão: *AVRA* e *WHISPER* estavam
`IMPRESSO` na Produção e `Aguardando` no acabamento — e a tela mostrava Aguardando, para sempre.

A causa não era o dado, era o vocabulário. **"Aguardando" no acabamento quer dizer *o material
ainda não chegou nesta mesa*** — é a ausência de trabalho, não uma decisão sobre ele. Quando a
impressora termina, o material chegou.

Agora `acabamento_status = 'Aguardando'` cai para a derivação, como se estivesse vazio; as
outras três escolhas continuam vencendo tudo. **Nada foi reescrito no banco** — as linhas
continuam como estavam, e foi a leitura que ficou honesta.

A consequência que é preciso saber: marcar "Aguardando" num modelo já impresso não gruda. Para
devolver material à fila, o caminho é o status de impressão, na Produção — que é de quem
imprimiu.

---

## [v674 — 2026-08-21] — O botão EXPEDIÇÃO, e o setor que se fecha sozinho

### EXPEDIÇÃO, à direita do peso

No mesmo box, à direita dos campos. **Só fica ativo com todos os modelos de todos os setores
em "Pronto"** — mas não fica escondido nem travado: apagado, continua clicável, e clicá-lo cedo
responde *o que falta*, por setor e com a conta de quantos modelos. Um botão escondido faria o
operador procurar o que a tela não mostra; um travado não explicaria por quê.

Modelo **sem setor** não some dessa conta: aparece como *(sem setor)*. É material do pedido do
mesmo jeito, e um pedido saindo da gráfica com modelo pendente é o erro caro desta tela.

Com tudo pronto, o botão grava `propostas.status_interno = 'EXPEDICAO'` — estado que o ERP já
usa, e que o painel já escrevia no botão de liberar para produção. O pedido sai da fila do
Acabamento na hora.

A conferência é refeita **dentro** da função, e não só no `disabled`: quem digitasse
`AcabamentoPainel.expedir(...)` no console passaria direto pelo atributo.

### O CONCLUIDO de cada setor, que não depende do botão

Assim que o **último modelo de um setor** fica "Pronto", a linha dele recebe `CONCLUIDO` em
`propostas_os_setores.status_producao` — mesmo com os outros setores ainda trabalhando. É o que
deixa o ERP ver o Laser fechado enquanto o PVC continua.

E o contrário: marcou "Pronto" por engano e corrigiu, o setor volta para `EM ACABAMENTO`. Esse
desfazer é estreito de propósito — só acontece quando o valor atual é **exatamente** `CONCLUIDO`;
qualquer outra coisa ali foi o ERP quem pôs.

Falha no carimbo não desfaz a escolha do operador: o estágio já está gravado, e o aviso diz as
duas coisas.

### O que isso custou em exceção ao banco

A exceção de ontem cobria uma coluna; agora cobre a ficha de expedição inteira — `peso_real_kg`,
`status_producao`, `status_producao_em`, e `propostas.status_interno` **só** para `EXPEDICAO`.
`prazo`, `hora`, `qtd_volumes`, `tipo_volume` e `responsavel_conferencia` continuam intocados, e
há teste cobrando cada escrita pelo que ela toca. Está tudo em `docs/REGRAS_BANCO.md`.

As duas rotas novas entram pela mesma porta da estação — `acesso-estacao` com o
`ACESSO_AGENTE_SEGREDO` —, então esta versão **exige o agente novo**.

---

## [v671 — 2026-08-21] — Painel do Acabamento na paleta azul

O usuário entregou uma paleta de dez tons e pediu a tela derivada dela, mantendo a coerência
onde a paleta não cobrisse. O marrom, que estava ali desde 20/08, saiu.

**Família escura**, das superfícies: `#06070d` · `#0d0e20` · `#0a2472` · `#123a99` · `#1a438f`.
**Família clara**, dos realces: `#120a8f` · `#2b32af` · `#4a61e8` · `#4589d7` · `#4cc8f0`.

O único tom de fora é `#cfe6fb`, o texto de leitura — a paleta não traz um claro o bastante
para corpo de texto, e ele é puxado do ciano. `#9fd8f2` e `#7fa9d4` são derivações do mesmo
ciano, para as métricas se distinguirem entre si.

Mudou tudo o que é moldura: cards, cabeçalhos, botões, filtros, o número do pedido, a barra de
progresso, o box de peso, os seletores, o botão de câmera, o título da caixa do produto e os
números das métricas.

**O que NÃO mudou, e por quê.** As quatro cores de fundo da caixa do modelo — *Aguardando*,
*Impresso*, *Em acabamento*, *Pronto* — ficaram onde estavam. Elas dizem em que ponto o modelo
está, e é a primeira coisa que se lê; foi o usuário quem mandou devolvê-las quando eu as
uniformizei na repaginação anterior. Também ficou o vermelho de *Pedidos em Atraso*: alerta não
se repinta para combinar com a tela. E o selo de prazo e a miniatura da coluna Preview saem de
funções compartilhadas com a Produção e a Lista de Arte — recolori-las mudaria as três telas.

**O cuidado novo.** O marrom existia para o olho separar esta tela da Produção de relance na
estação. Agora as duas são azuis, e o que as separa é o tipo de azul: a Produção é ardósia
dessaturada, esta é índigo saturado. O teste `nadaDeMotorNemDeAgente` proíbe os cinco tons da
Produção dentro do `acabamento.js` — é ele que impede as duas de convergirem.

---

## [v670 — 2026-08-21] — producao.html: a dica dos setores somados

A página `producao.html` usa a mesma função de filtro do painel, mas tinha ficado sem a linha
*"Clique em mais de um setor para somar os pedidos"* — então lá não havia como saber que os
cards somam, nem marcador visível de que a tela é a nova.

De quebra, dois detalhes daquela tela: o **"Todos os Setores" não tinha id**, então nunca
acendia; e o card **PVC nascia aceso** na marcação, dizendo "PVC escolhido" com o filtro vazio.

---

## [v669 — 2026-08-21] — Peso por setor, setores somados e "Revisado" virou "Pronto"

### O peso por setor, dentro do pedido do Acabamento

Um box acima dos modelos, com **um campo de peso para cada setor dos produtos daquele
pedido**. No exemplo do usuário: *Triband + Credencial + Mobi* são dois setores, Laser e PVC,
então duas linhas. Vírgula e ponto valem o mesmo; campo vazio apaga; letra não chega ao banco.
Ao lado do campo aparece **✓ gravado**, sem redesenhar o pedido.

O peso vai para **`propostas_os_setores.peso_real_kg`**, uma linha por setor. Essa tabela é do
parceiro, e é a **primeira exceção** à regra de ouro do `docs/REGRAS_BANCO.md` — documentada lá,
com a lista exata do que pode ser tocado. Só o peso e o `updated_at`; `prazo`, `hora`,
`status_producao` e as colunas de volume nunca são encostados. A tabela é a ficha de conferência
de expedição que o ERP mantém para a gráfica preencher, e o ERP já preenche parte dela.

Grava com `UPDATE` primeiro e `INSERT` só quando não há linha — hoje 729 dos 758 pares
(pedido, setor) ainda não existem, porque o ERP as cria na expedição. Duas pessoas no mesmo
setor esbarram no `UNIQUE (id_int, setor)`, e o segundo vira atualização.

**A estação ganhou porta própria.** O usuário decidiu, no mesmo dia, que a digitação do peso e a
escolha dos drops seriam feitas **pelo acesso local no agente** — e é justamente ali que o
caminho direto não funciona: a tabela tem RLS de `authenticated`, o operador da estação entra
pelo código local sem sessão do Supabase, e a leitura volta vazia **com HTTP 200**. Sem erro para
mostrar: o campo aceitaria o número e nada seria gravado.

Então quem serve a página decide o caminho, no mesmo desenho do catálogo de fontes:

- **estação** → `/api/peso-setores/<pedido>` no agente → Edge Function `acesso-estacao` com o
  `ACESSO_AGENTE_SEGREDO` → `service_role`, que nunca vai para as estações;
- **site com login** → direto no PostgREST, que é o que a sessão autoriza;
- **site sem login** → o box mostra os setores e a frase que resolve.

A regra de gravação mora uma vez só, em `supabase/functions/_compartilhado/pesos.ts`. O agente
não valida nada por conta própria — duas cópias da conversão de vírgula e da lista de setores
criariam duas verdades, e a que vale é a do servidor, que conhece o `CHECK` da tabela.

Esta é a **única** chamada ao agente em toda a tela; impor, gerar PDF, imprimir e perguntar a
versão do NewProd continuam fora, e há teste contando as rotas.

### Os cards de setor somam, nos dois painéis

Pedido do usuário, para o **Painel de Produção** e o **Painel do Acabamento** ao mesmo tempo.
Antes, clicar num card **trocava** o setor escolhido: ver Flexo e PVC juntos era impossível.
Agora os cards ligam e desligam, e a lista mostra a **soma** — entra o pedido que tenha item em
qualquer um dos setores acesos.

Soma, e não interseção: exigir item nos dois setores ao mesmo tempo é raro e não é o que o
operador quer ver. Clicar de novo num card aceso tira aquele setor; **Todos os Setores** limpa
tudo.

Cada tela guarda o próprio recorte — `state.filtroSetores` na Produção, `tela.setores` no
Acabamento —, e um não mexe no outro. Cada card passou a dizer de quem ele é pelo `data-setor`:
o código antigo procurava o nome dentro do `onclick`, o que não sobrevive a vários acesos ao
mesmo tempo.

Embaixo das duas grades entrou a linha *"Clique em mais de um setor para somar os pedidos"* — a
soma não se descobre olhando, porque um card aceso e outro apagado parecem a tela de antes.

O `producao.html`, que usa a mesma função do `script.js`, recebeu os mesmos `data-setor`.

### O último estágio agora se chama **Pronto**

Pedido do usuário. "Revisado" descreve o que o conferente fez; **Pronto** descreve o que
interessa a quem olha a fila de longe — o material pode ser embalado e entregue. É a palavra
que o setor usa em voz alta.

Mudou o seletor de cada modelo, o botão de recorte no topo da fila, o filtro da coluna
lateral, a métrica **Modelos Prontos** e o contador do pedido aberto (*"3/5 prontos"*).

**A cor não mudou.** O último estágio continua verde escuro `#14301f`, como os outros três
continuam nos seus tons: cor de status diz estado, e estado não se repinta junto com o nome.

**O banco precisou de migração**, e ela já rodou: `sql/acabamento_status_pronto.sql`. A coluna
`acabamento_status` guarda o próprio rótulo em texto — decisão de quando a tela nasceu, para não
criar uma tabela de domínio de quatro valores —, e o preço dessa escolha é exatamente este: as
duas linhas que estavam em "Revisado" foram reescritas para "Pronto".

O código não depende da migração para estar certo. A constante `NOME_ANTIGO`, no
`acabamento.js`, lê "Revisado" como "Pronto" — protege o intervalo entre publicar e migrar, e a
estação que ainda tem a versão anterior em cache e grava o nome velho por alguns minutos.

### Clicar no menu volta para a página inicial

Quem abria o pedido 123, saía para outra tela e voltava pelo menu **Painel do Acabamento**
reencontrava o detalhe do 123 — sem topo, sem filtros e sem lista —, e precisava achar o botão
VOLTAR para chegar onde o menu prometia levá-lo. Agora abrir a tela pelo menu sempre traz a
lista.

O fechamento desliga a câmera junto: ela pertence ao detalhe, e deixá-la ligada manteria a
webcam acesa atrás de uma tela que sumiu.

---

## [v668 — 2026-08-20] — GUIA_AGENTE: como recuperar um envio de agente interrompido no meio

Documentação, sem mudança de código. A publicação da 1.2.161 caiu no meio do upload de 68 MB
(`A conexão subjacente estava fechada`), e os três arquivos de versão ficaram gravados com o
número novo sem MSI nenhum publicado — a próxima tentativa com o mesmo número é recusada por
*"não é maior que a atual"*.

A causa: o `publicar_agente.ps1` descarta o backup dos arquivos ao passar do ponto de simulação,
**antes** do upload, então o `Restore-Versao` não tem o que devolver quando a rede cai.

O guia ganhou o procedimento de recuperação — como conferir pelo `curl` se o objeto chegou ao
bucket (HTTP 400 = nome livre) e se o manifesto mudou, quando dá para repetir com o mesmo número
e quando é obrigatório subir para o seguinte — e uma nota sobre o cache da Cloudflare, que faz o
`latest.json` parecer velho sem afetar estação nenhuma.

---

## [v667 — 2026-08-20] — Acabamento: sem pedido de teste, marrom neutro, cor por status de volta

> As tres mudancas abaixo foram escritas antes de publicar e **saem juntas na v667**. A
> numeracao e do `publicar.ps1`, que le a maior versao nos HTMLs e soma um.

### Marrom mais escuro e neutro, e a cor por status de volta

Duas correções minhas, na mesma leva.

**O marrom ficou escuro e quase sem saturação.** O primeiro tom (`#2a1d13`) puxava para o laranja;
agora a superfície é `#1d1917` e os cabeçalhos `#292421`. O calor só se percebe ao lado do
azul-ardósia da Produção — que é exatamente o que se quer distinguir.

**As cores por status voltaram ao que eram**: *Aguardando* `#3a2a1c`, *Impresso* `#162037`,
*Em acabamento* `#32352e`, *Revisado* `#14301f`. Eu as tinha trazido para a família terra junto com
o resto da tela, achando que o azul do *Impresso* era sobra da Produção. Não era: aquelas quatro
cores dizem em que ponto o modelo está, e é a primeira coisa que se lê na caixa. Mexer nelas para
combinar com o fundo troca informação por decoração. Há teste travando as quatro.

### Pedido encerrado como teste sai da fila

Proposta com `propostas.encerrado_teste_em` preenchido sai da fila do Acabamento — da tabela, das
métricas e do badge do menu. É o carimbo de "isto foi um teste, pode sumir". Medido no banco na
hora: das 28 propostas em produção, 2 estavam marcadas, e a tela passou a mostrar 26.

A leitura é uma consulta própria da tela, e não uma coluna a mais no `loadOrdensFromVibecode` —
aquele carregamento alimenta também o Painel de Produção e a Lista de Arte, e uma coluna que
sumisse ali derrubaria as três. O filtro roda do lado do banco e só traz o número do pedido.

> **Falhar a leitura não esconde ninguém.** Sem resposta do banco, a fila aparece inteira, como
> antes deste recurso. Esconder por engano é o erro caro: o pedido some da tela de quem trabalha
> nele. Há teste travando exatamente isso.

Nas outras telas esses pedidos continuam aparecendo — o recorte é só do Acabamento.

---

## [v666 — 2026-08-20] — Acabamento em marrom escuro, e imagens sem moldura

Dois ajustes pedidos com a tela do Acabamento na frente.

**As imagens perderam a moldura.** Sem canto arredondado, sem fio de contorno, e
**centradas na altura** da caixa — o mesmo tratamento que as outras janelas de imagem do
projeto já tinham. Vale para a amostra do cliente, para a miniatura da foto do material e para a
imagem ampliada.

**O painel inteiro virou marrom escuro.** A tela do Acabamento é, de propósito, a mesma marcação
da tela de Produção: as mesmas classes `prod-*`, os mesmos cards, a mesma tabela. É o que faz as
duas envelhecerem juntas — e era também o que fazia uma ser confundida com a outra de relance, na
estação.

Agora a superfície é `#2a1d13`, os cabeçalhos `#3d2b1c`, e o que está ligado é âmbar em vez de
azul: recortes de prazo, filtros de setor, estágio, cabeçalhos de coluna, número do pedido, barra
de progresso, botão da câmera e a janela da câmera. Os quatro estágios do modelo passaram para a
mesma família terra — o azul escuro do *Impresso* era o último pedaço de Produção dentro desta
tela.

> **Nenhuma regra alcança a Produção.** A paleta mora no fim do `style.css`, num bloco em que
> **toda regra começa por `#view-acabamento`** — trocar a cor das classes `prod-*` repintaria a
> tela que a gráfica usa todo dia. Está no fim do arquivo porque o bloco `prod-*` aparece **duas
> vezes** nele, resto de colagem antiga, e regra escrita depois vence as duas. Há teste varrendo o
> bloco atrás de qualquer seletor sem o id, e conferindo que a superfície da Produção continua
> `#1e293b`.

O selo de prazo e a miniatura da coluna Preview continuam iguais aos da Produção, de propósito: as
duas funções são compartilhadas com a Produção e com a Lista de Arte, e recolori-las aqui mudaria
as três telas.

---

## [v665 — 2026-08-20] — Acabamento: a foto do material, e o estágio que nasce certo

Cinco ajustes pedidos depois de o usuário ver a tela do Painel do Acabamento rodando.

**A foto do material.** Cada modelo ganhou um botão de câmera. Ele abre a webcam da estação,
fotografa, e a imagem vai para o Storage — bucket `artes`, prefixo `acabamento-fotos/` —, com o
endereço em `pedidos_modelos.acabamento_foto_url`. A miniatura fica na caixa do modelo e amplia no
mesmo lightbox da amostra. É o registro do que o revisor viu: a amostra aprovada de um lado, o
papel que saiu do outro.

> Bucket novo com escrita anônima **já foi tentado neste projeto e não funcionou** —
> `sql/criar_bucket_previews.sql` começa com "NÃO EXECUTE ESTE ARQUIVO". Por isso a foto vai no
> `artes`, com prefixo, exatamente como os previews de numeração. Conferido política por política
> no banco antes de escrever o código.

A câmera exige contexto seguro (`https` ou `127.0.0.1`) e permissão do navegador — as duas coisas
são inerentes a qualquer webcam. Para as duas há a mesma saída, escrita na tela e **sem depender de
configurar navegador nenhum**: *Escolher arquivo*, que no celular abre a câmera do aparelho. A foto
entra pelo mesmo caminho.

**O estágio nasce certo.** Entrou "Aguardando" como quarto estágio, e a opção vazia *"— Status —"*
saiu. Modelo já impresso aparece como **Impresso**; o que ainda não saiu da impressora aparece como
**Aguardando**, com a caixa em **marrom**. É derivação do `status_impressao`, nunca gravação — a
coluna segue nula até alguém escolher, e a escolha vence o derivado a partir daí.

**A caixa dividida ao meio**: amostra de um lado, informações do outro. E **saiu a chapa branca**
atrás das imagens, na caixa e no lightbox — a arte traz o próprio fundo, e o retângulo claro
recortava um buraco no meio da caixa escura.

---

## [v664 — 2026-08-20] — Painel do Acabamento

Menu novo, para o setor que recebe o material **depois** da imposição e da impressão. Até aqui o
acabamento acompanhava o trabalho pelo Painel de Produção — a tela de quem imprime, cheia de
seletor de numeração, campo de quantidade e botão de imprimir que o acabamento não pode tocar.

### A tela

Um espelho do Painel de Produção: mesmo layout, mesmos cards, mesmos filtros, mesmas métricas ao
lado, mesma tabela, mesma formatação. Lista os pedidos com `status_interno` de produção — a mesma
população da Fila de Produção, porque é esse o material que chega ao acabamento.

Duas colunas passam a falar de acabamento: **Progresso** conta modelos revisados em vez de
impressos, e **Status** anda em Aguardando → Impresso → Em acabamento → Revisado. O botão de
recorte no topo, que na Produção é "Impresso", aqui é **"Revisado"**: pedido com todos os modelos
revisados sai da fila de trabalho e só reaparece com esse botão ligado.

**Sem nenhuma ligação com o motor de imposição nem com o agente local**, por pedido do usuário.
Não impõe, não gera PDF, não imprime, e a coluna de métricas não traz o bloco de versão do NewProd
que a da Produção tem no rodapé. Isso é medido: o harness varre o arquivo inteiro atrás de
`/api/impose`, `API_BASE_URL`, `127.0.0.1:9000` e companhia.

### O pedido aberto

Clicar numa linha abre, no lugar da lista, a mesma listagem de modelos separada por produtos do
Portal do Pedido — uma caixa por produto, com nome real e selo do setor PCP. Tudo em **somente
leitura**: o que na Produção é campo ou seletor, aqui é texto.

Cada modelo mostra **a amostra que foi enviada ao cliente pelo link** — a imagem composta de cor +
arte + numeração que ele aprovou —, em bom tamanho e clicável para ampliar. É o que o revisor
compara com o papel que saiu da impressora. Amostra que só existe em PDF continua saindo como
atalho para o arquivo: rasterizar a arte do cliente está fora de cogitação.

E dois seletores, os únicos controles da tela: **Status do acabamento** (Impresso / Em acabamento /
Revisado) e **Responsável**, escolhido entre os operadores de acesso local da gráfica.

### No banco

Duas colunas novas em `pedidos_modelos` — `acabamento_status` e `acabamento_responsavel` — e a view
`imposition_operadores`, que entrega **só o nome** dos acessos locais. A tabela por trás dela guarda
os códigos de seis caracteres em texto claro e continua fechada para as chaves públicas; a view
existe justamente para o seletor de responsável funcionar no site e na estação sem abri-la.

Mais o módulo de permissão **Painel do Acabamento** (`perm_acabamento_view` / `perm_acabamento_edit`),
que nasce espelhando o que cada pessoa já tem de Produção: quem vê a Produção vê o Acabamento, quem
a edita, edita.

### 🔎 De quebra: a Edge Function `painel` estava fora do controle de versão

Achado ao commitar esta mudança. O `.gitignore` tinha `painel/` — a regra que
ignora a cópia local do painel que o agente sincroniza — e, **sem a barra da
frente**, o padrão casa com qualquer pasta chamada `painel` em qualquer nível.
Casava com `supabase/functions/painel/`, a Edge Function que guarda as permissões
e os códigos de acesso das estações: a única das nove funções que nunca esteve no
git, sem que nada na tela dissesse isso.

O deploy sempre funcionou — o `publicar.ps1` lê as pastas do disco, não do git —,
e é isso que tornava o buraco invisível: só apareceria no dia em que esta máquina
fosse trocada. Corrigido para `/painel/`, ancorado na raiz. O espelho da raiz
continua ignorado; as três fontes da função entram no repositório.

> **A ordem importa**: o SQL (`sql/painel_do_acabamento.sql`) roda **antes** de publicar.
> `imposition_user_permissions` tem uma coluna por permissão, e mandar uma coluna que não existe faz
> o PostgREST recusar a gravação inteira com 400. A tela sabe se defender enquanto isso — lista os
> pedidos e avisa, uma vez, que o banco ainda não foi atualizado —, mas a tela de Usuários não.

---

## [v662 — 2026-08-20] — A logo da empresa no cabeçalho do link

O link do cliente abria com o **símbolo** da marca, sozinho, num arquivo local
(`Logo Ideal Dark.png`). Trocado pela **logo da empresa** — a que traz o nome e a linha
"INGRESSOS • PULSEIRAS • CREDENCIAIS" —, servida do mesmo bucket de imagens que já entrega as
logos das transportadoras.

O arquivo se chama `.jpg`, mas o **formato real é PNG com fundo transparente** — 35% dos pixels
são transparentes. Por isso a logo vai direto sobre o cabeçalho escuro, sem cartão branco atrás: o
gradiente da marca (laranja, turquesa e azul) lê bem no escuro, e a caixa branca só recortava um
retângulo no meio do cabeçalho.

A altura ficou em **47px**, depois de três passadas olhando o celular — 56, 67 e 47. Nos 67 a logo
passava a competir com o número do pedido, que é o que o cliente veio ler; a linha miúda dentro
dela, "INGRESSOS • PULSEIRAS • CREDENCIAIS", continua legível nos 47.

Conferido em 320px, 390px e 1280px: sem rolagem horizontal em nenhum, e a logo cabe nos três (na
tela de 320 ela encolhe pelo `max-width`, sem cortar).

---

## [v661 — 2026-08-20] — Retirada mostra a gráfica, com mapa; e o endereço do pedido, não o do cliente

> As três mudanças da tarde — o recebedor herdado da nota fiscal, a retirada na gráfica e o
> endereço principal — **saíram juntas na v661**. A numeração é do `publicar.ps1`, que lê a maior
> versão nos HTMLs e soma um; as duas entradas abaixo foram escritas antes de publicar, e a de
> baixo nunca existiu como release próprio.

### 📍 Retirada: o endereço é o da gráfica

Num pedido de **RETIRADA**, a aba mostrava o endereço do **cliente** — o contrário do que
acontece, porque é ele que vem até aqui. Agora ela mostra o endereço da gráfica, com um botão
**Ver rota no mapa** que abre a navegação a partir de onde o cliente estiver.

O endereço vem de `empresas` (a empresa 1, IDEAL GRÁFICA): Rua Felizardo de Farias, 81 —
Medianeira, Porto Alegre, CEP 90660130. Ele é **lido do cadastro**, e não escrito no código: o dia
em que a gráfica mudar de endereço, quem atualiza é o ERP e esta página acompanha.

O ERP escreve a retirada de quatro formas — `RETIRADA` e `RETIRAR` em `frete_escolhido`, "Retirada
Local" e "RETIRA BALCÃO" em `cotacao_frete.servico`. Todas começam por RETIR, e é assim que se
pergunta, em vez de manter uma lista que a próxima grafia deixaria desatualizada.

**Na retirada não há perna de envio.** A linha de prazo passa a mostrar só a produção, com
*"Pronto para retirada a partir de X"* — somar um dia de transporte que não vai acontecer daria ao
cliente uma data pior do que a real, e ele viria buscar um dia depois do que podia. E o recebedor
deixa de ser exigido: quem busca é o próprio cliente, no balcão, e ali ele se identifica em pessoa.

### 📦 O endereço é o escolhido no pedido

Um cliente pode ter vários endereços, e quem diz qual é o da entrega é `propostas.id_endereco_ent`
— a escolha feita no pedido. Era o que a função já lia, e continua sendo.

**O que faltava era o caso sem escolha.** Medido no banco: **2.024 dos 4.001** pedidos dos últimos
90 dias estão com `id_endereco_ent` vazio, e a página não mostrava endereço nenhum. Desses, 1.970
clientes têm endereço cadastrado — e **125 têm mais de um**.

A regra, decidida pelo usuário: **sem escolha no pedido, vale o endereço PRINCIPAL do cadastro.**

Ela resolve praticamente tudo. Medido nos 1.218 clientes desses pedidos: **1.217 têm exatamente um
endereço marcado como principal**, nenhum tem dois, e o único sem principal tem um endereço só — não
há empate a desfazer. (A comparação é `upper(btrim(...))`: a coluna vem do ERP com as duas grafias,
"principal" e "Principal".)

Quando o endereço vem do cadastro, e não da escolha do pedido, a tela diz isso: *"Este é o endereço
principal do seu cadastro. Se a entrega for em outro lugar, toque em ALTERAR."*

**Testes:** `tests/portal_dados_harness.js` (123 verificações) e
`tests/portal_confirmacoes_harness.js` (40).

---

## [v661 — 2026-08-20] — O recebedor sai da nota fiscal, quando ela é de pessoa física (saiu junto)

**Regra do usuário:** faltando o nome e o CPF de quem recebe, valem os dados da nota fiscal —
**mas só quando ela é de pessoa física**. Sendo de empresa, informar o recebedor passa a ser
obrigatório.

O porquê está na entrega: a transportadora põe o pacote na mão de uma pessoa e pede o CPF dela.
Numa nota de pessoa física essa pessoa é o próprio cliente, e o dado já está no cadastro. Numa
nota de empresa não há a quem herdar — o CNPJ não é o CPF de ninguém, e a razão social não recebe
pacote.

| nota fiscal | recebedor vazio no endereço |
|---|---|
| **CPF** | herda o nome e o CPF da nota, com a etiqueta *"mesmo da nota fiscal"* embaixo |
| **CNPJ** | fica "Não informado", e o **CONFIRMAR é desligado** até o cliente informar |
| documento desconhecido | trata como CNPJ — não dá para herdar o que não se sabe |

**O tipo sai da contagem de dígitos do documento**, e não da coluna `tipo_pessoa`. Medido no banco
nos 3.946 clientes com pedido nos últimos 90 dias: `tipo_pessoa` usa dois vocabulários — "CPF"/"CNPJ"
em 3.153 e "FISICA"/"JURIDICA" em 793 —, enquanto os dígitos nunca discordaram: 11 para CPF, 14 para
CNPJ, sem uma exceção.

**O que está escrito no endereço vence sempre.** Quem cadastrou "Maria, da portaria" sabe mais do
que esta regra.

### A trava tem saída

Com CNPJ e sem recebedor, o **CONFIRMAR** fica desligado, com o motivo escrito ao lado — o cliente
não pode dizer "está correto" sobre um endereço que a transportadora não consegue entregar.

Mas o **ALTERAR continua vivo**, e é por ele que se sai: a caixa de texto passa a pedir *"Escreva o
nome completo e o CPF de quem vai receber o pedido..."*, e quem a usa deixa de ser cobrado no cartão
de finalização — o pedido segue para o atendimento com a solicitação. Sem isso, o cliente ficaria
preso na página sem nenhum caminho para terminar.

**Testes:** `tests/portal_dados_harness.js` (98 verificações) e
`tests/portal_confirmacoes_harness.js` (36).

---

## [v660 — 2026-08-20] — O Prazo de Entrega somado, e o recebedor que faltava

### Duas linhas certas que não respondiam a pergunta

A aba de Entrega mostrava **Prazo de produção: 1 dia útil** e **Prazo de envio: 1 dia útil**, em
linhas separadas. Estavam certas e obrigavam o cliente a somar de cabeça para saber o que ele
foi ali descobrir: **quando chega?**

Agora é uma linha só, com a conta feita:

```
PRAZO DE ENTREGA
Produção: 1 dia útil + Envio: 1 dia útil
Recebimento a partir de 2 dias úteis
```

**A soma só sai quando os dois lados trazem número.** "A combinar" e "Sob consulta" não viram
zero: somar o que der inventaria uma data de entrega que a gráfica não prometeu — e é da data
prometida que o cliente cobra depois. Nesses casos a frase mostra os dois prazos como estão, sem
o "recebimento a partir de".

E é **"a partir de"**, não "em": é o piso do prazo, não uma promessa de dia exato.

### O recebedor, que 93% dos clientes nunca viram faltar

O cartão de endereço já tinha as linhas **Recebedor** e **CPF do recebedor** — mas elas só
apareciam quando o campo estava preenchido. Medido no banco: **só 126 dos 1.929 endereços** de
pedidos dos últimos 90 dias têm recebedor, e 132 têm CPF.

Ou seja: em 93% dos casos as linhas simplesmente sumiam, e o cliente não tinha como saber que
faltava esse dado. Quem descobria era o motoboy, na portaria do prédio, com o pacote na mão.

Agora elas aparecem **sempre**, com **Não informado** em âmbar, e o cartão traz um aviso dizendo o
que fazer: *"Falta o nome e o CPF de quem vai receber o pedido. Toque em ALTERAR abaixo e informe
— é o que a transportadora pede na entrega."*

### Miudeza do mesmo dia

`.portal-aviso` era `display: flex`, e com isso cada elemento inline do texto virava um item
próprio: a frase com um `<b>` no meio quebrava em colunas. Passou a `block`, e o texto flui como
texto.

**Testes:** `tests/portal_dados_harness.js` (73 verificações) e
`tests/portal_confirmacoes_harness.js` (30).

---

## [v659 — 2026-08-20] — O link de pagamento achado, e as logos do frete

### 💳 O link de pagamento estava em outra tabela

A v656 lia `propostas_os.link_pagamento`, que **está vazio nas 23 linhas daquela tabela** — nunca
foi por ali. O usuário deu o exemplo do pedido 20927 (`pay.ai-ideal.com.br/i/a21f550f`) e a busca
no banco achou a origem: **`pagamentos_v2.url_cobranca`**, com a forma em `tipo_cobranca`. São
3.552 pedidos com cobrança nos últimos 90 dias.

**A aba mostra uma LISTA de cobranças, e não uma.** 190 desses pedidos têm duas ou mais — entrada
mais parcelas, com a referência indo `20927-A`, `20927-B`. Mostrar só a primeira esconderia do
cliente metade do que ele tem a pagar.

**O status do pagamento vai em destaque**, no topo da aba, a pedido do usuário. Ele não é o status
de uma cobrança: é o das cobranças todas juntas. Com duas cobranças e uma paga, dizer "Pago"
mandaria o cliente embora devendo, e dizer "Aguardando" apagaria o que ele já pagou — por isso
existe o **Parcialmente pago (1 de 2)**.

Cada cobrança mostra forma de pagamento, situação, valor e vencimento. Duas guardas no botão:

- **Cobrança cancelada não chega à tela.** A função do banco a deixa de fora; o link dela ainda
  abre, e mandar o cliente pagar uma cobrança que a gráfica cancelou é pior do que não mostrar nada.
- **Cobrança paga não ganha botão.** "Pagar agora" embaixo do que já foi pago é convite para pagar
  duas vezes.

`pix_copia_cola`, `linha_digitavel` e os dados de cartão **não saem** da função: ela entrega o
endereço da cobrança, e o gateway mostra o resto depois que o cliente chega lá.

### 🚚 As logos das formas de envio

A aba de Entrega passou a mostrar a logo da transportadora — as mesmas que o Painel de Produção já
usa na coluna de frete. Elas saíram de dentro de uma função de desenho do `script.js` para
`frontend/logo-do-frete.js`, e agora as duas telas leem do mesmo lugar: é o mesmo desenho mostrando
o mesmo fato, e o dia em que uma transportadora trocar de logo é uma linha a mudar, não duas a caçar.

A busca continua sendo em maiúsculas e, não achando exato, por trecho — é assim que `VEPPO-RS` cai
na logo da Veppo e `SAO MIGUEL` na da São Miguel. Transportadora sem logo cadastrada aparece pelo
nome, e não como imagem quebrada.

Na aba do cliente a logo vem **acima** do texto, e não no lugar dele: a logo se reconhece num
relance, mas só o texto diz o valor do frete e a modalidade. E ali ela vem sem o texto de reserva
que o painel usa — a linha de baixo já traz o nome, e repeti-lo quando a imagem não carrega seria
pior do que não ter logo.

**Testes:** `tests/logo_do_frete_harness.js` (31 conferências) e a parte de pagamento do
`tests/portal_orcamento_harness.js` (60).

---

## [v657 — 2026-08-20] — A aba de Entrega mostra os dois prazos

**Prazo de produção e prazo de envio são coisas diferentes, e agora aparecem separados.**
Até a v656 a aba mostrava uma linha só, "Prazo de envio", com a data de
`propostas_os.data_termino`. O usuário definiu o que o cliente precisa ver:

| linha | origem | regra |
|---|---|---|
| **Prazo de produção** | `produtos.prazo`, pelos itens do pedido | o do produto que **demora mais** — a gráfica só despacha quando o último item fica pronto |
| **Prazo de envio** | `cotacao_frete.prazo` da cotação escolhida | o que a transportadora prometeu |

Somados num número só, ninguém saberia qual dos dois atrasou quando o pedido atrasar.

**O prazo de envio nunca existiu em `propostas`.** Ela guarda o nome e o valor do frete, e
não o prazo — ele mora em `cotacao_frete`, na linha marcada como `escolhido`. São 2.164
pedidos com uma. A função `link_cliente_pedido` passou a devolvê-la, ordenando por
`created_at DESC`: um pedido pode ter mais de uma linha escolhida ao longo do tempo, porque
a expedição recota quando o peso ou o endereço mudam.

**A produção se compara pelo número, e não pelo texto.** O catálogo tem cinco redações para
a mesma coisa: "3 dias úteis" em 50 produtos, "1 dia útil" em 7, "2 dias úteis" em 3, mais
"Prazo de produção 2 dias úteis" e "Produção: 1 dia útil + Frete". Um pedido com uma pulseira
de 1 dia e uma credencial de 3 mostra **3 dias úteis**.

**O prazo de envio passa inteiro, sem reescrita.** "A combinar" (1.274 cotações), "1 dia
útil" (227), "Imediato", "Sob consulta", "De 12 até 48hs ( consultar )", "dia seguinte a
conclusão" — reescrever qualquer uma dessas seria inventar uma promessa de entrega que a
gráfica não fez. A única correção é o número solto: 30 cotações do SEDEX gravam só `1`, e
outras 227 gravam `1 dia útil`; é a mesma coisa com a unidade perdida, e um "1" sozinho na
tela do cliente não diz nada.

**A forma de envio ganhou a cotação como reserva.** `cotacao_frete.servico` tem nomes que
`propostas.frete_escolhido` não tem — "Frete Incluso", "Sem custo", "Transportadora
Parceira". Dizer "A combinar" com uma cotação escolhida na mão esconderia do cliente o que
já está decidido.

`propostas_os.data_termino` **saiu desta aba**. Ela continua sendo o Prazo de Entrega do
Painel de Produção; o que o cliente vê agora são os dois prazos acima.

**Testes:** `tests/portal_dados_harness.js` (53 verificações) e
`tests/portal_confirmacoes_harness.js` (28).

---

## [v656 — 2026-08-20] — O link do cliente vira o Portal do Pedido

**A página que o cliente abre pelo WhatsApp era um funil de aprovação de arte, e nada mais.**
Ela só mostrava alguma coisa quando o `status_arte` valia `Enviar Arte` ou `Aguard. Aprovação`
— ou quando o atendente girava o selo de entrega para `ALTERADO`. Em qualquer outro status ela
exibia uma frase e terminava. Medido no banco em 20/08: **36 dos 50 links estavam num status em
que a página não mostrava nada.** O endereço que o cliente guardou deixava de servir no dia
seguinte à aprovação — justamente quando ele quer saber do prazo, do endereço e de como pagar.

Agora são **cinco seções sempre abertas**, com barra de abas no rodapé, e a aprovação de arte é
uma delas.

### 🎨 Aprovação de Arte — o que já existia, mais uma cara para cada status

O motor de desenho não mudou: canvas combinado, lightbox com pinça e zoom, viewer de PDF
multipágina com a fila anti-corrupção, seletor de página do CSV, decisão por modelo. O que
mudou é que a aba **não some mais depois de aprovada**:

| status | o que a aba mostra |
|---|---|
| `Enviar Arte`, `Aguard. Aprovação` | a aprovação, como sempre foi |
| `APROVADO` | as artes aprovadas, só leitura, com lightbox |
| `Em Alteração`, `REPROVADO` | as artes, mais **o que o próprio cliente pediu** |
| `EM PRODUCAO` | as artes, com o aviso de que já estão na impressora |
| `Em Arte`, nulo, qualquer outro | "nossa equipe está preparando sua arte" |

Em modo de leitura, os botões APROVAR/ALTERAR e o botão de finalizar somem: botão que não
decide mais nada é convite para o cliente achar que dá para desaprovar.

### 📦 Dados de Entrega — com forma e prazo de envio

Além do endereço, a aba passa a mostrar a **forma de envio** (`frete_escolhido` com a
modalidade e o valor do frete; grátis vira "sem custo", e não "R$ 0,00"), o **prazo de envio**
(`propostas_os.data_termino`, o mesmo campo do Painel de Produção, com o `produtos.prazo` de
reserva) e o **código de rastreio** com link dos Correios quando existe.

### 🧾 Dados de Faturamento — decisão própria

Entrega e faturamento eram um cartão só, com um par de botões e um campo de texto. O atendente
recebia um texto onde os dois assuntos se misturavam. Agora cada aba tem a sua decisão, e cada
uma grava a sua chave em `pedidos_artes.observacoes` — `correcao_entrega` e
`correcao_faturamento`, **sem coluna nova**, porque a coluna é `jsonb`. O painel mostra as duas
rotuladas, e continua lendo `correcao_entrega_faturamento`, que é a chave dos pedidos já
gravados.

O selo continua sendo um só: as duas confirmadas → `APROVADO`; qualquer uma com correção →
`CORRIGIR`.

### 💰 Orçamento — o mesmo resumo que ele já recebeu

Vem de `propostas.texto_whatsapp`, o resumo que o vendedor manda ao fechar o pedido —
preenchido em **1.436 dos 1.489** pedidos dos últimos 30 dias. Remontá-lo a partir dos itens
daria uma segunda versão do mesmo número, e duas versões do mesmo preço na frente do cliente é
o que uma página de gráfica não pode fazer. Nos 4% sem resumo, a aba monta a lista pelos itens.
A saudação e o "me confirma por aqui" saem: mandam o cliente responder num lugar que não existe
ali. **Só consulta** — o orçamento foi fechado no ERP antes de a arte existir.

### 💳 Link para pagamento

Lê `propostas_os.link_pagamento`, que o parceiro vai fornecer. Hoje o campo está vazio nas 23
linhas da tabela, então a aba diz que o link ainda não foi liberado — **e diz o que fazer**.
`status_pagamento` vale `APROVADO` nas 23: é valor padrão, não estado real, e por isso não vira
anúncio na tela do cliente.

### A porta mudou antes de o dinheiro entrar na tela

A página montava a tela com **seis consultas diretas**, todas com a chave anônima — a que está
no código-fonte e qualquer um lê com Ctrl+U. A de `clientes` era `select('*')`: para mostrar
nome, CNPJ, e-mail e telefone, ela baixava também `limite_credito`, `risco_credito` e
`total_compras`.

Agora é **uma chamada só**, `link_cliente_pedido` (`sql/link_cliente_pedido.sql`), no mesmo
desenho da `link_cliente_abrir`: `SECURITY DEFINER`, `search_path` fixo, o par número+token
exigido no corpo, e só os cinco campos do cadastro que a aba de faturamento mostra. Uma ida à
rede em vez de seis, no 4G do cliente.

O arquivo é **aditivo**: não revoga privilégio de tabela nenhuma. `propostas`, `clientes` e
`enderecos` são do ERP parceiro, e fechá-las não é decisão deste projeto — o que mudou é que a
página pública parou de usar aquela porta.

### O nome do cliente, que nunca apareceu

O cabeçalho lia a coluna `cliente_nome`, que **não existe** em `propostas` — a coluna é
`cliente`. Um `|| ''` transformava isso em texto vazio, e campo vazio não parece defeito:
parece pedido sem nome. Estava assim desde o começo.

### Miudezas do mesmo tamanho

- **Celular primeiro**: alvo de toque de 56px, folga de `safe-area` no topo e no rodapé, campos
  com `font-size: 16px` (abaixo disso o iOS dá zoom ao focar), nenhuma rolagem horizontal.
  Conferido num viewport de 390×844.
- **`produtos` para de vir inteiro**: eram 44 colunas para usar cinco — 80 kB entregando 12 kB.
  As linhas continuam todas, porque a busca por nome e apelidos precisa delas.
- **A tela sequencial de conferência saiu** (406 linhas): ela vivia entre a aprovação e o fim e
  escondia a página inteira.

**Testes:** `tests/portal_dados_harness.js`, `tests/portal_abas_harness.js`,
`tests/portal_confirmacoes_harness.js`, `tests/portal_orcamento_harness.js` e
`tests/test_portal_do_pedido.py`.

---

## [v655 — 2026-08-20] — O Prazo de Entrega deixa de ser inventado

**A coluna PRAZO ENTREGA do Painel de Produção nunca mostrou um prazo real.**
`getFallbackPrazo` devolvia a data de criação do pedido mais 3 a 7 dias — os dias escolhidos
pelo resto da divisão do número do pedido. Ele existia só para o filtro **Para Hoje /
Atrasados** ter em que se apoiar enquanto o campo verdadeiro não fosse definido, e o
comentário no código dizia, desde 07/08, que sairia quando o campo aparecesse.

O usuário apontou o campo: **`propostas_os.data_termino`**, casado por `id_int`. É de lá que
o prazo vem agora.

**Pedido sem linha em `propostas_os` fica sem prazo, e a coluna mostra `--`.** A tabela é
nova do parceiro (23 linhas em 20/08, todas de pedidos dos últimos três dias) e ainda não
cobre todo pedido. É de propósito, e segue a decisão que já tinha derrubado os nomes de
cliente de mentira do painel: numa gráfica, data de entrega chutada é pior do que campo
vazio, porque alguém programa produção em cima dela.

**"Atrasado" passou a ser "o dia do prazo já passou"**, e não mais "data e hora anteriores ao
momento atual". `data_termino` é data pura — chega sempre à meia-noite —, e comparar por
instante pintaria de vermelho, o dia inteiro, todo pedido que vence **hoje**. Que é
justamente o que o operador precisa distinguir do que já perdeu.

Um cuidado a mais em `_prazoDoPedido`: se o campo vier como data sem hora (`2026-08-21`), o
JavaScript a leria como meia-noite **UTC** — no Brasil, 21h do dia anterior —, e o pedido
apareceria vencendo um dia antes. A hora é acrescentada antes de converter.

---

## [v655 — 2026-08-20] — Pedido já embalado sai da Lista de Arte *(mesma publicação)*

A Lista de Arte reconhecia só três estados como "saiu da arte": produção, impressão e
finalizada. Pedido em **acabamento**, em **trânsito**, na **expedição** ou já **impresso**
continuava ocupando a tela do designer.

A lista de sinais foi revista contando o que existe de verdade nas **8.268 propostas** do
ERP — as palavras são do parceiro, não nossas:

| Passou a sair da arte | Continua na arte |
|---|---|
| `IMPRESSO` · `EM ACABAMENTO` · `EXPEDICAO` | `NOVO` (941) · `AGUARDANDO` (358) |
| `EM TRANSITO` · `ENTREGUE` · `REVISAO PRODUCAO` | `REVISAO ATENDENTE` · `NOVO_ARTE_APROVADA` |
| (com e sem acento, em todas) | **`APROVADO` (3.363)** · **`LIBERADO` (3.224)** |

**`APROVADO` e `LIBERADO` eram a armadilha.** Soam como fim de linha e são dois terços do
ERP inteiro — o pedido mais recente do dia estava em `LIBERADO`. Qualquer um dos dois na
lista esvaziaria a Lista de Arte. `CANCELADO` (32) ficou de fora por outro motivo: pedido
cancelado não *saiu* da arte, ele deixou de existir, e "Pedidos Concluídos" é card de
trabalho feito.

`IMPRESSO` e `ENTREGUE` entraram sem existir ainda em `status_interno` — são inequívocas, e
são as palavras que o operador espera que funcionem.

**O que provocou a revisão foi um erro meu.** O reparo `correcao_do_cliente_precisa_de_linha.sql`,
rodado na v654, criou linha em `pedidos_artes` para 12 pedidos antigos que tinham link de
cliente. Escapou que, em produção, **ter linha nessa tabela é o que faz o pedido aparecer na
Lista de Arte** (o filtro `existeArtes` do `loadOrdensFromVibecode`): os 12 voltaram para a
tela. O desfazer está em `sql/desfazer_reparo_da_linha_de_arte.sql`, e o arquivo original
ganhou um aviso no topo. O que resolve o problema do cliente continua de pé sem ele —
`garantirLinhaDePedidoArte` cria a linha no painel, na hora de gerar o link, com o pedido de
fato na arte.

---

## [v654 — 2026-08-20] — A alteração de nota fiscal e entrega que o cliente escreve sumia

**A queixa:** o que o cliente registra no link do cliente sobre os dados de nota fiscal e
entrega não estava sendo salvo. No painel, a caixa "Dados de Entrega / Faturamento
Alterados" mostrava sempre a frase genérica *"O cliente solicitou revisão nos dados de
entrega e faturamento"* — que é o texto de reserva, e não o que ele escreveu.

**Três causas somadas, todas caladas:**

1. **A tela do cliente gravava com `.update()`.** Um UPDATE que não acha linha nenhuma
   **não é erro** no PostgREST: responde `200` com `[]`. Conferido no banco de produção.
   O `supabase-js` também não lança — então o `try/catch` em volta era enfeite.
2. **A linha do pedido quase nunca existia.** `pedidos_artes` tinha **38 linhas para 8.263
   propostas**; dos 12 pedidos mais recentes, **um** tinha linha. Ela só nascia quando
   alguém preenchia o briefing no painel.
3. **E a tela do cliente não pode criá-la:** ela roda como `anon` (o link não tem sessão) e
   a RLS recusa o INSERT — `42501, new row violates row-level security policy`. Ler e
   atualizar, pode. Isso está certo e não mudou: abrir INSERT para `anon` daria a qualquer
   um com a chave pública o direito de criar linhas de arte.

**O conserto tem os dois lados.** O painel passou a criar a linha no momento em que gera o
link do cliente (`garantirLinhaDePedidoArte`, chamada por `getOrCreateLinkCliente`) — ali
quem está na tela é um usuário logado. E a tela do cliente grava por
`gravarCorrecaoDoCliente`, que pede as linhas afetadas de volta (`.select('id')` depois do
update) e **devolve o resultado** para quem chamou olhar.

**Se não gravar, o cliente fica sabendo.** Antes ele via "Pedido Aprovado com Sucesso"
mesmo quando o texto tinha sido descartado. Agora vê o aviso de que a solicitação não foi
registrada, com o número do pedido e o que fazer — falar com o atendente.

**O botão "💾 Salvar Correção" passou a salvar.** Ele só escrevia numa variável da tela e
pintava "✅ Correção Registrada". Quem fechasse a aba ali perdia o que escreveu. Agora
grava na hora; quem decide o status do pedido continua sendo o botão final.

**O chat do parceiro volta a receber as nossas mensagens.** As sete gravações em
`propostas_chat` mandavam a coluna `remetente_nome`, que não existe lá (a coluna é
`autor_nome`), e o PostgREST recusava a linha inteira. Nenhuma mensagem nossa jamais chegou
àquele chat — nos três pedidos que têm a correção gravada (18570, 19370, 20925) não há uma
única linha com `setor='Cliente'`. O diagnóstico estava escrito no `script.js` desde 19/08;
só o lado que lê tinha sido consertado.

**As três ações do painel que escrevem em `entrega_dados` tinham o mesmo defeito** —
aprovar os dados, marcar a correção como concluída (o botão verde da caixa laranja) e
registrar a correção pelo atendente. Todas eram UPDATE cego: num pedido sem linha, o
clique não fazia nada e a caixa continuava laranja. As três garantem a linha antes.

**Para os pedidos que já estão com o cliente:**
`sql/correcao_do_cliente_precisa_de_linha.sql` cria a linha que falta. Pode repetir sem
medo — só insere o que não existe.

**Um detalhe que não é do cliente:** o quarto valor de `entrega_dados`, `ALTERADO`, não vem
do link do cliente — ele só nasce do atendente girando o selo na Lista de Arte. Pedido em
`ALTERADO` sem texto do cliente é isso, e não gravação perdida. Era o caso do 20935 na
tela que abriu esta investigação.

---

## [v653 — 2026-08-20] — Abrir o painel deixou de baixar 18 MB de PDF

**A queixa:** quando o parceiro Vibe clica no link da página dele para a nossa Lista de
Arte, demora para entrar; o caminho contrário é instantâneo.

**A causa, medida no navegador:** uma consulta só, `producao_cores?select=*`, levando
**7,6 s** no carregamento. Essa tabela guarda o PDF de referência de cada cor **dentro
da linha**, em base64. São 24 linhas e **17,8 MiB** de JSON — 16,8 MiB de `pdf_base64` e
`pdf_verso_base64`, 1 MiB de `preview_base64` (coluna que nenhum arquivo do frontend lê)
e **11,7 KiB** de tudo o que a tela realmente mostra. Só a cor Mobi são 3,6 MiB. Comprimido
ainda são 13,5 MiB no fio, porque base64 de PDF não comprime. Nada disso era o script.js,
a rede do parceiro ou a Vercel: os arquivos do site chegam em 300 ms.

**O conserto:** o catálogo passou a pedir só as colunas da tela — **2 KB**, 6.860 vezes
menor — e quem vai desenhar a cor chama `garantirPdfDaCor(cor)`, que busca **uma** cor por
vez e guarda o resultado na própria linha. `pdf_filename` e `name_verso` dizem se existe
arquivo sem baixá-lo; o botão 📥 da lista de cores agora busca os bytes no clique.

Medido antes e depois com o mesmo navegador, contra o mesmo banco: **5.022 ms → 510 ms**
na consulta do catálogo. A página do cliente (`cliente.html`) baixava os mesmos 18 MB
antes de mostrar a arte para aprovação, e recebeu o mesmo remédio.

Pediram o PDF antes de desenhar: `drawAmostraFace` (painel e página do cliente),
`renderEditorLayer1Cor` (Criador de Arte), `drawPedPreview` e os dois "enviar para"
(imposição e pedido), o `editCor` e o duplicar cor. A prévia do pedido é síncrona de
propósito, então ela pede o arquivo e redesenha quando ele chega.

**Fica anotado, para depois:** `produtos_proposta` traz `amostra_arte_base64` na lista
(1,3 MB; sem essa coluna seriam 59 KB), e o `loadAll` roda duas vezes por carregamento.
Nenhum dos dois pesa como o catálogo de cores pesava.

---

## [v652 — 2026-08-19] — A coluna "Data Liberação" vira "Tempo"

**A Lista de Arte passou a mostrar há quanto tempo cada pedido está no card em que
está** — `01:05` —, pintado conforme esse tempo cresce: verde até 1h, azul até 2h,
laranja até 3h, vermelho depois. A escala vale nos quatro cards. **O pedido de maior
tempo assume o topo da lista**, em cada card. As duas datas que ficavam na coluna não
se perderam: foram para o título da célula, junto com "em tal card desde tal hora".

**O card é calculado; o relógio precisou de memória.** Não existia em lugar nenhum o
registro de quando um pedido entrou no card atual. Ele passou a viver na tabela nova
`imposition_tempo_no_card`, uma linha por pedido, escrita pelo próprio painel quando
ele desenha a lista e percebe a troca. Foi decisão do usuário, contra a alternativa de
um robô no servidor: o robô seria fiel ao relógio real mesmo com todos os painéis
fechados, mas exigiria reescrever a classificação em SQL, criando uma segunda cópia da
regra que divergiria da do painel no primeiro ajuste. A consequência aceita é que troca
acontecida de madrugada só é registrada quando alguém abre o painel de manhã.

**A regra dos 60 minutos.** Em "Em Arte" o tempo não se perde numa ida rápida a outro
card: saiu e voltou em até 60 minutos, a contagem segue de onde parou; passou disso,
volta ao zero. Nos demais cards zera a cada troca. O crédito é descontado do *início*
em vez de somado ao total, e por isso um número só serve para desenhar a célula, para o
relógio andar sozinho e para ordenar a lista.

O teste pegou um erro real da primeira implementação: o pedido que passava por **dois**
cards fora da arte antes de voltar perdia o crédito no segundo salto, mesmo dentro dos
60 minutos. O que conta é há quanto tempo ele saiu *da arte*, e não do card anterior.

**A conferência do SQL pegou uma folga de segurança.** O Supabase dá `GRANT ALL` ao
papel `authenticated` em toda tabela nova, por privilégio padrão do esquema — então o
`GRANT SELECT, INSERT, UPDATE` não restringia nada e o painel logado ficava podendo
`TRUNCATE` a tabela. Entrou um `REVOKE` antes do `GRANT`. Vale conferir as demais
tabelas do projeto pelo mesmo motivo.

O relógio anda sozinho a cada 30 segundos mexendo só no texto e na cor das células —
redesenhar a lista fecharia menu aberto e perderia a rolagem de quem estivesse lendo.

---

## [v651 — 2026-08-19] — Lista de Arte enxuta, com Preview, e o frete Veppo com a marca

**A caixa "Designers Ideal" passou a contar só o card "Em Arte".** Ela mostra, ao lado
de cada pessoa, quantos pedidos e quantos modelos ela tem — e contava todos os pedidos,
somando os já aprovados, os que esperam resposta do cliente e os que foram para a
produção meses atrás. O número só crescia e não dizia quanto trabalho a pessoa tem hoje.

Para isso, a classificação dos pedidos saiu de dentro do `renderOrdens` e virou a função
`classificarPedidoNaArte`. Era um trecho solto que só existia enquanto a tabela era
desenhada, e a caixa aparece dentro do pedido, noutro momento — por isso ela contava por
conta própria. Agora card e caixa respondem pela mesma função e não têm como divergir.

**A linha do pedido ficou só com o número.** Saíram o ícone do Vibe e o botão de copiar
o link direto. O do Vibe continua vivo dentro do pedido aberto; o de copiar foi
excluído, e a função que só servia a ele saiu junto. A rota `/pedido/20928` continua
funcionando — o que sumiu foi o atalho para copiar o endereço, não o endereço.

**Entrou a coluna Preview**, entre Vendedor e Tempo, igual à do Painel de Produção — e
literalmente igual: o desenho virou a função `previewDaArteDoPedidoHtml`, chamada pelas
duas tabelas. Arte em PDF continua saindo como atalho para abrir o arquivo, e não como
miniatura rasterizada.

**O frete Veppo passou a aparecer com a logomarca dele** no Painel de Produção, como já
acontecia com Sedex, São Miguel, Motoboy e Retirada. São 27 pedidos no banco. O nome é
digitado à mão pelo parceiro e chega em quatro grafias — `VEPPO`, `veppo`, `Veppo` e
`VEPPO-RS` —, todas cobertas por uma chave só.

A tabela do parceiro tem uma coluna `tem_veppo`, e ela **não** serve: são 5 linhas no
total, todas antigas, e uma delas marca `true` num pedido cujo frete escrito é
"SÃO MIGUEL". Quem manda é o texto de `frete_escolhido`.

---

## [v650 — 2026-08-19] — O link do Vibe repetido dentro do pedido

**O ícone que leva ao sistema parceiro passou a aparecer também no cabeçalho do pedido
aberto**, entre o número e o nome do cliente. Ele só existia na linha da Lista de Arte,
e depois de abrir o pedido era preciso fechar, achar a linha de novo e clicar lá.

O botão passou a nascer de uma função única, `botaoDoVibeHtml`. Era a terceira cópia do
mesmo HTML, e no dia em que o endereço ou o menu do parceiro mudar, a cópia que passasse
batida abriria noutro lugar sem avisar ninguém.

O encaixe no `index.html` nasce vazio de propósito: uma âncora escrita ali duplicaria o
endereço e o nome da aba, que moram no `script.js` — e um `href="#"` no documento seria
resolvido pelo `<base href="/">` para a raiz.

---

## [v649 — 2026-08-19] — Link direto para o pedido, abas nomeadas e o Vibe no menu Pedido

**`https://ideal-imposition.vercel.app/pedido/20928` abre o painel já dentro do pedido
20928.** É o endereço que se manda ao parceiro. Quem não estiver logado para no login,
como em qualquer outra tela.

É **caminho**, e não `?pedido=20928`, por um motivo prático: quando a pessoa não está
logada, o login do Supabase volta para `origin + pathname` e a query string se perderia
no caminho de ida.

Duas armadilhas que só apareceram abrindo o endereço num Chrome de verdade:

- A Vercel precisava da reescrita `/pedido/:match*` → `/frontend/index.html`, declarada
  **antes** da regra genérica, senão o endereço dava 404.
- O `index.html` carrega 23 scripts por caminho **relativo**. Em `/pedido/20928` eles
  resolveriam para `/pedido/script.js`, e a reescrita devolvia o próprio HTML no lugar
  de cada um — "Unexpected token '<'" oito vezes, página morta. Um `<base href="/">` no
  topo do documento resolve todos de uma vez.

**As abas passaram a ter nome.** `_blank` quer dizer "sempre outra aba": abrir cinco
pedidos no Vibe deixava cinco abas do Vibe. Um nome faz o primeiro clique abrir a aba e
os seguintes trocarem o conteúdo dela. O `rel="noopener"` teve de sair junto — foi
medido num Chrome que, com ele, o navegador ignora o nome e cria uma aba por clique.

**O ícone do Vibe passou a abrir no menu "Pedido"**, e não no "Produto".

---

## [v648 — 2026-08-19] — O número do cliente ao lado do nome, e a produção só do ADM

**O número do cliente passou a aparecer ao lado do nome**, nas listas e dentro do
pedido: `20928 Patrick Soares Furtado - 28449`. A relação certa no banco é
`propostas.id_cliente` → `clientes.id_cliente`.

Não confundir com `id_faturado`: os dois divergem — no pedido 20940 são 43520 e 66163.
O `id_faturado` continua sendo usado internamente para casar numerações de cliente
(`Cli_Num`); quem vai para a tela é o `id_cliente`.

**O botão PRODUÇÃO passou a ser só do administrador.** Ele é de contingência: o caminho
normal é o parceiro atualizar `propostas.status_interno` para `EM PRODUCAO`, o que leva
o pedido para o card "Pedidos Concluídos" e para o Painel de Produção. O botão passou a
dizer isso na própria tela, em vez de só aparecer ou sumir.

---

## [v647 — 2026-08-19] — A caixa de entrega para de mostrar o chat do parceiro

**A "Solicitação de Alteração enviada pelo Cliente" mostrava recado que não era do
cliente** — chegou a exibir uma nota de PIX do Financeiro. A caixa caía num plano B que
lia `propostas_chat`, do parceiro, com um filtro que terminava em `|| m.length > 5`:
qualquer mensagem com mais de cinco caracteres virava "fala do cliente".

O plano B foi removido. E ficou registrado um achado do banco: as sete inserções que o
painel faz em `propostas_chat` usam a coluna `remetente_nome`, que **não existe** — a
coluna é `autor_nome`. Nenhuma delas jamais gravou nada.

---

## [v646 — 2026-08-19] — A arte de aprovação é refeita ao marcar PRONTO

**A arte de amostra passou a ser gerada e salva de novo sempre que o modelo é marcado
como PRONTO.** Antes ela ficava com a versão antiga depois de uma correção, e era essa
versão velha que o cliente via.

**O "Gerar Link" passou a esperar a regeneração antes de copiar o link**, em vez de
disparar depois. Se a geração falhar, o modelo **não** é marcado como pronto e o
operador é avisado — mandar link com arte velha é pior do que não mandar.

**O link do cliente passou a mostrar arte em PDF.** O pedido 20927 aparecia sem arte
nenhuma: o `arte_url` é um `.pdf`, o `amostra_arte_base64` estava nulo, e o plano B da
página do cliente colocava o PDF dentro de uma `<img>` — que não sabe abrir PDF.

**A aprovação passou a registrar QUEM aprovou.** Pelo link do cliente grava
`APROVADA_CLIENTE`; pelo botão do pedido, `APROVADA` — e o aviso na tela diz "aprovado
pelo cliente" ou "aprovado pelo ATENDENTE". Os dois valores já eram lidos como aprovado
em todo o código, então não é vocabulário novo para o sistema parceiro.

---

## [v645 — 2026-08-19] — Regras de bloqueio do negócio na arte

Quatro travas que não precisam de painel de permissões, porque são regras do negócio:

**1. O designer não muda o designer de um pedido.** Quem define é o atendimento.

**2. Modelo aprovado não se altera** — nem cor, nem numeração, nem tabelas, nem nada.
Libera apenas o botão "Em Alteração" e a descrição, e só para atendimento, gerente e
administrador. A trava fica no único ponto por onde a escrita passa, o `saveAmostraToDB`,
e é silenciosa quando o que está sendo gravado é só a prévia — que o desenho do card
reescreve a cada renderização, e que faria o operador levar um aviso a cada segundo.

**3. A Qtd do modelo tem de bater com as células geradas**: igual à Qtd quando a
numeração imprime só a frente, o dobro quando é Frente × Verso. Divergiu, o designer não
consegue marcar PRONTO, e o pedido não anda até alguém corrigir. A correção é sempre nas
linhas da numeração: **a Qtd nunca é escrita de volta no banco**, porque é a quantidade
contratada e mexer nela mexe no valor do pedido.

**4. Pedido com status interno "EM PRODUCAO" aparece só no card "Pedidos Concluídos"**,
e some das outras filas da Lista de Arte.

**Os cinco cards passaram a abrir a lista deles.** Quatro filtravam a tabela ao clique e
o de Pedidos Concluídos era mudo — e desde que os pedidos liberados passaram a contar só
nele, ele era o único caminho para vê-los.

## [v644 — 2026-08-18] — Transparência no elemento PDF e SVG, sem rasterizar

**O card do elemento ganhou um controle de Opacidade**, de 0 a 100%, ao lado da Largura
e da Altura. Vale para os dois tipos de arquivo, PDF e SVG. O padrão é 100%, e todo
elemento já gravado continua saindo exatamente como sempre saiu.

**A arte não é rasterizada em momento nenhum.** Em qualquer porcentagem, o vetor
continua vetor, o texto continua texto, a fonte continua embutida e a cor CMYK não é
convertida. A transparência usada é a do próprio formato PDF, que a tem desde 1999 —
quem achata é o RIP da impressora, na resolução dele, do mesmo jeito que já acontece
com um PDF que chega com transparência feita no Illustrator. Uma primeira versão deste
recurso rasterizava a arte a 300 dpi e foi revertida inteira: numa gráfica, trocar a
resolução do equipamento por uma escolhida no código é perda que só aparece no papel.

**A 100% o caminho da impressão é literalmente o mesmo de antes** — a página não ganha
nem um objeto novo. Há teste comparando o arquivo gerado com e sem o campo e exigindo
que o conteúdo seja idêntico.

**Dois detalhes que decidem se a transparência sai certa ou só parecida.** O primeiro é
o grupo de transparência: sem ele, duas formas da mesma arte que se sobrepõem se
enxergam uma pela outra, e a sobreposição sai mais escura que o resto. O segundo é o
cerco do estado gráfico: sem ele a opacidade vazaria para tudo o que fosse desenhado
depois na folha — a numeração, o picote, a célula seguinte. Os dois estão cobertos por
teste, incluindo uma imposição de oito células conferindo que todas saem iguais.

**As dez janelas mostram a mesma coisa.** Editor, janela de arte, modo PDF, link do
cliente, Criador de Arte, prévia de imposição (as duas cópias) e PDF Gabarito passaram
a desenhar por uma função só, `drawArteDoElemento()`.

---

## [v639 — 2026-08-18] — O menu Ideal Control da gráfica

**A busca é pelo número do cliente.** O atendente atende o telefone sabendo quem está do
outro lado; o número do pedido ele teria de perguntar, e o cliente muitas vezes não tem em
mãos. Digitar o número do cliente abre quem ele é, as contas dele, o bloco de liberar acesso
e a lista dos pedidos dele que têm controle — tocar num deles abre o painel de configuração,
como antes.

**O que o cliente salva no aplicativo agora aparece aqui, e vice-versa.** Faltavam duas
coisas, as duas do lado do cliente: a **situação do evento** (ele inativa e finaliza pela
engrenagem do celular, e a gráfica não via nem uma coisa nem outra) e o **setor bloqueado
inteiro**, com o motivo que o porteiro lê em voz alta. As duas agora aparecem no painel da
gráfica, e podem ser mudadas de lá — é a mesma coluna nos dois lados.

**Dois caminhos mortos saíram.** "Criar um aparelho" e "Gerar código de pareamento"
produziam um código de seis caracteres que **não tinha mais onde ser digitado** desde
16/08/2026, quando a tela que o pedia saiu da portaria. No lugar deles, a tela explica como
um aparelho entra hoje: o próprio cliente abre o evento no celular e toca na barra.

---

## [v637 e v638 — 2026-08-18] — O aparelho, o nome dele, e a tela de leitura

**"Revogar" saiu.** Ele desligava o aparelho e deixava o cartão na lista para sempre — que não
é nenhuma das duas coisas que se quer fazer com um portão. No lugar dele, as quatro opções que
o usuário pediu, em botões do mesmo tamanho, um abaixo do outro: **Renomear**, **Selecionar os
Setores**, **Pausar** e **Excluir**.

- **Excluir apaga mesmo** (`DELETE /aparelhos/{id}`): o aparelho some da lista. Os vínculos de
  setor vão junto; as leituras ficam, sem dono, porque o histórico da noite não pode depender
  de o aparelho continuar existindo. Ver `sql/schema_acesso_excluir_aparelho.sql`.
- **Pausar tem volta** (`status = pausado`, e *Retomar*). A portaria já exigia
  `status = ativo`, então pausar derruba o aparelho do outro lado sem nenhum código a mais.
- Renomear e Selecionar os Setores abrem o painel delas, **uma de cada vez**, e a abertura
  sobrevive ao redesenho do painel — marcar um setor grava sozinho e recarrega.
- **Os setores também empilhados**, todos da mesma largura.

**O nome é do dispositivo, não do evento.** O mesmo celular era "Aparelho 1" num evento e
"Aparelho 3" no outro, porque a sugestão contava os portões daquele evento. Agora o celular
guarda o próprio nome (responde sem rede, e já vem escrito na pergunta "usar este aparelho?"),
e o servidor liga as linhas do mesmo aparelho pela coluna nova `navegador_id`: renomear um
portão renomeia os outros do mesmo cliente. Ver `sql/schema_acesso_nome_do_dispositivo.sql`.

Os dois arquivos SQL já foram rodados no banco.

### A tela de leitura: o setor em destaque, e o que se toca na base

Decisão do usuário: o porteiro segura o celular por baixo e trabalha com o polegar. O
**contador**, a **lanterna** e o **Digitar o número** desceram para o fim da tela; o visor da
câmera cresceu para ocupar o que sobrou — câmera maior é mira mais fácil. No topo, o **nome
do setor** virou a linha grande em verde, e o nome do aparelho ficou pequeno embaixo dele: o
setor responde à pergunta que o porteiro faz o tempo todo ("esta pessoa está na fila
certa?"), e o nome do aparelho se pergunta uma vez por noite.

### A casa vazia diz onde estão os eventos

Um cliente entrou pela primeira vez e leu **"Nenhum evento aqui ainda"** — com quatro
eventos na conta dele, todos finalizados, a um toque dali no menu do olho. A frase era
verdade sobre a lista e mentira sobre a conta, e a leitura natural foi que o cadastro não
tinha funcionado.

Agora, quando a lista está vazia **e** existem finalizados, a casa vazia diz quantos são
("Você tem 4 eventos finalizados. Para usar um deles de novo, reabra ele.") e traz o botão
**Ver eventos finalizados**, que abre o menu direto neles. Sem nenhum finalizado nada muda:
os três passos já são a saída de quem nunca teve evento.

---

## [v636 — 2026-08-18] — A lista de produtos do ADM

A lista de produtos do ADM passou a ser a mesma que a Lista de Arte e o Painel de Produção
mostram. *(Entrada resumida: a leva saiu por outra sessão de trabalho.)*

---

## [v635 — 2026-08-18] — Usabilidade do Ideal Control

Depois da identidade visual, o atrito. O que a leva tira do caminho:

**Entrar libera 15 minutos.** O cliente entrava com e-mail e senha e, no primeiro Carregar,
digitava a senha de novo. Agora a mesma digitação compra um **bilhete de conta**
(`POST /minha-conta/elevar`, o mesmo segredo e formato da elevação de evento, sob o
pseudo-evento `conta`, preso ao navegador). Dentro dos 15 minutos ele dispensa a digitação
em duas portas — `POST /pedidos/{p}/carregar` e `POST /eventos/{id}/elevar` —, e a
engrenagem o troca pelo bilhete **do evento**, que é o que toda escrita exige. Ele não
substitui elevação nenhuma: a assinatura é recalculada sobre o id do evento, e `conta` não
bate. Trocar a senha também compra o bilhete (com a nova); sair da conta o esquece; um
bilhete de conta emitido para o navegador A não cunha elevação para o navegador B. Na
tela: a caixa do Carregar esconde o campo de senha ("Você entrou há pouco: não precisa
digitar a senha de novo") e o devolve com a frase certa se o bilhete venceu — inclusive
quando o gerenciador de senhas preencheu o campo escondido por fora.

**Mostrar/Ocultar** em todo campo de senha; e-mail sem auto-capitalizar; Enter em todo
formulário (inclusive o número digitado na portaria).

**Botões com estado de espera** — "Entrando…", "Salvando…", "Carregando…", "Conferindo…",
"Gravando…", "Reabrindo…" — desabilitados durante a ida à rede, e voltando ao texto
original mesmo quando dá erro. A `travarCampos()` da engrenagem, que corre a cada 20 s,
não reabilita botão em espera: era assim que um segundo toque em "Salvar nome" mandava dois
PATCH.

**A casa mais falante.** A barra do evento ganhou subtítulo (data · local · "lê neste
aparelho como Aparelho 1"); a casa vazia diz os três passos; o menu do olho diz a conta e
a versão; Meus Pedidos tem "Atualizar"; e ao abrir a engrenagem dentro dos 15 minutos o
botão da lista fica ocupado (`aria-busy`) em vez de deixar a tela morta.

**A engrenagem em cinco seções recolhidas** — Evento, Aparelhos, Setores, Este aparelho,
Zona de risco —, cada uma com o resumo no cabeçalho ("3 aparelhos · 1 revogado",
"3 setores · 1 bloqueado"), o estado lembrado por evento, nada fechando por baixo do dono
quando a tela redesenha. A engrenagem inteira cabe numa tela de celular.

**O nome do aparelho na hora.** "Sim, usar este aparelho" pergunta o nome (opcional,
sugere "Aparelho N") — tanto depois do Carregar quanto ao tocar na barra do evento, que
antes só a senha confirmava: virar aparelho encerra a sessão da conta neste celular, e
uma confirmação antes disso é proteção, não burocracia. O nome é cortado em 60 no dado,
não só no `maxlength`.

**No painel da gráfica, "Enviar por WhatsApp"** ao lado da senha provisória: abre o
WhatsApp com e-mail, senha e link de instalação já escritos; vive e morre com a senha na
tela, e nunca aparece no pedido errado.

---

## [v632 — 2026-08-18] — A identidade visual do Ideal Control

O aplicativo funcionava, mas parecia um formulário: fundo chapado, botões genéricos, letra
do sistema, e a primeira tela que o cliente via depois de ler o QR de instalação era um
título solto no escuro. O usuário pediu **"modernizar e refinar, dar identidade"** — e deu
liberdade para mexer em layout, cores, botões e efeitos.

**A identidade nasce do próprio ícone do aplicativo**: o degradê verde-água → azul do
fundo, a fita laranja, o ingresso off-white. O fundo ganhou esse brilho subindo do alto
da tela (por cima do `#0a0f1e`, que continua sendo a cor de abertura); os cartões ganharam
relevo — fio de luz na borda de cima, sombra por baixo; os botões de ação viraram o
degradê do ícone com sombra na cor dele; e o cabeçalho tem a assinatura da marca, um fio
que vai do verde-água ao laranja e some. A **letra é a Manrope**, embarcada
(`ideal-control.woff2`, 24 KB, no pré-cache do service worker): o aplicativo continua
abrindo sem rede e sem CDN.

**Navegação e menus.** As seções têm etiqueta em caixa alta com uma régua até a borda; os
"Voltar" viraram pílulas discretas; o menu do olho virou uma lista com a seta à direita; a
barra **Meus Pedidos** é a única pintada com o degradê da marca, e o "+" ao lado dela é a
única bolinha cheia — um convite, não uma configuração. As portas da casa (Entrar, Escolha
a sua senha, Configurar o evento) têm a barra da marca no alto e um cadeado ao lado do
título. Nos pedidos, o número virou selo, os setores viraram linhas com selo de impressão,
e o Carregar leva uma seta.

**Efeitos.** Cada troca de tela desliza de leve para cima; a luz verde do aparelho que já lê
o evento respira; a faixa âmbar do modo configuração pulsa; a caixa "tem certeza?" sobe do
rodapé sobre um fundo desfocado. Na portaria, o **visor da câmera** ganhou cantoneiras
verde-água nos quatro cantos e uma linha discreta que varre o quadro — a câmera está viva.
Quem pediu ao sistema menos movimento (`prefers-reduced-motion`) não recebe nenhum deles.

**A parede de instalação** — a primeira impressão — mostra o ícone do aplicativo, o nome, o
motivo e o botão, sobre o mesmo brilho da marca; no iPhone, a instrução do Compartilhar vem
num cartão.

O que **não** mudou: cada id e cada classe que o JS e os testes usam; a área segura do topo;
a `.sumindo` com o único `!important`; a tranca e a faixa grudadas no topo; o vermelho
reservado à zona de risco; e o texto de todos os botões.

---

## [v631 — 2026-08-18] — A conta do cliente traz os pedidos; o QR do Pedido sai de cena

Até aqui o cliente entrava no controle de acesso por um **QR do Pedido**: o atendente
gerava um QR no painel, mandava por WhatsApp, e quem lesse aquela imagem cadastrava o
evento — uma vez. O QR era a credencial. Quem recebesse o encaminhamento reivindicava o
pedido no lugar do dono, e desfazer isso não tinha botão: era conserto à mão no banco.

**Agora quem traz os pedidos é a conta do cliente** — a mesma que ele já usa no ERP Vibe,
pela regra que este projeto não abre mão: nenhuma tela nossa cria conta separada.

**A gráfica libera o acesso pelo painel**, dentro do pedido, no bloco novo **"Acesso do
cliente"**: um e-mail, um toque, e sai uma senha provisória de 8 símbolos — sem `0 O 1 I
L`, que são os que se confundem ao ditar por telefone. Ela aparece **uma vez só**, porque
o que fica guardado é o hash dela, e a tela diz isso em texto. E-mail que já tinha conta no
Vibe é só **ligado** ao cliente: a senha dele não é tocada, senão a gráfica derrubaria o
acesso da pessoa ao ERP.

**A senha provisória nunca aparece no pedido errado.** O atendente toca em "Liberar
acesso" no pedido A, a resposta demora, ele abre o pedido B enquanto espera — e sem a
conferência a senha de A apareceria sob o nome de B. A tela confere **duas** coisas antes
de mostrar: o número do pedido e o id do cliente. Só o pedido não bastaria, porque o
parceiro pode trocar o cliente de uma proposta e o mesmo número já é outra gente.

**O QR que sobra é o de instalação**, um só, genérico, igual para todos os clientes:
`https://ideal-imposition.vercel.app/ic/`. Ele não é credencial de nada — leva à instalação
do aplicativo. Pode ir para material impresso e para o WhatsApp sem risco nenhum.

**"Meus Pedidos"** tomou o lugar da barra "Novo Evento" na casa do aplicativo, e a câmera
saiu junto com o QR. A lista traz os pedidos do cliente **já impressos** — com pelo menos
uma credencial publicada, e não pelo carimbo `publicado_em`, que gerar QR e reimprimir
zeram —, legíveis, não cancelados e ainda não carregados. Nome, data e local vêm da ficha
da arte.

**"Carregar" é o antigo reivindicar, sem QR:** cria o evento (ou junta a um que já existe
do mesmo cliente, para o pedido complementar não virar uma segunda festa), um setor por
modelo legível, e carimba as credenciais. A resposta devolve a **elevação de 15 minutos** —
por isso a pergunta seguinte, "quer usar este aparelho para ler os ingressos dele?", liga o
aparelho sem pedir a senha de novo. A pessoa acabou de digitá-la ali. Ou `null`, se a
elevação falhar depois de o evento já existir; nesse caso a tela pede a senha de novo antes
de ligar o aparelho — perder o evento seria grave, perder o bilhete de 15 minutos é
recuperável, e por isso a gravação não volta atrás por causa dele.

**Os eventos passaram a ser do cliente, e não da conta.** Toda conta ligada ao mesmo
`id_cliente` vê e configura os mesmos eventos — o dono e o financeiro da mesma empresa não
enxergam metades diferentes. Os eventos antigos continuam visíveis pela conta que os criou.

**"Esqueci minha senha" manda falar com a gráfica.** Não é preguiça: este projeto não tem
SMTP, e-mail de recuperação não chega a lugar nenhum, e um botão que promete um e-mail que
nunca vem é pior que não ter botão.

**Vocabulário: "Aparelho", nunca "Portão".** Decisão do usuário — todo aparelho é portão, e
a palavra dupla fazia o dono procurar uma tela de "portões" que não existe.

**O primeiro acesso obriga a trocar a senha**, e não há como escapar dessa tela: o olho do
cabeçalho fica travado enquanto ela está no ar, e a lista de eventos não reaparece por baixo
dela.

**O que saiu do repositório:** `frontend/evento.html`, `evento.js`, `ler-qr.js` e
`instalar.js`. As funções de servidor `acesso-evento`, `acesso-pedido` e o
`POST /reivindicar` **ficam publicadas um release**, sem chamador nenhum — para nenhum QR
que já circula por WhatsApp bater em porta fechada antes da hora.

**Acabamento das telas novas:** a barra "Meus Pedidos" ganhou um ícone de lista; o cartão
de cada pedido, uma linha verde-água à esquerda quando há setor já impresso e uma linha
separando a leitura da ação; a caixa do Carregar, uma linha separando a ficha do evento da
confirmação com senha; entrar, escolher a senha e entrar na configuração ganharam a mesma
borda verde-água no alto, que é o que diz que as três são a mesma coisa — a pessoa provando
quem é. Todo botão afunda 2% ao toque, porque no aplicativo instalado não há cursor nem
barra de endereço, e o afundamento é o único recibo imediato de que o toque valeu. Quem
pediu para o sistema não se mexer (`prefers-reduced-motion`) não recebe a animação. No
painel da gráfica, as linhas de conta do bloco "Acesso do cliente" deixaram de se encostar.

---

## [v612] — O dono configura o portão no próprio celular

Até aqui, pôr um portão no ar era: o dono criava o aparelho na tela dele, o servidor
sorteava um código de seis caracteres, e alguém digitava esse código no celular do portão.
Agora o dono vai até o aparelho, **digita a senha uma vez**, dá um nome ao portão, toca nos
setores e salva. Não há código para anotar nem para ditar por telefone.

**A conta sai do aparelho ao salvar.** O código de seis caracteres existia por uma razão: a
senha do dono nunca chegava ao celular que fica com o porteiro. Trocar o código pela senha e
**deixar a sessão aberta** entregaria ao porteiro a conta inteira do cliente — os eventos, a
configuração, tudo. Salvo o aparelho, a sessão é encerrada ali mesmo e o celular fica só com
o token, que serve para ler ingresso daquele evento, naqueles setores, e nada mais.

**A ordem das três operações é a parte que não pode sair errada:** guardar o token, encerrar
a sessão, ir para a leitura. Invertidas as duas primeiras, uma falha no meio deixa o aparelho
sem as duas coisas — sem conta para tentar de novo e sem token para trabalhar, no meio de um
evento. O token vem primeiro porque é o que não dá para recuperar: ele sai do servidor uma
vez só.

**Uma senha, uma vez.** Entrar e elevar continuam sendo duas chamadas — o login é do
Supabase, a elevação é nossa, assinada e com prazo. O que a decisão do usuário proíbe é a
pessoa digitar duas vezes.

**O aparelho nasce sem código**, e é assim de propósito: código guardado no banco é código
que parearia um **segundo** celular naquele portão. A coluna `codigo_hash` passou a aceitar
nulo (`sql/acesso_aparelho_sem_codigo.sql`); nada foi apagado, e o caminho antigo continua
funcionando para quem precisa configurar um celular que não está ali.

**A trava.** Salvo o aparelho, ele abre direto na leitura, e a única saída é
"Configurar este aparelho" — que leva à tela de login. Reeditar **e apagar** passam pela
senha: o `desparear`, que apagava token, carga, fila e entradas ali mesmo, deixou de fazer
isso. Trava que protege a edição e deixa o apagar livre não é trava.

**A fila sobe antes de o aparelho trocar de identidade.** Configurar cunha um token novo, e
leitura enfileirada sob o token velho não sobe mais depois — some a contagem que o cliente
pagou para ter. Sem sinal, a saída espera e diz por quê; configurar exige rede de qualquer
forma. A exceção é o aparelho revogado, que já ficou sem token: prendê-lo não salvaria nada.

**Achado escrevendo a trava:** a carga guarda o **nome** do portão e os **setores** que ele
valida. Reconfigurado o celular, a carga que está nele é do aparelho anterior — o topo
mostraria o portão velho e a validação recusaria ingresso bom como "OUTRA PORTA", sem nada na
tela que explicasse. Agora a carga é baixada de novo antes da primeira leitura, e se ela não
chegar o aparelho espera em vez de ler com a antiga. Trocando de **evento**, a fila que
sobrou é esquecida: o servidor a gravaria com o evento do token atual — entrada de um evento
contada em outro.

**E uma correção achada conferindo esta leva:** o service worker não guardava `aparelho.js`
nem `sw-registro.js`. Com sinal ninguém perceberia — a busca cai na rede. No modo avião, o
script simplesmente não carrega, sem erro na tela, e o botão não faz nada. Agora uma guarda
lê a lista **da própria tela**: acrescentar um `<script>` e esquecer o cache quebra o teste em
vez de quebrar o aparelho na gráfica.

---

## [v611] — O convite para instalar aparecia só na tela do porteiro

A v610 estreou o aplicativo instalável, mas só o `portaria.html` registrava o service worker.
O Chrome só oferece "Instalar aplicativo" numa página que tenha um registrado — e a **casa**
do aplicativo é o `controle.html`. Na prática, quem abrisse `/ic/` nunca via o convite, que
era o ponto do release. O registro virou um arquivo compartilhado pelas três telas.

---

## [v610] — O Ideal Control vira um aplicativo só

O cliente instala **um** aplicativo. Ele abre em **Seus eventos**, tem um botão **+ Novo
Evento** que abre a câmera, e é o mesmo aplicativo que atende a portaria.

**O prefixo `/ic/`, sem mover arquivo nenhum.** Um aplicativo instalável precisa de escopo,
e escopo é prefixo de URL — mas as telas moram na raiz, ao lado do `index.html` e do
`producao.html` da gráfica. Escopo `/` poria as telas da gráfica dentro do aplicativo do
cliente, e o porteiro tocaria num link e cairia no painel de produção. O prefixo sai de
reescrita na Vercel; os arquivos ficam onde estão.

**As URLs de hoje continuam valendo**, por redirecionamento declarado na Vercel. É isso que
mantém vivo o QR do Pedido que já circula por WhatsApp e o endereço do portão que já foi
passado a porteiro — a querystring chega intacta.

**Uma câmera, dois tipos de QR.** Não existe seletor de modo: o próprio QR diz o que ele é.
`?t=` cadastra o evento, `?e=` liga o aparelho na portaria. Um seletor seria mais uma decisão
para errar — e errar aqui manda o dono para a tela do porteiro, ou o porteiro para a tela de
cadastro. QR de outra origem é recusado com a mensagem que diz **o que fazer**, não só o que
deu errado.

**O portão vem antes da rede.** Havendo aparelho pareado, o aplicativo abre direto na leitura
**antes** de perguntar a sessão ao Supabase. Invertida a ordem, o portão passaria a depender
de rede — a única coisa que ele não pode fazer.

**O botão da câmera fica acima do login, e fora dele.** O porteiro não tem conta, e pedir
login a ele seria travar o portão numa credencial que ninguém lhe deu.

**O CDN saiu.** `controle.html` e `evento.html` buscavam o SDK do Supabase e o gerador de QR
no jsDelivr. Script de outra origem que não carrega derruba a página, e o service worker não
tem como guardá-lo — resposta de outra origem é opaca. Um aplicativo instalado que morre sem
rede em três das quatro telas não é um aplicativo instalado. A segunda razão é independente:
buscar o código de **autenticação** num terceiro significa que quem controlar aquele endereço
controla o portão. Os dois passam a ser servidos daqui, com a versão congelada (supabase-js
2.112.3) em vez de flutuar no `@2`.

**E o convite para instalar.** Não existe "link que instala": o link é a URL, e quem instala é
o navegador. O que faltava era a tela pedir — botão no Android, e no iPhone, onde não há
evento nenhum, o caminho do Compartilhar escrito por extenso.

Dois defeitos que só apareceram dirigindo o navegador, e não nos testes: o service worker,
servido na raiz pela estação, registrava com escopo `/` e assumiria o painel de produção —
agora só registra sob o prefixo; e a câmera da casa não funcionaria, porque ela ainda chamava
a tela da portaria pelo nome.

---

## [v609] — O perfil de cor volta a falar com a estação

**O bug era silencioso das duas pontas.** O bloco de Gerenciamento de Cores já dizia no
próprio comentário onde o dado mora — o mapa vive no agente da estação
(`printer_icc_map.json`) —, mas as cinco chamadas usavam caminho **relativo**. No painel
aberto pela nuvem elas iam parar no servidor antigo, que tem outro disco e efêmero. O
seletor de perfil vinha vazio, como se a estação não tivesse perfil nenhum, e o que fosse
salvo sumia na publicação seguinte **sem erro na tela**. Quem configurasse cor pelo painel
da nuvem imprimiria com a configuração antiga e não teria como saber.

É o mesmo desvio já corrigido antes em `carregarCapacidades` e no mapa de PPDs; este bloco
tinha ficado para trás.

**Sai o ping de pré-aquecimento.** Ele disparava em toda página carregada da nuvem só para
acordar o servidor. Não há mais o que acordar: as telas falam com Edge Functions, que não
dormem.

**Arrumação na chave pública** ([sql/fontes_tirar_o_que_sobrou_da_chave_publica.sql](sql/fontes_tirar_o_que_sobrou_da_chave_publica.sql)):
a chave anônima ainda tinha `REFERENCES`, `TRIGGER` e `TRUNCATE` em `catalogo_fontes` —
sobra do `GRANT ALL` padrão do Supabase, porque o arquivo anterior revogou **por nome** em
vez de revogar tudo e devolver o `SELECT`. Não era urgente (o `TRUNCATE` não tem verbo HTTP,
então o PostgREST não o alcança), mas `TRUNCATE` **ignora RLS**, e não há motivo para uma
chave que está no código-fonte de toda página continuar com ele. A regra que fica: revogar
tudo e devolver o que se usa — lista por nome envelhece em silêncio.

**E o ícone do aplicativo da portaria.** Os ícones publicados na v608 tinham sido gerados a
partir da marca anterior. Com o logo novo — que veio como imagem de catálogo, com fundo
branco e sombra em volta — o gerador ganhou um recorte por preenchimento a partir dos
quatro cantos, e não por "todo pixel claro vira transparente": o próprio ícone tem uma
etiqueta branca no meio do desenho, que um teste por cor apagaria por dentro. A arte final
foi entregue já com transparência, que é o caminho mais confiável dos dois.

---

## [v608] — Fora do Render: proxy e fontes. E a portaria vira aplicativo

### O proxy de arquivos e o catálogo de fontes saem do Render

Os últimos consumidores vivos do Render no caminho do navegador. Metade das rotas que
faltavam já era **código morto em produção** — `mapas.js`, `/api/ordens`, `/api/os_itens` e
`/api/numeracoes` são todos ramos `else` de um `if (supabaseClient)`, e o caminho de verdade
fala direto com o banco há tempos.

Sobraram três coisas, e as três seguem o mesmo critério: **página servida pela estação → o
agente local, sempre; página servida pela nuvem → Edge Function**.

**`/api/proxy` virou a função `arquivo`.** Porte fiel, allowlist inclusive. Ele só é chamado
como *segunda* tentativa — o `fetch` direto resolve quase tudo, porque o Storage responde
`Access-Control-Allow-Origin: *`. O que ainda o justifica são três registros de
`producao_numeracoes` cujo `pdf_content` aponta para o bucket antigo do Firebase. A allowlist
é por **sufixo de host**, com teste próprio: um `includes("supabase.co")` deixaria
`https://supabase.co.exemplo.com` passar, e esse domínio qualquer um registra. Proxy sem
allowlist é SSRF — no agente, alcança a rede interna da gráfica.

**O catálogo de fontes:** a leitura na nuvem passou a sair da tabela, direto — o Render fazia
exatamente aquela consulta e devolvia o mesmo JSON, uma travessia por nada. Ler
`catalogo_fontes` com a chave pública continua permitido de propósito: é a única tabela ainda
aberta à leitura, porque `cliente.html` não tem login e precisa das fontes para desenhar a
arte que o cliente vai aprovar. A **escrita** vai para a função `painel`, que exige sessão.

Na estação nada disso muda: catálogo do disco, proxy do cache local.

### A portaria vira aplicativo

A tela do porteiro já abria sem rede e já guardava o evento inteiro no celular. O que
faltava era ela ser um **aplicativo**: com ícone na tela de início, sem barra de navegador,
e com os recursos que só fazem sentido com o aparelho na mão, no portão.

**Instalável.** Um *web app manifest* (`frontend/portaria.webmanifest`, hoje [`frontend/app.webmanifest`](frontend/app.webmanifest))
com nome, cores e ícones próprios — cinco PNGs gerados por
[ferramentas/gerar_icones_pwa.py](ferramentas/gerar_icones_pwa.py), incluindo os *maskable*
que o Android exige para não desenhar a marca dentro de um quadrado branco. No Chrome do
Android o menu passa a oferecer **"Instalar aplicativo"**. No iPhone, que ignora o
manifesto, as metas `apple-*` dão o mesmo resultado pelo "Adicionar à Tela de Início" — e
instalado o iOS **para de apagar** o armazenamento do site depois de 7 dias sem uso, onde
moram a carga do evento e a fila de leituras que ainda não subiram.

O escopo é só `/portaria.html`, o mesmo do service worker: escopo largo faria o aplicativo
do porteiro abrir a tela da gráfica.

**A tela não apaga durante a leitura.** Ler QR não conta como uso para o sistema, então o
celular apagava a tela em 30 segundos com o aparelho na mão e a fila andando — cada apagada
custava um desbloqueio. A trava vale nas telas de trabalho e é repedida ao voltar do segundo
plano, porque o sistema a solta sozinha ao minimizar.

**Lanterna**, onde o aparelho tem (Chrome no Android; o iPhone não a expõe a página
nenhuma). Ingresso escuro em portão sem luz é onde a leitura falha. O botão só aparece onde
funciona — botão morto no escuro faz o porteiro concluir que o aparelho travou.

**Aviso de versão nova.** Instalado não há barra de endereço: sem isso, um aparelho ficaria
na versão do dia da instalação até alguém desinstalar. A faixa avisa e **espera o toque** —
recarregar sozinho no meio de uma leitura, com a fila na frente, não é opção.

**Duas correções que só apareceriam depois de instalado:**

- O `start_url` do ícone não leva `?e=<evento>` — não pode levar, senão o ícone prenderia o
  aparelho no primeiro evento para sempre. Quem instalasse **antes** de parear abriria o
  aplicativo e o pareamento mandaria evento vazio. O evento passa a ser lembrado.
- O service worker casava os arquivos **ignorando a versão** na URL, então um pedido de
  `portaria.js?v=608` era servido com o `?v=607` guardado: HTML novo rodando código antigo,
  isto é, a regra de validação publicada hoje não seria a regra que decide na porta. Agora
  o casamento é exato. Abrir sem rede continua garantido — sem rede a navegação cai no HTML
  do cache, que pede exatamente os `?v=` daquela mesma geração.

Além disso, o teste de "nunca cachear a API" passou a ser por **origem**: ele era por
caminho (`/api/`), de quando a API ficava no mesmo domínio, e desde a migração para as Edge
Functions do Supabase não casava mais com nada.

---

## [v561] — Controle de acesso, parte 2: o código chega à nuvem

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

**As três variáveis do Render** — `SUPABASE_SERVICE_KEY`, `ACESSO_AGENTE_SEGREDO` e
`QR_PEDIDO_SEGREDO` — foram configuradas em 14/08 e conferidas por fora: o
`GET /api/acesso/saude` responde `"ok": true` com as três presentes e `"banco": "ok"`, e as
oito rotas novas devolvem **401** a quem chega sem credencial.

Duas armadilhas do caminho, registradas porque vão se repetir: há **dois serviços no
Render** nesta conta, e as variáveis foram parar no errado da primeira vez — o sintoma foi
`404` no `/saude`, e não 503, porque sem a chave o `app.py` nem monta o router. E copiar a
`SUPABASE_SERVICE_KEY` com o mouse já produziu um `401 Invalid API key` com uma chave que
parecia perfeita. O `.\ferramentas\copiar_para_render.ps1` existe para as duas: confere o
formato do JWT e copia sem mostrar o valor na tela.

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

## [v510 — 2026-08-10] — O site parava de rebaixar 1,6 MB a cada carregamento

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

## [v509 — 2026-08-10] — Excluir a arte no modo PDF: a pergunta que sumia e o desenho que ficava

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
