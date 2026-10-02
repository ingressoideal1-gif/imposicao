# Filas de Produção e Acabamento — 02/10/2026

## Problema e comportamento corrigido

O NewProd local v995 carregava a base completa ao abrir Produção ou Acabamento. Com 4.744 propostas concluídas sintéticas, a carga montava 4.752 pedidos e aguardava 48 lotes de prazos e 24 de modelos para mostrar dois pedidos de trabalho.

Os dois painéis agora descobrem a fila pelos estados de trabalho já definidos em `SINAIS_NA_GRAFICA` e carregam produtos, prazos e modelos desses números. O mesmo cenário monta somente os dois pedidos ativos, inclusive o retorno em EM ACABAMENTO sem produto. A consulta de produtos é paginada e não perde o produto 501 de um mesmo pedido. Fila vazia é um resultado válido, sem fallback para o histórico.

Impresso solicita a base completa quando acionado. Expedição solicita os estados posteriores à gráfica, preservando pedidos antigos entregues, inclusive sem produto. Pesquisa numérica consulta um pedido; pesquisa textual mantém o acesso à base completa. Limpar a pesquisa ou voltar à fila recupera o recorte ativo. Os filtros, regras de impressão, quantidades e persistência permanecem os existentes.

O estado de carregamento/erro/retry aparece no painel aberto. Os estágios do acabamento usam até três lotes simultâneos e timeout de leitura, preservam o mapa anterior na falha e descartam respostas de outro recorte. Se a fila mudar durante a leitura, a consulta dos estágios faltantes é retomada. Erro de rede oferece atualização; o aviso de configuração do banco continua reservado à falta de coluna.

## Preparação e escopo

Worktree isolada `C:\ProjetosLocais\ideal-imposition-filas-producao-acabamento-20261002`, branch `fix/filas-producao-acabamento-20261002`, criada de `origin/main` v995 (`a407bd43`) após fetch. Checkout operacional antigo e seus arquivos preexistentes preservados.

Alteração somente no frontend, com testes e este registro. Sem instalação de dependências, mudança de SQL, Edge Functions, motor, permissões ou configuração secreta. Os testes usam dados sintéticos e serviços simulados; a inspeção do NewProd acessa arquivos estáticos locais.

## Validação

- 93 verificações de recorte, histórico, pesquisa, paginação, fila vazia, erro, concorrência e preservação de modelos completos, com 4.744 concluídos sintéticos.
- 10 verificações específicas da carga de acabamento: 601 modelos, máximo de três leituras simultâneas, timeout de 30 segundos, retry, resposta tardia e troca da fila durante leitura.
- 847 verificações do Painel do Acabamento; 65 de histórico; 88 de entrada dos pedidos; 52 da fila do Pedido; 17 da estação sem sessão.
- Chromium: avisos e retry nos três painéis; testes existentes de título (9 verificações) e seleção de volumes (42). O teste de volumes passou após aguardar a carga inicial real antes de semear a fixture, impedindo que um rollback tardio apagasse dados sintéticos.
- Sintaxe JavaScript e revisão do diff. A suíte Python focalizada inclui todos os arquivos próprios de JavaScript do frontend.
- Resultado final da suíte Python focalizada: 157 passaram e três falharam, exatamente as verificações estáticas preexistentes descritas abaixo. A simulação de `entrega-segura.ps1` terminou em `VALIDADA`, com todos os harnesses declarados aprovados e cache planejado em v996.
- Três verificações estáticas antigas falham também na worktree intacta de v995: uma exige a assinatura antiga de `carregarLinksExistentes()`; duas exigem a assinatura antiga de `renderPedOSQueue()`. As verificações funcionais correspondentes em Node passam. Esses testes não foram desabilitados nem alterados nesta entrega.

O venv indicado pelo checkout operacional não existe. Foi usado o venv já instalado no checkout legado; Puppeteer usa as dependências existentes por `NODE_PATH` e junction local ignorada pelo Git.

## Entrega e recuperação

A publicação por `entrega-segura.ps1` terminou em `PUBLICADA_E_VERIFICADA`: código `d682d97f1c80974f29a026f849e8863b51cf4636`, tag `v996`, deployment Cloudflare `17ec859f-e3bc-41aa-8a8a-26fd95f37aad`. A integração direta foi autorizada por “entrega segura”. Os quatro assets afetados (`index.html`, `producao.html`, `script.js`, `acabamento.js`) conferem nos dois domínios, com cache-buster e hashes normalizados: 8/8.

O painel deste NewProd também foi atualizado. Antes da cópia, os quatro arquivos locais foram comparados com a base v995 e guardados em `C:\Users\Junior\AppData\Local\NewProd Agent\backup-painel-antes-v996-20261002`, com hashes do backup conferidos. Foram atualizados somente esses quatro assets em `C:\Users\Junior\AppData\Local\NewProd Agent\painel`, preservando o executável e as demais configurações. Os arquivos efetivamente servidos em `127.0.0.1:9000` conferem com a versão validada: 4/4.

Hashes e metadados estão na [evidência da entrega](evidencia-publicacao-2026-10-02-filas-v996.json). O backup é a recuperação local dos quatro assets; a base v995 é a referência para um revert seletivo publicado pelo mesmo fluxo. Não restaurar a pasta inteira do programa nem o checkout operacional antigo.

Instalação MSI, autenticação de um operador, abertura com dados reais, ganho de tempo na estação afetada e impressão física não são comprovados pelos testes sintéticos nem pelos hashes. Recarregar o navegador após a atualização e medir a abertura operacional para confirmar a duração real.
