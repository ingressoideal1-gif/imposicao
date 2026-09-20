# Análise de Produção por Cor — 20/09/2026

Registro histórico do diagnóstico em `f184a001`. Após autorização “executar”, foram feitas as [correções locais e validações documentadas neste registro](correcao-producao-por-cor-2026-09-20.md). Os achados e números de linha abaixo descrevem a revisão anterior à correção.

## Conclusão

A página implementa o filtro produto + cor, mas a adaptação da janela do Pedido está incompleta. Há defeitos reproduzíveis na origem do arquivo enviado à geração, no isolamento da seleção, no carregamento necessário para alterar status e na coordenação de operações assíncronas. Esses achados explicam comportamentos incompatíveis com a proposta, mas ainda não identificam qual deles ocorreu no caso observado pelo usuário, que não informou pedido/etapa nesta análise.

Nenhuma correção funcional, consulta a dados reais, impressão, commit ou publicação foi realizada. Foram criados somente este relatório e um programa de reprodução offline.

## Revisão e evidência pública

- Checkout operacional preservado: `C:\ProjetosLocais\ideal-imposition`, HEAD `a306ff06`, com mudanças preexistentes. A página não existe nessa revisão local.
- Análise isolada: `C:\ProjetosLocais\ideal-imposition-auditoria-cor-20260920`, detached HEAD `f184a001`, referência local de `origin/main` disponível ao iniciar.
- GET público sem autenticação de `https://imposition.ai-ideal.com.br/{arquivo}?auditoria=20260920`: `producao-por-cor.js`, `script.js`, `pedido.js` e `index.html` coincidiram integralmente com a revisão analisada após normalizar CRLF/LF e espaços nas extremidades.
- Isso comprova correspondência desses arquivos públicos; não comprova a versão carregada em uma aba antiga, sessão autenticada, Service Worker, instalação do NewProd ou impressão física.

## Contrato recuperado

O histórico de 15/09/2026 registra: mesmos modelos do painel de produção, organizados por produto e cor; produto inicialmente vazio; apenas modelos aguardando; abrir abaixo do modelo a mesma janela e as mesmas regras de imposição; sincronizar Impresso com o painel; não interferir nas demais páginas. O usuário removeu expressamente o box “ordem de envio”.

O filtro básico produto + cor + Aguardando funciona no ensaio de controle. Os filtros de pedido chamam `pedidoNaGrafica`, `pedidoJaPassouDaGrafica` e `pedidoIgnoradoNosPaineis`. Não há evidência nesta análise para recomendar incluir pedidos de expedição/entregues ou retirar a exclusão de Ignorar.

## Achados prioritários

### 1. Alta — geração pode usar arte diferente da janela visível

- `frontend/pedido.js:6408`: `runPedImposition` escolhe entre `pedArtFile` e `impArtFile` exclusivamente pela classe `active` de `view-pedido`.
- Em Produção por Cor, a view ativa é `view-producao-cor`. O adaptador mantém essa view (`pedido.js:4289`), portanto o ramo usado é `impArtFile`, embora a janela visível pertença ao Pedido.
- Reprodução executando o trecho real: `pedArtFile = modelo-visivel.pdf`, `impArtFile = outro-estado.pdf`; o arquivo escolhido foi `outro-estado.pdf`.
- Os dois carregadores normalmente procuram a mesma arte, mas são assíncronos e separados. Esse erro não significa que toda impressão sai errada; significa que uma divergência, atraso ou falha em um deles permite que prévia e arquivo enviado discordem. O verso inicial também usa a mesma decisão em `pedido.js:6437`, com preparação adicional posterior.
- Direção de correção: reconhecer explicitamente o contexto da janela compartilhada ao gerar, sem depender somente do nome da view. Testar PDF e impressão com estados diferentes de propósito.

### 2. Alta — seleção invisível de outra página pode entrar na geração

- A página não limpa nem representa `state.selectedOSItems`.
- `enviarParaPedido` chama `limparSelecaoDeOutroPedido` (`pedido.js:4246`), mas essa função preserva todos os selecionados do MESMO pedido (`script.js:21414`).
- `runPedImposition` combina a seleção quando existem dois ou mais modelos (`pedido.js:6028`), independentemente do filtro produto/cor da página.
- Reprodução: dois modelos selecionados do mesmo pedido continuaram selecionados; o trecho real de preparação da geração incluiu ambos.
- Gatilho: selecionar modelos no Pedido e depois abrir, em Produção por Cor, um modelo daquele pedido. A geração pode abranger modelos que não estão na lista filtrada.
- Direção de correção: definir seleção própria para o contexto e impedir seleção invisível; preservar/restaurar o estado da página anterior conforme o contrato, sem alterar regras Multi-Artes/blocos/TICKET.

