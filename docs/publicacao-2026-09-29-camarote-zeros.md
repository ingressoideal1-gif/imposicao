# Camarote — frontend v975 e NewProd 1.2.346

Publicado em 29/09/2026 após autorização explícita “publicar”.

Local, Pessoas e Pessoas 1/Total agora têm Zeros (pad), de 0 a 10 dígitos.
Com 6 dígitos, Pessoas 1/Total apresenta `000001/000005`; os dois números
recebem zeros. Campo ausente ou zero preserva a apresentação anterior.
O preenchimento altera apenas o texto, sem mudar a sequência ou truncar valores.

## Publicação comprovada

- Frontend: commit `71c36596`, tag `v975`.
- Código completo do agente: `31295e993ae80eb26a021391b8f23b353dfd5abf`,
  tag `agente-v1.2.346`.
- Cloudflare confirmou sucesso para os commits web e integrado. O deploy do
  integrado foi `7801edfd-554a-4d12-bf92-6c09cd7f0e87`.
- `index.html`, `producao.html`, `cliente.html`, `controle.html`, `script.js`,
  `pedido.js` e `cliente.js` conferiram por SHA-256 normalizado nos dois domínios:
  `imposition.ai-ideal.com.br` e `imposicao.pages.dev` (14/14).
- MSI `NewProd_Setup_v1.2.346.msi`: 156200960 bytes, ProductVersion `1.2.346.0`.
- SHA-256 local e do download público:
  `70a514e027c8e3a526392a9f28d0b10fe4b66cdf1d705861aff3ef1912afd5ce`.
- O objeto novo estava ausente antes do upload, e o limite de arquivo do bucket
  consultado era 209715200 bytes. Nenhum MSI existente foi sobrescrito.
- Só após conferir o download público foi ativado `latest.json`. A releitura
  pública confirmou versão, URL, tamanho, hash e notas em
  `2026-09-29T18:45:08.982682+00:00`.

[Evidência consolidada](evidencias/camarote-zeros-v975-1.2.346-publico.json).
Backup do manifesto anterior (1.2.345), instalador baixado e logs estão em
`C:\ProjectBackups\newprod-camarote-1.2.346`.

## Validação e limites

- 46 testes de Camarote e regressão de origem dos dados passaram, incluindo
  17 verificações em navegador com rede bloqueada.
- 28 verificações da sequência por página passaram.
- O código do motor extraído do executável passou em 36 casos de PDF sintético,
  com e sem zeros, inclusive na troca de local.
- Os sete arquivos do painel dentro do executável foram comparados byte a byte
  com a fonte de build. Versão, módulo do segredo e três DLLs de impressão
  também foram conferidos, sem expor recursos sensíveis nos registros.
- Sintaxe, diff e escaneamento de segredos dos arquivos entregues aprovados.

O publicador de frontend concluiu commit/push/tag e confirmou a Cloudflare,
mas sua comparação final encontrou `[Net.Http.HttpClient]` indisponível no
Windows PowerShell. Não foi repetida a publicação: uma verificação independente
com cache-buster confirmou os 14 arquivos públicos.

Na checagem adicional de sincronismo do painel, um teste passou e outro falhou:
oito assets antigos faltam em `PAINEL_ARQUIVOS`. A mesma falha foi reproduzida
por comparação dos arquivos da base `806eb138`, sem diferença nesta entrega.
A evidência lista os nomes. Não foi corrigida fora do escopo; os sete arquivos
alterados/publicados estão no executável, e os três JS da tarefa já integram a
lista de sincronismo.

O checkout operacional foi preservado. Não houve SQL, modificação de dados
comerciais, instalação na estação ou impressão física. A publicação do agente
não comprova instalação: conferir a versão na estação após sua atualização.
O piloto local precisa de integração própria, mantendo suas alterações e seu
preflight de produção/spool; nenhum instalador foi executado aqui.

## Recuperação

Reverter web por novo commit e nova versão de cache; nunca reaproveitar a tag.
Para reverter NewProd, compilar o código anterior sob versão maior, conferir o
MSI público e então ativar o manifesto. Não presumir downgrade automático.
