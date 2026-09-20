# Encerramento de 11/09/2026 — retomada em 12/09/2026

## Estado confirmado pelo usuario

Ultimo retorno: "impressão da arte impressa no verso e pdf, mas não mostra na
janela de visualização, ainda falta hora nos pedidos dos paineis". O pedido
atual e documentar para continuar amanha. Nenhuma correcao adicional,
instalacao, impressao, commit ou publicacao foi executada nesta etapa de registro.

- **Arte do verso no PDF e no papel: funcionando, confirmado pelo usuario.**
- **Arte do verso na janela de visualizacao: ainda ausente.** Causa ainda nao
  investigada nem reproduzida depois deste retorno.
- **Hora na coluna Prazo de Entrega dos paineis de Producao e Acabamento:
  ainda nao publicada.** O ajuste existe localmente em worktree separado.
- Hospedagem em uso: **Cloudflare**. O usuario esclareceu que Vercel nao faz
  mais parte da operacao.

Contexto do verso: pedido 21869, modelo informado 1000930, um modelo por vez,
com capa. Reconfirmar apenas se a tentativa de amanha mudar de modelo/tela.
Nao atribuir automaticamente a falta da previa ao mesmo defeito ja corrigido.

## O que foi publicado e por que resolveu PDF/papel

NewProd **1.2.330**, MSI **1.2.330.0**, frontend **v853**. PR #38:
https://github.com/ingressoideal1-gif/imposicao/pull/38

Merge: `9e87d1923ac0ae0e28201e04c6ecaedcba737c47`.
Tag: `agente-v1.2.330`.

O executavel 1.2.329 estava instalado, mas sua sincronizacao baixava arquivos
antigos da Vercel por `PAINEL_BASE_URL`, desfazendo a correcao embutida. Na
estacao, o painel instalado usava script v846/helper v833. Downloads atuais da
Vercel coincidiam com esses arquivos antigos. O log mostrou `file_verso` na
primeira geracao e sua ausencia nas seguintes. O log nao identifica o modelo
de cada requisicao; nao inferir essa associacao.

`security_config.py` agora define `PAINEL_SYNC_BASE_URL` para
`https://imposicao.pages.dev`; `agent_worker.py` usa essa origem com User-Agent
`NewProd Agent/<versao>`. Nao ha retorno automatico para Vercel. Foram incluidos
tambem `cliente-bancos.js` e `cliente-modelo.css` na lista de sincronizacao.

Validacoes realizadas: 27 testes Python aprovados; 50 cenarios do harness de
carregamento do verso aprovados; 74 arquivos publicos conferidos; PyInstaller,
WiX, modulos/fontes e os 74 arquivos embutidos conferidos. Cloudflare Pages
confirmou sucesso. HTML e tres scripts centrais conferidos apos o deploy.

MSI: `NewProd_Setup_v1.2.330.msi`, 74.608.640 bytes.
SHA-256: `aa8ea0dd970d85b251f26bd24c3868076142cec7efdfae1ac2c06e716fdf65c8`.
Upload sem sobrescrita; download publico com tamanho/hash identicos; somente
depois `latest.json` foi ativado e confirmado em 1.2.330. O retorno do usuario
confirma o resultado no papel/PDF; a versao instalada nao foi medida novamente.

## Pendencia 1 — janela de visualizacao do verso

A geracao e a previa usam caminhos diferentes. A correcao v853 aguarda o
original em `prepararVersoDoTrabalho`, usado no envio ao motor, mas nao demonstra
que o carregamento/desenho da previa esta correto.

Pontos de partida na fonte publicada:

- `frontend/pedido.js`: `guardarPdfDoVersoDaPrevia`, `drawPedPreview`,
  `pedArtVersoPdfDoc`, `pedArtVersoFile`; carregamento do verso perto de 4347
  e escolha do documento/pagina perto de 1612–1674.
- `frontend/script.js`: `guardarPdfDoVersoDaImposicao`, `drawPreview` e
  carregamento do verso perto de 31561.
- `frontend/arte-de-impressao.js`: `prepararVersoDoTrabalho`.

