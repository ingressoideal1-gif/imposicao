-- ══════════════════════════════════════════════════════════════════
--  As numerações de nome repetido: juntar no registro em uso
--            Execute no SQL Editor do Supabase, ou por
--            `.\ferramentas\rodar_sql.ps1 sql\limpar_numeracoes_de_nome_repetido.sql`
-- ══════════════════════════════════════════════════════════════════
--
-- Escrito em 25/08/2026, depois de o usuário relatar: "numerações salvas com
-- mesmo nome, não está avisando que já existe nem sobrescrevendo, está ficando
-- numeração fantasma, hora carrega uma hora carrega a outra".
--
-- O CÓDIGO já foi consertado (o vínculo do modelo passou a ser pelo id, a
-- consulta ganhou ordem fixa, e o save passa a conferir no banco e perguntar).
-- Este arquivo trata do DADO que ficou para trás.
--
-- Rodá-lo duas vezes não faz mal: cada passo confere o estado antes de agir, e
-- nenhum `DELETE` acontece enquanto alguma coluna ainda apontar para a linha.
--
--
-- ── O levantamento ──────────────────────────────────────────────────────────
--
-- Três nomes repetidos em 86 registros. Quem aponta para cada linha, nas quatro
-- colunas do banco que guardam id de numeração (`pedidos_modelos.amostra_num_id`,
-- `produtos_proposta.amostra_num_id`, `producao_modelos_imposicao.numeracao_id`,
-- `producao_os_itens.numeracao_id`):
--
--   nome                 id         o que desenha            referências
--   ──────────────────────────────────────────────────────────────────────
--   001 - Padrão Ideal   347eb066   QR + TEXTO                     3
--   001 - Padrão Ideal   e51a245b   QR + TEXTO + PDF (a arte)     59   ← a certa
--   1000535              2a4c19fe   3 elementos                    0   ← fantasma
--   1000535              8f080e04   4 elementos                    1
--   Personalizada        5f7ed0e2   2 elementos                    0
--   Personalizada        69d87203   3 elementos                    0
--
-- Qual das duas "001" é a correta foi o USUÁRIO quem disse, mandando a arte: a
-- pulseira amarela com a guilhoche, a tarja holográfica, o QR, o 00001 e a logo
-- Ideal. Conferido contra o `preview_jpg` das duas: é a `e51a245b`, pixel por
-- pixel. A `347eb066` é outra peça -- fundo branco, sem a arte, QR à direita.


-- ════════════════════════════════════════════════════════════════════════════
--  ⚠️  LEIA ANTES DE RODAR: o pedido 21111
-- ════════════════════════════════════════════════════════════════════════════
--
-- Das três referências da numeração errada, uma é um modelo que O CLIENTE JÁ
-- APROVOU:
--
--   pedidos_modelos 1000517 — pedido 21111, "BRACELETES"
--   status_arte = APROVADA_CLIENTE, pedido em REVISAO PRODUCAO
--
-- Ou seja: aquele cliente aprovou uma amostra desenhada com a numeração ERRADA
-- -- sem a arte da pulseira. O PASSO 3 troca a numeração dele para a correta, e
-- com isso **o que vai sair impresso deixa de ser o que ele viu e aprovou**.
--
-- Neste projeto o conteúdo impresso não muda para resolver problema de sistema,
-- e o que já está aprovado não regride por causa de uma correção. Por isso o
-- PASSO 3 está separado dos outros: rodá-lo é uma decisão de operação, não de
-- limpeza de banco.
--
-- O caminho honesto é falar com o cliente do 21111 e reaprovar a arte certa. Se
-- preferir fazer isso antes, rode os PASSOS 1, 2 e 4 agora e o 3 depois --
-- eles são independentes, e o PASSO 5 se recusa a apagar enquanto o 3 não tiver
-- rodado.


