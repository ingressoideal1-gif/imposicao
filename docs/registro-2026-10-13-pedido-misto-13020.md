# Pedido misto: conferência local de impressão

O snapshot local do pedido 13020 contém 15 modelos: 14 com pacotes preparados
e um produto de estoque sem arte de impressão. A origem 2648 liga o modelo
1001088 ao produto 2004, com is_estoque=true. A tela exclui produtos de
prateleira dos modelos para imprimir, mas comparava essa lista com sem_arte
do pedido inteiro. Isso produzia "Resposta local incompleta".

A .395 de teste exclui da contagem sem_arte somente IDs comprovados como
estoque pelo snapshot e reconhecidos como prateleira na tela. Não remove a
validação de pacotes, revisão, digest, itens desconhecidos ou duplicados.
Não altera dados do pedido, situação de impressão ou configurações comerciais.

Teste sintético reproduz pedido com impresso e estoque, aceita o conjunto
correto e recusa a mesma exclusão quando o snapshot não comprova estoque.
O produto de estoque não recebe autorização para impressão. O harness existente
continua exercitando resposta incompleta, consulta de reprovados e mudanças
de seleção/revisão. A correção funciona sobre snapshots online e offline.

Entrega: MSI novo porque selecao-piloto.js é servido do conteúdo embutido pelo
agente. Alterar apenas a pasta externa painel não atualiza essa rota.
Preserva a sincronização de formatos/saídas da .394.
Disponibilidade, instalação e confirmação da prévia são verificações separadas.

As quatro falhas preexistentes da suíte ampla estão descritas no registro
registro-2026-10-13-catalogos-pedido.md; não foram alteradas para esta entrega.

Validação .395: 544 testes passaram e 2 foram ignorados em cada canal; as
mesmas quatro falhas preexistentes permanecem. Os 16 harnesses de navegador
passaram em cada canal. MSI com versão 1.2.395, módulo de versão e script
embutido conferidos, auditoria de pacote sem dados privados aprovada.
Tamanho: 196665344 bytes. SHA256:
342cb2272d89677867a2391bf692c4f7a97d7a3dfedde90a519e9e28f410405a.
