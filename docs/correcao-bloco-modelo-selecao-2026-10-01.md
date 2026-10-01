# Preservar modelo e BLOCO ao selecionar no Pedido

Relato após a entrega v992: no pedido 22602, a fila mostra o modelo 1001642
com BLOCO preenchido. Ao selecionar, o identificador muda e a geração acusa
`Modelo vibe_item_2802: Bloco`.

## Diagnóstico reproduzido

`loadOrdensFromVibecode` e `carregarPedidoPesquisado` substituíam `state.osItens`
por produtos resumidos do ERP quando terminavam uma atualização. A proteção
existente considerava artes abertas e leituras pendentes, mas não o Pedido
aberto, o modelo ativo ou a seleção de impressão combinada.

O resumo de `mapVibecodeProdutoToOSItem` tem identidade `vibe_item_*` e não é
o modelo completo. Uma resposta tardia podia substituir a lista depois de
desenhar a fila. Em seguida, `carregarModeloParaPedido` não encontrava o ID
clicado e selecionava silenciosamente `itens[0]`, mudando a identidade e
perdendo o BLOCO usado pela validação.

Reprodução com dados sintéticos e funções reais, sobre a base v992:

- Atualização geral atrasada falhou em `lista preserva modelos em pedido`.
- Clique em ID ausente falhou em `clique em modelo ausente abriu outro modelo`.

Não houve consulta ou escrita de dados reais do pedido. Os valores reportados
pelo operador identificam o incidente; a reprodução não presume alteração do
BLOCO persistido no banco. A última entrega não alterou esse carregador em
`script.js`; a correção trata o caminho reproduzido que estava na base v992.

## Correção

- `frontend/script.js`: tanto a lista geral quanto a pesquisa pontual
  preservam modelos de `pedidoAberto`, `activeOSItem` e `selectedOSItems`.
  Pedidos fora de uso continuam recebendo o resumo atualizado.
- `frontend/pedido.js`: somente o ID clicado pode abrir. Se ele desaparecer,
  a preparação falha explicitamente e bloqueia PDF/impressão até reabrir.
- A validação de BLOCO permanece ativa. Não há preenchimento presumido,
  alteração de numeração, banco, motor PDF ou controles de Folha 1.

## Validação

- 72 verificações da lista seletiva, incluindo seis cenários de resposta
  tardia: lista/pesquisa com pedido aberto, modelo ativo e combinação.
- Navegador real: abertura, falha de download, troca assíncrona e clique em
  modelo ausente. O harness recebeu a dependência real `preencherFaixaDoModelo`,
  que faltava em sua montagem anterior.
- 35 verificações de recuperação/concorrência e 22 cenários de navegação.
- Atualização periódica e fluxo de Folha 1 em PDF/impressão aprovados.
- Sintaxe JavaScript e diff verificados pelo fluxo de entrega segura.

Publicação: simular e publicar somente estes arquivos e testes a partir da
worktree isolada `ideal-imposition-bloco-modelo`, baseada em `a143830d`.
Após propagação, comparar hashes em ambos os domínios e no painel servido em
`127.0.0.1:9000`. Reabrir a tela limpa o resumo incorreto já presente em memória.
Não há impressão física nem atualização de MSI nesta correção.

Recuperação: reverter o commit desta correção em uma nova entrega, com nova
versão de cache, sem desfazer a v992 ou alterações alheias. Checkout operacional
preservado.
