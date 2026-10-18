# Vibe Entregas — execução da rota

Implementação local em worktree isolado de origin/main (0635830d).

- Entrada em Minha rota, nome do entregador, sequência atribuída, progresso, próxima parada e navegação externa.
- Atualização ao entrar, voltar ao aplicativo, recuperar conexão, botão manual e intervalo de 60 segundos.
- Todas as páginas de pedidos atribuídos são carregadas antes de ordenar pela rota; histórico mantém paginação.
- Produção fica cinza. Registro disponível em rota iniciada pelo ADM e pedido em trânsito.
- Tentativas continuam pendentes; confirmação bem-sucedida volta às pendências.
- Rascunho em IndexedDB por usuário/pedido, incluindo foto comprimida e identificador da operação. Recuperação exige login e acesso ao pedido. Removido após confirmação ou ao sair. Sem envio automático, sem senha armazenada neste banco local. Aparelhos compartilhados devem encerrar a sessão.
- Cache do PWA v7 inclui o módulo de rascunhos. O navegador ainda pode remover armazenamento local; falhas de gravação são informadas.

## Backend e implantação pendentes

`sql/vibe_entregas_pwa_execucao.sql` é uma migração nova, transacional, preparada e testada somente com dados sintéticos. Altera ve_listar para retornar apenas pedidos atribuídos ao usuário, incluindo produção; bloqueia registrar antes da liberação da rota e revoga autoatribuição/confirmação de sequência pelo entregador. Preserva autorização por empresa, comprovante privado e idempotência. Não altera tabelas nem registros do ERP.

Aplicar essa migração e publicar o frontend juntos. Para reversão, restaurar as definições anteriores de ve_listar e ve_registrar de vibe_entregas_atribuicao_linha.sql e os grants anteriores das duas funções, preservando as demais funções e tabelas. Não executar novamente a migração antiga inteira.

Nenhuma publicação ou alteração remota foi realizada nesta etapa.

## Validação

- Chromium móvel, serviços simulados: ordem atribuída, destaque da próxima parada, bloqueio de produção/rota planejada, foto obrigatória, recuperação após recarregar, isolamento dos rascunhos, falha/reenvio, avanço e limpeza ao sair.
- PGlite: migrações reais em memória, isolamento de entregadores, retirada/planejamento revogados, produção visível e registro condicionado à rota iniciada; regressões anteriores preservadas.
- Adaptador API: upload, confirmação persistida, falhas e hash do reenvio.
- Sintaxe JavaScript e git diff --check.

## Preparação da entrega segura

Definições de produção de ve_listar e ve_registrar conferidas com a base revisada. Cópia das quatro funções e permissões em dist/entrega/pwa-funcoes-antes.json e rollback executável em dist/entrega/pwa-rollback.sql (artefatos locais, fora do Git). Aplicação remota não modifica registros comerciais. Publicação pelo PR protegido; comprovação dos sete assets alterados do PWA nos dois domínios após o merge. Cache próprio vibe-entregas-v7; o painel principal permanece na versão atual.
