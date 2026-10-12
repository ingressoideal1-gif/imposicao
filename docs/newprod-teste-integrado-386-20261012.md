# Integração da versão de teste .386 — 12/10/2026

## Causa

O teste .385 incluía offline e as três saídas de impressão, mas sua base `4cb8f067` não continha os commits de capas/elementos `b9ba5ca3` e `361fbe69`, publicados na linha principal pelo PR #125/#126. A numeração superior do MSI não significava que todas as funcionalidades da linha principal estavam integradas.

`git fetch origin main` confirmou `809988cb` como versão remota mais recente durante esta correção. Não é falha de cache do navegador.

## Correção

Integrados os dois commits funcionais, preservando a implementação offline da .385 e os três modos de impressão/GDI por blocos e folhas:

- Editor “Visualizar e posicionar capa”, com arraste e coordenadas.
- Largura máxima, alinhamento e tratamento de texto que não cabe nas capas.
- Mesmos controles nos seis elementos Teatro/Camarote, independentemente da origem dos dados.
- Persistência, duplicação, prévias e geração PDF usam os novos campos.
- Bibliotecas locais continuam locais; integração não reintroduz CDNs na inicialização offline.
- HTML com versão de assets 1048; agente/MSI `1.2.386-teste.1` / `1.2.386`.

`db.py`, `engine.py`, `capa-layout.js` e `capa-layout.css` coincidem com o código funcional da linha principal `361fbe69`. Não foi executado SQL: as colunas de layout já foram publicadas anteriormente, conforme registro de encerramento de 11/10.

## Validação

74 testes Python de capas, integridade, offline e motor passaram. Harnesses Chromium/Node de elementos, editor, persistência de formatos (15 cenários), Teatro vertical, offline e três saídas de impressão passaram. Sintaxe JS e diff verificados. Nenhuma impressão física realizada nos testes.

Checkout operacional original preservado. A fonte offline .385 anterior foi guardada em `dist/offline385-fonte.patch`; o MSI .385 público permanece imutável. A atualização .386 deve usar instalador novo, sem sobrescrever o pacote .385.

## Entrega

Build e verificações do MSI em andamento. Junior permanece .385 até instalar o novo pacote. Registrar hash público e instalação após suas verificações; não confundir pacote disponível com estação atualizada.

## Entrega concluída no Junior

- MSI .386: `196423680` bytes; SHA-256 `3fa3d4212333b90aef7bdf9a049b80a3b9662b6ff090d5208132dec5a2d321ed`.
- Publicação imutável e download público integral conferidos: https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/agent-releases/NewProdPiloto_Teste_v1.2.386.msi
- Conteúdo do executável confere com fontes: capa-layout JS/CSS, script, pedido, módulo offline e três saídas de teste. ProductVersion do MSI conferido.
- Após saída confirmada pelo usuário: porta fechada, spool vazio, MSI retorno 0. Backup cifrado `runtime-20261012T145059Z-df0af182.iib`.
- Executável instalado coincide com o build; cinco configurações e o catálogo SQLite offline mantiveram os hashes antes de reiniciar.
- HTTP confirmou `NewProd 1.2.386-teste.1`. Arquivos servidos coincidem com as fontes e HTML inclui editor de capas v1048 e módulo de três saídas.
- 102 snapshots offline preparados na conferência posterior. Spool permaneceu vazio. Não houve impressão física.
- Manifesto de atualização automática não foi ativado nesta entrega; demais estações não foram alteradas.

## Observação fora da integração de layout

A interceptação offline de GET de catálogos também alcança a releitura após edição online de formatos/cores. Avaliar em tarefa específica a invalidação/atualização desse cache após escrita: os testes de persistência usam backend simulado e não comprovam esse caso combinado na estação. Nenhum cadastro real foi alterado para testar.
