# Auditoria da migração Cloudflare — 07/09/2026

> Atualização posterior desta mesma data: o bloqueio CORS nesta estação foi
> resolvido com a instalação local do NewProd 1.2.324. Ver
> [registro da atualização](newprod-1.2.324-cloudflare-2026-09-07.md).
> Os resultados abaixo preservam a auditoria anterior à instalação.

Fonte analisada: `RELATORIO_MIGRACAO_CLOUDFLARE_2026-09-07(1).md`, fornecido
pelo usuário. Este registro distingue as alegações do relatório das verificações
executadas nesta sessão. Não altera a URL canônica.

## Resultado prioritário: NewProd instalado rejeita a nova origem

O agente em `http://127.0.0.1:9000` respondeu ao status com
`NewProd 1.2.323`, `status=running` e `onde=local`.

Foram enviados somente preflights OPTIONS a `/api/impor`, sem arquivo, pedido,
credencial ou execução de impressão. Método solicitado POST, cabeçalhos
`content-type,authorization` e solicitação de acesso à rede privada.

| Origem | Resultado |
|---|---|
| `https://imposition.ai-ideal.com.br` | HTTP 400; sem `Access-Control-Allow-Origin` |
| `https://ideal-imposition.vercel.app` | HTTP 200; origem explicitamente autorizada |

O código integrado contém a nova origem, mas o processo instalado não a aceita.
Não considerar a comunicação com NewProd migrada. Antes de trocar links e QR
codes, preparar uma atualização do agente com o código integrado, validar seu
conteúdo e obter autorização para build/instalação e seus efeitos sobre segredos
e arquivos de saída. Não corrigir abrindo CORS para qualquer origem.

Não foi executado build, instalação, reinício ou atualização automática do agente.

## Código e preservação do workspace

- `origin/main` foi atualizado por fetch e confirmado em `784728a4`, incluindo
  os PRs #4, #5 e #6. Os commits citados no relatório existem nessa história.
- A pasta original permaneceu em `main` no commit `a306ff06`, com todas as
  alterações preexistentes preservadas, inclusive os trabalhos de propostas,
  e-mail e acabamento. Não foi usado stash nem checkout sobre esses arquivos.
- Foi criado um worktree separado em
  `C:/Users/Junior/Projetos Ingresso ideal/imposicao-validacao-cloudflare`.
- A auditoria local está na branch `audit/cloudflare-20260907`, baseada em
  `784728a4`. Nenhum commit, push ou PR foi criado nesta sessão.
- A branch `ci/ambiente-testes` e o objeto `6aa40332` não estão disponíveis neste
  clone. É necessário localizar o checkout de origem antes de retomar esse CI.

## Validações realizadas

No worktree da versão integrada, usando as ferramentas já instaladas:

- 70 testes pytest aprovados: `test_cloudflare_pages.py`,
  `test_painel_base_url.py` e `test_o_javascript_do_frontend_compila.py`, com `-n 0`.
- Suíte Deno aprovada, saída 0, com `--allow-env --allow-read --quiet` e sem
  permissão de rede de execução. Não foram usados segredos reais nos testes.
- Quatro testes do novo diagnóstico aprovados, incluindo rejeição de HTML
  apresentado como manifesto/JavaScript e de manifesto com escopo incorreto.
- A suíte Python completa não foi executada: esta rodada limitou-se aos testes
  examinados e pertinentes à migração. Não equivale a validar todo o sistema.

O novo comando `ferramentas/verificar_cloudflare.py` faz GETs públicos sem
cookies/credenciais e sem executar JavaScript. Confere código HTTP, conteúdo,
MIME, política de cache de HTML/manifesto e identidade/escopo do manifesto.
Não segue redirecionamentos nas rotas que devem preservar o caminho.

```powershell
python ferramentas/verificar_cloudflare.py --base-url https://imposition.ai-ideal.com.br
```

O comando exige Python 3 com biblioteca padrão; não exige dependências extras.
Ele consulta a hospedagem indicada, portanto não é uma verificação offline.

As oito rotas passaram:

- `/`
- `/ic/`
- `/ic/portaria.html`
- `/cliente/teste`
- `/pedido/0`
- `/ic/app.webmanifest`
- `/ic/sw.js`
- `/script.js`

Uma rodada inicial de HEAD teve timeout/reset em dois arquivos; a verificação
posterior por GET foi concluída com sucesso. Isso não comprova disponibilidade
contínua nem valida os fluxos autenticados.

## Correções de interpretação do relatório

1. O manifesto versionado é `frontend/app.webmanifest`, referenciado pelas
   páginas do aplicativo como `/ic/app.webmanifest`. `portaria.webmanifest`
   não existe no commit analisado. HTTP 200 e MIME configurado por regra
   genérica não bastam para confirmar um manifesto válido.
2. Os nameservers atuais de `ai-ideal.com.br` são
   `andronicus.ns.cloudflare.com` e `sneh.ns.cloudflare.com`. A afirmação de que
   eles não foram transferidos durante a migração pode descrever o histórico;
   não significa que hoje o DNS seja servido fora da Cloudflare.
3. Preflight aprovado nas Edge Functions não comprova login, permissões,
   renovação da sessão ou compatibilidade com o NewProd instalado.
4. A existência de uma URL Pages separada não isola os dados Supabase.
5. Não revogar o token da CLI automaticamente: o relatório não comprova
   exposição do token nem identifica a credencial exata a revogar. Tratar seu
   encerramento separadamente, após confirmar proprietário e necessidade.

## Pendências antes da troca canônica

- Atualizar e validar o NewProd nas estações autorizadas; repetir os preflights.
- Validar login por senha e Google, renovação/logout, permissões e redirect URLs
  usando conta de teste autorizada, sem compartilhar credenciais pelo chat.
- Validar instalação PWA, service worker e vínculo de aparelho em celular de
  teste. A nova origem possui armazenamento próprio: vínculos e dados offline
  do endereço antigo não devem ser considerados transferidos automaticamente.
- Validar imposição e impressão em estação real com arte sintética.
- Confirmar configuração de publicação e rollback do Pages com a TI. Não foi
  consultada a configuração autenticada da conta Cloudflare nesta sessão.
- Só depois preparar a troca coordenada das constantes e funções canônicas.
  Preservar as URLs antigas para links/QR codes já distribuídos.
- Revisar scripts de publicação em tarefa própria: durante a transição, push
  pode acionar as duas hospedagens. O requisito de CI sem preview precisa
  abranger Cloudflare e Vercel.

Não houve alteração de DNS, Supabase, Vercel, Cloudflare ou aplicação nesta
auditoria. As alterações locais são este registro, o diagnóstico e seus testes.
