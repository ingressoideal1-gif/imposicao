# Imagem clicável de pagamento no e-mail — 09/09/2026

- Substituído o botão Realizar Pagamento pela imagem fornecida:
  `app-imagens/1788966314184_pagamento.png`, no Storage público do projeto.
- A imagem inteira abre o link validado do próprio pedido com `#pagamento`,
  preservando a navegação para a aba Pagar. Não cria nem registra pagamentos.
- Largura máxima de 252 px, igual à imagem de aprovação, altura proporcional e
  texto alternativo Realizar Pagamento. URL mantida na versão de texto do e-mail.
- Preservados cabeçalho #1c8de2, tamanhos, orçamento, assinatura e WhatsApp.

Validação: oito testes existentes de layout/MIME passaram. Imagem pública HTTP
200. Prévias em 760 e 390 px com imagens carregadas, sem transbordamento, largura
252 px e destino da imagem conferido para a aba Pagar de um pedido sintético.
Antes do deploy, os 13 arquivos TypeScript remotos coincidiam com a base Git.
Sem envio real nos testes, escrita em banco ou alteração financeira.

Publicação restrita ao template da função `painel`, projeto Supabase
`vwbtitjlpelrcnsytzqw`. Recuperação: reverter este commit e republicar a função.
Capturas atualizadas em `design/email-aprovacao-*.png`.
