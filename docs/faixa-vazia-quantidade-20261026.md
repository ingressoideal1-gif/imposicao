# Faixa vazia usa a quantidade do modelo

Regra solicitada em 26/10/2026, a partir do pedido 24233, modelo 1004671:
quando a numeracao estiver vazia, considerar inicio 1 e quantidade total.
Esse modelo tinha 87 unidades, com inicio e fim nulos.

## Implementacao local

`faixaEfetivaDoModelo` centraliza o calculo nas telas Pedido e Imposicao:
validacao, campos da lista, preenchimento ao abrir, previa, PDF e impressao.

- Inicio vazio (null, undefined, texto vazio ou espacos): 1.
- Fim vazio: inicio + quantidade do modelo - 1.
- TICKET: inicio + quantidade de celulas fisicas * vias - 1. Nao divide QTD.
- Faixas preenchidas, inclusive inicio zero, sao preservadas.
- Valores invalidos, quantidade invalida e faixas preenchidas inconsistentes
  continuam bloqueados. PDF paginado, banco, TEATRO e CAMAROTE preservam seus fluxos.
- O calculo nao modifica o objeto do modelo nem grava no banco. Alterar os campos
  manualmente continua seguindo o fluxo de gravacao existente.

## Validacao

- Harness de faixa: caso 87 unidades com valores ausentes, inputs antigos,
  nenhuma alteracao no cadastro, PDF/impressao, TICKET e selecao combinada.
- Harnesses de previa e fluxo combinado passaram.
- Dois harnesses em navegador passaram: carregamento do pedido e consulta de
  modelos reprovados, incluindo as telas Pedido/Imposicao.
- Python: 8 testes e 23 subtestes de imposicao combinada passaram.
- Sintaxe de script.js/pedido.js e git diff --check passaram.

O harness de fluxo combinado nao carregava a funcao real
`rotacionarPaginasParesDoPedido`, ja exigida pelo codigo: a fixture foi completada.
As dependencias Node existentes foram usadas via NODE_PATH, sem instalacao.

Worktree isolado: `imposition-faixa-vazia-20261026`, base `af127b1c`.
Nao houve gravacao em dados de pedidos ou alteracao do agente instalado.
Publicacao web v1109 autorizada: referencias exatas de script.js e pedido.js
atualizadas em index.html e producao.html. Integracao por PR com os checks
obrigatorios e comparacao dos assets nos dois dominios operacionais.
O recibo final de publicacao deve registrar merge, tag e hashes publicos;
esta documentacao descreve o conteudo preparado, nao comprova instalacao local.
