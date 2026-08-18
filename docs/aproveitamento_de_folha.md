# Aproveitamento de folha

A tela mede quanto papel a impressão vai deixar vazio e, quando o operador pede,
procura quem completa a folha — primeiro dentro do pedido, depois entre os
pedidos da fila. Introduzido em 18/08/2026.

Arquivos: `frontend/index.html` (o selo e a aba do ADM), `frontend/script.js` (a
medida, a busca e o registro), `engine.py` (o pedido por item, para o QR Ideal),
`sql/schema_aproveitamento_de_folha.sql` (as três tabelas). Desenho e o porquê de
cada decisão em
`docs/superpowers/specs/2026-08-18-aproveitamento-de-folha-entre-pedidos-design.md`.

## A medida

```
sobra = células por folha − (total de itens mod células por folha)
```

Sempre entre 0 e `células − 1`. Vinte e nove credenciais num formato de 4 células
gastam 8 folhas e deixam **3 células vazias**, três quartos de uma folha de PVC.

A conta é do **resto**, e não `folhas × células − total`. As duas dão o mesmo
número no sequencial, mas no blocado a montagem gasta folhas a mais de propósito,
e essas não são desperdício: são a pilha de tamanho fixo que o operador pediu.
Combinar modelos só elimina a sobra do resto, e é ela que se mede.

## O selo

Uma linha acima dos botões de imposição, nas duas abas:

```
📄 8 folha(s) · 29 itens · sobram 3 célula(s) (75% de uma folha)   [ Ver aproveitamento ]
```

**Vale para um modelo sozinho**, que é o caso das 29 credenciais, e só informa —
não muda nada do que é impresso. O botão é a porta para o caminho combinado, e
essa porta só se atravessa quando o operador aceita uma composição.

### O limiar é por produto

O botão aparece quando a sobra passa do limiar **daquele produto**. É fração de
folha e não número de células porque num formato de 4 sobrar 3 é grave e num de
20 é ruído.

E é por produto porque o desperdício não custa o mesmo em toda parte: meia folha
de PVC de credencial é um prejuízo que meia folha de papel de pulseira não é. Foi
pedido do usuário em 18/08/2026.

| | Onde mora | Quando vale |
|---|---|---|
| Padrão da gráfica | `producao_config.limiar_sobra` | produto sem valor próprio |
| Do produto | `producao_produtos_combinaveis.limiar_sobra` | sempre que preenchido |

Na tela, o campo vazio de um produto significa "usa o padrão", e o *placeholder*
mostra qual é — em vez de deixar o operador adivinhar se vazio quer dizer "sem
aviso". Apagar o número é como se desfaz uma exceção.

O limiar viaja **dentro** do resultado de `sobraDaImposicao()`, e não é buscado
por quem pergunta: quem tem o produto na mão é essa função, e espalhar a busca
garantiria que um dos chamadores esquecesse.

**As duas configurações do produto vivem na mesma linha da tabela**, e cada uma
tem o seu controle na tela. Por isso a gravação passa toda por
`gravarProdutoCombinavel()`, que parte do que já estava e aplica só a mudança:
um upsert que mandasse apenas o campo mexido apagaria o outro — marcar a caixa
limparia o limiar, e digitar o limiar desmarcaria a caixa.

## A busca

Primeiro os outros modelos do **pedido aberto**. Só se nenhum fechar, e só para
produtos liberados no ADM, os modelos dos **pedidos da fila**.

Candidato precisa de **arte aprovada** e **status aguardando impressão**. Nada
que a produção ainda não liberou é antecipado só porque caberia na folha — foi
decisão do usuário em 18/08/2026, para o aproveitamento não virar fila furada.

E precisa passar pelo `porQueNaoCombina`, o mesmo da seleção manual: a busca não
pode sugerir o que a tela recusaria.

Os pedidos que ainda não estão em memória são carregados com o **mesmo
`loadOSItens`** que a tela usa, e não com uma consulta própria. O motivo é
concreto: `formato_id` e `saida_id` **não existem em `pedidos_modelos`** — são
resolvidos em memória a partir do texto do ERP —, e uma consulta crua traria
modelos sem formato, que o `porQueNaoCombina` recusaria todos. Só roda no clique,
e é por isso que o custo é aceitável.

### A conta é exata, não uma tentativa

Só o **resto** de cada quantidade importa (`qtd mod células`), então o problema
tem no máximo `células` estados — 40 no pior formato deste catálogo. A varredura
passa por cada candidato uma vez, guardando, para cada resto alcançável, a menor
quantidade de modelos que chega nele.

O critério final é a sobra que restaria; o desempate é o menor número de modelos
extras. Fechar a folha com um modelo é melhor que fechar com três.

