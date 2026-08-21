-- ════════════════════════════════════════════════════════════════════════════════
-- SQL MIGRATION: Painel do Acabamento
-- Execute no SQL Editor do Supabase — o arquivo inteiro, de uma vez
-- ════════════════════════════════════════════════════════════════════════════════
--
-- POR QUE
-- O setor de acabamento recebe o material depois da imposicao e da impressao, e
-- ate agora nao tinha tela nenhuma: acompanhava pelo Painel de Producao, que e a
-- tela de quem imprime — cheia de seletor de numeracao, campo de quantidade e
-- botao de imprimir que o acabamento nao pode tocar.
--
-- O Painel do Acabamento e a mesma lista, somente leitura, com duas escolhas
-- novas por modelo: em que ponto do acabamento ele esta, e quem e o responsavel.
-- Esta migracao cria o lugar onde essas duas escolhas moram, a lista de nomes que
-- alimenta o segundo seletor, e a permissao do menu novo.
--
-- Sao tres blocos independentes. Rodar o arquivo duas vezes nao faz mal: tudo
-- aqui e IF NOT EXISTS ou OR REPLACE.

-- ─── 1. Onde o acabamento de cada modelo fica gravado ───────────────────────
--
-- Duas colunas em `pedidos_modelos` — tabela NOSSA (prefixo `pedidos_`), nao do
-- parceiro. E a mesma tabela que o `loadOSItens` le e que o painel ja escreve
-- quando muda o `status_impressao`.
--
-- O status do acabamento e um campo SEPARADO do `status_impressao`, de proposito.
-- Sao dois setores, com dois vocabularios: a impressao anda em
-- Aguardando/Parcial/Impresso/Revisao, e o acabamento em
-- Impresso/Em acabamento/Revisado. Espremer os dois na mesma coluna faria uma
-- tela mentir sobre a outra — e mexeria no que ja esta aprovado e rodando na
-- grafica.
--
-- NULO = o acabamento deste modelo ainda nao comecou. A tela mostra "— Status —"
-- e nao inventa um estagio que ninguem marcou.

ALTER TABLE pedidos_modelos
ADD COLUMN IF NOT EXISTS acabamento_status       TEXT,
ADD COLUMN IF NOT EXISTS acabamento_responsavel  TEXT;

COMMENT ON COLUMN pedidos_modelos.acabamento_status IS
    'Estagio do modelo no setor de acabamento: Impresso, Em acabamento ou Revisado. NULL = ainda nao comecou. Nao se confunde com status_impressao, que e do setor de impressao.';

COMMENT ON COLUMN pedidos_modelos.acabamento_responsavel IS
    'Nome do operador responsavel pelo acabamento deste modelo, escolhido na lista de acessos locais (view imposition_operadores).';


-- ─── 2. A lista de nomes que o seletor de responsavel usa ───────────────────
--
-- O responsavel e escolhido entre os operadores de acesso local da grafica — as
-- pessoas cadastradas em Usuarios -> "Acesso Local — NewProd".
--
-- Essa tabela NAO pode ser lida pelo painel diretamente, e isso e proposital:
-- ela guarda os codigos de seis caracteres em texto claro, e cada um destranca
-- uma estacao. Por isso `sql/rls_passo3_fechar_leitura.sql` revogou tudo das
-- chaves publicas, e por isso a rota `/api/acessos-locais` da Edge Function
-- exige o modulo Usuarios inclusive para LER.
--
-- Um operador do acabamento nao tem o modulo Usuarios. Na estacao da grafica ele
-- nem sessao do Supabase tem — entra so pelo codigo local. Se o seletor
-- dependesse daquela rota, ele nasceria vazio nas duas situacoes.
--
-- Esta view e a resposta minima: nome, papel e se esta ativo. O `codigo` e as
-- `permissoes` NAO estao aqui, e nao devem entrar nunca — quem precisar deles
-- continua passando pela rota protegida.
--
-- A view roda com os privilegios do DONO (security_invoker fica no padrao,
-- que e false), e e isso que a faz atravessar o RLS da tabela de baixo sem
-- reabrir a tabela para ninguem.

