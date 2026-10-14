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

## Entrega autorizada e verificada

O pedido posterior de "entrega segura" autorizou a publicação. Publicada somente
`piloto-local` no projeto `vwbtitjlpelrcnsytzqw`, versão 11 para 12, estado
`ACTIVE`, mantendo `verify_jwt=false` e as verificações internas de identidade.
Não houve publicação de outras funções, alteração de banco ou novo instalador.

Os 12 arquivos remotos conferem com a fonte, normalizando apenas finais de linha.
Os 20 testes direcionados também passaram contra o código baixado do servidor.
Evidência: `docs/evidencias/pedido-23600-edge-publicacao.json`.
Código registrado no commit `f2228f61` e enviado à branch
`fix/compatibilidade-newprod-teste-20261013`. Essa branch ainda não foi integrada
à `main`; os checkouts operacionais foram preservados.

Backup anterior: `dist/compatibilidade/edge-23600-antes`, neste worktree.
Para recuperação autorizada, republicar apenas `piloto-local` a partir desse
diretório, usando o mesmo projeto e `--use-api --no-verify-jwt`; conferir os
arquivos remotos novamente. Não modificar bancos nem links do pedido.

Pendente em campo: Junior ou Gustavo reabrir o pedido 23600 e confirmar a tela.
A comparação do bundle e os testes sintéticos não comprovam essa abertura real
nem impressão física.