-- ─── PASSO 1: o fantasma do modelo 1000535 ──────────────────────────────────
--
-- Este é o caso que o usuário viu na tela. As duas são exclusivas do MESMO
-- modelo -- mesmo `Cli_Num` (61567), mesmo `os_item_id` (1000535) --, criadas
-- com 28 minutos de diferença porque a guarda de homônimas lia um cache do
-- navegador que ainda não sabia da primeira.
--
-- A `2a4c19fe` não é apontada por NADA. É trabalho órfão -- 3 elementos e 77 kB
-- de CSV que nenhuma tela alcança, e que nem aparece na Lista de Numerações,
-- porque registro com `Cli_Num` é omitido de lá.
--
-- NÃO se copia nada dela para a que está em uso. A `8f080e04` é MAIOR e mais
-- nova (4 elementos, 90 kB, editada em 25/08 às 14:37): mesclar o conteúdo do
-- órfão por cima jogaria fora justamente o trabalho bom. "Juntar" aqui é
-- consolidar as referências -- que são zero -- e remover o fantasma.

DELETE FROM public.producao_numeracoes n
 WHERE n.id = '2a4c19fe-eddc-4d73-aea3-a922c9314bac'
   AND btrim(n.name) = '1000535'
   AND NOT EXISTS (SELECT 1 FROM public.pedidos_modelos m WHERE m.amostra_num_id = n.id::text)
   AND NOT EXISTS (SELECT 1 FROM public.produtos_proposta pp WHERE pp.amostra_num_id = n.id)
   AND NOT EXISTS (SELECT 1 FROM public.producao_modelos_imposicao mi WHERE mi.numeracao_id = n.id)
   AND NOT EXISTS (SELECT 1 FROM public.producao_os_itens oi WHERE oi.numeracao_id = n.id);


-- ─── PASSO 2: as duas "Personalizada" ───────────────────────────────────────
--
-- NÃO é o mesmo caso, e por isso nenhuma é apagada.
--
-- Elas têm conteúdo diferente -- 2 e 3 elementos -- e portanto são duas
-- numerações distintas que por acaso receberam o mesmo nome. E NENHUMA das duas
-- está em uso: zero referências nas quatro colunas, e nenhum modelo cita o nome
-- em `gabarito_operacional`. Não há "registro em uso" para o qual juntar.
--
-- Apagar uma seria escolher, por conta própria, qual trabalho de qual operador
-- morre. Renomear resolve o que incomoda -- a ambiguidade -- sem perder nada. A
-- mais antiga fica com o nome original; a outra ganha a data no nome, para o
-- operador saber qual é qual e rebatizar como quiser depois.

UPDATE public.producao_numeracoes n
   SET name = 'Personalizada (22-08 23h49)'
 WHERE n.id = '69d87203-43a5-443a-8aa1-8e1c93b11e81'
   AND btrim(n.name) = 'Personalizada'
   AND NOT EXISTS (SELECT 1 FROM public.pedidos_modelos m WHERE m.amostra_num_id = n.id::text)
   AND NOT EXISTS (SELECT 1 FROM public.produtos_proposta pp WHERE pp.amostra_num_id = n.id)
   AND NOT EXISTS (SELECT 1 FROM public.pedidos_modelos m2
                    WHERE btrim(COALESCE(m2.gabarito_operacional,'')) = 'Personalizada');


-- ─── PASSO 3: o modelo aprovado do pedido 21111 ─────────────────────────────
--
--   ⚠️  ESTE É O PASSO QUE MUDA O QUE SAI IMPRESSO. Leia o aviso lá em cima.
--
-- Troca a numeração do modelo 1000517 ("BRACELETES") da errada para a correta.
-- Depois disto, a peça sai com a arte da pulseira -- diferente da amostra que o
-- cliente aprovou.
--
-- Para NÃO rodar este passo agora, comente as quatro linhas abaixo (prefixo `--`)
-- e rode o resto. Os passos 1, 2 e 4 não dependem dele.

UPDATE public.pedidos_modelos
   SET amostra_num_id = 'e51a245b-8bb5-4ca1-9d0e-947ba2c92c92'
 WHERE id::text = '1000517'
   AND amostra_num_id = '347eb066-2c64-4d20-afce-818718bcc070';


