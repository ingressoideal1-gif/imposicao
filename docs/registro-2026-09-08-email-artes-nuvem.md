# Envio de aprovação de artes pela nuvem — 08/09/2026

> Atualização da entrega: implementação integrada em worktree isolado a partir
> de `62b17945` (`origin/main`), preservando as correções publicadas nas PRs #13
> e #14. O backend foi publicado; a ativação SMTP está bloqueada por autenticação
> da hospedagem e pela permissão da conta Supabase para alterar secrets.
> Ver a seção final. Os registros anteriores abaixo preservam a etapa local.

## Resultado local

O painel envia e-mails por `painel/api/email/enviar`, na Edge Function existente
do Supabase. O NewProd não participa do envio, da consulta do remetente ou do
teste, mesmo quando a página é servida por uma estação.

O usuário confirmou o uso do **SMTP da hospedagem atual**. O transporte preparado
usa TLS implícito na porta **465**, valida o certificado do servidor e suporta
autenticação PLAIN ou LOGIN dentro da conexão criptografada. Não foi adicionada
dependência: a conexão usa `Deno.connectTls` e a mensagem usa MIME texto UTF-8.
As artes continuam disponíveis pelo link de aprovação, sem anexos neste fluxo.

O Supabase bloqueia conexões de saída nas portas 25 e 587. Não basta reutilizar
os parâmetros de uma configuração local com STARTTLS/587. Referências técnicas:
[limites do Supabase](https://supabase.com/docs/guides/functions/limits) e
[API de rede do Deno](https://docs.deno.com/api/deno/network/).

## Fluxo e acesso

1. O usuário entra na conta do painel, abre o envio na Lista de Artes e confere
   destinatário, assunto e mensagem.
2. O navegador envia o JWT da sessão para a função `painel`. Não procura agente
   local, não usa código de estação como substituto do login e não faz fallback
   para a API Python.
3. O gateway continua com `verify_jwt = true`. A função obtém a grade de
   permissões do usuário no banco e reutiliza `exigirOperadorPropostas`.
4. Qualquer perfil com uma das permissões existentes de leitura de pedidos
   (`perm_pedidos_view`, `perm_producao_view`, `perm_acabamento_view`,
   `perm_lista_arte_view`, `perm_numeracao_view`) pode enviar. O nome do papel não
   concede nem impede acesso sozinho. Conta anônima ou sem essa grade é recusada.
5. A função consulta somente `os_id,numero_pedido,token` do link ativo do pedido.
   Um link inexistente, ambíguo ou divergente impede o disparo. O corpo deve
   conter o link conferido. Links locais/legados reconhecidos são substituídos
   pelo domínio público configurado no e-mail.
6. A função usa o SMTP central e só retorna sucesso depois da resposta de
   aceitação do servidor. Isso não comprova entrega, abertura ou aprovação.

O acesso aos pedidos segue o contrato já existente de `operarPropostas`, que
não filtra por dono do pedido ou empresa. Esta alteração não cria isolamento
multiempresa, não amplia consultas comerciais e não muda as RPCs do portal.

## Contrato HTTP

Todos os caminhos abaixo são relativos a `API_PAINEL` e exigem sessão e grade.

| Método e caminho | Entrada | Resultado |
|---|---|---|
| `GET /api/email/config` | Sem corpo | `ok` e `config` com remetente, nome e `configurado` |
| `POST /api/email/testar` | `{}` | Teste para o e-mail do usuário autenticado |
| `POST /api/email/enviar` | `os_id`, `link_url`, `to`, `subject`, `body_text` | Aceitação e referência da tentativa |

O destinatário do teste vem do JWT, não do navegador. A configuração não aceita
escrita pela tela. O envio não aceita `smtp_config`, remetente, HTML, autoria,
anexos, filtros ou colunas livres. Assunto, destinatário, tamanho da mensagem e
caracteres de controle são validados antes do SMTP. A resposta de configuração
não confirma conectividade ou autenticação; apenas indica parâmetros presentes
e válidos no ambiente.

A rota de e-mail aceita o CORS do domínio exato
`https://imposition.ai-ideal.com.br`, além das origens já autorizadas pelo helper
compartilhado. A exceção é restrita ao e-mail nesta cópia local, cujo helper CORS
ainda antecede a migração geral para Cloudflare. Não foi aberta origem curinga.

## Configuração central a realizar

Cadastrar os valores no gerenciamento de secrets das Edge Functions do projeto
correto, por responsável autorizado. Nunca pela conversa, pelo frontend, em
arquivo versionado ou copiando automaticamente a senha do JSON da estação.

| Nome | Uso |
|---|---|
| `EMAIL_ARTES_SMTP_HOST` | Host SMTP confirmado pelo TI, sem URL ou porta embutida |
| `EMAIL_ARTES_SMTP_USER` | Usuário SMTP; na ausência, usa o remetente |
| `EMAIL_ARTES_SMTP_PASSWORD` | Senha SMTP ou senha de aplicação |
| `EMAIL_ARTES_SMTP_PORT` | Opcional; somente `465` é aceito, também é o padrão |
| `EMAIL_ARTES_REMETENTE` | Padrão `contato@ingressoideal.com.br`; precisa ser autorizado pela hospedagem |
| `EMAIL_ARTES_NOME` | Padrão `Ingresso Ideal — Atendimento` |
| `EMAIL_ARTES_PORTAL_URL` | Origem HTTPS pública, sem barra final; padrão `https://imposition.ai-ideal.com.br` |

OAuth2 e STARTTLS não foram implementados neste transporte. Se a hospedagem
exigir esses métodos ou bloquear conexões da nuvem, é preciso ajustar a solução
antes da ativação. Não há alternativa automática para SMTP sem criptografia.

## Arquivos e validação

- `frontend/script.js`: transporte autenticado, remetente somente para consulta,
  teste para a própria conta, contexto do pedido e proteção contra cliques repetidos.
- `supabase/functions/painel/index.ts`: rotas autenticadas e CORS do e-mail.
- `supabase/functions/_compartilhado/email_artes.ts`: contrato, permissões,
  configuração central e validação do link.
- `supabase/functions/_compartilhado/smtp_artes.ts`: conexão TLS, autenticação,
  MIME, timeout de 25 segundos e tratamento de respostas.
- `tests/email_envio_harness.js`: regressão do frontend sem agente local.
- `supabase/functions/_compartilhado/email_artes_test.ts`,
  `smtp_artes_test.ts` e `supabase/functions/painel/email_test.ts`: testes de
  domínio, SMTP e handler real com substitutos sintéticos.

Validação executada em 08/09/2026:

- **241 testes Deno passaram**, incluindo 22 novos testes de e-mail; sem
  permissão de rede. Banco, autenticação do gateway e SMTP simulados.
- `node tests/email_envio_harness.js`: passou.
- `node --check frontend/script.js`: passou.
- `deno check --no-config --no-lock supabase/functions/painel/index.ts`: passou.
- `git diff --check`: passou; avisos de normalização LF/CRLF já presentes no checkout.

Não foram executados testes com conta SMTP real, conexão TLS à hospedagem,
entrega em caixa de entrada, aprovação real, SQL remoto, build, commit ou deploy.
As rotas Python locais não foram modificadas nesta etapa e sua suíte SMTP não
foi reexecutada. A configuração legada em `formats_db.json` continua no disco;
não foi lida, removida, criptografada nem migrada.

## Ativação pendente e recuperação

1. TI confirma host, TLS/465, PLAIN/LOGIN, credencial, liberação de envio por
   aplicações, restrições de rede, limites e SPF/DKIM/DMARC.
2. Integrar esta alteração com a versão de entrega atual. O checkout já tinha
   mudanças de outras tarefas e estava 10 commits atrás de `origin/main` na
   referência local; não houve fetch. Não publicar o diretório inteiro sem
   revisar essas diferenças. A função `painel` também contém trabalho anterior
   de propostas/fundo que deve ser preservado na integração.
3. Configurar os secrets e publicar a função `painel`, mantendo a validação JWT.
   Publicar o frontend correspondente pelo processo de entrega existente,
   incluindo atualização dos recursos/cache do PWA. Não requer novo NewProd.
4. Em computador sem NewProd, entrar com um perfil de trabalho, consultar
   “Remetente e teste”, enviar o teste e conferir entrada/spam.
5. Com pedido de teste autorizado, enviar a aprovação, abrir o link recebido e
   conferir o fluxo de decisão e retorno ao painel.

Para desativar o novo envio sem expor credenciais, remover o secret de senha da
nuvem em uma ação autorizada: o serviço passa a informar que não está configurado.
Voltar ao frontend anterior restaura a dependência do agente; não atende ao
requisito de usuários sem NewProd. Nenhum dado comercial exige rollback SQL.

Há trava de operação simultânea e repetição da última mensagem aceita na mesma
abertura do modal; reabrir o modal permite um reenvio intencional. Não há fila,
retry automático, limite distribuído ou idempotência persistida entre abas,
usuários e instâncias. Em timeout após DATA, a entrega é incerta: conferir o
recebimento antes de repetir. Não afirmar garantia de envio único.

Os logs técnicos registram referência, ID do usuário e resultado, sem conteúdo,
endereço do cliente, link/token de aprovação ou senha. Não constituem histórico
comercial persistido por pedido nem confirmação de entrega do provedor.

## Publicação e diagnóstico de ativação

Pedido humano: executar configuração central, publicação do backend/frontend e
validação da autenticação. Projeto confirmado pelo frontend e pela CLI:
`vwbtitjlpelrcnsytzqw` (e-deal), região `sa-east-1`. Domínio público:
`https://imposition.ai-ideal.com.br`, Cloudflare Pages, repositório
`ingressoideal1-gif/imposicao`.

- O DNS de `smtp.ingressoideal.com.br` aponta para a KingHost. Os dois endereços
  IPv4 responderam com timeout nas portas 465/587 a partir desta máquina.
- `smtpi.kinghost.net:465` respondeu com TLS 1.3, certificado válido, saudação 220,
  EHLO 250 e autenticação PLAIN/LOGIN. A porta 587 desse host também anunciou
  STARTTLS e negociou TLS 1.3; ela continua indisponível para saída no Supabase.
- A KingHost documenta o uso de SMTP internacional e a necessidade de ativá-lo
  para o domínio: [orientação oficial](https://king.host/wiki/artigo/como-ativar-o-smtp-internacional/).
- A tentativa de autenticação com a credencial fornecida retornou **535**.
  Nenhuma mensagem foi enviada e nenhuma senha foi gravada em código, Git ou log.
  Não houve arquivo temporário de senha, porque o helper encerrou antes da
  configuração. O usuário confirmou que não há barras na credencial; o teste
  já tinha usado essa interpretação. Não foi repetida tentativa sem correção.
- A chamada `supabase secrets set` para os parâmetros não secretos também foi
  recusada pelo Supabase: conta sem privilégios necessários para esse endpoint.
  A listagem anterior de secrets não continha nomes `EMAIL_ARTES_*`.
  A CLI retornou o erro em JSON apesar de código de saída zero; por isso não
  foi considerado sucesso de configuração.

Entrega preparada:

- `painel` publicado por `functions deploy painel --project-ref ... --use-api`.
  Antes da publicação, todos os módulos baixados da função de produção foram
  comparados com `origin/main`; a base era idêntica.
- `verify_jwt=true` preservado. Verificação pública: `OPTIONS /api/email/enviar`
  retornou 204 com CORS do domínio Cloudflare; `GET /api/email/config` sem login
  retornou 401.
- A entrega não importa o trabalho local ainda não publicado de propostas/fundo.
  A checagem de leitura de pedidos fica no helper de e-mail, com a mesma grade
  e sem exigir papel administrativo. O CORS compartilhado atual já contempla
  Cloudflare; não foi necessário modificar sua política.
- Versão do painel preparada: `script.js?v=838` em `index.html` e `producao.html`.
  A função de verificar SMTP autentica sem `MAIL FROM`, `RCPT TO` ou `DATA`.
- Na base de entrega, **225 testes Deno passaram**; depois, um teste adicional
  de autenticação sem envio passou junto dos 10 testes SMTP existentes.
  Os 68 JavaScripts passaram em `node --check`. Passaram o harness de e-mail,
  os 25 checks de controles PDF, os 19 casos de geração/cópia do link e o teste
  de cópia no Chrome. `tests/test_email_nuvem.py` integra o harness à suíte Python.

Pendências para concluir a ativação:

1. Confirmar ou corrigir a credencial e a liberação de SMTP internacional da
   conta na KingHost. Um 535 não permite afirmar qual dessas condições falhou.
2. Usar um acesso Supabase com permissão para gerenciar os secrets do projeto,
   ou pedir ao responsável que cadastre os nomes da tabela acima. Não mudar
   permissões do banco, JWT ou regras de acesso para contornar essa recusa.
3. Após configurar, validar a autenticação no ambiente de nuvem e enviar um
   teste autorizado. A tela publicada sem esses secrets informa configuração
   pendente e não depende do NewProd.
