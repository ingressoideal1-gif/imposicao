-- ══════════════════════════════════════════════════════════════════════════════
-- IDEAL CONTROL — a conta do cliente, ligada ao cliente do ERP
-- Prefixo: producao_acesso_
-- Banco: vwbtitjlpelrcnsytzqw.supabase.co
-- Data: 2026-08-17
-- Spec: docs/superpowers/specs/2026-08-17-ideal-control-conta-do-cliente-design.md
-- ══════════════════════════════════════════════════════════════════════════════
--
-- O QUE ESTE ARQUIVO FAZ
--
--   Cria UMA tabela e UMA funcao. Nao mexe em `clientes` nem em `auth.users`.
--   Pode ser rodado mais de uma vez.
--
--   Supabase -> SQL Editor -> cole tudo -> Run. Ou:
--   .\ferramentas\rodar_sql.ps1 sql\schema_acesso_contas.sql
--
-- POR QUE ELE EXISTE
--
--   Ate 17/08/2026 nao havia conta de cliente nenhuma: as 25 contas do projeto
--   sao a equipe do ERP. E o banco nao tinha coluna ligando conta a cliente.
--   A grafica passa a liberar o acesso do cliente com uma senha provisoria, e
--   esta tabela e o unico lugar que sabe QUAL conta e de QUAL cliente.
--
-- POR QUE A CHAVE E O PAR (conta, cliente)
--
--   Uma conta pode servir a mais de um cliente (a conta de teste da grafica) e
--   um cliente pode ter mais de uma pessoa com acesso. O caso comum e 1:1; a
--   chave composta so nao proibe o resto.
--
-- POR QUE `criada_aqui`
--
--   A grafica so redefine a senha de conta que ELA criou. Um e-mail que ja tinha
--   conta (um funcionario, alguem de outro cliente) e apenas LIGADO ao cliente,
--   e a senha dele fica em paz. Sem esta coluna nao daria para saber a
--   diferenca depois.
--
-- POR QUE `senha_provisoria_em`
--
--   Enquanto estiver preenchida, o aplicativo nao passa da tela "Escolha a sua
--   senha". Vira nula quando o cliente troca. "Nova senha provisoria" a preenche
--   de novo.
--
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS producao_acesso_contas (
    auth_user_id        UUID        NOT NULL,          -- auth.users.id
    id_cliente          INTEGER     NOT NULL,          -- clientes.id_cliente
    email               TEXT        NOT NULL,          -- copia, so para a tela
    criada_aqui         BOOLEAN     NOT NULL DEFAULT false,
    senha_provisoria_em TIMESTAMPTZ,                   -- nulo = ja trocou
    criado_por          UUID,                          -- quem liberou (auth.users.id)
    criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
    ativo               BOOLEAN     NOT NULL DEFAULT true,
    PRIMARY KEY (auth_user_id, id_cliente)
);

CREATE INDEX IF NOT EXISTS idx_acesso_contas_cliente
    ON producao_acesso_contas (id_cliente);

-- RLS ligado e NENHUMA politica: com a chave anonima nao se le nem se escreve
-- uma linha. So a service_role das Edge Functions passa.
ALTER TABLE producao_acesso_contas ENABLE ROW LEVEL SECURITY;

-- A conta pelo e-mail. `auth.users` nao esta exposta ao PostgREST, e a admin
-- API do GoTrue nao filtra por e-mail. Esta funcao e o unico caminho, e ela
-- devolve SO o id: nada mais de `auth.users` sai por aqui.
CREATE OR REPLACE FUNCTION public.acesso_usuario_por_email(p_email text)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
    SELECT id FROM auth.users
     WHERE lower(email) = lower(trim(p_email))
     ORDER BY created_at ASC
     LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.acesso_usuario_por_email(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acesso_usuario_por_email(text) FROM anon;
REVOKE ALL ON FUNCTION public.acesso_usuario_por_email(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.acesso_usuario_por_email(text) TO service_role;

-- ══════════════════════════════════════════════════════════════════════════════
-- COMO DESFAZER
-- ══════════════════════════════════════════════════════════════════════════════
--
--   DROP FUNCTION IF EXISTS public.acesso_usuario_por_email(text);
--   DROP TABLE IF EXISTS producao_acesso_contas;
--
-- ══════════════════════════════════════════════════════════════════════════════
