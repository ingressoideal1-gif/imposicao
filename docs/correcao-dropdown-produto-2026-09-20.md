# Dropdown Produto — Produção por Cor

O usuário informou após v914 que o dropdown ainda não funcionava e esclareceu: deve listar todos os produtos com modelos em Aguardando.

A versão anterior restringia a consulta de modelos aos pedidos do cache global que passavam pelo filtro de produção. Assim, a existência de um modelo Aguardando não bastava para seu produto aparecer. O novo teste executado contra v914 reproduz essa exclusão.

A carga agora pagina os modelos visíveis à sessão independentemente da fila do pedido e aplica a normalização compartilhada do status. Consulta os produtos dos pedidos encontrados, deduplica por produto e mantém a seleção inicial vazia. Impresso e Corrigir Arte não geram opções. Pedidos ausentes do cache têm seus metadados consultados para a abertura na janela compartilhada, sem inventar registros. Os filtros específicos da fila, incluindo o status consolidado Ignorar, deixam de determinar esta lista, conforme o novo critério explícito do usuário; os outros painéis não foram alterados.

Arquivos funcionais: `frontend/producao-por-cor.js`. Regressões: `tests/producao_por_cor_fluxo_harness.js` e `tests/producao_por_cor_browser_harness.js`.

Validação local: 77 testes aprovados em `tests/test_producao_por_cor.py` e `tests/test_o_javascript_do_frontend_compila.py`. Incluem 23 cenários de fluxo, todos os scripts do frontend e navegador com produto fora da gráfica, seleção de cor/modelo e exclusão de produto somente impresso. Banco e pedidos usados nos testes são sintéticos; não houve acesso a dados reais. A reprodução contra o código anterior falha no novo caso do dropdown, enquanto a correção passa.

A publicação continua no escopo frontend já autorizado, pelo `entrega-segura.ps1`. A confirmação da entrega exige comparar os arquivos públicos com os locais após a propagação. A worktree operacional permanece preservada.
