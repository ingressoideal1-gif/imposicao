# Aplicação de restrição RLS/ACL — e-deal

Em 16/09/2026 às 08:05 -03:00 foi aplicada em produção (`vwbtitjlpelrcnsytzqw`) a revisão `sql/auditoria_rls/04_pagamentos_sem_delete_anon.sql`. Efeito único: `REVOKE DELETE ON TABLE public.pagamentos_v2 FROM anon`. Nenhuma linha de negócio foi modificada. Não houve deploy de frontend ou agente.

## Autorização, compatibilidade e validação

O usuário autorizou concluir o trabalho e confirmou que excluir pagamentos no ERP exige login. No código inspecionado, pagamentos são lidos pelo painel e pelo portal. O novo token protegido por DPAPI funcionou para leitura e escrita, sem exposição do segredo. A API usa `supabase_read_only_user` em leitura e `postgres` no canal de escrita.

Nove cenários PostgreSQL 17.5 em memória passaram, incluindo exclusão anon antes/depois, preservação de dados/policies/grants de outros papéis, preservação de grants de coluna, recusa de permissões inesperadas, herança via PUBLIC/grupo, RLS desligada, BYPASSRLS e reaplicação. Harness HTTP simulado cobriu prévia sem acesso, aplicação, projeto incorreto, falha no envio e pós-verificação divergente. Os testes não usam pagamentos reais.

A revisão 03 foi tentada e abortou antes de REVOKE: pressupunha ausência de INSERT/UPDATE por coluna. O relatório anterior confundiu ausência de grant da tabela inteira com ausência de privilégios efetivos nessas operações. O coletor e o analisador já registravam corretamente grants de coluna; o erro estava na interpretação e na proposta. Há 58 colunas com INSERT/UPDATE para anon. A revisão 03 foi preservada; a revisão 04 usa asserções de tabela e compara os ACLs de coluna antes/depois para preservá-los. Não reaplicar a revisão 03.

## Evidências e resultado

Arquivos em `C:\ProjetosLocais\auditorias-rls\e-deal`, fora do Git:

- Baseline imediato: `20260916T110454918Z-1c154c13-metadados.json` e complemento de buckets.
- Intenção/resultado: prefixo `20260916T110500228Z-c30896adc2e342bd86ce4bc97f2576c2`, sufixos `-intencao-pagamentos.json` e `-resultado-pagamentos.json`.
- Coleta posterior: `20260916T110523216Z-defee75c-metadados.json` e complemento de buckets.
- SHA-256 do SQL aplicado: `F38BCEF9588799ECFA6220E1A5443A7AE9E82F849EEE263962A87A22CE27D441`.

A comparação de todas as seções, exceto horário/contexto de coleta, mostrou mudança somente em `acessos` e `acl_tabelas`: a retirada de DELETE de anon em pagamentos. ACLs de coluna, policies, funções, triggers, relações e os demais grants ficaram idênticos. Conferência independente após COMMIT: anon SELECT=true, DELETE=false; authenticated DELETE=true; service_role DELETE=true.

Isso comprova o estado dos privilégios e limita o impacto esperado. Não é comprovação de uso completo no navegador, ERP ou estações. Não foi enviado DELETE a dados reais para testar.

## Recuperação

As verificações estão dentro de transação com limites de lock/execução. Falha antes de COMMIT aborta a mudança. Se houver falha HTTP após envio, consultar metadados antes de repetir; o aplicador não repete nem reabre o grant automaticamente. Depois de aplicado, corrigir eventual consumidor autorizado para usar sua identidade autenticada. Não devolver DELETE a anon como recuperação automática.

## Plano restante e impedimentos concretos

Esta aplicação fecha um caminho de exclusão; não encerra a adequação RLS do projeto.

| Prioridade | Domínio | Trabalho necessário antes do fechamento |
|---|---|---|
| 1 | Pagamentos | Mapear criação/alteração e RPCs do ERP; restringir INSERT/UPDATE por coluna, leitura sensível e privilégios administrativos de clientes. Login para excluir, confirmado pelo usuário, não prova o contrato de todos esses caminhos. |
| 1 | Pedidos, modelos, artes e chat | Substituir os acessos diretos do portal por operações que validem link, pedido, modelo, autoria e revisão da arte no servidor; preservar sincronizações e financeiro. |
| 1 | Boletos, faturas, artes, chat e impressão no Storage | Identificar links/consumidores; migrar arquivos sensíveis para acesso privado/autorizado sem quebrar documentos já enviados. Buckets de distribuição pública precisam de tratamento separado. |
| 2 | Quatro tabelas public sem RLS | Mapear leitores/escritores e preparar policies antes de habilitar RLS. Não confundir objetos gerenciados do Supabase com tabelas da aplicação. |
| 2 | Fundo PWA, RPCs e views | Publicar rotas compatíveis para consumidores ainda diretos, revisar funções privilegiadas e remover os caminhos que contornam a autorização. |

O usuário confirmou que não há acesso ao código do ERP. O código disponível não cobre todos os consumidores ERP/Vibe nem comprova versões instaladas das estações. É necessário coordenar com o mantenedor uma matriz de operações/identidades e validação dos fluxos afetados; não é uma nova solicitação de permissão ao usuário. Contratos históricos pendentes incluem revisão persistida da arte, vínculo inequívoco com briefing, origem/visibilidade do chat e idempotência. A autorização humana já existe; faltam evidências de integração e contratos para fechar os demais acessos sem mudar a usabilidade.
