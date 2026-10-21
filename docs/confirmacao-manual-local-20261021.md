# Confirmação manual de impressão na estação — 21/10/2026

## Falha reproduzida

Na fonte publicada `agente-v1.3.22`, `updateItemImpressao` gravava diretamente
em `pedidos_modelos` mesmo quando `PilotoOffline` fornecia a lista. A resposta
confirmada atualizava os arrays em memória, mas não o registro persistente local.
`PilotoOffline.carregarOrdens()` reconstruía esses arrays com a cópia anterior.
Ensaio sintético: depois do seletor, banco e lista indicavam Impresso; depois de
voltar, banco continuava Impresso e lista voltava para Aguardando.

## Correção

Na estação, o seletor de Impresso usa `PilotoOffline.confirmar`, o mesmo caminho
persistente do popup pós-impressão. O registro fica vinculado ao pedido, modelos
e revisão preparada e é sincronizado pelo agente. A mensagem informa quando
a confirmação ainda está local. Uma falha local não aciona escrita alternativa
nem apresenta sucesso. O caminho web e a devolução para Corrigir Arte permanecem.

## Evidência e limites

- Regressão em Chromium com API sintética: seletor, retorno, nova instância,
  lista antiga e ausência de rede externa.
- Regressão dos três seletores: confirmação local, falha de persistência,
  respostas remotas vazias/divergentes e devolução de arte.
- Consulta de 21/10: GUSTAVO-PROD, TEX-01, LASER-01 e PC-JR-HOME reportavam
  1.3.22/1317; LASER-02 e TEX-02 reportavam 1.3.21/1316.
- `audit.logs_v2` não cobre `pedidos_modelos`: ausência de eventos nessa tabela
  não comprova ausência de regressão real no banco.
- Os pedidos 23258, 23300, 23959, 23891, 23956, 23914, 23993, 23571,
  23916 e 23868 foram consultados em 21/10: os 24 modelos estavam Impresso.
  O operador identificou LASER-01 e confirmou remarcação manual depois do
  reaparecimento. Portanto o estado atual pode ser da remarcação e não comprova
  a persistência original. A estação já reportava 1.3.22/1317.
- Conflitos de revisão continuam exigindo conferência; não foram convertidos
  automaticamente em confirmação remota. Nenhum pedido real foi alterado.

A nova versão é 1.3.23, painel 1318. Publicação do MSI e adoção nas estações
devem ser verificadas separadamente. Não executar instalação ou impressão
como teste automático desta alteração.

## Ampliação para a confirmação original do popup

O primeiro MSI foi construído e auditado localmente, sem ativar manifestos nem
instalar estações. O operador confirmou depois que a primeira marcação ocorreu
no popup e autorizou executar a correção ampliada. Esse MSI deve ser reconstruído.
O heartbeat não expõe `offline_confirmacoes`. A consulta direta ao painel local
da LASER-01 a partir deste computador expirou; não foi alterada a autorização
nem a configuração de acesso para obter esses dados.

A 1.3.22 omite a confirmação na lista quando ela está em conflito ou quando a
revisão preparada muda. Esse estado foi reproduzido em Chromium, partindo do
popup real, e não pode retornar silenciosamente a Aguardando.

A correção ampliada apresenta `Conferir impressão` no modelo e no pedido,
exclui esse modelo do filtro Aguardando e recusa geração/impressão normal.
O modo Refazer já existente continua permitindo reimpressão intencional.
A marcação explícita de Impresso após conferir o material gera uma confirmação
nova para a revisão preparada; a confirmação mais recente prevalece por modelo.
O snapshot com Impresso confirmado também prevalece sobre a lista resumida antiga.
Esse estado de conferência é apenas local: não é escrito em pedidos_modelos.

Testes cobrem popup, seletor, persistência/reabertura, conflito, revisão diferente,
snapshot impresso atualizado, decisão posterior do operador, bloqueio da geração
e Refazer explícito. Sem os registros locais, não atribuir definitivamente o
conflito aos dez pedidos específicos. Nenhum estado remoto deles foi reparado
ou presumido por esta alteração.
