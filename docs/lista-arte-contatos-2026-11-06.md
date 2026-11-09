# Contato selecionado na Lista de Arte

## Alteração preparada em 09/11/2026 — seleção do Guru

Estado: implementação local, ainda sem aplicação SQL ou publicação. Substitui o editor descrito no registro histórico abaixo.

A coluna passa a apresentar um select com nome e telefone dos contatos vinculados ao código `propostas.id_cliente` na view privada `chatguru_contatos_3478`. Somente remetente `555195343478`, números válidos e contatos do cliente em questão. Nenhum fallback para outro remetente ou cliente de faturamento. Todos os contatos disponíveis são carregados, não apenas o principal. A leitura materializa as opções uma vez por lote de até 200 pedidos.

Sem escolha salva, mantém o telefone do contato ERP quando ele pertence ao mesmo cliente e coincide com uma opção; caso contrário, usa a opção de atividade mais recente (origem e identificador como desempate). A tela não altera nome, telefone, contatos ERP ou `propostas.id_contato`. A escolha manual fica em `imposition_arte_contatos_guru`, por pedido, com autor e histórico. Se a escolha deixar de pertencer ao cliente ou for removida, exige nova seleção, sem trocar silenciosamente o destinatário. Sem opções, mostra “Sem contato no Guru 3478”.

A API `contatos-arte/selecionar` aceita apenas pedido, identificador da opção e revisão da lista. Bloqueia edição livre, concorrência e escolha fora das opções. Exige as mesmas permissões de leitura/edição da Lista de Arte. `whatsapp_artes.ts` resolve o destinatário pela mesma RPC da coluna e verifica o remetente configurado. A confirmação anterior fica inválida após troca de contato; os diálogos e a proteção de 120 segundos permanecem. Nenhuma mensagem é enviada ao selecionar.

Ativação pendente: aplicar `sql/lista_arte_contatos_guru_selecao.sql` após as views do 3478, publicar API `painel` e frontend em conjunto. A versão antiga do editor não deve permanecer em uso após a API nova; atualizar a página. O SQL adiciona duas tabelas privadas e duas funções service_role, sem alterar dados comerciais existentes.

Validação: teste PostgreSQL em memória cobre opções, remetente, cliente, seleção automática, persistência isolada, concorrência, remoção e permissões. Teste de navegador real com rede simulada cobre carregamento, seleção, bloqueio de clique duplo, XSS, erro e restauração do valor persistido. Testes da API e do envio cobrem autorização, campos livres, confirmação, destinatário e reenvio. Sem testes ou envios em produção.

Recuperação: antes de reverter API/frontend, considerar que a versão antiga envia para o contato ERP, não para a escolha nova. Preservar tabelas e histórico de seleção. Teste de retomada após publicação: abrir pedido com duas opções do Guru, selecionar a segunda, atualizar a página e abrir o envio para conferir nome/número, sem enviar.

## Registro histórico de 06/11/2026

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
