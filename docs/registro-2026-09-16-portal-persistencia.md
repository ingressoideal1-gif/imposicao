# Portal do cliente: persistência e finalização

## Execução autorizada em 16/09/2026

Após a preparação abaixo, o usuário autorizou `executar`.

- A integração SQL passou em PostgreSQL 18.3/PGlite 0.5.8, em memória. A biblioteca foi instalada somente no diretório temporário da tarefa, com scripts de instalação desabilitados; nenhuma dependência/lockfile do projeto ou serviço Windows foi alterado. Executor: `tests/portal_persistencia_pglite.cjs`, reutilizando o SQL de teste sem retirar sua proteção de destino.
- O destino foi confirmado pela CLI existente: Supabase `e-deal`, projeto `vwbtitjlpelrcnsytzqw`, PostgreSQL 17.4. Inspeção de catálogos, tipos, restrições e triggers; leitura de contagens agregadas, sem exportar pedidos ou dados de clientes. O teste foi ajustado para usar UUID em `pedidos_artes.id`, como no destino, e repetido com sucesso.
- O token antigo de configuração retornou `Unauthorized`; a sessão já autenticada da CLI permitiu a operação, sem trocar credenciais ou exibi-las.
- Aplicado `sql/link_cliente_finalizar.sql`: uma função nova e seus grants, em transação. **Zero pedidos alterados e nenhuma mensagem enviada pela migração.**
- Verificação posterior: corpo instalado idêntico ao arquivo local, MD5 `a950d4ceb0a6f1754124d92a398a6277`; `SECURITY DEFINER`; `search_path=pg_catalog, public`; execução permitida a `anon`/`authenticated`, sem grant a `PUBLIC`. Chamada negativa como `anon` com número/token deliberadamente inexistentes foi recusada, dentro de transação encerrada por rollback.
- Publicação do frontend: próxima etapa, após registrar separadamente a entrega de banco. O fluxo `entrega-segura.ps1` não admite escopo misto; nenhum SQL será executado por esse fluxo.

As seções seguintes registram a preparação anterior à autorização. As pendências de ambiente SQL ali descritas foram resolvidas acima.

## Preparação local

Preparação inicial em 16/09/2026, antes da autorização de implantação.

## Local de trabalho e recuperação

- Worktree: `C:\ProjetosLocais\ideal-imposition-portal-persistencia`.
- Branch: `fix/portal-persistencia-finalizacao`.
- Base disponível: `origin/main`, commit `011f9de7` (v883). Não houve fetch nesta tarefa.
- O checkout operacional `C:\ProjetosLocais\ideal-imposition` permaneceu intacto, incluindo suas alterações preexistentes. A correção está somente no worktree.
- Não foram feitos commit, push, PR ou deploy. O diff contra a base contém a preparação revisável; não misturar com o checkout operacional antigo.

## Defeito reproduzido

`saveAmostraToDB` aceitava `data: []` e alterava a memória como se o modelo tivesse sido aprovado. O teste novo falhou antes da mudança com `Missing expected rejection`.

`finalizarNoPortal` tentava gravar chat/status mesmo após falha na conferência, enviava `APROVADO` para o link/OS em casos de `Corrigir Dados` e marcava a tela como finalizada antes de confirmar o conjunto das escritas.

## Mudanças

- `frontend/cliente.js`: aprovação exige exatamente um modelo retornado, filtrado por `id + id_int`, com os campos esperados; banco ausente, modelo virtual, resultado vazio ou divergente interrompem o avanço. O status persistido do modelo vence o espelho de versões antigas da arte.
- A consolidação do pedido confirma os ids e status retornados; confirmar Entrega/Nota também compara os campos escritos e exige recibo no INSERT. Observações são copiadas antes de alteração, sem modificar o objeto lido quando a escrita falha.
- Aprovação de todos os modelos aguarda todas as respostas, inclusive em falha parcial, e impede concorrência local com decisões/finalização. Uma aprovação individual já persistida não é desfeita automaticamente caso outra falhe; a interface não avança e permite nova tentativa.
- `frontend/cliente-confirmacoes.js`: finalização usa uma RPC; somente um recibo completo e compatível altera o estado final. Falha mantém possibilidade de tentar novamente. Texto sem salvar impede finalização; editar uma correção salva reabre a finalização. Correções mostram a pendência de atendimento, sem mensagem de aprovação total.
- `sql/link_cliente_finalizar.sql`: nova função aditiva, sem substituir RPCs existentes ou abrir tabelas ao `anon`. Valida link ativo, modelos efetivamente aprovados e decisões persistidas de Entrega/Nota. Compara o pedido recebido na tela com as decisões atuais; `ALTERADO` exige nova conferência. Verifica a exigência de recebedor reutilizando a resolução de dados de `link_cliente_pedido`.
- A RPC prepara status do pedido, link, OS local quando existente, marcador de finalização e mensagem de chat na mesma transação. Falhas de escrita não são engolidas. Repetição com o mesmo marcador/status não insere novamente o chat. Preserva observações individuais das linhas de arte e não altera status dos modelos nem campos financeiros.

