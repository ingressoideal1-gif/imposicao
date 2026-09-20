# Produto ausente quando o modelo está PENDENTE

Depois da v919, o usuário mostrou o dropdown carregado com apenas um produto, embora esperasse dezenas. O problema de seleção reproduzido nesta entrega é distinto do início da carga.

O código compartilhado em `loadOSItens` e na criação de modelos grava `status_producao: 'PENDENTE'` sem necessariamente preencher `status_impressao`. A página por cor usa `status_impressao || status_producao`, mas a normalização geral devolve PENDENTE sem convertê-lo. O filtro então exclui o modelo. Na linha do Painel de Produção, o select sem opção marcada seleciona a primeira opção, Aguardando. Por isso o que se vê como Aguardando no painel podia não entrar no dropdown.

Correção localizada na leitura de Produção por Cor: PENDENTE, inclusive variações de caixa/espaços, equivale a Aguardando. O status de impressão explícito mantém precedência; Impresso e Corrigir Arte não entram. A regra vale para carga, filtros, abertura do modelo e seleção visual de status. Não há escrita de status, migração ou alteração de outros painéis nesta correção.

Reprodução offline: 30 produtos, duas cores por produto; um modelo explicitamente Aguardando e os outros com impressão vazia e produção PENDENTE. A v919 retorna somente um modelo/produto; a correção retorna os 60 modelos e os 30 produtos, separa as duas cores e permite abrir um modelo legado. Modelos explicitamente Impresso e Corrigir Arte continuam excluídos. O navegador também seleciona um produto com impressão vazia/PENDENTE.

Validação: suíte de Produção por Cor e sintaxe do frontend, 78 testes aprovados, incluindo 25 cenários de fluxo. Nenhum banco real foi consultado. A quantidade de produtos da sessão do usuário não foi medida; a reprodução demonstra a falha do código, não uma contagem real da empresa.

Entrega frontend na sequência já autorizada. Base ea1e77d3/v919. Conferir index.html e producao-por-cor.js nos dois domínios após a propagação; não executar build de NewProd para esta correção web.
