# Motivo da correcao solicitado pela producao

Implementacao local em `fix/corrigir-arte-motivo-20261023`, baseada em
`64ae1512`. O checkout operacional permanece preservado.

Ao selecionar **Corrigir Arte**, o popup solicita a correcao desejada e permite
editar a anotacao existente. Cancelar ou informar somente espacos nao grava.
O retorno para arte e o texto sao gravados juntos em `pedidos_modelos`, com
filtros por `id` e `id_int`. A interface so confirma quando recebe exatamente
uma linha com os status e a observacao solicitados.

O campo existente `observacao_arte` alimenta `amostra_obs` e o box **Anotacoes /
Observacoes de Alteracao**. O texto e escapado na montagem do textarea. Nao ha
coluna, endpoint ou migracao nova. A protecao de modelos impressos permanece.
Os seletores da producao, da fila e do pedido usam a mesma funcao.

Validacao especifica: sintaxe JavaScript, 53 verificacoes de persistencia,
83 verificacoes de Corrigir Arte, contratos de status de impressao e bloqueio
de modelo impresso aprovados. Cancelamento, vazio, falha de banco e ausencia
da observacao na resposta nao anunciam sucesso.
O harness `corrigir_arte_popup_harness.js` abre o dialogo em Chromium, verifica
cancelamento e confirmacao e renderiza o textarea real do box. Caracteres
especiais e texto semelhante a HTML aparecem literalmente, sem criar elementos.

`conferir_duas_versoes.py --base origin/main` executado em serie para producao,
piloto e oficial: 868 testes Python aprovados, 2 ignorados e 2 subtestes em cada
canal; todos os harnesses JavaScript previstos pelo conferidor aprovados.
Reutilizado `node_modules` ja instalado via NODE_PATH, sem instalar dependencias.
A primeira tentativa sem NODE_PATH falhou por ausencia do Puppeteer no worktree;
a execucao completa corrigiu essa configuracao. Logs finais no TEMP do Windows:
`corrigir-arte-producao-completo-20261023.log`,
`corrigir-arte-piloto-completo-20261023.log` e
`corrigir-arte-oficial-completo-20261023.log`.

Comparacao com os arquivos originais de HEAD em uma pasta temporaria confirmou
falhas preexistentes: 8 de 21 casos em `retorno_producao_status_harness.js` e
um TypeError de `name` nulo em `producao_por_cor_fluxo_harness.js`. O caso de
Corrigir Arte deste ultimo passa com a nova observacao.

Nao houve publicacao, pacote de agente, instalacao ou escrita em dados reais.
Essas etapas permanecem separadas da implementacao local.
