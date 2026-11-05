# Prioridade da alteração na Lista de Arte

Preparação em 05/11/2026, baseada em origin/main fc73cfd0 e atualizada após o PR SQL #256.

O pedido 24537 tinha status global Em Alteração e 24 modelos REPROVADA_CLIENTE,
mas o link conservava Enviar Arte sem abertura registrada. O frontend e a
função SQL verificavam Enviar Arte antes da alteração e retornavam aprovacao.

A alteração passa a prevalecer sobre envio ou aprovação antiga. A condição
existente que reconhece todos os modelos aprovados permanece; cancelamento,
produção e pendência de dados mantêm suas regras anteriores.

## Entrega

- frontend/script.js: prioridade no classificador.
- sql/card_arte_alteracao.sql: nova migração transacional, somente substitui
  public.imposition_card_arte_calcular(text,text,text,text,boolean,jsonb).
- sql/card_arte_alteracao_rollback.sql: definição consultada em produção nesta
  revisão, para recuperação. Não altera pedidos nem permissões.
- tests/card_arte_alteracao.mjs: 9 cenários, comparando frontend e PostgreSQL
  em memória via PGlite já disponível na máquina, sem instalar dependências.

## Validação

18 verificações específicas passaram; node --check frontend/script.js e
git diff --check passaram. O harness geral tests/lista_arte_harness.js falha
também em HEAD antes desta alteração: verificação de recarga de numerações e
ReferenceError: window is not defined em bancoDeDadosIncompletoDoModelo.

## Aplicação SQL e publicação web

PR SQL #256 integrado em aed0d7828cbae1c4911add3c8fa3f997abbafe05, com todos
os checks obrigatórios aprovados. Migração aplicada em produção numa transação
com verificação da assinatura anterior, integridade do pedido e permissões.
Nova consulta confirmou card fila, status Em Alteração e 24 modelos reprovados.
O hash dos registros de proposta, arte, modelos e link permaneceu
375795805945505288e4dcc06930f53e. Assinatura da função após aplicação:
9157e8ac84774c38446c3d7f314bffb5. Frontend segue para publicação protegida.

A primeira tentativa local parou por Puppeteer não encontrado no worktree.
NODE_PATH foi apontado para node_modules já existente; os 137 testes dos
arquivos afetados por essa ausência passaram, sem alteração de dependências.

Antes de reaplicar ou recuperar, comparar a definição vigente e revisar
eventual mudança posterior.
O escopo SQL é uma função, zero linhas de pedidos atualizadas diretamente;
os consumidores passam a usar a nova classificação na próxima leitura.
Em erro antes do commit, rollback da transação; depois, usar o script de
recuperação preservado. Não editar o status do pedido para mascarar o defeito.

Validação após implantação: consultar imposition_card_arte_ler(24537), que
deve retornar fila enquanto persistirem as condições diagnosticadas; abrir
o painel atualizado e conferir o pedido no card Em Arte com Em Alteração.
Conferir que seus 24 modelos e o status comercial não foram modificados.
