# Verde somente após confirmar Entrega/Nota

O botão Confirmar recebia incondicionalmente a classe `principal`, cujo fundo é
verde. A cor antecipava visualmente uma confirmação que ainda não tinha ocorrido.

Em `frontend/cliente-confirmacoes.js`, a classe passa a depender de
`portalConfirmacoes[qual] === true`. Antes de confirmar, enquanto grava e após
falha sem confirmação prévia, usa o botão neutro existente. Após sucesso, fica
verde com Confirmado. Desfazer retira o verde após salvar. Confirmações já salvas
continuam verdes ao reabrir. Entrega e Nota mantêm decisões independentes.

Não foram alteradas persistência, navegação, regras de aprovação ou backend.
`cliente.html` prepara a referência `cliente-confirmacoes.js?v=873`.

Validação: a regressão reproduziu nove falhas na base anterior e passou após a
correção (143 verificações). Os 22 testes selecionados de contratos/harnesses do
portal passaram; sintaxe JS e whitespace aprovados. Na primeira execução da
suíte, 15 testes não encontraram SQLs porque o checkout parcial não incluía
`sql/`; a pasta foi incluída e os 22 passaram sem alterar esses testes.
Chromium com CSS real, dados fictícios e gravação simulada confirmou cores antes,
durante e depois do clique, independência das abas, falha e nova tentativa.
Capturas de 390 px em `rascunhos/confirmar-cor/`, ignorado pelo Git.

Implementação preparada em `../imposicao-confirmar-cor`, branch
`fix/confirmar-cor-apos-gravacao`, base `bbe65e08` de `origin/main`.
Checkout original com alterações anteriores preservado. Nenhum SQL remoto ou
aprovação de pedido real foi executado nesta correção. A entrega foi integrada
ao lote de publicação v873.
