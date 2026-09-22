# Navegação, F5 e histórico — 22/09/2026

Entrega local, sem commit, push, deploy, migração ou atualização do agente.

Publicação autorizada posteriormente pelo usuário. A validação oficial `entrega-segura.ps1 verificar -Escopo Frontend` passou. A tentativa com `publicar -Escopo Frontend -Integracao Direta -Sim` parou em `git fetch origin --prune`: `Could not resolve host: github.com`. Consultas DNS de GitHub e do domínio público também falharam. Estado: `FALHA_ANTES_DA_PUBLICACAO`, sem efeitos remotos. Não foi atribuída versão de release. Retomar o mesmo comando quando a resolução DNS estiver disponível; a autorização de publicação deste escopo permanece válida.

Base: referência local `origin/main`, commit `f079552e` (v935). Não houve fetch nem verificação da versão pública nesta tarefa. Trabalho em `C:\ProjetosLocais\ideal-imposition-navegacao`, branch `fix/navegacao-historico-20260922`. O checkout operacional `C:\ProjetosLocais\ideal-imposition` e seus três arquivos não rastreados permaneceram intactos.

## Comportamento

- O painel registra tela e identificadores em `history.state`, por entrada e por aba. Nenhum caminho, parâmetro ou fragmento do endereço é reescrito pelo módulo do painel.
- F5 restaura a posição depois da identificação/permissões; detalhes esperam os catálogos. Uma visita nova a `/pedido/<numero>` continua abrindo o pedido. F5 depois de navegar para outra tela nesse endereço respeita a posição mais recente.
- Voltar/Avançar restauram sem empilhar entradas novas. Reabrir o mesmo destino não duplica a entrada. O histórico interno não impede sair pelo Voltar depois que suas entradas acabam.
- O pedido e o modelo são validados antes da restauração. Modelo ausente não é substituído pelo primeiro item. As respostas antigas deixam de navegar quando outra ação as invalida.
- A restauração de modelo bloqueia a impressão durante sua preparação e não persiste os campos derivados de matching, eventos de seletores ou padrões das filas. A abertura normal conserva as gravações existentes. Uma geração já em andamento impede a troca de contexto pelo Voltar.
- Formatos, Cores e Numerações passam pela navegação compartilhada, incluindo as antigas trocas diretas de classes. IDs de cadastro são registrados antes de abrir o editor.
- O portal usa entradas por aba, preserva caminho/token/query e mantém a aba visitada no F5. O encaminhamento para a próxima etapa pendente continua na primeira abertura do link. Voltar/Avançar não executam confirmações, pagamentos ou reenvios.
- O retorno de login externo guarda somente a rota e a identidade de navegação nesta aba, por até dez minutos e uso único; não guarda tokens do login. O login real no provedor não foi exercitado.

## Limites deliberados

O histórico não é recuperação de rascunhos. PDFs escolhidos, alterações não salvas, seleção combinada e escolhas temporárias de impressão não são serializados. A tela de Imposição avulsa volta como tela; não se reconstrói um trabalho de impressão por seus IDs.

Uma edição contextual de numeração de modelo exige reabertura pelo pedido após restauração. A aplicação limpa o vínculo incompleto e informa essa necessidade, para não transformar a base em edição comum. IDs de cadastros salvos e pedidos/modelos existentes têm restauração específica.

Não houve teste com banco real, PDFs reais, login externo real ou estação de produção. Os testes de navegador executam o módulo e funções reais de navegação com dados e serviços simulados; não representam um ensaio integral de todas as telas com o backend ativo. Geração/impressão física e instalação NewProd não foram executadas.

## Arquivos

- `frontend/navegacao-painel.js`: histórico, restauração, identidade, cancelamento e leitura sem gravação.
- `frontend/index.html`: carga do módulo antes de `script.js`.
- `frontend/script.js`: inicialização, navegação, editores e guardas de restauração.
- `frontend/pedido.js`: modelo exato, tarefas canceláveis e renderização sem gravação durante restauração.
- `frontend/cliente-shell.js`: histórico das abas do portal.
- `tests/navegacao_browser_harness.js`, `tests/navegacao_seguranca_harness.js`: regressões novas.
- Três harnesses existentes ajustados: domínio do cliente, cópia de links e pendências do portal.

As sete funções `gerarLinkCliente`, `getOrCreateLinkCliente`, `memorizarLinkCliente`, `buscarLinkClienteAtivo`, `linkDiretoDoPedido`, `pedidoDoLinkDireto` e `prepararLinkDaArtePronta` foram comparadas e continuam idênticas à base. Regras de reescrita de URLs, SQL, APIs e dependências não foram alteradas.

## Evidências locais

| Verificação | Resultado |
|---|---|
| Navegador Chromium: F5, Voltar/Avançar, links, concorrência, permissões, contas, abas, portal, retorno de login simulado e erros | 19 cenários aprovados |
| Restauração com rotinas reais e persistência simulada | 5 regressões aprovadas |
| Links diretos de pedido | 59 verificações aprovadas |
| Geração e cópia de links | 22 casos aprovados |
| Domínio público e reutilização/criação de token | Aprovado com origens e respostas sintéticas |
| Abas do portal | 146 verificações aprovadas |
| Pendências do portal | 53 verificações aprovadas |
| Grade de acesso local | 69 casos aprovados |
| Fila do Pedido em Chromium | 52 verificações aprovadas |
| Janela de modelo em Chromium | 24 verificações aprovadas |
| Sintaxe JavaScript | 75 arquivos do frontend aprovados |
| Whitespace | `git diff --check` aprovado |

Dois harnesses de links já falhavam na base sem alteração: um não simulava `lerDadosLista`; outro exigia textualmente a carga bloqueante anterior da Lista de Arte. A simulação foi completada e o teste de agendamento passou a executar o agendador atual, verificando uma única geração concorrente. O teste de pendências do portal foi atualizado para distinguir a primeira visita da restauração; os testes das regras das etapas permaneceram.

Comandos principais, a partir deste checkout:

```powershell
$env:NODE_PATH = 'C:\ProjetosLocais\ideal-imposition\node_modules'
node tests/navegacao_browser_harness.js
node tests/navegacao_seguranca_harness.js
node tests/link_do_pedido_harness.js
node tests/link_cliente_copia_harness.js
node tests/dominio_cliente_harness.js
node tests/portal_abas_harness.js
node tests/portal_pendencia_harness.js
node tests/grade_do_acesso_local_harness.js
node tests/fila_do_pedido_harness.js
git diff --check
```

Puppeteer foi reutilizado de dependências já instaladas, sem instalação nem mudança de lockfile. O harness antigo da janela usa caminho absoluto de dependência; foi executado com resolução desse caminho para o Puppeteer existente, sem modificar o teste.

## Continuidade

Retomar neste worktree para revisão e eventual publicação autorizada. Antes de publicar, integrar apenas este escopo sobre a base de entrega vigente, atualizar as versões dos assets pelo fluxo do projeto e validar os arquivos públicos após propagação. Nada foi copiado para `painel/` nem empacotado no agente. A versão operacional permanece disponível e inalterada.
