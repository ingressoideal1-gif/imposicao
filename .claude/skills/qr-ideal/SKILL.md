---
name: qr-ideal
description: Leia ANTES de mexer no elemento de numeração "QR Ideal" — o tipo QR_IDEAL no editor ou no engine.py, o módulo qr_ideal.py, o pool qr_ideal_pool.bin, o conversor ferramentas/converter_pool.py, o endpoint /api/qr-ideal, o arquivo frontend/qr-ideal-colunas.js, ou qualquer coisa ligada a controle de acesso e Ideal Control. Cobre as seis armadilhas que fazem a tela mostrar uma coisa e o papel sair outra — ou pior, o ingresso não abrir a porta.
---

# Antes de mexer no QR Ideal

Leia **`docs/qr_ideal.md`** por inteiro, e a spec em
`docs/superpowers/specs/2026-08-13-qr-ideal-design.md`.

O que este elemento tem de diferente de todos os outros: **o erro não aparece na
tela nem na impressão**. Ele aparece na portaria do evento, com a fila na porta,
quando já não há o que consertar. Toda decisão aqui foi tomada com esse custo em
mente — inclusive as que parecem paranoia.

## Seis armadilhas

**1. O prefixo do QR é string, sempre.** O conteúdo é o número do pedido de trás
para frente colado no código: `20272` + `HM4IKCBY` vira `27202HM4IKCBY`. O pedido
20270 vira `07202`, com zero à esquerda. Qualquer trecho que trate esse pedaço
como `int` o transforma em 7202, que invertido é `2027` — outro pedido. Nunca
converter, nem para guardar, nem para exibir.

**2. A regra vive em dois arquivos e eles não podem divergir.** `qr_ideal.py` e
`frontend/qr-ideal-colunas.js` calculam a mesma coluna. Existem separados porque
o motor só enxerga os modelos de **uma folha** e o painel é o único que conhece o
**pedido inteiro**. E o JavaScript erra sozinho se copiado ingenuamente: `(-50 %
100)` dá `-50` em JS e `50` em Python — o `((x % 100) + 100) % 100` está lá por
isso. Mexeu numa cópia, mexe na outra, e rode `tests/QrIdealColunas.Tests.ps1`.

**3. Todo lugar que ramifica por `el.type === 'QR'` precisa do irmão
`QR_IDEAL`.** São onze pontos no `frontend/script.js`, mais dois mapas de rótulo
(`typeLabel` e `typeBadge`, na mesma linha por volta de 5472). Não é zelo: `SVG` e
`PDF` foram acrescentados sem um ramo numa das funções de desenho e **pintavam
zero pixel na tela** enquanto saíam certos no papel — o elemento existia, o dado
existia, e a tela mentia. O `typeLabel` já tinha causado "undefined" no selo do
PDF antes, e causou de novo no QR Ideal.

Confira assim, e exija um `QR_IDEAL` a menos de 20 linhas de cada `'QR'`:

```
rg -n "el\.type === 'QR'" frontend/script.js
```

(O `typeMap` por volta da linha 20268 é falso positivo — ele mapeia *tipos de
numeração* do pedido, PADRÃO/QR/BARRAS/TICKET, não tipos de elemento.)

**4. Reimpressão parcial usa o número do item, nunca a pose da folha.** Refazer a
célula 7 imprime o código do **item 7**, mesmo que ele caia na primeira posição da
folha compactada. No motor isso sai de graça porque o conteúdo é calculado a
partir do `current_val` — o mesmo valor que a numeração imprime. Se algum dia
alguém trocar isso pelo índice da pose, o ingresso reimpresso deixa de validar e
ninguém percebe até o evento.

**5. Falhar alto é a regra, não a exceção.** Sem pedido, sem modelo ou sem pool, o
motor **levanta erro e o trabalho não sai**. Nunca imprimir QR em branco, nunca
calcular com valor suposto, nunca "seguir sem o elemento". A prévia que não sabe o
código desenha um exemplo, e quem avisa que é exemplo é o **painel de
propriedades**, em texto: o desenho sai igual ao que vai ao papel — cor do
elemento, opacidade cheia — para o operador conferir tamanho, posição e cor.

**5b. A logo do centro é marca de tela e não pode ser impressa.** O QR sai com
correção de erro baixa: logo no papel apaga módulos e o leitor recusa o ingresso,
na portaria, com o lote já entregue. O `engine.py` não sabe que ela existe, e
`criarCanvasNumeracaoRasterizada` — o único canvas do frontend que vira PDF de
produção — chama `desenharQRIdeal(..., { logo: false })`. Mexeu no desenho do QR
Ideal, rode `tests/test_qr_ideal_logo_de_tela.py`.

**6. O pool não entra no git, e o agente não sai sem ele.** São 24 MB e é o
segredo mestre do controle de acesso — quem tem o arquivo emite ingresso válido
para qualquer evento. `Ideal Control/`, `*.xlsx` e `*.bin` estão no `.gitignore`,
e o `publicar.ps1` commita com `git add -A`. O `build_agent.ps1` para se não
encontrar o arquivo ou se o tamanho não for exatamente **24.000.000 bytes**, e o
`installer.iss` o instala **ao lado** do `NewProd.exe` — não dentro, porque o
agente é `onefile` e dado embutido é extraído a cada abertura da estação.

## O valor de conferência

Se você mexeu em qualquer coisa do caminho, este número tem que continuar saindo:

```
pedido 20272, modelo 1000022, item 7  →  coluna 50, índice 1.470.006
codigo = HM4IKCBY        conteudo = 27202HM4IKCBY
```

Ele foi lido da planilha original, célula a célula. Se divergir, a ordem de
gravação do pool mudou e **todos os ingressos já impressos deixaram de valer**.

## O agente sai junto

Mexeu no `engine.py`, no `app.py`, no `qr_ideal.py` ou no `frontend/`: publicar o
site exige publicar o agente na mesma leva, com número de versão **novo**.
Republicar um número existente é ignorado em silêncio pelas estações.
