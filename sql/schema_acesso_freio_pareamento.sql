-- ============================================================================
-- Freio de forca bruta do pareamento da portaria
--
-- Cole este arquivo INTEIRO no editor SQL do projeto e execute.
-- Projeto: vwbtitjlpelrcnsytzqw  (o painel o chama de "e-deal")
--
-- ATENCAO ao escolher o projeto: a conta tem outros chamados "Ideal Imposicao"
-- e "Ideal Control" que NAO sao os desta aplicacao -- sao restos de tentativas
-- antigas. Escolher pelo nome leva ao lugar errado.
-- ============================================================================
--
-- POR QUE ESTA TABELA EXISTE
--
-- Ate 16/08/2026 a contagem de tentativas erradas de pareamento vivia num
-- dicionario na memoria do processo Python (`_FALHAS`, em acesso_portaria.py).
-- O proprio codigo registrava a limitacao: nao sobrevivia a um reinicio do
-- Render, e com duas instancias nao valeria nada.
--
-- Ao virar Edge Function, que e stateless por natureza, o freio deixaria de
-- existir por completo -- cada invocacao comecaria a contagem do zero.
--
-- Ha um segundo motivo, que vale durante a transicao: enquanto o Python e a
-- Edge Function responderem ao mesmo tempo, os dois precisam contar no MESMO
-- lugar. Contagens separadas dariam ao atacante o dobro de tentativas, bastando
-- alternar entre os dois enderecos.
--
-- Este e o SEGUNDO freio, nao o primeiro: 31^6 sao 887 milhoes de codigos
-- possiveis, e cada tentativa ja custa um PBKDF2 de 10.000 voltas.
-- ============================================================================

create table if not exists producao_acesso_falhas_pareamento (
    id          bigserial primary key,
    evento_id   uuid not null,
    momento     timestamptz not null default now()
);

-- A unica consulta que existe e "quantas falhas deste evento nos ultimos N
-- segundos". Sem este indice ela varre a tabela inteira -- justamente quando
-- ela esta crescendo por causa de um ataque.
create index if not exists idx_falhas_pareamento_evento_momento
    on producao_acesso_falhas_pareamento (evento_id, momento desc);

-- Sem limpeza a tabela cresce para sempre por causa de um ataque que ja
-- fracassou. Nada aqui precisa de historico: passada a janela, a linha e lixo.
-- A janela do codigo e de 5 minutos; uma hora aqui e folga deliberada, para o
-- caso de alguem querer olhar o que aconteceu logo depois.
create or replace function limpar_falhas_pareamento_antigas()
returns void
language sql
as $$
    delete from producao_acesso_falhas_pareamento
     where momento < now() - interval '1 hour';
$$;

-- ============================================================================
-- RLS -- nao precisa ligar a mao, e isso foi CONFERIDO
--
-- Este projeto liga RLS sozinho em tabela nova do schema public. Verificado em
-- 16/08/2026, logo depois de rodar este arquivo:
--
--     select relname, relrowsecurity from pg_class
--      where relname = 'producao_acesso_falhas_pareamento';
--     -> relrowsecurity = true
--
-- E conferido tambem pelo comportamento, que e o que importa: com a chave
-- ANONIMA (que e publica, esta no frontend/supabase-config.js), ler a tabela
-- devolve `[]` mesmo havendo linha, e um DELETE responde 204 sem apagar nada.
--
-- ATENCAO ao interpretar esses codigos: com RLS ligado e zero politicas, o
-- PostgREST responde SUCESSO e nao faz nada. Um 200 ou um 204 aqui nao provam
-- acesso -- so provar lendo a linha de volta com a chave de servico.
--
-- Se isso nao fosse verdade, o buraco seria grave: qualquer um com a chave
-- anonima apagaria as proprias falhas e o freio deixaria de existir.
-- ============================================================================

-- ============================================================================
-- CONFERENCIA -- rode depois e veja se devolve as tres linhas esperadas.
-- ============================================================================
-- select 'tabela' as o_que, count(*)::text as resultado
--   from information_schema.tables
--  where table_name = 'producao_acesso_falhas_pareamento'
-- union all
-- select 'indice', count(*)::text
--   from pg_indexes
--  where indexname = 'idx_falhas_pareamento_evento_momento'
-- union all
-- select 'funcao de limpeza', count(*)::text
--   from pg_proc
--  where proname = 'limpar_falhas_pareamento_antigas';
