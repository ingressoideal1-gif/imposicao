-- Complemento de configuracao, alvo: e-deal / producao / vwbtitjlpelrcnsytzqw.
-- Executar separadamente, somente na conexao confirmada.
-- Le APENAS configuracao dos buckets, nunca storage.objects ou arquivos.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout = '15s';
SET LOCAL lock_timeout = '3s';
SET LOCAL search_path = pg_catalog;

SELECT jsonb_build_object(
    'formato', 'imposition-rls-buckets-v1',
    'projeto', 'vwbtitjlpelrcnsytzqw',
    'ambiente', 'producao',
    'coletado_em', current_timestamp,
    'read_only', current_setting('transaction_read_only') = 'on',
    'buckets', coalesce((SELECT jsonb_agg(jsonb_build_object(
        'id', b.id, 'publico', b.public,
        'limite_bytes', b.file_size_limit,
        'tipos_permitidos', b.allowed_mime_types) ORDER BY b.id)
        FROM storage.buckets b), '[]'::jsonb)
) AS auditoria_buckets;

ROLLBACK;
