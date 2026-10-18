# Correcao da fila operacional do mapa - 18/10/2026

A consulta anterior tratava NOVO, AGUARDANDO e EM TRANSITO sem comprovacao Vibe
como pendencia de entrega. Ausencia de data de entrega nao comprova pendencia.

A nova consulta exige Motoboy e status EM PRODUCAO/EXPEDICAO. EM TRANSITO permanece
somente quando houver registro Vibe e rota ativa iniciada pelo Vibe, preservando o
acompanhamento ate a confirmacao. Entregas concluidas/expedicoes ambiguas continuam
excluidas. Nao ha lista fixa de pedidos nem alteracao de status ou datas do ERP.

Aplicado sql/vibe_entregas_mapa_fila_operacional.sql em transacao; consulta posterior
retornou exatamente 23542, 23604, 23688, 23785, 23808, 23835. Execucao anonima negada.
Testes PGlite passaram: novo/aguardando/despacho legado fora; producao/expedicao e
deslocamento iniciado no Vibe dentro; conclusao, permissoes e demais fluxos preservados.

Apenas backend de consulta; frontend permanece v1079. Para atualizar, usar Atualizar mapa.
Recuperacao: definicao anterior em sql/vibe_entregas_mapa_todas.sql, preservada no Git.
