# Totais por cor

Para o produto selecionado, cada cor mostra pedidos distintos, número de modelos e soma das unidades dos modelos aguardando. Um pedido com vários modelos da mesma cor conta uma vez em pedidos. Modelos de outro produto, Impresso e Corrigir Arte não entram. A lista usa os pedidos da fila do Painel de Produção, conforme v921.

As cores são ordenadas por total de unidades decrescente, com desempate alfabético. Os números são formatados em pt-BR; o resumo fica abaixo do nome da cor e quebra linha conforme o espaço. Selecionar uma cor e abrir modelos mantém o fluxo anterior. Os totais são recalculados quando um modelo deixa de aguardar.

Validação: soma de quantidades numéricas/textuais, pedidos únicos, modelos distintos, exclusão de outros produtos/status, empate e ordem decrescente, recálculo após impressão. Navegador com CSS real confirma “1 pedido / 2 modelos / 300 unidades”, seguido de “1 pedido / 1 modelo / 100 unidades” após a mudança de status. Dados simulados, sem gravação real. Suíte selecionada: 78 testes aprovados; 26 cenários no harness de fluxo.

Entrega sobre 49a3fec2/v921. Conferir HTML, JS e CSS publicados nos dois domínios. A confirmação final desta entrega cobre também a restrição aos pedidos do Painel de Produção publicada na v921.
