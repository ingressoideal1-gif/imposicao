# Link do Cliente — correções das prioridades 1 a 3

## Escopo e base

Pedido: corrigir os três primeiros pontos da análise do Link do Cliente.
Implementação local na branch `fix/portal-prioridades-1-3-20260926`, criada da
referência local `origin/main`, commit `fb776c1d0d2a7799634162db1a0696cb1d4cf74b`.
Worktree: `C:/ProjetosLocais/ideal-imposition-portal-prioridades-20260926`.
O checkout operacional e seus arquivos preexistentes foram preservados.

## Comportamento corrigido

1. Carga: respostas recusadas ou incompletas de dados, modelos, produtos,
   catálogos, numerações e artes interrompem a abertura do conteúdo parcial.
   O cliente recebe uma mensagem de indisponibilidade e o botão **Tentar novamente**,
   que recarrega a página. Token sem correspondência tem mensagem própria.
   Uma consulta válida com zero modelos continua permitindo consultar o portal;
   a proteção existente impede aprovar um pedido sem modelos.
2. Histórico: os três pontos de registro no chat verificam o erro retornado,
   além de exceções de rede. Falha mantém a decisão já salva e mostra um aviso
   persistente durante a visita, fora das abas. Não há repetição automática do
   INSERT nem solicitação para aprovar novamente. Um registro posterior bem-sucedido
   não apaga o aviso de uma falha anterior. O aviso não é persistido após F5.
3. Status: a abertura usa `pedidos_artes.status` da linha mais recente por
   `created_at`, como a consolidação já existente das decisões. O status do link
   e a alternativa da OS local ficam para registros legados sem status consolidado.
   Abrir ou recarregar não grava status. `Em Aprovação` é reconhecido como aprovação
   pendente, e `Corrigir Dados` mostra um cartão de dados em correção, sem apresentar
   a arte como em preparação.

Arquivos de produto: `frontend/cliente.js`, `frontend/cliente-shell.js` e
`frontend/cliente.html`. Os parâmetros de versão dos dois scripts foram atualizados
no HTML para `20260926-portal1`. Nenhum SQL ou componente de backend foi alterado.

## Validação

- `portal_carga_status_chat_harness.js`: 32 cenários passaram. Exercita funções
  reais com respostas simuladas: erros de carga, numeração ausente, pedido vazio,
  status divergentes, legado, chat recusado/offline/sucesso e ausência de repetição.
- `portal_carga_status_chat_browser_harness.js`: passou com Chromium em viewport
  390 × 844, HTML e shell reais, consultas simuladas e rede externa bloqueada.
  Verificados clique em Tentar novamente, aprovação, aviso visível, troca de aba,
  Voltar e F5, preservação de aba e classificação de Dados Pendentes/Corrigir Dados.
  O desenho da arte é substituído por um modelo de teste: não prova renderização
  de um PDF real. Nenhuma escrita ocorre na reabertura, exceto o efeito simulado
  da RPC de acesso, que não toca serviço real.
- Passaram os harnesses existentes `portal_abas`, `portal_dados`,
  `portal_confirmacoes`, `portal_orcamento`, `portal_persistencia`,
  `portal_entrega_cep`, `portal_faturamento_dados`, `portal_bancos`,
  `cliente_pdf_duplicate_back`, `cliente_pdf_paginado` e `correcao_do_cliente`.
- `node --check`: 76 arquivos JavaScript próprios do frontend passaram.
- `git diff --check`: passou.
- Os dois novos harnesses foram registrados em `tests/test_harnesses_do_portal.py`.
  O harness de persistência foi atualizado para carregar o novo auxiliar de chat.

Limitações do ambiente: o caminho documentado `venv/Scripts/python.exe` não existe
neste checkout; o Python disponível (`C:/Python314/python.exe`) não possui pytest.
Os harnesses foram executados diretamente com Node. Para o teste de navegador,
foi usado `NODE_PATH=C:/ProjetosLocais/ideal-imposition/node_modules`, reutilizando
o Puppeteer já instalado; nenhuma dependência foi instalada.

Falha preexistente: `cliente_verso_atual_harness.js` retorna
`ReferenceError: rotuloDoModoDeImpressao is not defined`. A mesma falha foi confirmada
carregando o código do commit-base via `git show HEAD:frontend/...`, sem as edições.
O problema está na montagem do contexto do teste e não foi alterado nesta tarefa.

## Entrega e retomada

Entrega somente local, sem commit, push, publicação, consulta de produção ou envio
real de mensagens. Os testes não comprovam permissões do banco, entrega real de chat
nem comportamento de um pedido real na versão publicada. A prioridade 4 (auditoria
de acesso) permanece fora deste escopo.

Para retomada, revisar o diff nesta worktree. Uma eventual publicação exige a
autorização correspondente e validação posterior dos arquivos públicos. Como não
houve publicação ou migração, não há estado remoto a recuperar; o commit-base
identifica a versão anterior para comparação e reversão controlada das edições.
