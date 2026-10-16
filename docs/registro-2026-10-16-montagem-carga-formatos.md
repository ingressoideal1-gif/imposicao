# Montagem: carregar os dados antes de listar formatos

Na abertura direta ou após uma lista limitada à Arte, `abrirMontagem` apenas
lia o estado existente, sem chamar `loadOrdens`. Assim, o seletor podia ficar
vazio mesmo havendo modelos Aguardando em pedidos Em produção.

A abertura agora aguarda o carregamento existente de pedidos e modelos com
recorte de produção, e carrega o catálogo se ainda estiver vazio. Durante a
leitura, o seletor informa “Carregando formatos”. Falhas ficam visíveis e uma
nova abertura permite repetir a leitura. Aberturas antigas não atualizam o
seletor de uma abertura mais recente. O filtro Aguardando foi preservado.

Regressão reproduzida antes da correção: zero cargas de pedidos na abertura,
formatos vazios. Depois: carga aguardada, formato disponível, falha visível e
recuperação testadas com dados sintéticos. Nenhuma escrita real de pedido.
