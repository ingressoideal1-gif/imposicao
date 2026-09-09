# Tamanhos e cor do cabeçalho no e-mail de aprovação — 09/09/2026

- Logo Ideal: largura de 56 para 112 px (+100%), altura proporcional; célula do
  cabeçalho ampliada para acomodar a imagem e manter o texto ao lado.
- Imagem Clique aqui: largura máxima de 360 para 252 px (-30%), proporcional.
- Número do pedido: fonte de 12 para 19,2 px (+60%).
- Fundo do cabeçalho atualizado para `#1c8de2`, conforme pedido adicional.
- Mantidos links, conteúdo, pagamento verde e atendimento.

Oito testes existentes de layout/MIME passaram. Prévias finais em 760 e 390 px
conferidas no Chrome: logo 112 px, aprovação 252 px, fonte do pedido 19,2 px,
imagens carregadas, link sintético correto e ausência de transbordamento.
Antes do deploy, os 13 arquivos TypeScript remotos de `painel` coincidiam com a
base Git. Sem envio real de e-mail, escrita em banco ou alteração do frontend.

Publicação da função `painel` no projeto `vwbtitjlpelrcnsytzqw`.
Recuperação: reverter este commit e republicar a função.
Prévias atualizadas em `design/email-aprovacao-desktop.png` e
`design/email-aprovacao-mobile.png`.
