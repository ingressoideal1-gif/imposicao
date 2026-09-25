# Aprovacao de arte no Link do Cliente: permissao em propostas

## Evidencia em producao (23/09/2026)

- O cliente sem sessao recebeu `permission denied for table propostas` ao tocar em **Aprovar**.
- O portal grava primeiro `pedidos_modelos.status_arte` em `frontend/cliente.js`.
- O gatilho `trg_sync_arte_pendente` de `public.pedidos_modelos` chama `public.atualiza_flag_arte_proposta()` quando a decisao do modelo muda.
- A definicao fornecida do gatilho mostra `UPDATE public.propostas SET em_arte = v_has_arte_pendente` para o pedido antigo e o novo. A funcao pertence a `postgres`, mas roda como `SECURITY INVOKER`.
- A consulta de privilegio confirmou `has_table_privilege('anon', 'public.propostas', 'UPDATE') = false`. A migracao de 22/09 removeu a escrita anonima nessa tabela.
- Os gatilhos `trg_sync_artes_to_proposta_func` e `check_and_promote_proposta` sao `SECURITY DEFINER`, pertencem a `postgres` e tem privilegio de `UPDATE` em `propostas`; nao explicam este erro.

Essa cadeia confirma a falha de permissao quando a decisao de arte altera o status do modelo. Durante o diagnostico nao houve teste de clique nem leitura de linhas de pedidos. O erro do gatilho revertia o `UPDATE` do modelo na mesma instrucao; uma tentativa anterior com erro nao deve ser tratada como aprovada.

## Correcao aplicada

O par `sql/revisao_vibe/20260923_aprovacao_cliente_flag_arte.up.sql` e `.down.sql` altera apenas os atributos de `public.atualiza_flag_arte_proposta()`: `SECURITY DEFINER`, com `search_path = pg_catalog, public`. O corpo, a regra de calculo, os status e os grants das tabelas permanecem iguais. O preflight exigiu proprietario `postgres`, gatilho esperado e `anon` sem `UPDATE` em `propostas`; as assercoes posteriores passaram. O parceiro ainda deve incorporar o SQL ao migrador/versionamento proprio.

O efeito de `SECURITY DEFINER` vale para **todas** as invocacoes desse gatilho, inclusive as do ERP. O gatilho atual grava somente `propostas.em_arte` do `id_int` do modelo alterado; sua seguranca depende das permissoes/RLS de escrita em `pedidos_modelos`, que nao foram mudadas nesta correcao. O preflight aborta se a definicao conhecida, o proprietario ou o numero de gatilhos divergirem.

## Validacao e limites apos aplicacao

1. Confirmado por releitura de catalogo: `atualiza_flag_arte_proposta()` pertence a `postgres`, `prosecdef = true`, `search_path=pg_catalog, public` e o gatilho foi preservado.
2. Confirmado por releitura de privilegios: `anon` continua sem `UPDATE` em `propostas`.
3. O usuario informou que a aprovacao de arte passou no Link do Cliente apos o ajuste. Nao houve releitura independente de `pedidos_modelos.status_arte`, `propostas.em_arte` e `pedidos_artes`.
4. Pedido de alteracao e link invalido/revogado nao foram testados neste incidente. Nao usar pedido real apenas para teste; aprovar arte pode liberar impressao.

## Aplicacao e limites

Em 23/09/2026, o usuario executou o `up.sql` no SQL Editor de producao e informou `Success. No rows returned`. Em consulta independente posterior, todos os valores esperados foram confirmados: proprietario `postgres`, `security_definer = true`, `search_path_fixo = true`, `anon_pode_atualizar_propostas = false` e `gatilho_preservado = true`.

Nao houve deploy do frontend, alteracao de grants de tabela nem aplicacao do rollback. O usuario informou sucesso da aprovacao pelo Link do Cliente depois da instalacao. A releitura independente das linhas do pedido e a incorporacao da migration ao versionamento do ERP permanecem pendentes.
