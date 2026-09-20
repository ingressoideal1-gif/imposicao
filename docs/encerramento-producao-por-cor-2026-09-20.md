# Encerramento — Produção por Cor — 20/09/2026

Trabalho encerrado a pedido do usuário: “documentar tudo e encerrar por hoje”. A última entrega funcional desta sessão é **v923**, commit `11a2d5b5c2e1745983b6a8a9ad7c746876f333de`, integrada em `origin/main`. Este registro consolida a evolução, o contrato final, as evidências e a retomada. A documentação de etapas anteriores permanece como histórico; em divergências de escopo, prevalece o contrato final abaixo.

## Contrato final solicitado

- Replicar o Painel de Produção, organizando os modelos por produto e cor e reutilizando o comportamento da janela do Pedido.
- Considerar somente pedidos da fila base do Painel de Produção. Reutilizar `pedidoIgnoradoNosPaineis`, `pedidoJaPassouDaGrafica` e `pedidoNaGrafica`, após carregar as ordens. Não copiar a pesquisa transitória, a paginação ou outros filtros visuais da outra tela.
- Excluir pedidos ignorados e os que estão fora da gráfica, incluindo Arte, Expedição, Em Trânsito e Entregue conforme os critérios compartilhados. Incluir Produção, Impressão e Acabamento conforme esses mesmos critérios.
- Mostrar apenas modelos aguardando impressão. O legado `PENDENTE`, normalizado quanto a caixa e espaços, equivale a Aguardando nesta página. Preservar a precedência de `status_impressao`; Impresso e Corrigir Arte não entram.
- Iniciar o campo Produto com “Selecione um produto”, sem seleção automática. Listar os produtos elegíveis, sem duplicatas, em ordem alfabética. Selecionar produto e depois cor restringe os modelos a essa combinação.
- Para cada cor, mostrar quantidade de **pedidos distintos**, quantidade de **modelos** e **total de unidades**. Ordenar do maior para o menor total de unidades; desempatar pelo nome da cor.
- Reutilizar a mesma janela e o mesmo preparo de formato e saída do Pedido, inclusive saída já salva e troca entre modelos. Não criar outro resolvedor de formato/saída.
- Preservar arte, verso, identificação de pedido/modelo, numeração, unidades físicas de TICKET e restrição de blocos de Multi-Artes. Não foi criada fila automática de impressão.

## Evolução e entregas

| Etapa | Commit | Resultado e referência |
| --- | --- | --- |
| Diagnóstico inicial, base v913 | `f184a001` | Auditoria de carregamento, seleção, impressão e persistência; [análise](analise-producao-por-cor-2026-09-20.md). |
| v914 | `300a0b08` | Correções de estado, concorrência, carregamento, arte/verso, geração e confirmação de persistência; [registro](correcao-producao-por-cor-2026-09-20.md). |
| v915 | `233ce5c4` | Ampliação da consulta para todos os pedidos, segundo a interpretação então adotada; [registro](correcao-dropdown-produto-2026-09-20.md). **Essa abrangência foi substituída pela v921**, após a instrução expressa de usar somente pedidos do painel. |
| v919 | `ea1e77d3` | Inicialização ao exibir/restaurar a seção, inclusive navegação alternativa, e estados de carregamento/erro; [registro](producao-por-cor-inicializacao-2026-09-20.md). |
| v920 | `f8c3a97b` | Inclusão de modelos legados PENDENTE como aguardando impressão; [registro](producao-por-cor-pendente-2026-09-20.md). |
| v921 | `49a3fec2` | Restrição aos pedidos da fila base de produção, mantendo a inclusão de PENDENTE; [registro](producao-por-cor-fila-painel-2026-09-20.md). |
| v922 | `42d68e40` | Totais de pedidos, modelos e unidades por cor; ordenação decrescente por unidades; [registro](producao-por-cor-totais-2026-09-20.md). |
| v923 | `11a2d5b5` | Mesmo preparo de formato e saída usado ao abrir modelos pelo Pedido; [registro](producao-por-cor-formato-saida-2026-09-20.md). |

As versões v916–v918 contêm trabalho de outras sessões. Foram preservadas e incorporadas como base antes da v919, sem atribuir essas entregas a esta tarefa.

