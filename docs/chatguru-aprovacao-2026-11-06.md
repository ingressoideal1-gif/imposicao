# Aprovação de arte pelo WhatsApp — implementação local

## Ativação autorizada em andamento

O usuário autorizou a ativação e indicou o pedido 24880 para o primeiro teste
real. O usuário cadastrará os quatro secrets de acesso diretamente no Supabase;
o DDI padrão 55 foi autorizado e configurado. Nenhuma chave foi solicitada
pela conversa.

SQL aplicado ao projeto `vwbtitjlpelrcnsytzqw` em 06/11/2026 após preflight
confirmar ausência da tabela/RPC. Releitura: zero registros, RLS ativo,
SELECT negado a anon/authenticated, EXECUTE negado a authenticated e permitido
a service_role. Validado antes em PGlite com reserva e repetição reais em
PostgreSQL em memória. Não houve alteração de pedidos/contatos nem envio.

Validação ampliada: 401 testes Deno passaram (`--no-config --no-lock` para
usar o runtime existente sem instalar dependências na worktree). O comando
sem essas opções falhou por resolução local de `@types/node`; nenhuma
dependência foi instalada ou alterada. A rotina `conferir_duas_versoes.py`
passou nos dois canais: 911 testes, 2 skips e 2 subtests em cada canal, além
dos harnesses completos. Relatório local: `dist/entrega/chatguru-canais.json`.
Aviso preexistente de Starlette/httpx preservado.

Entregas separadas: PR #259 (SQL e teste PostgreSQL) e PR #260 (API).
Publicação da tela e envio permanecem condicionados à configuração disponível.
As seções abaixo registram o contrato e a entrega local inicial.

Implementado em 06/11/2026 na branch `feat/chatguru-aprovacao-20261106`,
worktree `imposition-chatguru-20261106`, base `40a73b2c` de `origin/main`
atualizada por fetch. O checkout operacional foi preservado. Sem commit,
publicação, alteração remota, configuração de credenciais ou envio real.

## Comportamento

O botão do pedido, o ícone da lista e o atalho após copiar o link abrem uma
janela WhatsApp. Ela mostra o contato selecionado, o número normalizado e a
mensagem antes de o operador confirmar o envio. O contato é resolvido no
servidor por `propostas.id_contato -> contatos.id -> contatos.whats`.
Contato ausente, inválido ou sem vínculo com o cliente do pedido/faturamento
impede envio. Não há substituição pelo telefone geral nem pelo financeiro.

A mensagem usa o link ativo e a versão preparada da arte. O navegador não
fornece texto, destinatário, token de aprovação ou credenciais para o disparo.
Alteração de contato, telefone ou versão entre conferência e envio exige
reabrir a janela. A preparação das imagens e as regras do portal permanecem.
O fluxo separado de artes no corpo do e-mail continua disponível; a opção
de link fica desabilitada no seletor desse editor.

Os estados de mensagem são independentes da aprovação: novo, preparando,
resultado desconhecido, aguardando envio, enviado e falhou. `enviado` reflete
o status `sent` do ChatGuru, sem comprovar entrega ao aparelho ou leitura.
Somente uma resposta de aceite com `message_id` permite concluir o retorno
do pedido ao atendimento. A conclusão reaproveita as guardas existentes e
preserva `cliente_abriu_em`. Falha de conclusão permite tentar concluir sem
novo disparo; a conclusão confirmada fica registrada para reabertura da tela.

## Backend e persistência

Rotas POST autenticadas em `/api/whatsapp-artes/{preparar,enviar,reenviar,status,concluir}`
na função `painel`. Reutilizam a grade de acesso de pedidos, o gateway JWT e
o CORS existentes. Respostas possuem `Cache-Control: no-store`.

`sql/chatguru_aprovacao.sql` cria uma tabela exclusiva com RLS, sem acesso
para anon/authenticated, e uma RPC acessível apenas por service_role. Não
modifica tabelas comerciais. A reserva atômica impede chamadas concorrentes
para a mesma arte, contato, telefone e remetente. A chave é um SHA-256 desses
identificadores; o registro não guarda nome, telefone, texto ou token do portal.
Guarda pedido, operador, estado, message_id, datas, contador de tentativas e
conclusão. Não constitui trilha completa de todas as transições.

