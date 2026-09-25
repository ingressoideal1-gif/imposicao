# Pedido: impressão de uma face — 21/09/2026

Implementação local na branch `feat/pedido-faces-20260921`, baseada em `origin/main` (5e50a1a9), no worktree `C:\ProjetosLocais\ideal-imposition-faces-20260921`.

Em Configuração de Impressão, modelos com verso mostram os checkboxes Apenas Frente e Apenas Verso. Marcar um desmarca o outro; ambos desmarcados mantêm frente e verso. A escolha é temporária e limpa ao trocar a seleção de modelos ou o modo. Não é salva como preferência do produto.

O pedido captura a escolha antes de gerar e mantém o modo original no payload do motor. Filtra as páginas do PDF retornado antes de baixar, salvar ou enviar, cobrindo streaming por lote, resposta JSON e PDF único. A remoção no próprio documento preserva numeração, geometria, rotação e catálogo ICC. Nomes recebem `_frente` ou `_verso`. Capas e contracapas auxiliares de identificação continuam separadas e intactas.

A impressão direta usa simplex para o trabalho de uma face sem modificar a preferência salva do driver. O hotfolder recebe o PDF filtrado; configurações físicas continuam sob o preset do RIP. A filtragem acontece antes de reversa e Folha a Folha. PDFs inválidos ou com pares incompletos interrompem a entrega; lotes anteriores já enviados não são desfeitos.

Arquivos funcionais: `frontend/index.html`, `frontend/pedido.js`, `frontend/script.js`. Sem alteração de motor, API, banco ou dependências.

Validação offline:
- `node tests/pedido_faces_impressao_harness.js`: caixas, troca de modelo, quatro modos com verso, PDFs reais sintéticos, ordem, rotação, ICC, capas e falhas.
- `node tests/impressao_combinada_fluxo_harness.js`: função real de geração, ambas as faces, PDF e impressão, nos três formatos de resposta; destinos simulados.
- `node tests/entrega_imediata_harness.js`: 46 verificações, incluindo simplex na submissão simulada ao driver e preservação de duplex no trabalho seguinte; fluxo existente de hotfolder.
- `node tests/fxversounico_harness.js`: 55 verificações.
- `node tests/montagem_faces_pdf_harness.js`: regressões de faces da Montagem.
- Sintaxe dos JS e `git diff --check`.

Os testes usam `NODE_PATH=C:/ProjetosLocais/ideal-imposition/node_modules`, sem instalação. Não publicado. Não houve envio à impressora, hotfolder real ou acesso ao banco. Próxima etapa operacional: publicação autorizada e conferência na estação com modelo frente e verso.

## Entrega segura

Em 21/09/2026, `entrega-segura.ps1 publicar -Escopo Frontend -Simular` terminou com `ESTADO: VALIDADA`, incluindo os cinco harnesses e verificação de sintaxe, escopo, segredos, links e diff. O fetch confirmou a base sem atraso em relação a `origin/main`.

Versão planejada: `v926`, sujeita à disponibilidade na publicação. O fluxo planeja atualizar as referências de cache em `cliente.html`, `controle.html`, `index.html` e `producao.html`. Integração padrão via PR. A simulação não criou commit, push, tag ou deploy e não alterou essas referências. Publicação e comprovação dos hashes públicos permanecem pendentes.

## Publicação concluída

Após autorização explícita, a versão `v926` foi integrada por fast-forward à `origin/main`, no commit `9b594259b8553b3fab736ee71433b4e134adae7a`. Usada integração direta porque `gh` não está disponível nesta estação. Os testes foram executados novamente, inclusive após atualizar as referências de cache.

Cloudflare Pages confirmou sucesso no deployment `03285b4a-b4d1-4b7d-a69f-6adbaedb556e`. A primeira comparação do script ainda encontrou arquivos antigos e terminou como `FALHA_APOS_INTEGRACAO`. Não houve nova publicação: após a propagação, a conferência independente com cache-busters e SHA-256 normalizado comprovou 12/12 correspondências para `index.html`, `cliente.html`, `controle.html`, `producao.html`, `pedido.js` e `script.js` nos dois domínios, `https://imposition.ai-ideal.com.br` e `https://imposicao.pages.dev`.

Estado final: **PUBLICADA_E_VERIFICADA**, pela comprovação posterior. Evidência local: [hashes públicos v926](evidencias/pedido-faces-v926-public-verification.json). Este complemento registra a verificação feita depois do commit de publicação. Não houve teste em impressora ou hotfolder físico. O checkout operacional original permanece preservado.