CREATE OR REPLACE VIEW public.imposition_operadores AS
SELECT
    id,
    nome,
    role,
    ativo
FROM public.imposition_acessos_locais;

COMMENT ON VIEW public.imposition_operadores IS
    'Somente os NOMES dos acessos locais, para o seletor de responsavel do Painel do Acabamento. Nunca expor codigo nem permissoes aqui: a tabela de baixo esta fechada para as chaves publicas justamente por causa deles.';

-- REVOKE antes de GRANT: o Supabase concede GRANT ALL ao papel `authenticated`
-- por privilegio padrao do esquema, e um GRANT depois disso nao restringe nada —
-- os privilegios se somam. Ver docs/REGRAS_BANCO.md.
REVOKE ALL ON public.imposition_operadores FROM anon;
REVOKE ALL ON public.imposition_operadores FROM authenticated;
GRANT SELECT ON public.imposition_operadores TO anon;
GRANT SELECT ON public.imposition_operadores TO authenticated;
GRANT ALL    ON public.imposition_operadores TO service_role;


-- ─── 3. A permissao do menu novo ────────────────────────────────────────────
--
-- `imposition_user_permissions` tem UMA COLUNA POR PERMISSAO. Enviar uma coluna
-- que nao existe faz o PostgREST recusar a gravacao INTEIRA com 400 — ou seja,
-- publicar o painel com `perm_acabamento_view` no corpo ANTES de rodar este
-- bloco quebraria a tela de Usuarios por completo. Rode o SQL primeiro.

ALTER TABLE public.imposition_user_permissions
ADD COLUMN IF NOT EXISTS perm_acabamento_view  BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS perm_acabamento_edit  BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.imposition_user_permissions.perm_acabamento_view IS
    'Abre o Painel do Acabamento.';
COMMENT ON COLUMN public.imposition_user_permissions.perm_acabamento_edit IS
    'Altera o estagio e o responsavel de um modelo dentro do Painel do Acabamento.';

-- Quem ja ve a Producao ve o Acabamento; quem ja edita a Producao edita o
-- Acabamento. E o unico ajuste que nao muda o acesso de ninguem: a tela nova
-- mostra os mesmos pedidos que a Producao ja mostrava para essa pessoa.
--
-- Repare que a grade NAO e reescrita a partir do ROLE_DEFAULTS do codigo. O
-- usuario edita a grade ao vivo, e um UPDATE por perfil apagaria ajustes feitos
-- caixa a caixa. Aqui so as duas colunas novas sao tocadas.
UPDATE public.imposition_user_permissions
   SET perm_acabamento_view = COALESCE(perm_producao_view, FALSE),
       perm_acabamento_edit = COALESCE(perm_producao_edit, FALSE)
 WHERE perm_acabamento_view IS DISTINCT FROM COALESCE(perm_producao_view, FALSE)
    OR perm_acabamento_edit IS DISTINCT FROM COALESCE(perm_producao_edit, FALSE);


-- ─── 4. Conferencia — o que cada papel ficou realmente tendo ────────────────
--
-- `anon` e `authenticated` devem aparecer com SELECT e mais nada na view.

SELECT grantee, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS privilegios
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'imposition_operadores'
  AND grantee IN ('anon', 'authenticated', 'service_role')
GROUP BY grantee ORDER BY grantee;

-- As duas colunas novas de `pedidos_modelos` existem?
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pedidos_modelos'
  AND column_name IN ('acabamento_status', 'acabamento_responsavel')
ORDER BY column_name;

-- E as duas permissoes novas, com quantas pessoas em cada uma?
SELECT
    count(*)                                  AS pessoas,
    count(*) FILTER (WHERE perm_acabamento_view) AS veem_o_acabamento,
    count(*) FILTER (WHERE perm_acabamento_edit) AS editam_o_acabamento
FROM public.imposition_user_permissions;
