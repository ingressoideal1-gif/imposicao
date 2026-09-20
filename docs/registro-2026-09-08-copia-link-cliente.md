# Geração e cópia do link do cliente — 08/09/2026

O usuário relatou que **Copiar Link** às vezes não copia ou parece não responder.
A revisão e a correção foram locais, na branch `main`, preservando as alterações
que já existiam no checkout. Nenhum banco compartilhado foi consultado ou alterado.

## Falhas encontradas

- O botão de cópia chamava sempre `prepararLinkDaArtePronta`, carregando modelos,
  regenerando imagens e fazendo gravações antes de tentar copiar um link existente.
  Isso também zerava `cliente_abriu_em` e gravava `Enviar Arte` novamente.
- Quando `navigator.clipboard.writeText` falhava, a alternativa ignorava o retorno
  de `document.execCommand('copy')` e anunciava sucesso mesmo com retorno `false`.
  No modal, a rejeição da cópia não tinha tratamento.
- A criação podia retornar `null`, mas a preparação declarava sucesso e o botão
  montava uma URL sem token. Falhas na gravação do carimbo também não interrompiam
  o fluxo.
- Cliques simultâneos não tinham bloqueio. Um conflito de criação entre abas
  terminava em erro, sem recuperar o link já criado pela outra aba.

As três primeiras regressões foram exercitadas contra uma cópia do `script.js`
anterior à edição. Isso confirma defeitos no código local; não identifica por si
só qual deles ocorreu na sessão do usuário.

## Comportamento corrigido

- Copiar consulta o link ativo e confirmado, preserva o token, a abertura do
  cliente e o status, sem regerar imagens nem recarregar a lista inteira.
- Gerar um link novo e **Reenviar Link** continuam esperando a preparação da arte.
  O botão de reenvio passa essa intenção explicitamente.
- O botão mostra **Aguarde...**, impede cliques duplicados por pedido e volta ao
  estado anterior após sucesso ou erro. O foco do teclado é recuperado quando
  aplicável.
- Sucesso na cópia só aparece com confirmação da API. Se as duas alternativas
  falharem, uma janela oferece o endereço completo para cópia manual. O mesmo
  tratamento atende o botão de link do modal de e-mail.
- Falhas de consulta/criação não viram links sem token. A criação confirma o
  registro devolvido pelo banco. Conflitos entre abas recuperam o link ativo
  vencedor; links inativos não são reativados automaticamente.
- Falhas no carimbo da versão interrompem o preparo. A atualização exige retorno
  de uma linha ativa antes de alterar o cache e prosseguir.

Arquivos: `frontend/script.js`, `tests/arte_de_aprovacao_harness.js`,
`tests/link_cliente_copia_harness.js`, `tests/link_cliente_copia_browser_harness.js`
e `tests/test_link_cliente_copia.py`.

## Validação

- 19 cenários no novo harness Node, com DOM e Supabase simulados.
- Chrome local, página sintética: clique real, alternativa de cópia com seleção,
  restauração do foco, janela manual, ausência de falso sucesso e recuperação do
  botão. O teste intercepta o evento de cópia e não lê nem altera o clipboard do
  usuário; bloqueia requisições fora do servidor local de teste.
- 11 testes pytest aprovados com `-n 0`: cópia do link, arte de aprovação,
  correções solicitadas pelo cliente, Lista de Arte, página do cliente e estação
  sem sessão. Comando:

```powershell
.\venv\Scripts\python.exe -m pytest -n 0 tests/test_link_cliente_copia.py tests/test_arte_de_aprovacao.py tests/test_correcao_do_cliente.py tests/test_lista_arte.py tests/test_link_do_cliente.py tests/test_estacao_sem_sessao.py
```

## Limites da validação inicial

A correção inicialmente ficou local. Nessa etapa não houve commit, push, deploy, SQL remoto ou
alteração de credenciais, permissões, dependências e regras de aprovação.
A validação não equivale a testar Safari/iPhone ou a sessão real que apresentou
o problema. A versão integrada preservou CLIENTE_BASE_URL e o domínio público oficial.
O domínio da coluna SQL gerada `link` não foi alterado nesta tarefa.

## Publicação confirmada

Após autorização explícita do usuário, a correção foi publicada por worktree
isolado `imposicao-copia-link-cliente`, preservando as outras alterações da pasta
original e usando a versão atual de `origin/main` como base.

- PR: https://github.com/ingressoideal1-gif/imposicao/pull/13
- Commit integrado: `60fd94b2e1579569618e6a934e50d8acb982d15d`.
- A integração preserva `CLIENTE_BASE_URL` e o domínio oficial, incluindo links
  copiados pelo painel local. O script passou a `script.js?v=836` no painel e na
  página de produção.
- 79 testes passaram na versão integrada, incluindo sintaxe de 65 arquivos JS,
  domínio, rotas Cloudflare e os cenários de cópia. Um harness antigo da estação
  foi ajustado para carregar a constante de domínio; sua falha foi reproduzida
  contra `origin/main` antes da correção.
- Verificação pública: `/`, `/producao` e `/script.js?v=836` responderam HTTP 200
  no domínio oficial, com servidor Cloudflare. As duas páginas referenciam v836.
- O JavaScript público coincide integralmente com o arquivo validado, normalizando
  apenas CRLF/LF. SHA-256 normalizado:
  `804538747af4fcb52b3c6e74b7999523289160d4d4e4fa6600b158270ae51524`.
- Nenhum link real foi aberto e nenhum pedido, aprovação ou SQL remoto foi alterado.

Durante a preparação, C: ficou sem espaço. Foram retiradas apenas as cópias
descartáveis de `tools/` do novo worktree, por sparse checkout, e recuperado de Git
um teste cuja gravação foi interrompida. A validação completa selecionada passou
depois dessa recuperação. A pasta original foi preservada.
