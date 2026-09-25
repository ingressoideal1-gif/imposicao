# Entrega segura — recomendações imediatas, 25/09/2026

## Candidato e autorização

Publicação autorizada pelo pedido humano “entrega segura e publicar”. Branch `fix/recomendacoes-imediatas-20260925`, worktree `C:\ProjetosLocais\ideal-imposition-analise-22599`, base `df13d5de` conferida em `origin/main` nesta entrega. Checkout operacional preservado.

Escopo funcional e limites: [execução das recomendações](execucao-2026-09-25-recomendacoes-imediatas.md). Painel **v959**, NewProd **1.2.340**. Referências de cache de `script.js` e `criador-arte.js` atualizadas em Pedido/painel e Produção.

O escopo combina frontend e NewProd. Como o orquestrador `entrega-segura.ps1` não distribui esse conjunto, foi seguido o procedimento específico de release do NewProd, com revisão de escopo, testes, build e comprovação pública; os controles do orquestrador não foram modificados.

## Testes e empacotamento

- 125 testes Python passaram novamente após o versionamento (7,58 s).
- Regressões JavaScript de salvamento e editor passaram; 83 verificações de Corrigir Arte passaram.
- `git diff --check` passou; varredura dos arquivos da entrega pelo módulo `Publicacao.psm1` sem achados impeditivos.
- PyInstaller e WiX existentes; nenhuma dependência instalada. Build em `build/release-1.2.340`, sem excluir os artefatos anteriores. Configuração de build usada sem exibir credenciais; `.env.local` não foi copiado para o worktree. Módulo secreto gerado e pool continuam ignorados pelo Git.
- Executável conferido por leitura do arquivo PyInstaller, sem iniciar agente/serviços: módulos `controle_producao`, `integridade_impressao`, `agent_worker`, `agent_version`, `app`, `engine` e módulo de configuração presentes; constante de versão 1.2.340.
- Bytes de `index.html`, `producao.html`, `script.js` e `criador-arte.js` embutidos idênticos à fonte local. `win32ui.pyd`, MFC e ambas VCRUNTIME presentes na pasta do runtime.
- MSI `dist/NewProd_Setup_v1.2.340.msi`: ProductVersion **1.2.340.0**, **156.176.384 bytes**.
- SHA-256 do MSI: `36b45e82a9c6d05985dfef41ebbd96bf0861958a5e8d4a20c90150250e44bc47`.
- [Evidência do executável](evidencias/imediatas-v959-build.json).

## Sequência de publicação

1. Integrar somente os arquivos revisados e documentos desta tarefa por fast-forward, preservando o checkout operacional.
2. Confirmar Cloudflare Pages e os quatro arquivos alterados nos dois domínios, com cache buster e comparação de hashes normalizados.
3. Publicar o MSI sob nome novo, sem sobrescrever versões anteriores, e comparar tamanho e SHA-256 do download público.
4. Somente após a prova do MSI, ativar `latest.json` e reler o manifesto público com cache buster.
5. Registrar separadamente a versão em execução na estação e o aceite físico. Publicação não comprova esses dois resultados.

## Limites e recuperação

- A contenção de atualização passa a valer depois da instalação da versão 1.2.340. O atualizador da versão antiga ainda executa seu comportamento anterior durante esta transição; efetuar a atualização em momento ocioso.
- A proteção cobre operações ativas do agente, não o ciclo durável inteiro entre requisições/blocos nem o término físico do spool. Ativação atômica do conjunto do painel e recuperação durável permanecem próximas etapas.
- O salvamento ainda pode confirmar o modelo e falhar no espelho comercial; esse caso informa salvamento parcial e exige reabrir o pedido.
- A auditoria de metadados continua pendente por HTTP 401 no acesso de gerenciamento. Nenhuma permissão ou schema foi alterado nesta publicação.
- Rollback do agente requer código apropriado sob versão superior; não há downgrade automático. Não restaurar escrita ampla nem geração permissiva como recuperação.
- A causa específica do incidente 22599 não foi comprovada por PDF/log da ocorrência. Prova operacional da LASER-01 permanece necessária.

## Estado inicial do candidato

Build e validações locais concluídos. A comprovação de publicação será acrescentada após a execução das etapas acima.
