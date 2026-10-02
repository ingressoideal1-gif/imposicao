# Status da arte no retorno da produção — pedido 22602

Análise de 02/10/2026. Correção preparada localmente na branch
`fix/status-retorno-producao-20261002`, a partir de `origin/main` em
`1c4efb9f` (v994). Checkout operacional preservado. Nenhum commit, deploy,
alteração de backend ou escrita em produção nesta análise.

## Evidência do pedido e da versão publicada

As consultas de leitura foram filtradas pelo pedido 22602 no Supabase de
produção `vwbtitjlpelrcnsytzqw`, usando a configuração pública do frontend.

- Na consulta anterior desta conversa, `pedidos_artes.status = Enviar Arte`,
  enquanto `entrega_dados = APROVADO` e o único modelo, 1001642, tinha
  `status_arte = APROVADA` e `status_impressao = Aguardando`.
- Na nova consulta desta análise, o consolidado já estava `APROVADO`, com
  os mesmos estados do modelo e de Entrega/Faturamento. Essa mudança ocorreu
  fora desta análise; não foi executada por este agente.
- A leitura de `propostas` e `pedidos_links_cliente` foi recusada com
  `42501` na consulta anterior. O ciclo produção → arte → produção foi
  informado pelo operador. Sem auditoria autenticada, não foi atribuído o
  evento histórico a um botão ou usuário específico.
- O `script.js` público de `https://imposition.ai-ideal.com.br`, consultado
  com URL sem cache, corresponde à base v994 após normalização de BOM e
  finais de linha. SHA-256 normalizado:
  `2f8b6241eb58e4450e2ed47cf37a7d9b314e05f2a71efcaa604f06c257dff30e`.

## Causas reproduzidas no código publicado

1. **Voltar para Atendimento:** após `decisionAmostraItem(..., PRONTO)`
   aprovar novamente o modelo corrigido e liberar sua impressão, o botão
   aceita modelos `APROVADA` como prontos. Grava diretamente `Enviar Arte`
   no consolidado, altera o estágio do link e chama
   `prepararLinkDaArtePronta`, reiniciando o preparo do link já aprovado.
   Esse caminho reproduz exatamente a combinação de status encontrada.
2. **PRONTO em lote:** chama `promoverPedidoSeTodosProntos` no final, mesmo
   quando o modelo acabou de sair de `Corrigir Arte`. A função aceitava um
   conjunto inteiro já aprovado e não verificava o estágio de produção.
   Assim reabria o estágio local e do link como `Enviar Arte`. O caminho
   individual já excluía a promoção quando `liberaImpressao` era verdadeiro.
3. **Recuperação incompleta:** a reconciliação deixava de fora pedidos já
   em produção com `pedidos_artes.status = Enviar Arte`. Uma gravação de
   modelo confirmada seguida de falha do consolidado podia permanecer
   inconsistente até outra intervenção.

## Correção local

Em `frontend/script.js`:

- `voltarParaAtendimento` bloqueia cancelados. Para pedido que já saiu da
  arte, modelos todos aprovados ou alguma correção ainda marcada, confirma
  o status consolidado pela função existente e encerra o retorno sem
  preparar outra versão do link. Uma falha de confirmação fica visível.
- `promoverPedidoSeTodosProntos` impede a promoção de cancelados e pedidos
  que já saíram da arte. Exige ao menos um modelo efetivamente `PRONTO` e
  nenhuma marca `Corrigir Arte` pendente. O fluxo inicial com modelos
  prontos e outros aprovados continua promovendo para `Enviar Arte`.
- `reconciliarStatusPersistidosDaListaArte` passa a incluir pedidos que
  saíram da arte com `Enviar Arte` consolidado, preservando as exclusões de
  retorno explícito `Em Arte`, cancelados, ignorados e histórico aprovado.
  A exigência de sessão e o limite de quatro consultas simultâneas continuam.

Preservados: aprovação por modelo, impressão `Aguardando` após correção,
modelo irmão já impresso, estágio comercial da proposta e precedência de
`Corrigir Dados`. Nenhuma quantidade, numeração, valor financeiro,
permissão, schema ou migração foi alterada.

## Validação

O novo `tests/retorno_producao_status_harness.js` extrai as funções reais e
usa banco em memória, DOM simulado e operações externas simuladas. Não
consulta produção. Existe integração com pytest em
`tests/test_retorno_producao_status.py`.

- Antes da correção, 14 dos 18 cenários iniciais falharam com a fonte da
  base v994; isso inclui o retorno pelo botão, promoção em lote e recuperação.
- Após a correção e ampliação dos limites: **21 cenários passaram**.
  Incluem ciclos individuais e em lote, segundo modelo já impresso, retorno
  ao atendimento, fluxo inicial de envio, falha de consolidação e recuperação
  sem repetir a gravação do modelo, prioridade de correção de dados,
  cancelamento, ausência do status ERP e exclusão do histórico aprovado.
- Harnesses existentes aprovados: ações em lote (84), persistência de
  Corrigir Arte (37), Corrigir Arte (83), estação sem sessão (17), arte de
  aprovação (46) e retorno por ambos os botões.
- `lista_arte_desempenho_harness.js` passou na concorrência/retry e no
  Chromium (22 verificações de DOM/canvas), usando o Puppeteer já instalado
  no checkout operacional via `NODE_PATH`. Nenhuma dependência foi instalada.
- Sintaxe de `frontend/script.js` e do novo harness aprovada por
  `node --check`; `git diff --check` aprovado.
- O harness antigo `status_pedidos_artes_harness.js` falha com
  `ReferenceError: window is not defined`, também ao carregar a fonte
  original de `HEAD`. Essa falha preexistente não foi modificada.
- Pytest não foi executado: o `venv` indicado pelo repositório não existe
  neste checkout e o Python disponível não tem pytest. Os harnesses acima
  foram executados diretamente em Node. O novo wrapper Python também foi
  executado diretamente e passou.

## Entrega e retomada

Worktree: `C:\ProjetosLocais\ideal-imposition-status-retorno-producao-20261002`.
Arquivos da tarefa: `frontend/script.js`, os dois novos arquivos de teste
e este registro. As mudanças estão locais e sem commit.

O pedido 22602 já estava consolidado como `APROVADO` na consulta desta
análise; não foi necessária uma correção remota pontual. O mecanismo causal
foi reproduzido, mas a cronologia exata da ocorrência depende de auditoria
autenticada que não estava disponível.

Publicação web e sincronização do painel local NewProd ainda não foram
executadas. A correção só passa a prevenir ocorrências operacionais após
essa entrega. Não foi validada impressão física nem o navegador operacional
do usuário. Uma futura entrega deve partir da base então vigente e preservar
as demais mudanças do projeto. Recuperação por reversão apenas das alterações
desta tarefa; nenhum dado de produção foi modificado aqui.
