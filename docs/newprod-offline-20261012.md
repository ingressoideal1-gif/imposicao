# NewProd: operação offline — 12/10/2026

## Problema e escopo

No Junior .384, desligar a internet impedia abrir pedidos. A abertura exigia conferência remota e a geração consultava modelos, numerações, bancos, formatos e saídas na nuvem. Bibliotecas do painel também vinham de CDNs.

A versão de teste .385 prepara o fluxo de produção local: lista, abertura, conferência, geração, três modos de impressão e confirmação posterior pelo operador. O banco remoto e o ERP continuam indisponíveis sem conexão; suas alterações só chegam na reconexão. Não cria pedidos ou reservas de QR offline.

## Implementação

- `offline_estacao.py`: preparação de snapshots v2 sem navegador, catálogos, dependências de fontes com hash e filas SQLite para confirmações/faixas. O agente precisa continuar ativo na bandeja e o Windows conectado.
- `coleta_autonoma.py`: preparação respeita pausa/ocupação; até três pedidos por rodada, intervalo mínimo de cinco minutos por pedido. Confirmações são tentadas em segundo plano. Falhas de sincronização conservam os registros.
- `selecao_piloto.py`/`revisao_pedido_piloto.py`: em falha de transporte, usa a última revisão completa e confere os arquivos locais. Recusa HTTP, autorização, TLS inválido e revisão conhecida como alterada não liberam cópia antiga. Upgrade exige uma primeira preparação online com schema 1.
- `frontend/offline-estacao.js`: lista/catálogos locais, conferência do trabalho e confirmação persistente. Mostra quantidade preparada e confirmações pendentes/conflitantes. A cópia completa é condição para uso offline.
- `arte-de-impressao.js`: preserva comparações de integridade e regras de numeração usando a revisão local, inclusive bancos. Não remove validações.
- `motor_piloto.py`: usa recursos do pacote e dependências locais verificadas; recurso ausente não é silenciosamente substituído por download.
- `frontend/vendor/offline`: PDF.js/worker, Fabric, JSZip, QR e Inter locais. Origem e hashes registrados junto dos arquivos; nenhuma dependência npm mudou.
- `piloto-local`: catálogos autorizados e confirmação remota idempotente. Confere empresa/permissões, pedido/revisão, modelos elegíveis, estado e timestamp observados; releitura antes do reconhecimento. Divergência fica pendente de revisão, sem sobrescrever silenciosamente nem reimprimir.

As três saídas existentes e os limites de blocos/folhas GDI permanecem. Enviar ao spool não confirma impressão física. A confirmação comercial exige a ação do operador; a reconexão só sincroniza dados e jamais reenfileira impressão.
QR usa contratos/pools previamente provisionados. Fontes, artes e fotos devem estar preparadas antes da perda de conexão. Corrupção e ausência são recusadas.

## Evidências

- 114 testes Python combinados de abertura, revisão, coleta, motor, integridade, QR e persistência passaram; mais uma regressão de IDs numéricos da fila de faixas passou na execução específica (8 testes).
- 11 testes Deno passaram, com transporte/banco simulados.
- Chromium: 66 verificações de integridade; harness offline carrega a função real de montagem de lista, catálogos, conferência, confirmação/reabertura e PDF.js com worker, sem nenhuma requisição externa.
- Harness de impressão preserva três modos, capas/miolo, configuração e GDI por blocos/folhas. Não foi enviado trabalho físico durante estes testes.
- `piloto-local` publicado no projeto `vwbtitjlpelrcnsytzqw`. Consulta autorizada somente leitura pelo Junior retornou HTTP 200: 31 formatos, 26 saídas, 58 cores e 4 modelos de imposição. Nenhum pedido foi marcado impresso no teste.
- Aviso preexistente: depreciação Starlette/httpx. Sem instalação de dependências.

## Entrega e validação da estação

MSI alvo: `NewProdPiloto_Teste_v1.2.385.msi`. O pacote passa pelo verificador de ausência de arquivos privados/segredos. Instalação deve usar o preservador MSI, com agente encerrado pelo ícone da bandeja e spool conferido antes/depois.

Na última consulta, Junior ainda executava .384 e o spool estava vazio. Instalação, download público e ativação de manifesto precisam ter evidências próprias; build não comprova esses passos. Registrar o resultado da entrega abaixo. Não houve desligamento da rede do Windows nem impressão física.

Aceite operacional: aguardar pedidos preparados, abrir um pedido com internet, desconectar a internet preservando a rede da impressora, reabrir/gerar/imprimir uma vez, confirmar apenas após conferir o papel, reconectar e verificar a fila de sincronização. Não repetir impressão apenas porque a confirmação está pendente.

## Artefato conferido

- MSI público: https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/agent-releases/NewProdPiloto_Teste_v1.2.385.msi
- ProductVersion lido do MSI: `1.2.385`.
- Tamanho: `196423680` bytes.
- SHA-256: `dedd8604305cb2f99e70542b08a842635995b9a0c680627cad3b26a0b7aff8a8`.
- Download público integral conferido; conteúdo do painel no executável comparado com as fontes, incluindo o worker PDF e as bibliotecas locais.
- Manifesto de teste permanece `.384`: pacote `.385` disponível, ainda sem ativação automática. Manifestos estáveis não foram alterados.
- Mais 7 testes Deno de identidade/vínculo de estação e 6 testes de rotas locais passaram, incluindo confirmação sem permissão, origem externa e revisão divergente.
- Junior ainda responde `NewProd 1.2.384-teste.1`. Solicitada saída pelo ícone da bandeja para instalar; nenhuma parada forçada nem alteração de fila realizada. A instalação e o aceite operacional continuam pendentes dessa saída.

## Instalação concluída no Junior

Após confirmação do operador de saída pelo ícone da bandeja:

- Porta 9001 fechada e processos NewProd encerrados antes da troca; spool vazio.
- MSI executado na conta habitual, retorno `0`.
- Backup cifrado do preservador: `runtime-20261012T142503Z-2c7e6f8d.iib` em `%LOCALAPPDATA%/NewProd Agent/gestao/backups`.
- Executável instalado com hash idêntico ao executável do build. Cinco configurações mantiveram os mesmos hashes anteriores.
- Agente reiniciado normalmente com `--background`; `/api/version` respondeu `NewProd 1.2.385-teste.1`, canal piloto.
- `script.js`, `arte-de-impressao.js`, PDF.js e worker servidos por HTTP coincidem com os arquivos novos; módulo `PilotoOffline` presente na injeção local.
- Preparação automática iniciou sem navegador: 3 snapshots schema 1 completos e catálogo offline persistido na primeira conferência; pausa local `0`.
- Spool continuou vazio. Nenhum trabalho foi enviado como parte da instalação.
- Manifesto automático das demais estações permanece inalterado. A validação física de impressão sem internet não foi realizada nesta instalação; aguardar preparação completa do pedido antes do aceite operacional.
