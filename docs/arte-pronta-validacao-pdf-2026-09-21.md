# Lista de Arte: páginas do PDF antes de marcar Pronto

Implementação local sobre `5e50a1a9`, branch `fix/arte-validar-paginas-pdf`.

O painel confere o PDF original de cada modelo em modo PDF multipáginas antes
de gerar a amostra ou gravar PRONTO. O botão individual e a ação em lote usam
`decisionAmostraItem`, inclusive no retorno de Corrigir Arte da produção.

| Modo | Páginas exigidas no PDF da frente |
| --- | --- |
| Frente | Quantidade do modelo |
| FxVersoUnico | Quantidade do modelo; o arquivo separado do verso não entra na conta |
| Duplicar para Verso | Quantidade do modelo |
| FxVerso / frente ímpar e verso par | Duas vezes a quantidade, com pares completos |

Página excedente também bloqueia. A mensagem identifica modelo, páginas encontradas
e esperadas. Quantidade inválida, PDF ausente/ilegível/indisponível ou numeração
referenciada não carregada impedem avançar. Alteração local dos dados durante a
conferência exige repetir o clique. Nenhuma quantidade é corrigida automaticamente.

O original é lido novamente no clique, sem aproveitar a contagem do visualizador.
A trava pertence ao painel interno; não altera a aprovação do portal ou o motor
de impressão. Não é uma restrição no banco para gravações feitas por outros clientes.

Validação offline: 24 casos novos com leitura de PDF e persistência simuladas,
84 casos existentes de ações em lote, sintaxe JS e diff. Os testes verificam os
cinco modos, excesso/falta de páginas, falhas de leitura, mudanças durante a
conferência e preservação do fluxo convencional. Nenhum banco real foi alterado.

O harness `arte_de_aprovacao_harness.js` falha por
`aplicarRegraProdutoPrateleira is not defined`; reproduzido também na base
inalterada `5e50a1a9`. Não foi corrigido neste escopo.

Publicação e validação operacional no navegador pendentes. Para retomar, usar o
worktree `C:\ProjetosLocais\ideal-imposition-arte-validar-paginas`.
