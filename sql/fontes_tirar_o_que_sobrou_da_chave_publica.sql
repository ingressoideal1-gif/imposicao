-- ══════════════════════════════════════════════════════════════════
-- Sobra do arquivo anterior: `anon` ficou com TRUNCATE em
-- `catalogo_fontes`. Execute no SQL Editor do Supabase.
-- ══════════════════════════════════════════════════════════════════
--
-- ## O que a conferência mostrou depois de rodar
-- `sql/fontes_so_escrevem_pelas_funcoes.sql`
--
--     anon           REFERENCES, SELECT, TRIGGER, TRUNCATE
--     authenticated  REFERENCES, SELECT, TRIGGER, TRUNCATE
--     service_role   (tudo)
--
-- O que importava foi fechado: INSERT, UPDATE e DELETE saíram, e a medição
-- confirmou — os três respondem `401 permission denied` com a chave pública, e
-- a leitura continua passando, como `cliente.html` precisa.
--
-- O que sobrou vem do `GRANT ALL` que o Supabase dá por padrão às tabelas
-- novas. Aquele arquivo revogou por NOME (`REVOKE INSERT, UPDATE, DELETE`) em
-- vez de revogar tudo e devolver só o SELECT, que foi o que
-- `rls_passo3_fechar_leitura.sql` fez nas outras duas tabelas — e por isso lá
-- não sobrou nada.
--
-- ## Isso é urgente?
--
-- Não. `TRUNCATE` não tem verbo HTTP: o PostgREST só emite SELECT, INSERT,
-- UPDATE e DELETE, então não há como alcançá-lo pela API com a chave pública
-- hoje. É arrumação, não incêndio.
--
-- Mas vale fazer, por duas razões. `TRUNCATE` **ignora RLS** — não é um DELETE
-- mais rápido, é um caminho que desvia da política inteira, e esvaziaria o
-- catálogo de fontes da gráfica num comando. E `TRIGGER` permitiria pendurar
-- código na tabela. Nenhum dos dois é alcançável agora; nenhum dos dois tem
-- motivo para continuar concedido a uma chave que está no código-fonte de toda
-- página.
--
-- A regra que fica: revogar TUDO e devolver o que se usa, nunca revogar por
-- nome. Lista por nome envelhece — basta o Postgres ganhar um privilégio novo,
-- ou alguém rodar um `GRANT ALL` de novo, para a lista ficar incompleta em
-- silêncio.

REVOKE ALL ON catalogo_fontes FROM anon, authenticated;

-- Só a leitura volta. `cliente.html` é a tela de quem comprou, sem login
-- nenhum, e precisa das fontes para desenhar a arte que o cliente vai aprovar.
GRANT SELECT ON catalogo_fontes TO anon, authenticated;

-- Explícito: `service_role` ignora RLS, mas NÃO ignora privilégio de tabela.
-- É por ela que a Edge Function grava.
GRANT ALL ON catalogo_fontes TO service_role;

-- ─── A conferência ───────────────────────────────────────────────────────────
--
-- Esperado, para as três tabelas nossas:
--
--     anon           SELECT           (só em catalogo_fontes; nas outras, nada)
--     authenticated  SELECT           (idem)
--     service_role   (tudo)
--
-- As duas de acesso aparecem aqui de propósito: é a mesma pergunta, e ver as
-- três lado a lado é o que mostra que a regra foi aplicada igual.

SELECT table_name                                  AS tabela,
       grantee                                     AS quem,
       string_agg(privilege_type, ', ' ORDER BY privilege_type) AS pode
FROM information_schema.role_table_grants
WHERE table_name IN ('catalogo_fontes',
                     'imposition_acessos_locais',
                     'imposition_user_permissions')
  AND grantee IN ('anon', 'authenticated', 'service_role')
GROUP BY table_name, grantee
ORDER BY table_name, grantee;
