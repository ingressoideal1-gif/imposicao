---
name: editor-de-csv
description: Leia ANTES de mexer no editor de CSV da numeração — frontend/csv-editor.js, o modal "Ver / Editar", a box "Banco de Dados (CSV)", o parse de CSV em qualquer lugar do frontend, a chave __ativo, ou o filtro de linhas do ImpositionConfig no engine.py. Cobre as quatro coisas que enganam nessa tela e o motivo de o agente ter de ser publicado junto.
---

# Antes de mexer no editor de CSV

Leia **`docs/editor_de_csv.md`** por inteiro antes de escrever código. A tela
parece uma planilha comum, e o estrago que ela pode causar não é visual: é ticket
impresso com o dado errado.

As quatro coisas que enganam:

1. **Desmarcar não apaga.** A linha ganha `__ativo: false` dentro dela mesma,
   some da impressão e continua guardada. A **ausência** da chave significa
   ativa — é isso que faz todo CSV salvo antes da v524 continuar valendo sem
   migração. Não inverta essa polaridade.

2. **Ordenar pelo cabeçalho é só visual.** A ordem das linhas *é* a ordem de
   impressão. Ver a coluna `#` fora de sequência depois de ordenar é o
   comportamento correto. Reordenar de verdade só pelo botão "⇅ Aplicar ordem à
   impressão", que pede confirmação.

3. **Renomear coluna tem que arrastar os elementos junto.** Um elemento
   `source: "database"` aponta para a coluna pelo nome, em `csv_column`. O modal
   acumula as renomeações e devolve em `onAplicar`; quem atualiza os elementos é
   a ponte no `script.js`.

4. **O input de edição para a propagação de `keydown` e `paste` de propósito.**
   Sem isso o Enter que confirma a edição borbulha até a grade, que o trata como
   "começar a editar", e `ed.editando` fica preso em `true` engolindo todos os
   atalhos — e o colar é aplicado duas vezes. Já aconteceu.

O modal tem **dois modos**, e confundi-los é o erro fácil. No modo edição a caixa
de marcar diz "imprime / não imprime". No modo distribuição — aberto do pedido,
quando dois ou mais modelos dividem a mesma numeração com CSV — ela é a seleção do
momento, e quem diz o que cada modelo imprime é a coluna Modelo. Nesse modo não
existe editar célula, colar nem importar: trocar o banco daria identidade nova às
linhas e nenhum modelo as reconheceria.

A identidade é o `__id`, garantido em `recalcular()`. **Duplicar linha precisa
apagar o `__id` da cópia**, senão nascem duas linhas com a mesma identidade e a
fatia de um modelo passa a arrastar a linha do outro. A atribuição é exclusiva de
propósito: é ela que impede o mesmo assento sair em dois modelos.

Em `csv_selecao`, **ausente** e **lista vazia** não são a mesma coisa: ausente é
"nunca distribuído" e leva o banco inteiro; lista vazia é "este modelo não ficou
com nenhuma linha" e leva zero. Zero linhas não pode chegar ao motor — ele
ignoraria o banco e cairia na numeração sequencial, imprimindo número no lugar do
nome. `recadoDeFatiaVazia()` trava antes.

**São duas telas de imposição, e as duas precisam de toda regra nova.**
`frontend/pedido.js` é um clone do `script.js` com os ids `imp-*` renomeados para
`ped-*`: `updateImpSummary`/`updatePedSummary`, `runImposition`/`runPedImposition`.
A fatia por modelo nasceu só no `script.js` e o clone ficou dois meses imprimindo
o banco inteiro (pedido 20495). Ao mexer numa regra de impressão, procure a gêmea.

A fatia mora em `pedidos_modelos.csv_selecao` — **não** em `producao_os_itens`,
que os arquivos de `sql/` descrevem mas o app abandonou. Nessa tabela a numeração
é `amostra_num_id`, e `item.modelo` guarda o **id**, não o nome (o nome está em
`nome_modelo`).

Dois cuidados do caminho "começar do zero" (o botão ➕ Criar vazio): o modal abre
com zero colunas e o painel do estado vazio é a única interface — se você mexer
no `renderVazio()`, ele não pode virar um retângulo escuro sem saída. E aplicar
um banco sem nenhuma linha **limpa** o CSV da numeração em vez de gravar um array
vazio, que a deixaria marcada como "tem CSV" para imprimir zero itens.

**Numa folha que soma modelos, o banco NÃO é um só.** Cada arte leva o `csv_data`
dela e cada item carrega a própria linha (`csv_row` no `multi_map`); quem resolve
é `_linha_do_banco()` no `engine.py`. Arte com banco próprio nunca cai no banco do
trabalho — devolver a linha do vizinho imprimiria o nome de outra pessoa. Ver
`docs/modelos_somados.md`.

**O filtro das linhas desmarcadas mora no `engine.py`**, no construtor de
`ImpositionConfig`. O `engine.py` é embutido no `NewProd.exe`: qualquer mudança
ali exige publicar o agente junto com o site, senão a estação mostra a tela nova
e imprime com o motor velho.

`frontend/producao.html` tem uma cópia antiga da interface e **não** é a página
viva — `app.py:103` redireciona para `/app/index.html`. Ela não recebeu o editor
de CSV; não a edite achando que está corrigindo a tela.

Para subir o app e conferir no navegador, use a skill `rodar-app`. Atenção:
`window.state` **não** é o `state` do `script.js` (ele é `const` e não vira
propriedade do `window`) — dentro do `page.evaluate`, use o `state` nu.
