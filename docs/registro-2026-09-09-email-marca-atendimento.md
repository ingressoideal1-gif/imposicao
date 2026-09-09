# E-mail: marca oficial e atendimento do pedido — 09/09/2026

## Resultado

- Cabeçalho com a logo oficial `1785672791278_logo_ideal_2026.jpg`, no bucket
  público `app-imagens`, sobre fundo branco e com proporção preservada.
- Assinatura `Atenciosamente,` seguida de `Atendimento: nome do responsável`.
  O nome vem de `propostas.vendedor`, mesma fonte do atendimento no portal.
  Alexandre Almeida é um exemplo; nenhum responsável foi fixado no código.
- Modal usa o responsável da proposta consultada. O servidor confirma o nome na
  consulta existente do orçamento (`id_int` do link validado, limite 2), com
  projeção `id_int,texto_whatsapp,vendedor`. Atualiza a assinatura padrão no HTML
  e no texto, inclusive se o modal ainda contiver o responsável anterior.
- Sem nome cadastrado, a assinatura usa somente `Atendimento`.
- O bloco de ajuda foi substituído por `Falar com meu Atendimento`, acompanhado
  da imagem oficial `1787694554509_Whatsapp.png` fornecida pelo usuário.
  Imagem e texto integram o mesmo link clicável.
- WhatsApp mantém o número central usado por `frontend/cliente-entrega.js`.
  A mensagem preparada identifica o responsável e o pedido. Não há cadastro de
  números individuais nesta fonte; o link não garante roteamento automático.
- Preservados resumo do orçamento, botão de aprovação e Realizar Pagamento
  (`#pagamento`), além do popup de sucesso após a confirmação do envio.

## Validação e entrega

- 33 testes Deno passaram: API, assinatura por pedido, atualização de nome,
  ausência de responsável, escape de HTML, URLs, SMTP e MIME.
- 2 testes pytest passaram, incluindo Chrome com modal real e nomes alternados.
- `node --check frontend/script.js`, tipos do painel e `git diff --check` aprovados.
- Prévias desktop e celular em `design/email-aprovacao-desktop.png` e
  `design/email-aprovacao-mobile.png`, sem transbordamento. Imagens públicas
  responderam HTTP 200; capturas usam cópias temporárias dessas mesmas imagens.
- Antes da publicação, os 13 arquivos TypeScript da função `painel` online foram
  comparados com a base Git: nenhuma divergência. Sem migração ou escrita em banco.
- Nenhum e-mail real enviado nestas verificações. O recebimento deste novo layout
  deve ser conferido em um novo envio; mensagens já recebidas não são alteradas.

Entrega preparada em `fix/email-marca-atendimento`, worktree
`imposicao-email-atendimento`, base `cdc6bed6`. Frontend v842 e Edge Function
`painel` no projeto `vwbtitjlpelrcnsytzqw`, preservando autenticação JWT.
O checkout original e alterações de outras tarefas foram preservados.

Recuperação: reverter o commit desta alteração e republicar frontend e função
`painel`. Não há dados ou secrets a restaurar.
