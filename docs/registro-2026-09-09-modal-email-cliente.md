# Modal de envio de e-mail — 09/09/2026

Pedido: popup de sucesso ao enviar pela aplicação, remoção das miniaturas e
melhor leitura do corpo da mensagem no modal de notificação ao cliente.

- Modal com campos em largura total, fonte Inter/Segoe UI/Arial em 15px (16px
  no celular), mensagem em fundo branco com espaçamento de 1,75 e área ampliada.
  Ações auxiliares separadas do botão de envio, rodapé visível e conteúdo rolável.
- Removidos o título da prévia, o container e a montagem das miniaturas. O resumo
  textual dos modelos e os links presentes na mensagem permanecem disponíveis.
- Popup nativo `dialog` com título **Sucesso do Envio**, destinatário inserido
  como texto e botão **Entendido**. Abre somente após resposta bem-sucedida da
  API; fecha por botão ou Esc. A mensagem distingue envio de chegada à caixa.
- Mantidos autenticação, proteção contra duplicidade, falhas e preenchimento
  independente de destinatário e assunto. Nenhuma alteração no backend.

Validação: sintaxe JavaScript e 2 testes pytest passaram (harness de envio e
Chrome). Conferidos envio pendente, sucesso, recusa, duplicidade, fechamento,
campos independentes, ausência de miniaturas e largura desktop/celular com
`frontend/style.css` real. Rede bloqueada e dados fictícios, sem enviar e-mail.

Prévias geradas em `design/modal-email-desktop.png`, `design/modal-email-mobile.png`
e `design/modal-email-sucesso.png`. Para regenerar durante o teste, definir
`EMAIL_MODAL_PREVIEW_DIR=design` e executar `tests/email_campos_browser_harness.js`.

Entrega preparada como painel v840, em worktree `imposicao-email-modal`, branch
`fix/modal-email-cliente`, base `4265f1cb`. Outros worktrees e mudanças na raiz
preservados. A publicação não exige nova configuração SMTP ou deploy Supabase.
