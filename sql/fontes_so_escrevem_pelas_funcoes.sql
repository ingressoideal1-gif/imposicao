-- ══════════════════════════════════════════════════════════════════
-- O catálogo de fontes deixa de aceitar escrita da chave pública.
-- Execute no SQL Editor do Supabase.
-- ══════════════════════════════════════════════════════════════════
--
-- ## O que foi medido em 16/08/2026
--
-- Com a chave anônima — a que está no código-fonte de toda página do painel —,
-- numa linha de verdade do catálogo:
--
--     PATCH catalogo_fontes?id=eq.<uma fonte real>  ->  200, linha alterada
--
-- Ou seja: qualquer pessoa editava ou apagava o catálogo de fontes da gráfica.
-- Não vaza segredo; estraga produção, e estraga para todo mundo de uma vez. O
-- catálogo é compartilhado por decisão de 15/08/2026, então ele desenha a
-- página do cliente, o Criador de Arte e as onze estações.
--
-- ## Por que a LEITURA fica aberta, de propósito
--
-- `cliente.html` é a tela de quem comprou, sem login nenhum, e ela precisa das
-- fontes para desenhar a arte. Nome de fonte e URL de Storage não são segredo —
-- ao contrário dos códigos de acesso, que saíram da chave pública no passo 3 do
-- RLS. Fechar a leitura aqui trocaria um risco de vandalismo por uma tela
-- quebrada na frente do cliente.
--
-- ## O que precisou existir ANTES deste arquivo
--
-- Quem escreve de verdade são dois, e os dois ganharam caminho próprio:
--
--     navegador do painel  ->  Edge Function `painel`, com a sessão do usuário
--     NewProd.exe          ->  Edge Function `acesso-estacao`, com o segredo do
--                              agente (`db._catalogo_pela_funcao`)
--
-- O segundo é o delicado. A estação cadastra fonte no catálogo compartilhado de
-- propósito, e amarrar essa escrita a uma condição local já quebrou o cadastro
-- de fonte duas vezes neste projeto — a fonte morria na estação onde foi
-- cadastrada, sem nunca chegar às outras nem ao link do cliente, e sem erro na
-- tela. Está registrado em `db._catalogo_remoto_ativo`. Executar este arquivo
-- ANTES de o agente 1.2.101 chegar às estações reproduz exatamente esse defeito.
--
-- Confira antes de rodar: `.\ferramentas\conferir.ps1` tem de mostrar as
-- estações ativas em 1.2.101 ou mais.

-- ─── 1. Apaga toda política que exista hoje ──────────────────────────────────
--
-- Pelo mesmo motivo de `rls_acessos_e_permissoes.sql`: RLS ligado com uma
-- política permissiva de antes é RLS que não protege nada, e ainda PARECE
-- ligado para quem olha a lista de tabelas.

DO $$
DECLARE politica RECORD;
BEGIN
    FOR politica IN
        SELECT p.polname, c.relname
        FROM pg_policy p
        JOIN pg_class c ON c.oid = p.polrelid
        WHERE c.relname = 'catalogo_fontes'
    LOOP
        EXECUTE format('DROP POLICY %I ON %I', politica.polname, politica.relname);
        RAISE NOTICE 'politica removida: %', politica.polname;
    END LOOP;
END $$;

-- ─── 2. Leitura sim, escrita não ─────────────────────────────────────────────

ALTER TABLE catalogo_fontes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leitura publica do catalogo"
    ON catalogo_fontes FOR SELECT USING (true);

-- Nenhuma política de INSERT, UPDATE ou DELETE, e é a AUSÊNCIA delas que fecha
-- a escrita: política de SELECT não autoriza UPDATE.
--
-- Aqui a política ausente basta, e não é preciso o REVOKE que o passo 3 do RLS
-- exigiu. Lá o problema era a LEITURA recusada virar lista vazia e a estação
-- entender "não há mais ninguém com acesso". Aqui quem escreve é o painel, que
-- olha a resposta e mostra o erro na tela.

REVOKE INSERT, UPDATE, DELETE ON catalogo_fontes FROM anon, authenticated;
GRANT SELECT ON catalogo_fontes TO anon, authenticated;
GRANT ALL ON catalogo_fontes TO service_role;

COMMENT ON TABLE catalogo_fontes IS
    'Catalogo de fontes compartilhado por todas as estacoes e pela pagina do cliente. Leitura publica de proposito (cliente.html nao tem login). Escrita fechada a chave anonima em 16/08/2026: entra pela Edge Function painel (sessao) ou acesso-estacao (segredo do agente).';

-- ─── 3. A conferência, sem sair daqui ────────────────────────────────────────
--
-- Esperado: rls_ligado = true, UMA política e ela de SELECT (`r`), `anon` e
-- `authenticated` só com SELECT, `service_role` com tudo.

SELECT c.relname                                   AS tabela,
       c.relrowsecurity                            AS rls_ligado,
       COALESCE(string_agg(p.polname || ' [' || p.polcmd::text || ']', ', '),
                '(nenhuma)')                       AS politicas
FROM pg_class c
LEFT JOIN pg_policy p ON p.polrelid = c.oid
WHERE c.relname = 'catalogo_fontes'
GROUP BY c.relname, c.relrowsecurity;

SELECT grantee                                     AS quem,
       string_agg(privilege_type, ', ' ORDER BY privilege_type) AS pode
FROM information_schema.role_table_grants
WHERE table_name = 'catalogo_fontes'
  AND grantee IN ('anon', 'authenticated', 'service_role')
GROUP BY grantee
ORDER BY grantee;
