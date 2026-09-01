---
name: lista-de-numeracoes
description: Leia ANTES de qualquer alteração na Lista de Numerações (o Catálogo de Numerações) — a view #view-catalogo em frontend/index.html, a função renderNumeracoes() em frontend/script.js, os filtros de busca/formato/tipo, o badge do menu, ou as ações de duplicar e excluir numeração. Cobre as seis armadilhas da tela, os três Modos de Impressão e os campos que a duplicação copia por lista explícita.
---

# Antes de mexer na Lista de Numerações

Leia **`docs/lista_de_numeracoes.md`** por inteiro antes de escrever código. A tela
parece uma tabela simples, e é por isso mesmo que ela engana: seis comportamentos
deliberados fazem qualquer um concluir que "está bugada" quando está fazendo o que
foi programada para fazer.

1. **A lista esconde boa parte dos registros, e o contador não.** Numerações com
   `Cli_Num` (exclusivas de cliente) são omitidas da tabela, mas o badge do menu
   conta todas. Medido em 08/08/2026: 49 no total, 16 escondidas, 33 na tela. A
   caixa **Mostrar exclusivas de cliente** (26/08/2026) revela as escondidas; sem
   ela marcada, nada mudou.

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

5. **O Modo de Impressão tem TRÊS valores desde 31/08/2026**, não dois:
   `front` (Frente), `duplex` (FxVerso) e `duplex_unico` (FxVersoUnico). Só o
   `duplex` clássico consome o arquivo da arte aos pares; o FxVersoUnico usa uma
   página por peça na frente e um arquivo separado, de uma página, no verso.
   Pergunte "tem verso?" com `temVerso()` e "como pagina?" com `versoUnico()` —
   um `=== 'duplex'` do primeiro tipo deixado para trás some com o verso sem
   quebrar nada na tela. E note que `modoDeImpressaoDoModelo` **já existia** e
   responde outra coisa (sequencial ou blocado): o do verso é
   `modoDeVersoDoModelo`.

6. **O nome decide a quem a numeração exclusiva pertence.** Nome ainda igual ao
   `os_item_id` = exclusiva daquele modelo; renomeada = do cliente inteiro,
   compartilhada entre os modelos dele (regra do usuário, 26/08/2026). Daí
   `numeracaoEhCompartilhadaDoCliente` e `comoEditarNumeracaoDoModelo`, que decidem
   se abrir a numeração de um modelo edita o registro ou cria outro — antes era
   sempre "cria outro", e era assim que renomear gerava uma numeração nova e deixava
   a antiga órfã.

7. **O padrão é sempre Frente** (regra do usuário, 01/09/2026). Todo elemento novo
   nasce com Face = "Apenas Frente", em qualquer tipo e em qualquer Modo de
   Impressão, e o formulário em branco volta para "Frente" no `cancelNumEdit()`.
   Antes o elemento nascia `both` no modo Frente — invisível até a numeração virar
   FxVerso, quando tudo aparecia no verso de uma vez — e seguia a última face
   clicada no FxVerso, lembrada até de uma numeração para a outra. Isso vale para o
   formulário **em branco**: abrir uma numeração gravada traz o `print_mode` dela, e
   a exclusiva de um modelo herda o modo da base.

O documento traz ainda: por que `elements` nunca contém `METADATA` na leitura, como
funciona a **coluna Preview** (a miniatura entre Nome e Tipo, que sai do
`preview_jpg` e amplia no clique) e as três decisões dela — a caixa tem a forma do
papel, as imagens são `loading="lazy"`, e a que não carrega vira uma marca 🖼️ —,
por que a ordem dos grupos na tela não é alfabética, a diferença entre `is_custom` e
`Cli_Num`, o **renomear** (o 🏷️ da linha, que grava só o `name` direto no Supabase
porque o PUT do `db.py` reconstruiria a linha inteira), o aviso de quantos modelos uma
numeração compartilhada afeta, e os cenários que valem exercitar ao verificar uma
mudança.

`frontend/producao.html` tem uma cópia antiga desta view e **não** é a página viva —
`app.py:103` redireciona para `/app/index.html`. Não a edite achando que está
corrigindo a tela.

Para subir o app e conferir a mudança no navegador, use a skill `rodar-app`.
