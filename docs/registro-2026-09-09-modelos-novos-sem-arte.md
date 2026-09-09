# Modelos novos sem arte — pedido 21826

## Problema e evidência

Em 09/09/2026, a investigação somente de leitura do pedido 21826 confirmou
quatro modelos ligados ao produto comercial 2498. Os modelos 1000915 e 1000916
tinham artes e prévias próprias. Os novos 1000938 e 1000939 estavam sem arte e
prévia no banco, tanto na frente quanto no verso. O produto compartilhado tinha
arte e prévia iguais às do modelo 1000916, conferidas por hash.

No painel publicado v842, `loadOSItens` preenchia os campos vazios de cada
modelo com os campos do produto. Isso exibia a arte existente nos modelos novos
e gerava uma indicação indevida de arte colada. O problema foi reproduzido com
quatro modelos sintéticos e consultas simuladas, sem escrita ou rede.

## Correção autorizada

O usuário solicitou corrigir e publicar. Em `frontend/script.js`, modelos
existentes usam somente suas próprias artes/prévias, aliases individuais ou
vínculo explícito por modelo em `pedidos_artes`. Compartilhar o produto não
atribui a arte a outro modelo. O caminho legado sem modelos não foi alterado.

Após carga confirmada do banco (`_dbLoaded`), os visualizadores e a decisão de
desenhar o card ignoram arte de cache local quando o modelo não possui arte.
Isso impede que o cache por ID ou posição reintroduza uma arte antiga. O cache
anterior à carga do banco continua disponível. Não há limpeza de armazenamento.

`frontend/index.html` e `frontend/producao.html` referenciam `script.js?v=843`.
Nenhuma alteração de backend, migração, escrita no banco ou exclusão de arte é
necessária. As quantidades, status e rotinas de salvamento permanecem existentes.

## Validação local

- A regressão nova falhou contra o código anterior ao detectar a arte do produto
  no modelo novo; passou após a correção.
- 83 testes selecionados passaram: modelos novos, controles PDF, arte de
  aprovação, correção do cliente, frente/verso único, cards sob demanda, link do
  cliente e sintaxe do frontend. Na primeira execução, 82 passaram e um teste
  de cards falhou por procurar Puppeteer em `node_modules` do worktree. Após
  disponibilizar as dependências já instaladas por junction, os quatro testes
  desse arquivo passaram. Não houve instalação ou mudança de dependências.
- Chrome com dados simulados confirmou frente/verso vazios e PDF sem original,
  mesmo com cache antigo; nenhuma carga de arte ou gravação foi disparada.
- A regressão preserva artes originais, colagem salva, verso próprio, aliases
  legados e vínculo individual de `pedidos_artes`.
- `node --check frontend/script.js` e `git diff --check` passaram.
- Verificação adicional de arte colada: o harness existente apresenta uma falha
  de extração com CRLF, reproduzida também no código anterior. Com quebras LF
  normalizadas somente em memória, as 57 verificações passaram. Esse harness
  não foi modificado nesta tarefa.

Os testes usam dados sintéticos e serviços simulados. Não foi feita sessão
autenticada de operador no pedido real. A conferência dos arquivos públicos
após a publicação deve confirmar a versão e igualdade com o código testado.

## Entrega e recuperação

Trabalho isolado em `fix/modelos-novos-sem-arte`, baseado no `origin/main`
`e26b546812a5876b86581fd563a45c079ab84052`; checkout original preservado.
Publicação pelo fluxo Git/Cloudflare Pages do frontend, sem executar o script
geral de publicação ou implantar backend. Para recuperação, reverter somente
o commit desta correção e publicar nova versão do script para invalidar cache.
Não há dados a restaurar, pois a correção não modifica registros.