### 3. Alta — “Impresso” pode ser anunciado sem confirmação de persistência

- O seletor usa `updateItemImpressao` (`producao-por-cor.js:392`).
- `script.js:31594` grava por `id`, sem filtro adicional de pedido e sem solicitar uma linha de retorno. Só verifica `error`.
- Reprodução com resposta simulada `{ data: [], error: null }`: a função mudou o item para Impresso, emitiu sucesso e disparou o evento que retira o modelo da lista.
- É um defeito do caminho compartilhado, não exclusivo desta página. Uma resposta sem erro não prova que uma linha correspondente foi atualizada.
- Direção de correção: atualização pelo alvo exato `id + id_int`, retorno e validação de exatamente uma linha e do estado esperado; evento/sucesso somente após confirmação. Exige tratar o caminho compartilhado com regressões nas demais telas.

### 4. Alta — “Corrigir Arte” falha antes de abrir o modelo

- `loadRecords` monta `local.records` diretamente de `pedidos_modelos`, sem carregar os modelos completos em `state.osItens`.
- A pré-carga normal de pedidos coloca itens de `produtos_proposta`, com identificadores `vibe_item_*` (`script.js:26700`, `26741`).
- O seletor de status chama diretamente `updateItemImpressao`, sem `loadFullItem`; `devolverArteParaAlteracao` exige encontrar o ID real do modelo em `state.osItens` (`script.js:27465`).
- Reprodução com pré-carga de produto e ID real de modelo: retorno `false`, aviso “modelo não carregado”; não devolveu a arte.
- Abrir primeiro o modelo pode fazer o seletor passar a funcionar, tornando o comportamento dependente da ordem dos cliques.
- Direção de correção: carregar e validar o modelo antes da ação de status; manter a confirmação de persistência existente em Corrigir Arte.

### 5. Alta — aberturas assíncronas não respeitam saída ou último clique

- `producao-por-cor.js:332`: após aguardar `loadFullItem`, `openModel` não verifica se a página ainda está ativa, se o filtro mudou ou se outro clique foi feito.
- Reprodução A: iniciar abertura, sair da página e liberar a resposta; `enviarParaPedido` ainda foi chamado e o identificador aberto voltou a ser preenchido.
- Reprodução B: clicar A e B, concluir B primeiro e A depois; A venceu o último clique B.
- Como `enviarParaPedido` manipula estado global e pode navegar para Pedido quando o adaptador está inativo, o efeito pode ultrapassar a página.
- Direção de correção: identificador de operação/geração, invalidado ao sair, fechar e trocar filtro; validar antes de qualquer efeito compartilhado. Revisar também os temporizadores de carregamento da janela do Pedido.

## Demais achados

| Prioridade | Achado e evidência | Consequência / direção |
|---|---|---|
| Média | Evento de status remove a linha, mas preserva `local.openItemId` e `state.activeOSItem` (`producao-por-cor.js:441`). Reproduzido. | O modelo deixa de estar visível sem encerrar seu contexto. Fechar/reconciliar o modelo quando deixar de pertencer à lista. |
| Média | `refresh` mantém registros anteriores no erro; um novo render pelos filtros esconde o aviso (`producao-por-cor.js:284`). Reproduzido. | Lista antiga pode parecer atualizada. Manter estado de erro/desatualização e bloquear ações dependentes até reconciliar. |
| Média | Retorno `false` de `loadOrdens` é ignorado (`producao-por-cor.js:88`). Reproduzido com ordens antigas em memória. | Falha de atualização não impede usar elegibilidade antiga. Verificar sucesso da carga. |
| Média | Sem vínculo válido em `produtos_proposta`, a página usa `nome_modelo` como identidade do produto; a consulta sequer solicita `pedidos_modelos.id_produto` (`producao-por-cor.js:107`, `122`). Reproduzido com modelo sintético contendo ID de produto e sem linha de proposta. | Um produto pode ser separado em vários nomes de modelos. Resolver a identidade pelo contrato existente; não unir produtos só por semelhança de nome. Não foi medida a ocorrência real de vínculos ausentes. |
| Média, condicional | `selectInBatches` divide IDs de pedidos em grupos de 100, mas não pagina as linhas devolvidas (`producao-por-cor.js:64`). Simulação: 1.200 linhas disponíveis e limite de 1.000 retornou apenas 1.000, sem nova consulta. | Pode omitir modelos/produtos se um lote exceder o teto de resposta. O limite e o volume do ambiente real não foram consultados. Usar paginação ordenada e determinística. |
| Média | `formatDate('2026-09-20')` mostrou `19/09/2026` com fuso America/Sao_Paulo (`producao-por-cor.js:167`). Reproduzido. Também omite a hora quando ela existe. | Prazo somente data é interpretado como UTC e recua um dia. Distinguir data civil de timestamp e reutilizar o contrato de prazo. |
| Média, inspeção estática | Coluna Verso mostra `model.verso_tipo || 'Frente'` (`producao-por-cor.js:140`), enquanto a carga completa resolve pelo `print_mode` da numeração (`script.js:27053`). | Tabela e janela podem discordar. Não houve reprodução com catálogo real; usar a mesma resolução efetiva do Pedido. |

