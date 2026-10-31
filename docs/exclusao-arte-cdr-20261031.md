# Exclusão da arte e CDR — correção local

Diagnóstico: CorelProduction.execute('clear') invalidava rascunhos e devolvia mensagem de limpeza na próxima abertura. Não limpava nem enviava o CDR ao Drive. A limpeza por diferença de URLs ao reabrir salvava somente localmente. A interface também descartava a ação clear quando ocupada.

Correção preparada: interface informa face explícita e enfileira ações enquanto ocupada. Ponte registra comando local, confirma ausência da arte no snapshot autenticado, identifica páginas do modelo/face, salva backup do CDR, limpa somente arte editável e marcadores de gabarito, salva compatível e envia o nativo ao Drive com recibo verificado. Mantém cor, numeração/picote, observações, mapa e demais páginas. PDF ímpar/par remove ambas as faces quando o PDF único de frente é excluído; verso único limpa somente a página de verso.

Falha antes de concluir limpeza mantém comando local. Falha de upload mantém cópia imutável/hash e informa envio pendente; abertura/preparação seguintes retomam sem limpar novamente. CDR ausente no disco pode ser recuperado do Drive antes da limpeza. Não cria CDR a partir de PDF para executar uma exclusão. Associação e quantidade de páginas são conferidas antes de excluir objetos. Não exclui arquivos inteiros nem backups históricos.

Fontes: ponte_imposition/corel_service.py, corel_adapter.py, tests/test_corel_cleanup.py neste checkout. Interface e harness em ../imposition-corel-exclusao-20261031, branch fix/corel-exclusao-20261031, origin/main 9b770b8e. Fontes sujas preexistentes preservadas.

Validação: 42 testes Python (cleanup, integração e gabaritos), dois harnesses JS, sintaxe e diff. Dados sintéticos/COM simulado; nenhum CDR real ou arquivo remoto alterado. Falha de envio foi simulada. Não houve publicação, empacotamento ou instalação nesta correção. Ajuste das cores/ordem das observações de 31/10 permanece preparado no mesmo fonte.

Limites: a interface precisa alcançar a Ponte para registrar a solicitação. Com a estação/ponte indisponível, não há execução de CorelDRAW na nuvem. Arquivos antigos de outros computadores e backups históricos não são apagados. Prova real pendente: documento frente/verso com outro modelo, excluir uma face pelo Imposition, conferir disco/Drive e reabrir de outra estação. Preservar backup antes do teste. Entrega deve incluir Ponte e interface juntas para transmitir a face explícita.
