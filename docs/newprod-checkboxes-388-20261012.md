# Teste .388 — reversa, folha a folha e entrega por bloco

Correção solicitada após análise dos checkboxes na .387.

- `getPedPrintOptions` passa a transportar `entregar_por_bloco`. Com reversa, o corte antecipado permanece desabilitado como no payload do motor, pois não se pode imprimir o início antes de conhecer o final da sequência a inverter.
- `processPrintQueueOptions` agrupa duas páginas por folha em duplex 2/3 e uma em simplex. A reversa altera a ordem das folhas, preservando a ordem frente/verso dentro de cada uma. Folha a folha gera um arquivo por folha física nos três modos do teste.
- Reversa duplex de documento ímpar em arquivo único inclui verso vazio antes da próxima folha quando necessário. Assim a última frente não recebe outra frente no verso.
- GDI usa a mesma transformação que PDF direto. Reordenação preserva o catálogo; separação copia o OutputIntent/ICC. Falha ao transformar não envia silenciosamente o arquivo original ignorando a opção marcada.
- PDFs auxiliares continuam na sequência recebida (capa/miolo/contracapa); não há inversão da fila de arquivos. PDF RAW continua dependendo de um preset do RIP coerente com o duplex selecionado no painel.
- Folha 1 frente/verso, numeração e motor de imposição não foram alterados.

## Validação

- `opcoes_folhas_harness.js`: 24 combinações reais de PDFs pares/ímpares, simplex/duplex, reversa e separação; preservação do catálogo de cor, verso vazio e falha sem fallback.
- `impressao_teste_modelo_harness.js`: três modos, captura do checkbox real, entrega antes de finalizar, capas/miolo e opções do driver; PDF RAW sem envio de bandeja pelo driver.
- `entrega_imediata_harness.js`: 49 verificações. Atualizado o dublê de histórico ausente para acompanhar a função real; a mensagem de falha simulada faz parte do cenário de interrupção.
- `test_folha1_pedido.py`: 10 testes passaram, incluindo PDFs comparados ao original. Corrigido o delimitador desatualizado da extração de função no harness de faces.
- Sintaxe JavaScript e diff verificados. Nenhuma impressão física ou envio ao spool durante os testes.

## Entrega

MSI .388 concluído e publicado; HTML 1050. `NewProdPiloto_Teste_v1.2.388.msi`: 196431872 bytes, SHA-256 `e86371d4675c59f748a3af25127ec80ca0e394f4fc969b297b47107b7f156cc6`. Download público integral confere com o artefato local; painel dentro do executável confere com a fonte. Manifesto de teste permanece .387.

Instalação no Junior pendente: solicitado encerramento pelo ícone da bandeja, mas o agente ainda respondia na última verificação. Spool vazio. Nenhum encerramento forçado nem instalação realizados nesta etapa. LASER-01 ainda não recebeu a .388.
