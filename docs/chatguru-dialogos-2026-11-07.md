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

## Extensão Pedido_Atual — preparada localmente

A mesma chamada chat_update_custom_fields passa a gravar field__Pedido_Atual
com String(link.numero_pedido), além de field__Link_do_Cliente. No ChatGuru,
cadastrar o campo Pedido_Atual e usar {Pedido_Atual} no diálogo/template.
Exemplo: pedido 24880 produz o valor 24880, sem prefixo vibe_ ou token.
Os dois campos são enviados juntos antes de dialog_execute; uma recusa impede
a execução. Chaves de idempotência e histórico são preservados.
Esta extensão ainda depende da publicação da API e da configuração do campo
no ChatGuru. O teste real anterior validou somente Link_do_Cliente.

## Reenvio após 120 segundos — preparado localmente

Decisão humana: permitir novo envio manual depois de 120 segundos do aceite.
A API devolve reenvio_em e reenvio_confirmacao (atualizado_em do registro aceito).
A tela mostra contagem regressiva e libera Reenviar pelo WhatsApp; não dispara
sozinha. POST /reenviar recebe os_id, confirmacao e reenvio_confirmacao.
POST /enviar mantém idempotência, mesmo depois do prazo. Registros desconhecidos
ou preparando continuam bloqueados, independentemente do tempo decorrido.

Aplicar sql/chatguru_reenvio_120s.sql antes da API/frontend. Migração aditiva,
transacional: cria histórico e RPC service_role, sem modificar registros atuais.
A RPC trava a conversa e o registro, verifica prazo pelo relógio do banco e exige
o mesmo atualizado_em confirmado. Arquiva o registro completo anterior em
imposition_whatsapp_reenvios antes de reservar nova tentativa na chave existente.
Isso preserva mensagem legada, autor, conclusão, estado e datas anteriores.
Tentativas simultâneas e confirmações antigas não liberam múltiplos disparos.
Falha definitiva mantém a repetição explícita já existente; incerteza mantém trava.
Consulta de status legado e conclusão usam filtro de atualizado_em para não
sobrescrever uma tentativa reservada concorrentemente. Conclusão comercial
continua separada; a janela fecha somente depois da confirmação desse fluxo.

Verificação local: 18 testes Deno; PostgreSQL sintético (119/120s, legado,
histórico, permissões, confirmação antiga e resultado desconhecido); navegador
simulado (contagem, desbloqueio, clique duplo, fechamento e reabertura).
Sem SQL aplicado, deploy ou novo envio real nesta extensão.
Recuperação: voltar API/frontend juntos, mantendo histórico e reservas; não
apagar registros nem liberar resultado desconhecido. Retomada: publicar SQL,
API e frontend e conferir o contador em um envio expressamente autorizado.

Validação final: suíte Deno completa com 418 testes aprovados; dois canais com
911 testes aprovados, 2 ignorados e 2 subtestes por canal (um aviso preexistente).
Painel compatível preparado em dist/piloto-reenvio-120s/painel-3f294252b992,
sem compilação, instalação ou publicação. Relatórios: dist/entrega/reenvio-120s-*.
