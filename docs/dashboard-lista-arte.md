# Dashboard da Lista de Arte

O card **Dashboard** é o primeiro card da Lista de Arte e troca a tabela operacional por uma visão analítica. Os filtros de designer existentes também filtram o dashboard. O período pode ser **Hoje**, **7 dias** ou **30 dias**.

## Métricas atuais

- Pedidos finalizados no período e comparação com o período anterior.
- Tempo médio e mediano acumulado em `Em Arte` por pedido.
- Percentual finalizado em até 2 horas (SLA inicial sugerido, apenas visual).
- Pedidos em arte agora e idade média do backlog.
- Pedidos em alteração e aguardando aprovação agora.
- Finalizações diárias, distribuição atual do fluxo e volume recebido.
- Ranking por designer: finalizados, produtos, média, mediana, SLA, carga ativa, alterações e aprovações.
- Ranking por atendente: finalizados, produtos, média, mediana, SLA, carga ativa, pendências e aprovações.
- Produção por produto: pedidos, linhas de produto, quantidade e tempo médio dos pedidos que contêm o produto.

O dashboard não altera cálculos, status ou filas. Ele usa `state.ordens`, `pedidos_artes`, `produtos_proposta` e `imposition_tempo_no_card`, já carregados pela Lista de Arte. A quantidade é a `qtd` comercial original, sem divisão ou conversão.

## Regra de confiabilidade

Uma linha histórica encontrada pela primeira vez já em `concluidos` recebe um `desde`, mas não comprova quando o trabalho terminou. Por isso, uma finalização só entra nas métricas quando `imposition_tempo_no_card.saiu_da_fila_em` prova que o painel observou a saída de `Em Arte`. Cancelamentos não contam como produtividade.

O indicador de alteração é uma fotografia atual, não uma taxa histórica de retrabalho. O banco atual guarda apenas o último card de cada pedido, não todas as transições.

## Evoluções recomendadas

Para uma avaliação mais justa e completa, criar em tarefa própria um histórico append-only de eventos da arte, com entrada, atribuição, início, pausa, envio, abertura pelo cliente, alteração, aprovação e conclusão. Isso permitiria separar:

- tempo ativo do designer, espera pelo atendimento e espera pelo cliente;
- aprovação na primeira versão e número médio de revisões;
- prazo cumprido por designer e por complexidade do pedido;
- devolução da produção por erro de arte;
- capacidade por quantidade de produtos, modelos, páginas e itens, evitando comparar apenas volume bruto;
- equilíbrio de distribuição da fila e tempo até a primeira ação;
- tendências semanais consistentes mesmo depois de o pedido sair das listas atuais.

Essas evoluções exigem backend/banco e uma definição conjunta dos eventos. Não fazem parte desta entrega frontend.
