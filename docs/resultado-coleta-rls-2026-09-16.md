# Resultado da coleta RLS — e-deal / produção

**Atualização:** a revisão 04 foi aplicada em produção em 16/09/2026 às 08:05 -03:00. DELETE direto de anon em pagamentos foi revogado e verificado. Ver `aplicacao-rls-2026-09-16.md`. O restante deste inventário descreve o baseline anterior, com a correção sobre grants de coluna abaixo.

Coleta de 16/09/2026 às 07:14:19 -03:00, lote `20260916T101419582Z-d7541dc6`, PostgreSQL 17.4. Os dois arquivos gerados pelo coletor foram encontrados fora do Git em `C:\ProjetosLocais\auditorias-rls\e-deal`. O snapshot principal passou na validação do analisador; o complemento de buckets tem o mesmo projeto/ambiente e `read_only=true`.

Foram inventariadas 227 relações, 249 policies e 446 funções. Os 1.164 apontamentos automáticos são combinações de objeto/papel/operação e incluem compatibilidade e usos públicos legítimos; **não são 1.164 vulnerabilidades**. O relatório derivado está junto aos snapshots. Não foram lidos registros comerciais, objetos do Storage ou tokens de clientes, nem executadas mutações ou testes de exploração.

## Confirmações positivas

- `imposition_acessos_locais` e `imposition_user_permissions`: sem SELECT/INSERT/UPDATE/DELETE direto para anon e authenticated.
- `catalogo_fontes`: SELECT permitido, escrita direta negada para ambos. Não reaplicar os scripts permissivos antigos.
- `pedidos_links_cliente`: sem acesso direto anon; authenticated mantém SELECT/INSERT/UPDATE, com policy ampla.
- `clientes`: sem acesso direto anon nas operações inspecionadas.
- Schema public: anon e authenticated têm USAGE, mas não CREATE.

Essas conclusões são sobre acesso direto às relações. Não certificam todos os caminhos indiretos por funções, views ou serviços privilegiados.

## Achados prioritários confirmados nos metadados

| Alvo | Configuração coletada | Encaminhamento |
|---|---|---|
| `pagamentos_v2` | No baseline anon tinha SELECT e DELETE; há policy ALL permissiva true. INSERT/UPDATE não são concedidos para a tabela inteira, mas existem grants para 58 colunas, portanto não estavam bloqueados. | DELETE anon revogado pela revisão 04. Permanecem leitura ampla, gravação por coluna e privilégios administrativos, para tratamento coordenado com consumidores. |
| `propostas`, `pedidos_modelos`, `produtos_proposta`, `propostas_chat`, `print_queue`, `producao_numeracoes` | Grants de leitura/escrita anon acompanhados de policies amplas. Policies permissivas adicionais com verificações não neutralizam as amplas. | Restringir após inventário dos consumidores e migração das operações autorizadas; considerar contenção urgente por operação sem uso legítimo, com revisão do ERP. |
| `pedidos_artes` | SELECT e UPDATE anon possuem policies amplas. INSERT/DELETE têm grants, mas não policy permissiva anon encontrada. | Priorizar leitura/alteração; não descrever INSERT/DELETE como já liberados somente por terem grants. |
| `pedidos_bancos`, `pedidos_modelos_banco`, `producao_config`, `producao_produtos_combinaveis` | Quatro tabelas public com RLS desabilitada e grants a papéis de cliente. | Mapear operações e migrar; não ligar RLS sem preparar policies/consumidores. |
| `imposition_fundo_pwa` | DML anon e authenticated com policy ALL true. RPC remover é executável por anon; publicar não é executável por anon, mas é por authenticated. | Fechar tabela, RPCs e escrita de Storage de forma coordenada; só fechar RPCs deixaria o caminho direto aberto. |
| Storage | 12 de 15 buckets são públicos, incluindo artes, boletos, chat-ideal, pdf_fatura e print_jobs. | Classificar conteúdo e consumidores; migrar material sensível para acesso privado. Nenhum arquivo foi listado/aberto. Downloads de versões e recursos públicos legítimos precisam permanecer compatíveis. |

O outro objeto sem RLS apontado foi `realtime.subscription`, fora de public. Não alterar schema gerenciado do Supabase com base nessa triagem; verificar alcance e funcionamento do serviço.

`schemas_api_na_sessao` veio nulo. Isso não comprova ausência nem presença do schema na configuração efetiva da Data API. As conclusões acima descrevem o que os privilégios/policies permitem; não foi feito teste HTTP contra dados reais nem confirmada exploração.

## Mudança proposta para pagamentos

Arquivo: `sql/auditoria_rls/03_pagamentos_sem_delete_anon.proposta.sql`.

- Ambiente: e-deal produção, project ref já confirmado; a aplicação futura deve reconferir a conexão.
- Alvo/filtro: privilégio DELETE do papel anon somente em `public.pagamentos_v2`.
- Linhas comerciais alteradas: zero; atualmente o privilégio amplo pode alcançar as linhas da tabela, sem que esta análise as tenha contado.
- Comportamento desejado: recusar exclusão direta anônima e preservar consultas de pagamentos, papéis authenticated/service_role, cálculos e dados.
- Pré-condições: revisão pelo responsável do ERP, ausência de consumidor legítimo usando DELETE anon, teste em ambiente isolado e snapshot ainda compatível. A busca literal no código deste worktree não encontrou DELETE de pagamentos, o que não cobre sistemas do parceiro, requests dinâmicos ou agentes antigos.
- Segurança de aplicação: transação, timeout, asserções de baseline, marcador de revisão desabilitado por padrão e comparação dos privilégios dos outros papéis. Se o DELETE continuar herdado de PUBLIC/outro papel, a proposta aborta em vez de declarar sucesso.
- Recuperação: rollback transacional em falha antes do commit; após aplicação, corrigir consumidores autorizados. Não reabrir DELETE anon automaticamente.
- Limites: proposta não remove chamadas indiretas de exclusão por RPC privilegiada, outros privilégios administrativos ou o DELETE de authenticated. Essas frentes permanecem na revisão geral.

**Proposta 03 não aplicada:** abortou pela existência dos grants de coluna, antes de REVOKE. A revisão 04 preserva esses grants, passou nos testes e foi aplicada com credencial de escrita válida após o usuário confirmar que a exclusão no ERP exige login. Os recibos e a comparação integral de metadados estão documentados no registro de aplicação.

## Contratos ainda pendentes

Há cinco RPCs de portal no snapshot, incluindo `link_cliente_bancos_modelos`, além das quatro preservadas no planejamento anterior. A quinta também tem consumidor em `frontend/cliente-dados.js` deste worktree e deve ser preservada.

Os gatilhos de produtos_proposta incluem recálculo de proposta e sincronização financeira. Modelos sincronizam estado de arte com briefing/proposta; chat tem normalização de autoria. O snapshot identifica os gatilhos mas não contém seus corpos; não autoriza inferir efeitos completos ou escolher arbitrariamente um briefing. Resolver revisão da arte, vínculo, autoria/visibilidade e idempotência antes das novas mutações do portal.

Próximas evidências: configuração efetiva da Data API/Edge Functions; contratos de funções/triggers em canal restrito; matriz de consumidores do ERP e estações; ambiente isolado para testes SQL. A coleta de produção está concluída, a revisão e a implementação das restrições continuam pendentes.
