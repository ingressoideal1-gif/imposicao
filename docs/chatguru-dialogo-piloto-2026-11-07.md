# Piloto de diálogo ChatGuru — 07/11/2026

Autorizado pelo usuário: publicar adaptação e testar uma vez no pedido 24880.
Função separada `whatsapp-dialogo-piloto`, JWT habilitado e autenticação técnica
com segredo exclusivo `CHATGURU_DIALOGO_PILOTO_TOKEN` em `x-piloto-token` além
do JWT validado pelo gateway. Uma sessão de operador sozinha não autoriza envio.
Não distribuir o segredo ao navegador. O segredo é gerado criptograficamente
durante a ativação e mantido somente na memória do executor e nos secrets da função.

Escopo fixo: pedido 24880, diálogo `6aef191d04236cee4e7075c1`, campo
`{Link_do_Cliente}`. O formulário da API usa `field__Link_do_Cliente` (dois
sublinhados). Atualiza o campo pelo link ativo preparado e só executa
`dialog_execute` após HTTP de sucesso, result=success e code=200 no salvamento.
Contato selecionado e vínculo cliente/faturado são relidos do banco.

POST JSON com pedido=24880 e acao=preparar/enviar/status. Preparar retorna uma
confirmação SHA-256 do estado atual; enviar exige a mesma confirmação. Nenhum
telefone completo, token do portal ou credencial é devolvido. A reserva técnica
fixa deste teste usa a tabela existente imposition_whatsapp_artes e a RPC de
reserva atômica, sem migração. Autor técnico reservado:
00000000-0000-4000-8000-000000000007, sem representar um operador humano.

A reserva não é liberada por falha, timeout, mudança de contato ou arte.
`aguardando` significa que o provedor confirmou execução do diálogo, não entrega.
message_id permanece nulo, pois essa operação não devolve um ID de mensagem.
Nenhum status comercial é alterado. O envio normal da tela continua inalterado.
O teste adicional foi explicitamente autorizado e usa chave distinta do envio
anterior de texto, preservando ambos os históricos.

Não é habilitação geral para outros pedidos. A expansão deve definir coordenação
por remetente/contato até o consumo das variáveis pelo chatbot, autenticação
específica da automação, rastreio de entrega e finalização do fluxo. Um mesmo
campo de chat pode ser sobrescrito por outro processo externo; não executar
outros fluxos que alterem esse campo durante o teste.

Validação: testes sintéticos de ordem das chamadas, corpo do campo, autenticação,
limite do piloto, mudança de destinatário, concorrência, recusa, timeout e falha
de persistência. Evidência local em dist/entrega/dialogo-piloto-testes.log.
Publicação e resultado real serão registrados após execução.

Recuperação: desativar a função piloto em ação autorizada, preservando sua reserva.
Não apagar registros ou repetir uma chamada de resultado incerto. O campo do CRM
ficará com o link autorizado; não restaurar valor anterior desconhecido.

Fonte: https://wiki.chatguru.com.br/documentacao-api/parametros-obrigatorios

## Resultado da execução

Função publicada ACTIVE, versão 2, verify_jwt=true. Fonte publicada: e9e88e1f.
413 testes Deno passaram; após ajuste de autenticação, os cinco testes do piloto
passaram novamente. Nenhuma dependência instalada ou validação desabilitada.
A primeira versão recusou o preparo por autenticação, antes de qualquer envio.
A versão final usa segredo dedicado além do JWT, sem alterar credenciais existentes.

Teste real: preparo validado, campo confirmado e dialog_execute aceito. Uma única
invocação de enviar; status relido. Consulta direta ao banco confirmou exatamente
uma reserva, tentativas=1, estado=aguardando, message_id nulo, concluido=false.
O recebimento no WhatsApp e a expansão do link no template aguardam confirmação
humana. Não reenviar o teste para confirmar recebimento.

Evidência local: dist/entrega/dialogo-piloto-resultado.json. Publicação apenas da
função piloto; painel/frontend e status comercial do pedido não foram alterados.
Código e documentação registrados na branch feat/chatguru-dialogo-piloto-20261107.
