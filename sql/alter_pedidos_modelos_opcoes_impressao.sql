-- ════════════════════════════════════════════════════════════════════════════════
-- SQL MIGRATION: opcoes de impressao que cada modelo guarda para quando combina
-- Execute no SQL Editor do Supabase
-- ════════════════════════════════════════════════════════════════════════════════
--
-- POR QUE
-- Ao imprimir dois ou mais modelos numa folha so, duas escolhas do operador se
-- perdiam a cada abertura da tela: se o numero do modelo sai impresso em cada
-- item, e se a tiragem e sequencial ou blocada. Sem lugar para guardar, o campo
-- ficava com o que sobrou do modelo anterior — e a folha saia com a configuracao
-- de outro trabalho.
--
-- ONDE ESTAS COLUNAS VALEM, E ONDE NAO VALEM
-- Elas sao lidas SOMENTE quando ha dois ou mais modelos marcados na fila. Com um
-- modelo so, quem manda continua sendo a Regra de Paginacao da tela, o padrao do
-- Formato e o campo `blocos` do ERP, exatamente como antes desta migracao. Foi
-- decisao do usuario em 18/08/2026: o caminho de um modelo so ja esta validado e
-- rodando na grafica, e nao muda por causa de um recurso novo.
--
-- NULO = NUNCA ESCOLHIDO
-- Modelo sem nada gravado se comporta como sempre: ao combinar, o modo efetivo
-- vem do `blocos` do ERP e, na falta dele, do padrao do Formato. Por isso a
-- migracao e aditiva e nao converte nenhum dado existente.
--
-- ATENCAO: a tabela e `pedidos_modelos`, NAO `producao_os_itens`. Os arquivos de
-- schema em sql/ descrevem producao_os_itens, mas o aplicativo deixou essa tabela
-- para tras — quem le e escreve os modelos de um pedido e o loadOSItens, sobre
-- pedidos_modelos.

ALTER TABLE pedidos_modelos
ADD COLUMN IF NOT EXISTS imprimir_numero_modelo BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS modo_impressao          TEXT,
ADD COLUMN IF NOT EXISTS cutstack_modo           TEXT,
ADD COLUMN IF NOT EXISTS cutstack_folhas         INTEGER;

COMMENT ON COLUMN pedidos_modelos.imprimir_numero_modelo IS
    'Ao combinar modelos, imprime o numero do modelo deitado na borda de cada item. Nasce FALSE de proposito: marca nova no papel nao aparece sozinha.';

COMMENT ON COLUMN pedidos_modelos.modo_impressao IS
    'Modo escolhido pelo operador para quando este modelo entra numa folha combinada: sequencial ou blocado. NULL = nunca escolhido, e o modo vem do campo blocos do ERP ou do padrao do Formato.';

COMMENT ON COLUMN pedidos_modelos.cutstack_modo IS
    'Acompanha modo_impressao = blocado: independent, strict ou strict_assembly. NULL = usar o default_cut_stack_mode do Formato.';

COMMENT ON COLUMN pedidos_modelos.cutstack_folhas IS
    'Acompanha modo_impressao = blocado: folhas por bloco. NULL = usar o campo bloco do ERP e, na falta dele, o valor da tela.';
