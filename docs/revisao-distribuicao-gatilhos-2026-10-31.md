# Revisão de interação com gatilhos — correções locais validadas

Revisão em 31/10/2026. Consultas remotas exclusivamente `BEGIN READ ONLY`, com
timeout de 20 segundos. Nenhuma função, gatilho, permissão ou linha comercial foi
alterada em produção. A seção histórica abaixo descreve a primeira revisão. As correções posteriores
e sua validação estão no adendo ao final.

Foram lidos os 35 gatilhos das seis fontes da distribuição e suas 26 funções,
além de dependências de classificação, catálogo e pagamentos. Metadados, hashes
das funções e resultados estão em
`docs/evidencias/distribuicao-designers-gatilhos-20261031.json`.

## 1. Crítico: deadlock com o catálogo, mesmo desativado

`arte_fila.travar()` adquire a trava global `(731031,1)` incondicionalmente em
`BEFORE STATEMENT`, inclusive quando a configuração está desativada.

Os gatilhos existentes de `producao_numeracoes` adquirem a trava de numeração
`imposition-verso-vibe-20261006:<id>` e depois atualizam `pedidos_modelos`.
Já a atualização direta de um modelo passa primeiro pela nova trava global e
depois pelos gatilhos de categoria/verso, que pedem a trava de numeração.

Reprodução em duas conexões PostgreSQL 17.11:

1. Catálogo adquire a trava da numeração.
2. Modelo adquire a trava global e espera a numeração.
3. Catálogo tenta atualizar o modelo e espera a trava global.
4. PostgreSQL detecta **40P01** e aborta uma das operações.

O teste foi executado com `ativo=false`. Portanto, instalar desativado também
introduziria esse risco; a prova de concorrência anterior cobria somente duas
entradas de pedido, não a interação com o catálogo.

Correção necessária: redesenhar/ordenar a aquisição das travas considerando os
pontos de entrada externos, e garantir que o mecanismo desativado não introduza
a trava global nas operações comerciais. Não simplesmente retirar a trava sem
substituir a garantia de consistência da distribuição.

## 2. Alto: chamadas legítimas de outros gatilhos são ignoradas

`arte_fila.reconciliar()` retorna quando `pg_trigger_depth() > 1`.
O gatilho existente `tg_atualiza_status_proposta_pagamento` atualiza `propostas`
a partir de `pagamentos_v2`, que não é uma das fontes observadas diretamente.

Com a função existente e dados sintéticos, a alteração da proposta ocorre, mas a
reconciliação da fila é ignorada. Resultado confirmado após a transação:

| Verificação | Resultado |
|---|---|
| `arte_fila.pedidos.em_arte` persistido | `false` |
| `arte_fila.em_arte(pedido)` recalculado | `true` |

A carga permanece incorreta até outro evento que realmente reconcilie o pedido.
O cenário usa o gatilho financeiro existente para exercitar a chamada aninhada;
não autoriza alterar sua regra de status nem é uma auditoria do módulo financeiro.

Correção necessária: distinguir a recursão causada pela própria atribuição das
mudanças legítimas de outras rotinas. Recolher os pedidos afetados e processar o
estado final, sem ignorar indiscriminadamente toda chamada aninhada.

## 3. Alto: classificação divergente da fila já persistida

O banco já possui `imposition_card_arte_ler()` e
`imposition_card_arte_calcular()`, usados pelos gatilhos de etapas. A nova função
`arte_fila.em_arte()` duplica esse contrato e diverge nos casos reproduzidos:

| Caso sintético | Classificador existente | Nova carga |
|---|---|---|
| Arte `IGNORAR` | Fora das filas (`NULL`) | Conta em Em Arte |
| `PENDENTE INFORMAÇÃO` | `pendente` | Conta em Em Arte |
| Modelo `CORRIGIR_ARTE` em pedido já em produção | `fila` | Não conta em Em Arte |

Correção necessária: alinhar a distribuição ao classificador persistido existente
e testar o vocabulário completo. Não mudar o classificador atual para acomodar
uma cópia incompleta introduzida pelo rodízio.

## Interações que se comportaram como esperado

- A aprovação direta de modelo, passando por `sync_status_arte_to_briefing()` e
  `recalcular_status_arte_briefing()`, foi refletida na carga pelo AFTER STATEMENT.
- Atribuir outro designer preservou o status da arte no teste.
- Atualizar somente `designer_uid`/`designer_nome` não dispara os gatilhos
  `UPDATE OF status`, incluindo a promoção de proposta e a trava de backup.
- A alteração de designer dispara `piloto_revisao_v2` e aumenta a revisão de cache
  do pedido. É efeito existente esperado, confirmado com as funções reais.
- Os gatilhos de etapas e decisões de aprovação inspecionados têm guardas que
  ignoram alteração apenas de designer. Isso foi conferido no código, não reproduzido
  com todos os históricos/serviços externos do ambiente real.

## Reprodução e limites

```powershell
.\venv\Scripts\python.exe tests\distribuicao_designers_postgres.py C:\caminho\pgsql\bin\psql.exe --revisar-gatilhos
```

