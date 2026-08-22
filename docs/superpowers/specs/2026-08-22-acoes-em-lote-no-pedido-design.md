# Ações em lote no pedido — Marcar PRONTO, Em Alteração e Aprovar todos os modelos

> Pedido do usuário, 22/08/2026: *"Cria um botão (ação) dentro do pedido para Marcar
> Pronto, Reprovar e Aprovar simultaneamente todos os modelos do mesmo pedido,
> respeitando que aprovação e reprovação somente usuário ADM e Atendimento"*.

## O que é

No banner do pedido aberto (tela **Amostras**, `#amostras-os-banner`), uma linha nova
**"Todos os modelos:"** com até três botões:

| Botão | Ação por modelo | Quem vê o botão |
|---|---|---|
| 🎨 Marcar todos PRONTO | `decisionAmostraItem(id, osId, 'PRONTO')` | todo mundo que abre o pedido |
| ❌ Todos em ALTERAÇÃO | `decisionAmostraItem(id, osId, 'REPROVADA')` | **ADM e Atendimento** |
| ✅ Aprovar todos | `decisionAmostraItem(id, osId, 'APROVADA')` | **ADM e Atendimento** |

Quem não é ADM/Atendimento vê, no lugar dos dois botões, o texto
*"Aprovar e colocar em alteração em lote: só ADM e Atendimento"*. No link do cliente a
linha não existe.

O botão em lote faz **exatamente** o que o botão do card faz, modelo a modelo — mesma
função, mesmas travas, mesmas gravações. Nada novo é escrito no banco.

## As funções

Todas em `frontend/script.js`, ao lado das regras de bloqueio (`podeDefinirDesigner`
etc.). As três primeiras são **puras** e lidas pelo harness.

```js
// Rótulo de cada ação, usado nas mensagens.
const ROTULO_DA_ACAO_EM_LOTE = {
    PRONTO:    'Marcar PRONTO',
    REPROVADA: 'Colocar em Alteração',
    APROVADA:  'Aprovar',
};

/** Quem pode acionar cada ação em lote. PRONTO: qualquer papel (como o botão do
 *  card). APROVADA e REPROVADA: só 'admin' e 'atendimento' (papelAtual()). */
function podeAgirEmLoteNoPedido(acao) → boolean

/** Nome do modelo nas mensagens: nome_produto_real || produto || `Modelo ${id}`. */
function nomeDoModeloParaLista(item) → string

/**
 * O plano: quem entra e quem fica de fora, com o motivo. Puro.
 * itens: modelos do pedido (amostra_status, status_arte, produto, nome_produto_real, id)
 * ctx:   { podeDestravar: bool,
 *          divergencia:     item => string|null,   // texto da divergência de células
 *          bancoIncompleto: item => string|null }  // texto do banco incompleto
 */
function planoDaAcaoEmLote(itens, acao, ctx) → { acao, aplicar: [item], pulados: [{ item, motivo }] }

/** Texto único de confirmação/resumo. */
function textoDoPlanoEmLote(plano, totalDeModelos) → string
```

### Motivos de pular (strings exatas)

Ordem de conferência por ação; o primeiro motivo que bate é o que vale.

- **PRONTO**
  1. `amostra_status === 'PRONTO'` → `'já está pronto'`
  2. `modeloEstaAprovado(item)` → `'aprovado pelo cliente — não se altera'`
  3. `ctx.divergencia(item)` devolve texto → esse texto
  4. `ctx.bancoIncompleto(item)` devolve texto → esse texto
- **APROVADA**
  1. `modeloEstaAprovado(item)` → `'já está aprovado'`
- **REPROVADA**
  1. `amostra_status === 'REPROVADA'` → `'já está em alteração'`
  2. `modeloEstaAprovado(item) && !ctx.podeDestravar` →
     `'aprovado — só o atendimento, o gerente ou o administrador devolvem para alteração'`

### Texto do plano

```
Marcar PRONTO em 3 de 5 modelos do pedido.

Ficam de fora:
• Credencial VIP — banco incompleto: ...
• Ingresso Pista — já está pronto
```

Sem ninguém para aplicar: `Nenhum modelo para Marcar PRONTO.` seguido da lista
"Ficam de fora" (se houver). A lista só aparece quando há pulados.

## O executor

```js
window.acaoEmLoteNoPedido = async function(osId, acao)
```

