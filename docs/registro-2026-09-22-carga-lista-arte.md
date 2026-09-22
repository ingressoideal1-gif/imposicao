# Recuperação do carregamento da Lista de Arte — 22/09/2026

## Problema reproduzido

O primeiro desenho aguardava leituras globais e reparos de prateleira. A trava
compartilhada de `loadOrdens()` continuava ocupada durante pagamentos,
reconciliação de status e preparação de links. Se alguma etapa não terminasse,
o botão reutilizava a promessa pendente e a atualização automática não tentava
outra leitura. Reabrir a view ainda zerava artes/modelos em memória, mesmo
quando a chamada seguinte reutilizava uma carga em andamento.

Diagnóstico e validação com funções reais em Node/VM, Chromium e dados sintéticos.
Não houve consulta a pedidos reais, medição de rede na estação ou alteração de banco.

## Alteração

- Reabrir a Lista de Arte mantém os dados e filtros disponíveis durante a leitura.
- Leituras diretas têm prazo de 30 segundos; consultas paginadas de propostas e
  pagamentos têm prazo de 90 segundos. O cancelamento é encaminhado ao transporte
  quando suportado. Uma resposta vencida não executa a atribuição ao estado.
- Falha nas fontes essenciais preserva pedidos, itens, modelos e metadados da
  carga anterior. Erro de produtos/propostas não é interpretado como lista vazia.
- A interface indica carregamento ou falha e oferece Tentar novamente.
- Modelos continuam necessários para o primeiro desenho, preservando critérios
  de classificação. Relógios também são lidos antes do desenho, pois o desenho
  registra transições de etapa e não deve calcular crédito com uma fotografia antiga.
  Pagamentos e manutenções existentes rodam depois,
  com uma execução simultânea por tipo; não prendem a leitura principal nem
  são reiniciados às cegas enquanto uma execução anterior está pendente.
- A reconciliação e as gravações existentes não tiveram suas regras alteradas.
- Consultas autenticadas de propostas usam até três lotes independentes em
  paralelo. Paginação, ordem dos resultados, limite total e rejeição de resultados
  parciais foram preservados. Com limite total explícito, os lotes são sequenciais.

Arquivos funcionais: `frontend/script.js` e `frontend/supabase-config.js`.
Não houve mudança de endpoint, SQL, Python, dependências ou permissões.

## Validação

- `lista_arte_carga_harness.js`: timeout/abort/retry em artes, usuários, produtos
  e modelos; respostas atrasadas; preservação dos dados; navegação durante carga;
  complementos pendentes sem duplicação; concorrência máxima de três lotes;
  limite total; falha parcial; botão de recuperação no Chromium.
- `lista_arte_atualizacao_harness.js`: atualização automática, pausa fora da tela,
  concorrência entre cliques e liberação da leitura sem esperar pagamentos.
- `lista_arte_desempenho_harness.js`: lotes de modelos, CSV e cache de rasterização,
  mantendo as otimizações da v929.
- `lista_arte_som_browser_harness.js`: filtros e avisos do usuário.
- `lista_arte_harness.js`: 163 verificações dos critérios da lista.
- `produto_prateleira_lista_arte_harness.js`: 22 verificações.
- `propostas_sem_anon_harness.js`: 14 cenários do transporte autenticado.
- `fila_do_pedido_harness.js`: 51 verificações. O caminho fixo de Puppeteer do
  harness foi adaptado somente no executor em memória para usar a instalação
  existente; o arquivo do teste não foi alterado e nenhuma dependência instalada.

Testes existentes receberam os novos helpers em seus ambientes simulados e
asserções coerentes com a separação da leitura principal e dos complementos.

## Limites

O comportamento de recuperação foi validado, mas não há medição do tempo real
de abertura na estação afetada. Publicação do frontend web não atualiza o painel
embarcado no NewProd. A evidência pública da entrega será a comparação dos
arquivos alterados nos dois domínios após a propagação.
