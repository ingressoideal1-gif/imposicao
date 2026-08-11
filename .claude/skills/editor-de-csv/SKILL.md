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
