# Carregamento do dashboard da Lista de Arte

Correção local sobre `origin/main` em `924b921e`, no worktree
`imposition-dashboard-carga-20261031`, branch `fix/dashboard-arte-carga-20261031`.
O checkout operacional foi preservado. Sem publicação ou escrita remota.

## Alteração

- O dashboard usa o recorte `dashboard-arte`: mantém o histórico e as fontes das
  métricas, mas não aguarda consultas de prazos, rastreamento e horários de entrega.
- Prazos já conhecidos são conservados. A volta aos cards operacionais consulta
  seus dados normalmente; a carga analítica não é reutilizada como carga operacional.
- Cliques e buscas dentro do dashboard já carregado reutilizam os dados. O botão
  Atualizar e a atualização automática continuam buscando dados novos. Após erro,
  o próximo clique permite nova tentativa, preservando o resultado anterior.
- A montagem das ordens indexa as propostas uma vez, preservando a primeira
  correspondência e os tipos, em vez de percorrer todas as propostas por pedido.
- Não houve alteração dos cálculos de Prontos/Aprovados, Produtos ou designers.

## Evidência local

O harness seletivo usa 4.744 propostas históricas sintéticas. No mesmo cenário,
a carga operacional completa fez 86 chamadas registradas; o dashboard fez 38.
São 48 chamadas a menos (aproximadamente 56%), preservando todos os pedidos e
os campos usados pelas métricas. Não é uma medição de latência em produção.
As chamadas de horários são simuladas separadamente; o teste confirma que não
são feitas pelo dashboard.

Passaram: 112 verificações do harness seletivo; carga/timeout/retry com Chromium;
atualização automática; métricas do dashboard de arte e de produção; navegador
desktop/mobile do dashboard; lista enxuta (53 verificações); lotes e horários
locais; sintaxe de `script.js`; `git diff --check`.

O harness seletivo tinha uma falha anterior por ausência do mock
`blocagemDoModelo`, reproduzida também com o código original de HEAD. Foi incluído
o mock para executar os cenários já existentes de preservação do editor aberto.
O Puppeteer foi usado da instalação existente do checkout operacional via
`NODE_PATH`, sem instalação de dependências.

## Limites e retomada

As consultas gerais de artes, produtos, links, relógios, propostas e modelos
continuam necessárias neste fluxo. Uma carga já em andamento ainda termina antes
da mudança de recorte, preservando a proteção contra escritores concorrentes.
Não foram corrigidas ou validadas as divergências dos números com dados reais.

Depois de uma publicação autorizada, medir a abertura do dashboard com a sessão
afetada, conferir ausência das consultas de prazos durante sua carga e comparar
Prontos/Aprovados e Produtos de um designer com pedidos concretos do mesmo período.

## Adendo: contagens instáveis na atualização automática

Após autorização explícita, a inspeção somente de leitura em produção confirmou
`max_rows=1000` na API e 1.446 links ativos. Havia 290 links com `arte_pronta_em`
entre 25/10/2026 00:00 e 01/11/2026 00:00, no fuso America/Sao_Paulo. Uma consulta
sem ordem limitada a 1.000 retornou apenas 62 desses links. Esses valores são uma
fotografia da auditoria, não o total correto definitivo da métrica.

Links não eram paginados nem ordenados. Artes e produtos também tinham leitura
global sem paginação. Os lotes de modelos limitavam pedidos, não a quantidade
de modelos retornada, podendo exceder o mesmo teto.

A correção autorizada adiciona páginas de 500 com desempate por chave única nas
quatro fontes. Cada carregador acumula as páginas antes de substituir seu estado.
Os desenhos da lista e do dashboard aguardam a carga geral terminar. A finalização
redesenha o conjunto completo; em erro, restaura o anterior, inclusive os relógios.
O ciclo automático de 60 segundos permanece ativo e mudanças reais continuam
podendo alterar os resultados. As várias consultas não constituem uma transação
única no servidor: a proteção impede exibição intermediária, não promete um
snapshot transacional entre fontes.

Validação adicional: `dashboard_arte_paginacao_harness.js` usa 1.446 links,
1.439 artes, 1.205 produtos e 1.205 modelos. Confirma cobertura integral, ordem
estável mesmo invertendo a ordem física simulada, falha na segunda página de cada
fonte, recuperação, resposta vazia e ausência de desenho intermediário. Passaram
também os harnesses de atualização em 60 segundos, carga/timeout/retry e dashboard
no Chromium. O teste novo está integrado em `tests/test_dashboard_arte.py`.

Permanecem separadas a publicação e a revisão semântica das métricas históricas
(data da última versão, status atual e relógio legado). Nenhuma dessas regras foi
alterada para tentar fazer as contagens coincidirem com a imagem.
