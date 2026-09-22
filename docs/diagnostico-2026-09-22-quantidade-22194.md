# Quantidade do modelo 1001056, pedido 22194

Consultas de leitura em 22/09/2026: `pedidos_modelos` retorna quantidade 8,
início 1 e fim 8; `produtos_proposta` 2631 retorna `qtd = 1250`.
O usuário confirma que a linha do modelo no ERP também apresenta 1250.
Não foi possível consultar `audit.logs_v2` pelo acesso disponível.
Portanto, não há autoria nem evento histórico comprovado para a gravação de 8.

Regra confirmada: o ERP define a quantidade de cada modelo separadamente.
Não copiar o total do produto para todos os modelos nem usar essa soma como
substituto da fonte por modelo. Alterações posteriores à arte devem aparecer.

## Caminhos encontrados e correção local

- QTD do Pedido podia ser liberado pela senha da gerência; QTD da Imposição
  também tinha handler de gravação. Ambos ficam permanentemente somente leitura.
- Os handlers de fila, salvamento do item ativo e salvamento compartilhado
  recusam `qtd`/`quantidade` antes de modificar estado ou enviar requisição.
- Salvamento de amostra remove esses campos de seu payload para evitar devolver
  quantidade antiga ao banco junto com uma arte.
- Os inputs de início/fim da Imposição salvavam a faixa no modelo. Agora apenas
  atualizam o resumo do trabalho, como os inputs equivalentes do Pedido.
  Não foi encontrada prova de que mudar apenas a faixa gravasse quantidade 8.
- `loadOSItens` relê quantidade e faixa por modelo quando os itens já estão em
  cache; preserva arte, amostra e status. Resposta vazia, parcial ou inválida não
  altera parcialmente o estado. A abertura completa já consultava os modelos.

## Validação e limites

Harness sintético: atualização posterior à amostra, dois modelos com quantidades
diferentes, quantidade zero, faixa temporária sem gravação e falhas de leitura.
Fila no Chrome: 52 verificações passaram, incluindo QTD bloqueado com senha.
Sintaxe dos dois JavaScripts e revisão de whitespace passaram.
O Python disponível não tem pytest e o venv documentado não existe neste
checkout. Execução direta das cinco verificações de gerência: quatro passaram;
uma falha preexistente foi reproduzida no HEAD base. Essa verificação recorta
`enviarParaPedido` no primeiro `setTimeout`, antes da linha que efetivamente
trava o modelo, e por isso não encontra a instrução. Não foi alterada nesta tarefa.

Entrega local no worktree `C:/ProjetosLocais/ideal-imposition-quantidade-erp`.
Sem publicação, alteração remota ou correção do registro 1001056.
O 8 persistido continua exigindo reconciliação com a origem efetiva da tela do
ERP e/ou auditoria. Recarregar `pedidos_modelos` ainda retorna 8 nesse caso;
a correção de cache não repara o dado de origem nem comprova sincronização com
outra fonte. Não há prova de quantidade física impressa.
