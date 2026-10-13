# Montagem: preparacao de pedidos e bancos por pedido — 1.2.399

Relatos: Junior, pedido 23240 com bancos nao confirmados; montagem salva com
pedido 23478/modelo 1002625 nao encontrado; TEX, banco mudou ou esta incompleto.
Leitura somente local confirmou 23240 e 23478 em snapshots preparados, sem
bancos vinculados; modelo 1002625 existe. Nao houve escrita no ERP/banco.

Montagem prepara cada pedido no protocolo local antes de materializar artes.
Se a lista perdeu o pedido, solicita nova lista local e recusa caso continue
ausente. Carga incompleta nao vira modelo excluido. Reusa snapshot validado,
carrega modelos/numeracoes, confere revisoes e conserva referencias dos demais
pedidos do mesmo trabalho. Abertura normal continua limpando as liberacoes.

Bancos locais podem ser lidos sem cliente Supabase. Cada pedido tem uma copia
independente de bancos e vinculos usada para montar o payload. Integridade
compara a consulta com essa copia, em vez do banco global do ultimo pedido.
A selecao explicita da Montagem acompanha conferencia e leitura de recursos.
Divergencias reais, revisoes alteradas e bancos ausentes continuam bloqueados.

Testes novos: dois pedidos locais, banco vazio e preenchido, sem acesso remoto,
selecao global de outro pedido, preservacao de referencias, pedido ausente,
modelo alterado e limpeza ao abrir pedido normalmente. Integridade testa
banco de outra tela, banco realmente alterado e copia de banco ausente.
3569 verificacoes do nucleo e 40 verificacoes de bancos passaram; integridade
passou com 74 casos no teste e 61 no padrao. Nenhuma impressao fisica realizada.

Artefatos 1.2.399 preservam capas e deteccao de porta 9001. Nao encerrar agente
com trabalho em curso. Publicacao nao comprova instalacao ou PDF real.