Ao retomar, verificar qual janela e usada e reproduzir o verso com o mesmo
modelo. Conferir download, estado do documento PDF, selecao da face/pagina,
cache de renderizacao e redesenho, inclusive com capa. Estes sao pontos de
investigacao, nao causas confirmadas. Testar com navegador e dados simulados
antes de alterar o motor. Preservar o PDF e a impressao que agora funcionam.
Nao enviar uma nova tiragem real como teste automatico.

## Pendencia 2 — data e hora nos dois paineis

Worktree: `C:\Users\Junior\Projetos Ingresso ideal\imposicao-prazo-data-hora`.
Branch: `fix/prazo-data-hora`, baseada em `1af2a554`, anterior ao merge #38.
Tres arquivos modificados, sem commit/publicacao:

- `frontend/script.js`: `formatPrazoBadge` passa a mostrar `11/09 09:05`;
  data sem horario mostra `11/09 --:--`; prazo ausente/invalido continua `--`.
- `tests/prazo_de_entrega_harness.js`: exibicao e reutilizacao no Acabamento.
- `tests/ordem_por_prazo_de_entrega_harness.js`: ordem por dia, hora e minuto.

Os dois paineis ja usam `ordenarPorPrazoDeEntrega`, comparando timestamps
completos em ordem crescente; faltava exibir a hora. Sem prazo fica no fim;
empate exato usa o numero do pedido. Manter filtros diarios, cores e ordenacoes
explicitas dos cabecalhos. Historicos Impresso/Expedicao conservam suas regras.
A fonte continua `propostas_os.data_termino`, sem estimar prazo.

Validacao anterior: 136 testes aprovados. Uma falha preexistente em
`test_a_paleta_do_acabamento_nao_repinta_o_painel_de_producao`: o teste varre
CSS posterior ao bloco e encontra `#view-ideal-control .ic-workspace > *`.
`style.css` e o teste estavam identicos ao HEAD. Tres testes de navegador
inicialmente nao encontravam Puppeteer; passaram ao reutilizar dependencias
existentes via junction `node_modules` para o checkout original. Nenhuma
dependencia foi instalada. Harnesses: 27 conferencias de prazo e 14 de ordem.

Ao retomar: revisar o diff preservado, compatibilizar com `origin/main` atual
sem descartar alteracoes, conferir largura da coluna nos dois paineis e rodar
os testes pertinentes. Preparar invalidacao de cache dos scripts ao publicar.
O release 1.2.330 **nao incluiu este ajuste**; sua ausencia no painel atual
nao comprova falha na implementacao local.

## Worktrees, evidencias e cuidados

- Checkout original `ideal-imposition`: muitas alteracoes preexistentes.
  Nao usar stash/reset/clean nem publicar em bloco. Este registro e um novo
  arquivo local em `docs/`, nao commitado.
- `imposicao-sync-verso-21869`, branch `fix/sync-painel-verso-21869`: codigo
  publicado pelo PR #38. `docs/registro-2026-09-11-sync-painel-verso-21869.md`
  tem complemento local ainda nao commitado com provas da publicacao e o
  retorno do usuario. Evidencias em `dist/release330/` e
  `dist/diagnostico-sync/cloudflare.json` (ignoradas pelo Git).
- `imposicao-verso-individual-21869`, branch `fix/aguardar-verso-21869`:
  historico das correcoes 1.2.328/329, PRs #36/#37; complemento local de
  documentacao da 1.2.329 ainda preservado. Nao reaplicar essas correcoes.
- `imposicao-prazo-data-hora`: alteracoes locais listadas acima.

Existem referencias legadas de Vercel nos links/QRs e em origens permitidas.
A 1.2.330 alterou a origem da sincronizacao, nao migrou esses contratos nem
modificou CORS/autenticacao. Registrar essa diferenca; nao remover permissoes
ou mudar links ja emitidos como correcao incidental da previa.

O aviso "3 de 3 arquivos continuam na pasta" verifica a permanencia no hot
folder 12 segundos depois do envio. Nao examina arte nem comprova falha do RIP;
alguns RIPs conservam arquivos. O usuario nao confirmou se o aviso cessou.

Nao incluir segredos, arquivos de configuracao da estacao ou pool de QR em
Git/documentacao. Scripts antigos de build/publicacao apontam para o checkout
original: ler antes de executar e usar o worktree certo. Publicacoes anteriores
estao concluidas; este pedido de encerramento nao autoriza nova publicacao.
