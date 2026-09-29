# Zeros nos elementos de Camarote

Atualização: publicado como frontend v975 e NewProd 1.2.346.
Ver [publicação e evidências](publicacao-2026-09-29-camarote-zeros.md).
O restante deste registro documenta a implementação local anterior à publicação.

Implementação local na branch `feat/camarote-zeros-20260929`, baseada em
`origin/main` no commit `806eb138`. Checkout de trabalho:
`C:\ProjetosLocais\ideal-imposition-camarote-zeros`.

- Local, Pessoas e Pessoas 1/Total recebem o controle Zeros (pad), de 0 a 10.
- A configuração usa o campo existente `pad` de cada elemento. Com 6 dígitos,
  os exemplos são `Mesa 000007`, `Cadeira 000001` e `Cadeira 000001/000005`.
- Em Pessoas 1/Total, os dois números recebem o preenchimento. O campo explica
  isso na tela. Prefixos permanecem fora do preenchimento.
- Ausente ou zero mantém a apresentação anterior. Valores maiores que a
  largura não são truncados. As contas de local/pessoa não foram alteradas.
- As prévias em `frontend/script.js`, `frontend/pedido.js` e
  `frontend/cliente.js` e o PDF em `engine.py` aplicam a mesma apresentação.
- Não requer SQL ou alteração de schema: a serialização existente preserva
  `pad` no objeto do elemento.

## Validação local

O teste de regressão reproduziu o problema antes da correção: `Mesa 7` no PDF
quando esperado `Mesa 07`. Depois da correção:

- 46 testes passaram em `test_camarote_zeros.py` e
  `test_engine_banco_nunca_vira_sequencial.py`.
- O teste de navegador inclui 17 verificações de controles e canvas reais,
  usando dados sintéticos e rede bloqueada. Verifica alteração independente,
  reabertura por serialização, limites e prévias do painel e portal.
- 28 verificações de `numero_da_pagina_harness.js` passaram.
- Sintaxe dos três arquivos JS alterados e do novo harness validada com Node.
- Diff revisado com `git diff --check`.

Usado o Python já instalado em
`C:\ProjetosLocais\ideal-imposition-pdf-mesclar\venv\Scripts\python.exe`,
pois o checkout principal não possui `venv` e os Python globais não têm pytest.
Para o navegador, `NODE_PATH=C:\ProjetosLocais\ideal-imposition\node_modules`.
Nenhuma dependência foi instalada.

## Entrega e limites

Sem commit, publicação, acesso a banco compartilhado ou impressão física.
O checkout operacional e suas alterações preexistentes foram preservados.
Para produção, publicar os três arquivos do frontend e entregar uma versão do
agente com a alteração de `engine.py`; o agente anterior ignora o pad de Camarote.
A instalação no piloto local exige integração separada das alterações desse piloto.
Recuperação local: a base `806eb138` permanece disponível; a mudança está isolada
nesta branch/worktree, sem alterar o checkout operacional.
