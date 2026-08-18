-- ============================================================================
--  O NOME E DO DISPOSITIVO  --  Ideal Control, 18/08/2026
-- ============================================================================
--
--  ## O que muda
--
--  Cada evento em que um celular vira portao cria uma linha propria em
--  `producao_acesso_dispositivos`. Ate aqui nada ligava essas linhas entre si:
--  o mesmo celular era "Aparelho 1" num evento e "Aparelho 3" no outro, porque
--  a sugestao contava os portoes DAQUELE evento. O dono nao tinha como saber
--  que era o mesmo aparelho.
--
--  Palavras do usuario: "o nome do aparelho e o mesmo para todos os eventos, o
--  nome 'Aparelho' e o nome do dispositivo".
--
--  A coluna abaixo e o que faltava: o identificador do NAVEGADOR (o mesmo que
--  o `X-Navegador` ja carrega em toda escrita elevada, guardado no aparelho
--  desde a primeira abertura). Com ele, renomear um portao renomeia as linhas
--  do mesmo celular nos outros eventos do mesmo cliente.
--
--  ## Por que TEXT e sem chave estrangeira
--
--  O identificador nasce no navegador, nao no banco -- nao ha tabela de
--  dispositivos para apontar, e nem deve haver: ele e um apelido local, sem
--  valor de segredo. O que autoriza a escrita continua sendo a sessao mais a
--  elevacao; esta coluna so agrupa.
--
--  Linha antiga fica com `null`, e isso esta certo: aparelho que virou portao
--  antes de hoje nao tem como ser reconhecido retroativamente. Ele ganha o
--  identificador na proxima vez que virar portao de um evento novo.
--
--  ## Como conferir depois de rodar
--
--    select column_name, data_type
--      from information_schema.columns
--     where table_name = 'producao_acesso_dispositivos'
--       and column_name = 'navegador_id';
--
--  Idempotente: pode rodar de novo sem estragar nada.
-- ============================================================================

begin;

alter table public.producao_acesso_dispositivos
    add column if not exists navegador_id text;

comment on column public.producao_acesso_dispositivos.navegador_id is
    'Identificador do navegador que virou portao aqui. Agrupa as linhas do '
    'MESMO celular em eventos diferentes, para o nome do aparelho valer em '
    'todos. Nulo em portao criado pela grafica ou anterior a 18/08/2026.';

-- A consulta que espalha o nome filtra por (navegador_id, evento_id).
create index if not exists idx_acesso_dispositivo_navegador
    on public.producao_acesso_dispositivos (navegador_id)
    where navegador_id is not null;

commit;

-- ============================================================================
--  COMO DESFAZER
--
--    drop index if exists public.idx_acesso_dispositivo_navegador;
--    alter table public.producao_acesso_dispositivos drop column navegador_id;
-- ============================================================================
