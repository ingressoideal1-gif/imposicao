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
o problema. O domínio da coluna SQL gerada `link` e a migração de hospedagem não
foram alterados nesta tarefa.

## Preparação da publicação autorizada

Após o pedido explícito de publicar, a correção foi transportada para o worktree
`imposicao-copia-link-cliente`, branch `fix/copia-link-cliente`, sobre `origin/main`
em `b8a716e2`. Foi aplicado somente o diff desta tarefa, preservando as mudanças
locais anteriores e as correções já publicadas no portal.

- A integração preserva `CLIENTE_BASE_URL` e o domínio oficial
  `https://imposition.ai-ideal.com.br`, inclusive ao compartilhar pela estação.
- `index.html` e `producao.html` passam a carregar `script.js?v=836` para renovar
  o cache do arquivo alterado. Nenhuma versão do agente foi modificada.
- O harness de domínio foi adaptado à confirmação da criação e às funções
  extraídas. O harness da estação não carregava `CLIENTE_BASE_URL` e já falhava
  contra `origin/main`; a montagem foi corrigida sem retirar suas verificações.
- Durante a preparação, C: ficou sem espaço. Somente as cópias de `tools/` do
  worktree recém-criado foram retiradas por sparse checkout, liberando cerca de
  114 MB. O teste cuja gravação foi interrompida foi recuperado de Git e corrigido.
  A pasta original não foi limpa ou restaurada.
- A versão integrada passou em 79 testes pytest, incluindo os 65 arquivos de
  sintaxe JavaScript, domínio oficial, rotas Cloudflare, cópia em Chrome e as
  regressões do portal. `git diff --check` passou.

A entrega depende do merge, da implantação automática e da confirmação HTTP do
JavaScript e das páginas no domínio oficial. Nenhum link real de cliente é aberto
nessa verificação, para não registrar visualização ou alterar a aprovação.
