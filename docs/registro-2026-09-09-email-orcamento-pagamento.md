# E-mail: orçamento e acesso ao pagamento — 09/09/2026

Pedidos do usuário: remover o resumo técnico dos modelos e os links diretos das
artes; incluir o Resumo do Orçamento; adicionar Realizar Pagamento direcionando
ao link do cliente na aba Pagar.

## Resultado

- O modal prepara somente a mensagem de aprovação; não carrega itens da OS para
  compor quantidade, cor, numeração ou URLs de artes no corpo.
- O backend remove também o bloco padrão de resumo de modelos entre os títulos
  antigos RESUMO DOS MODELOS DO PEDIDO e LINK DE APROVAÇÃO INTERATIVA. Isso cobre
  mensagens ainda preparadas por abas antigas, preservando saudação e aprovação.
- Orçamento consultado depois de validar sessão, grade e link ativo. Consulta
  somente leitura em `propostas`, filtro `id_int` pelo número do link validado,
  projeção `id_int,texto_whatsapp`, limite 2 para recusar ambiguidades.
  Mesma fonte do portal (`frontend/cliente-orcamento.js` e
  `sql/link_cliente_pedido.sql`); valores e condições não são recalculados.
- No HTML: aprovação primeiro, Resumo do Orçamento, Realizar Pagamento e
  atendimento WhatsApp. Texto alternativo inclui orçamento e URL de pagamento.
- Realizar Pagamento usa o mesmo link validado mais `#pagamento`, reconhecido por
  `montarPortal` em `cliente-shell.js` como a aba Pagar. Apenas navegação: não
  cria cobrança, não registra pagamento e não muda regras financeiras.
- Texto do orçamento escapado antes do negrito de WhatsApp; não aceita orçamento
  ou HTML arbitrário como novo campo da API. Sem novas dependências ou secrets.

Ausência de `texto_whatsapp` não vira valor zero nem soma de itens: o e-mail
orienta consultar o orçamento no portal/atendimento. Falha na consulta, resposta
ambígua ou orçamento de outro número impedem o envio. Não houve escrita em banco.

## Validação

- 30 testes Deno passaram (API, SMTP, MIME, remoção de resumo, valores e botão).
- 2 testes pytest passaram, incluindo geração real da mensagem e campos no Chrome.
- 146 verificações das abas do portal passaram. Sintaxe JS e tipos do painel aprovados.
- Prévias desktop e celular sem overflow; href do botão conferido com `#pagamento`.
  Dados fictícios em `tests/email_layout_preview.ts` e capturas
  `design/email-aprovacao-desktop.png` / `design/email-aprovacao-mobile.png`.
- Nenhum e-mail real enviado por estes testes. Após publicação, conferir um novo
  recebimento e a navegação na aba Pagar. E-mails anteriores não são modificados.

Entrega v841, base `b9fe6e18`, branch `fix/email-sem-resumo`, worktree
`imposicao-email-sem-resumo`. Preservadas alterações de outras tarefas na raiz e
nos demais worktrees. Publicação inclui frontend e Edge Function painel.
