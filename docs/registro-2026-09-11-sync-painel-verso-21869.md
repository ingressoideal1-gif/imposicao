# Arte do verso ausente mesmo no NewProd 1.2.329

O usuario confirmou a versao 1.2.329 e a repeticao no pedido 21869, um modelo
por vez com capa. Esclareceu que a hospedagem utilizada e somente Cloudflare.

## Causa confirmada na estacao

- `ultimo_update.json` da instalacao local registra 1.2.329.
- O log registra sincronizacao do painel as 17:57. A primeira geracao, as
  17:57:34, recebeu `file_verso`. As seguintes, as 17:58:54, 17:59:59 e 18:00:22,
  receberam somente `file` e `payload`, com zero multi-artes.
- O painel instalado voltou a carregar `script.js?v=846` e o helper em v833.
  O `pedido.js` instalado envia `file_verso` somente no modo `duplex_unico`;
  nao contem `prepararVersoDoTrabalho`, publicado na v853.
- Downloads atuais de `pedido.js` e `arte-de-impressao.js` da Vercel sao
  identicos aos arquivos antigos instalados, apos normalizar BOM e CRLF.
- `sincronizar_painel` ainda usava `PAINEL_BASE_URL`, apontando para Vercel.
  Assim a sincronizacao desfazia as correcoes do painel embutido no MSI.

Esta evidencia explica a regressao apos atualizar. O log nao identifica o
modelo em cada requisicao; nao atribuir um numero de modelo a cada horario.
Nao foi feita nova impressao fisica durante a investigacao.

## Correcao local

`security_config.py` define a origem especifica de sincronizacao
`PAINEL_SYNC_BASE_URL = https://imposicao.pages.dev`. `agent_worker.py` usa
essa origem e identifica os downloads como `NewProd Agent/<versao>`.
Nao existe retorno automatico para Vercel. Falha de download conserva o painel
atual, conforme o comportamento existente.

O endereco de sincronizacao foi separado do endereco legado usado na geracao
de links/QRs. A revisao desses links e das permissoes de origens antigas e um
escopo separado; esta correcao nao altera QRs, CORS ou autenticacao.

## Validacao e entrega

- 17 testes Python passaram: sincronizacao, PDF individual com verso e capa,
  e preservacao dos contratos existentes de URL.
- Harness de carregamento: 50 cenarios passaram, sem rede ou impressora.
- Todos os 72 arquivos de sincronizacao responderam HTTP 200 na Cloudflare e
  coincidiram com a fonte validada. Evidencia local ignorada pelo Git em
  `dist/diagnostico-sync/cloudflare.json`.
- Acesso com User-Agent padrao do urllib recebeu 403; a identificacao propria
  `NewProd Agent/1.2.329` recebeu 200. Nenhum controle de acesso foi alterado.
- `git diff --check` sem erros.

Trabalho no worktree `imposicao-sync-verso-21869`. Nenhum arquivo
da instalacao em uso foi substituido, nenhum processo foi reiniciado e nenhum
arquivo foi enviado ao hot folder. O ajuste de data/hora dos paineis continua
no worktree separado `imposicao-prazo-data-hora`.

Para entrega definitiva, empacotar nova versao do agente com esta correcao,
verificar MSI publico antes do manifesto e conferir apos a sincronizacao que
o painel instalado continua atualizado. Depois gerar o PDF do pedido e
confirmar arte e numeracao no verso antes da tiragem.

## Release autorizado: 1.2.330

O usuario autorizou seguir com a entrega. Versao Python 1.2.330 e MSI
1.2.330.0; frontend v853. A verificacao da lista de sincronizacao identificou
`cliente-bancos.js` e `cliente-modelo.css` ausentes; ambos agora fazem parte
da mesma sincronizacao, totalizando 74 arquivos conferidos na Cloudflare.
Os 27 testes selecionados passaram, incluindo painel da estacao, sincronizacao,
duplex individual com capa e FxVersoUnico. Harness de carregamento: 50 cenarios.

Build direto no worktree com ferramentas existentes, sem executar os scripts
que mudam o diretorio para o checkout original. Ativacao do manifesto somente
apos conferir o download publico do MSI. Evidencias em `dist/release330/`.

## Aviso do hot folder

O aviso de arquivos restantes e emitido por `_conferirConsumoHotFolder`, 12
segundos depois do envio. Apenas verifica se os arquivos permanecem na pasta;
nao verifica o conteudo nem comprova falha do RIP. A falta de arte ja no PDF
acontece antes desta etapa. O RIP pode conservar arquivos apos importar.
