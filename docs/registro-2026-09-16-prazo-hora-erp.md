# Prazo previsto: data e hora do ERP

Correção local na branch `fix/prazo-hora-20260916`, baseada em `39ffc2fe`.
Worktree: `C:\ProjetosLocais\ideal-imposition-prazo-hora`.
O checkout operacional, com alterações preexistentes, foi preservado.

Contrato informado pelo responsável: `propostas_os.data_termino` contém a data;
`propostas_os_setores.hora` contém a hora espelhada entre os setores por `id_int`.
Usar a primeira hora não nula. A categoria de frete atual não deve recalcular
essa hora, que fica congelada na criação e pode ser ajustada pelo administrador.

`frontend/script.js` passa a ler somente `id_int, hora` dos setores, em lotes de
100 pedidos, usando o cliente Supabase existente. Combina esses valores com a
data e reutiliza o badge de prazo. Hora ausente: só data. Data ausente: `--`.
Falha ao buscar horas preserva as datas e registra aviso. Meia-noite explicitamente
gravada em `hora` continua sendo um horário válido. Filtros e cores continuam por dia.

A Lista de Arte recebe uma coluna Prazo Entrega em `frontend/index.html` e
`frontend/producao.html`, usando a mesma função da Produção e do Acabamento.

Validação: harnesses Node de prazo, composição/leitura ERP, ordenação, Lista de
Arte e alinhamento das colunas; sintaxe de script.js e revisão de whitespace.
Dados sintéticos cobrem hora nula, setores repetidos, data nula, falha da consulta,
meia-noite explícita e múltiplos lotes.

A leitura real autorizada do pedido 22192 retornou data_termino
`2026-09-16T00:00:00`. A consulta de setores usando acesso público retornou `[]`;
isso não prova inexistência de setores nem confirma a hora no contexto autenticado.
O usuário informou `16:00`. Pendente conferir esse pedido com a sessão do painel.
Nenhuma política, dado compartilhado ou backend foi alterado. Sem publicação.

Recuperação: a alteração está isolada no worktree acima, ainda sem commit; não
exige restaurar o checkout operacional. Para revisão, usar `git diff` nesse worktree.
