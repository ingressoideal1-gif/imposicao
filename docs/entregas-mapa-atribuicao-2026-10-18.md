# Entregas v1079 - mapa, atribuicao e retorno

- Novas rotas manuais e por atribuicao: sem retorno por padrao, no painel e PWA.
- Configuracao de retorno das rotas existentes preservada.
- Popup do mapa reutiliza o seletor ADM da tabela, com mensagem de erro no proprio
  popup, confirmacao de persistencia, recarga do mapa e bloqueio em producao/transito.
- Todas as entregas lista pedidos Motoboy pendentes, inclusive NOVO, AGUARDANDO e
  EM PRODUCAO. Concluidos e cancelados continuam fora do planejamento.
- Cinza antes da expedicao; azul pronto/sem entregador; cor propria quando atribuido.
- Novas consultas incluem empresa para aplicar o mesmo isolamento do seletor.

SQL aplicado: vibe_entregas_mapa_atribuicao.sql e vibe_entregas_mapa_todas.sql.
Sem alterar registros de pedidos nem retorno das rotas ja existentes.
Testes: PGlite (padrao novo, preservacao de retorno, bloqueio de producao, permissoes),
mapa com seletor real (sucesso, conflito, consulta, transito, cores e lista completa),
regressoes de atribuicao, gestao e PWA; sintaxe e diff.

Publicacao web depende dos checks do PR. Nao inclui instalador.
