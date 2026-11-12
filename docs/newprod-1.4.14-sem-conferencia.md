# NewProd 1.4.14: trabalho interrompido não bloqueia novos envios

Pedido humano de 12/11/2026: remover para todas as estações o bloqueio e a mensagem que exigiam conferir o trabalho anterior.

Base: agente-v1.4.13, preservando o catálogo e a retenção de cache publicados.
O estado persistido conferencia continua no histórico para não perder evidência e não reexecutar lotes.
Ele deixa de impedir novos trabalhos; a tela o apresenta como Interrompido, sem botão ou confirmação obrigatória.
Trabalhos efetivamente ativos continuam serializados. Não existe retomada automática nem reenvio do mesmo identificador.
Nenhum histórico existente é apagado ou marcado como conferido.
A alteração exige novo MSI porque a admissão ocorre também no agente Python.
Não altera fila do Windows, configuração da impressora, pedido ou status comercial.

Validação direcionada: falha após envio, reinício abrupto, novo envio autorizado sem conferir o anterior, idempotência, concorrência e interface sem exigência de conferência.
Teste Chromium com HTTP real preserva envio de capas/miolo após fechamento do navegador; spool físico simulado.
Provas de canais, MSI e publicação serão registradas após conclusão.
