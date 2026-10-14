# Pedido 23600: URLs de QR contadas como arquivos

## Diagnóstico

O diagnóstico D-7544c98b409c da PC-JR-HOME registrou HTTP 422 na origem,
apresentado como HTTP 409 ao abrir o pedido. A leitura autorizada identificou
300 linhas com URLs usadas pelo elemento QR, ligadas por `csv_mapa`.
O coletor percorria todas as strings HTTPS do banco como dependências de
download, ultrapassando o limite de 256 arquivos.

## Correção preparada

- `piloto_local.ts`: distingue colunas de conteúdo QR, QR_IDEAL, TEXT, FIXED
  e BARCODE de dependências de arquivo; preserva fontes, PDFs, fotos e URLs
  sem classificação conhecida. Conteúdo fixo, prefixo e sufixo desses elementos
  também não são downloads.
- `piloto_pedido.ts`: resolve os consumidores de cada banco pelos vínculos,
  respeitando a prioridade de `el:<id>` sobre o mapeamento legado por coluna.
  Considera todos os modelos ligados ao mesmo banco: uma coluna usada por FOTO
  continua exigindo os arquivos, mesmo se também alimentar QR/texto.
- Não altera as linhas, links, vínculos, snapshot, digest ou limite de arquivos.
  Não há migração, escrita em dados reais ou alteração do motor de impressão.

## Validação local

20 testes direcionados e 353 testes da suíte de Edge Functions passaram.
Regressões cobrem 300 links, mapas por elemento e legado, preservação integral
do snapshot/digest, fotos compartilhando coluna, contexto ausente, fontes/PDFs
e recusa de volume excessivo de arquivos/dados. Dados dos testes são sintéticos.
`git diff --check` passou.

## Estado da entrega

Correção local preparada mediante autorização específica para o servidor.
Não publicada. A abertura real do pedido deve ser conferida após uma publicação
autorizada; os testes locais não comprovam a recuperação nas estações.
Para recuperação de uma futura publicação, preservar e republicar o bundle
anterior das funções afetadas; não modificar bancos nem links do pedido.
