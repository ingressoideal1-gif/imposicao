# Validação isolada — bloquear DELETE anon em pagamentos

**Atualização após acesso de escrita:** a revisão 03 abortou em produção antes de qualquer revogação porque o baseline possui INSERT/UPDATE por coluna. A revisão 04 preserva esses ACLs e foi aplicada. O harness atual executa a revisão 04: nove cenários aprovados em PostgreSQL 17.5, incluindo UPDATE sintético por coluna preservado e DELETE negado. Oito cenários abaixo são o registro histórico da revisão 03; não equivalem ao cenário completo observado em produção. Ver `aplicacao-rls-2026-09-16.md`.

## Resultado

A proposta `sql/auditoria_rls/03_pagamentos_sem_delete_anon.proposta.sql` foi executada integralmente em PostgreSQL embarcado, em memória, com três pagamentos sintéticos. **Oito cenários passaram em PostgreSQL 17.5 e, adicionalmente, em PostgreSQL 18.3.** Produção foi identificada pela coleta como 17.4; a validação cobre a mesma versão principal, não o mesmo patch nem a infraestrutura Supabase/PostgREST.

Antes da proposta, DELETE executado como anon removeu um registro sintético dentro de uma transação revertida. Depois da proposta, a mesma operação foi recusada com SQLSTATE `42501`. O SELECT de `id_int,status`, excluindo CANCELADO, continuou devolvendo os registros esperados. Nenhum registro real foi utilizado.

## Cenários executados

1. Reproduzir a exclusão anônima antes; recusá-la depois; comparar dados, policies e privilégios dos demais papéis; comprovar SELECT anon e DELETE authenticated/service_role em transações revertidas.
2. Recusar a aplicação sem o marcador explícito de revisão.
3. Abortar quando DELETE permanece herdado de PUBLIC e comprovar a restauração do grant direto após rollback.
4. Abortar quando DELETE é herdado de outro papel, também preservando o grant original.
5. Recusar baseline divergente com UPDATE concedido apenas na coluna status.
6. Recusar tabela com RLS desabilitada.
7. Recusar anon com BYPASSRLS.
8. Recusar reaplicação sobre baseline já alterado, sem reabrir DELETE anon.

O teste não modifica a proposta para fazê-la passar. Executa o arquivo SQL completo. Os bancos são criados e encerrados em memória; não há socket, URL de banco, credencial, dump ou conexão com Supabase. O setup sintético utiliza roles, grants e uma policy permissiva representativos do problema; não reproduz triggers financeiros, volumes, concorrência multissessão ou todos os consumidores do ERP.

## Dependência temporária autorizada

O usuário autorizou a instalação temporária de PGlite fora do projeto. Foram instaladas versões fixas com `--ignore-scripts --no-audit --no-fund --save-exact`; nenhum package.json/lockfile do repositório foi alterado.

| Pacote | PostgreSQL observado | Pasta temporária |
|---|---|---|
| `@electric-sql/pglite@0.3.14` | 17.5 | `C:\Users\Junior\AppData\Local\Temp\ideal-rls-pglite17-0ff9758e1c9f44e183de06fc850b58f6` |
| `@electric-sql/pglite@0.5.8` | 18.3 | `C:\Users\Junior\AppData\Local\Temp\ideal-rls-pglite-d4d58376be65432a8f7840b235a4c7f7` |

Reprodução enquanto o pacote temporário estiver disponível:

```powershell
node tests/pagamentos_rls_postgres.mjs 'C:\Users\Junior\AppData\Local\Temp\ideal-rls-pglite17-0ff9758e1c9f44e183de06fc850b58f6\node_modules\@electric-sql\pglite\dist\index.js'
```

O harness aceita somente um caminho absoluto para o módulo local. Não instala dependência automaticamente. Se a pasta temporária não existir mais, providenciar novamente a dependência dentro da autorização aplicável.

## Consumidores conferidos

- Worktree `security/rls-auditoria-20260916`, base `011f9de7`: `frontend/script.js`, função `carregarPagamentosGlobais`, consulta SELECT direto de `id_int,status` com exclusão de CANCELADO. O privilégio SELECT permanece.
- `sql/link_cliente_pedido.sql`: a RPC monta as cobranças do pedido por SELECT. A proposta não altera a função ou seus privilégios.
- Checkout operacional com alterações preexistentes: `_compartilhado/propostas.ts` consulta pagamentos por GET, com projeção de `id_int,status`. Nenhuma alteração desse checkout foi incorporada ao worktree ou modificada por esta tarefa.
- As buscas por `pagamentos_v2` nas fontes operacionais inspecionadas não encontraram exclusão. Isso não cobre nomes construídos dinamicamente, versões antigas instaladas, código do parceiro ou todas as funções instaladas no banco.
- `node tests/pagamento_do_pedido_harness.js`: **42 verificações aprovadas**, usando o código do worktree e dados sintéticos. Não equivale a teste no navegador publicado ou no Supabase real.

## Dependência de aplicação resolvida

A validação isolada foi complementada pela revisão 04. O usuário confirmou que a exclusão de pagamentos no ERP exige login; a dependência foi resolvida e o marcador habilitado somente para a aplicação autorizada. A comparação pós-aplicação confirmou apenas a remoção do grant DELETE de anon.

A proposta é deliberadamente estreita: retira somente DELETE direto de anon na tabela, sem mexer em SELECT, policies, demais papéis ou dados comerciais. Não elimina exclusões que uma RPC SECURITY DEFINER ou serviço privilegiado eventualmente autorize, nem outros privilégios administrativos. Esses caminhos permanecem no plano geral de segurança.

Antes de aplicação por canal autorizado de escrita: reconferir projeto e baseline, registrar revisão dos consumidores e executar a transação exata. Depois, verificar os grants e o funcionamento da leitura; nunca testar DELETE contra pagamentos reais. Uma falha anterior ao COMMIT reverte a mudança; nenhuma recuperação automática deve devolver DELETE a anon.

Documentação técnica do ambiente isolado: [PGlite](https://pglite.dev/docs/about) e [API de execução](https://pglite.dev/docs/api).
