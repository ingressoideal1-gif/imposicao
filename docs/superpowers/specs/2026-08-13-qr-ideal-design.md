# QR Ideal — o ingresso que a portaria sabe ler

Data: 13/08/2026

## O problema

Os ingressos que a gráfica imprime hoje não servem para controlar entrada. Existe um
elemento `QR` na numeração desde sempre ([engine.py:1133](../../../engine.py#L1133)), mas
ele codifica `prefixo + número + sufixo` — quer dizer, o número sequencial do ingresso,
eventualmente com uma URL na frente. É **adivinhável**: quem recebe o ingresso 1234 sabe
que existe o 1235, e imprime. Serve para consulta e para conferência; não serve para
portão.

Falta o outro lado também. O cliente que compra 5.000 ingressos não tem como saber quem
entrou, quantos entraram, se alguém entrou duas vezes com o mesmo papel, ou quantas
pessoas estão no camarote agora.

Esta spec constrói o primeiro dos três pedaços: o ingresso sai da impressora com um código
que ninguém consegue adivinhar e que a portaria sabe conferir.

## O que já existe

**O pool de códigos.** `Ideal Control/Ideal Control.xlsx`, 28,5 MB. Auditado célula a
célula em 13/08/2026: **30.000 linhas × 100 colunas = 3.000.000 de códigos**, todos com
exatamente 8 caracteres do alfabeto `A–Z0–9`, e **zero repetidos**. O arquivo está limpo e
serve como está.

> A planilha tem 30.000 linhas, não 10.000. A diferença importa para o limite de tiragem.

**O Ideal Control.** Já é um PWA em produção (`ideal-IdealControl/`): service worker,
leitor `html5-qrcode`, importação de CSV por pipe, realtime. Vive hoje num Supabase próprio
(`sodeliyjjoxpyvnssyzw`) que **não tem nada ativo** — confirmado pelo usuário em 13/08/2026,
então migrar para o banco único não perde dado nenhum.

**As duas chaves do pedido.** Confirmadas contra o banco de produção:

| No vocabulário do usuário | Campo real | Faixa observada |
|---|---|---|
| Pedido 20272 | `pedidos_modelos.id_int` | 20495 … 20596 (5 dígitos) |
| Modelo 1000022 | `pedidos_modelos.id` | 1000274 … 1000287 (7 dígitos) |
| Ingresso 7 | posição do item na tiragem | 1 … `quantidade` |

O `1000287.pdf` citado no CHANGELOG é o modelo 1000287 — o número de 7 dígitos já nomeia
os arquivos de trabalho real.

**Um modelo é um setor do evento.** Cuidado: o campo `setor` de `pedidos_modelos` **já está
ocupado** e guarda o setor de *produção* (FLEXO, TÊXTIL, PVC, LASER). O setor do evento sai
de `nome_modelo`, que é onde hoje se escreve "VIP", "Pista".

## Decisões tomadas

Todas do usuário, em 13/08/2026:

- **A coluna vem da fórmula**, não de uma reserva registrada. Colisão entre eventos é
  aceita e tratada pelo prefixo do pedido.
- **O pool é fixo e reutilizado** entre eventos. O mesmo código reaparece em eventos
  diferentes por desenho.
- **O pool inteiro fica no agente**, offline, nunca na nuvem e nunca no celular.
- **O QR do ingresso carrega o número do pedido de trás para frente + o código**, sem
  separador e sem dígito verificador.
- **Tiragem acima de 30.000 avança para a coluna seguinte.**
- **O aplicativo baixa da nuvem só a faixa do evento dele**, ao ler o QR do Pedido — para
  não revelar a lista mestra.
- **Um pedido é um evento.**
- **O Ideal Control é evoluído**, não reescrito, e passa a usar o banco único do Imposition.

## Escopo desta spec

Só a **parte 1: o QR Ideal no papel**. Ela termina quando um ingresso real sai da
impressora com o código certo, conferível.

Fica de fora, cada uma com a sua spec:

| Parte | Entrega |
|---|---|
| 2 — QR do Pedido | geração assinada, botão "Gerar QR do evento" no painel do pedido, publicação da faixa do evento |
| 3 — Ideal Control | cadastro por leitura, login de cliente, offline real, reentrada, setor, lotação, relatórios |

**Esta parte não cria nem altera nenhuma tabela.** Tudo de que ela precisa —
`id_int`, `id`, `quantidade` — já existe em `pedidos_modelos`. O DDL das tabelas
`producao_acesso_*` entra na spec da parte 2, para aprovação formal, como exige
[REGRAS_BANCO.md](../../REGRAS_BANCO.md).

## A regra do código

```
ult2(n)  = os dois últimos dígitos de n, como inteiro
d        = (ult2(pedido) − ult2(modelo)) mod 100
coluna   = 100 se d == 0, senão d
idx      = ((coluna − 1) × 30.000 + (item − 1)) mod 3.000.000
código   = pool[idx]
```

O `mod 100` é o que tapa as bordas da subtração crua. Sem ele, `pedido − modelo` vai de
−99 a 99: **50,5% de todas as combinações dariam zero ou negativo** — sem coluna — e a
coluna 100 seria inalcançável, porque a diferença máxima é 99. Com ele, toda combinação
cai numa coluna válida e as 100 colunas são usadas.

O `idx` como fita contínua é a regra de tiragem grande: o ingresso 30.001 cai naturalmente
na linha 1 da coluna seguinte, sem caso especial no código.

**Conferência contra a planilha real:** pedido 20272, modelo 1000022, item 7 →
`ult2 = 72`, `ult2 = 22`, `d = 50`, coluna 50, `idx = 49 × 30.000 + 6 = 1.470.006` →
**`HM4IKCBY`**. É exatamente a célula que o usuário indicou e que foi lida do arquivo.

## O que fica no papel

```
27202HM4IKCBY
│    └──────── código do pool, sempre 8 caracteres
└───────────── 20272 escrito de trás para frente
```

Sem separador, sem verificador. Na leitura, **os últimos 8 caracteres são o código** e o
resto, invertido, é o pedido — o comprimento fixo do código torna a separação
não-ambígua, qualquer que seja o número de dígitos do pedido.

**Regra de implementação, sem exceção: o prefixo é string do começo ao fim.** O pedido
20270 vira `07202`, com zero à esquerda. Qualquer trecho que trate esse pedaço como
inteiro transforma `07202` em `7202`, que invertido vira `2027` — outro pedido. Nunca
converter para número; nunca reconverter para exibir.

## O pool binário

A planilha vira `qr_ideal_pool.bin`: **3.000.000 × 8 = 24.000.000 bytes exatos**, sem
separador, gravados **coluna a coluna** — as 30.000 linhas da coluna 1, depois as da
coluna 2, e assim por diante. É o que faz `idx` da fórmula acima ser a posição direta.

Ler o código de um ingresso é `seek(idx × 8)` e `read(8)`. Microssegundos, sem carregar
nada na memória, sem rede, sem parser.

**Onde ele mora: ao lado do `NewProd.exe`, não dentro dele.** O agente é compilado
`onefile` ([agent_tray.spec:109](../../../agent_tray.spec#L109)), e dado embutido é
extraído para uma pasta temporária **a cada abertura**. Embutir 24 MB faria a estação
pagar essa extração toda vez que liga. Ao lado do executável, o arquivo é lido no lugar,
e trocar o pool não exige republicar o agente.

Resolução do caminho: `os.path.dirname(sys.executable)` quando `sys.frozen`, e a raiz do
projeto caso contrário.

**O conversor** (`ferramentas/converter_pool.py`) lê o `.xlsx` com `zipfile` +
`ElementTree` da biblioteca padrão — sem `openpyxl`, sem `pandas`, que não estão no
`requirements.txt` e não precisam estar. Ele roda uma vez, valida o que produziu (3.000.000
registros, 8 bytes cada, e uma conferência dirigida de células conhecidas como a coluna 50
linha 7) e recusa gravar se qualquer invariante falhar.

**O pool nunca entra no git.** `Ideal Control/` e `*.xlsx` já foram adicionados ao
[.gitignore](../../../.gitignore) em 13/08/2026 — o [publicar.ps1:173](../../../publicar.ps1#L173)
commita com `git add -A`, e sem essa linha o segredo mestre iria para o GitHub na primeira
publicação. Como consequência, o `build_agent.ps1` precisa buscar o `.bin` num caminho
combinado fora do repositório, e **falhar com mensagem clara** se não achar — um agente
publicado sem pool imprime ingresso sem código.

## O elemento no editor

Tipo novo `QR_IDEAL`, rótulo **"QR Ideal"**. O `QR` atual fica intacto: quem usa QR de
consulta continua usando.

| Propriedade | Valor |
|---|---|
| Tamanho | mm, padrão 15 |
| Cor | padrão `#000000` |
| Finalidade | sempre impressão |

Não tem prefixo, sufixo, zeros à esquerda nem origem de dado: o conteúdo é calculado a
partir de (pedido, modelo, item), e nenhuma dessas três coisas se digita no editor.

**O `ImpositionConfig` ganha `pedido` e `modelo`**, que hoje não existem nele
([engine.py:358](../../../engine.py#L358)). Eles chegam pelo payload do
[`/api/impose`](../../../app.py#L623) e são repassados na construção
([app.py:875](../../../app.py#L875)), como todos os outros parâmetros. O frontend os
preenche a partir de `pedidos_modelos.id_int` e `pedidos_modelos.id`.

**Em `multi_artes`, o modelo é por arte.** Uma folha que mistura modelos mistura setores, e
portanto mistura colunas. Cada entrada de `multi_artes` carrega o seu próprio `modelo`, e o
motor usa o do item que está desenhando — não o do trabalho.

### A armadilha das ramificações

O `el.type === 'QR'` aparece em onze lugares do
[frontend/script.js](../../../frontend/script.js): 3711, 3794, 4491, 5306, 5509, 5710,
8096, 15302, 24211, 24976 e 29947. Cada um precisa ganhar o irmão `QR_IDEAL`.

Isso não é zelo excessivo: já aconteceu neste projeto. Os tipos `SVG` e `PDF` foram
adicionados sem um ramo numa dessas funções de desenho e **pintavam zero pixel na tela**
enquanto saíam corretos no papel (CHANGELOG, "Essa função tratava `TEXT`/`FIXED`… e **não
tinha ramo algum para `SVG` nem para `PDF`**"). O elemento existia, o dado existia, e a
tela mentia. A varredura dos onze pontos é item de checklist da implementação.

## A prévia

O painel do editor é servido pelo próprio agente na estação, então a prévia pede o código
ao agente local:

```
GET /api/qr-ideal?pedido=20272&modelo=1000022&item=7
→ { "codigo": "HM4IKCBY", "conteudo": "27202HM4IKCBY", "coluna": 50, "linha": 7 }
```

Offline, instantâneo, e o navegador nunca recebe o pool.

Fora da estação — no painel aberto pela Vercel, onde não há pool — o endpoint não existe. A
prévia então desenha **um QR de exemplo e diz na tela que é exemplo**. Um QR falso mudo é
pior que nenhum: o operador acharia que conferiu.

## As travas

**1. Colunas distintas dentro do mesmo pedido.** Dois modelos do mesmo pedido cujos `id`
diferem em exatamente 100 caem na mesma coluna, e aí saem **QRs idênticos no mesmo
evento** — o único choque que o prefixo do pedido não separa. Testado contra os 108
modelos reais do banco: zero ocorrências hoje.

A conferência acontece em dois lugares, porque nenhum dos dois vê o quadro inteiro
sozinho:

- **No motor**, quando o trabalho tem `multi_artes`: as colunas das artes da mesma folha
  têm de ser distintas, e o trabalho **falha com mensagem** se não forem. É o único
  momento em que o motor conhece mais de um modelo.
- **No painel do pedido**, ao montar a lista de modelos: o frontend calcula a coluna de
  todos os modelos do pedido e **avisa na tela** se dois coincidirem, antes de qualquer
  impressão. É o único lugar que conhece o pedido inteiro.

**2. Pedido ou modelo ausentes.** Sem eles não há código. O elemento **não imprime nada e
o trabalho falha com mensagem**. Nunca imprimir QR em branco, e nunca imprimir um QR
calculado com valor suposto: papel errado só se descobre na portaria, quando já não dá
para consertar.

**3. Reimpressão parcial usa o número original do item.** Ao refazer a célula 7, o
ingresso reimpresso carrega o código do **item 7**, mesmo que ele caia na primeira posição
da folha compactada. O QR segue o valor sequencial, nunca a posição na folha — a mesma
regra que a numeração já obedece.

## Riscos conhecidos e aceitos

**Códigos compartilhados entre eventos.** Com pool fixo e fórmula, dois pedidos cuja
diferença bate caem na mesma coluna e recebem os mesmos códigos. O prefixo do pedido
separa os dois no papel e na leitura, então o portão não confunde. O que fica em aberto é
que alguém de posse da lista de um evento conheceria códigos de outro. A mitigação real é
a decisão de **não distribuir a lista**: o pool fica no agente, e o aplicativo baixa
apenas a faixa do evento dele.

**O pedido invertido não é assinatura.** Ele vem de um dado público e é sempre a mesma
conta. O que ele faz, e faz bem, é amarrar o código ao pedido. A força contra falsificação
está no código de 8 caracteres: **2,82 trilhões** de combinações, das quais um evento de
750 ingressos ocupa 750 — chutar uma válida é 1 em 3,7 bilhões. Isso vale enquanto a lista
não circular, que é exatamente o que a decisão acima protege.

Levantado duas vezes, decidido pelo usuário. Registrado aqui para não voltar à pauta.

## Testes

Em `tests/test_engine_qr_ideal.py`, sem dependência nova:

1. **A fórmula**, incluindo as bordas: diferença negativa, diferença zero (→ coluna 100),
   e o exemplo canônico (20272, 1000022, 7) → coluna 50, linha 7.
2. **A fita contínua**: item 30.001 cai na linha 1 da coluna seguinte; o fim do pool volta
   para a coluna 1.
3. **O conteúdo**: `27202HM4IKCBY`, e o caso do zero à esquerda — pedido 20270 produz
   `07202…` e volta a ser 20270 na leitura.
4. **O pool binário**: `seek` numa posição conhecida devolve o código que a planilha tem
   naquela célula.
5. **O papel**: impor um trabalho com o elemento e extrair a imagem embutida do PDF,
   comparando byte a byte com `_generate_qr(conteúdo_esperado)`
   ([engine.py:275](../../../engine.py#L275)). Prova que o papel carrega a string certa
   sem precisar de decodificador de QR — nenhuma biblioteca nova.
6. **`multi_artes`**: dois modelos na mesma folha produzem códigos de colunas diferentes.
7. **As três travas**: colunas iguais no mesmo pedido recusam; pedido ausente falha;
   reimpressão da célula 7 traz o código do item 7.

## Publicação

Mexer no `engine.py` e no `frontend/script.js` torna a publicação do agente
**obrigatória** na mesma leva do site — o executável embute os dois. Some-se a isso que o
`qr_ideal_pool.bin` precisa chegar às estações pelo instalador. Versão nova do agente,
sempre: republicar um número existente é ignorado em silêncio pelas estações.
