# Navegação, F5 e histórico — 22/09/2026

Frontend publicado e verificado como **v936**, commit `06fbe57c7bfead0e5e81c99ea2ccd17bd346e915`, presente em `origin/main` e na tag anotada `v936`.

A publicação autorizada foi executada pelo fluxo `entrega-segura.ps1 publicar -Escopo Frontend -Integracao Direta -Sim`, com testes antes e depois do versionamento dos assets. Cloudflare Pages confirmou sucesso no deploy `95613e81-dbf8-4dec-91a6-864eb8dad9e8`.

A resolução DNS padrão do Windows falhou. Consultar diretamente o DNS já configurado (`192.168.1.1`) funcionou; Git e consultas HTTPS usaram resolução restrita ao processo, mantendo a validação TLS. A tentativa de ajuste do DNS da interface foi negada por permissão administrativa e não alterou a configuração. VPN, rotas e arquivo hosts não foram modificados. O DNS padrão do Windows permanece pendente de correção administrativa.

O verificador HTTP interno do fluxo falhou por DNS depois da integração; por isso, sua saída foi `FALHA_APOS_INTEGRACAO`. A comprovação pública foi concluída separadamente com curl, resolução direta, acompanhamento dos redirecionamentos HTTPS e parâmetros únicos contra cache. Os oito arquivos frontend alterados coincidiram por SHA-256 de texto normalizado nos dois domínios: `imposition.ai-ideal.com.br` e `imposicao.pages.dev`. Resultado: **ALL_MATCH=True, 16 comparações**, em 22/09/2026. Evidência detalhada local: `%TEMP%\ideal-v936-verificacao-publica.json`. Uma primeira consulta sem acompanhar redirecionamentos recebeu 308 nos HTML secundários; a verificação final acompanhou esses redirecionamentos.

Base: `f079552e` (v935), confirmada por fetch antes da publicação. Trabalho em `C:\ProjetosLocais\ideal-imposition-navegacao`, branch `fix/navegacao-historico-20260922`. O checkout operacional `C:\ProjetosLocais\ideal-imposition` e seus três arquivos não rastreados permaneceram intactos.

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

Publicação web concluída e verificada. Este fechamento documental permanece local no worktree de navegação. Nada foi copiado para `painel/` nem empacotado no agente. A validação real com login externo, dados operacionais e impressão permanece fora da comprovação desta entrega. Para eventual recuperação, preparar reversão revisável do commit v936 pelo fluxo de publicação, sem reset ou push forçado. Retomar neste worktree; não alinhar automaticamente o checkout operacional.
