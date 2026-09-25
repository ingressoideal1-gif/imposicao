# Pedido 22444 — falso bloqueio de integridade da numeração

## Relato e diagnóstico

Erro informado: “A numeração mudou ou não foi carregada integralmente. Reabra o pedido.” O usuário respondeu “todas” à pergunta sobre estação/ação e autorizou consultas de diagnóstico somente leitura nesse escopo, sem alteração de dados.

Consulta de produção restrita aos vínculos dos modelos e à configuração de numeração, sem clientes nem linhas de banco variável:

- Modelos 1001203, 1001204, 1001205, 1001206 e 1001207, todos do pedido 22444.
- Todos vinculados à numeração `e51a245b-8bb5-4ca1-9d0e-947ba2c92c92`.
- Configuração sequencial, frente, ticket_qtd 1, com TEXT, QR_IDEAL, PDF e METADATA.
- O elemento PDF possui conteúdo cadastrado; valores de arte e conteúdo variável não foram reproduzidos nesta documentação.

O preload de `frontend/pedido.js` e `frontend/script.js` acrescenta `_pdfCanvas`, `_pdfLoading` e outros controles de prévia aos objetos compartilhados de `state.numeracoes[].elements`. A barreira de `confirmarIntegridadeDoTrabalho`, em `frontend/arte-de-impressao.js`, comparava esses objetos inteiros com os elementos persistidos no Supabase. Assim, carregar corretamente a prévia alterava o objeto local e provocava uma falsa divergência.

Teste sintético antes da correção: mesma numeração no cadastro e no payload, acrescentando apenas `_pdfCanvas` ao estado local, produziu exatamente a mensagem relatada. A configuração do pedido real é compatível com esse caminho. Não foi capturado o estado do navegador da ocorrência, nem enviada impressão real.

## Correção

Na comparação de elementos, desconsiderar exclusivamente os campos transitórios conhecidos: `_pdfCanvas`, `_pdfLoading`, `_svgImage`, `_svgLoading`, `_pdfPreview`, `_preloadFalhou` e `_assinantes`. A mesma regra vale na conferência do payload contra a numeração local confirmada.

Não remover esses campos do objeto compartilhado; projetar uma cópia para comparação. Propriedades persistidas, inclusive `_centerAnchor`, conteúdo do PDF, posições, face e modo de renderização continuam participando. Numeração ausente, lista de elementos não carregada, campos divergentes, banco divergente ou conteúdo obrigatório ausente continuam bloqueando. Nenhum dado de produção foi alterado.

## Validação e entrega

- Regressão reproduzida antes da mudança com a mensagem exata.
- 38 verificações no harness Node e no navegador, incluindo canvas real no navegador, caches transitórios, ausência de elementos, mudança de conteúdo/posição/face/modo/âncora e PDF omitido do payload.
- Sintaxe JavaScript e diff conferidos.
- Entrega segura simulada: escopo Frontend, versão prevista v960, referências de cache em `index.html` e `producao.html`.
- Correção exclusivamente no frontend; o NewProd permanece 1.2.340. A cópia local do painel precisa receber a sincronização e ser reaberta para carregar o helper novo.

A publicação e suas provas serão registradas após a conferência pública. A prova do PDF e a impressão física do 22444 permanecem distintas dos testes sintéticos.