1. `podeAgirEmLoteNoPedido(acao)` falso → `toast('... só ADM e Atendimento', 'warning')`, sai.
2. `itens = state.osItens[osId]`; monta `ctx` com `podeDestravarModeloAprovado()`,
   `divergenciaDeCelulasDoModelo` + `textoDaDivergenciaDeCelulas`, e
   `bancoDeDadosIncompletoDoModelo(...).texto`.
3. `plano = planoDaAcaoEmLote(itens, acao, ctx)`; sem ninguém para aplicar →
   `toast(textoDoPlanoEmLote(...), 'warning')`, sai.
4. **REPROVADA**: `prompt('Anotação da alteração — vale para todos os modelos do pedido
   (obrigatória):')`. Cancelar ou vazio → `toast('Anotar alteração ...', 'warning')`, sai.
   Por modelo: `obs = atual ? atual + '\n' + texto : texto`.
5. `confirm(textoDoPlanoEmLote(plano, itens.length) + '\n\nConfirmar?')`; não → sai.
6. Para cada item de `plano.aplicar`, em sequência: `toast('⏳ i/n — nome', 'info')` e
   `ok = await decisionAmostraItem(item.id, osId, acao, { emLote: true, obs })`;
   conta sucesso/falha.
7. Uma vez no fim: `loadOSItens(osId)`, `renderAmostrasOSItens(osId)`; se acao PRONTO,
   `promoverPedidoSeTodosProntos(osId)`; `toast` único com o resumo
   (`'🎨 Marcar PRONTO: 3 modelos. 1 ficou de fora (veja a confirmação).'` / com falhas:
   `'... 2 feitos, 1 falhou — veja os avisos.'`).

## A mexida em `decisionAmostraItem`

Assinatura: `async function decisionAmostraItem(itemId, osId, status, opts = {})`.

- `opts.obs !== undefined` substitui a leitura do textarea `amostra-obs-${itemId}`.
- `opts.emLote`: não dá os toasts de progresso/sucesso por modelo (os de **erro** e de
  **trava** continuam), não faz `loadOSItens`/`renderAmostrasOSItens` por modelo e não
  roda a promoção para "Enviar Arte" — o executor faz tudo isso uma vez no fim.
- Passa a **devolver** `true` quando gravou e `false` em qualquer saída antecipada ou erro.
  Quem chama hoje ignora o retorno.
- O bloco "todos prontos → Enviar Arte" vira `async function promoverPedidoSeTodosProntos(osId)`,
  chamado pelo caminho por modelo (sem `opts.emLote`) e pelo executor.

Sem `opts`, o comportamento é idêntico ao de hoje.

## Tela

`frontend/index.html`, dentro de `#amostras-os-banner`, terceiro filho:

```html
<div id="amostras-acoes-em-lote" style="display:none; ..."></div>
```

`renderAcoesEmLoteDoPedido(osId)` é chamada por `renderAmostrasOSItens` depois de
preencher o banner (só no container interno) e desenha:

```
Todos os modelos:  [🎨 Marcar todos PRONTO] [❌ Todos em ALTERAÇÃO] [✅ Aprovar todos]
```

ids `btn-lote-pronto`, `btn-lote-alteracao`, `btn-lote-aprovar`; os dois últimos só se
`podeAgirEmLoteNoPedido('APROVADA')`. Cores iguais às dos botões do card (azul, vermelho,
verde). Cada botão tem `title` dizendo o que faz e que pula modelos que não podem.

## Testes

- `tests/acao_em_lote_harness.js` (Node, lê do `script.js`): papéis × ações em
  `podeAgirEmLoteNoPedido`; cada motivo de pular em `planoDaAcaoEmLote` (com `ctx` de
  mentira); `textoDoPlanoEmLote` com e sem pulados; `nomeDoModeloParaLista`.
- `tests/test_acao_em_lote.py`: roda o harness; confere no HTML o container; no
  `script.js` a assinatura nova, `promoverPedidoSeTodosProntos` chamada nos dois
  caminhos, `renderAcoesEmLoteDoPedido` chamada de `renderAmostrasOSItens`, botões
  gateados por `podeAgirEmLoteNoPedido`.

## Documentação

`docs/fluxo_aprovacao_arte.md`: seção nova "Ações em lote no pedido". CHANGELOG v689.
