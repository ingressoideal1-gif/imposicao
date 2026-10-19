# Retirar entregador — 19/10/2026

Implementação local na branch feat/entregas-retirar-20261019, baseada em bb182029 (origin/main). Nenhuma migração remota, retirada real ou publicação executada nesta etapa.

## Uso

No seletor do pedido na lista ou no mapa, ADM com edição pode escolher “Retirar entregador — voltar à lista”. A confirmação cancela a atribuição e limpa a previsão. O filtro passa a Disponíveis. Pedidos em deslocamento exigem confirmar que o pacote está disponível para nova saída; o status retorna de EM TRANSITO para EXPEDICAO. Entregas concluídas não permitem retirada.

## Persistência

A migração nova sql/vibe_entregas_retirar_entregador.sql permite entregador, nome e data de atribuição nulos somente na tabela própria vibe_entregas_registros; preserva o registro e suas tentativas. Adiciona RPC ADM, adapta a consulta de disponíveis, a seleção de pedidos para rota e a reatribuição. Não modifica estrutura de tabelas do ERP. Sua aplicação apenas instala o contrato; retiradas acontecem exclusivamente quando solicitadas pela interface.

A RPC confere permissão de edição, entregador esperado, frete Motoboy, duplicidade de expedição e ausência de conclusão. Usa a ordem de bloqueios das rotas e grava auditoria com autor, pedido e entregador anterior. Remove somente a parada solicitada, preservando ordem, previsão e início das demais; desativa a rota quando vazia. O retorno de EM TRANSITO para EXPEDICAO é restrito a deslocamento iniciado pelo Vibe na rota do entregador esperado. Retirada, atualização de status e auditoria são atômicas.

O PWA do antigo entregador perde acesso ao pedido na próxima atualização; qualquer envio antigo é recusado no servidor. A nova atribuição reutiliza o registro e preserva tentativas anteriores.

## Validação

PGlite: migrações reais com dados sintéticos, acesso ADM, conflito de responsável, conclusão bloqueada, retorno de deslocamento, tentativas preservadas, pedido disponível, acesso antigo negado, rota vazia e reatribuição.
Chromium: opção no seletor, cancelar confirmação, erro sem falso sucesso, retirada confirmada e retorno ao filtro Disponíveis. Regressões de mapa e gestão executadas separadamente. Sintaxe JavaScript e diff check.

## Entrega e recuperação

Publicar frontend/script.js com a migração, após copiar as definições atuais das funções alteradas e conferir constraints. O frontend precisa da nova RPC para executar a opção. Não reaplicar migrações antigas inteiras. Se houver retirada real após ativação, não restaurar NOT NULL antes de resolver atribuições nulas; nenhuma recuperação deve atribuir pedidos arbitrariamente ou apagar tentativas. Preservar registros e auditoria, e coordenar a reversão do frontend e funções.
