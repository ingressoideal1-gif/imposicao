# Regras de Imposição e Numeração: Tipo TICKET

Este documento especifica a regra de negócio e a lógica matemática para imposição física e numeração de ingressos do tipo **TICKET** no sistema `ideal-imposition`.

---

## 1. Conceito de TICKET

Um ingresso do tipo `TICKET` é caracterizado por possuir múltiplas vias ou canhoto personalizado na mesma pose física impressa.
O número de vias de numeração por pose física é definido pelo parâmetro `ticket_qtd` ($N$).

*   **Exemplo ($N=2$)**: Um ingresso que contém o **Corpo** (Ticket 1) e o **Canhoto** (Ticket 2) impressos lado a lado na mesma célula física de papel.
*   **Exemplo ($N=3$)**: Um ingresso com **Corpo** (Ticket 1), **Canhoto 1** (Ticket 2) e **Canhoto 2** (Ticket 3) na mesma célula física.

---

## 2. Regra de Quantidade Física e Lógica

Diferente de outros fluxos, a quantidade física do lote e a quantidade de ingressos numerados seguem regras distintas:

1.  **Quantidade Física (Poses/Células)**: A quantidade informada pelo usuário (`QTD`) representa a **quantidade física nominal de poses (células) que serão impressas**.
    *   *Regra de Ouro*: **Nunca** se divide a quantidade física (`QTD`) por `ticket_qtd` ($N$) no motor de imposição ou nas interfaces do frontend.
    *   *Exemplo*: Se o cliente solicita um lote de `QTD = 100` com $N=2$ (canhoto + corpo), o sistema deve planejar, renderizar e imprimir **100 células físicas**.
2.  **Quantidade Lógica (Ingressos Numerados)**: O número total de ingressos numerados gerados será igual a:
    $$\text{Total Lógico} = \text{QTD} \times N$$
    *   *Exemplo*: `100` células físicas com $N=2$ geram uma numeração lógica de **1 a 200**.

---

## 3. Lógica Matemática de Numeração

Para cada pose física no lote de impressão de índice $i$ ($i \in [0 .. \text{QTD}-1]$), os elementos de dados variáveis do tipo `TICKET` com base em sua posição de ticket ($pos \in [1..N]$) recebem o valor numérico calculado pela seguinte fórmula:

$$\text{current\_val} = \text{início} + (i \times N) + (pos - 1)$$

Onde:
*   $\text{início}$: Número inicial da sequência (ex: `1`).
*   $i$: Índice físico único do item no lote ordenado (de $0$ a $\text{QTD}-1$).
*   $N$: Quantidade de tickets/vias por pose (`ticket_qtd`).
*   $pos$: A posição correspondente do elemento de texto de numeração na arte (identificado pela propriedade `ticket_pos` do elemento de numeração VDP).

### Exemplo de Preenchimento para $N=2$, $\text{início}=1$, $\text{QTD}=3$ (Corte e Empilhamento Simples):

*   **Pose Física $i = 0$**:
    *   Ticket $pos = 1$: $1 + (0 \times 2) + (1 - 1) = \mathbf{1}$
    *   Ticket $pos = 2$: $1 + (0 \times 2) + (2 - 1) = \mathbf{2}$
*   **Pose Física $i = 1$**:
    *   Ticket $pos = 1$: $1 + (1 \times 2) + (1 - 1) = \mathbf{3}$
    *   Ticket $pos = 2$: $1 + (1 \times 2) + (2 - 1) = \mathbf{4}$
*   **Pose Física $i = 2$**:
    *   Ticket $pos = 1$: $1 + (2 \times 2) + (1 - 1) = \mathbf{5}$
    *   Ticket $pos = 2$: $1 + (2 \times 2) + (2 - 1) = \mathbf{6}$

---

## 4. Integração com Esquema de Corte e Empilhamento (`cut_stack`)

Quando combinados com o esquema de imposição `cut_stack` (principalmente no modo `strict_assembly`), os blocos físicos são fatiados com base nas folhas físicas do papel de saída.

### Distribuição e Profundidade (Block Depth):
*   Cada bloco físico contém exatamente a quantidade `sheets_per_block` de folhas.
*   A distribuição de indexação física $i$ segue a lógica clássica do `cut_stack` em profundidade vertical.
*   Ao fatiar a grade em blocos, o motor utiliza o índice físico $i$ correto de cada item dentro da pilha.
*   Como a numeração avança em saltos múltiplos de $N$, o corte vertical na guilhotina resulta em pilhas de ingressos subsequentes e ordenadas perfeitamente para grampeamento imediato.

---

## 5. Implementação no Código

### Backend ([engine.py](file:///c:/Users/Junior/Projetos%20Ingresso%20ideal/ideal-imposition/engine.py))

*   **Resolução de Contexto**: A numeração de ticket usa propriedades dinâmicas extraídas por item (`item_num_tipo`, `item_ticket_qtd`, `item_start_base` e `item_local_idx`) nos loops de desenho de frente e verso.
*   **Mapeamento de Renderização**:
    ```python
    if item_num_tipo == "TICKET":
        ticket_pos = el.get("ticket_pos")
        pos_val = int(ticket_pos) if ticket_pos else 1
        current_val = item_start_base + (item_local_idx * item_ticket_qtd) + (pos_val - 1)
    ```

### Frontend ([script.js](file:///c:/Users/Junior/Projetos%20Ingresso%20ideal/ideal-imposition/frontend/script.js) e [pedido.js](file:///c:/Users/Junior/Projetos%20Ingresso%20ideal/ideal-imposition/frontend/pedido.js))

*   As interfaces gráficas calculam a quantidade física total e de imposição de forma linear, garantindo que `QTD` represente as poses de papel físicas na tela e na requisição de geração do PDF:
    ```javascript
    const total_items = raw_items; // Sem divisões por ticket_qtd
    ```
