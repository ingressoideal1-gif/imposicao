# Duplicar para Verso sem Modo PDF

Implementação local na branch `fix/duplicar-verso-sem-modo-pdf`, baseada em
`origin/main` no commit `659dd84b`, na worktree
`C:\ProjetosLocais\ideal-imposition-duplicar-verso-22593`.

## Diagnóstico e comportamento

A análise do pedido 22593/modelo 1001288 confirmou quantidade 10, Modo PDF
desativado, numeração `pdf_duplicate_back` e original PDF de uma página.
A implementação anterior recusava essa combinação no frontend e no motor.

Com Modo PDF desligado, a primeira página da arte da frente passa a alimentar
as duas faces; quantidade, sequência e regra de montagem continuam no fluxo
normal. Com Modo PDF ligado, permanece a exigência de uma página por peça,
repetida no respectivo verso. Os elementos de numeração continuam respeitando
suas faces (`front`, `back`, `both`); duplicar a arte não copia indiscriminadamente
os elementos da frente.

Alterações em `engine.py`, `frontend/script.js`, `frontend/pedido.js`,
`frontend/cliente.js` e `frontend/arte-de-impressao.js`. As prévias usam o original
da frente, inclusive quando existe verso antigo cadastrado. O preparo de
integridade não envia esse verso antigo, mas conserva o cadastro. O portal
desenha este modo ao vivo para não depender de um snapshot de verso anterior.

A geração permanece individual: não foi ampliado o suporte a Multi-Artes ou
à tela Montagem. Não houve alteração de dados reais, dependências ou publicação.

## Validação

- Regressão confirmada contra o motor de `HEAD`: uma página/10 peças era recusada.
- `python -m unittest discover -s tests -p 'test_duplicar_verso_sem_modo_pdf*.py'`:
  8 testes aprovados, incluindo PDFs reais sintéticos, sequência, blocado,
  `strict_assembly`, número de peças, numeração por face, rejeição de verso
  separado, PDF paginado válido/inválido e prévias em canvas real no navegador.
- Harnesses existentes: controles PDF (41), prévia de verso separado (8),
  FxVersoUnico (55), escala da arte (49), integridade (27): 180 verificações
  aprovadas. Também passaram `cliente_pdf_duplicate_back_harness.js` e
  `pdf_duplex_preview_numbering_harness.js`.
- Sintaxe dos quatro JS alterados e compilação de `engine.py`: aprovadas.
- `git diff --check`: aprovado.
- `cliente_verso_atual_harness.js` falha por ausência do mock
  `rotuloDoModoDeImpressao`; a mesma falha foi reproduzida lendo os arquivos
  originais de `HEAD`. Não foi corrigido fora deste escopo.

O Python disponível tem as dependências do motor, mas não tem pytest. Os novos
testes usam unittest, também coletável por pytest. Nenhuma dependência foi
instalada. Os harnesses usam Puppeteer já existente, via `NODE_PATH` apontando
para `C:\ProjetosLocais\ideal-imposition\node_modules`.

## Estado antes da autorização de publicação

Código local validado, sem commit, push, build ou deploy. Para uso na estação,
publicar o frontend e uma versão compatível do NewProd; o motor antigo continua
recusando essa configuração. Verificar posteriormente a versão em execução e
uma amostra física. Os testes não comprovam impressão física.

## Preparação inicial da entrega segura das duas correções

O usuário incluiu também a Lista de Arte. Candidato local: web **v960** e
NewProd **1.2.341**, sem publicação. Cache dos cinco JS funcionais atualizado nas
quatro páginas consumidoras. Versão Python, ProductVersion do MSI e nome de
saída do instalador estão alinhados. `origin/main` foi atualizado e permanece
na base `659dd84b`; as tags candidatas não existiam no remoto na conferência.

Em `frontend/cor-numeracao-do-modelo.js`, a proteção da numeração personalizada
ganhou uma exceção estreita: proprietário diferente do modelo, formato
incompatível com a cor resolvida e exatamente um gabarito ERP compatível.
Personalização própria, formato compartilhado, proprietário/formato desconhecido,
nome explicitamente escolhido e candidatos ambíguos continuam preservados.
O modelo 1001287 foi ajustado pelo usuário durante o diagnóstico; esta entrega
não altera nenhum dado de produção nem as medidas do catálogo.

A abertura da Lista de Arte na base atual já invalida `_dbLoaded` e relê os
modelos. Isso foi confirmado executando `navigateToAmostrasFromOS` e `loadOSItens`
reais contra duas respostas sintéticas sucessivas, sem gravações. Não foi
acrescentada uma segunda rotina de recarga.

### Validação ampliada

Foi localizado o ambiente Python existente em
`C:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\venv\Scripts\python.exe`;
nenhuma instalação foi necessária. A indicação anterior de pytest indisponível
se referia ao Python global.

- Suíte direcionada de 16 arquivos: **162 passaram, 2 falharam**. Falhas também
  reproduzidas na base `HEAD`: expectativa de todos os assets terem a mesma
  versão e expectativa textual antiga de precedência de `verso_tipo` sobre a
  numeração. Não houve mudança dessas regras para fazer os testes passarem.
