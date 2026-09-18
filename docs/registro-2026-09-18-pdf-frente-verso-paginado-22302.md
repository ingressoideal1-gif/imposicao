# Pedido 22302, modelo 1001125 — PDF paginado frente e verso

Data: 18/09/2026. Registro de encerramento da implementação e publicação.

## Contrato entregue

- **PDF Ímpar Frente e Verso Par:** a numeração usa `pdf_odd_even`. Um PDF de exatamente `2 × QTD` páginas fornece a frente nas páginas ímpares e o verso nas páginas pares. Cada par corresponde a uma peça.
- **Duplicar para Verso:** a numeração usa `pdf_duplicate_back`. Um PDF de exatamente `QTD` páginas fornece uma página por peça; a mesma página de origem é usada na frente e no verso.
- Os dois modos apresentam janelas de frente e verso com navegação sincronizada no painel e no portal do cliente. A geração exige um modelo individual em `Pdf Paginado`, recusa PDF com contagem divergente e não solicita arquivo separado de verso.
- Os modos `Frente`, `FxVerso` e `FxVersoUnico` mantêm seus caminhos anteriores. A Montagem recusa os dois modos especiais, que devem ser gerados individualmente na janela Pedido.

## Código e ambientes

- Worktree isolada: `C:\ProjetosLocais\ideal-imposition-pdf-impar-par-22302`, branch `feat/pdf-impar-frente-verso-par-22302`.
- Base anterior: `origin/main` em `7c9b6c53`. O checkout operacional `C:\ProjetosLocais\ideal-imposition` e suas alterações preexistentes não foram modificados.
- Commit funcional: `942785bb` (`app.py`, `engine.py`, frontend, testes, lista de arquivos sincronizados da estação e ajuste do publicador do agente).
- Commit de versão NewProd: `bba849cd`, também em `origin/main`. Tags: `v896` e `agente-v1.2.334`, ambas apontando para esse commit.
- Nenhum SQL, Edge Function, dado de pedido, dependência ou configuração de acesso foi alterado. A alteração remota de configuração foi o manifesto de release do agente, descrito abaixo.

## Validação antes da publicação

- Bateria focada de PDF, modos antigos, prévias, portal, montagem, cache e sincronização da estação: **160 testes aprovados**.
- Testes Pester de versão, segredo e pool do agente: **45 aprovados**. Sintaxe dos JS alterados, compilação Python, parser do publicador e `git diff --check`: aprovados.
- Suíte Python completa: **2.579 aprovados, 2 ignorados e 13 falhas**. Doze falhas foram reproduzidas na revisão anterior e não pertencem a este fluxo: amostra em tamanho real, Deno indisponível, informações do modelo no portal, estação sem sessão, dois casos de histórico de artes, link por token, lista autenticada, CSS do acabamento, Produção por Cor, status consolidado e regras de bloqueio. O caso de `test_temp_manager.py` falhou na execução paralela e passou na repetição isolada. Essas falhas não foram ocultadas nem tratadas como prova positiva.
- Simulação de `publicar_agente.ps1` compilou o executável e o MSI `1.2.334`, conferiu o segredo embutido e o pool de QR de 24.000.000 bytes, e restaurou os arquivos de versão sem publicar. O build real repetiu essas verificações.

## Publicação e prova externa

- NewProd `1.2.334`: MSI de **156.028.928 bytes** (148,8 MiB), abaixo do limite consultado de 200 MB do bucket. O arquivo enviado foi baixado pela URL pública antes da ativação do `latest.json`; SHA-256 local, baixado e do manifesto: `8f6fe45d2fcb6ab579ec61c5630ee5eb357c3e09f14353ba13d87cd695e883ee`.
- Manifesto público: `https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/agent-releases/latest.json`, versão `1.2.334`, mesmo tamanho e SHA-256. A tag `agente-v1.2.334` está no remoto.
- Web `v896`: `index.html`, `producao.html`, `cliente.html`, `script.js`, `pedido.js`, `montagem.js` e `cliente.js` foram baixados com cache-buster e comparados por SHA-256 após normalização de BOM e CRLF. Resultado: **14/14 iguais** em `https://imposicao.pages.dev` e `https://imposition.ai-ideal.com.br`. A tag `v896` está no remoto.

## Limites e retomada

- Não houve consulta ou alteração do pedido real 22302/modelo 1001125. Os testes usaram PDFs sintéticos.
- A publicação do manifesto não comprova que uma estação instalou a versão. Na retomada, verificar heartbeat/versão instalada do NewProd e gerar uma amostra física frente e verso antes de considerar a impressão operacional validada.
- Para recuperar a web, partir da tag `v896` e do commit anterior `7c9b6c53`; reverter a mudança funcional em novo commit, atualizar o cache, publicar e conferir novamente os arquivos públicos. Para recuperar o agente, compilar o código anterior da tag `agente-v1.2.333` com um **número novo maior que 1.2.334**; não sobrescrever o MSI já publicado nem reduzir a versão, pois as estações ignoram versões menores.
- As 12 falhas preexistentes da suíte completa merecem tarefas próprias. A falha intermitente de `test_temp_manager.py` deve ser observada se voltar a ocorrer.
