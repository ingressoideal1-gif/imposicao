# NewProd Teste .387 — lista de produção e identificação dos clientes

## Problema confirmado

O painel .386 formava a lista exclusivamente com snapshots completamente preparados. Como o agente prepara até três pedidos por ciclo, a lista crescia de 9 para 15 enquanto o painel online mostrava 65. O snapshot técnico contém apenas `id_int`, `status_interno` e revisão da proposta; não contém o nome nem o código do cliente.

## Correção

- Consulta autenticada `piloto-local/lista-offline`, somente leitura, reutiliza `operarPropostas` e os mesmos status da fila de produção. Resolve o nome comercial como o painel online e mantém `id_cliente` distinto de `id_faturado`.
- Lista paginada de propostas, modelos, produtos de origem, prazos, informações de arte e setores. Não chama o gerador nem baixa PDFs para formar a lista.
- Cache SQLite `offline_lista`, separado dos snapshots de impressão. Substituição atômica apenas após resposta completa; falha preserva a última lista. Consulta no ciclo autônomo, com intervalo mínimo de 60 segundos; resposta com revisão igual não retransmite a lista.
- Frontend mostra todos os pedidos da lista comercial, inclusive com zero arquivos preparados, e identifica a preparação offline separadamente. A conferência para imprimir permanece baseada na revisão completa e nos hashes dos arquivos.
- Fonte .387, assets 1049. Nenhuma migração SQL ou alteração de status comercial.

## Validação

- 68 testes Python de cache, coleta autônoma, abertura, revisões e rotas locais passaram. Aviso preexistente de depreciação Starlette/httpx.
- 6 testes Deno de lista e confirmação offline passaram, sem rede. Chromium validou 65 pedidos com um e com zero snapshots preparados, nome/código comercial versus faturado e funcionamento sem chamadas externas.
- Sintaxe JavaScript e diff verificados.
- Edge Function publicada. Consulta real na identidade do Junior: 65 pedidos, 65 com nome e código de cliente, 245 modelos, resposta de 261132 bytes em 0,64 segundo. Reconsulta retornou `sem_mudanca=true`, sem retransmitir a lista. Nenhum nome ou dado de cliente foi gravado no relatório de validação.

## Entrega

- MSI `NewProdPiloto_Teste_v1.2.387.msi`, 196431872 bytes, SHA-256 `d5b372f993c72a152d77c35af29c09a1404d4ad91155c6db3537554dcf01e489`. Publicação imutável no bucket `agent-releases` e download público integral conferidos.
- Junior: saída pela bandeja confirmada pelo operador e por ausência de processo/porta. Spool vazio. MSI retornou 0; preservador do instalador executado. Cinco configurações e o SQLite mantiveram os mesmos hashes antes da partida do agente novo.
- Executável instalado coincide com o build. Agente responde `NewProd 1.2.387-teste.1`; JS servido coincide com a fonte. HTML 1049 validado considerando a injeção dinâmica local (não é byte a byte igual ao arquivo fonte).
- Coleta autônoma após reinício gravou 65 pedidos em `offline_lista`, todos com nome e número do cliente, sem abrir o navegador. Spool permaneceu vazio.
- Manifesto de teste permanece .384; outras estações não foram instaladas. Pacote .387 está disponível para instalação manual. Nenhuma impressão física executada.

## Liberação para LASER-01 após aceite do Junior

Em 12/10/2026, após o usuário confirmar funcionamento e solicitar a liberação, `newprod-piloto-teste.json` foi promovido para .387. Conservados os alvos LASER-01 e PC-JR-HOME (Junior já instalado); outros canais e estações não foram habilitados. Prova do download público e hash local conferidos, manifesto anterior salvo em `dist/teste387-ativacao-antes.json`, releitura imediatamente antes da escrita e manifesto público posterior idêntico ao candidato.

Na consulta posterior, LASER-01 ainda reportava `1.2.384-teste.1`, painel 1043, heartbeat de 12/10/2026 12:29:39 BRT. Portanto, a atualização está liberada, mas sua instalação remota ainda não está comprovada. Verificação automática mantém o intervalo de seis horas; o operador pode antecipar pelo botão Verificar atualização.
