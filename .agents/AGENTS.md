
## 6. Validação de Combinação de Modelos (Multi-Artes)
- É estritamente proibido combinar modelos (checkbox na tabela de OS) que possuam a propriedade "bloco" com valores diferentes. A quantidade de folhas por bloco deve ser idêntica entre todos os modelos selecionados para garantir a integridade do empilhamento vertical ("strict_assembly").

## 7. Regras de Imposição e Numeração do Tipo TICKET
- **Quantidade Física (Poses/Células)**: Para numeração do tipo `TICKET` ( canhotos e ingressos na mesma pose), a quantidade nominal solicitada do lote (`QTD` ou `total_items`) representa a quantidade física de células de impressão. **Nunca divida** essa quantidade por `ticket_qtd` ($N$) no motor de imposição ou no frontend.
- **Lógica de Numeração do Canhoto**: Cada uma das $N$ vias do ticket impresso na pose física de índice $i$ (de $0$ a $\text{QTD}-1$) recebe a numeração subsequente:
  $$\text{current\_val} = \text{início} + (i \times N) + (pos - 1)$$
  onde $pos \in [1..N]$ representa a via correspondente do canhoto/corpo configurada na propriedade `ticket_pos` do elemento VDP.
