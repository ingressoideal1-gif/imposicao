# Numeração compatível com frente e verso

Correção local baseada em `origin/main` (`6c7badba`), na branch
`fix/numeracao-verso-pronto-23983`.

O incidente do pedido 23983 revelou que um gabarito operacional antigo de só
frente podia substituir, na abertura do pedido, o vínculo de uma numeração
duplex. A categoria comercial do Vibe já exigia frente e verso. Não houve
alteração remota de dados durante esta implementação.

## Comportamento

- `frontend/cor-numeracao-do-modelo.js`: a reconciliação não aplica um gabarito
  cujo modo conhecido seja incompatível com a categoria comercial. Preserva a
  escolha vinculada e as proteções de personalizações e catálogos parciais.
- `frontend/script.js`: antes de gerar a amostra e marcar PRONTO, verifica a
  compatibilidade da numeração vinculada, também em modelos convencionais e
  ações em lote. O aviso orienta selecionar uma numeração compatível no modelo.
- A assinatura conferida antes da gravação inclui `verso_tipo`, para recusar
  mudanças dessa categoria durante a geração da amostra.
- A seleção manual compatível continua usando o salvamento existente. Nenhuma
  alteração no contrato comercial, motor, API ou banco de produção.

## Validação

Dados sintéticos e serviços simulados. Os testes de reabertura verificam os dois
sentidos (frente e verso), catálogo parcial e ausência de vínculo. A prontidão
verifica bloqueio individual/em lote, liberação após selecionar outra numeração
compatível e mudança de categoria durante a prévia: 63 cenários aprovados.

As três verificações Python específicas passaram. A regressão de formatos e
personalizações e o teste de compatibilidade no navegador também passaram.
O Puppeteer foi reutilizado do checkout principal via `NODE_PATH`, sem instalar
dependências. Sintaxe dos dois arquivos JavaScript e `git diff --check` aprovados.

A bateria completa de `conferir_duas_versoes.py --base origin/main` terminou
com sucesso nos canais produção e Piloto: 886 testes Python aprovados, 2
ignorados e 2 subtestes aprovados em cada canal; todos os harnesses Node e de
navegador também passaram. Houve somente o aviso de depreciação de httpx no
TestClient do Starlette. O relatório de execução ficou no diretório temporário
do Windows, em `verso-pronto-23983-testes.json`.

## Limites da entrega

Alteração local, sem commit, publicação web, pacote MSI ou instalação em estação.
A correção não comprova a configuração histórica no instante do incidente nem
o resultado de impressão física. A bateria dos canais é registrada separadamente
na execução de `ferramentas/conferir_duas_versoes.py`.
