-- ============================================================================
--  REPARO: credenciais órfãs de evento e de setor
--  Cole INTEIRO no editor SQL do Supabase e rode. Pode rodar mais de uma vez.
-- ============================================================================
--
--  O QUE ACONTECEU
--
--  O vínculo da credencial com o evento e o setor era gravado só na
--  reivindicação (quando o cliente abre o link do evento), num UPDATE sobre as
--  credenciais que já existiam naquele momento. Isso cobre uma ordem — imprimir
--  primeiro, reivindicar depois — e falha calado na ordem inversa.
--
--  No pedido 18560 o cliente reivindicou às 10:55 de 14/08/2026 e o papel só
--  saiu às 18:52. As 200 credenciais daquele dia nasceram depois do UPDATE e
--  ficaram sem dono. Em 15/08 as 363 credenciais do banco inteiro estavam
--  assim.
--
--  Órfã não é defeito visível: a credencial existe, conta no total publicado, e
--  some justamente onde importa. A portaria não sabe de que setor o código é, e
--  o bloqueio por faixa — que é por setor — não alcança nenhuma.
--
--  O código já foi corrigido: `_gravar_lote` agora lê os setores do pedido e
--  grava o vínculo junto com a credencial. Este arquivo conserta o passado.
--
--  O QUE ELE NÃO CONSERTA
--
--  Pedido que nunca foi reivindicado não tem setor nenhum, então não há a que
--  ligar. É o caso do 20508. Essas credenciais continuam órfãs até o cliente
--  abrir o link do evento — e aí a própria reivindicação as carimba.
-- ============================================================================


-- ─── 1. Antes: quanto está órfão, e quanto dá para consertar ────────────────
SELECT
    c.pedido_id_int,
    count(*)                                            AS credenciais,
    count(*) FILTER (WHERE c.setor_id IS NULL)          AS orfas,
    count(s.id) FILTER (WHERE c.setor_id IS NULL)       AS orfas_com_setor_para_ligar
FROM producao_acesso_credenciais c
LEFT JOIN producao_acesso_setores s
       ON s.pedido_id_int = c.pedido_id_int
      AND s.modelo_id     = c.modelo_id
GROUP BY c.pedido_id_int
ORDER BY c.pedido_id_int;


-- ─── 2. O reparo ────────────────────────────────────────────────────────────
--
-- Só toca em linha órfã: `setor_id IS NULL`. Credencial já ligada não muda,
-- nem que o setor tenha sido recriado depois — o vínculo existente é o que a
-- portaria já leu, e reescrevê-lo por conta própria seria mudar história.
UPDATE producao_acesso_credenciais AS c
   SET setor_id   = s.id,
       evento_id  = s.evento_id,
       updated_at = now()
  FROM producao_acesso_setores AS s
 WHERE s.pedido_id_int = c.pedido_id_int
   AND s.modelo_id     = c.modelo_id
   AND c.setor_id IS NULL;


-- ─── 3. Depois: o que ficou ─────────────────────────────────────────────────
--
-- `orfas` só deve sobrar em pedido sem nenhum setor, isto é, ainda não
-- reivindicado. Se sobrar órfã num pedido que TEM setor, o modelo_id do setor
-- não bate com o da credencial — e aí é outro problema, não este.
SELECT
    c.pedido_id_int,
    count(*)                                    AS credenciais,
    count(*) FILTER (WHERE c.setor_id IS NULL)  AS orfas,
    (SELECT count(*) FROM producao_acesso_setores s
      WHERE s.pedido_id_int = c.pedido_id_int)  AS setores_do_pedido
FROM producao_acesso_credenciais c
GROUP BY c.pedido_id_int
ORDER BY c.pedido_id_int;
