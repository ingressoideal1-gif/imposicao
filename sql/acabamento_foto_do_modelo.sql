-- ════════════════════════════════════════════════════════════════════════════════
-- SQL MIGRATION: a foto do acabamento, tirada na hora pela webcam
-- Execute no SQL Editor do Supabase — o arquivo inteiro, de uma vez
-- ════════════════════════════════════════════════════════════════════════════════
--
-- POR QUE
-- O revisor do acabamento compara o papel que saiu da impressora com a amostra
-- que o cliente aprovou. Ate aqui essa conferencia morria na cabeca dele: nada
-- registrava o que foi visto. Pedido do usuario em 20/08/2026: uma camera em
-- cada modelo, que abre a webcam da estacao e guarda a foto.
--
-- Esta coluna e o endereco dessa foto. O arquivo em si vai para o Storage.
--
-- ── POR QUE NAO HA BUCKET NOVO AQUI ──
--
-- A foto vai para o bucket `artes`, no prefixo `acabamento-fotos/`.
--
-- Nao e economia: bucket novo com escrita anonima JA FOI TENTADO neste projeto e
-- nao funcionou. O registro esta em `sql/criar_bucket_previews.sql`, que comeca
-- com "NAO EXECUTE ESTE ARQUIVO" — o bucket `previews-numeracoes` foi criado, as
-- politicas foram escritas, e a escrita continuou barrada. A saida de la foi a
-- mesma daqui: usar o `artes`, que ja tem INSERT, UPDATE e SELECT liberados para
-- a chave publica, com um prefixo no nome do arquivo.
--
-- Conferido contra o banco em 20/08/2026, politica por politica:
--
--   Permitir Tudo 1jfakx_1 | INSERT | public | check = (bucket_id = 'artes')
--   Permitir Tudo 1jfakx_2 | UPDATE | public | using = (bucket_id = 'artes')
--   Permitir Tudo 1jfakx_0 | SELECT | public | using = (bucket_id = 'artes')
--
-- A restritiva "sem listagem anonima" tira do `artes` apenas a LISTAGEM pela
-- chave publica. Enviar arquivo e INSERT, e baixar de bucket publico nao passa
-- por row level security — os dois seguem funcionando.

ALTER TABLE pedidos_modelos
ADD COLUMN IF NOT EXISTS acabamento_foto_url TEXT;

COMMENT ON COLUMN pedidos_modelos.acabamento_foto_url IS
    'URL publica da foto do material tirada na revisao do acabamento (bucket artes, prefixo acabamento-fotos/). NULL = ainda nao fotografado. Refazer a foto grava um arquivo novo e troca a URL; o arquivo anterior nao e apagado, para nao correr o risco de apagar a foto que outra estacao acabou de tirar.';


-- ─── Conferencia ────────────────────────────────────────────────────────────

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'pedidos_modelos'
  AND column_name LIKE 'acabamento%'
ORDER BY column_name;
