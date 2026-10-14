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

Esta correção está preparada no código; não foi publicada nem instalada.
A geração do PDF na estação com o pedido 23138 permanece como validação de campo.
