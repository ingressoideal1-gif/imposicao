# Entrega NewProd 1.4.9 e painel — 11/11/2026

Publicacao autorizada por "entrega segura". Checkout operacional preservado.

## Publicado e conferido

- Agente: fonte `5e83ea37`, baseada no NewProd oficial 1.4.8 (`3068cd49`).
- Web: PR #276, merge `674763f7b7cc842f236b4467b827b55bf682c4dd`, sobre a base atual de main. As fontes completas de canais diferentes nao foram mescladas.
- Cinco assets conferidos nos dois dominios: `index.html`, `producao.html`, `pedido.js`, `gestao-estacoes.js`, `arte-de-impressao.js` (10/10).
- SQL `sql/logs_remotos_estacoes.sql` aplicado no projeto `vwbtitjlpelrcnsytzqw`: tabela criada vazia, RLS ativo, anon/authenticated sem SELECT, service_role com INSERT. Nenhum pedido alterado.
- Edge `historico-impressao` versao 21. Preservados os 12 arquivos da versao remota anterior, exceto a mudanca autorizada no index; acrescentado `logs_estacoes.ts`. As dependencias piloto_* remotas diferiam da main e foram preservadas no pacote de implantacao. Download posterior conferiu os 13 arquivos. Rotas sem sessao/segredo responderam 401.
- MSI `NewProdPiloto_Oficial_v1.4.9.msi`, ProductVersion 1.4.9, 196841472 bytes.
- SHA-256 `684522b610dfcefc6831193ef724d00823bb595e98c0e2df4c5c58e1d6080844`.
- Download publico completo identico ao MSI local antes da ativacao de `latest.json` e `newprod-piloto-oficial.json`. Canal de teste permaneceu 1.3.35.
- Piloto experimental compilado e auditado localmente, sem instalacao ou publicacao no canal de teste.

## Validacao

- Agente: 1233 testes aprovados, 2 skips e 2 subtestes por canal (Producao, Piloto e Oficial), mais os 24 harnesses de cada canal.
- Logs e entrega progressiva: 50 testes focados aprovados. Regressao ampliada anterior: 110 aprovados e 2 skips; 4 testes de capas repetidos apos ajuste final.
- Web: 911 testes aprovados, 2 skips e 2 subtestes por canal (Producao e Piloto), mais os harnesses previstos; harnesses especificos de espera, envio imediato/progressivo, gestao e capas aprovados. 10 testes Deno do pacote efetivamente implantado aprovados.
- Todos os checks obrigatorios do PR passaram. O primeiro job de consulta autenticada falhou iniciando Chrome; a repeticao passou sem alterar testes ou codigo.
- Auditorias do EXE, MSI e preservador aprovadas; painel embutido, modulos novos e DLLs GDI conferidos.
- Dois skips preexistentes dependem do pool QR privado; ele nao foi copiado nem publicado. O harness separado impressao_combinada_fluxo falha tambem na base intacta por helper ausente no fixture; nao integra as baterias aprovadas acima.

## Limites e retomada

Ultima leitura da LASER-01: heartbeat 11/11/2026 15:53:43 UTC (12:53:43 Brasilia), executavel 1.4.7, painel 1335; nenhum snapshot remoto recebido. Publicacao nao comprova adocao na estacao. Nenhuma instalacao ou reinicio remoto foi forcado.

Depois de confirmar 1.4.9 na estacao, verificar novos horarios em Gestao de Estacoes / Logs remotos. Com sessao administrativa, comparar uma mensagem conhecida do arquivo local. Confirmar que conta sem permissao e recusada.

Teste de impressao de retomada: trabalho controlado com bloco de 50, capa e duplex; conferir que cada trecho de ate 10 paginas chega ao spool antes da geracao do seguinte, sem perder a capa, pares, resto do bloco ou contracapa. Usar Refazer Capas para um intervalo de blocos e conferir somente suas aberturas. Nao reimprimir automaticamente o pedido 24592.

O limite de 10 paginas aplica-se ao envio progressivo por bloco/folha; PDF unico e ordem reversa mantem seu fluxo. Mais de uma copia pelo driver e recusada nesse fluxo para preservar a ordem. Espera renovada acompanha a comunicacao com o painel, exige ACK real e tem teto total de 15 minutos; nao prova progresso fisico da impressora.

Recuperacao: remover as novas rotas/aba/coletor por nova entrega, mantendo a tabela e seus dados. Para reverter agente, publicar codigo corrigido em versao superior; nao forcar downgrade. Manifestos anteriores e recibos estao preservados em `dist/publicacao-unica-1.4.9-1794412243320224500/`; evidencias complementares em `.tmp/` nas duas worktrees de entrega.