## Diagnóstico e correções relevantes

### Estado, carregamento e confirmação

A primeira rodada isolou/restaurou a seleção anterior, cancelou aberturas e atualizações obsoletas, carregou o modelo completo antes de alterações, fechou modelos removidos e evitou reaproveitar dados antigos em erros. A paginação e a identificação dos modelos foram tratadas, assim como catálogos, cores, numeração e datas civis.

O fluxo compartilhado passou a aguardar arte e verso e a proteger geração e callbacks contra troca de contexto. A confirmação posterior à impressão mantém o destino original mesmo se o usuário mudar de tela. A persistência de status exige exatamente a linha esperada, com identidade e valor confirmados; resposta vazia, divergente ou com erro não produz sucesso visual nem prossegue para registrar combinação.

### Produto vazio ou com poucas opções

O usuário informou ausência de erro, campo parado em “Selecione um produto” e depois enviou imagem com apenas um produto. A causa exata do primeiro navegador não foi observada diretamente. Foi reproduzido um caminho em que a seção era mostrada/restaurada sem executar sua inicialização; a correção cobre esse caminho e o botão Atualizar.

Na segunda falha, a criação de modelos grava `status_producao=PENDENTE` com `status_impressao` nulo. O painel podia apresentá-los visualmente como Aguardando, enquanto Produção por Cor os excluía. A regressão sintética com 30 produtos e 60 modelos retornava somente um produto/modelo antes da correção; depois retornou os 30 produtos/60 modelos elegíveis. A normalização ficou restrita à página, sem migração de dados.

### Esclarecimento sobre “Ignorar”

Não foi demonstrada uma falha preexistente do filtro Ignorar nesta investigação. Houve uma mudança de interpretação de escopo na v915, posteriormente corrigida pela instrução explícita do usuário na v921. O contrato final respeita os pedidos ignorados conforme o painel. A falha preexistente de teste registrada abaixo é sobre versões de cache, não sobre Ignorar.

### Totais e ordenação das cores

Pedidos são deduplicados por número; cada modelo elegível conta uma vez; quantidades numéricas válidas, inclusive strings numéricas, compõem as unidades. Os testes cobrem dois modelos do mesmo pedido, exclusão de outros produtos/status, desempate alfabético e recálculo após mudança de status. A apresentação usa rótulos e números em português, com singular/plural.

### Formato e saída

O caminho normal de `enviarParaPedido` chama `showView('view-pedido')`, que executa `renderPedOSQueue` antes de `enviarParaImposicao`. Esse preparo resolve o código ERP `id_formato_num` para o ID interno de formato e aplica a saída padrão quando não existe uma salva. O caminho externo com `manterViewAtual` pulava essa etapa; podia usar um código numérico em um seletor de IDs internos e selecionar a primeira saída do catálogo.

A v923 chama o mesmo `renderPedOSQueue` no ramo externo antes de mover a janela. O teste de navegador executa as funções reais dos dois caminhos: antes, o externo retornava formato vazio/saída s2 em vez de f1/s1; depois, ambos coincidem para saída padrão, saída salva s2 e troca para outro produto com formato f2. As gravações automáticas existentes seguem o comportamento compartilhado; nos testes, integrações são simuladas e a rede é bloqueada.

## Validação registrada

| Etapa | Evidência |
| --- | --- |
| v914 | 139 testes aprovados e uma falha preexistente de cache; verificações adicionais de persistência Corrigir Arte e bandeja. 14/14 comparações públicas. |
| v915 | 77 testes e 23 cenários; 6/6 comparações públicas. |
| v919 | 78 testes e 24 cenários; regressão de inicialização falha no código anterior. 6/6 comparações públicas. |
| v920 | 78 testes e 25 cenários, incluindo 30 produtos/60 modelos. 6/6 comparações públicas. |
| v921 | 78 testes e 25 cenários. Primeiro comparativo público ainda desatualizado após deploy; conteúdo posteriormente validado nas entregas seguintes. |
| v922 | 78 testes e 26 cenários; 8/8 comparações públicas. |
| v923 | **85 testes** de Produção por Cor, janela do modelo e sintaxe; **7 testes** da fila do Pedido; **16 verificações** da bandeja. Todos aprovados. **10/10 comparações públicas** após propagação. |

