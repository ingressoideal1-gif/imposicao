# Montagem — múltiplas composições e mínimo de repetições

Data: 13/09/2026
Estado: publicado na versão v864.

## Objetivo

O bloco **Aproveitamento da folha** permite configurar de 1 a 5 montagens e o mínimo de repetições obrigatório para cada uma. O cálculo pode recomendar uma quantidade maior de montagens somente quando isso reduz o total de impressões.

## Regras implementadas

- **Número de montagens** é um seletor fechado de 1 a 5 e inicia em 1.
- **Mínimo de repetições** é um campo numérico e inicia em 1. O valor vale individualmente para cada montagem.
- Cada montagem é uma composição diferente. Composições iguais não contam como duas montagens.
- Todas as montagens usam todas as células disponíveis no formato. Uma célula excedente produz uma peça adicional; não é deixada vazia.
- O primeiro objetivo é minimizar o total de impressões, calculado pela soma das repetições das montagens.
- O sistema só recomenda mais montagens quando encontra um total estritamente menor. Uma distribuição de sobras melhor, sozinha, não aumenta a quantidade sugerida.
- Entre planos com o mesmo total de impressões, a comparação eleva primeiro a menor sobra, distribuindo as peças excedentes entre os modelos.
- Formato e configuração de frente/verso continuam sendo as condições de compatibilidade da montagem.
- Modelos com dados variáveis mantêm o aviso e a confirmação antes de aplicar qualquer plano que repita as mesmas posições e códigos.

## Comportamento da tela

A recomendação mostra antes da aplicação:

- a quantidade configurada;
- uma eventual quantidade maior sugerida;
- a economia de impressões;
- a composição de cada montagem;
- as repetições de cada montagem;
- tiragem, produção e sobra por modelo.

Ao aplicar, a visualização cria uma folha por composição. O cabeçalho da folha e o resumo do aproveitamento conservam a instrução de repetição de cada montagem enquanto as células não forem modificadas manualmente. O PDF contém uma página lógica por montagem; o operador usa a quantidade indicada para imprimir cada composição.

No compositor, quando um modelo válido está selecionado e o campo **Posições** está vazio, **+ Adicionar** inclui diretamente a posição 1. O preenchimento explícito continua aceitando posições isoladas e faixas, com a mesma validação contra a tiragem.

## Seleção de modelos e combinações recomendadas

O campo **Modelo aguardando** abre um painel multiseleção. Cada linha apresenta pedido, modelo, nome, quantidade e frente/verso, com pesquisa por esses dados. O primeiro modelo marcado define a configuração de faces; opções incompatíveis ficam desabilitadas. O operador pode marcar individualmente, selecionar todos os compatíveis ou usar uma combinação recomendada e revisar os checkboxes antes de carregar.

**Carregar modelos selecionados** adiciona os modelos ao cálculo de aproveitamento sem criar células na folha. Depois do carregamento, cada modelo continua disponível na lista da montagem e pode receber posições manualmente ou participar da recomendação automática.

As combinações são comparadas com a impressão separada dos mesmos modelos. Só aparecem sugestões com economia estritamente positiva. A classificação considera, nesta ordem, maior economia, menor total de impressões, menor quantidade de montagens e melhor distribuição das sobras. São mostradas até três alternativas.

Para manter a interface responsiva, uma triagem rápida considera todos os modelos compatíveis e classifica a economia potencial dos pares e dos grupos derivados deles. As 24 combinações mais promissoras seguem para o cálculo completo, limitado a 500 ms e a cinco montagens. Modelos com dados variáveis ficam fora de combinações que repetiriam as mesmas posições e códigos, mas continuam disponíveis para seleção manual.

## Limites do cálculo

A quantidade máxima de cinco montagens limita o espaço de busca. A busca automática também possui um limite curto de processamento para não bloquear a interface em tiragens grandes. Os resultados encontrados são armazenados em memória durante a sessão e reutilizados em redesenhos da tela.

## Validação local

- Sintaxe de `frontend/montagem.js` com `node --check`.
- Harness do núcleo com casos de regressão e oráculo exaustivo independente para duas montagens pequenas.
- Harness de navegador com seletor 1–5, aplicação de duas composições distintas e completas, recomendação estritamente econômica e instruções de repetição na visualização.
- Suíte Python direcionada à Montagem e à compilação do JavaScript.