## Limitações operacionais e de integração

- A página oferece abertura e impressão manual de um modelo por vez. Não mantém fila automática do conjunto produto/cor nem avança sozinha para o próximo. O box de ordem de envio foi removido a pedido; portanto a ausência de automação precisa ser distinguida de um defeito confirmado do contrato posterior.
- A janela é o MESMO nó DOM movido da página Pedido, não uma instância independente (`pedido.js:4061`). Essa estratégia pode ser válida, mas requer que estado, seleção, callbacks e identificação da tela sejam adaptados conjuntamente; só mover o elemento não garante isolamento.
- “Atualizar lista” chama `loadOrdens`, que carrega dados gerais e dispara rotinas compartilhadas, inclusive sincronizações (`script.js:25970`, `26363`). Não é uma simples leitura isolada de cores. Por isso esta auditoria não executou a aplicação autenticada como se fosse uma inspeção sem efeitos.
- Falha ao buscar catálogo de cores é absorvida e convertida em catálogo vazio (`producao-por-cor.js:74`), podendo degradar a resolução de cor para nomes. Não foi determinada ocorrência real.
- A análise não encontrou código de fila automática ligando o conjunto filtrado a `openPrintModalQueue`. O envio individual reutiliza a geração/impressão existente.

## Validação executada

1. Sintaxe de `frontend/producao-por-cor.js`: `node --check` aprovado.
2. Harness original `node tests/producao_por_cor_harness.js`: aprovado; cobre somente a função de filtro com quatro registros.
3. Novo `node tests/producao_por_cor_auditoria_harness.js`: 13 verificações concluídas, incluindo um controle positivo e 12 cenários que evidenciam limitações/defeitos. Executa código real em VM com DOM/banco substituídos por simulações. Não testa renderização visual, API remota ou motor PDF completo. As asserções documentam o defeito atual; NÃO devem ser promovidas a critérios de aceitação da correção.
4. Sete funções de `tests/test_producao_por_cor.py` executadas diretamente com `runpy`: seis aprovadas, uma falhou. Não foi execução pelo pytest: o venv previsto não existe e o Python disponível não tem pytest. Nada foi instalado.
5. A falha existente exige o texto literal `return inFactory && !alreadyLeft`, mas o código atual inclui `!ignored`. Isso é teste desatualizado após a exclusão de Ignorar; não prova que a regra atual de elegibilidade esteja errada. O teste precisa verificar comportamento.
6. Comparação pública dos quatro arquivos descritos acima: correspondência confirmada.

## Ordem recomendada para corrigir e validar

1. Isolar contexto de arte/seleção e impedir abertura atrasada depois de troca de filtro/view.
2. Corrigir contrato de persistência de Impresso e carregar modelo antes de Corrigir Arte.
3. Reconciliar janela aberta, sucesso/erro de atualização e registros visíveis.
4. Unificar resolução de produto/cor/verso/prazo e paginar leituras.
5. Testar o fluxo completo com dados sintéticos: entrar sem seleção; escolher produto/cor; abrir arte própria, arte por cor e frente/verso; gerar PDF com dois estados de arte deliberadamente diferentes; mudar status com sucesso, erro e zero linhas; alternar rapidamente modelos/views; retornar ao Pedido sem seleção invisível.
6. Regressões nas telas Pedido/Produção/Imposição, confirmação física separada e publicação apenas no escopo autorizado.

Para retomar: usar a worktree isolada indicada acima e o harness offline. Não sincronizar a raiz suja por reset, stash ou sobrescrita. O trabalho desta sessão termina em diagnóstico; nenhuma correção está aplicada.
