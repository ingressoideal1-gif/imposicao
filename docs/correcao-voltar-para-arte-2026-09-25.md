# Retorno ao card Em Arte

Preparação local em `fix/voltar-para-arte-20260925`, baseada em `origin/main`
6990729d. Sem escrita de diagnóstico em produção, commit ou publicação.

## Falha reproduzida

Os dois botões gravavam `Em Arte`, mas não atualizavam a cópia consolidada em
`state.todasArtes`. A classificação podia continuar em aprovação pelo acesso
anterior do cliente ao link. Na recarga, a sincronização automática também
podia substituir o retorno pelas decisões antigas dos modelos. Marcar
`Em Alteração` manualmente contornava parte dessa precedência.

O teste novo executa as funções reais com banco simulado. Antes da mudança,
o clique retornou `aprovacao` em vez de `fila`.

## Correção e limites

- Os dois botões confirmam a gravação e atualizam a memória com os registros
  retornados pelo banco; preservam os demais campos já carregados.
- `pedidos_artes.status = Em Arte` prevalece sobre os sinais antigos para
  classificar um pedido que ainda não saiu da Arte. As sincronizações
  automáticas respeitam esse estágio até uma nova ação do fluxo.
- Não apaga o histórico de abertura, aprovações dos modelos nem dados de
  entrega. Não libera produção e não muda quantidades ou numeração.
- Cancelados são bloqueados antes de escrever. O retorno de produção mantém
  a exigência existente de modelos reprovados e a marca `Corrigir Arte`;
  os demais modelos continuam preservados.
- As gravações das tabelas continuam separadas. Uma falha parcial gera erro,
  sem mensagem de sucesso; atualizar a tela e repetir a ação permite conferir
  e completar o retorno. Não foi introduzida transação remota ou migração.

## Validação

- `voltar_para_arte_harness.js`: dois botões, recarga com sincronização real,
  link existente/ausente, modelos aprovados/reprovados, entrega pendente,
  ordem nativa, falhas/vazio na persistência, cancelamento e retrabalho.
- Harnesses de Corrigir Arte (83 verificações), persistência (37), Lista de
  Arte enxuta (53) e status consolidado (22): passaram.
- Sintaxe dos 76 JavaScripts próprios do frontend: passou.
- O harness geral `lista_arte_harness.js` tem uma falha preexistente em
  “mandar o modelo para a Imposicao rele as numeracoes do pedido”. Reproduzida
  também com `HEAD:frontend/script.js`, sem a correção (162/163 passam).
- `estacao_sem_sessao_harness.js`: 9/17 falhas, idênticas com o script de
  `HEAD`; não introduzidas por esta tarefa. `lista_arte_desempenho_harness.js`
  não executou porque `puppeteer` não está instalado neste worktree.
- Pytest não disponível no Python local; harnesses executados diretamente
  com Node. Nenhuma dependência instalada.

Ainda falta publicação e verificação na tela publicada. Para reverter depois
da integração, restaurar apenas o diff desta tarefa, preservando outros
trabalhos. Nenhuma alteração de banco exige recuperação neste diagnóstico.
