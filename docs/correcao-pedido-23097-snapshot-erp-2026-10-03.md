# Pedido 23097 — entrega do carregamento dos mapas do ERP

## Escopo e base

Entrega autorizada por “entrega segura”, preparada em checkout isolado sobre `cb138179` (web v1008, NewProd 1.2.350). O checkout operacional e a correção anterior em `tmp_pedido-mapa-teatro-20261003` foram preservados. A base avançou durante a preparação; foram incorporados apenas os complementos necessários, conservando `teatro_modelo`, a releitura pelo motor, as duas capacidades e o JCS já publicados. O contrato atual continua em [integração ERP v5](integracao-erp-mapas-teatro-v5.md).

## Comportamento

- Reabrir um pedido com arte em cache relê quantidade e os quatro campos de mapa em `pedidos_modelos`, incluindo remoção de vínculo. Preserva arte e numeração escolhida.
- O modelo identifica mapa, setor, quantidade e origem no snapshot salvo pelo ERP. Uma consulta somente leitura dos IDs envolvidos informa diferença de revisão; não substitui lugares históricos. Na geração permanece obrigatória a conferência do mapa/setor pelo painel e pelo motor.
- Snapshot inválido, vínculo parcial, lugares repetidos, quantidade divergente e seleção parcial bloqueiam PRONTO e geração. O erro nunca usa CSV de outro pedido. A associação manual e a edição do banco do catálogo não alteram modelos vinculados pelo ERP.
- O Link do Cliente resolve o mesmo snapshot para modelos autorizados, conserva o cache por modelo e permite navegar pelas etiquetas de teatro. A conferência de acesso e disponibilidade do pedido permanece.
- O payload conserva `numeracao.teatro_modelo`; JavaScript e Python regeneram exatamente as mesmas linhas. TEATRO continua vertical por modelo: `F=ceil(Q/P)` e índice `p*F+folha`. BLOCO e TICKET não foram alterados.

Snapshots antigos sem `setor.nomeConjunto` conservam o contrato v5: a coluna auxiliar `Conjunto` usa `Fila`; a arte mantém seu prefixo editado, como `Mesa:`. Não se infere nem grava um nome no snapshot histórico. Novos snapshots podem guardar `setor.nomeConjunto` para a identificação explícita.

## Evidência do pedido

Simulação offline da leitura sanitizada de 03/10/2026 às 19:12:57 de Brasília; nenhuma arte real foi enviada ao motor.

| Modelo | Setor | Lugares carregados | Folhas com 8 células | Bloqueio de banco |
|---|---|---:|---:|---|
| 1001964 | Mesas 01 a 46 | 82 | 11 | Ausente na simulação |
| 1001965 | Plateia | 515 | 65 | Ausente na simulação |

Os 597 índices aparecem uma vez. Mesas preserva 1/A até 46/C; Plateia preserva D/1 até R/43, incluindo lacunas e quantidades por conjunto. A revisão JCS confere com a gravada no ERP: `a27a03ee856345a5d0eb26e67a53edf73f6c4442bcb30bd235fcbe53b7068d45`.

## Validação

143 casos Python/JavaScript aprovados de forma consolidada: snapshot, PDF real, montagem vertical, isolamento de bancos, sintaxe de todo o frontend e harnesses de imposição. Na primeira rodada, 142 passaram; o navegador completou os dois HTMLs, mas seu texto de sucesso não continha o prefixo `OK:` exigido pelo runner. O prefixo foi corrigido e esse caso reexecutado. Os dois testes novos de PDF também validam o transporte completo pelo módulo Python `teatro_snapshot` antes de conferir todas as 82/515 etiquetas em 11/65 páginas. Popup manual e regressões de reabertura/remoção de vínculo em cache passaram. Nenhuma asserção foi removida.

Não há mudança de Edge Function, schema ou permissões nesta entrega. JCS e preservação de PDFs históricos já estão na base publicada; a função `mapas-teatro-pdfs` permanece na versão entregue anteriormente.

## Publicação

Publicação e pacote em preparação. A evidência final será registrada após comparar recursos públicos nos dois domínios, auditar o MSI e conferir download e manifesto públicos.

Não houve escrita nos dados do pedido, aprovação, migração, envio ao parceiro, geração de PDFs de mapas no Storage ou impressão física. Disponibilizar o instalador não comprova instalação na estação.

Recuperação: alteração seletiva sobre a base atual; frontend e painel do agente devem permanecer compatíveis. Para agente, publicar versão maior, pois o atualizador não faz downgrade automático. Não converter snapshots nem apagar releases históricos.
