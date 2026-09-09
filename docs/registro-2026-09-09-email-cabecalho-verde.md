# Ajuste do cabeçalho e pagamento do e-mail — 09/09/2026

Pedido: manter o estilo anterior do cabeçalho, substituindo apenas a logo, e
deixar o botão Realizar Pagamento verde.

- Restaurados fundo azul-escuro, divisor turquesa, nome Ingresso Ideal e subtítulo
  APROVAÇÃO DE ARTES. Logo oficial já fornecida, à esquerda, sem distorcer proporção.
- Botão de pagamento com fundo e borda verdes (`#15803d`), texto branco e mesmo
  endereço do cliente na aba Pagar (`#pagamento`).
- Alteração restrita ao template HTML do servidor. Frontend permanece v842;
  assinatura por atendente, orçamento, aprovação e WhatsApp preservados.
- Oito testes existentes de layout/MIME passaram. Prévias em 760 e 390 pixels
  conferidas, imagens carregadas, sem transbordamento, cor do botão verificada.
- Antes de publicar, 13 arquivos TypeScript da função remota `painel` conferidos
  contra a base Git, sem divergências. Nenhum e-mail real enviado nos testes.

Publicação no mesmo projeto Supabase `vwbtitjlpelrcnsytzqw`, função `painel`.
Recuperação: reverter esta alteração do template e republicar a função.
Capturas atualizadas em `design/email-aprovacao-desktop.png` e
`design/email-aprovacao-mobile.png`.
