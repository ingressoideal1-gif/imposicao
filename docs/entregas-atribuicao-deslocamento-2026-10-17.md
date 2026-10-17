# Entregas: atribuição e deslocamento (web v1076)

## Fluxo

Cada linha possui seletor de entregador ativo, limitado à empresa do pedido.
A seleção cria a rota ou acrescenta o pedido ao fim da rota planejada existente.
Transferência de pedido pendente atualiza ambas as rotas em uma transação,
preservando versões anteriores, tentativas e auditoria. Um conflito de atribuição
exige atualizar a consulta. Limite de 20 paradas; sem otimização Google nesta etapa.
Rotas em deslocamento e entregas concluídas não podem ser transferidas/editadas.
Ao atribuir novo pedido após todas as entregas concluídas, a rota antiga é arquivada.

Iniciar deslocamento abre previsões manuais por parada pendente (Brasília UTC−03).
As previsões seguem a ordem da rota, entre agora e sete dias. A confirmação grava
as previsões e o início da rota, alterando apenas os pedidos pendentes para o status
já existente no ERP, EM TRANSITO. A tabela exibe Em deslocamento, previsão e data/hora
real da confirmação em colunas separadas. Recebedor e foto continuam disponíveis.
O PWA permite navegar e confirmar pedidos em trânsito; a confirmação grava ENTREGUE
sem apagar a previsão. Ação de início é restrita a ADM com permissão de edição.

## Banco e implantação

Migração nova: sql/vibe_entregas_atribuicao_linha.sql. Acrescenta prevista_em em
vibe_entregas_registros e iniciada_em em vibe_entregas_rotas. Atualiza funções
Vibe e cria RPCs administrativas; nenhuma estrutura de tabela do ERP é alterada.
A implantação não executa atribuição, início de deslocamento nem confirmação real.

Alvo autorizado: Supabase e-deal vwbtitjlpelrcnsytzqw. Prévia somente leitura:
zero rotas/registros Vibe; EM TRANSITO já existe no ERP. Escritas futuras ocorrem
somente pelas ações do ADM: atribuição filtrada por UUID de proposta e usuário;
início filtrado pelo UUID da rota ativa e seus 1–20 pedidos pendentes. Há locks,
checagem de acesso/empresa/status e verificação de linhas persistidas. Falha reverte
toda a transação. Repetição de início não sobrescreve previsões nem horário inicial.

Recuperação: reverter a interface se necessário e suspender as novas ações. Preservar
as colunas e as funções de leitura/entrega que aceitam EM TRANSITO para não bloquear
pedidos já em deslocamento. Não reverter status comerciais automaticamente.

## Validação

- PostgreSQL em memória: atribuição, repetição, transferência, autorização,
  previsões obrigatórias e ordenadas, falha no segundo pedido com rollback integral,
  início idempotente, bloqueio de edição em trânsito, confirmação com foto e horários.
- Navegador: seletor por empresa, conflito sem falso sucesso, ADM somente leitura,
  conclusão bloqueada, previsão manual, início e colunas de previsão/confirmação.
- PWA: estado em trânsito, previsão, navegação, foto, confirmação, offline e saída.
- Sem conta, entrega ou alteração de status real usada como teste.
- Sem MSI ou instalação nas estações nesta etapa.
