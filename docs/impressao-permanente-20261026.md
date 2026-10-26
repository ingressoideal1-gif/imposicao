# Confirmacao permanente de impressao

Preparacao local, ainda nao aplicada ao Supabase. Base: origin/main 9892e486,
branch fix/impressao-permanente-20261026, em worktree isolado. Nenhuma mudanca no
checkout principal, dependencia, instalador, dados reais ou migracao anterior.

## Comportamento

Depois de confirmado como Impresso, pedidos_modelos.status_impressao pode
voltar a Aguardando por escolha explicita do operador no seletor. O painel usa
a RPC retornar_impressao_aguardando, com modelo, pedido e carimbo esperado.
A RPC bloqueia a linha, confere o estado e devolve exatamente o registro salvo.
Tela antiga ou repeticao da acao e recusada. Atualizacao direta, sincronizacao,
autosave e upsert nao podem regredir Impresso: recebem erro 23514, com rollback
da gravacao inteira. Vazio, PENDENTE, Parcial e Corrigir Arte continuam recusados.

A primeira confirmacao nova usa statement_timestamp() do banco. O campo
status_impressao_em nao muda com retorno manual, reimpressao, repeticao,
variacao de caixa/espacos ou payload antigo. status_impressao_registrado_em
registra a ultima transicao de status, inclusive o retorno manual autorizado.
Datas enviadas pelo cliente nao substituem o primeiro horario.
O carimbo e da confirmacao registrada, nao uma medicao da impressora fisica.

Acabamento e outros campos continuam editaveis conforme as permissoes existentes.
Refazer continua usando o fluxo que aceita modelos impressos. O operador tambem
pode retornar a Aguardando; isso nao apaga a primeira impressao.
Corrigir Arte permanece permitido antes de Impresso; apos Impresso a
tentativa e recusada. DELETE de um modelo impresso, ou com evidencia de hora
legada, tambem e recusado, inclusive quando alcancado por cascata. Operacoes
administrativas como desabilitar gatilhos ou TRUNCATE nao fazem parte desta
garantia de gravacoes normais. A RPC e SECURITY INVOKER e usa as permissoes e
RLS existentes da tabela. anon/authenticated/service_role recebem EXECUTE,
sem novos grants de tabela. O caminho explicito distingue a operacao manual
das gravacoes comuns; nao autentica uma identidade humana adicional.

Impressos legados sem hora continuam sem hora: a migracao nao inventa datas.
Valores legados existentes sao preservados, inclusive os que tenham sido
preenchidos por aproximacao em migracoes antigas.

## Incidente 23997

O operador informou impressao e marcacao de 1003985 na GUSTAVO-PROD antes das
10h de 26/10. A leitura encontrou status_impressao e seus carimbos nulos,
acabamento Pronto as 10h34 de Brasilia. O schema audit nao estava exposto pela
API utilizada. A origem da perda e a hora exata nao foram comprovadas.
Nao ha reparo automatico desse modelo nem uso da hora do acabamento como hora
de impressao. O caso precisa de recuperacao separada, com evidencia e autorizacao.

## Validacao local

Usar PGLITE_MODULE apontando para uma instalacao existente de @electric-sql/pglite.
Executar na raiz deste worktree:

    node tests/impressao_permanente_pglite.cjs
    node tests/status_impressao_retorno_harness.js

Ambos passaram. O primeiro reproduz a perda com a funcao antiga e aplica a nova
migracao com PostgreSQL em memoria e dados sinteticos. Cobre hora do servidor,
regressoes, repeticao, alteracao direta de datas, legado sem hora, acabamento,
DELETE, upsert, retorno manual, carimbo esperado, RLS e rollback de lote.
Confirma SECURITY INVOKER. O segundo verifica
o contrato existente de sucesso somente com linha retornada, erros de rede,
respostas vazias/divergentes, retorno da lista e seletores manuais versus autosave.
Sintaxe dos dois arquivos JS alterados validada. Publicacao web, compatibilidade
com os paineis instalados e bateria completa dos dois canais ainda pendentes.
Nao houve build MSI ou alteracao de Python. Concorrencia entre conexoes,
gatilhos adicionais de producao e operacao real ainda dependem da validacao de
implantacao; os testes locais nao comprovam essas etapas.

## Aplicacao pendente de autorizacao

Alvo previsto: Supabase operacional, public.pedidos_modelos. A migracao faz DDL
transacional, substituindo carimba_status_impressao_em e seu gatilho, e criando
a RPC retornar_impressao_aguardando;
zero UPDATE/DELETE/INSERT de dados existentes. Afeta futuras gravacoes de todos
os modelos, nao somente o pedido 23997.

1. Executar impressao_permanente_preflight.sql em leitura autorizada; conferir
   projeto, definicoes, ordem dos gatilhos, contagens e cascatas. Guardar as
   definicoes anteriores e comparar com esta base antes de executar DDL.
2. Preparar publicacao coordenada do painel: versoes antigas nao usam a RPC e
   terao retorno manual recusado apos ativar a protecao. Autorizar e aplicar
   impressao_permanente.sql, com lock_timeout de 5s e
   statement_timeout de 30s. Uma falha exige ROLLBACK e diagnostico, sem insistir.
3. Reler pg_get_functiondef e pg_get_triggerdef, conferir gatilho habilitado para
   INSERT/UPDATE/DELETE e ausencia de mudancas nos registros do pedido.
4. Validar proxima confirmacao operacional autorizada e leitura dos carimbos,
   sem usar pedidos reais como testes de regressao.

Recuperacao: restaurar o painel anterior e, em transacao autorizada, funcao e
gatilho capturados no preflight; remover a nova RPC somente depois de retirar
seus consumidores. Nao executar novamente data_do_status_impresso.sql:
ele contem backfill de dados. Reverter DDL remove a protecao, mas nao apaga as
datas coletadas. Nao usar rollback para corrigir ou apagar historico operacional.
