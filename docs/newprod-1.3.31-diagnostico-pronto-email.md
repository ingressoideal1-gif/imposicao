# NewProd 1.3.31 — diagnóstico MSI e prontidão da arte

Base: tag agente-v1.3.30, confirmada nos três manifestos públicos em 22/10/2026.
Preserva fonte, montagem, catálogo e demais correções da 1.3.30.

- Heartbeat inclui resumo limitado por lista positiva da última falha MSI, sem linhas do log, caminhos ou credenciais.
- Marcar PRONTO individual/em lote recusa PDF Ímpar/Par com Modo PDF desligado, antes de gerar amostra ou persistir status.
- Após aceite do e-mail, ambos os modos concluem o retorno ao Atendimento como Enviar Arte. Falha na conclusão permite repetir somente a persistência, sem reenviar e-mail.
- Painel local atualizado para referência de script 1321; frontend web correspondente v1099.

Validação e publicação: evidências de execução em dist/. Conferir pacote, ProductVersion, tamanho e SHA-256 público antes de ativar os três manifestos. Preservar cópia dos manifestos anteriores.

Recuperação: fonte anterior preservada na tag 1.3.30. Para reverter o agente, recompilar a fonte anterior com número superior; não há downgrade automático. A publicação não comprova instalação, correção do MSI 1603 ou impressão física. Nenhuma instalação ou reinicialização forçada faz parte desta entrega.

## Publicação confirmada

- Fonte: da544bc9, tag agente-v1.3.31 publicada.
- 1.161 testes Python passaram por identidade (Produção, Piloto, Oficial), dois pulados e dois subtestes passaram; testes JavaScript concluídos. 55 testes direcionados do diagnóstico/heartbeat passaram.
- Build, preservador e MSI auditados; módulo de diagnóstico, versão, painel e DLL GDI conferidos no executável.
- MSI: ProductVersion 1.3.31, 196780032 bytes, SHA-256 87d5dc8e7628307d000584c862760944c1c0d4ca3c3bc3acbfabcf7a1bf04473.
- Downloads públicos completos dos nomes Oficial e Teste conferidos antes de ativar latest.json, newprod-piloto-oficial.json e newprod-piloto-teste.json.
- Três manifestos relidos com cache-buster: versão 1.3.31 e mesmo hash/tamanho. Sem restrição por estação.
- Evidências: dist/msi-verificado.json, dist/validacao-canais.json, dist/validacao-oficial.json e dist/publicacao-unica-1.3.31-*/.
- Publicação não comprova adoção nas estações, recuperação de MSI 1603 nem impressão física. Nenhuma estação foi instalada/reiniciada por esta sessão.
