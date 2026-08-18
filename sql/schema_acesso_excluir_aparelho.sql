-- ============================================================================
--  EXCLUIR APARELHO DE VERDADE  --  Ideal Control, 18/08/2026
-- ============================================================================
--
--  ## O que muda
--
--  Ate aqui um aparelho so podia ser "revogado": a linha continuava no banco,
--  com status trocado, e continuava aparecendo na lista do dono para sempre. O
--  usuario pediu o contrario -- "Excluir Aparelho, deve excluir definitivamente
--  o aparelho e sumir da listagem".
--
--  Apagar a linha esbarrava em duas chaves estrangeiras que apontam para ela:
--
--    producao_acesso_dispositivo_setores.dispositivo_id   (quais setores ele le)
--    producao_acesso_leituras.dispositivo_id              (o que ele ja leu)
--
--  As duas sao tratadas de formas OPOSTAS de proposito:
--
--  * Os VINCULOS de setor sao configuracao do aparelho. Sem o aparelho eles nao
--    querem dizer nada, entao vao junto -- `on delete cascade`.
--
--  * As LEITURAS sao historico do evento, e historico nao se apaga porque um
--    aparelho saiu de cena. "4.812 entraram" e o numero pelo qual o dono se
--    lembra da noite, e ele e contado por `evento_id`, nao por aparelho. Entao
--    a leitura FICA, e so perde o dedo apontado para quem a fez --
--    `on delete set null`, o que exige a coluna aceitar nulo.
--
--  ## Sobre o indice unico das leituras
--
--  `uq_acesso_leitura_do_aparelho (dispositivo_id, id_local)` continua como
--  esta. Ele existe para o mesmo aparelho nao gravar a mesma leitura duas vezes
--  ao reenviar a fila; com `dispositivo_id` nulo o indice deixa de valer para
--  aquelas linhas, o que esta certo: elas sao historico fechado, e ninguem mais
--  vai reenviar leitura de um aparelho que nao existe.
--
--  ## Como conferir depois de rodar
--
--    select conname, pg_get_constraintdef(oid)
--      from pg_constraint
--     where conname in ('producao_acesso_leituras_dispositivo_id_fkey',
--                       'producao_acesso_dispositivo_setores_dispositivo_id_fkey');
--
--  Idempotente: pode rodar de novo sem estragar nada.
-- ============================================================================

begin;

-- ── As leituras: ficam, sem dono ────────────────────────────────────────────

alter table public.producao_acesso_leituras
    alter column dispositivo_id drop not null;

alter table public.producao_acesso_leituras
    drop constraint if exists producao_acesso_leituras_dispositivo_id_fkey;

alter table public.producao_acesso_leituras
    add constraint producao_acesso_leituras_dispositivo_id_fkey
    foreign key (dispositivo_id)
    references public.producao_acesso_dispositivos (id)
    on delete set null;

-- ── Os vinculos de setor: vao junto ─────────────────────────────────────────

alter table public.producao_acesso_dispositivo_setores
    drop constraint if exists producao_acesso_dispositivo_setores_dispositivo_id_fkey;

alter table public.producao_acesso_dispositivo_setores
    add constraint producao_acesso_dispositivo_setores_dispositivo_id_fkey
    foreign key (dispositivo_id)
    references public.producao_acesso_dispositivos (id)
    on delete cascade;

commit;

-- ============================================================================
--  COMO DESFAZER  (nao ha por que, mas fica registrado)
--
--    alter table public.producao_acesso_leituras
--        drop constraint producao_acesso_leituras_dispositivo_id_fkey;
--    alter table public.producao_acesso_leituras
--        add constraint producao_acesso_leituras_dispositivo_id_fkey
--        foreign key (dispositivo_id)
--        references public.producao_acesso_dispositivos (id);
--    -- o `set not null` so volta se nenhuma leitura estiver orfa
--    alter table public.producao_acesso_leituras
--        alter column dispositivo_id set not null;
--
--    alter table public.producao_acesso_dispositivo_setores
--        drop constraint producao_acesso_dispositivo_setores_dispositivo_id_fkey;
--    alter table public.producao_acesso_dispositivo_setores
--        add constraint producao_acesso_dispositivo_setores_dispositivo_id_fkey
--        foreign key (dispositivo_id)
--        references public.producao_acesso_dispositivos (id);
-- ============================================================================
