-- ═══════════════════════════════════════════════════════════════════════════
--  A FOTO DA CAIXA  —  Painel do Acabamento
--  Rode este arquivo INTEIRO no SQL Editor do Supabase (ou pelo
--  `.\ferramentas\rodar_sql.ps1 sql\foto_do_volume.sql`).
--  Rodar duas vezes não faz mal.
-- ═══════════════════════════════════════════════════════════════════════════
--
--  POR QUE ELE EXISTE
--
--  Pedido do usuário em 28/08/2026:
--
--    "no painel de acabamento, ao clicar em dividir em volume e ao clicar
--     pesar este volume, ao abrir o modal compartilhado entre modelos,
--     adicionar o botão 'fotografar' — a foto será compartilhada entre os
--     modelos do volume"
--
--  A foto do material já existia, mas por MODELO
--  (`pedidos_modelos.acabamento_foto_url`, 20/08/2026): um botão de câmera em
--  cada card, uma foto para cada modelo. Uma caixa com quatro modelos dentro
--  pedia quatro fotos do mesmo trabalho.
--
--  A janela do volume é justamente o lugar em que os modelos já estão
--  reunidos. Uma foto tirada ali é UMA foto para a caixa inteira, e vale para
--  todos os modelos que estão dentro dela.
--
--  O QUE ESTA COLUNA NÃO FAZ
--
--  Ela não substitui `acabamento_foto_url`. As duas fotos respondem a
--  perguntas diferentes: a do modelo é o registro do que o REVISOR viu (o
--  papel contra a amostra aprovada), e a da caixa é o registro do que foi
--  EMBALADO. No card do modelo a foto própria vem primeiro; a da caixa aparece
--  quando o modelo ainda não tem a dele — ver `fotoDoVolumeDoModelo` no
--  `frontend/acabamento.js`.
--
--  Também não há coluna nova em `producao_volume_itens`: o pacote não tem foto
--  própria de propósito. É a CAIXA que vai à balança e é a caixa que se
--  fotografa; uma foto por pacote devolveria o problema que este pedido veio
--  resolver.
--
--  ONDE O ARQUIVO FICA
--
--  No mesmo bucket `artes`, prefixo `acabamento-fotos/`, que a foto do modelo
--  já usa — nome `volume_<pedido>_<setor>_<numero>_<carimbo>.jpg`. Bucket novo
--  com escrita anônima já falhou neste projeto antes, e a estação da gráfica
--  grava sem sessão do Supabase: reaproveitar o que já funciona é o caminho.
--  Por isso não há nada de Storage neste arquivo.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.producao_volumes
    add column if not exists foto_url text;

comment on column public.producao_volumes.foto_url is
    'Endereço público da foto desta caixa, no bucket "artes", prefixo '
    '"acabamento-fotos/". Uma só por volume, COMPARTILHADA pelos modelos que '
    'estão dentro dele. Não substitui pedidos_modelos.acabamento_foto_url, que '
    'é a foto do material vista pelo revisor. Nulo = a caixa não foi '
    'fotografada.';

-- ─── Conferência ───────────────────────────────────────────────────────────
select
    (select count(*) from information_schema.columns
      where table_schema = 'public' and table_name = 'producao_volumes'
        and column_name = 'foto_url')                   as volume_tem_foto,
    (select count(*) from public.producao_volumes)      as volumes_gravados,
    (select count(*) from public.producao_volumes
      where foto_url is not null)                       as volumes_fotografados;
