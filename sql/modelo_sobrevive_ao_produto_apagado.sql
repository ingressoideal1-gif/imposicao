-- ═══════════════════════════════════════════════════════════════════════════
--  APAGAR O PRODUTO NO ERP NÃO PODE MAIS APAGAR O TRABALHO DA GRÁFICA
--  Descoberto em 01/09/2026. Rode inteiro no editor SQL do Supabase.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O que está acontecendo hoje
--
-- A tabela `pedidos_modelos` — onde mora TODO o trabalho da gráfica num pedido:
-- a arte carregada, a cor, a numeração, o banco de dados escolhido, o modo de
-- impressão, o status de impressão e o de acabamento — aponta para a linha do
-- produto no ERP:
--
--     pedidos_modelos.id_produto_proposta_origem
--         → produtos_proposta.id   [ON DELETE CASCADE]
--
-- `ON DELETE CASCADE` quer dizer: **apagou o produto no ERP, o modelo daqui vai
-- junto**. Sem aviso, sem log, sem lixeira. E não há tabela de auditoria neste
-- banco para dizer depois quem apagou o quê.
--
-- ## Como isso apareceu
--
-- O usuário perguntou por que o pedido 21347 não abria. Ele tinha arte
-- aprovada, foi impresso pelo NewProd e está em EXPEDIÇÃO — o setor LASER está
-- CONCLUÍDO em `propostas_os_setores`, com 0,74 kg de peso real registrado. Mas
-- em `pedidos_modelos` não havia nenhuma linha, e em `produtos_proposta`
-- também não.
--
-- A observação que o designer escreveu na arte ficou órfã e denuncia o que
-- houve: `pedidos_artes.observacoes = {"item_2357": "MESMAS ARTES DA OS
-- 268247"}`. O produto **2357 existiu** — o maior id da tabela é 2397 —, e não
-- existe mais. Quando ele foi apagado, o modelo foi junto pela cascata.
--
-- São quatro pedidos hoje com arte lançada, sem modelo e sem produto: 21347,
-- 21085, 18915 e 18570. Os dois primeiros já foram produzidos e entregues.
--
-- ## O tamanho da exposição, medido em 01/09/2026
--
--   423 modelos em `pedidos_modelos` — TODOS com origem preenchida, todos
--       sujeitos à cascata
--   254 deles já IMPRESSOS
--   250 com arte carregada
--    17 com banco de dados (CSV) escolhido
--
-- Qualquer produto removido de um orçamento no ERP leva o modelo junto, mesmo
-- que a peça já esteja impressa e embalada.
--
-- ## O que este arquivo faz
--
-- Troca a cascata por `ON DELETE SET NULL`. A partir daí, apagar o produto no
-- ERP deixa o modelo **de pé**, apenas sem apontar mais para a linha que sumiu.
-- O pedido continua abrindo com a arte, a cor, a numeração e o histórico de
-- impressão intactos.
--
-- `SET NULL` é possível porque a coluna já aceita nulo (`is_nullable = YES`) e
-- porque o painel já sabe viver sem ela: o `loadOSItens` usa a origem só para
-- casar dados extras do produto, e o caminho de gravação tem quatro tentativas
-- antes dela (por id do modelo, por origem, por id_int + ordem, e por id_int).
--
-- ## Por que NÃO usar `ON DELETE RESTRICT`
--
-- `RESTRICT` faria o banco RECUSAR a exclusão do produto — e quem receberia o
-- erro seria o operador do ERP do parceiro, numa tela que não é nossa, sem
-- entender por quê. Travar a ferramenta de outra equipe para proteger a nossa
-- não é conserto, é transferir o problema.
--
-- ## O que este arquivo NÃO faz
--
-- **Não recupera os quatro pedidos já afetados.** Os modelos deles foram
-- apagados e não há backup dessas linhas neste banco (`pedidos_backup` guarda
-- outra coisa: 3 linhas, com campos do pedido, não do modelo). Recuperá-los
-- exigiria uma restauração de backup do Supabase, decisão do usuário e do
-- parceiro.
--
-- Não apaga nada, não cria tabela, não renomeia coluna. Trocar uma constraint
-- de FK é instantâneo e não reescreve a tabela.
--
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Tira a constraint antiga (a que apaga em cascata).
ALTER TABLE public.pedidos_modelos
    DROP CONSTRAINT IF EXISTS fk_pedidos_modelos_produtos_proposta;

-- 2. Recoloca a MESMA ligação, mudando só o que acontece na exclusão.
--    NOT VALID não é usado de propósito: as 423 linhas de hoje já apontam para
--    produtos existentes, então a validação passa na hora e sai daqui com a
--    constraint confiável.
ALTER TABLE public.pedidos_modelos
    ADD CONSTRAINT fk_pedidos_modelos_produtos_proposta
    FOREIGN KEY (id_produto_proposta_origem)
    REFERENCES public.produtos_proposta (id)
    ON DELETE SET NULL;

COMMIT;

-- ── Conferência (rode depois; deve dizer "set null") ────────────────────────
--
-- SELECT conname,
--        CASE confdeltype WHEN 'c' THEN 'CASCADE'
--                         WHEN 'n' THEN 'set null'
--                         WHEN 'r' THEN 'restrict'
--                         ELSE 'outro' END AS ao_apagar_o_produto
--   FROM pg_constraint
--  WHERE conrelid = 'public.pedidos_modelos'::regclass
--    AND contype = 'f';

-- ── Como desfazer, se for preciso ───────────────────────────────────────────
--
-- ALTER TABLE public.pedidos_modelos
--     DROP CONSTRAINT fk_pedidos_modelos_produtos_proposta;
-- ALTER TABLE public.pedidos_modelos
--     ADD CONSTRAINT fk_pedidos_modelos_produtos_proposta
--     FOREIGN KEY (id_produto_proposta_origem)
--     REFERENCES public.produtos_proposta (id)
--     ON DELETE CASCADE;
