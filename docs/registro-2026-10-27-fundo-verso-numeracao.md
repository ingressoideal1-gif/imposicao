# Arte de fundo do verso no editor — 27/10/2026

Entrega web em `frontend/index.html` e `frontend/script.js`. A adaptação de `db.py` permanece no checkout operacional e não integra esta publicação web.

- FxVerso e FxVersoUnico oferecem upload PDF/JPG/PNG separado para o verso.
- Carregar e remover uma face preserva a outra. Voltar para Frente oculta o controle do verso, conservando a seleção ao retornar para duas faces.
- A numeração exclusiva do cliente guarda os dois arquivos originais. A genérica mantém a regra de referência temporária.
- Reabertura restaura as referências e duplicação cria um arquivo de verso próprio para a cópia.
- Falha no upload impede concluir o salvamento; ausência das novas colunas é informada. Download malsucedido não apaga a referência salva.
- Fundo continua sendo referência do editor; os cálculos de numeração e o motor de impressão não foram alterados.

## Implantação pendente

Aplicar `sql/alter_producao_numeracoes_fundo_verso.sql` **antes** da publicação: a consulta do catálogo passa a selecionar `bg_verso_url` e `bg_verso_filename`. O SQL é aditivo, sem atualização de registros ou alteração de permissões. O usuário informou sucesso ao executar a migração preparada no checkout operacional. O agente não executou SQL remoto.

Validar em ambiente autorizado: abrir numeração de cliente, carregar frente e verso, salvar, reabrir, duplicar e remover cada face. Para reverter a publicação, o código anterior ignora as novas colunas; conservar os dados.

## Validação local

`node --check frontend/script.js`, harnesses `fundo_verso_numeracao`, `arte_de_fundo_da_numeracao` e `preview_da_numeracao`; `pytest tests/test_fundo_verso_numeracao.py`.

Testes usam DOM/Storage simulados , sem importar configurações ou conectar a dados reais. Não comprovam upload remoto nem navegação visual no navegador.

Alterações preexistentes no checkout foram preservadas.
