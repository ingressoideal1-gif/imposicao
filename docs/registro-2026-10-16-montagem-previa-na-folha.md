# Amostra dentro da folha montada

A entrega v1068 colocou a amostra na lista lateral, mas a janela Folha montada
ainda desenhava somente blocos coloridos. A captura enviada pelo usuário
confirmou que a prévia deve aparecer dentro das células dessa janela.

Cada célula ocupada agora mostra a amostra do próprio modelo, seguida à direita
de pedido, modelo e posição. As células vazias, a geometria, os gestos de
movimentar/repetir/remover e o payload de impressão permanecem preservados.
A face Apenas verso usa a amostra do verso; Frente e verso mostra a frente
na janela. A amostra é representativa do modelo; não recalcula dados variáveis
de cada posição sobre uma imagem de aprovação salva.

Sem amostra salva, a arte PDF é desenhada em canvas (com a página da posição
nos PDFs paginados). Usa PDF.js já disponível e o cache limitado existente de
rasterizações da prévia. Downloads/rasterizações têm prazo; até três células
carregam em paralelo. Uma resposta atrasada não preenche uma célula removida.
Falhas e ausência de arte aparecem na própria célula. Não grava snapshots,
altera dados de pedidos ou usa imagens da prévia na geração do PDF.

Validação: 266 verificações da tela em navegador com dados sintéticos,
incluindo imagem visível na folha, informações à direita, frente/verso,
movimentação, seleção de páginas, cache compartilhado, erros e descarte de
respostas antigas. O teste do fluxo de PDF simula PDF.js; a imagem de amostra
é decodificada pelo navegador e o resultado da janela foi inspecionado.
