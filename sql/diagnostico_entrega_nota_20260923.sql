-- Diagnostico do Link do Cliente: entrega e nota fiscal.
-- Somente leitura de catalogo. Nao consulta pedidos, enderecos, documentos ou tokens.
-- Cole apenas o conteudo deste arquivo no SQL Editor, sem linhas de diff/patch.

WITH itens AS (
    SELECT
        'coluna_enderecos'::text AS tipo,
        a.attname::text AS objeto,
        format_type(a.atttypid, a.atttypmod)::text AS detalhe
    FROM pg_attribute a
    WHERE a.attrelid = 'public.enderecos'::regclass
      AND a.attname IN (
          'recebedor', 'cpf_recebedor', 'cep', 'endereco', 'numero',
          'complemento', 'bairro', 'cidade', 'uf'
      )
      AND a.attnum > 0
      AND NOT a.attisdropped

    UNION ALL

    SELECT
        'gatilho'::text,
        c.relname::text || '.' || t.tgname::text,
        pg_get_triggerdef(t.oid)::text
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN ('enderecos', 'propostas')
      AND NOT t.tgisinternal

    UNION ALL

    SELECT
        'funcao'::text,
        p.proname::text,
        format(
            'dono=%s; security_definer=%s; config=%s; md5=%s',
            pg_get_userbyid(p.proowner),
            p.prosecdef,
            coalesce(array_to_string(p.proconfig, ','), '(nenhuma)'),
            md5(pg_get_functiondef(p.oid))
        )
    FROM pg_proc p
    WHERE p.oid IN (
        'public.link_cliente_pedido(text,text)'::regprocedure,
        'public.link_cliente_salvar_entrega(text,text,jsonb,jsonb)'::regprocedure,
        'public.link_cliente_salvar_faturamento(text,text,integer,jsonb,boolean,integer)'::regprocedure
    )
)
SELECT tipo, objeto, detalhe
FROM itens
ORDER BY tipo, objeto;
