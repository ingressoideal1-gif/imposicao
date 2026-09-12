# Previa do verso e prazo com hora — 12/09/2026

## Escopo confirmado

O usuario confirmou que a geracao do PDF e a impressao no papel ja exibem a
arte do verso. O unico defeito do verso e a janela de visualizacao. Tambem foi
solicitado mostrar a hora na coluna Prazo de Entrega dos paineis de Producao e
Acabamento e ordenar pela data e hora.

Implementacao feita no worktree `imposicao-previa-verso-prazo-hora`, branch
`fix/previa-verso-prazo-hora`, baseada no merge `9e87d192` da versao 1.2.330.
O checkout original e os worktrees anteriores foram preservados.

## Causa e correcao da previa

No `drawPedPreview` de `frontend/pedido.js`, o documento ativo comecava sempre
como o PDF da frente. Fora do modo PDF paginado, uma celula de verso sempre
tentava desenhar a pagina 2 desse documento. No pedido 21869 a frente e o verso
sao arquivos separados de uma pagina; portanto a pagina 2 nao existia. O motor
ja usava a pagina 1 do arquivo separado, por isso PDF e papel estavam corretos.

A funcao `pdfDaFaceNaPreviaPedido` passou a escolher documento e pagina com as
mesmas distincões do motor:

- duplex individual com verso separado: pagina 1 do arquivo do verso;
- PDF com verso embutido: pagina 2 do arquivo principal;
- duplex paginado: paginas impares/pares do arquivo principal;
- FxVersoUnico paginado: pagina 1 do arquivo separado.

O desenho combinado conserva suas faces embutidas. Nao houve alteracao em
`engine.py`, `app.py`, servico de impressao, numeracao, capa ou hot folder.

## Prazo com data e hora

`formatPrazoBadge`, compartilhada pelos dois paineis, agora mostra
`DD/MM HH:mm`. Um valor que tenha somente a data mostra `DD/MM --:--`, sem
inventar horario; prazo ausente ou invalido continua `--`.

A fila de trabalho ja comparava o timestamp completo. A regressao agora prova
a ordem por dia, hora e minuto, deixando pedidos sem prazo no fim e usando o
numero do pedido somente no empate exato. Os filtros Para Hoje/Atrasados e as
ordens dos historicos Impresso/Expedicao foram preservados. A fonte permanece
`propostas_os.data_termino`.

`frontend/index.html` e `frontend/producao.html` usam o carimbo v854 para
invalidar o cache dos arquivos do painel quando houver publicacao.

## Validacao e estado da entrega

198 testes passaram em execucao serial, incluindo:

- regressao nova com sete casos para a previa do verso separado;
- 27 conferencias de exibicao do prazo e 14 de ordenacao;
- FxVersoUnico, esquema da previa e arte de impressao;
- PDF duplex individual com e sem capa;
- painel da estacao, sintaxe de todo o frontend e navegador offline.

`git diff --check` e `node --check` passaram. Para os testes de navegador foi
reutilizado o `node_modules` ja instalado no checkout original por uma junction;
nenhuma dependencia foi instalada ou alterada.

Estado da validacao: nenhum PDF foi enviado a uma impressora e nenhum arquivo
foi colocado em hot folder durante os testes locais. A confirmacao visual na
estacao depende de a versao publicada ser sincronizada pelo NewProd e de o
painel ser recarregado.

## Publicacao

A implementacao foi integrada pelo PR #39 no commit
`a66fe9b0766b560f0eca8f1fe2db33ce7e524b9d`. O check `Cloudflare Pages`
terminou com sucesso em 12/09/2026 as 08:07 (America/Sao_Paulo).

Depois da propagacao, `index.html`, `producao.html`, `pedido.js` e `script.js`
foram baixados de `https://imposicao.pages.dev` com cache desabilitado. Os
quatro arquivos corresponderam as fontes validadas depois de normalizar BOM e
finais de linha. Tambem foram confirmados no endereco publico o carimbo v854,
`pdfDaFaceNaPreviaPedido` e a exibicao de hora do prazo.

Esta entrega altera somente o painel e nao exige novo MSI. Na verificacao das
08:09, a copia local da estacao ainda nao havia executado o proximo sincronismo
automatico; por isso a validacao visual no NewProd continuou pendente de
sincronizacao e recarregamento da pagina. Publicacao na Cloudflare nao comprova
sozinha que a estacao ja recebeu a copia nova.