Comandos da última validação funcional, usando o ambiente Python existente, sem instalar dependências:

```powershell
& 'C:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\venv\Scripts\python.exe' -m pytest -n 0 tests/test_producao_por_cor.py tests/test_janela_do_modelo.py tests/test_o_javascript_do_frontend_compila.py -q
& 'C:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\venv\Scripts\python.exe' -m pytest -n 0 tests/test_fila_do_pedido.py -q
node tests/bandeja_capa_miolo_harness.js
git diff --check
```

Falha conhecida fora do escopo: `tests/test_arte_de_impressao.py::test_a_versao_do_script_acompanha_as_outras` exige versões de cache iguais para todos os scripts. A base já tinha versões diferentes, enquanto o publicador atualiza os assets alterados. Nenhum teste foi desabilitado. A suíte completa não foi declarada aprovada.

## Publicação e evidência preservada

A autorização anterior “publicar” foi aplicada às correções solicitadas neste fluxo. A entrega usou `entrega-segura.ps1`, integração direta com proteção de fast-forward, tags e validação Cloudflare. Uma primeira divergência de hash logo após deploy não foi tratada como sucesso: aguardou-se propagação e repetiu-se a comparação.

Na v923, `index.html`, `cliente.html`, `controle.html`, `producao.html` e `pedido.js` coincidiram com os arquivos locais em `https://imposition.ai-ideal.com.br` e `https://imposicao.pages.dev`, com URLs contendo cache-buster. Foram comparados SHA-256 de texto normalizado quanto a BOM e finais de linha. As dez entradas com hashes e URLs estão em [evidência v923](evidencias/producao-por-cor-v923-public-verification.json), preservada do arquivo temporário gerado durante a verificação. A v922 já havia validado o JS da página e o CSS; a v923 alterou o preparo compartilhado em `pedido.js` e suas referências HTML.

Essas evidências comprovam os assets verificados naquele momento, não aceitação operacional pelo usuário, instalação de agente nem impressão física. Não houve build de MSI, migração remota ou teste com credenciais/dados reais nesta tarefa. A revisão documental de encerramento não altera a versão funcional v923.

## Estado de trabalho e recuperação

- Worktree da tarefa: `C:\ProjetosLocais\ideal-imposition-auditoria-cor-20260920`, branch `fix/producao-por-cor-20260920`. Estava limpo em v923 antes de adicionar este encerramento e a evidência.
- Checkout operacional: `C:\ProjetosLocais\ideal-imposition`. Na inspeção de encerramento, havia somente `.claude/settings.local.json` não rastreado; seu conteúdo não foi lido nem alterado. O estado mais antigo, muito modificado, não deve ser presumido como atual.
- Arquivos funcionais principais: `frontend/producao-por-cor.js`, `frontend/pedido.js`, `frontend/script.js`, `frontend/style.css` e referências de cache nos HTML. Regressões e documentos estão versionados nas entregas correspondentes.
- Não houve descarte de alterações, stash, reset destrutivo ou limpeza do checkout. Worktree não é backup independente; preservar os diretórios existentes.
- Se houver regressão, identificar primeiro a entrega e reproduzir com o harness correspondente. Preparar uma correção ou reversão pontual em branch isolada, preservando commits de outras sessões; não voltar todo o projeto para v913/v922 por conveniência. Uma nova publicação deve ter validação e prova pública próprias.

## Retomada

1. Conferir branch, status e evolução de `origin/main` antes de qualquer edição; ler este registro e os documentos específicos da falha.
2. Validar com o operador um produto/cor conhecido da fila de produção e comparar os mesmos modelos no painel normal e em Produção por Cor: formato, saída padrão, saída já salva e troca de modelo. A confirmação operacional da última correção ainda não foi recebida.
3. Conferir contagens por cor e retirada dos modelos após confirmação de impressão/status, respeitando a fila base e pedidos ignorados. Não ampliar novamente para todos os pedidos da base.
4. Se persistir divergência, registrar o exemplo mínimo e a etapa exata antes de alterar regras. Acesso a dados compartilhados e impressão real dependem do escopo autorizado; testes sintéticos e hashes não os substituem.

Nenhuma nova alteração funcional está em andamento ao encerrar esta sessão.
