# Dashboard de Arte: modelos e reprovações

Implementação local em `feat/dashboard-modelos-20261031`, baseada no `main`
publicado em v20261057. Migração aplicada em 31/10/2026 às 17:10:16 (America/Sao_Paulo); publicação web em andamento.

## Regras confirmadas

- Pedidos prontos/aprovados e modelos contam identidades únicas no recorte;
  Pronto → Reprovado → Pronto não multiplica o mesmo pedido/modelo.
- Produtos mantém a quantidade de linhas comerciais; Modelos conta os IDs dos
  modelos cadastrados nos pedidos prontos/aprovados do período, sem somar tiragens.
- Removidos o quadro Pedidos com arte pronta e as colunas/cálculos de Tempo médio,
  Mediana e Até 2h. Os relógios da lista operacional permanecem independentes.
- Alteração nas tabelas de designer e atendente conta cada ação de reprovação de
  um pedido no período. Vários modelos do pedido no mesmo lote contam uma vez;
  outra ação posterior soma outra ocorrência. O KPI Em alteração agora continua
  representando a fila atual, explicitamente separado do histórico da coluna.
- Sem reconstrução do passado. A data do início é persistida na implantação e
  exibida no dashboard. Falha de leitura apresenta `--`, nunca zero presumido.

## Persistência

Os botões individuais do painel/portal, o lote, a reprovação administrativa, o
retorno da produção para correção e o modal enviam `reprovacao_acao` (UUID) na própria gravação do status. Todos os
modelos do lote compartilham o UUID. Um trigger insere a ocorrência na mesma
transação, com unicidade `(pedido, acao)`, horário do servidor e nomes de atendente
(`propostas.vendedor`) e designer no momento da decisão. Não é a identidade de
quem clicou. A finalização/consolidação do portal não repete a decisão já gravada
no modelo. Uma falha parcial de lote conta uma ocorrência se algum modelo foi
efetivamente reprovado; um novo clique é outra ação.

O histórico não aceita INSERT/UPDATE/DELETE dos navegadores. A leitura exige
authenticated e visibilidade da proposta pela RLS existente. O trigger não
concede novas permissões para mudar modelos/pedidos. Não há backfill nem alteração
de preços, quantidades comerciais ou status na migração.

O carregador lê até 30 dias com páginas de 500 e cursor de ID, sob o mesmo bloqueio
de desenho das demais fontes do dashboard. Não publica páginas parciais. Filtros
do histórico usam a carteira registrada na ocorrência, inclusive quando o pedido
já saiu da carga operacional. A contagem não depende de permanecer reprovado.

## Implantação preparada

Alvo previsto: Supabase do Ideal Imposition, projeto `vwbtitjlpelrcnsytzqw`.
Migração aplicada com autorização de publicação. Conferência: dois gatilhos ativos, zero ocorrências iniciais, zero UUIDs preenchidos nas linhas existentes, leitura authenticated permitida e escrita direta/anon bloqueadas.

1. Executar `sql/dashboard_arte_reprovacoes_preflight.sql` em leitura. Conferir
   tabelas/colunas e políticas; as duas tabelas novas devem estar ausentes.
2. Aplicar `sql/dashboard_arte_reprovacoes.sql` uma única vez, em transação.
   Impacto: duas colunas UUID nulas nas tabelas existentes, duas tabelas novas,
   dois triggers e políticas de leitura. Insere somente uma linha de início;
   zero ocorrências históricas e zero mudanças de status em pedidos existentes.
3. Executar `sql/dashboard_arte_reprovacoes_verificar.sql`: dois triggers ativos,
   uma data de início, nenhuma duplicidade e nenhuma escrita direta de navegador.
4. Publicar frontend pelo fluxo protegido, incluindo `script.js`, `cliente.js`
   e `dashboard-arte.js`, e verificar os arquivos públicos/cache versionado.
   A migração deve anteceder a publicação: a nova gravação exige a coluna.
5. Recarregar abas antigas e atualizar painéis locais que devam participar.
   Versões antigas e integrações que não enviem o UUID não produzem ocorrências;
   a data de início não comprova a adoção da versão por todas as estações.

Recuperação: voltar ao frontend anterior e executar o script de rollback, que
desativa somente os dois triggers e preserva colunas, data e ocorrências. Não
excluir o histórico. A migração não é destinada a reexecução sobre uma implantação
já existente; para retomar após rollback, revisar e reativar os dois triggers.

Teste de retomada após implantação: em pedido de teste autorizado, reprovar dois
modelos por um lote e confirmar incremento de um; tornar pronto e reprovar de novo
para incremento de mais um; conferir que Pedidos/Modelos continuam únicos.
Este teste não foi realizado em dados reais.

## Validação local

- `dashboard_arte_harness.js`: modelos/pedidos únicos, períodos, filtros,
  repetição de reprovação e histórico sem dependência da fila atual.
- `dashboard_arte_browser_harness.js`: colunas, remoções, indicação do início,
  indisponibilidade e largura móvel de 390 px.
- `dashboard_arte_paginacao_harness.js`: fontes acima de mil registros e
  publicação conjunta da carga, inclusive recuperação de falhas.
- `dashboard_reprovacoes_harness.js`: 1.201 eventos paginados, falha intermediária,
  recuperação e execução do lote real com UUID compartilhado.
- `dashboard_reprovacoes_pglite.cjs`: PostgreSQL em memória, baseline sem backfill,
  múltiplas transações do lote, reincidência, carteira histórica, rollback e RLS.
- `portal_persistencia_harness.js` e `portal_etapas_browser_harness.js`: recibos,
  rejeições, falhas de gravação e fluxo do portal; `acao_em_lote_harness.js`: 84 casos.

PGlite reutilizado de uma instalação existente por `PGLITE_MODULE`, sem instalar
dependências. Os testes usam dados sintéticos e não acessam produção.

Também passaram os testes de persistência/popup de Corrigir Arte, proteção de
modelos impressos e retorno manual de status. As 8/21 falhas anteriores de
`retorno_producao_status_harness.js` foram reproduzidas contra HEAD e resolvidas
no ambiente simulado: inclusão das funções reais de conferência e carga em lote,
Web Crypto e métodos de consulta usados pelo código atual. Nenhuma asserção foi
removida; agora passam os 21 cenários. A suíte completa dos dois canais será
executada pelo fluxo protegido antes do envio da entrega web.
