# QR Ideal — o ingresso que a portaria sabe ler

O `QR` que existe na numeração desde sempre codifica `prefixo + número + sufixo`,
quer dizer, o número sequencial do ingresso. Ele é **adivinhável**: quem recebe o
ingresso 1234 sabe que existe o 1235 e imprime. Serve para consulta; não serve
para portão.

O **QR Ideal** é o elemento novo. Ele carrega um código de 8 caracteres tirado de
uma lista de 3 milhões que só existe nas estações da gráfica. Não há nada para
digitar: o código vem do pedido, do modelo e do número do ingresso.

Esta é a parte 1 de três. O *QR do Pedido* (que o cliente lê para cadastrar o
evento) e o *Ideal Control* (a portaria) têm specs próprias.

## As duas chaves

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

Exemplo conferido contra a planilha: pedido 20272, modelo 1000022, ingresso 7 →
coluna 50, índice 1.470.006 → **`HM4IKCBY`**.

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
pagaria 24 MB de extração toda vez que liga.

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
pelo instalador, e o `build_agent.ps1` **para** se não encontrar o arquivo ou se
o tamanho não for exatamente 24.000.000 bytes.

## A prévia na tela

O painel do editor é servido pelo próprio agente na estação, então a prévia pede
o código ao agente local:

```
GET /api/qr-ideal?pedido=20272&modelo=1000022&item=7
→ {"codigo":"HM4IKCBY","conteudo":"27202HM4IKCBY","coluna":50,"linha":7}
```

Fora da estação o endpoint responde 503 e a tela desenha um QR de exemplo **que
se anuncia como exemplo**. Um QR falso mudo seria pior que nenhum: o operador
acharia que conferiu.

No **editor de numeração** o exemplo é a resposta certa sempre — a numeração é um
modelo reutilizável e ali não existe pedido. O código real aparece no **card do
pedido**, que sabe de que pedido o trabalho veio.

## As três travas

1. **Colunas repetidas.** Dois modelos do mesmo pedido cujos `id` diferem em
   exatamente 100 caem na mesma coluna, e sairiam QRs **idênticos no mesmo
   evento** — o único choque que o número do pedido no QR não separa. O motor
   recusa a folha (`multi_artes`); o painel avisa sobre o pedido inteiro.
2. **Pedido ou modelo ausentes.** O trabalho falha com mensagem. Nunca imprimir
   QR em branco nem calculado com valor suposto: papel errado só se descobre na
   portaria.
3. **Reimpressão parcial.** Refazer a célula 7 imprime o código do **item 7**,
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

## Publicação

Mexer no `engine.py`, no `app.py` ou no `frontend/` obriga a publicar o agente na
mesma leva do site, com número de versão **novo** — republicar um número existente
é ignorado em silêncio pelas estações. E as estações precisam receber o
`qr_ideal_pool.bin` pelo instalador antes de qualquer trabalho com QR Ideal.
