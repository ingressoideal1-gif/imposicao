-- Credencial PVC: a altura da cor passa a ser a mesma do formato dela
-- ---------------------------------------------------------------------------
-- A amostra na tela monta a peca com o tamanho da COR, mas quem imprime e o
-- FORMATO. Das 24 cores do catalogo, so esta estava fora de sincronia com o
-- formato dela: cor 105 x 145,5 mm contra formato "Credencial 90x140" de
-- 105 x 148 mm.
--
-- O efeito na tela: a peca aparecia 2,5 mm mais curta do que sai no papel, a
-- arte (98 x 148 mm) era encolhida para 98,3% para caber nela, e a camada de
-- numeracao -- que e montada com o tamanho do FORMATO -- perdia 1,25 mm em
-- cima e 1,25 mm embaixo, cortados pela borda do canvas.
--
-- Decisao do usuario em 18/08/2026: manda o formato, 148 mm.
--
-- Conferencia antes e depois no proprio resultado.
select 'antes' as quando, c.name, c.width_mm, c.height_mm,
       f.name as formato, f.width_mm as fmt_w, f.height_mm as fmt_h
  from producao_cores c
  join producao_formatos f on f.id = c.formato_id
 where c.id = 'ba759c0f-f8f4-4065-8b1f-f7dbf4b669c1';

update producao_cores
   set height_mm = 148
 where id = 'ba759c0f-f8f4-4065-8b1f-f7dbf4b669c1'
   and height_mm = 145.5;

select 'depois' as quando, c.name, c.width_mm, c.height_mm,
       f.name as formato, f.width_mm as fmt_w, f.height_mm as fmt_h,
       case when c.width_mm = f.width_mm and c.height_mm = f.height_mm
            then 'bate com o formato' else 'AINDA DIFERENTE' end as situacao
  from producao_cores c
  join producao_formatos f on f.id = c.formato_id
 where c.id = 'ba759c0f-f8f4-4065-8b1f-f7dbf4b669c1';
