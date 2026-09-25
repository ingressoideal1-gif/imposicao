-- Somente leitura: definicao do gatilho que roda antes do INSERT em enderecos.
-- Nao consulta enderecos de clientes nem altera dados.
SELECT linha, conteudo
FROM regexp_split_to_table(
    pg_get_functiondef('public.fn_preencher_dados_recebedor_endereco()'::regprocedure),
    E'\n'
) WITH ORDINALITY AS linhas(conteudo, linha)
ORDER BY linha;
