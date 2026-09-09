# E-mail de aprovação: apresentação e campos — 09/09/2026

O usuário confirmou envio e recebimento reais após a ativação do SMTP internacional.
Solicitou corrigir a troca indevida do assunto ao editar o destinatário e melhorar
o e-mail com imagem de cabeçalho, botão de aprovação e WhatsApp de atendimento.

## Alterações

- `frontend/script.js`: destinatário e assunto têm nomes e rótulos próprios.
  Assunto usa textarea com autocomplete desligado, limite de 200 caracteres e
  remoção de quebras de linha. Não havia listener ligando os valores; autofill
  é hipótese para o relato, sem reprodução da sessão/perfil original do Gmail.
  Edição independente foi validada com teclado e DOM reais no Chrome.
- `email_artes_layout.ts`: cabeçalho com a imagem já existente `frontend/logo.png`,
  marca e pedido; botão de aprovação antes dos modelos; links curtos de arquivos;
  contato WhatsApp do atendimento já usado no portal (`cliente-entrega.js`),
  com pedido na mensagem; endereço de aprovação também disponível para copiar.
- `email_artes.ts`: aplica o layout após a validação do link ativo do pedido.
  O teste de remetente usa o mesmo visual, com botão para o painel, sem inventar
  uma aprovação. HTML vindo do navegador continua proibido.
- `smtp_artes.ts`: MIME multipart/alternative com texto e HTML em UTF-8/base64.
  Conteúdo editável escapado, sem executar HTML; TLS, autenticação e envelope
  preservados. Nenhuma dependência, SQL ou configuração secreta foi alterada.

O conteúdo é baseado em tabelas, estilos inline e largura fluida até 600px.
Botão e marca em texto continuam legíveis se o cliente de e-mail bloquear imagens.
Referências consultadas: [Mailchimp: chamadas para ação](https://templates.mailchimp.com/design/calls-to-action/),
[Mailchimp: layout e propósito](https://templates.mailchimp.com/design/layout-and-purpose/),
[Postmark: e-mails transacionais](https://postmarkapp.com/transactional-email-templates).
Implementação própria, reutilizando os recursos de marca do projeto.

## Validação e prévia

- 27 testes Deno passaram: API, autorização, links, transporte, MIME e layout.
- Harness de envio sem NewProd e teste de campos no Chrome passaram.
- Sintaxe de `frontend/script.js` aprovada.
- Prévias desktop (760px) e celular (390px) sem overflow horizontal.
- `tests/email_layout_preview.ts` gera `design/email-aprovacao-preview.html`
  somente com dados fictícios; capturas em `design/email-aprovacao-desktop.png`
  e `design/email-aprovacao-mobile.png`.

Limite: a prévia no Chrome não comprova renderização idêntica em Gmail/Outlook.
A atualização precisa ser conferida em novo envio recebido. O envio anterior
foi confirmado pelo usuário; não confundir essa evidência com teste real deste HTML.

Trabalho em `imposicao-email-layout`, branch `fix/email-aprovacao-layout`, a partir
de `b25bcdaf`, preservando os outros worktrees e a raiz com alterações preexistentes.
