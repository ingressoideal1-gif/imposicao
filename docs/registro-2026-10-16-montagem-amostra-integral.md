# Montagem: amostra integral na célula

A amostra ocupa toda a área interna da célula, sem padding e com preenchimento de largura e altura. A identificação de impressão permanece sobre a imagem quando habilitada.

Pedido, modelo, posição e ações de duplicar/excluir ficam fora do papel, em faixas laterais alinhadas às linhas e colunas. O posicionamento físico das células e a geração de PDF permanecem com a geometria existente. A escala da visualização reserva espaço para os controles; zooms ampliados permitem rolagem.

Validação: harness de navegador com imagem sintética verifica preenchimento integral, ações externas, identificação, seleção e movimentação. Harness do núcleo preserva os contratos de montagem. A publicação segue a rotina de entrega segura e comprovação de assets nos dois domínios. Nenhuma escrita de status real ou impressão física é usada como teste.