O harness cria cluster novo em TEMP, somente loopback, e encerra o servidor ao
final. `tests/distribuicao_designers_gatilhos_fixture.sql` contém as funções reais
selecionadas e os hashes de origem disponíveis; auxiliares de compatibilidade do
catálogo são dublês declarados. Nenhuma linha real foi copiada.

O cenário de deadlock adiciona uma pausa de teste para controlar a intercalação
das conexões, sem trocar a ordem de travas das funções reais. O cenário de
pagamento testa a cadeia relevante, não todos os gatilhos financeiros.

`resultado: OK` no harness significa que a reprodução e as verificações foram
executadas; **`instalacao_aprovada: false`** é o resultado da revisão. Os três
bloqueios precisam ser corrigidos e estes casos transformados em regressões
de comportamento correto antes de instalar. A revisão não aplicou correções
de produção nem alterou regras financeiras ou permissões.


## Adendo: correções e nova validação em 31/10/2026

Os três cenários bloqueadores passaram nos testes locais. Não houve instalação,
ativação ou publicação. A aprovação dos testes não autoriza produção.

1. `arte_fila.em_arte()` chama exclusivamente `imposition_card_arte_ler()`.
   IGNORAR e PENDENTE INFORMAÇÃO não contam; CORRIGIR_ARTE conta em Em Arte.
2. Os gatilhos da distribuição apenas inserem eventos independentes. Não adquirem
   a trava de distribuição e não ignoram chamadas aninhadas. O consumidor privado
   processa as transações confirmadas; a cadeia pagamento → proposta converge.
3. A comparação sem nenhum gatilho da distribuição revelou também um deadlock
   preexistente: linha do modelo → trava da numeração versus trava da numeração →
   linha do modelo. Portanto, a retirada da trava antiga da fila, isoladamente,
   não era suficiente. O usuário autorizou ampliar a correção local para esse fluxo.

`sql/ordenar_travas_catalogo_modelos.sql` acrescenta dois gatilhos BEFORE STATEMENT
com a mesma trava `(731031,2)`, antes dos locks de linha: INSERT/alteração de vínculo
ou verso nos modelos e alteração de print_mode no catálogo. A chamada interna do
catálogo para modelos reutiliza a trava na mesma transação. Nenhuma função legada
é substituída; compatibilidade, autorização e propagação atômica permanecem.

Custo: essas operações passam a ser serializadas até o commit, mesmo entre
numerações diferentes. Atualizações de apenas status nos modelos não usam essa
trava. Transações arbitrárias que primeiro executem SELECT FOR UPDATE ou tomem
advisory locks manualmente não estão cobertas: os pontos de entrada devem manter
a mesma ordem. Não se afirma ausência universal de deadlocks.

Prova com PostgreSQL 17.11 descartável, duas conexões reais:

| Cenário | Resultado |
|---|---|
| Antes da correção, com captura da fila | 40P01 reproduzido |
| Antes da correção, sem gatilhos da fila | 40P01 reproduzido |
| Após correção, sem gatilhos da fila | Ambas as transações confirmam |
| Após correção, fila ativa | Ambas confirmam, sem deadlock |
| Modelo primeiro, catálogo depois | Ambas confirmam; verso propagado |
| Pagamento alterando proposta indiretamente | Carga persistida e calculada iguais |
| Três divergências de classificação | Paridade com classificador existente |
| Evento com ID anterior e commit posterior | Evento preservado e processado depois |
| Dois consumidores simultâneos | Uma decisão, sem duplicar auditoria |

O teste mantém as versões legadas da fixture para reproduzir o defeito antes de
aplicar o novo SQL no cluster temporário. Ele retorna erro se as três regressões
não passarem. Evidência atual: `docs/evidencias/distribuicao-designers-correcao-20261031.json`.

O agendador remoto foi apenas consultado: pg_cron 1.6 está instalado. A ativação
local prepara `cron.schedule` a cada cinco segundos; a desativação remove esse job.
Nos testes locais, cron é um dublê transacional e o consumidor é chamado
explicitamente. Execução real pelo agendador permanece pendente de instalação
separadamente autorizada. Referência do contrato: [pg_cron](https://github.com/citusdata/pg_cron#cron-syntax).


## Segunda revisão: ciclo de ativação, primeira entrada e falha de consulta

Após as provas de concorrência, a revisão encontrou três caminhos adicionais,
reproduzidos com dados sintéticos e corrigidos localmente:

| Falha reproduzida | Correção e regressão |
|---|---|
| Troca A → B com fila desligada era desfeita após reativar | A base passa a respeitar B; evento posterior mantém B; fixação antiga é limpa |
| Pedido pendente entrava em Arte e gerava carga 4/0/0 | Primeira entrada passa pelo rodízio; retorno de alteração e fixação continuam preservados |
| Cache inativo + falha de rede liberava atribuição legada | Falha invalida confirmação; inclusive o atalho consulta e não grava override |

As correções foram feitas no SQL da distribuição e no módulo/atalho do painel.
A ordenação de travas do catálogo/modelos não foi modificada nesta etapa.
Os harnesses agora incluem 87 verificações SQL e 40 de painel/calendário/integração,
além do navegador e da concorrência em PostgreSQL descartável. Instalação,
ativação em produção e prova do agendador real permanecem pendentes.
