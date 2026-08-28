-- ════════════════════════════════════════════════════════════════════════════════
-- CORRECAO: o id do modelo nao e UUID neste banco
-- Execute no SQL Editor do Supabase
-- ════════════════════════════════════════════════════════════════════════════════
--
-- O QUE ACONTECEU
-- O `pedidos_modelos_banco.modelo_id` nasceu UUID, por analogia com as outras
-- tabelas nossas. Mas `pedidos_modelos` e do parceiro Vibe, e o id dela e um
-- NUMERO (1000409, 1000708...). Resultado: ligar um modelo a um banco do pedido
-- morria com "invalid input syntax for type uuid: 1000409", e o operador ficava
-- com o banco criado e sem vinculo nenhum.
--
-- POR QUE TEXT, E NAO BIGINT
-- Porque o tipo do id e do parceiro, e ja mudou de forma antes. TEXT aceita o
-- numero de hoje e o UUID de amanha sem outra migracao, e o codigo do painel ja
-- compara os dois lados com String(). O preco e nenhum: a coluna e chave de
-- procura por igualdade, nunca soma nem ordena.
--
-- SEGURANCA
-- A tabela esta VAZIA (nenhum vinculo chegou a ser gravado, justamente por causa
-- do erro). O ALTER abaixo nao converte dado de ninguem. `pedidos_bancos` nao e
-- tocada: a chave dela e UUID de verdade, gerada aqui.

ALTER TABLE pedidos_modelos_banco
    ALTER COLUMN modelo_id TYPE TEXT USING modelo_id::TEXT;
