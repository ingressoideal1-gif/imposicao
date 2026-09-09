# Portal: respeitar a numeração atual ao decidir frente e verso

## Caso confirmado e autorização

No pedido 21894, o modelo Foto (1000940) conservava `verso_tipo = FRENTE E VERSO`.
A numeração personalizada vinculada, nome 1000940, já tinha `print_mode = front`,
cinco elementos na frente e METADATA também em front. A consulta de diagnóstico
foi somente de leitura, no projeto de produção `vwbtitjlpelrcnsytzqw`.

O portal publicado em cliente.js?v=845 combinava o campo antigo e a numeração
com OU. Assim, o campo antigo bastava para manter o verso visível. O painel já
priorizava a numeração ao carregar os modelos. Os trechos de seleção e desenho
também não convertiam o valor legado FRENTE E VERSO ao passar para frente.

O usuário autorizou executar a correção e publicar em 09/09/2026.

## Alteração

- O portal prioriza a numeração resolvida, como o carregamento do painel, e
  mantém `verso` e `verso_tipo` coerentes. Sem numeração disponível, mantém a
  decisão baseada no campo salvo.
- Selecionar uma numeração de frente passa a normalizar também os valores
  legados. O desenho usa a mesma precedência. Sem numeração, preserva o verso.
- Nenhum arquivo original de arte é removido. A seleção explícita mantém o
  comportamento já existente de invalidar a prévia antiga de verso.
- cliente.html, index.html e producao.html passam a carregar os scripts v847.
- Nenhum SQL ou ajuste pontual do pedido foi executado. A correção de exibição
  funciona com o campo antigo ainda salvo; a próxima seleção grava Frente pelo
  fluxo normal do painel.

Trabalho isolado em `imposicao-cliente-verso-21894`, branch
`fix/cliente-verso-21894`, baseada em `63fda110`. As alterações preexistentes da
pasta principal foram preservadas.

## Validação

- 86 testes pytest aprovados em série: regressão nova, sintaxe do frontend,
  FxVersoUnico, PDF paginado do cliente, gabarito frente/verso, link do cliente,
  numeração amarela e rotas Cloudflare.
- A regressão nova falha contra o código da base em FRENTE E VERSO com numeração
  front e passa na correção. Executa o mapeamento, HTML, seletor com persistência
  simulada e atualização de canvas extraídos dos arquivos reais.
- Casos exercitados: valores legados, numeração ausente, frente, duplex,
  duplex_unico, elemento back, preservação das artes e dos valores de quantidade
  e numeração inicial.
- Chromium sem rede: HTML real com dados sintéticos; uma face no caso corrigido
  e duas no controle duplex. Capturas locais em
  `rascunhos/cliente-verso-21894/faces-desktop.png` e `faces-mobile.png` (390px).
- Diff conferido sem erros de whitespace. Nenhuma dependência adicionada.

Os testes não abriram um link real com token nem enviaram aprovação. O estado
publicado será conferido por GET dos HTMLs e comparação dos scripts servidos com
os arquivos validados. A publicação não exige migração ou novo agente Windows.

## Recuperação

Reverter o commit desta correção e republicar o frontend, com nova versão dos
scripts para invalidar cache. Não há migração ou remoção de arquivo a reverter.
Seleções feitas depois da publicação são alterações normais de modelos e não
devem ser desfeitas em lote como parte de um rollback do código.
