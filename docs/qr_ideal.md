# QR Ideal — o código que vai ao papel

O `QR` que existe na numeração desde sempre codifica `prefixo + número + sufixo`,
quer dizer, o número sequencial do ingresso. Ele é **adivinhável**: quem recebe o
ingresso 1234 sabe que existe o 1235 e imprime. Serve para consulta; não serve
para portão.

O **QR Ideal** é o elemento novo. Ele carrega um código de 8 caracteres tirado de
uma lista de 3 milhões que só existe nas estações da gráfica. Não há nada para
digitar: o código vem do pedido, do modelo e do número do ingresso.

Este documento cobre o código **no papel**. O caminho dele até a portaria — como o
agente publica a faixa na nuvem, como o cliente cadastra o evento, o que o banco
guarda — está em [docs/controle_acesso.md](controle_acesso.md).

> **Antes de qualquer coisa, um aviso operacional que vale mais que o resto desta
> página:** desde 15/08/2026 o QR Ideal **só sai se o painel for aberto por
> `http://localhost:9000`**. A seção [Onde imprimir](#onde-imprimir) explica por
> quê. Pela página publicada na Vercel, o navegador não deixa mais o painel falar
> com a estação, e o trabalho vai para a nuvem — onde o pool não existe.

## As duas chaves e o item

Pedido e modelo escolhem a **coluna** do pool; o número do ingresso escolhe a
**linha**.

| No papel | Campo no banco | Exemplo |
|---|---|---|
| Pedido | `pedidos_modelos.id_int` | 20272 |
| Modelo | `pedidos_modelos.id` | 1000022 |
| Ingresso | número sequencial do item | 7 |

Um modelo é um setor do evento. Cuidado: o campo `setor` de `pedidos_modelos`
**já está ocupado** com o setor de *produção* (FLEXO, TÊXTIL, PVC, LASER). O setor
do evento é o `nome_modelo` — "VIP", "Pista".

## A regra

```
d      = (últimos2(pedido) − últimos2(modelo)) mod 100
coluna = 100 se d == 0, senão d
idx    = ((coluna − 1) × 30.000 + (ingresso − 1)) mod 3.000.000
código = pool[idx]
```

O `mod 100` não é enfeite. A subtração crua vai de −99 a 99: **metade das
combinações daria zero ou negativo**, sem coluna nenhuma, e a coluna 100 seria
inalcançável porque a diferença máxima é 99.

O `mod 3.000.000` é a fita contínua: o ingresso 30.001 cai naturalmente na linha 1
da coluna seguinte, sem caso especial.

Exemplo conferido contra o pool de verdade em 15/08/2026 — pedido 20272, modelo
1000022, ingresso 7:

```
GET /api/qr-ideal?pedido=20272&modelo=1000022&item=7
→ {"codigo":"HM4IKCBY","conteudo":"27202HM4IKCBY","coluna":50,"linha":7}
```

A regra vive em `qr_ideal.py` e, de novo, em `frontend/qr-ideal-colunas.js`. As
duas cópias existem porque o motor só enxerga os modelos de uma folha e o painel
é o único que conhece o pedido inteiro. **Mexeu numa, mexe na outra.**

## O que fica gravado no QR

```
27202HM4IKCBY
│    └──────── código do pool, sempre 8 caracteres
└───────────── 20272 escrito de trás para frente
```

Sem separador e sem dígito verificador. Na leitura, **os últimos 8 caracteres são
o código** e o resto, invertido, é o pedido — o tamanho fixo do código torna a
separação não-ambígua.

**O prefixo é string do começo ao fim.** O pedido 20270 vira `07202`. Tratado como
número viraria 7202, que invertido é `2027` — outro pedido. Nunca converter para
inteiro, nem para guardar, nem para exibir.

## O pool

`qr_ideal_pool.bin`: 3.000.000 × 8 = **24.000.000 bytes exatos**, sem separador,
gravados **coluna a coluna**. Ler o código de um ingresso é `seek(idx × 8)` e
`read(8)`.

Ele mora **ao lado do `NewProd.exe`**, não dentro. O agente é compilado `onefile`,
e dado embutido é extraído para pasta temporária a cada abertura — a estação
pagaria 24 MB de extração toda vez que liga. Na estação de hoje isso é

```
C:\Users\<usuário>\AppData\Local\NewProd Agent\qr_ideal_pool.bin
```

e o `qr_ideal.caminho_padrao()` resolve o mesmo caminho por `sys.executable`
quando congelado, ou pela raiz do repositório em desenvolvimento.

Para regenerar a partir da planilha:

```
python -m ferramentas.converter_pool "Ideal Control/Ideal Control.xlsx" qr_ideal_pool.bin
```

O conversor recusa gravar se qualquer invariante quebrar: código fora dos 8
caracteres, código repetido, célula fora da grade, ou total diferente de 3
milhões. Ele usa só a biblioteca padrão — `openpyxl` e `pandas` não estão no
`requirements.txt` e não precisam estar.

**O pool nunca entra no git.** `Ideal Control/`, `*.xlsx` e `*.bin` estão no
`.gitignore`, e o `publicar.ps1` commita com `git add -A`. Ele chega às estações
pelo instalador (`agent_installer.wxs` o declara como arquivo do pacote), e **duas
etapas do build param** se ele faltar ou se o tamanho não for exatamente
24.000.000 bytes: o `build_agent.ps1`, que o copia para `dist\`, e o
`compilar_msi.ps1`, que confere de novo antes de gerar o MSI.

<a name="onde-imprimir"></a>
## Onde imprimir

**Abra o painel por `http://localhost:9000`.** Não é preferência: desde 15/08/2026
é o único caminho que funciona.

O **Chrome 151** passou a recusar que uma página `https://` da internet converse
com um servidor da própria máquina:

```
Access to fetch at 'http://127.0.0.1:9000/api/status'
from origin 'https://ideal-imposition.vercel.app' has been blocked by CORS policy:
Permission was denied for this request to access the `loopback` address space
```

O cabeçalho `Access-Control-Allow-Private-Network`, que o agente já envia,
**deixou de bastar**. Conferido em 15/08: o agente responde certo ao preflight e ao
GET por `curl`; quem recusa é o navegador, antes de a requisição sair.

Da página da Vercel, então, a estação é **inalcançável**, e o trabalho vai para a
nuvem. Na nuvem não existe o pool — e nunca vai existir, porque ele é o segredo
mestre do controle de acesso —, então o QR Ideal falha com

> QR Ideal: o trabalho nao pode ser impresso porque falta a lista de codigos
> (qr_ideal_pool.bin) desta estacao.

lida **na frente de uma estação que tem a lista**. Foi essa frase que fez a
investigação do pedido 20508 durar dois dias.

A saída **não pode ser** conceder a permissão no navegador, site a site: cada
estação da gráfica usa um navegador diferente, e um clique por site, por navegador
e por perfil volta a quebrar na primeira máquina nova. Pelo `localhost:9000` a
página e o agente têm a mesma origem, e não há permissão envolvida — funciona em
qualquer navegador.

**Há uma segunda proteção, permanente, que se soma a esta.** O mesmo `app.py`
serve o motor da nuvem e o agente da estação, então até a v579 os dois respondiam
palavra por palavra a mesma coisa em `/api/status` — e a sondagem do painel, que
testa primeiro o endereço da própria página, tomava o Render pela estação e
impunha na nuvem exibindo o selo "⚡ AGENTE LOCAL". Foi essa confusão, e não uma
regressão em numeração exclusiva, que fez a investigação do pedido 20508 durar
dois dias. Desde a v579 o `/api/status` declara `"onde": "local"` ou
`"onde": "nuvem"`, e o painel **recusa** como estação qualquer resposta que se
declare nuvem (`tests/test_onde_estou_rodando.py`). A recusa é por
`onde !== 'nuvem'`, e não por `onde === 'local'`, para que agente antigo continue
sendo aceito enquanto as estações não atualizam.

**O painel servido pelo agente não é uma versão reduzida.** A função `api()` do
`script.js` desvia `/formatos`, `/numeracoes`, `/saidas`, `/cores` e
`/modelos_imposicao` direto para o Supabase, então o catálogo é o mesmo da nuvem.
Medido no Chrome desta estação em 15/08: 61 numerações, agente encontrado,
imposição indo para `http://localhost:9000`, zero bloqueios. O
`formats_db.json` local do agente é um espelho que o painel não lê.

Quando a estação não é encontrada, o painel **avisa** — tarja vermelha durante a
geração e o mesmo motivo dentro da mensagem de erro, dizendo o endereço a abrir.
A guarda é `tests/test_estacao_bloqueada_pelo_navegador.py`, que reprova qualquer
tela que mostre o selo "NUVEM" sem explicar por quê.

## A prévia na tela

O painel pede o código ao agente local:

```
GET /api/qr-ideal?pedido=20272&modelo=1000022&item=7
→ {"codigo":"HM4IKCBY","conteudo":"27202HM4IKCBY","coluna":50,"linha":7}
```

Devolve **um código por vez, nunca a lista**: quem tem a lista inteira consegue
emitir ingresso para qualquer evento, e ela não sai da estação.

Fora da estação o endpoint responde 503 e a tela desenha um QR de exemplo. O
aviso de que aquilo é exemplo fica no **painel de propriedades**, em texto — não
sobre o desenho. O desenho sai igual ao que vai ao papel, na cor escolhida no
elemento (preto 100% por padrão) e sem transparência, justamente para o operador
poder conferir tamanho, posição e cor de verdade.

No **editor de numeração** o exemplo é a resposta certa sempre — a numeração é um
modelo reutilizável e ali não existe pedido. O código real aparece no **card do
pedido**, que sabe de que pedido o trabalho veio.

### A logo do centro é marca de tela

`desenharQRIdeal` põe a logo do app numa placa branca no meio do QR, ocupando 30%
do lado. Ela **nunca é impressa**, e isso não é preferência estética: o QR sai com
correção de erro baixa, então uma logo no papel apagaria módulos de verdade e o
leitor recusaria o ingresso — na portaria, com o lote já entregue.

A separação se sustenta em dois pontos:

- o `engine.py`, que é quem imprime, não sabe que a logo existe;
- `criarCanvasNumeracaoRasterizada` — o único canvas do frontend que vira PDF de
  produção, pelo `exportarPdfGabarito` — chama `desenharQRIdeal(..., { logo: false })`.

`tests/test_qr_ideal_logo_de_tela.py` cobra os dois. Nas demais janelas (editor,
prévia de imposição, card do pedido, janela de amostra) a logo aparece, e ali ela
ainda ajuda: o card que o cliente recebe leva o QR com a marca por cima, o que
impede extrair um código legível da imagem de aprovação.

## As travas antes do papel

As três primeiras recusam o trabalho **antes** de imprimir; a quarta é uma
garantia de conteúdo. A regra por trás de todas é a mesma: ingresso errado não
parece defeituoso — ele é entregue, e só falha na portaria, quando não há mais o
que fazer.

1. **Colunas repetidas.** Dois modelos do mesmo pedido cujos `id` terminam nos
   mesmos dois dígitos (diferem em 100, 200, 300…) caem na mesma coluna, e
   sairiam QRs **idênticos no mesmo evento** — o único choque que o número do
   pedido no QR não separa. O motor recusa a folha (`multi_artes`), e o painel
   avisa sobre o pedido inteiro ao carregar os modelos — o motor só enxerga uma
   folha por vez, então dois modelos impressos em trabalhos separados dependem
   desse aviso.
2. **Pedido, modelo ou pool ausentes.** `engine._conferir_dados_do_qr_ideal` diz
   qual dos três falta, em vez de falhar no meio da montagem das páginas com uma
   mensagem que manda procurar no lugar errado.
3. **Numeração pedida e ausente.** O `/api/impose` recusa o trabalho que traz
   `numeracao_id` preenchido e o objeto da numeração **nulo**. Antes ele
   desenhava só a arte e não dizia nada: na noite de 14 para 15/08/2026 o pedido
   20508 saiu da impressora três vezes sem número e sem QR, com a prévia
   mostrando os dois — 62 ingressos perdidos. O log passou a registrar
   `[impose] numeracao_id=… objeto=… elements=N`, para a próxima investigação
   começar com um dado na mão em vez de com a ausência de uma linha.
   (`tests/test_numeracao_pedida_e_ausente.py`)

   **O que esta recusa NÃO cobre, por decisão de 03/09/2026:** a numeração que
   chega com a lista de elementos **vazia**. A guarda tinha sido alargada para
   isso e travou o pedido 21411, que estava certo — numeração escolhida no
   seletor sem nenhum elemento é caso comum, porque nem todo trabalho leva
   número ou QR, e nesse caso a folha sair só com a arte é o resultado correto.
   Pior, a mensagem mandava o operador escolher a numeração que já estava
   escolhida: trava sem saída. Hoje esse caso **segue**, e a contagem de
   elementos só produz um aviso no log.
   (`tests/test_numeracao_sem_elementos.py`)
4. **Reimpressão parcial.** Refazer a célula 7 imprime o código do **item 7**,
   mesmo que ele caia na primeira pose da folha compactada. O código segue o
   número do item, nunca a posição na folha.

## Dois riscos conhecidos e aceitos

**Códigos compartilhados entre eventos.** Com pool fixo e fórmula, dois pedidos
cuja diferença bate recebem os mesmos códigos. O número do pedido no QR separa os
dois na leitura, então o portão não confunde. O que fica em aberto é que alguém de
posse da lista de um evento conheceria códigos de outro — e a mitigação é a
decisão de **não distribuir a lista**: o pool fica na estação, e o aplicativo da
portaria baixa apenas a faixa do evento dele.

**O pedido invertido não é assinatura.** Ele vem de dado público e é sempre a
mesma conta; o que ele faz é amarrar o código ao pedido. A força contra
falsificação está no código de 8 caracteres: 2,82 trilhões de combinações, das
quais um evento de 750 ingressos ocupa 750 — chutar uma válida é 1 em 3,7 bilhões.
Isso vale **enquanto a lista não circular**.

Decisão do usuário, tomada com os números na mesa. Registrado para não voltar à
pauta.

## Quantas numerações usam isso hoje

Conferido no catálogo em 15/08/2026, com a mesma função que o agente usa para
decidir o que publicar (`acesso_publicacao.numeracao_do_modelo`):

| | |
|---|---|
| Numerações no catálogo | **61** |
| Com elemento `QR_IDEAL` | **2** |
| Com elemento `QR` | 32 |
| Com elemento `BARCODE` | 3 |
| **Que a portaria consegue ler** | **31** |

O QR Ideal é minoria, e sempre foi previsto que fosse: o controle de acesso
funciona com qualquer ingresso que tenha QR ou código de barras, lendo o dado do
próprio elemento de numeração. A diferença é a força da proteção, e ela está
explicada em [controle_acesso.md](controle_acesso.md#nem-todo-ingresso-tem-qr-ideal).

A conta das 31: das 61, **33** têm QR, QR Ideal ou código de barras (as três com
barras também têm QR, e uma das duas com QR Ideal também). Dessas 33, **duas**
— as exclusivas `1000153` e `1000154` — têm o QR alimentado por coluna do CSV
(`Link`), e ali o conteúdo vem da linha, não do número do item: publicar a conta
sequencial gravaria um hash que **não corresponde ao que foi impresso**. Ficam
31.

## Publicação

Mexer no `engine.py`, no `app.py` ou no `frontend/` obriga a publicar o agente na
mesma leva do site, com número de versão **novo** — republicar um número existente
é ignorado em silêncio pelas estações.

```powershell
.\publicar.ps1 "mensagem"
.\publicar_agente.ps1 1.2.NN
```

O `publicar.ps1` acrescenta o `(vNNN)` à mensagem e cria a tag sozinho — escrever
o número na mensagem duplica o sufixo no commit.

Vale para o frontend também, e não só para o Python: o executável embute uma cópia
do painel, que semeia a pasta `painel/` servida em `localhost:9000` (o agente a
atualiza da nuvem a cada 30 minutos) e é o que uma instalação nova recebe de cara.

E as estações precisam receber o `qr_ideal_pool.bin` pelo instalador antes de
qualquer trabalho com QR Ideal.
