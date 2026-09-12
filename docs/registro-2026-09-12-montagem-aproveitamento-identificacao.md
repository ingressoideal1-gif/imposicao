# Montagem: aproveitamento atual e identificação da célula

Implementação local após a v859, na branch
`feat/montagem-aproveitamento-identificacao`.

O box Aproveitamento da folha passa para a coluna principal, abaixo da janela
de visualização. Mostra pedido, ID e nome do modelo, tiragem, células presentes,
posições duplicadas, produção estimada e sobra. O resumo é derivado das células
atuais em cada redesenho: adicionar, remover, duplicar, completar, aplicar uma
sugestão, desfazer e refazer atualizam os valores. A recomendação automática
continua disponível em uma seção expansível, separada do desenho atual.

A ocupação considera todas as folhas da montagem. As repetições calculadas são
da montagem inteira: para cada modelo, divide-se a tiragem pela quantidade de
células presentes, arredondando para cima; o maior resultado atende a todos.
Folhas impressas são folhas da montagem multiplicadas pelas repetições. Se
faltam células ou uma tiragem conhecida, a projeção fica indisponível.
Isso não gera novos códigos: reimprimir repete as posições existentes, como o
texto da interface informa. A recomendação para dados variáveis preserva suas
proteções anteriores.

A identificação oferece Número do modelo, Número do Pedido e Personalizado.
O último mostra um campo de texto comum a todas as células. O número do pedido
é resolvido por modelo, permitindo misturar pedidos. Digitar atualiza a prévia
sem reconstruir o campo nem perder o foco. Posição, giro, tamanho, cor e a
opção Imprimir continuam disponíveis.

`frontend/montagem.js` envia o texto no campo existente `nome`. O novo sinalizador
`nome_literal` permite ao motor preservar textos curtos e números de pedido
sem acrescentar zeros. O número do modelo mantém o preenchimento anterior.
`engine.py` altera somente a interpretação desse sinalizador e sua passagem
para o mapa de células. Não modifica os dados variáveis nem seus índices.

Validação local cobre alterações da distribuição, desfazer, modos de texto,
escape HTML e foco, payload por pedido/modelo, textos literais em PDF e
seleção de frente/verso nas duas paginações de duplex. A comparação dos PDFs
confere texto, geometria, renderização e perfil de cor preservado.

## Release autorizado

Publicação autorizada após a implementação: frontend v860 e NewProd 1.2.331.
136 testes aprovados, incluindo PDF literal, duplex e sintaxe do frontend;
211 verificações do navegador passaram. A especificação de release volta a
incluir as 222 fontes locais versionadas: a exclusão anterior estava marcada
como experimental e inadequada para distribuição. O executável foi compilado com PyInstaller e conferido: 222 fontes, DLLs de
impressão, engine com nome_literal e frontend iguais às fontes validadas.
MSI gerado com WiX, ProductVersion 1.2.331.0, 155979776 bytes, SHA-256
`7cfa9e8d8b38a8d516bc7e15c2c9cda9eabff35073c5e7f6345c336543694c23`.
O download público deve confirmar esse hash antes de ativar o manifesto. A instalação nas estações e a impressão física ficam pendentes.
Nenhum dado real de pedidos foi consultado ou alterado nesta entrega.
