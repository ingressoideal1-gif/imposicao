# Aprovação por diálogo no Imposition — 07/11/2026

Substitui novos envios de texto comum pelo diálogo validado pelo usuário no
pedido 24880. Destinatário continua sendo o contato selecionado no pedido.
A API salva field__Link_do_Cliente (variável {Link_do_Cliente}) e, somente após
confirmação, executa o diálogo 6aef191d04236cee4e7075c1. O texto/template é
administrado no ChatGuru; o Imposition mostra o link que será preenchido.

O usuário confirmou o recebimento correto do teste piloto. Esta publicação
não dispara novamente o pedido de teste nem outros pedidos automaticamente.
A janela continua fechando após a confirmação da execução e da conclusão do
retorno ao atendimento. Falha de conclusão permite concluir sem reenviar.

## Persistência e concorrência

Aplicar sql/chatguru_dialogos.sql antes da API painel: adiciona dialogo_id e
indicador dialogo_executado à tabela de histórico e uma tabela de reservas por
conversa. SQL transacional, sem exclusão de registros ou alteração comercial.
RPCs SECURITY INVOKER e EXECUTE exclusivo a service_role; RLS da tabela ativo.
A chave da conversa é um hash do endpoint/conta/remetente/destinatário, sem
armazenar telefone na nova tabela. A reserva e a finalização são atômicas.

A chave de idempotência anterior é preservada: mensagens já aceitas continuam
aceitas e não são disparadas novamente por causa da troca de modalidade.
Novos diálogos não inventam message_id; persistem dialogo_executado após
confirmação HTTP 2xx, result=success, code=200. O aceite autoriza concluir o
fluxo, mas não afirma entrega, leitura ou aprovação da arte. Consultar status
para diálogos lê o registro local; mensagens antigas ainda usam message_status.

Duas operações deste fluxo não atualizam o campo da mesma conversa ao mesmo
tempo. A reserva é liberada na mesma transação que registra execução confirmada
ou recusa explícita; timeout/resultado desconhecido conserva a trava, sem
expiração automática. Se a execução parar depois da reserva, o administrador
precisa reconciliar com a conversa no CRM. Não remover reservas para tentar de
novo. Repetição explícita só é permitida após recusa confirmada.

A trava cobre o Imposition, não processos externos. O parceiro Vibe deve usar a
mesma coordenação. O contrato documentado informa diálogo executado; a API não
informa quando uma ação deliberadamente atrasada do chatbot consome variáveis.
Manter a ação Template imediata nesse diálogo, sem espera antes de usar o link.

## Verificações e entrega

416 testes Deno aprovados. Teste PostgreSQL sintético cobre permissões, legado,
reserva de conversa, recusa, repetição explícita e bloqueio por incerteza.
Harness de navegador cobre mensagem legada e diálogo, fechamento, conclusão
pendente, erro, clique duplo e mobile. Sintaxe/diff aprovados.

API anterior: painel v278 ACTIVE, JWT habilitado. Comparação dos 24 módulos TS
publicados com o cache compilado local: 21 iguais após normalizar whitespace e
remover metadados do cache; dois diferem somente na emissão dos construtores
(comma expression versus statements); o módulo WhatsApp é o alterado na tarefa.
O download CLI recusou um caminho externo; o ESZIP foi inspecionado sem extrair
fora de dist/entrega. Snapshot anterior preservado para recuperação.

SQL aplicado: 36 registros anteriores preservados por comparação de contagem
e resumo de todos os campos originais. RLS ativo; RPCs negadas a anon/authenticated.
API painel publicada na versão 279, ACTIVE, verify_jwt=true; chamada anônima
recusada com HTTP 401. Nenhum envio real adicional nesta publicação.

Ativação e hashes públicos ficam registrados em dist/entrega. Recuperação exige
API que continue reconhecendo dialogo_executado, mesmo se retornar ao envio de
texto para novos pedidos. Uma versão antiga que só reconhece message_id deixaria
conclusões de diálogos pendentes. Preservar colunas, reservas e histórico; não
reverter cadastros nem liberar tentativas desconhecidas.

Fontes: docs/chatguru-dialogo-piloto-2026-11-07.md;
https://wiki.chatguru.com.br/documentacao-api/parametros-obrigatorios.
