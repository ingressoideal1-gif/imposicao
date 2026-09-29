# Campos obrigatórios dos modelos — pedido 22770

Correção local de 29/09/2026, branch `fix/faixa-modelo-22770`, baseada em `origin/main` (`54e28774`). Checkout isolado: `C:\ProjetosLocais\ideal-imposition-faixa-22770`.

## Defeito e decisão

O modelo 1001540 tinha quantidade 5, início e fim ausentes. A abertura só substituía os inputs de faixa quando havia valores; uma faixa anterior 1–4 continuava sendo enviada ao motor. O usuário determinou que os campos aplicáveis à produção sejam obrigatórios, com bloqueio de PDF e impressão e solicitação de correção pelo operador. Não inferir nem gravar início/fim ausentes.

## Implementação

- `frontend/script.js`: validação compartilhada por modelo de quantidade, bloco, cor, numeração, formato, saída, modo de impressão e frente/verso. Para sequenciais, início/fim inteiros e coerência com a quantidade; TICKET conserva quantidade de células físicas e considera as vias na faixa.
- PDF paginado e banco de dados não exigem faixa sequencial. Camarote exige Q_CAM, L_CAM e C_INI. As verificações existentes de arquivos, bancos e páginas permanecem em vigor.
- `frontend/pedido.js` e `script.js`: bloqueio nos dois caminhos, tanto para PDF como impressão, incluindo seleção combinada; mensagem identifica modelos e campos a corrigir. Nova conferência antes do payload protege alterações durante operações assíncronas.
- A abertura limpa a faixa ausente em vez de conservar valores antigos. A fila mostra o fim cadastrado, sem mascarar ausência com um cálculo. Na geração individual sequencial do Pedido, o payload usa a faixa do modelo validado.
- Nenhuma escrita no cadastro, dependência, alteração do motor ou publicação.

## Evidências locais

- `node tests/faixa_modelo_ausente_harness.js`: bloqueios por campo, duas telas, PDF/impressão, seleção combinada, cadastro intacto, zero válido, TICKET, PDF paginado, banco e camarote.
- `python tests/test_campos_obrigatorios_modelo.py`: passou; executa o fluxo JS com transporte simulado e usa o payload aprovado no motor real, com arte sintética. PDF resultante contém cinco ocorrências da peça.
- `node tests/impressao_combinada_fluxo_harness.js`: passou.
- `node tests/impressao_combinada_harness.js`: passou.
- `python tests/test_impressao_combinada.py`: 8 testes passaram.
- `node tests/formatos_integridade_harness.js`: 15 cenários passaram.
- Sintaxe dos JS alterados e `git diff --check`: passaram.

O Node usou somente dependências já instaladas, via `NODE_PATH=C:\ProjetosLocais\ideal-imposition\node_modules`. O Python disponível tem as dependências do motor, mas não pytest; os testes unittest acima foram executados diretamente.

`tests/quantidade_erp_harness.js` falha com `ReferenceError: window is not defined` em `saveActiveOSItemField`. A mesma falha foi reproduzida lendo os fontes originais de HEAD, confirmando que precede esta alteração; não foi corrigida fora do escopo.

## Limites e retomada

Sem commit, push, deploy, instalação do agente ou alteração dos dados reais. Os testes de impressão simulam o transporte; não comprovam saída física. Revisar este diff e publicar mediante autorização. O modelo 1001540 continuará exigindo correção de seu cadastro pelo operador; a alteração não preenche valores automaticamente. A reversão é retirar somente os arquivos deste trabalho isolado, preservando o checkout operacional e seus arquivos preexistentes.