-- ─── PASSO 4: as duas linhas de proposta na numeração errada ────────────────
--
-- `produtos_proposta` é o item da PROPOSTA, não o modelo que vai à impressora --
-- ele guarda a amostra que o comercial montou. Repontar aqui não muda papel
-- nenhum sozinho; alinha o item com a numeração que a gráfica usa de verdade.
--
--   1190 — pedido 17753, "Pulseira Bracelete", proposta em NOVO
--   2299 — pedido 21111, "Pulseira Bracelete", o mesmo pedido do PASSO 3

UPDATE public.produtos_proposta
   SET amostra_num_id = 'e51a245b-8bb5-4ca1-9d0e-947ba2c92c92'
 WHERE amostra_num_id = '347eb066-2c64-4d20-afce-818718bcc070';


-- ─── PASSO 5: remover a "001 - Padrão Ideal" errada ─────────────────────────
--
-- Só acontece se NADA mais apontar para ela -- ou seja, se os PASSOS 3 e 4
-- tiverem rodado. Se você pulou o PASSO 3, este DELETE não faz nada, e é o
-- comportamento certo: o registro tem de continuar existindo enquanto um modelo
-- vivo depender dele.
--
-- ── Por que remover, e não renomear ──
--
-- 33 modelos trazem `gabarito_operacional = '001 - Padrão Ideal'` -- o nome
-- escrito pelo ERP do parceiro. O `reconciliarCorNumDoModelo` do painel resolve
-- a numeração PELO NOME quando o parceiro a troca, e ele preserva o id em cache
-- quando o nome casa com MAIS DE UMA linha (`candidatos.length !== 1`).
--
-- Hoje, o nome repetido é justamente o que trava essa reconciliação. Renomear
-- uma das duas faria o nome casar com exatamente uma, e a reconciliação
-- passaria a MOVER modelos sozinha. Removendo a errada DEPOIS de repontar quem
-- dependia dela, o nome passa a casar com a `e51a245b` -- que é exatamente onde
-- todos esses modelos já estão. A reconciliação encontra o id em cache e o nome
-- concordando, e não move ninguém.
--
-- É por isso que a ordem dos passos 3 → 4 → 5 importa.

DELETE FROM public.producao_numeracoes n
 WHERE n.id = '347eb066-2c64-4d20-afce-818718bcc070'
   AND btrim(n.name) = '001 - Padrão Ideal'
   AND NOT EXISTS (SELECT 1 FROM public.pedidos_modelos m WHERE m.amostra_num_id = n.id::text)
   AND NOT EXISTS (SELECT 1 FROM public.produtos_proposta pp WHERE pp.amostra_num_id = n.id)
   AND NOT EXISTS (SELECT 1 FROM public.producao_modelos_imposicao mi WHERE mi.numeracao_id = n.id)
   AND NOT EXISTS (SELECT 1 FROM public.producao_os_itens oi WHERE oi.numeracao_id = n.id);

-- Sobram os `.jpg` das duas apagadas em `artes/previews-numeracoes/`. É o mesmo
-- comportamento do botão Excluir da Lista de Numerações, que também não apaga o
-- arquivo. Lixo lento e inofensivo: os ids são UUID e nunca são reusados.


-- ─── A conferência, sem sair daqui ──────────────────────────────────────────
--
-- O esperado depois de rodar tudo: NENHUMA linha. Se o PASSO 3 foi pulado de
-- propósito, sobra `001 - Padrão Ideal` com 2 -- e aí a linha lembra que o
-- pedido 21111 ainda espera decisão.

SELECT btrim(name) AS nome_ainda_repetido,
       count(*)    AS quantas,
       string_agg(id::text, ' | ' ORDER BY created_at) AS ids
  FROM public.producao_numeracoes
 GROUP BY btrim(name)
HAVING count(*) > 1
 ORDER BY 1;
