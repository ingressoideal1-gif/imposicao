-- ════════════════════════════════════════════════════════════════════════════════
-- SQL MIGRATION: o ultimo estagio do acabamento deixa de ser "Revisado" e passa
-- a ser "Pronto"
-- Execute no SQL Editor do Supabase — o arquivo inteiro, de uma vez
-- ════════════════════════════════════════════════════════════════════════════════
--
-- POR QUE
-- Pedido do usuario em 21/08/2026. "Revisado" descreve o que o conferente fez;
-- "Pronto" descreve o que interessa a quem olha a fila de longe — o material
-- pode ser embalado e entregue. E a palavra que o setor usa em voz alta.
--
-- ── O QUE PRECISA MUDAR NO BANCO ──
--
-- A coluna `pedidos_modelos.acabamento_status` guarda o proprio rotulo, em
-- texto, e nao um codigo. Isso foi decidido de proposito quando a tela nasceu:
-- o conjunto e pequeno, so a tela le, e um texto legivel dispensa uma tabela de
-- dominio para quatro valores. O preco dessa escolha e exatamente este arquivo —
-- renomear o rotulo exige reescrever as linhas ja gravadas.
--
-- Sem esta migracao, os modelos ja marcados continuariam com "Revisado" no
-- banco: um valor que a tela nova nao oferece mais no seletor.
--
-- ── A REDE DE SEGURANCA DO LADO DO CODIGO ──
--
-- O `frontend/acabamento.js` traduz "Revisado" para "Pronto" ao LER (a constante
-- `NOME_ANTIGO`), de modo que a tela mostra a coisa certa mesmo antes desta
-- migracao rodar, e mesmo que uma estacao com a versao anterior em cache grave
-- o nome velho nos minutos seguintes a publicacao. A traducao e so de leitura:
-- toda gravacao nova ja sai como "Pronto".
--
-- Rodar este arquivo duas vezes nao faz mal — na segunda vez ele nao encontra
-- mais nenhuma linha para atualizar.

-- ─── Antes: quantas linhas serao tocadas ────────────────────────────────────

SELECT acabamento_status, COUNT(*) AS quantos
FROM pedidos_modelos
WHERE acabamento_status IS NOT NULL
GROUP BY acabamento_status
ORDER BY quantos DESC;


-- ─── A troca ────────────────────────────────────────────────────────────────
--
-- `ILIKE` em vez de `=` por precaucao: o valor veio de um seletor, mas uma
-- linha gravada a mao em algum teste pode ter caixa diferente.

UPDATE pedidos_modelos
SET acabamento_status = 'Pronto'
WHERE acabamento_status ILIKE 'Revisado';


-- ─── O comentario da coluna acompanha o vocabulario ─────────────────────────

COMMENT ON COLUMN pedidos_modelos.acabamento_status IS
    'Estagio do modelo no setor de acabamento: Impresso, Em acabamento ou Pronto. NULL = ainda nao comecou. Ate 21/08/2026 o ultimo estagio se chamava Revisado. Nao se confunde com status_impressao, que e do setor de impressao.';


-- ─── Conferencia ────────────────────────────────────────────────────────────
--
-- A primeira consulta nao pode mais devolver nenhuma linha "Revisado".

SELECT acabamento_status, COUNT(*) AS quantos
FROM pedidos_modelos
WHERE acabamento_status IS NOT NULL
GROUP BY acabamento_status
ORDER BY quantos DESC;
