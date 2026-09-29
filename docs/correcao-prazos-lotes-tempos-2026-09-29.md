# Prazo de entrega e tempo por etapa — 29/09/2026

## Diagnóstico

O console da estação 1.2.344 mostrou 4.685 pedidos carregados e HTTP 400
nas consultas de propostas_os e pedidos_modelos. Uma leitura de propostas_os
com 4.685 números (URL de 28.230 bytes) reproduziu HTTP 400; com 100 números,
HTTP 200. Os dez pedidos visíveis na captura possuem data_termino no ERP.
As consultas extensas já existiam antes da atualização 1.2.344.

A etapa pendente emitida pela classificação do painel não consta do CHECK
imposition_tempo_no_card_card_check do SQL original. O console confirmou
rejeição de gravação por essa restrição. Não houve exclusão de dados.

## Correção local

- Prazos/rastreamento em lotes de 100 pedidos; falha aborta o carregamento,
  preserva a lista anterior e usa o aviso de erro já existente.
- Modelos para sincronização em lotes de 100 pedidos e páginas ordenadas de
  500 modelos. Nenhuma reconciliação começa antes de completar a leitura.
- Falha ou concorrência na gravação dos tempos devolve o estado anterior para
  permitir nova tentativa. Uma leitura posterior não é sobrescrita pelo rollback.
- Rótulo Pendente incluído no nome das etapas do relógio.

## Banco: aplicação confirmada pelo operador

Executar sql/tempo_no_card_pendente.sql no projeto de produção
vwbtitjlpelrcnsytzqw. Alvo: somente o CHECK da tabela public.imposition_tempo_no_card.
Nenhuma linha é alterada pelo script. Prévia, transação, limite de espera por lock,
verificação posterior e recuperação constam no arquivo. O SQL antigo permanece
intacto. A restrição ampliada aceita o frontend anterior; não reduzir novamente
se já existirem relógios pendentes. Não executar migração como parte dos testes.
O operador aplicou o SQL e enviou o resultado de pg_get_constraintdef contendo
pendente. Esta é a evidência de aplicação; não houve execução remota pelo agente.

## Validação

- 88 testes de prazo, ordenação e sintaxe do frontend passaram.
- Regressão adicional com 4.685 pedidos, 501 modelos em um lote, falha parcial
  sem reconciliação, tentativa posterior de gravação e proteção contra resposta
  tardia passou (painel_prazos_lotes_harness.js).
- 81 verificações do relógio passaram; carga da Lista de Arte passou.
- estacao_sem_sessao_harness.js: nove falhas preexistentes foram reproduzidas
  no HEAD anterior. O executor não carregava lerDadosLista nem
  pedidoIgnoradoNosPaineis. Incluídas as funções reais no ambiente simulado,
  as 17 conferências passaram sem retirar asserções.

## Entrega

Entrega autorizada pelo usuário com "entrega segura". Worktree
ideal-imposition-faixa-22770; checkout principal preservado. Frontend v972 e MSI 1.2.345 publicados e conferidos; evidências em
docs/evidencias/newprod-prazos-v972-1.2.345-publico.json. Nas estações,
instalar a atualização e
conferir a tela autenticada e o console após recarregar. Testes locais não
comprovam gravação no banco nem recuperação do painel já aberto.
