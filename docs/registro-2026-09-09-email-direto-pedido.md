# Envio direto pelo pedido em arte — 09/09/2026

O botão `✉️ Enviar Link ao Cliente` no cabeçalho do pedido agora envia o e-mail
pela API de nuvem existente e mostra `Sucesso do Envio` após o aceite. Não cria
nem abre o editor de e-mail, não copia o link e não mostra o ícone intermediário.

## Comportamento

- Captura o pedido selecionado ao clicar. Busca proposta pelo número e cliente
  pelo `id_faturado` ou `id_cliente`, preservando a fonte já usada pelo editor.
- Destinatário segue a prioridade existente: `email_financeiro`, `email_contato`,
  `email`. No envio direto, consultas falhas ou ambíguas e endereço vazio/inválido
  impedem o envio; o aviso orienta conferir o cadastro.
- Reutiliza link ativo validado, sem regenerar a arte ou apagar a abertura do
  cliente. Sem link, aguarda a preparação existente da arte e do link; falhas
  interrompem o envio. Mantém a marca Enviar Arte desse fluxo existente.
- Compartilha montagem da mensagem com o editor; personalização HTML, orçamento,
  imagens, pagamento e assinatura por atendimento continuam no backend atual.
- Botão mostra andamento e fica desabilitado durante a operação. Trava compartilhada
  evita cliques concorrentes; a última mensagem aceita não é repetida por novo
  clique na mesma sessão. Não é uma garantia de idempotência entre dispositivos.
- Popup só aparece após resposta positiva do servidor. Falhas mostram aviso,
  liberam o botão e não anunciam sucesso. Fechar o popup devolve foco ao botão.
- Editor continua disponível pelos demais acessos existentes.

## Validação e publicação

- Três testes de integração passaram, incluindo dois fluxos Chrome e transporte
  simulado: botão real, ausência do editor, destinatário/link/corpo, bloqueio de
  duplicidade, cadastro inválido, preparo recusado, erro de envio, sucesso e foco.
- Sintaxe de `frontend/script.js` e revisão de whitespace aprovadas.
- Nenhum e-mail real enviado e nenhum dado remoto alterado nos testes.
- Frontend v844; sem deploy de backend, migração, dependências ou novos secrets.
- Base `eaf60695`, branch `fix/email-direto-pedido`, checkout original preservado.
  Recuperação: reverter esta alteração e republicar o frontend.
