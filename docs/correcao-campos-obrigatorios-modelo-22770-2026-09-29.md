# Campos obrigatórios dos modelos — pedido 22770

Correção publicada como web v971 em 29/09/2026, branch `fix/faixa-modelo-22770`, baseada em `origin/main` (`54e28774`). Checkout isolado: `C:\ProjetosLocais\ideal-imposition-faixa-22770`.

## Defeito e decisão

O modelo 1001540 tinha quantidade 5, início e fim ausentes. A abertura só substituía os inputs de faixa quando havia valores; uma faixa anterior 1–4 continuava sendo enviada ao motor. O usuário determinou que os campos aplicáveis à produção sejam obrigatórios, com bloqueio de PDF e impressão e solicitação de correção pelo operador. Não inferir nem gravar início/fim ausentes.

## Implementação

- `frontend/script.js`: validação compartilhada por modelo de quantidade, bloco, cor, numeração, formato, saída, modo de impressão e frente/verso. Para sequenciais, início/fim inteiros e coerência com a quantidade; TICKET conserva quantidade de células físicas e considera as vias na faixa.
- PDF paginado e banco de dados não exigem faixa sequencial. Camarote exige Q_CAM, L_CAM e C_INI. As verificações existentes de arquivos, bancos e páginas permanecem em vigor.
- `frontend/pedido.js` e `script.js`: bloqueio nos dois caminhos, tanto para PDF como impressão, incluindo seleção combinada; mensagem identifica modelos e campos a corrigir. Nova conferência antes do payload protege alterações durante operações assíncronas.
- A abertura limpa a faixa ausente em vez de conservar valores antigos. A fila mostra o fim cadastrado, sem mascarar ausência com um cálculo. Na geração individual sequencial do Pedido, o payload usa a faixa do modelo validado.
- Nenhuma escrita no cadastro, instalação de dependência ou alteração do motor.

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

## Publicação e comprovação

Publicação autorizada pelo usuário após a conferência do pedido 22555 (essa consulta não modificou dados).

- Commit funcional: `a6f6d48b44f389deed6da6cc05468ddfd655fe52`, integrado em `origin/main`; tag `v971`.
- `entrega-segura.ps1 publicar -Escopo Frontend -Integracao Direta -Sim`: validou escopo, segredos, sintaxe, regressões, versionou as referências HTML e publicou.
- Cloudflare Pages confirmou sucesso, deployment `cf633c22-b774-45be-b37b-89cb39e67a3f`.
- A primeira comparação do publicador encontrou conteúdo anterior, durante a propagação. Não houve nova publicação para contornar esse resultado.
- Após aguardar, 12/12 comparações SHA-256 normalizadas passaram: `index.html`, `cliente.html`, `controle.html`, `producao.html`, `script.js` e `pedido.js` nos dois domínios `imposicao.pages.dev` e `imposition.ai-ideal.com.br`, com cache busting.
- Evidência: [hashes públicos v971](evidencias/campos-obrigatorios-v971-publico.json).
- Na preparação final passaram novamente os 9 testes Python executados diretamente e a sintaxe dos 81 arquivos JS do frontend; o publicador também executou os harnesses da entrega.

## Limites e recuperação

Esta entrega publica o frontend web. Não compila, distribui nem instala NewProd/MSI e não comprova impressão física. Nenhum dado dos pedidos 22770 ou 22555 foi alterado. O modelo 1001540 exige correção de seu cadastro pelo operador; os valores não são preenchidos automaticamente.

Para recuperação, preparar uma nova entrega isolada que reverta somente esta correção e avance a versão de cache, preservando as demais alterações. A base anterior do frontend é `54e28774` (v970). Não reescrever histórico nem descartar o checkout operacional.
