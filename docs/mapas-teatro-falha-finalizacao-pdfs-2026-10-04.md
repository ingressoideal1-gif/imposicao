# Correção da finalização dos PDFs de mapas de teatro

Em 04/10/2026, a conferência após o salvamento encontrou cinco PDFs no Storage, enviados às 18:32 no horário de São Paulo, e nenhuma exportação correspondente cadastrada. O cadastro estava salvo e os bytes tinham chegado; a API continuava anunciando `pendente` porque a finalização do manifesto falhava.

## Causa e correção

A função instalada `mapas_teatro_publicar_pdf_exportacao` declara uma variável PL/pgSQL `s` e também usa `t(s)` como alias de coluna na validação dos setores. A consulta usava `GROUP BY s` e `btrim(s)`, gerando o erro PostgreSQL **42702 — referência ambígua**. Isso ocorre antes do INSERT da exportação.

A [migração nova](../sql/mapas_teatro_pdf_finalizacao_alias_20261004.sql) qualifica somente essas referências como `t.s`. A migração original aplicada permanece intacta. A correção lê a definição instalada, exige um único trecho esperado e conserva o restante do corpo, os grants e a condição SECURITY INVOKER. Se houver outra definição inesperada, recusa a alteração. Repetir uma correção já aplicada não altera dados.

## Aplicação autorizada e verificação

Alvo: projeto `vwbtitjlpelrcnsytzqw`, uma função. A alteração é transacional, com limite de espera de lock de cinco segundos e de execução de trinta segundos. Estimativa: uma função modificada; zero mapas, modelos, PDFs ou exportações alterados por essa migração.

Ordem:

1. Registrar a definição instalada com `pg_get_functiondef` e conferir o trecho ambíguo.
2. Preservar a definição original em arquivo de recuperação fora do Git.
3. Aplicar `mapas_teatro_pdf_finalizacao_alias_20261004.sql` no projeto identificado.
4. Executar a [verificação somente de leitura](../sql/mapas_teatro_pdf_finalizacao_alias_verificar_20261004.sql): alias corrigido, invoker preservado, execução permitida ao backend e negada a `authenticated`.
5. Repetir a publicação autenticada dos dois mapas e conferir os manifests e os bytes dos PDFs completos. Essa operação de publicação é separada da migração.

O backup operacional fica em `rascunhos/teatro-pdfs-publicacao-20261004/recuperacao-finalizacao-anterior.sql`. Ele restaura somente a definição anterior, mantendo registros e ACL. A definição anterior contém a falha conhecida; recuperação é apenas para uma regressão inesperada, não para uso normal. Nenhum arquivo histórico deve ser apagado.

Em 04/10/2026, a correção foi aplicada nesse projeto e a leitura posterior confirmou os quatro controles: alias corrigido, SECURITY INVOKER preservado, execução pelo backend permitida e execução direta por `authenticated` negada. Nessa conferência, os dois mapas ainda tinham zero exportações cadastradas. Os cinco uploads permaneciam no Storage; concluir a publicação exige repetir a chamada pela sessão autenticada do operador, preservando a autoria real.

## Validação

[Regressão em PostgreSQL/PGlite local](../tests/mapas_teatro_pdf_finalizacao_pglite.cjs), com dados sintéticos e sem rede: reproduz exatamente o erro 42702 antes da correção e confere publicação e repetição após a correção. Também verifica snapshot divergente, conjunto incompleto, quantidade incorreta, autor sem permissão, metadados de upload divergentes, IDs de setores repetidos e conservação das permissões.

Usa uma instalação PGlite já existente por `PGLITE_MODULE`; não adiciona dependências ou lockfiles. O PostgreSQL local comprova a execução da função, separadamente das verificações do frontend e do download autenticado real.

O gerador continua `a3-v1-20261003`. Revisões JCS, configs, snapshots e vínculos dos modelos permanecem os mesmos.
