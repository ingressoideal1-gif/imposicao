# Montagem: espaço abaixo da prévia

A altura fixa do card excedia o max-height da janela interna, deixando espaço após os atalhos e empurrando o aproveitamento para baixo. A altura calculada passa para a janela; o card acompanha o conteúdo e não cresce por flex. Limpar a montagem libera a altura da janela.

Validação: harness de tela com regressão medindo o espaço após o último elemento, em quatro redesenhos alternados com rolagem. Mantidas verificações de zoom, papel dentro da janela e navegação de folhas. Alteração local, ainda não publicada.

Publicação autorizada: frontend v862. Cache atualizado em index.html e producao.html. Entrega somente da interface, sem alteração do motor ou MSI. 212 verificações de tela aprovadas; conferir arquivos públicos após implantação.
