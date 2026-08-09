---
name: lista-de-numeracoes
description: Leia ANTES de qualquer alteração na Lista de Numerações (o Catálogo de Numerações) — a view #view-catalogo em frontend/index.html, a função renderNumeracoes() em frontend/script.js, os filtros de busca/formato/tipo, o badge do menu, ou as ações de duplicar e excluir numeração. Cobre as quatro armadilhas da tela e os campos que a duplicação copia por lista explícita.
---

# Antes de mexer na Lista de Numerações

Leia **`docs/lista_de_numeracoes.md`** por inteiro antes de escrever código. A tela
parece uma tabela simples, e é por isso mesmo que ela engana: quatro comportamentos
deliberados fazem qualquer um concluir que "está bugada" quando está fazendo o que
foi programada para fazer.

1. **A lista esconde boa parte dos registros, e o contador não.** Numerações com
   `Cli_Num` (exclusivas de cliente) são omitidas da tabela, mas o badge do menu
   conta todas. Medido em 08/08/2026: 49 no total, 16 escondidas, 33 na tela.

2. **Digitar só números troca a semântica do filtro inteiro.** Uma busca que casa
   com `/^\d+$/` deixa de ser "buscar por nome" e vira "mostrar só as numerações
   deste cliente". Uma numeração chamada `90x140` nunca é achada por uma busca
   puramente numérica.

3. **Agrupar e filtrar usam campos diferentes.** O agrupamento usa `formato_id` (o
   formato base); o filtro de formato usa `formato_ids` (os compatíveis). Filtrar
   por X e ver o registro sob o cabeçalho de Y é o comportamento correto.

4. **Duplicar copia uma lista explícita de campos.** O que não estiver nessa lista
   não é copiado, em silêncio. Já custou caro: até a v487 faltavam `print_mode`,
   `ticket_qtd` e `ticket_logica`, então duplicar uma FxVerso produzia uma cópia
   Frente. Corrigido — mas ao acrescentar coluna nova em `producao_numeracoes`,
   decida conscientemente se ela entra em `duplicateCatalogNumeracao()`.

O documento traz ainda: por que `elements` nunca contém `METADATA` na leitura, o que
a coluna `preview_jpg` guarda desde a v487 e por que ninguém a lê, por que a ordem
dos grupos na tela não é alfabética, a diferença entre `is_custom` e `Cli_Num`, e os
cenários que valem exercitar ao verificar uma mudança.

`frontend/producao.html` tem uma cópia antiga desta view e **não** é a página viva —
`app.py:103` redireciona para `/app/index.html`. Não a edite achando que está
corrigindo a tela.

Para subir o app e conferir a mudança no navegador, use a skill `rodar-app`.
