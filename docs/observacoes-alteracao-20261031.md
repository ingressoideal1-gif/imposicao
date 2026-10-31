# Destaque das anotações de alteração

Ajuste local em ponte_imposition/corel_notes.py: seção de alteração antes das observações do produto; título vermelho em negrito, anotação azul em negrito. Observações do produto permanecem pretas, regulares. Nome do modelo e posição externa do painel preservados. A quebra usa a largura real da fonte para evitar corte no negrito.

Validação: 23 testes em tests/test_corel_integration.py aprovados; prévia sintética inspecionada em dist/observacoes-20261031/previa.png. Teste cobre ordem, cores, fontes, múltiplas linhas e ausência de alteração. Nenhum documento real foi modificado.

Pendente de empacotamento/publicação de nova Ponte; instalador 1.8.0 publicado anteriormente não contém esta mudança. Não houve instalação em estação. Ao atualizar a Ponte e reabrir pelo Imposition, a rotina existente recompõe as referências externas; exportação da arte continua excluindo a camada de referência.
