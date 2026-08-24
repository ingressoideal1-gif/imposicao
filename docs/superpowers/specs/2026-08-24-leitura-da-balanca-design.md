# Ler a balança Urano CP 3/0.5 POP no Painel do Acabamento

24/08/2026.

## O que o usuário pediu

No Painel do Acabamento, na edição do pedido, o operador já tira a foto do
material pela webcam da estação. Ele também pesa o material numa balança
**Urano CP 3/0.5 POP**, e hoje digita o número que lê no visor dela. O pedido é
que o peso chegue sozinho ao campo.

## O que o manual da balança diz — e é daqui que sai o desenho

Manual de operação da linha CP POP, item 11.13.2 ("Configuração da saída serial
padrão e USB", senha 191249). O modelo CP 3/0.5 POP está na tabela de
capacidades do mesmo manual: 0 a 3000 g, divisão de 0,5 g.

- A saída de dados é **opcional de fábrica**: um conector RJ45 (RS-232C) e/ou um
  conector USB, na lateral esquerda do equipamento. Balança sem esses conectores
  não tem como ser lida por software nenhum.
- A saída precisa estar **habilitada no teclado da balança**: `FUNÇÃO` `8`, senha
  `191249`, e então "Tipo 1" (responde a pedido do computador) ou "Tipo 2"
  (responde ao pedido e também à tecla IMPRIME). "Deslig" é uma das opções, e a
  balança pode estar nela.
- Protocolo: **9600 bps, 8 data bits, sem paridade, 2 stop bits**.
- O computador pede o peso mandando **um byte, `0x04` ou `0x05`**. A balança
  responde na hora, com um quadro só.
- O quadro é:

  ```
  [sinal][estável] DD/MM/AA _ <descrição, 20 caracteres> _ TTTTTTg _ LLLLLLg __ MMM,MMMg _ PPPPPP <CR><LF><CK><CK>
                                                            tara     líquido    peso médio   peças
  ```

  `[sinal]` é `+` ou `-`; `[estável]` é `*` (estável) ou espaço (instável). O
  checksum são dois bytes, a soma de tudo que vem à esquerda.

## O desenho

### 1. A leitura é do agente, nunca do navegador

Ler porta serial pela página exigiria WebSerial: só Chrome, e com permissão
concedida à mão em cada máquina. A regra do projeto é que nenhuma solução
dependa de configurar navegador, porque cada estação usa um diferente. O agente
local já serve o painel na porta 9000 e já é o caminho do peso por setor — a
balança entra por ele.

### 2. `balanca.py`, o módulo do agente

Uma função que abre a porta, manda `0x05`, lê até `CR LF` mais dois bytes de
checksum, e devolve `{peso_kg, estavel, sobrecarga, bruto}`.

Três decisões que o manual força:

- **O sinal e a marca de estável são lidos como conjunto.** O desenho do manual
  põe os dois nas duas primeiras posições do quadro, mas não deixa claro qual vem
  primeiro. Em vez de apostar, o parser olha os dois primeiros caracteres juntos:
  se algum é `*`, o peso está estável; se algum é `-`, é negativo. Não há como
  errar, e não há aposta a manter.
- **O checksum é calculado e exibido no diagnóstico, mas não recusa o quadro.**
  Se a minha leitura de "soma de todos os bytes à esquerda" estiver um byte
  deslocada, recusar por checksum transformaria uma balança que funciona numa que
  nunca lê. Os campos numéricos já validam o quadro.
- **`888888` é sobrecarga**, e o manual diz isso: peso acima de 15 % da capacidade
  ao ligar mostra `888888` no visor. A balança é de 3 kg — caixa mais pesada que
  isso não é erro de software, e o operador precisa ouvir isso em português.

O peso líquido vem em **gramas**, seis dígitos. O campo da tela é em **quilos**,
então o módulo divide por 1000 e devolve com três casas — que é a precisão que os
campos de peso do painel já usam.

### 3. As rotas locais

Todas atrás do `get_current_user`, como as outras rotas da estação.

- `GET /api/balanca/peso` — o peso agora. Tenta a porta guardada; não havendo,
  procura sozinha entre as portas COM e guarda a que responder.
- `GET /api/balanca/portas` — o diagnóstico: lista as portas COM da máquina e o
  que cada uma respondeu ao `0x05`, com os bytes crus.
- `POST /api/balanca/porta` — grava a porta escolhida à mão.

As três respondem **HTTP 200 mesmo quando não acham a balança**, com
`{ok: false, motivo, comoResolver}`. Não achar balança é estado de operação, não
falha de servidor, e o operador precisa ler o que fazer — não um 502.

A porta escolhida mora em `balanca_config.json`, ao lado do executável, como o
`print_configs.json`: qual porta é a balança é propriedade física daquela
máquina, e sobrevive à atualização do agente.

### 4. O botão na tela

Um botão `⚖` ao lado dos **três** campos de peso do Painel do Acabamento, que
são o mesmo ato de pesar:

1. o peso de cada setor, na ficha de expedição;
2. o "Peso na balança" do editor de caixa/volume;
3. a janela de peso obrigatório, que abre ao marcar o último modelo como Pronto.

Apertado, ele espera até 4 segundos por uma leitura **estável** e preenche o
campo. O valor preenchido segue exatamente o caminho de hoje — a régua dos 5 %, a
senha de liberação, a mesma gravação. Digitar à mão continua valendo.

O botão só existe na estação. No site não há balança para ler, e um botão que não
faz nada é pior que botão nenhum.

### 5. Quando não achar a balança, a tela diz o que fazer

Falhou, abre uma caixa com o motivo e a saída — na própria tela, porque toda
trava neste projeto precisa oferecer a saída:

- as portas COM que a máquina tem, e o que cada uma respondeu ("Procurar balança");
- os passos do teclado da balança: `FUNÇÃO` `8`, senha `191249`, "Tipo 1";
- o lembrete de que a saída serial/USB é opcional na CP POP, e que sem o conector
  não há o que ler.

## O que fica de fora

Leitura contínua (o número mudando na tela enquanto o material está no prato).
Uma leitura por clique resolve o trabalho e não deixa uma porta serial aberta
sozinha o dia inteiro.

## Testes

- `tests/test_balanca.py` — o parser do quadro contra quadros montados byte a
  byte a partir do manual: estável, instável, negativo, sobrecarga, quadro
  truncado, lixo. Mais a ligação: as rotas existem, o `pyserial` está no
  `requirements.txt` e nos `hiddenimports` do `agent_tray.spec` (sem isso o
  agente compila e só falha na estação).
- `tests/acabamento_harness.js` — o `frontend/acabamento.js` de verdade num DOM de
  mentira. Os testes da balança entram no harness que já existe, e não num
  arquivo novo: é lá que mora a montagem da tela do Acabamento, e duplicá-la
  criaria duas verdades sobre o mesmo painel. Eles medem que o botão aparece na
  estação e não aparece no site, que o peso lido preenche o campo e grava pela
  rota de sempre, que a régua dos 5 % continua valendo para o peso que veio da
  balança, e que a falha abre a caixa com o motivo e a saída.

## O que não se descobre daqui

Se a balança da gráfica **tem** o conector opcional e está ligada no computador.
O usuário não sabia, e a resposta não sai de código nenhum — sai da máquina. Por
isso o diagnóstico faz parte da entrega, e não é um extra: publicado o agente, o
"Procurar balança" na estação do acabamento responde isso em um clique.
