# Lentidão na Lista de Arte e nas amostras — 21/09/2026

## Escopo e evidência

Análise local de código e histórico, com funções reais executadas em Node/VM e serviços simulados. Nenhum acesso a banco compartilhado, credenciais ou pedidos reais. Nenhuma alteração funcional ou publicação.

Checkout operacional: `21c4b722`; referência local `origin/main`: `570b4662` (v928). Não foi feito fetch nem verificação da versão publicada. Foram comparadas e estão idênticas, desconsiderando CRLF, as funções `carregarOrdensDados`, `carregarModelosGlobais`, `reconciliarStatusPersistidosDaListaArte`, `loadOSItens`, `carregarBancosDoPedido` e `drawAmostraFace` entre essas referências.

## Achados

### 1. A primeira lista espera o carregamento global de modelos

Em `frontend/script.js`, `carregarOrdensDados` carrega produtos, artes, links, tempos e usuários; depois aguarda `loadOrdensFromVibecode` e `carregarModelosGlobais` antes do primeiro `renderOrdens` no caminho principal.

`carregarModelosGlobais` consulta todos os pedidos presentes em `state.ordens`, em lotes sequenciais de 200 números. A seleção inclui `amostra_arte_base64`. A consulta inicial de `produtos_proposta` também inclui esse campo, apesar do comentário que diz excluir imagens pesadas. O nome do campo não comprova o tamanho: ele pode conter URL curta ou base64; o volume real não foi medido.

O carregamento global ainda aguarda `sincronizarAprovacaoProdutosPrateleira`, que grava modelos pendentes um por um. Essa espera foi introduzida em `63722d44`, de 19/09, v909. É um candidato recente a aumento da demora inicial, condicionado à existência de modelos de prateleira pendentes. Não se deve remover a regra de aprovação/foto/impresso para ganhar desempenho.

### 2. A conclusão da atualização espera uma reconciliação por pedido

Depois do primeiro desenho, `carregarOrdensDados` espera pagamentos, sincronização de status e preparação dos links. A sincronização chama `reconciliarStatusPersistidosDaListaArte`, que percorre os candidatos com `await` dentro do laço.

Cada `sincronizarStatusConsolidadoPedidoArte` consulta novamente `pedidos_artes`, mesmo se nada mudou; pode ainda consultar modelos e gravar divergências. Essa reconciliação entrou em `0e6c5612`, de 15/09, v883. Ela não bloqueia o primeiro desenho do caminho principal, mas mantém a promessa de `loadOrdens` pendente; outros chamadores compartilham essa promessa.

Experimento com a função real e 12 candidatos sintéticos: **12 chamadas, concorrência máxima 1**. Com 200 ms hipotéticos por chamada, só essa etapa somaria 2,4 segundos; isso é uma ilustração, não uma medição da rede real.

### 3. Abrir os modelos acumula consultas e reconstruções

`navigateToAmostrasFromOS` invalida o carregamento dos itens a cada abertura. `loadOSItens` consulta modelos, produtos e artes em sequência; depois a navegação aguarda `recarregarNumeracoesDoPedido` antes de mostrar as amostras. A releitura garante atualidade dos dados, portanto não deve ser simplesmente eliminada.

`renderAmostrasOSItens` substitui `container.innerHTML`. Quando chegam bancos ou novas coberturas de fontes, chama a renderização inteira novamente. Isso destrói os canvases anteriores e reinicia o desenho dos cards visíveis. A mesma renderização também dispara `loadBriefingBase`, `loadAnexosPedido`, `loadUltimosPedidos` e `loadDadosEntregaInterno`.

Já existe desenho sob demanda com `IntersectionObserver`; portanto não é correto afirmar que todos os modelos sempre são desenhados na abertura. O problema é repetir a reconstrução e o processamento dos que entram no campo de visão.

### 4. A composição reabre e rasteriza PDFs a cada atualização

No caminho multicamada de `drawAmostraFace`, a cor é decodificada e passada a `pdfjsLib.getDocument` a cada execução; a página é rasterizada em um novo canvas. O PDF da arte tem outro caminho equivalente. Não há reutilização do documento/canvas da cor nessa função, nem `destroy()` desses documentos no corpo da função.

Experimento executando a função real com canvas e PDF.js simulados: **3 repintes da mesma cor resultaram em 3 aberturas de documento e 3 rasterizações**. Isso comprova repetição de processamento; não comprova três downloads físicos, pois o navegador pode reutilizar cache HTTP. O visualizador de PDF paginado tem lógica própria de reutilização e não deve ser confundido com essa composição.

### 5. Falha de CSV pode provocar tentativas e redesenhos repetidos

`carregarBancosDoPedido` captura a falha de `garantirCsvDaNumeracao`, mas incrementa `baixadas` mesmo assim. O chamador em `renderAmostrasOSItens` interpreta um retorno positivo como motivo para redesenhar. Como o CSV continua faltando, a próxima renderização fica elegível para buscar novamente, sem espera progressiva nesse caminho.

Experimento com a função real e uma numeração cuja leitura sempre falha: **3 chamadas falharam, mas retornaram `[1, 1, 1]`; a numeração permaneceu faltante**. A ligação com o redesenho foi conferida no código do chamador. Não foi reproduzido um navegador inteiro nem confirmado que essa falha esteja acontecendo na estação. O laço de contagem existe desde `40cede49`, de 26/08; uma falha nova de rede/dados pode expor um defeito antigo.

## Ordem recomendada de correção

1. Contabilizar somente CSV efetivamente carregado e controlar novas tentativas; manter indicação de erro, sem substituir banco ausente por numeração sequencial.
2. Atualizar somente bancos, controles e prévias afetados, preservando DOM e edições em andamento.
3. Reutilizar documentos/rasterizações PDF com limite de memória e invalidação por conteúdo, face, dimensões e escala; preservar fidelidade com a impressão.
4. Reduzir esperas sequenciais de leitura e retirar manutenção pesada do caminho de exibição, mantendo confirmação das gravações e evitando estado visual falsamente confirmado.
5. Medir payloads antes de alterar seleção de campos: miniaturas e classificação dependem de parte desses dados.

## Limites e retomada

Há mecanismos concretos de lentidão e duas adições recentes relevantes, mas não há evidência suficiente para atribuir toda a regressão a uma versão, ao Dashboard, ao Supabase ou à máquina. Não foram medidos CPU, memória, tráfego, erros HTTP e duração das etapas na estação afetada.

Próximo passo: corrigir e testar os caminhos acima em checkout isolado. Para fechar a causa operacional, medir uma abertura lenta e uma atualização de prévia no ambiente afetado, com autorização para o acesso aos dados reais conforme `AGENTS.md`. Preservar status, prateleira, dados de numeração, frente/verso e fidelidade das amostras. Publicação permanece fora desta análise.
