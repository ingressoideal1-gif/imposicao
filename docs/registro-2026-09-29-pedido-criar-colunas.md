# Criar colunas nos bancos do pedido — 29/09/2026

Atualização de entrega segura: pacote reaplicado sobre `88b03346` e validado na
worktree `ideal-imposition-pedido-colunas-entrega-atual-20260929`. Inclui o carregamento
do editor e suas dependências também em `producao.html`; o harness passou a ter
12 cenários. Ver [entrega segura](entrega-segura-2026-09-29-pedido-colunas.md).

## Escopo e estado

Implementação local na branch `feat/pedido-criar-colunas-20260929`, worktree
`C:\ProjetosLocais\ideal-imposition-pedido-colunas`, a partir de `origin/main`
`db3c65e5`. Sem commit, push ou publicação nesta etapa. O checkout operacional e
a tarefa separada de espaço do texto de Camarote foram preservados.

O usuário confirmou que um modelo deve usar dados novos junto com os de um CSV
já importado. Também definiu: excluir limpa só a célula, sem deslocamento;
a primeira linha colada é conteúdo; células restantes ficam vazias, sem repetição.

## Comportamento

- `➕ Criar colunas` no Gerenciamento de Bancos de Dados permite criar um banco
  no pedido ou editar um existente. `✏️ Editar colunas` abre diretamente cada banco.
- Novo banco inicia com uma coluna e uma linha. Há adição de colunas e linhas,
  renomeação de cabeçalhos, colagem TSV de várias linhas/colunas e limpeza por célula.
- Colagem preserva zeros, valores repetidos na primeira linha, vazios internos,
  vírgulas, ponto e vírgula e campos entre aspas com quebras de linha.
- Dados antigos, identificadores `__id`, linhas inativas e metadados de fotos são
  preservados. Limpar/substituir o texto de uma célula remove a foto anterior daquela
  célula; renomear a coluna transporta sua foto.
- O mesmo banco aparece em `Vem de` e suas colunas antigas e novas aparecem em
  `Colunas` do modelo. Nenhum vínculo é criado automaticamente.
- Grade paginada em 50 linhas, confirmação ao descartar, aviso de saída da página,
  nome de banco editável, nomes de coluna duplicados/reservados recusados e cópia
  dos dados para recuperar o rascunho. Não há exclusão estrutural de linhas/colunas
  neste editor simples.
- Bancos com URL avisam que atualizar pela Planilha pode substituir edições manuais.

## Salvamento e limites

Usa exclusivamente as ações existentes de `chamarBancosPedido`, mantendo a
autorização e o pedido capturado ao abrir. Não altera tabelas, Python, Edge Functions,
numerações nem permissões. Testes usam API simulada; não houve acesso a dados reais.

O editor aguarda a resposta e a releitura do banco antes de fechar. Falha mantém
o conteúdo. Se uma escrita já começou, o rascunho fica bloqueado para repetir a
mesma operação, com opção de copiar os dados. Se apenas a consulta prévia falhar,
continua editável. Resposta de criação perdida é reconciliada pela consulta de
bancos novos com conteúdo exatamente igual antes de tentar criar novamente.

A API atual não dispõe de transação envolvendo banco e mapas. Para renomear,
este editor primeiro grava ambos os nomes com o mesmo conteúdo, atualiza os
vínculos explícitos e implícitos de todos os modelos retornados pela API e só
então remove o nome antigo. Assim, falha entre as etapas mantém os dois mapas
legíveis. A repetição na mesma sessão conclui a operação sem recalcular trocas.
Se o operador fechar/recarregar durante essa falha, os nomes temporários podem
permanecer no banco; deve conferir o pedido antes de prosseguir. Não há garantia
de gravação atômica.

A comparação prévia detecta edições já concluídas em outra tela, alterações dos
mapas e mudanças no conjunto de modelos durante uma tentativa interrompida.
Isso **não substitui controle de concorrência no servidor**: uma edição concorrente
entre consulta e escrita ainda é possível. Uma transação e chave de idempotência
no servidor são melhoria posterior que exige escopo de backend. O editor avançado
`Conferir` permanece com o comportamento anterior, incluindo seu salvamento próprio.

## Validação local

- `node tests/pedido_colunas_harness.js`: 11 cenários aprovados, incluindo 10 mil
  linhas, identidade, fotos, mapas implícitos, resposta perdida ao criar/atualizar,
  falha no segundo vínculo, repetição e conflito com edição já concluída.
- `node tests/pedido_colunas_browser_harness.js`: Chromium com cliques, colagem,
  limpeza, renomeação, aguardo e falha de rede, repetição, reabertura, cancelamento,
  paginação, tela estreita e abertura da função real `Colunas do modelo`, oferecendo
  as colunas novas e as importadas. Nenhuma requisição externa permitida.
- Regressões existentes: `banco_do_modelo_harness.js` (54),
  `banco_do_pedido_etapa2_harness.js` (105),
  `banco_do_pedido_regressao_harness.js` (7) e
  `banco_do_pedido_na_impressao_harness.js` (40): 206 verificações aprovadas.
- Sintaxe dos 78 arquivos JS próprios do frontend e `git diff --check` aprovados.
- `tests/test_pedido_colunas.py` integra os dois novos harnesses ao pytest.
  O Python padrão deste ambiente não tem pytest e a venv indicada nas instruções
  não existe neste checkout; os harnesses foram executados diretamente com Node,
  usando o Puppeteer já instalado no checkout operacional, sem instalar dependências.
- Prévia visual com dados sintéticos preservada fora do pacote de publicação:
  `C:\ProjectBackups\pedido-colunas-entrega-20260929\pedido-colunas-previa.png`.
  O verificador atual de entrega aplica a regra de whitespace também a imagens
  novas. A imagem original permanece na worktree da implementação.

## Retomada e entrega

Revisar apenas os arquivos desta branch. Antes de publicar, atualizar a base se
`origin/main` avançar, executar o fluxo de entrega segura do frontend e atualizar
as versões dos assets conforme esse fluxo. Verificar a propagação nos domínios
Cloudflare e comparar os assets publicados. Não afirmar gravação autenticada em
produção ou impressão física com base nestes testes.

Até a publicação, recuperação consiste em deixar esta worktree isolada: não há
alteração remota a reverter. Não descartar mudanças do checkout principal nem
incluir a tarefa de Camarote automaticamente nesta entrega.
