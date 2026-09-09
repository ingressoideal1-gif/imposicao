# Imagem clicável para aprovação no e-mail — 09/09/2026

- Substituído o botão Abrir aprovação interativa pela imagem fornecida pelo
  usuário: `app-imagens/1788965455974_Email.png`, no Storage público do projeto.
- Toda a imagem é um link para a aprovação validada do próprio pedido. O número
  usado como exemplo na conversa não foi fixado no template.
- Largura máxima de 360 pixels, proporcional e adaptável ao celular, com texto
  alternativo. O endereço para copiar no rodapé e no texto alternativo permanece.
- E-mail de teste sem pedido conserva Abrir painel. Cabeçalho, assinatura por
  responsável, orçamento, WhatsApp e botão verde de pagamento preservados.
- Oito testes existentes de layout/MIME aprovados. Imagem pública HTTP 200.
  Prévias em 760 e 390 pixels conferidas, sem transbordamento, imagens carregadas
  e destino da imagem verificado com pedido sintético.
- Os 13 arquivos da função online foram comparados à base antes do deploy, sem
  divergências. Não houve envio real de e-mail nestas verificações.

Publicação restrita ao template da função `painel`, Supabase
`vwbtitjlpelrcnsytzqw`; frontend continua v842. Recuperação: reverter este commit
e republicar a função. Prévias atualizadas em `design/email-aprovacao-*.png`.
