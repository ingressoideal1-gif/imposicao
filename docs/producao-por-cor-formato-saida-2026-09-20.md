# Paridade da abertura do modelo: formato e saída

O usuário pediu que a janela de Produção por Cor repita o comportamento dos modelos abertos pelo Painel de Produção, mudando somente a organização por cor.

Causa reproduzida: enviarParaPedido normalmente chama showView('view-pedido'), que executa renderPedOSQueue antes de enviarParaImposicao. O render resolve o formato do produto por id_formato_num, atribui o id interno ao modelo e aplica a saída padrão quando não há uma salva. Na janela externa, manterViewAtual pulava showView e também essa preparação. O resolvedor seguinte podia atribuir o código ERP numérico a um select com IDs internos, deixando o formato vazio, e escolher a primeira saída disponível.

Correção localizada: no ramo externo de enviarParaPedido, executar o mesmo renderPedOSQueue antes de mover a janela e delegar à resolução compartilhada. Não há outro algoritmo de formato/saída. O fluxo normal continua igual. As gravações automáticas existentes da fila seguem o comportamento normal do Pedido; nenhum banco real foi usado nos testes.

Novo harness de navegador executa as funções reais renderPedOSQueue, enviarParaPedido e enviarParaImposicao com catálogos sintéticos e rede bloqueada. A versão anterior produz formato vazio e saída s2 em vez de formato f1 e saída padrão s1. A correção comprova igualdade dos dois caminhos para saída padrão, saída previamente salva e troca para outro modelo/produto com formato f2 e saída s2. Integrações, prévias gráficas e gravações são simuladas.

Validação: 85 testes de Produção por Cor, janela do modelo e sintaxe do frontend; 7 testes da fila do Pedido; 16 verificações da bandeja capa/miolo. Todos aprovados. A comparação de dados reais e a impressão física não foram executadas.

Base: 42d68e40/v922. Publicação frontend no escopo já autorizado, com verificação dos arquivos públicos após propagação. Preservar a fila do painel, os totais por cor e a ordenação por unidades.
