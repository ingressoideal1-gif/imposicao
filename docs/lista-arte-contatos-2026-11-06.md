# Contato selecionado na Lista de Arte

Inclui coluna Contato / WhatsApp ao lado de Cliente / Evento, permite editar
nome e WhatsApp e adiciona um ícone verde de WhatsApp nas ações. Retira apenas
a coluna Prazo Entrega dessa lista; prazos nas demais telas permanecem intactos.

O contato vem de `propostas.id_contato`, não do cadastro geral/fiscal do cliente.
Pedidos sem contato válido pedem correção no ERP. Consultas são feitas em lotes
de até 200 pedidos visíveis, com cache em memória de 55 segundos. Falha de leitura
exibe recarga, sem fingir que o contato inexiste. O editor relê o cadastro ao abrir.

A API exige sessão e `perm_lista_arte_view`; salvar exige também
`perm_lista_arte_edit`. A RPC bloqueia pedido e contato na mesma transação,
confere a seleção e vínculo cliente/faturado e compara os valores anteriores.
Salva somente `contatos.nome_contato` e `contatos.whats`; não troca o contato do
pedido. A tela alerta que a edição vale para outros pedidos do mesmo contato.
Só mostra sucesso após receber a única linha persistida com os valores esperados.
O WhatsApp mantém a conferência da mensagem e destinatário antes do disparo.

## Ativação

Aplicar `sql/contatos_lista_arte.sql` antes da API `painel` e do frontend.
O script cria duas funções, sem alteração de dados de contatos. EXECUTE é
reservado a service_role, sem grants a anon/authenticated. A autorização de
usuário permanece no servidor. Não há alteração de RLS ou permissões existentes.

Nenhum contato real foi modificado para testar. Testes usam dados sintéticos:
API (permissões, lote, vínculo, validação, confirmação de gravação), PostgreSQL
em memória (transação, contato trocado, atualização concorrente e campos
preservados) e navegador (mobile, clique duplo, erro, XSS, ícone e coluna).

Metadados reais foram conferidos em leitura: id_int/id/cliente são inteiros,
id_contato/nome_contato/whats são texto. O harness antigo `lista_arte_harness.js`
falha na checagem de releitura de numeração e depois com `window is not defined`;
as duas falhas foram reproduzidas com script.js/index.html do HEAD anterior.
Não foram alterados testes ou regras de numeração para contornar essa falha.

Validação local: suíte completa de Edge Functions com 408 testes aprovados;
PostgreSQL em memória e navegador aprovados; sintaxe JavaScript e whitespace
aprovados. A bateria dos canais e a publicação têm registros separados em
`dist/entrega/`, fora do código versionado.

Recuperação: retornar frontend/API à versão anterior preservando as funções
SQL, que ficam sem uso. Não desfazer edições reais de contatos automaticamente.
Após publicação, validar com operador autorizado em um contato de teste:
editar/salvar, reabrir e confirmar persistência, abrir WhatsApp e conferir o
mesmo destinatário, sem disparar mensagem por conveniência.
