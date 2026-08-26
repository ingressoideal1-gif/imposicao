-- ════════════════════════════════════════════════════════════════════════════════
-- SQL MIGRATION: a arte de fundo da numeracao exclusiva de cliente fica guardada
-- Execute no SQL Editor do Supabase (vwbtitjlpelrcnsytzqw)
-- ════════════════════════════════════════════════════════════════════════════════
--
-- POR QUE
-- A "Arte de Fundo" do editor de numeracao e a referencia por baixo do canvas: e
-- contra ela que o operador posiciona a numeracao. Ate agora ela nunca foi
-- guardada. Existiam dois jeitos de ela aparecer, e nenhum sobrevivia ao save:
--
--   1. Automatico: autoLoadCorBg() traz o PDF da cor mais antiga do formato base.
--      Isso continua valendo e nao muda nada — a arte e da COR, nao da numeracao.
--   2. Manual: o operador carrega um arquivo pelo botao 🖼️ Arte de Fundo. Esse
--      arquivo vivia so em memoria. Fechar o editor e reabrir a numeracao trazia
--      de volta a arte da cor, e o trabalho de referencia se perdia.
--
-- Numa numeracao EXCLUSIVA DE CLIENTE isso doi de verdade: a referencia e a arte
-- daquele cliente, nao a do catalogo de cores. Regra do usuario (26/08/2026):
-- *"quando a numeracao for exclusiva do cliente e for carregado uma arte de fundo,
-- ao salvar a numeracao deve salvar a arte de fundo (referencia), deve ser
-- persistente"*.
--
-- O QUE GUARDA
--   bg_url       A URL publica do arquivo em artes/fundos-numeracoes/<id>.<ext>.
--                E o arquivo ORIGINAL que o operador carregou — PDF continua PDF.
--                A rasterizacao acontece so na hora de desenhar no canvas, como
--                sempre aconteceu, e nunca no que fica gravado.
--   bg_filename  O nome que o operador reconhece, para o rotulo 📎 da barra.
--
-- SO PARA NUMERACAO DE CLIENTE
-- A gravacao acontece quando a numeracao tem Cli_Num. A numeracao generica do
-- catalogo continua tirando o fundo da cor do formato base, que e compartilhado e
-- ja esta guardado em producao_cores — duplicar aquilo por numeracao seria manter
-- duas verdades sobre o mesmo desenho.
--
-- VAZIO = SEM ARTE PROPRIA
-- Coluna vazia significa "use a arte da cor", que e exatamente o comportamento de
-- hoje. Por isso a migracao e aditiva e nenhum dado existente precisa conversao.
-- Remover a arte pelo ✕ e salvar limpa as duas colunas — deixar o endereco de um
-- arquivo que o operador tirou da tela seria mentira guardada.
--
-- O ARQUIVO ANTIGO NAO E APAGADO
-- O caminho no bucket leva a extensao (<id>.pdf, <id>.png), entao trocar um PDF por
-- um PNG deixa o anterior orfao em artes/fundos-numeracoes/. E lixo lento e
-- inofensivo, do mesmo tipo que deleteNumeracao() ja deixa em previews-numeracoes/.
--
-- ORDEM DE PUBLICACAO
-- Rode este ALTER ANTES de publicar o frontend. O app escreve a numeracao direto no
-- Supabase (frontend/script.js, funcao api()), e gravar uma coluna que ainda nao
-- existe faz o PostgREST recusar o registro inteiro. Enquanto o ALTER nao rodar, o
-- editor detecta a ausencia das colunas e avisa na propria barra da Arte de Fundo,
-- em vez de fingir que guardou.

ALTER TABLE producao_numeracoes
ADD COLUMN IF NOT EXISTS bg_url TEXT DEFAULT '';

ALTER TABLE producao_numeracoes
ADD COLUMN IF NOT EXISTS bg_filename TEXT DEFAULT '';
