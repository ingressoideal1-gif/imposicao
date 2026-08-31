-- ═══════════════════════════════════════════════════════════════════════════
--  ESCALA DA ARTE NO MODO PDF MULTI-PÁGINA
--  Pedido do usuário em 31/08/2026. Rode inteiro no editor SQL do Supabase.
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ## O que ele pediu
--
--   "quando a arte for feita upload pelo modo 'PDF Multi-Página', além de
--    trazer o pdf a janela de visualização, vamos adicionar 2 inputs de escala
--    para o pdf, % horizontal e % vertical, vai escalar apenas o pdf, apenas a
--    camada da arte (pdf) e vai utilizar mesma escala para arte no motor de
--    impressão, imposição, gerar pdf."
--
-- E, sobre o ponto de apoio da escala:
--
--   "ao escalar o pdf multi-páginas vai manter centralizado a célula de
--    impressão e visualização."
--
-- ## Por que as duas colunas moram AQUI
--
-- `pedidos_modelos` é a tabela do Ideal Imposition — não é do parceiro —, e ela
-- já guarda as outras escolhas de impressão do modelo: `modo_pdf`,
-- `modo_impressao`, `cutstack_modo`, `cutstack_folhas`, `entregar_por_bloco`,
-- `imprimir_numero_modelo`. A escala é da mesma família: uma decisão que o
-- operador toma uma vez e que precisa valer de novo quando o pedido for
-- reaberto, reimpresso ou tiver uma célula refeita semana que vem.
--
-- Guardar só na tela pareceria mais barato e sairia caro: a reimpressão de
-- amanhã sairia num tamanho e a de hoje em outro, sem nada na tela dizendo por
-- quê.
--
-- ## Por que o padrão é 100
--
-- Porque 100% é exatamente o que o motor faz hoje: a arte entra na célula no
-- tamanho natural do arquivo, centralizada. Com `default 100` toda linha que já
-- existe passa a dizer, explicitamente, o que ela já fazia — e nenhum pedido em
-- produção muda de comportamento por causa desta migração.
--
-- O `not null` vem junto pelo mesmo motivo: nulo obrigaria todo leitor (motor,
-- painel, prévia) a lembrar de traduzir nulo para 100, e um esquecimento viraria
-- arte em escala zero no papel.
--
-- ## O que NÃO muda
--
-- Nada é criado, renomeado ou apagado. `numeric` aceita a casa decimal que a
-- tela oferece (100,5%) sem o erro de arredondamento que um `real` traria.

alter table public.pedidos_modelos
    add column if not exists arte_escala_h numeric not null default 100,
    add column if not exists arte_escala_v numeric not null default 100;

comment on column public.pedidos_modelos.arte_escala_h is
    'Escala horizontal da camada de arte (PDF) deste modelo, em %. 100 = tamanho natural do arquivo, que e o comportamento historico do motor. Usada no modo PDF Multi-Pagina.';

comment on column public.pedidos_modelos.arte_escala_v is
    'Escala vertical da camada de arte (PDF) deste modelo, em %. 100 = tamanho natural do arquivo. A arte fica sempre centralizada na celula.';

-- ── Conferência ────────────────────────────────────────────────────────────
-- Depois de rodar, isto tem de devolver duas linhas, ambas com padrão 100:
--
--   select column_name, data_type, column_default, is_nullable
--     from information_schema.columns
--    where table_schema = 'public'
--      and table_name = 'pedidos_modelos'
--      and column_name in ('arte_escala_h', 'arte_escala_v');
--
-- ── Como desfazer ──────────────────────────────────────────────────────────
-- Só se a decisão for revertida, e sabendo que isso apaga as escalas já
-- ajustadas pelos operadores:
--
--   alter table public.pedidos_modelos drop column arte_escala_h;
--   alter table public.pedidos_modelos drop column arte_escala_v;
