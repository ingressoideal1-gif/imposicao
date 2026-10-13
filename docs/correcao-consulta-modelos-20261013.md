# Consulta de modelos sem aprovacao — NewProd 1.2.390

## Problema e correcao
A revisao persistida inclui todos os modelos, mas o catalogo de preparacao
filtra a aprovacao de arte. O painel exigia um pacote imprimivel ate para
visualizar o modelo, mostrando uma orientacao de reabertura que nao resolvia.

O painel aceita modelos sem aprovacao para consulta somente quando presentes
no snapshot confirmado, com identidade e conteudo correspondentes. Eles nao
entram nos pacotes liberados. Gerar, imprimir e selecionar para lote continuam
recusados com motivo explicito. Abrir para consulta nao dispara o ajuste
automatico de numeracao. Respostas incompletas de modelos aprovados continuam
recusadas; troca de pedido e alteracao do modelo invalidam a consulta.

A previa sem pacote usa o caminho de leitura da arte existente no painel;
ela pode precisar de internet. Nao foi criado cache offline para artes
reprovadas. Nenhuma aprovacao, dado de pedido, fila ou endpoint foi alterado.

## Validacao
- Producao, Piloto e oficial: 543 testes passaram por canal, dois skips.
- Harnesses de navegador passaram, incluindo consulta de reprovado, bloqueio
  de geracao/referencias/lote, invalidacao e falta de pacote aprovado.
- Teste: 543 passaram, dois skips e quatro falhas preexistentes em perfil,
  publicador oficial e lista de sincronismo do painel. As quatro foram
  reproduzidas na base limpa 4b85b8db (14 passaram nessa comparacao).
- Todos os harnesses do canal de teste passaram separadamente.
- MSIs 1.2.390 compilados e auditados sem arquivos privados; pedido.js e
  selecao-piloto.js embutidos conferidos byte a byte contra as fontes.

## Entrega
Correcao destinada ao painel local empacotado. Nao substituir o frontend web
mais recente pela base antiga do agente. Preservar listas dos manifestos.
Publicacao e instalacao devem ser registradas separadamente; nenhuma estacao
foi reiniciada ou instalada nesta tarefa. Abertura real na Gustavo pendente.
