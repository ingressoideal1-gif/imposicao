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
Nenhuma política, dado compartilhado ou backend foi alterado.

## Publicação executada

Autorizada pelo usuário com “executar”. Publicada como **v888**, commit
`392b8a36`, integrado por fast-forward em `origin/main` pelo `entrega-segura.ps1`.
A tag `v888` aponta para essa entrega. Cloudflare Pages concluiu com sucesso.

A primeira conferência encontrou arquivos antigos durante a propagação. Sem
repetir o deploy, a consulta posterior confirmou os três arquivos nos dois
domínios (`imposition.ai-ideal.com.br` e `imposicao.pages.dev`): **6/6 iguais**.
SHA-256 com normalização de BOM e quebras de linha:

- `index.html`: `a8611a5b48fdc2fd0059623dcbbfd0e0df1bc5ebf3bf9eae95a097516d0487e4`
- `producao.html`: `7b523a7df52c9e3767deeb9b61183d01c0637c9fe704adea452eeeb5695e80df`
- `script.js`: `0826ba5e8f76e13e0882cde2906f593bd6ab7b5de901222164402c076edc796a`

Os cinco harnesses passaram, incluindo 249 verificações existentes e a regressão
da leitura/composição ERP. Sintaxe e revisão de whitespace também passaram.
Permanece pendente a conferência do pedido 22192 na sessão autenticada do painel.
Não houve instalação ou distribuição do NewProd.

Recuperação: se necessária e autorizada, reverter o commit `392b8a36` em nova
branch, validar e publicar com nova versão de cache. Não restaurar nem descartar
alterações do checkout operacional. Para revisão: `git show 392b8a36`.