Depois de reservar, timeout, resposta inválida ou falha de persistência não
liberam novo disparo automático. Uma mensagem aceita cuja resposta foi perdida
pode permanecer sem message_id recuperável. Esse caso requer conferência
manual no CRM e reconciliação administrativa autorizada; nunca apagar a reserva
por conveniência. A consulta de status por si só não envia mensagens.

Uma rejeição explícita permite usar “Tentar novamente após correção”. A RPC
só reabre reservas com estado falhou e sem message_id, impedindo duplicação
entre cliques concorrentes. Uma nova versão de arte ou troca de destinatário/
remetente produz outra chave. Não fazer alterações de configuração para
contornar uma tentativa com resultado desconhecido.

O envio usa `message_send` para chats existentes. Não cria chats automaticamente:
regularizar o contato no ChatGuru se não existir e só repetir após rejeição
confirmada. Cadastro via `chat_add` e seu envio inicial ficam fora desta versão.
Restrições de WABA/templates da conta ainda precisam ser verificadas no teste real.

## Configuração e ativação pendentes

Secrets da função, sem valores em arquivos versionados ou navegador:

| Nome | Conteúdo |
|---|---|
| CHATGURU_ENDPOINT | Endpoint HTTPS da conta, `https://<servidor>.chatguru.app/api/v1` |
| CHATGURU_KEY | Chave da API |
| CHATGURU_ACCOUNT_ID | Identificador da conta |
| CHATGURU_PHONE_ID | Número remetente selecionado no CRM |
| CHATGURU_DEFAULT_DDI | `55` somente se confirmada a regra de telefones nacionais brasileiros; sem isso, contato deve conter DDI |

O endpoint é fixado no servidor, restrito ao domínio ChatGuru e não segue
redirecionamentos. Todas as chamadas possuem timeout e usam formulário URL encoded.
Nenhuma credencial ou resposta bruta do CRM é exposta em erro/log.

Ordem de ativação: revisar/aplicar SQL no projeto correto, verificar RLS e
permissões, configurar secrets, publicar a função e depois o frontend pelo
fluxo protegido. A aplicação SQL e teste PostgreSQL real ainda não foram
executados. Não publicar frontend sozinho: depende da rota e da tabela.
O código da janela foi incorporado ao script.js existente, sem novo asset que
exija alteração da lista de sincronismo das estações. Build/instalação e bateria
completa de release dos dois canais não foram executados nesta entrega local.

## Validação local

- 27 testes Deno passaram: contato, sessão/permissões, rota/CORS, idempotência,
  concorrência simulada, timeout, persistência vazia, reenvio após rejeição,
  mudança de destino, DDI e regressões do e-mail. Sem permissão de rede.
- 47 testes pytest passaram: frontend de e-mail/WhatsApp, sincronismo do painel,
  compatibilidade, canais e segurança de estação. Um aviso preexistente de
  depreciação Starlette/httpx; nenhuma dependência alterada.
- Harness de navegador real em largura 390px: conferência antes de enviar,
  clique duplo, retorno pendente sem reenvio, consulta, reabertura e falha de preparo.
- 22 casos de geração/cópia do link passaram. Harness de retorno ao atendimento
  passou, incluindo preservação da abertura do cliente para WhatsApp.
- Deno check do handler, node --check e git diff --check passaram.

Teste de retomada após ativação autorizada: pedido e contato de teste com chat
cadastrado, conferir nome/número/texto, enviar uma vez, consultar status e abrir
o link recebido. Reabrir a tela deve recuperar a tentativa sem segundo disparo.
Isso deve ser acompanhado no CRM e no WhatsApp antes de habilitar uso geral.

Recuperação: retornar frontend e função à versão anterior em entrega autorizada,
preservando a tabela para auditoria/reconciliação. Não excluir registros de envio.

Documentação consultada: https://wiki.chatguru.com.br/documentacao-api/parametros-obrigatorios
