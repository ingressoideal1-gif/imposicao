# Montagem: reposição manual e planejamento simplificado

Alteração local na branch `codex/montagem-simplificada`, baseada em `291ca90c` (origin/main disponível na sessão). Checkout: `C:/ProjetosLocais/ideal-imposition-montagem-simplificada`.

## Diagnóstico e correção

O seletor múltiplo marcava modelos, mas `_mtgAplicarModelosMarcadosDaMontagem` definia o primeiro como alvo das posições. O seletor individual existente estava oculto, impedindo escolher claramente outro alvo na reposição manual.

Em Reposição manual, o seletor individual agora fica visível, com pedido, modelo, nome, quantidade e indicação de verso. Escolha o modelo, digite posições e adicione; escolha outro modelo e repita. As células anteriores permanecem na folha. O seletor múltiplo continua disponível no planejamento.

O planejamento exibe um plano recomendado. Ajustes de montagens/repetições, conferência de produção por modelo e alternativas ficam em seções expansíveis. Os cálculos, filtros de elegibilidade e regras de compatibilidade não foram alterados.

## Validação

- Sintaxe JavaScript e `git diff --check`: aprovados.
- Núcleo: 3.569 verificações aprovadas.
- Navegador com dados sintéticos: 249 verificações aprovadas, incluindo seleção manual entre pedidos/modelos, preservação das posições e bloqueio de incompatibilidade.
- Puppeteer reutilizado da instalação em `ideal-imposition-atualizado-20260919` via NODE_PATH; nenhuma dependência instalada.

Arquivos: `frontend/index.html`, `frontend/montagem.js`, `frontend/style.css`, `tests/montagem_tela_harness.js` e este registro.

Publicação autorizada pelo usuário em 19/09/2026. Simulação do fluxo `entrega-segura.ps1` aprovada para v908, com integração direta em origin/main e hospedagem Cloudflare Pages. Referências de montagem.js e style.css serão atualizadas; cliente.html e producao.html recebem apenas a nova versão do CSS compartilhado. A comprovação pública deve comparar os hashes dos arquivos entregues após a propagação.

Sem acesso ao banco ou impressão física. A cópia operacional com alterações preexistentes permanece preservada. Recuperação: identificar o commit pela tag v908 e preparar reversão apenas desta entrega a partir da main atual; não restaurar o checkout operacional antigo sobre produção.
