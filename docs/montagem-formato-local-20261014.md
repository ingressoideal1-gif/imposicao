# Montagem: formato na conferência local

Relato: pedido 23138, modelo 1002054. Depois de preparar os arquivos,
a geração recusava o modelo por não conseguir determinar seu formato.

A lista resumida de produtos não contém `id_formato`. Ao preparar o pedido,
`loadOSItens` substitui os itens que haviam recebido `formato_id` temporário
na tela do Pedido. A Montagem consultava somente essa lista resumida e o
campo temporário, embora o snapshot preparado contivesse o produto completo.
Na cópia local consultada em modo somente leitura, ambos os modelos do pedido
estavam sem `formato_id`, mas os dois produtos tinham `id_formato` preenchido.

`formatoDoItem` agora consulta os produtos do snapshot do próprio pedido ativo
antes da lista global. O caminho sem snapshot continua usando o catálogo
global e o formato explícito do item. Não há gravação de modelos, alteração
de consulta, descarte de rascunho nem remoção da conferência de compatibilidade.
O cache do script foi atualizado em `frontend/index.html`.

Regressão em `tests/montagem_local_harness.cjs`: recarga sem formato temporário,
lista resumida sem formato, resolução pelo snapshot, mudança real de formato,
formato desconhecido e isolamento entre pedidos. O núcleo da Montagem mantém
3.569 verificações aprovadas. A bateria dos canais usa
`ferramentas/conferir_duas_versoes.py`; relatório local em
`dist/compatibilidade/montagem-formatos-validacao.json`.
Produção, Piloto e perfil oficial concluíram as 60 etapas sem falhas: cada
perfil teve 939 testes Python aprovados, dois subtestes aprovados e 19 harnesses
JavaScript. Permanecem duas exclusões por ausência do pool real de QR e um aviso
preexistente de depreciação Starlette/httpx. O relatório do perfil oficial é
`dist/compatibilidade/montagem-formatos-oficial.json`.

## Entrega 1.3.1 de teste

Publicada em 14/10/2026 após autorização de entrega segura. TEX-01 foi incluída
por autorização adicional, junto de LASER-01 e PC-JR-HOME. O manifesto de teste
foi relido e confirmou exatamente essas três estações. Os manifestos oficial
e legado permaneceram idênticos, em 1.2.401. Liberar TEX-01 no teste não comprova
sua instalação ou migração do canal normal.

Fonte: commit `0b55a01e`, branch `fix/compatibilidade-newprod-teste-20261013`.
Runtime `1.3.1-teste.1`; pacote `NewProdPiloto_Teste_v1.3.1.msi`.
Auditoria conferiu identidade MSI, ausência de arquivos privados e os 375
arquivos do painel contra a fonte. Os 39 testes adicionais dos contratos de
versão, instalação e publicação passaram. Evidências:
`evidencias/release-131-teste-auditoria.json` e
`evidencias/release-131-teste-publicacao.json`.

O MSI público foi baixado integralmente antes da ativação: 196673536 bytes,
SHA-256 `61e71d4d2c4f913ed43b55eb0157159982c0e0f870c4ad22c910f84246aeb394`.
Binários anteriores preservados em `dist/compatibilidade/base-130-binarios`,
MSI 1.3.0 mantido. Manifestos anteriores guardados em
`dist/compatibilidade/manifestos-antes-release-131.json`. A reversão automática
exige publicar a fonte anterior com versão superior; não há downgrade automático.

Nenhuma instalação, reinício, impressão ou alteração de dados de pedidos foi
executada. A geração do PDF na estação com o pedido 23138 permanece como
validação de campo após a atualização.
