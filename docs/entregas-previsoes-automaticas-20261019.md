# Previsões automáticas — 19/10/2026

Implementação local, ainda não publicada. Não foi aplicada migração remota nem alterada entrega real. O usuário informou que sua conta não possui permissão para cadastrar segredos no Supabase; isso continua bloqueando a ativação.

## Comportamento

- O ADM abre Iniciar deslocamento; o entregador também pode usar Iniciar minha rota no PWA. O usuário e recebe as previsões calculadas, sem preencher horários. Confirmar a saída calcula novamente e persiste os horários e o início da rota de forma atômica.
- Origem inicial: Rua Felizardo de Farias, 81, Medianeira, Porto Alegre, RS, CEP 90660-130. Mantém a ordem planejada e termina na última entrega, sem acrescentar retorno às estimativas.
- Google Routes, DRIVE e TRAFFIC_AWARE; acrescenta cinco minutos de atendimento entre paradas. Os horários são estimativas, apresentados no horário de Brasília; não há rastreamento GPS contínuo.
- Após cada entrega confirmada, os horários pendentes são invalidados e recalculados a partir do endereço da última entrega. Uma revisão e a lista ordenada das paradas impedem aplicar resultado de uma rota alterada durante a consulta.
- Se Google falhar, a entrega permanece confirmada. O PWA mostra previsões aguardando atualização e tenta novamente na atualização da rota. Não inventa horários como alternativa.

## Arquivos e segurança

- `supabase/functions/vibe-entregas-previsoes/`: autenticação, autorização antes da consulta ao Google, cálculo e persistência via RPC restrita a service_role.
- `sql/vibe_entregas_previsoes_automaticas.sql`: acrescenta três colunas somente em vibe_entregas_rotas e funções de controle. Preserva a estrutura das tabelas ERP; confirmação continua utilizando o contrato existente.
- `frontend/script.js`, `frontend/index.html`: diálogo ADM de previsão automática.
- `frontend/entregas/api.js`, `rotas.js`, `sw.js`: recálculo, recuperação e cache do PWA.
- `ferramentas/configurar_google_routes.ps1`: entrada oculta da chave e token existente protegido por DPAPI; erros mostram etapa e código HTTP, sem valores.

## Validações locais

- PGlite: SQL completo com dados sintéticos; autorização, início, revisão concorrente, confirmação idempotente, invalidação da próxima parada e persistência do recálculo.
- Deno: oito testes com transporte simulado; duração acumulada, resposta incompleta, previsão sem escrita, início, recálculo, autorização, integração desativada, erro Google e conflito.
- Chromium: atribuição e início automático sem campos manuais, erro e reenvio; fluxo móvel existente com próxima parada, foto, rascunho e isolamento.
- API PWA: entrega confirmada preservada durante falha de previsão, indicação pendente e nova tentativa bem-sucedida.
- Sintaxe JavaScript, parser PowerShell e git diff --check.

Não foi validada a chave Google real, cobrança, endereço geocodificado ou integração publicada. Não foram executados testes contra produção.

## Ativação pendente

1. Owner/Administrator cadastra GOOGLE_ROUTES_API_KEY e VIBE_ROUTES_ENABLED=true em Edge Functions > Secrets no e-deal. Não reutilizar a chave de navegador nem colocar a chave de servidor no frontend.
2. Preparar entrega coordenada com revisão/backup dos contratos SQL substituídos, aplicar migração autorizada, publicar Edge Function e frontend/PWA. Não publicar apenas o diálogo: ele exige o novo backend.
3. Validar integração e arquivos públicos sem confirmar entregas fictícias. Fazer primeiro início real acompanhado pelo ADM.

Se a configuração falhar, manter a versão publicada atual. Este documento não comprova publicação ou aplicação da migração.

## Pedido de publicação

Publicação autorizada pelo usuário em 19/10/2026. Conferência somente de nomes pela API de gerenciamento confirmou ausência de GOOGLE_ROUTES_API_KEY e VIBE_ROUTES_ENABLED. Nenhum valor de segredo foi exibido. origin/main permanece em c65767c3 (v1080).

A implantação não foi executada: o novo diálogo exige previsão válida antes de permitir iniciar a rota, portanto publicá-lo sem essa configuração interromperia o fluxo atual. A autorização permanece registrada; a dependência é técnica e de acesso externo, não uma nova solicitação de aprovação. Não aplicar a migração isoladamente: ela invalida as previsões das paradas restantes após confirmar uma entrega.

## Autoatribuição e início pelo entregador

Solicitados e autorizados pelo usuário após o pedido de publicação. Implementação local adicional:

- Aba Disponíveis: somente Motoboy em EXPEDICAO, sem entregador e não concluído. Inclui pedidos devolvidos à lista pelo ADM, preservando tentativas anteriores.
- Assumir entrega: confirma a intenção, atribui apenas a auth.uid(), acrescenta ao fim da própria rota planejada e grava auditoria. Limite de 20 paradas; não permite acrescentar entregas durante rota em deslocamento com pendências. Reenvio da mesma atribuição é idempotente.
- Iniciar minha rota: confirma a saída, chama o cálculo no servidor e muda pedidos para EM TRANSITO atomicamente. O cálculo só é autorizado para ADM ou o dono ativo da rota com acesso às empresas. O RPC interno de início próprio não é exposto a authenticated; é chamado pela persistência restrita ao serviço.
- Migração adicional: sql/vibe_entregas_autoatribuicao.sql, preservando estrutura e status do ERP na atribuição. A migração de previsões incorpora a permissão de início próprio; ambas ainda não aplicadas.
- Testes PGlite cobrem disponibilidade, produção/PAC excluídos, conflito entre entregadores, reenvio, retorno após retirada, rota em trânsito bloqueada e início pelo dono. Chromium cobre aba, confirmação, falha/reenvio de atribuição e início, mantendo os fluxos de foto/rascunho anteriores.

A ativação do conjunto continua bloqueada pela ausência dos segredos Google no servidor; não foi publicado.

## Atualização de implantação — 19/10/2026

Após confirmação do usuário, a consulta de metadados confirmou os dois segredos cadastrados. O backend foi publicado no projeto e-deal: Edge Function vibe-entregas-previsoes e as duas migrações, em transação conjunta. Conferência posterior: três colunas novas presentes, 16 rotas históricas com revisões iniciais e nenhuma rota ativa. Nenhum status de pedido foi alterado pela implantação.

Os quatro contratos anteriores foram salvos em dist/entrega/previsoes-funcoes-antes.json; recuperação das funções em dist/entrega/previsoes-recuperar-funcoes.sql. A recuperação exige também voltar a interface; as colunas adicionais podem permanecer, evitando destruição de histórico. Os artefatos locais não são versionados.

PR #170, cache web v1082 e PWA v8. No momento deste registro a interface aguarda os checks obrigatórios e integração. A presença dos segredos não comprova a validade da chave ou cobrança Google; o primeiro cálculo autenticado real continua sendo a verificação operacional. Não foram registradas entregas fictícias em produção.
