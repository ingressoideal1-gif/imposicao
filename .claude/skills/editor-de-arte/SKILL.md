---
name: editor-de-arte
description: Leia ANTES de qualquer alteração no Criador de Arte (editor 2D de arte dos modelos) — frontend/criador-arte.js, a view #view-criador-arte, a pilha de camadas do editor no style.css, ou o carregamento/salvamento de arte_url, arte_json e amostra_arte_base64. Cobre as três armadilhas do editor que já causaram bug em produção.
---

# Antes de mexer no Criador de Arte

Leia **`docs/editor_de_arte.md`** por inteiro antes de escrever código. É curto e existe porque o
editor tem três comportamentos que o código não revela sozinho, e cada um já causou bug em
produção:

1. **`drawAmostraFace()` (em `frontend/script.js`) é a especificação do editor.** Ela é o
   renderizador canônico do card do pedido e do link do cliente. Enquadramento e fusão multiply
   saem dela. Divergir faz o editor mostrar uma coisa e a impressão outra.

   O enquadramento são **duas** regras, e ambas vêm do `engine.py`, que é quem imprime: arte em
   **PDF** entra no **tamanho real** da página, centrada, e o que passar da peça fica de fora;
   arte em **imagem** entra em **"contain"**, cabendo inteira. Leia
   **`docs/como_a_arte_entra_na_peca.md`** antes de mexer em qualquer janela que mostre arte —
   são quatro (card, janela ampliada, link do cliente e editor), e elas têm de concordar.

   Duas consequências que esse documento detalha: **nada de moldura desenhada dentro do
   bitmap** (a janela ampliada copia o canvas do card, e o JPEG de aprovação é esse canvas),
   e **entre a cor e o formato manda o formato**, porque é ele que a impressão usa.

   A regra de fusão em vigor: **a numeração cobre a arte com fusão normal, e é o grupo
   arte+numeração que multiplica, uma vez só, sobre a cor do papel.** Ela vale nos cinco lugares
   que empilham as três camadas — o editor, o card do pedido, o link do cliente, a tela de
   Amostras e a prévia de imposição.

2. **A estrutura vetorial editável (`arte_json`) não existe no banco.** `saveAmostraToDB()` a
   remove do payload; ela vive só em memória e no `localStorage`.

3. **A fusão entre as camadas é CSS, não JavaScript.** As camadas são `<canvas>` irmãos, e
   `globalCompositeOperation` nunca alcança outro elemento — quem funde é `mix-blend-mode` no
   `.canvas-container`, e só ali, por causa de isolamento de *stacking context*.

O documento traz ainda o modelo de 3 camadas, a escala de 4 px/mm, a ordem de prioridade ao
carregar arte existente, o fluxo de salvamento, as fragilidades conhecidas e um checklist de
verificação antes de publicar.

Para subir o app e conferir a mudança no navegador, use a skill `rodar-app`.
