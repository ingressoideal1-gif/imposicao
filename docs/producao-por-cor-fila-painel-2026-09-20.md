# Produção por Cor limitada à fila do Painel de Produção

O usuário esclareceu após v920: listar apenas pedidos listados no Painel de Produção. Este critério substitui a abrangência de todos os pedidos adotada na v915.

A página agora parte de state.ordens atualizado e aplica as mesmas funções da fila base em renderOrdens: exclui pedidoIgnoradoNosPaineis, exclui pedidoJaPassouDaGrafica e exige pedidoNaGrafica. A consulta paginada de modelos recebe somente os números desses pedidos. Não busca nem acrescenta pedidos externos à fila. Não replica pesquisa textual, paginação visual ou filtros temporários de interface do outro painel.

Dentro dessa fila, mantém apenas modelos Aguardando, incluindo o legado PENDENTE corrigido na v920, e conserva o agrupamento por produto/cor. Impresso e Corrigir Arte não entram. Pedidos Ignorar, em Arte, Expedição ou Entregues deixam de alimentar as opções, mesmo com modelos aguardando.

Regressões: cenário de 30 produtos/60 modelos PENDENTE permanece passando; pedidos em produção/acabamento entram, pedidos fora da fila não entram; pedido ausente não é acrescentado nem aberto; navegador verifica a exclusão do produto de um pedido em Arte. Suíte selecionada de Produção por Cor e sintaxe do frontend: 78 testes aprovados, com dados simulados.

Entrega frontend sobre f8c3a97b/v920, no escopo de publicação já autorizado. Conferir HTML e módulo nos dois domínios após propagação. Sem alteração remota de banco ou instalação do agente.
