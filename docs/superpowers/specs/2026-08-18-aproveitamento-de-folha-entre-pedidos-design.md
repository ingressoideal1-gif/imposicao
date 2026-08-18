# Aproveitamento de folha, inclusive entre pedidos

Desenho fechado em 18/08/2026. Nasce de uma frase do usuário: *"impressão de 29
credenciais, o formato da credencial possui 4 células, 29 credenciais vai gerar 7
folhas completas e 1 folha com apenas 25% de uso"*.

## O problema

Toda tiragem que não é múltiplo das células do formato joga papel fora. A conta é
fixa: `sobra = células − (total mod células)`, sempre entre 1 e `células − 1`.

| Tiragem | Células por folha | Folhas | Sobra |
|---|---|---|---|
| 29 credenciais | 4 | 8 | 3 células (75% de uma folha) |
| 21 ingressos | 20 | 2 | 19 células (95% de uma folha) |

Hoje o operador só descobre isso olhando o material sair. Não há nada na tela que
diga "esta impressão vai desperdiçar três quartos de uma folha", e não há como
perguntar "tem outro modelo que caiba aqui?".

## O que já existe

- `contaDaSoma()` — total de itens, células por folha, folhas e economia.
- `porQueNaoCombina(a, b)` — as seis recusas: cor, formato, saída, face, modo PDF
  e modo de impressão.
- `alvosDaImpressao()` — marca todos os modelos selecionados como impressos.
- `problemaNaSelecao()` — recusa seleção que cruza pedidos.

A peça nova é **procurar quem completa a folha** e **deixar cruzar pedidos com
segurança**.

## Três correções na lógica original

**Medir células vazias, não "% da última folha".** No modo Blocado o buraco não
fica na última folha — ele cai no fim de cada pilha, e as folhas saem `4,4,3,3`.
O papel perdido é o mesmo, mas um aviso dizendo "a última folha sai com 1
credencial" mentiria. A medida é *sobram 3 células = 75% de uma folha*.

**O limiar como fração de folha.** Num formato de 4 células sobrar 3 é grave; num
de 20 sobrar 3 é ruído. O aviso dispara quando a sobra passa de **meia folha**,
com o número ajustável no ADM.

**A sugestão é cálculo exato.** Com a sobra `r`, procura-se um subconjunto de
candidatos que some `células − r`. Uma programação dinâmica sobre os restos
possíveis (no máximo o número de células, sempre ≤ 40) devolve o melhor
aproveitamento com o menor número de modelos extras. Não é busca gulosa nem
"acha algum que caiba".

## ⚠️ O QR Ideal quebra ao cruzar pedidos

O conteúdo do QR Ideal é `reverso(pedido) + código`, e a **coluna** do pool é
`(últimos2(pedido) − últimos2(modelo)) mod 100`. As duas coisas dependem do
pedido.

No motor, o pedido é **um só por trabalho** (`cfg.pedido`); o modelo já viaja por
item desde 18/08/2026. Numa folha com modelos de dois pedidos, **todos os itens
receberiam o número do pedido errado** — coluna errada e prefixo errado. Isso não
aparece na tela nem no papel: aparece na portaria, com o lote entregue.

O conserto tem a forma do que se fez com o `modelo`:

- o `multi_map` ganha `pedido`, vindo de `multi_artes[i]["pedido"]`;
- `_conteudo_qr_ideal` usa o pedido do item quando ele existe, e o do trabalho
  quando não existe — assim nenhuma folha de pedido único muda de comportamento;
- **numa folha que mistura pedidos, item sem pedido levanta erro.** Falhar alto é
  a regra do QR Ideal;
- `_conferir_colunas_qr_ideal` passa a agrupar por pedido. Dois modelos que caem
  na mesma coluna só produzem QRs idênticos se forem **do mesmo pedido** — com
  pedidos diferentes o prefixo separa, e isso já é um risco conhecido e aceito
  (ver `docs/qr_ideal.md`, "Dois riscos conhecidos e aceitos").

Sem isso, cruzar pedidos com credencial de controle de acesso é proibido — e
credencial é justamente o caso do pedido 20495.

## O desenho

### O selo, sem popup

Uma linha acima dos botões de imposição, nas duas abas:

```
📄 8 folhas · sobram 3 células (75% de uma folha)   [ Ver aproveitamento ]
```

