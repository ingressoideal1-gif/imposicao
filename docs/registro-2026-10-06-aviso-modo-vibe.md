# Aviso visível de incompatibilidade no Pedido

O pedido 23291, modelo 1002265, expôs uma lacuna na v1029: o aviso ficava junto
ao seletor dentro de Configuração, grupo recolhido ao abrir o modelo. A lista
também não sinalizava o conflito. O bloqueio de geração não substitui um aviso
visível antes de produzir.

A consulta anterior, somente leitura, encontrou FRENTE E VERSO no pedido,
amostra_num_id vazio e gabarito_operacional “90x140 - Só Frente”. O catálogo
resolve esse nome para uma numeração front. Nenhum dado do pedido foi alterado.

## Correção

- `frontend/pedido.js`: indicação persistente na coluna de modo da lista,
  inclusive quando a numeração é resolvida pelo nome. A conferência visual do
  seletor é chamada no início do resumo, antes das etapas de prévia.
- `frontend/script.js`: alerta fora do grupo recolhido, abaixo do cabeçalho
  da janela do modelo; na página alternativa, abaixo do cabeçalho do Pedido.
  Considera a numeração real mesmo se apenas o seletor do trabalho for alterado.
  Desaparece ao corrigir a incompatibilidade ou abrir um modelo compatível.
- A mesma regra frente/com verso permanece. Não muda numeração, rótulo Vibe,
  elementos, artes, quantidade, faixa, SQL ou dados históricos.

## Evidência local

`tests/aviso_modo_vibe_harness.js` falhou antes da correção com a configuração
recolhida e passou depois nos dois HTMLs reais. Verifica resolução pelo nome,
mudança isolada do seletor, troca de modelo e ausência de mutação.

`tests/fila_do_pedido_harness.js` verifica aviso visível antes de abrir o modelo,
limpeza após compatibilização e o caso sem ID resolvido pelo gabarito.
Passaram também os harnesses de compatibilidade Vibe, faces de impressão,
janela do modelo, três colunas, carregamento assíncrono e portal.
Dependências existentes reutilizadas por junction, sem instalação.

A preparação usa checkout isolado sobre origin/main, preservando o checkout
operacional e a preparação SQL anterior. A publicação exige a conferência dos
dois canais e pacote independente do Piloto pelo publicador existente.
