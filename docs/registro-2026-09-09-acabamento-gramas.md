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

## Publicação em 09/09/2026

Publicação autorizada pelo usuário e concluída no site. PR #26:
https://github.com/ingressoideal1-gif/imposicao/pull/26

- Worktree isolado: `../imposicao-acabamento-gramas`, baseado em `95e13d4f`.
- Commit da correção: `faf66cdbff79e77cd82c6c83a0d8b39d3cbd435e`.
- Merge em main: `eaf606951195061aedc83c3b64ab3e67aa0cd99a`.
- Cloudflare Pages: prévia e produção concluídas com `success`.
- Os mesmos 17 testes passaram também na cópia isolada para publicação.
- GET público de `https://imposition.ai-ideal.com.br/`: HTTP 200, HTML
  idêntico ao validado, incluindo `acabamento.js?v=834`.
- GET público de `/acabamento.js?v=834`: HTTP 200, JavaScript idêntico ao
  validado. Comparação com normalização de CRLF para LF.
- SHA-256 do HTML normalizado:
  `40c2c9187573534bf81cda0e25273fb6ff44beca5c05bcb0717212e5fe3eb2c2`.
- SHA-256 do JavaScript normalizado:
  `614f6344f500b04a20528b6f47b7fe818d10e84e2e43a2a7a75f933e4e7a548e`.

As alterações anteriores do workspace foram preservadas e não entraram no PR.
Não houve acesso a dados reais, migração, build ou instalação do agente Windows.
A confirmação com a balança física continua pendente. O painel empacotado no
agente depende de atualização própria; esta entrega publicou o site.

Recuperação: reverter o commit do PR #26 por um novo commit e publicar pelo
mesmo fluxo, usando nova referência de cache para o asset revertido.
Este complemento de evidência pós-publicação ficou registrado localmente.
