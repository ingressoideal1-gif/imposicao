# Acabamento: entrada em gramas e senha oculta

Na edição do pedido, os campos de peso do setor, do registro em volume, da
pesagem por modelo e da confirmação de revisão passam a receber gramas.
Exemplo: digitar `4160` corresponde a `4,160 kg` na gravação existente.
O preenchimento pela balança e a reabertura dos valores usam a mesma conversão.
Os totais e estimativas que exibem `kg` continuam identificados nessa unidade.

O estado interno e os campos `peso_real_kg` e `peso_kg` permanecem em quilos,
com a precisão existente de um grama. A tolerância de 5%, o rateio entre modelos
e as rotas de gravação são preservados. Não há migração de dados.

A senha de liberação usa `type="password"`, mantendo a conferência existente,
e é limpa ao cancelar ou concluir a liberação. O diálogo compara o peso real
e o estimado em gramas.

Fontes: `frontend/acabamento.js` e referência de cache em `frontend/index.html`.
Regressões: `tests/acabamento_harness.js` e
`tests/acabamento_gramas_browser_harness.js`, integrado à suíte Python.
Os testes usam dados sintéticos, gravações simuladas e navegador sem rede.

Validação executada: 17 testes aprovados no recorte `peso or registro or senha
or o_harness_do_acabamento_passa` de `tests/test_painel_do_acabamento.py`,
com `pytest -n 0`. Esse recorte inclui o harness funcional completo e a
conferência dos campos reais no navegador. `node --check` e `git diff --check`
também passaram. A captura local confirmou visualmente a senha mascarada.

Entrega local: sem publicação, instalação de agente ou acesso a dados reais.
As alterações anteriores do workspace foram preservadas. A confirmação na
estação com a balança física depende da disponibilização desta versão.