Vale para **um modelo sozinho**, que é o caso das 29 credenciais. O selo só
informa: não muda nada do que é impresso. Ele é a **porta** para o caminho
combinado, e essa porta só se atravessa quando o operador aceita uma composição.

O botão só aparece quando a sobra passa do limiar. Nada salta na tela.

### A busca, no clique

1. **Dentro do pedido**: os outros modelos do mesmo pedido, aguardando impressão,
   com arte aprovada, que passem no `porQueNaoCombina`.
2. **Só se não fechar**, e só para produtos liberados no ADM: os modelos dos
   pedidos que já estão na fila de impressão.

`formato_id` e `saida_id` **não existem em `pedidos_modelos`** — são resolvidos em
memória a partir do texto do ERP. Então a busca não filtra por SQL: traz os
modelos pendentes dos pedidos da fila, resolve formato e cor em memória com as
funções que já fazem isso, e só então aplica o `porQueNaoCombina`. Como só roda no
clique, o custo fica fora do caminho do operador.

Candidato precisa de **arte aprovada e status aguardando impressão**. Nada que a
produção ainda não liberou é antecipado.

### O popup, que é consequência do clique

```
Aproveitamento encontrado

Hoje:       29 credenciais → 8 folhas, sobram 3 células
Combinado:  32 credenciais → 8 folhas, sem sobra

   1000277 · Tchéquia · pedido 20495 · 29  (este)
 + 1000301 · VIP      · pedido 20508 ·  3

Os dois pedidos serão marcados como impressos, e fica registrado que
saíram juntos.

[ Usar esta composição ]   [ Imprimir só este modelo ]
```

### A trava de ontem continua de pé

`problemaNaSelecao()` recusa seleção que cruza pedidos — foi o conserto do
1000277/1000278, em que o modelo de outro pedido era **invisível** na fila e saía
com zero itens, em silêncio.

A diferença que sustenta o desenho: aquilo era seleção **por acidente**; isto é
seleção **por decisão**, listada e aceita. Só aceitar a composição liga
`state.combinacaoEntrePedidos`, e essa liberação morre sozinha ao trocar de
pedido ou ao limpar a seleção. Sem o sinalizador, a trava recusa como sempre.

### Três tabelas nossas

| Tabela | Para quê |
|---|---|
| `producao_produtos_combinaveis` | quais produtos podem dividir folha com outro pedido |
| `producao_config` | o limiar, e o que mais vier |
| `producao_combinacoes` | qual trabalho juntou quais pedidos |

O registro é o que responde, semanas depois, "por que o 20508 foi impresso
antes". Ele é gravado quando a impressão é confirmada, não quando o PDF é gerado.

Nada disso toca o catálogo `produtos` do parceiro.

### A aba no ADM

A barra de abas já tem o lugar reservado (`<!-- Futuras abas serão adicionadas
aqui -->`). Entra **Aproveitamento**, com a lista de produtos e o limiar.

Uma distinção que vale fixar: o **produto liberado no ADM diz se *pode*** dividir
folha com outro pedido; o **`porQueNaoCombina` diz se *dá***. São filtros
diferentes e os dois valem.

## As seis etapas

| | Etapa | Cruza pedido? |
|---|---|---|
| 1 | `sobraDaImposicao()` e o selo | não |
| 2 | pedido por item no motor + trava do QR Ideal | prepara |
| 3 | busca dentro do pedido, com a conta exata | não |
| 4 | as três tabelas, a aba do ADM e o limiar | não |
| 5 | busca entre pedidos, popup e seleção deliberada | sim |
| 6 | registro da combinação na confirmação da impressão | sim |

As etapas 1 a 4 valem sozinhas e não cruzam pedido nenhum. A ordem de execução
começa pela 2, que é a que protege a portaria.

## Decisões do usuário, 18/08/2026

- **Gatilho**: selo na tela, sem popup automático.
- **Limiar**: sobra acima de meia folha, ajustável no ADM.
- **Candidatos**: só arte aprovada e aguardando impressão.
- **Carona**: confirma no popup e fica registrado.

## Fora de escopo

Combinar modelos que não passam no `porQueNaoCombina` — cor, formato, saída,
face, modo PDF ou modo de impressão diferentes. Cada um desses produz uma folha
impossível, não só diferente.
