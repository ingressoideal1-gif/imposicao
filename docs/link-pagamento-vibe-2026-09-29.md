# Link de pagamento do Vibe — integração e entrega segura

## Registro da entrega de 29/09

O usuário cadastrou `VIBE_LINK_PGTO_KEY` em Secrets e aplicou o SQL; a captura
enviada mostrou as 13 verificações com `OK`. A presença do nome do secret foi
confirmada pela CLI, sem consultar seu valor. Não houve reaplicação remota do SQL.

PR #60 registra SQL, rollback e configuração; PR #61 entrega o servidor.
As funções publicadas estão `ACTIVE`: `link-pagamento` versão 1, sem JWT e
protegida pelo token do pedido; `painel` versão 251, com JWT obrigatório.
O download posterior conferiu 19 arquivos de fonte com a implementação validada.
OPTIONS 204, GET 405, POST com token inválido 200/url null e painel anônimo 401
foram conferidos. Não houve envio real de e-mail nem acesso a pagamento real.

O frontend foi preparado em worktree própria, com simulação de entrega segura
aprovada para v980. A comprovação pública deve incluir `cliente.html`,
`cliente-dados.js` e `cliente-pagamento.js` nos dois domínios Cloudflare.
As fases de Edge Functions passaram pela suíte Deno completa e pela simulação.
A publicação do servidor foi limitada às duas funções afetadas: o comando genérico
republicaria todas as funções ao detectar arquivo compartilhado. A integração usa
PRs pelo conector GitHub, pois o executável `gh` não está disponível na máquina.

O backup anterior de `painel` fica em
`C:\Users\Junior\AppData\Local\Temp\ideal-pagamento-vibe-antes-20260929-193417`;
seus 16 arquivos correspondiam integralmente à base antes da publicação.

## Base da implementação

Base: `origin/main` disponível em `db3c65e570b058a783f969200b883ffea9b51710` (v979).
Branch: `feat/cliente-link-pagamento-20260929`.
Pasta: `C:\ProjetosLocais\ideal-imposition-cliente-link-pagamento`.
O checkout operacional e os arquivos preexistentes foram preservados.

## Comportamento

- Na aba Pagamento, quando não há cobrança ou alguma parcela está sem link válido,
  aparece um único botão **Pagar pedido**, se o Vibe devolver um endereço válido.
  Links diretos existentes continuam com **Pagar agora**.
- A consulta opcional à nuvem ocorre depois de carregar os dados do portal e não
  bloqueia a aprovação das artes. Uma resposta atrasada de outro pedido é ignorada.
- No e-mail de aprovação, o botão **Pagar pedido** aponta diretamente para o Vibe,
  em nova aba, com `noopener noreferrer`. Substitui o atalho antigo para `#pagamento`.
  O estado financeiro não condiciona esse botão: a página do Vibe decide o que pode
  ser pago. Valores, cobranças e status existentes não são alterados.
- Falha na consulta ou na persistência omite o botão; a aprovação continua sendo
  enviada. A API apenas entrega o endereço; não cria cobrança por esta integração.

Contrato conferido no documento fornecido pelo usuário, `link-pagamento.md`:
`GET https://vibe.ai-ideal.com.br/api/v1/parceiro/link-pagamento/{id_int}`,
cabeçalho `x-api-key`, resposta com `id_int` e `url`.

## Servidor, cache e acesso

`supabase/functions/_compartilhado/link_pagamento_vibe.ts` é compartilhado pelo
envio autenticado em `painel` e pela nova Edge Function `link-pagamento`.
A chave vem exclusivamente de `VIBE_LINK_PGTO_KEY` no ambiente das Edge Functions.
Nenhum valor de chave foi lido pela implementação ou incluído no repositório;
o cadastro em Secrets foi feito pelo usuário.

O cache fica em `public.pedidos_links_pagamento_vibe`, identificado pelo número
do pedido. As RPCs reservam uma tentativa atomicamente e concluem somente a reserva
correta. O sucesso exige retorno confirmado e releitura do registro antes de exibir
o botão. Um link salvo é reutilizado indefinidamente, sem novo GET ao Vibe.

Toda leitura pública, inclusive em cache, exige número e token ativo de aprovação;
se o vínculo possui `id_int`, ele precisa coincidir. A tabela tem RLS e não concede
acesso a `anon` ou `authenticated`. As duas RPCs são exclusivas de `service_role`.
A nova Edge Function não exige JWT porque o cliente não faz login; a validação do
par número/token é obrigatória dentro da RPC. A função `painel` mantém JWT obrigatório.

Há timeout de 5 segundos na consulta ao Vibe, incluindo leitura do corpo, sem seguir
redirecionamentos. O retorno precisa pertencer ao mesmo pedido, domínio HTTPS do
Vibe e caminho `/p/{id_int}-{token}`. Logs próprios contêm só evento e código
HTTP/interno, sem chave, corpo de erro, URL de pagamento ou token de aprovação.

