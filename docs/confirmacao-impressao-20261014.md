# Confirmacao de impressao — NewProd 1.3.6 / web v1056

Restaura a pergunta para marcar os modelos como impressos depois de gerar/salvar
PDF e de concluir o envio para a impressora ou Hot Folder. As formas de envio
incorporadas ao NewProd oficial ainda excluiam a confirmacao por uma condicao
da antiga versao de teste. Essa exclusao foi removida.

O status permanece dependente de confirmacao explicita. Ainda nao, cancelamento,
erro de geracao/envio ou falha ao salvar nao autorizam marcar como impresso.
Refazer e Folha 1 continuam sem confirmar a tiragem completa. Os alvos sao
capturados antes da geracao, preservando o vinculo mesmo se a selecao mudar.
PDF usa mensagem propria, sem afirmar que houve impressao fisica.

## Validacao e escopo

Harness do fluxo com PDF simples, JSON e streaming, selecao combinada, quatro
formas de envio, falhas e refazer. Popup real em navegador sem rede, com Sim e
Ainda nao e persistencia simulada. Testes de configuracao e Hot Folder.
Bateria de compatibilidade e auditoria do MSI fazem parte da entrega.

A correcao do filtro Laser do pedido 23403 nao integra esta entrega.
Nenhuma query, Edge Function ou registro comercial foi alterado.

## Recuperacao

Preservar binarios 1.3.5 e os tres manifestos antes da ativacao. Recuperacao
por atualizacao exige nova versao superior com a reversao localizada; nao ha
downgrade automatico. Na web, reverter apenas este diff com novo cache.
A publicacao nao comprova instalacao, geracao real ou impressao fisica.

## Entrega concluida em 14/10/2026

Fonte NewProd: `6871135c`, tag `agente-v1.3.6`. MSI oficial 1.3.6 com
196673536 bytes e SHA-256
`b2d33a7bf7719d6f1d708d50c3254b21c2cb6dc7827d689d954166f2c05c3a3e`.
Auditoria: 375 arquivos do painel, identidade MSI e motor compilado iguais
as fontes; nenhuma instalacao forcada. Downloads completos dos dois nomes
historicos conferidos antes da ativacao dos tres manifestos.

Estacoes liberadas: LASER-01, PC-JR-HOME, TEX-01, LASER-04,
LAPTOP-9BSK81S0, GUSTAVO-PROD e LASER-02. O nome Teste do alias e somente
transporte para atualizadores antigos; os bytes sao os mesmos do oficial.

Web: PR #139, fonte `a056e0b1`, integrado em
`5da30854c37fac7921bdf4d0302e1dc9b7cf5868`, tag `v1056`, com seis checks
aprovados antes do merge. Cloudflare Pages confirmou o deployment
`e882dc5c-66c4-4e01-81b9-eb69e288e498`. Oito hashes normalizados conferidos
nos dois dominios, abrangendo index.html, producao.html, script.js e pedido.js.
A base web preserva a correcao do portal v1055; nao houve copia integral
entre os checkouts web e de empacotamento.

Validacao local: 1027 testes e 19 harnesses no oficial; 823 testes e 19
harnesses em cada configuracao legada web. Todas as 60 etapas aprovadas.
Cada bateria teve duas exclusoes previstas por ausencia do pool QR real,
dois subtestes e o aviso existente Starlette/httpx. Mais 42 testes focados
com 23 subtestes, tres harnesses especificos e o novo envelope pytest do
popup/fluxo aprovados. Sem banco ou impressora reais nos testes.

Evidencias em `docs/evidencias/`: `confirmacao-136-testes.json`,
`release-136-oficial-auditoria.json`, `release-136-oficial-publicacao.json`,
`confirmacao-v1056-publico.json` e `confirmacao-v1056-checks-pr.json`.

Backup local dos binarios anteriores:
`dist/compatibilidade/base-135-confirmacao-binarios`.
Manifestos anteriores: `dist/compatibilidade/manifestos-antes-release-136.json`.
Estado: PUBLICADA_E_VERIFICADA_SINCRONIA_PENDENTE. As alteracoes desta tarefa
estao registradas; checkouts operacionais preexistentes foram preservados.
Instalacao efetiva, popup em trabalho real e impressao fisica permanecem
pendentes de verificacao nas estacoes. O filtro do pedido 23403 permanece
fora desta entrega.