- Cache/sintaxe após preparar as versões: **78 passaram, 1 falhou**. A falha é
  a ausência de `?v=` no Quill, cujo diretório já inclui a versão `2.0.3`; as
  mesmas referências existem na base e não foram modificadas nesta entrega.
- Pester: reconciliação **14/14** e versão do agente **19/19**.
- Harnesses de carga, atualização, desempenho (incluindo 21 verificações de
  navegador), salvamento por modelo e 19 cenários de navegação passaram.
- O teste de desempenho passou a carregar também a função real
  `pdfDuplicarParaVersoDoModelo`, agora usada pela composição da arte.
- Harnesses antigos `lista_arte_harness.js` (janela textual de busca curta) e
  `modelos_novos_sem_arte_harness.js` (mock `aplicarRegraProdutoPrateleira`
  ausente) falham igualmente com os arquivos originais de `HEAD`. A recarga e
  separação de modelos desta entrega têm regressão funcional própria.
- Revisão do diff e verificação de segredos pelo módulo `Publicacao.psm1`:
  sem achados impeditivos. `git diff --check` aprovado.

### Próximo passo e comprovação necessária

O orquestrador `entrega-segura.ps1` não distribui escopo NewProd; não foi
alterado para contornar essa restrição. A publicação conjunta deve seguir o
procedimento específico: build isolado sem apagar saídas anteriores, validação
do executável/MSI, integração dos arquivos revisados, conferência pública dos
assets nos dois domínios, upload sob nome novo, download e SHA-256 do MSI e só
então ativação de `latest.json`. O build usa configuração secreta e pool já
previstos pelo projeto; não foram lidos ou preparados nesta etapa.

Na preparação inicial, permaneciam pendentes autorização de compilação/publicação, build,
commit/push, deploy, MSI público, manifesto, instalação na estação e prova física.
Recuperação: reversão rastreável do frontend; para o agente, código apropriado
sob versão maior, sem sobrescrever MSI publicado ou depender de downgrade.

## Autorização e integração — 25/09/2026

O usuário autorizou explicitamente compilar e publicar ambas as correções.
A correção concorrente do pedido 22444, publicada em v960 (`0fac89b6`), foi
integrada e preservada. Versão final desta entrega: **web v961 / NewProd 1.2.341**.
Após a integração, a suíte direcionada repetiu **162 aprovações e as mesmas duas
falhas preexistentes** descritas acima. Nenhum teste foi desabilitado.

Build isolado em `build/release-1.2.341`, com dependências existentes e sem
limpar saídas anteriores. A leitura do executável confirmou os módulos,
a versão, as DLLs e bytes idênticos dos nove arquivos frontend da entrega.
Evidência: `evidencias/verso-22593-v961-build.json`.

## Publicação comprovada — 25/09/2026, 10h08 BRT

- Código integrado em `main`: `1765afb411ad3eaf7af2dd7db7654c9761e45e8a`.
  Tags públicas `v961` e `agente-v1.2.341` apontam para esse commit.
- Cloudflare Pages: `success`, deployment
  `5ddfc89a-e951-4cda-a0c8-0d9e334b43c7`.
- Nove arquivos em cada domínio (`imposicao.pages.dev` e
  `imposition.ai-ideal.com.br`): **18/18 hashes normalizados coincidiram**, com
  cache buster. Inclui as quatro páginas HTML e os cinco JS modificados.
- MSI `NewProd_Setup_v1.2.341.msi`: ProductVersion **1.2.341.0**,
  **156.180.480 bytes**, SHA-256
  `98bb171b0dc0ae229e4f24c59c55d0f3039335c8fad55d9bd7d14454a18ea55f`.
  Upload sob nome novo; download pela URL pública simples confirmou tamanho e hash.
- Somente após essa conferência, `latest.json` foi ativado e relido com cache
  buster: versão, URL, tamanho e hash correspondem ao instalador verificado.
- Provas em `docs/evidencias/verso-22593-v961-*.json`: build, versão/tamanho/hash
  local do MSI, deploy, frontend público, MSI público, manifesto e estação.

### Instalação e prova operacional pendentes

Às **10h08m23 BRT**, a LASER-01 reportava agente **1.2.340**, painel **957**,
com heartbeat às **10h08m04**. Portanto a publicação está comprovada, mas a
instalação da **1.2.341** nessa estação ainda não está confirmada.

Em momento ocioso, usar **Atualizar agora** no NewProd, confirmar **1.2.341**,
reabrir o painel **v961** e conferir o pedido **22593/modelo 1001288**: Modo PDF
desligado, primeira página da frente nas duas faces, dez peças e numeração
correta por face. Conferir também os modelos/formato/cor da Lista de Arte com
o ERP. Validar PDF e uma amostra física antes da tiragem. Nenhuma impressão
foi enviada e nenhum dado do pedido foi modificado nesta entrega.

O checkout operacional e suas três alterações não rastreadas foram preservados.
A correção da Lista de Arte preserva a personalização compartilhada válida dos
crachás e não desfaz o ajuste que o usuário realizou no cordão.