O controle compartilhado permite até 30 tentativas/minuto por esta instalação.
Chamadas em andamento reservam o pedido por 5 minutos. Falhas 429/500, timeout e
erros transitórios só podem tentar novamente após 5 minutos; 401/404/503 e ausência
de chave aguardam 1 hora. A próxima abertura do portal ou envio de aprovação após
o intervalo permite uma nova tentativa. Não há repetição em sequência, cron ou
promessa de tentativa automática sem novo acesso. Outras integrações no mesmo IP
podem consumir a cota do Vibe; o 429 continua sendo tratado.

## Ordem de implantação e conferência

1. Revisar/aplicar `sql/link_cliente_pagamento_vibe.sql` no Supabase usado pelo portal.
   Cria uma tabela vazia, índice e duas funções em transação. Não atualiza pedidos,
   `pagamentos_v2` ou cobranças existentes. Não reaplicar: o script usa `CREATE` e
   deve falhar se já existir, para evitar substituir uma implantação anterior.
   Em seguida executar `sql/link_cliente_pagamento_vibe_verificar.sql`: as 13 linhas
   precisam retornar `OK`. Essa conferência lê somente metadados, sem expor dados.
2. Cadastrar `VIBE_LINK_PGTO_KEY` nos Secrets das Edge Functions pelo canal protegido
   do administrador. Não colocar a chave na conversa, comandos registrados ou HTML.
3. Publicar `link-pagamento` com sua configuração de JWT e atualizar `painel`, que
   passa a importar o módulo compartilhado. Conferir a configuração de `painel` intacta.
4. Publicar `frontend/cliente-dados.js` e `frontend/cliente-pagamento.js` pelo fluxo
   Cloudflare Pages, atualizando suas referências de cache em `cliente.html`.
5. Com autorização para dados reais, validar um pedido autorizado sem cobrança,
   clicar no botão e repetir a abertura: deve reutilizar o cache. Conferir uma linha
   por número no cache e o recebimento do e-mail de aprovação separadamente.
   Comparar os arquivos públicos após propagação. Não registrar URLs/tokens em logs.

Cada primeira consulta válida insere/atualiza no máximo uma linha do cache, filtrada
por `numero_pedido`; a conclusão também exige o UUID de reserva. Não há escrita
financeira ou envio ao Vibe além do GET documentado. O usuário aplicou o SQL e
cadastrou a chave; o deploy das duas funções foi confirmado no registro acima.
Nenhum e-mail real foi enviado por esta entrega.

## Recuperação

Republicar apenas os trechos anteriores destes arquivos a partir da base da entrega,
preservando alterações posteriores. Desativar a Edge Function `link-pagamento`.
Depois, aplicar `sql/link_cliente_pagamento_vibe_rollback.sql` para revogar o acesso
das Edge Functions ao cache e às RPCs. O rollback preserva tabela e links já obtidos;
não executa DROP, DELETE ou alteração financeira. Para reativar, restaurar apenas os
GRANTs do script inicial e republicar os arquivos validados, sem recriar a tabela.

## Validação local

- 41 testes Deno passaram: API simulada, cache, concorrência, token, timeout real de
  5 s, todos os códigos de erro informados, envio de aprovação, layout e SMTP simulado.
- PostgreSQL descartável em memória (PGlite): permissões efetivas, RLS, token inválido,
  revogação após cache, vínculo divergente, reserva concorrente, persistência, intervalo
  de nova tentativa, limite global de 30/minuto e par número/token ambíguo passaram.
  O rollback também foi executado nesse banco descartável: remove acesso e preserva dados.
- Chromium com API sintética: renderização, clique, destino/atributos do botão,
  pedidos pagos/abertos, cobrança direta, parcelas mistas, indisponibilidade e resposta
  atrasada de outro pedido passaram. Nenhum destino de pagamento real foi acessado.
- Regressões: 108 verificações de orçamento/pagamento e 132 dos dados do portal passaram.
- Sintaxe dos dois JS, tipos dos entrypoints `painel` e `link-pagamento` e revisão
  de whitespace passaram.

Comandos reproduzíveis (dependências existentes, sem instalação):

```powershell
# A partir de supabase/functions; usar o Deno já instalado na máquina.
deno test --cached-only --node-modules-dir=none --allow-env --allow-read --quiet _compartilhado/link_pagamento_vibe_test.ts _compartilhado/email_artes_test.ts _compartilhado/email_artes_layout_test.ts _compartilhado/smtp_artes_test.ts
# A partir da raiz; informar o index.js do PGlite já instalado.
node tests/link_pagamento_vibe_postgres.mjs C:\CAMINHO\node_modules\@electric-sql\pglite\dist\index.js
node tests/cliente_pagamento_vibe_harness.js
node tests/portal_orcamento_harness.js
node tests/portal_dados_harness.js
git diff --check
```

O primeiro comando Deno precisou de `--node-modules-dir=none` para resolver tipos
Node já existentes no cache global; o node_modules local não contém `@types/node`.
Nenhuma dependência ou lockfile foi alterado. Os testes locais não comprovam a
resposta real da API ou entrega na caixa de entrada. O registro da entrega acima
separa as verificações locais, as confirmações do usuário e os efeitos publicados.
