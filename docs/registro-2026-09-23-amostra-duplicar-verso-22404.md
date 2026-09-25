# Pedido 22404 — prévia de Duplicar para Verso no Link do Cliente

Data: 23/09/2026. Correção web publicada como v956.

## Diagnóstico

- Consulta somente de leitura ao pedido 22404 encontrou 41 modelos. Os seis modelos das ordens 7 a 12 (IDs 1001174 a 1001179) usam `print_mode=pdf_duplicate_back` e `modo_pdf=true`.
- A célula vinculada às numerações mede **105 × 148 mm**; a primeira página de cada PDF desses modelos mede **98 × 152 mm**. As escalas salvas são 100% na horizontal e na vertical. As contagens de páginas dos seis PDFs (40, 9, 10, 43, 9 e 5) coincidem com as quantidades dos respectivos modelos.
- No `frontend/cliente.js`, a janela da prévia paginada tinha as medidas da página PDF. A numeração era posicionada sobre essa janela. Na Lista de Arte, `frontend/script.js` já usava as medidas do formato da célula, com a arte centrada e aparada nos limites dela. A diferença explica o enquadramento divergente no Link do Cliente.

## Correção

- O visualizador PDF do portal resolve o formato pela numeração, depois pela cor e, por fim, pelo modelo. Sem formato válido, informa que a amostra não pode ser visualizada com segurança.
- Frente e verso são desenhados sobre uma célula branca com as dimensões do formato. A página da arte fica centrada, é aparada pela célula e respeita as escalas horizontal e vertical salvas. A numeração é sobreposta nas coordenadas da célula.
- `pdf_duplicate_back` continua usando a mesma página do PDF nas duas faces. `pdf_odd_even` continua usando a página ímpar na frente e a par no verso. Não houve alteração no PDF original, no motor de impressão, na quantidade, no banco ou no pedido.
- Arquivos da entrega: `frontend/cliente.js`, `frontend/cliente.html` (cache `cliente.js?v=956`) e `tests/cliente_pdf_duplicate_back_harness.js`.

## Validação e publicação

- O harness de regressão usou dimensões sintéticas de arte de 98 × 152 mm e célula de 105 × 148 mm. Confirmou as medidas do canvas, a transformação que centraliza e apara a arte, as medidas recebidas pela numeração, a escala independente por eixo, a duplicação no verso, o modo ímpar/par, o modo Frente e o aviso quando falta formato. Passou; não substitui inspeção visual no navegador.
- Também passaram `cliente_pdf_paginado_harness.js`, `pdf_duplex_preview_numbering_harness.js`, `link_do_cliente_harness.js`, `node --check frontend/cliente.js` e `git diff --check`.
- `cliente_verso_atual_harness.js` falhou antes de exercitar esta correção: o harness não fornece `rotuloDoModoDeImpressao` ao trecho de `script.js` que executa. Esse arquivo e `script.js` não fizeram parte da entrega.
- Commit integrado ao `origin/main`: `99afa35eaa4ce9118f0aa04d1542c86775d50e21`; tag `v956`. A Cloudflare Pages confirmou sucesso. A primeira leitura pública de `cliente.html` ainda tinha hash diferente; após a propagação, uma nova consulta com cache-buster confirmou **4 de 4 hashes normalizados iguais**: `cliente.html` e `cliente.js?v=956` em `imposition.ai-ideal.com.br` e `imposicao.pages.dev`.
- SHA-256 normalizado publicado: `cliente.html` = `fb85c950ac9375eef584c78e8c40fe7d39d6ba20bf527564d4534563b2797bc7`; `cliente.js` = `42dee3e2b388d3d02938d52e50635c6783478ca78862299e30d9dcbaabfe1165`.

## Limites e recuperação

- A publicação e os hashes comprovam a entrega dos arquivos web. O link autenticado do pedido 22404 não foi aberto visualmente após o deploy; não houve teste de impressão física nem atualização do NewProd, que não foi alterado.
- Na próxima conferência operacional, abrir o link autorizado do pedido 22404 e comparar as duas faces dos modelos das ordens 7 a 12 com a janela combinada da Lista de Arte, inclusive ao mudar de página.
- Worktree da correção: `C:\ProjetosLocais\ideal-imposition-analise-22404`, branch `fix/cliente-preview-duplicar-verso-22404`. O checkout operacional `C:\ProjetosLocais\ideal-imposition` e suas alterações preexistentes foram preservados.
- Para recuperar a versão web anterior, partir da tag `v955` (`bc41ea70`), reverter o commit funcional em nova entrega frontend, incrementar a referência de cache e comparar novamente os arquivos públicos nos dois domínios. Não reescrever `main` nem reutilizar a versão v956.

Este registro foi acrescentado após a publicação funcional e ainda não foi integrado ao repositório remoto.
