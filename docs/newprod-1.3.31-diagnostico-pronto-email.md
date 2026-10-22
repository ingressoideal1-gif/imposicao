# NewProd 1.3.31 — diagnóstico MSI e prontidão da arte

Base: tag agente-v1.3.30, confirmada nos três manifestos públicos em 22/10/2026.
Preserva fonte, montagem, catálogo e demais correções da 1.3.30.

- Heartbeat inclui resumo limitado por lista positiva da última falha MSI, sem linhas do log, caminhos ou credenciais.
- Marcar PRONTO individual/em lote recusa PDF Ímpar/Par com Modo PDF desligado, antes de gerar amostra ou persistir status.
- Após aceite do e-mail, ambos os modos concluem o retorno ao Atendimento como Enviar Arte. Falha na conclusão permite repetir somente a persistência, sem reenviar e-mail.
- Painel local atualizado para referência de script 1321; frontend web correspondente v1099.

Validação e publicação: evidências de execução em dist/. Conferir pacote, ProductVersion, tamanho e SHA-256 público antes de ativar os três manifestos. Preservar cópia dos manifestos anteriores.

Recuperação: fonte anterior preservada na tag 1.3.30. Para reverter o agente, recompilar a fonte anterior com número superior; não há downgrade automático. A publicação não comprova instalação, correção do MSI 1603 ou impressão física. Nenhuma instalação ou reinicialização forçada faz parte desta entrega.