## Validação executada

Dados sintéticos e respostas simuladas; nenhuma chamada real ao Supabase.

| Harness Node | Resultado |
|---|---:|
| `portal_persistencia_harness.js` | 35 cenários |
| `portal_abas_harness.js` | 146 verificações |
| `portal_dados_harness.js` | 132 verificações |
| `portal_confirmacoes_harness.js` | 143 verificações |
| `portal_orcamento_harness.js` | 108 verificações |
| `correcao_do_cliente_harness.js` | 45 verificações |
| `portal_pendencia_harness.js` | 51 verificações |
| `status_pedidos_artes_harness.js` | 22 casos |
| `link_do_cliente_harness.js` | 23 verificações |
| `link_do_pedido_harness.js` | 59 verificações |

Total: **764 casos/verificações aprovados**, incluindo 35 cenários novos. Sintaxe dos dois JS alterados, sintaxe do wrapper Python e `git diff --check`: aprovados.

O harness novo está incluído em `tests/test_harnesses_do_portal.py`. A suíte pytest não foi executada: o Python disponível não tem pytest e o venv operacional não está disponível. Não foram instaladas dependências.

Verificação adicional `regras_de_bloqueio_harness.js`: falha preexistente do extrator, `nao achei o fim da const STATUS_CORRIGIR_ARTE`. Ele busca literalmente `;\n`, mas o `script.js` do checkout usa CRLF. `frontend/script.js` e esse teste estão idênticos a `origin/main`; não foram alterados para contornar a falha.

## Pendências antes de publicar

1. **Executar a integração SQL em PostgreSQL local descartável.** `tests/portal_persistencia_sql.sql` prepara dados sintéticos e cobre token inválido/inativo, decisões incompletas, modelo reprovado, `ALTERADO`, texto não salvo, aprovação, correção em OS local, repetição e rollback quando o chat falha. Recusa banco com nome diferente de `portal_persistencia_teste`, conexão não local e tabela de links preexistente. Requer instância descartável, banco vazio e permissões para criar roles. **Não executado:** `psql`, `postgres`, `pg_ctl` e Docker não estão disponíveis neste ambiente. O script não deve ser usado no Supabase.
2. Confirmar esquema, tipos, triggers e permissões do ambiente de destino antes de aprovar a migração aditiva. O SQL local é uma proposta revisável, não prova de execução ou compatibilidade com o banco remoto.
3. Com autorização específica, aplicar primeiro `sql/link_cliente_finalizar.sql`. O frontend novo não tem fallback para a finalização antiga: sem a RPC, mostra falha e permite tentar novamente, sem fingir sucesso.
4. Depois de validar a RPC, versionar/publicar os assets pelo fluxo Cloudflare e verificar os arquivos públicos. Não atualizar o frontend antecipadamente.
5. Validar abertura/reabertura e ações reais somente no ambiente autorizado. Testes simulados não comprovam regras RLS remotas, triggers, recebimento de notificações ou entrega pública.

## Limites e recuperação de implantação

- A transação proposta cobre a finalização; aprovações individuais e decisões de Entrega/Nota continuam operações próprias. Não houve migração completa dessas operações para RPC nem revisão global de RLS.
- Os bloqueios da RPC protegem as linhas existentes durante sua transação e serializam finalizações do mesmo link. Inserção concorrente de novos modelos por outros sistemas e escritores externos que mudam dados depois do commit exigem coordenação adicional entre escritores; não foram testados em duas conexões nesta tarefa.
- O envio real de chat passa a integrar a transação da finalização. Portanto, uma falha no chat impede confirmar o conjunto, em vez de declarar sucesso parcial.
- Para reverter uma implantação futura, restaurar primeiro os assets anteriores; somente depois avaliar a remoção da nova função. A remoção da função não desfaz aprovações ou correções já confirmadas. Não executar rollback de dados de clientes automaticamente.
