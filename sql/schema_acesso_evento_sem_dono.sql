-- O evento pode nascer sem uma conta dona: `dono_auth_id` passa a aceitar nulo.
--
-- ## Por que (04/09/2026)
--
-- Decisão do usuário: "precisamos do acesso no menu ideal control, antes do
-- cliente fazer o acesso pelo pwa". A gráfica passa a criar o evento do pedido
-- para entregar setores, códigos e aparelhos já configurados -- antes de o
-- cliente ter conta, e às vezes antes de o pedido ser impresso.
--
-- Nesse momento não existe conta de cliente para ser a dona. E pendurar o
-- evento na conta do ATENDENTE que estava no telefone seria dar a ele um evento
-- que não é dele.
--
-- O dono, nesse caso, é o CLIENTE, por `id_cliente`. A regra de posse
-- (`pertenceAConta`, em acesso-conta/puro.ts) já aceita as duas formas desde
-- 17/08/2026 -- "a conta que criou, OU qualquer conta ligada àquele cliente" --
-- e o comentário dela diz literalmente "duas portas, e basta uma". A coluna
-- NOT NULL era o resto da época em que só a primeira porta existia.
--
-- ## O que NÃO muda
--
-- O evento que o cliente cria pelo aplicativo continua nascendo com a conta
-- dele em `dono_auth_id`, como sempre. Nenhuma linha existente é alterada.

alter table producao_acesso_eventos
    alter column dono_auth_id drop not null;

-- Conferência: a coluna agora aceita nulo, e nenhuma linha ficou sem dono nem
-- sem cliente (as duas portas fechadas ao mesmo tempo seria um evento órfão).
select
    (select is_nullable from information_schema.columns
      where table_name = 'producao_acesso_eventos' and column_name = 'dono_auth_id') as dono_aceita_nulo,
    (select count(*) from producao_acesso_eventos
      where dono_auth_id is null and id_cliente is null) as eventos_orfaos;
