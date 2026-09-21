# Lista de Arte: carregamento e atualização das amostras

Implementação local de 21/09/2026, na branch `fix/lista-arte-desempenho-20260921`, baseada em `570b4662` (referência local de origin/main, v928). Checkout: `C:\ProjetosLocais\ideal-imposition-lista-arte-desempenho`. O checkout operacional foi preservado.

## Resultado

Em `frontend/script.js`:

- A carga global de modelos usa até três lotes simultâneos de 200 pedidos, mantendo campos, filtros e a ordem dos lotes. Uma falha não substitui os modelos anteriores por um resultado parcial.
- A abertura dos itens consulta modelos e produtos em paralelo, com os mesmos campos e filtros.
- A reconciliação de status e os reparos de prateleira usam até quatro trabalhadores cada. As confirmações individuais de gravação continuam obrigatórias; retorno vazio não confirma sucesso.
- A carga de CSV só conta sucesso quando `csv_data` deixa de ser `undefined`. Falhas não disparam tentativa imediata; uma nova tentativa fica disponível após 30 segundos, ao reabrir/redesenhar o pedido. O controle mostra “não carregado”, mantendo as travas existentes.
- Quando bancos/fontes chegam, o template continua calculando os mesmos avisos e travas, mas apenas esses trechos e os controles são atualizados. Os canvases, uploads e observações permanecem no DOM, e as quatro consultas auxiliares do briefing não são repetidas por esse caminho.
- As camadas PDF da cor e da arte são reutilizadas entre repintes, incluindo requisições simultâneas. O cache tem até 12 entradas e limite estimado de 64 MiB para strings das chaves e bitmaps retidos; trabalho transitório em execução não está incluído nesse limite. Documentos PDF são destruídos após rasterizar. Não se zera um canvas ainda usado por outro desenho.
- Mudanças de conteúdo, face, escala ou dimensão relevante geram outra entrada. A arte também usa uma identidade por objeto carregado: reabrir o pedido permite reler a mesma URL. A composição e a numeração variável continuam sendo redesenhadas; não são cacheadas juntas.

Não foram alteradas regras de quantidade/TICKET, blocagem, aprovação, impressão, autenticação, SQL, campos consultados ou backend. A lista ainda aguarda os modelos necessários à classificação e às miniaturas. Não foram removidos campos de imagem sem medir os dados reais.

## Validação

`tests/lista_arte_desempenho_harness.js` executa funções reais com serviços simulados e usa Chromium para DOM/canvas. Comprova:

- 12 pedidos de reconciliação, até quatro em voo, sem ocultar a falha de um deles.
- CSV sem sucesso falso, sem repetição imediata, recuperação após o intervalo e distinção entre ausência confirmada e erro.
- 650 modelos em quatro lotes (200/200/200/50), até três simultâneos, e preservação do estado após falha.
- Duas consultas independentes iniciadas juntas ao abrir o pedido; falha libera a trava sem inventar itens.
- Oito reparos de prateleira, até quatro simultâneos: sete confirmados e um retorno vazio recusado.
- Três composições da mesma prévia com apenas duas rasterizações no total (uma cor e uma arte), pixels idênticos nos repintes, escala por eixo, página 2 da cor no verso, invalidação, deduplicação, limites e recuperação do cache.
- Preservação da identidade do canvas/upload, foco, texto e seleção em edição; atualização dos avisos e da trava PRONTO; resposta de outro pedido ignorada pelo atualizador parcial.

Resultado final: **113 testes pytest passaram**, incluindo sintaxe de todo o frontend e as suítes Lista de Arte, desempenho, cards/CSV sob demanda, ações em lote, status, prateleira e PDF da cor. Harnesses adicionais: escala da arte (49), controles PDF (41) e glifos (21) passaram. `git diff --check` passou.

Foram ajustadas referências de assinatura nos testes e resolução de Puppeteer via `NODE_PATH`, sem instalar dependências. Dois harnesses antigos falhavam também no checkout original por dependências simuladas ausentes: bancos próprios do pedido no harness de CSV e nome preferencial no de atualização automática. Os fixtures foram completados; nenhuma asserção foi retirada.

Ambiente utilizado: Node existente; Puppeteer de `C:\ProjetosLocais\ideal-imposition\node_modules`; Python/pytest do ambiente já instalado em `C:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\venv\Scripts\python.exe`. Nenhum acesso a serviços reais foi necessário.

## Entrega e retomada

Somente implementação local: sem commit, push, publicação, build ou instalação do agente. Não há medição de velocidade, memória ou tráfego na estação real, nem aceitação de impressão física. PDF.js e serviços foram simulados nos novos testes; o Chromium executou o DOM e os canvases reais.

Para publicar, integrar somente esta alteração sobre a versão vigente, repetir as validações afetadas pela integração, versionar os assets e seguir a verificação pública de entrega. Depois medir abertura de pedidos, rolagem e atualização de frente/verso na estação. As alterações locais são reversíveis pelo diff desta branch, sem tocar no trabalho operacional preexistente.
