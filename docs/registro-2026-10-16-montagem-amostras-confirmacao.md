# Montagem: amostras, confirmação e Hot Folder

Implementação local sobre `30d3291b` (v1067), na branch
`feat/montagem-preview-impressao-20261016`. Checkout operacional preservado.

- A lista de modelos mostra a amostra à esquerda e identificação, tiragem,
  faces e posições à direita. Reutiliza `previewDaArteDoPedidoHtml` com um
  modelo explícito; não usa a amostra de outro modelo do pedido. Arte somente
  em PDF mantém o ícone que abre o arquivo, como na produção.
- Depois da entrega do PDF, chama `confirmarImpressaoModelos` com o snapshot
  de todos os modelos carregados e origem `pdf`. “Ainda não” preserva status;
  “Sim” usa a persistência e o registro de combinação existentes. Falha antes
  de gerar o PDF não abre a confirmação. Gerar o PDF não prova impressão física.
- Hot Folder mantém o destino próprio da Montagem e usa a mesma lista de
  pastas autorizadas, cores e ícones da produção. Permite escolher, desativar,
  cadastrar pelo seletor ou caminho validado e retirar autorização com
  confirmação. Usa os endpoints existentes na estação detectada pela Montagem.
  Erro ao gravar continua entregando o PDF pelo download do navegador.

Validação com modelos e estação simulados: 259 verificações da tela, incluindo
amostra visível e informações à direita, isolamento entre modelos, confirmação
de vários pedidos, cancelamento, falha do motor, cadastro recusado e remoção de
pasta. Harness da lista de arte: 53 verificações. Popup real de confirmação:
Sim e Ainda não testados no navegador. Sintaxe e whitespace conferidos.
`conferir_duas_versoes.py --base origin/main`: 823 testes aprovados, dois pulados
e dois subtestes aprovados por canal (produção e Piloto), além dos harnesses
JavaScript da bateria. Aviso existente de depreciação no ambiente.

Nenhum dado real de pedido alterado, impressão física, instalação ou publicação
faz parte desta implementação local. Preparação de pacote, PR e publicação
permanecem etapas de entrega separadas.