Candidato cuja quantidade é múltiplo das células **nunca** vira sugestão: ele não
muda o resto, então não muda a sobra.

## O popup e a seleção deliberada

```
🧩 Aproveitamento encontrado

Hoje:       29 itens → 8 folhas, sobram 3 células
Combinado:  32 itens → 8 folhas, sem sobra

   1000277 · Tchéquia · pedido 20495 · 29  (este)
 + 1000301 · VIP      · pedido 20508 ·  3

[ Usar esta composição ]   [ Imprimir só o que está ]
```

Aceitar troca `state.selectedOSItems` pela composição e, quando ela cruza
pedidos, liga `state.combinacaoEntrePedidos`.

**Esse sinalizador é o que separa duas coisas que parecem iguais.** A trava
`problemaNaSelecao()` continua recusando seleção que cruza pedidos — foi o
conserto do 1000277/1000278, em que o modelo de outro pedido era **invisível** na
fila e saía com zero itens, em silêncio. O que o sinalizador libera é o
cruzamento **decidido**: listado no popup, aceito pelo operador, e com os itens
do outro pedido carregados na memória por causa disso.

Ele morre sozinho: nasce desligado a cada carga da página, e
`limparSelecaoDeOutroPedido()` o desliga junto com os forasteiros. Na prática,
clicar num modelo da fila depois de aceitar uma composição desfaz a composição —
e o operador é avisado de quantos saíram. É deliberado: manter viva uma
combinação invisível é exatamente o defeito que a trava existe para impedir.

A outra metade da trava continua valendo **mesmo com a decisão**: modelo marcado
cujo pedido não está carregado é recusado sempre.

## O QR Ideal, que é a parte perigosa

O conteúdo do QR Ideal é `reverso(pedido) + código`, e a coluna do pool é
`(últimos2(pedido) − últimos2(modelo)) mod 100`. **As duas coisas dependem do
pedido.**

No motor, o pedido era um só por trabalho. Numa folha com modelos de dois
pedidos, todos os itens receberiam o pedido errado — coluna errada e prefixo
errado. Isso não aparece na tela nem no papel: aparece na portaria, com o lote
entregue.

Agora o `multi_map` carrega `pedido` por item, e `_pedido_do_item()` decide:

- o pedido do item, quando ele existe;
- o pedido do trabalho, quando nenhuma arte declara um — o caso de toda folha de
  pedido único, que por isso não mudou de comportamento;
- **erro**, quando a folha mistura pedidos e um item chega sem o seu. Falhar alto
  é a regra do QR Ideal.

`_conferir_colunas_qr_ideal` passou a agrupar **por pedido**. Dois modelos na
mesma coluna só produzem QRs idênticos se forem do mesmo pedido; com pedidos
diferentes o prefixo separa o conteúdo, a portaria distingue os dois, e recusar
bloquearia uma combinação legítima. O risco residual — o código de 8 caracteres
repetido entre eventos — já está conhecido e aceito em `docs/qr_ideal.md`.

## As três tabelas

| Tabela | O que guarda |
|---|---|
| `producao_produtos_combinaveis` | quais produtos podem dividir folha com outro pedido (linha ausente = não liberado) e o limiar próprio de cada um |
| `producao_config` | `limiar_sobra`, o padrão da gráfica para quem não tem o seu |
| `producao_combinacoes` | qual trabalho juntou quais pedidos |

Nenhuma toca o catálogo `produtos` do parceiro: o que dizemos ali é uma permissão
**nossa** sobre o produto dele.

O registro é gravado quando a impressão é **confirmada**, dentro de
`confirmarImpressaoModelos()`, e só quando a folha cruza pedidos. PDF gerado é
conferência, e conferência não muda o status de pedido nenhum. É esse registro
que responde, semanas depois, "por que o 20508 foi impresso antes da hora" — e
falhar ao gravá-lo não desfaz a impressão, porque o material já saiu.

## Dois filtros, e os dois valem

O **produto liberado no ADM** diz se *pode* dividir folha com outro pedido. O
**`porQueNaoCombina`** diz se *dá* — cor, formato, saída, face, modo PDF e modo
de impressão. São perguntas diferentes.

## Como verificar uma mudança

- `node tests/aproveitamento_harness.js` — a medida da sobra (com o exemplo das
  29 credenciais), o limiar por produto e o padrão, quem pode entrar, a conta
  exata da composição, a lista do ADM e as duas metades da trava de cruzar
  pedidos.
- `pytest tests/test_engine_modelos_somados.py` — o pedido por item, a folha que
  mistura pedidos, e o QR de cada item contra o pool de verdade.
- `pytest tests/test_harness_de_imposicao.py` — roda os harnesses de node dentro
  da suíte.
