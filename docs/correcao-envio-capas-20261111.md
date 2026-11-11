# Espera, envio em dez páginas e reposição de capas

Implementação local solicitada após o diagnóstico do pedido 24592.
Worktree `imposition-logs-remotos-20261111`, base `3068cd49`.
As alterações anteriores de logs remotos permanecem neste mesmo worktree.

## Espera segura

O painel renova a comunicação a cada 30 segundos enquanto aguarda o envio.
Renovação não libera o motor: somente a confirmação final após o retorno da
entrega autoriza o próximo arquivo. A renovação exige capacidade explícita
no evento do agente, pois um agente antigo ignoraria o campo `acao` e poderia
interpretá-lo como confirmação. A resposta também precisa confirmar a ação.

Sem renovação válida por 300 segundos, a geração para. O limite absoluto do
agente é 900 segundos por arquivo, mesmo com painel ativo. O timeout existente
de dez minutos na requisição de impressão permanece. Cada renovação HTTP
tem prazo de cinco segundos; a falha inicial impede envio, e falha posterior
impede confirmar/seguir. Não há repetição automática da impressão.

A renovação indica que o painel ainda acompanha a requisição; não prova
progresso físico do driver. Um envio travado continua sujeito aos limites.
Cancelar/desconectar interrompe a geração, mas não promete retirar do Windows
um trabalho já aceito. A conferência do spool/papel permanece necessária.

O envio Windows normal foi movido para thread de trabalho, como já ocorria no
experimental, para não bloquear o event loop que atende as renovações.

## Dez páginas por geração e envio

No fluxo de impressão progressiva (entrega por bloco ou folha a folha, sem
reversa), `limite_paginas_envio=10` acompanha a solicitação. O motor fecha e
entrega o PDF ao alcançar dez páginas, após terminar o par frente/verso.
O callback publica o evento e espera a confirmação; não desenha a página 11
enquanto o envio do primeiro trecho está pendente. O frontend chama a entrega
imediata dentro da leitura do stream e confirma somente depois do retorno.
Não há acúmulo desses trechos para enviar apenas ao final da geração.

O bloco comercial não muda. Em bloco de 50 folhas duplex, o miolo de 100
páginas é entregue em dez arquivos de dez páginas, com a capa antes e a
contracapa depois. Sobras são entregues antes da contracapa/próxima camada.
Numeração, poses, Multi-Artes e quantidade física TICKET não são recalculadas.
O nome de cada trecho identifica miolo e mantém a ordem do spool existente.

Escopo explícito: PDF para salvar, impressão reversa e trabalho único mantêm
seus fluxos próprios. Eles não passam a ser prometidos como progressivos.
Mais de uma cópia por driver é recusada antes de gerar/enviar neste novo fluxo
de miolo, pois dividir um trabalho com cópias agrupadas poderia intercalar as
cópias. Não reduzir automaticamente o número de cópias. Reposição só de capas
mantém cópias do driver, pois cada capa já é um arquivo próprio e não é dividida.
Agente sem a nova capacidade é recusado antes do envio.

## Refazer Capas

Disponível em `index.html` e `producao.html`, exclusivo com Refazer Folhas e
Refazer Célula. Significa somente a capa de abertura de cada bloco selecionado,
sem contracapa e sem miolo. Campos vazios selecionam todos os blocos; também
aceita um único bloco ou intervalo. Trocar de modelo limpa a seleção.

O motor usa as mesmas rotinas e alocações da tiragem original. No strict_assembly,
o bloco selecionável é a camada apresentada como set na tela, incluindo sobras.
Intervalos inválidos, mistura de modos e formato sem capa são recusados.
O caminho de refazer não confirma o status comercial como impresso. Reposição
só de capas não publica faixas de QR da tiragem.

## Evidência local e limites

Suíte focada final: **110 testes Python passaram, 2 ignorados**. Sintaxe dos
JavaScripts alterados e `git diff --check` sem erros.

- Comparação de PDFs por rasterização: sequencial/strict_assembly, capa/sem
  capa, frente/duplex, bloco de 50 com sobra, Multi-Artes TICKET.
- Callback bloqueado no primeiro trecho: exatamente dez páginas desenhadas,
  nenhuma página 11 antes do ACK; renovação sozinha não libera.
- Relógio simulado: envio de 330 segundos, falta de comunicação, limite total,
  token vencido, isolamento de lote, cancelamento e ausência de reenvio.
- Refazer capas: hashes iguais às capas originais do intervalo; nenhum miolo
  ou contracapa gerado, incluindo montagem estrita e numeração de blocos.
- Harnesses de interface: confirmação após envio, timers limpos, agente antigo,
  seleção/reset, intervalo nas duas telas, entrega imediata (49 verificações),
  destinos GDI e configurações existentes.
- `impressao_combinada_fluxo_harness.js` falha também na base intacta
  `3068cd49` (linha 74, saída salva vazia). Diagnóstico pontual identificou
  ausência de `rotacionarPaginasParesDoPedido` no contexto simulado. Não corrigido
  como parte desta tarefa e não apresentado como teste aprovado.

Não houve teste em impressora física, alteração de pedido real, reimpressão,
build, commit, push, SQL remoto, deploy ou instalação. Publicação exige
reconciliar com a última versão liberada e executar as rotinas de release.
O SQL separado dos logs remotos não é necessário para o protocolo local de
espera, corte em dez páginas ou Refazer Capas.

Teste de retomada após publicação/adoção autorizadas: um bloco sintético de
50 folhas duplex, verificar capa -> dez trechos de miolo -> contracapa; observar
o primeiro spool antes de terminar a geração. Depois repor só a capa do bloco
2 e conferir que miolo e contracapa não entraram na fila. Conferir papel além
dos logs. Reversão de código não remove trabalhos já presentes no spool.
