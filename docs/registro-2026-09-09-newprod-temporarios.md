# NewProd: gerenciamento de temporários e diagnóstico por estação

## Pedido e estado da entrega

O usuário apresentou uma imagem do Windows com 78,2 GB classificados como
temporários e 13,6 MB livres em C:, pediu análise das estações e indicou Laser 01.
Não há acesso à Laser 01 nesta sessão; o usuário também informou não ter acesso
à estação. A foto não identifica quais arquivos ou programas ocupam esse espaço.
Foi solicitada uma atualização do NewProd para gerenciar temporários.

Implementação local, sem build, instalação, alteração de versão, commit, publicação,
consulta a banco compartilhado ou limpeza de arquivos reais. O workspace já tinha
alterações em `app.py`, `engine.py` e outros arquivos; elas foram preservadas.
Cópias dos arquivos antes desta tarefa estão em `tmp-newprod-temporarios-baseline/`,
diretório local ignorado pelo Git. Não usar a restauração integral desses arquivos
como rollback de uma futura versão: ela descartaria alterações posteriores.

## Política implementada

- Novas entradas e saídas de imposição, PDFs recebidos para impressão e arquivos
  baixados pela fila ficam em `%LOCALAPPDATA%\NewProd Agent\temporarios\v1\job-<uuid>`.
  Sem LOCALAPPDATA, a base é a pasta temporária do sistema.
- Cada trabalho mantém uma trava de arquivo do sistema operacional. Pastas distintas
  impedem colisão entre pedidos com o mesmo nome de PDF.
- Ao terminar, inclusive em falhas, o trabalho tenta excluir seus arquivos. A limpeza
  não depende das tarefas de background da resposta HTTP. No streaming, a thread do
  motor mantém a posse até terminar; desconectar não apaga os insumos em uso.
- O produtor deixa de enfileirar PDFs para um cliente desconectado. O processamento
  já iniciado pode continuar até o fim; esta mudança não altera a regra de cancelamento.
- Fontes embutidas são gravadas uma vez por conteúdo dentro de cada motor e reutilizadas.
  Ao sair de `process()`, os arquivos e os caches de métricas correspondentes são liberados.
  Isso corrige a criação anterior de um `tmp*.ttf` por uso, sem exclusão posterior.
- Conversões auxiliares de ICC e PostScript acompanham o diretório da entrada quando
  ela pertence a um trabalho gerenciado. Chamadas externas com arquivos comuns mantêm
  o diretório temporário padrão e a responsabilidade de limpeza do chamador.
- Na inicialização e aproximadamente a cada hora, a manutenção tenta recuperar
  trabalhos abandonados há pelo menos 24 horas. Exige nome válido, marcador reconhecido,
  localização direta na raiz validada e obtenção da trava. Um trabalho ativo permanece
  protegido mesmo depois de 24 horas. Bloqueios de arquivo deixam sobras para nova tentativa.
- A exclusão aceita apenas arquivos regulares diretamente dentro do trabalho. Recusa
  links, junctions, outros reparse points e subpastas inesperadas. Não usa remoção recursiva.

## Diagnóstico remoto

Uma thread separada mede, aproximadamente a cada cinco minutos:

- espaço livre e total no volume que contém `%TEMP%`, com indicador de menos de 2 GiB livres;
- tamanho e contagem dos temporários gerenciados;
- tamanho do TEMP do usuário e categorias agregadas: fontes `tmp*.ttf`, PDFs, pacotes
  `_MEI` e outros arquivos;
- volume com mais de 7 e 30 dias, conforme a última modificação;
- caches de fontes e fotos;
- resultado e horário da última recuperação de trabalhos abandonados.

O heartbeat usa somente a última fotografia em memória, sem varrer o disco no envio.
O objeto `printers_json.armazenamento` aproveita o contrato JSON existente; não foi
adicionada coluna ou migração. A leitura em `ferramentas/estacoes.py` mostra os valores
e o horário UTC da coleta. Agentes antigos aparecem como “ainda não informado”.
Falha de coleta é explícita e não divulga o texto da exceção ou caminhos pessoais.

A varredura de cada área tem limite de 100.000 entradas ou cinco segundos. Erros ou
limites produzem `parcial: true`; a conferência apresenta o tamanho como limite inferior
(`>=`). Links são ignorados. Os números são tamanhos lógicos, podem variar durante a
coleta e não equivalem ao espaço físico recuperável. As áreas podem se sobrepor em
configurações personalizadas de TEMP; não somar seus tamanhos automaticamente.

## Limites e acúmulo anterior

TEMP geral é somente leitura. A atualização não exclui `tmp*.ttf`, PDFs antigos,
pastas `_MEI`, instaladores antigos ou qualquer arquivo fora da raiz gerenciada.
Nome e extensão não comprovam origem. Os caches persistentes de fontes e fotos
também são preservados para reutilização e operação offline.

Não são medidos Windows Update, Lixeira, Downloads, spool de impressão, TEMP de
outros usuários ou Windows Temp pela telemetria do agente. A categoria “Arquivos
temporários” da tela de Armazenamento do Windows pode incluir essas outras áreas.
Portanto, os 78,2 GB da foto continuam sem diagnóstico confirmado e esta atualização
não promete recuperá-los automaticamente.

O coletor manual `ferramentas/analisar_temporarios.ps1`, preparado na etapa anterior,
continua disponível quando houver alguém na estação. Ele inclui Windows Temp,
registra falta de permissão e não exclui arquivos.

## Validação

Testes novos usam diretórios e PDFs sintéticos, impressoras e chamadas ao heartbeat
simuladas. As funções dos endpoints são compiladas a partir da AST do código real,
sem importar `app.py`/`db.py`/`agent_worker.py`, evitando inicialização de serviços,
leitura de credenciais e acesso à nuvem.

Cobertura: isolamento de nomes, erro de impressão, download incompleto, trava
entre processos, recuperação após encerramento, falha de exclusão, idade mínima,
marcador inválido, junction/link, nome com caminho/ADS/dispositivo Windows, métricas
parciais, heartbeat, falha da thread de coleta, streaming interrompido antes/depois
do primeiro evento, reutilização de fontes e conversões ICC/PostScript.

A regressão de motor rodou em `tmp-newprod-temporarios-testes/`, com PDF base sintético,
raiz de temporários substituída e rede externa bloqueada. Foram verificados os testes
de recorte, entrega por blocos, nomes de fonte, ajuste, largura e altura dos textos.
Na primeira passagem, o bloqueio de rede também impediu o socketpair local do asyncio
no Windows; o harness foi corrigido para permitir apenas loopback. O teste de altura
criava um motor sem executar o construtor; passou a usar a inicialização real e liberar
as fontes no final, mantendo todas as verificações visuais originais.

Resultados: 117 testes passaram na regressão principal. Após incluir conversões
auxiliares e interrupção antes do primeiro evento, a suíte específica foi ampliada
para 25 testes, todos aprovados. As contagens se sobrepõem: a regressão principal
incluiu a versão anterior dessa suíte específica. Sintaxe Python e revisão de
whitespace também passaram.
Não houve impressão física, execução contra estações ou teste do MSI empacotado.

## Entrega externa e recuperação

Após a entrega local, o usuário autorizou publicar. O release foi preparado no
worktree `../newprod-temporarios-1327`, branch `release/newprod-temporarios-1.2.327`,
a partir de `origin/main` em `51952cfe`. Somente o diff desta tarefa contra as
cópias anteriores foi aplicado. O `agent_tray.spec` inclui `newprod_temp`.

Depois da instalação, confirmar na Laser 01 a versão e a data de coleta; comparar
espaço livre, categorias do TEMP e caches antes de propor limpeza do acúmulo antigo.
Com tão pouco espaço quanto o mostrado na foto, o download ou a instalação podem
falhar antes de a nova telemetria chegar; isso exige liberar espaço por um acesso
operacional disponível, sem assumir que a atualização já foi recebida.

Para interromper a política numa versão posterior, retirar a chamada de manutenção
e preservar as pastas existentes para inspeção. Uma reversão distribuída deve seguir
o fluxo normal de release com versão superior; não diminuir o manifesto. Arquivos
temporários efetivamente excluídos não têm backup; entradas originais, arquivos
baixados pelo usuário e materiais entregues ao destino não são alvos desta política.

## Preparação do release 1.2.327

- Manifesto público anterior conferido em **1.2.326**. Os três arquivos de versão
  foram sincronizados em **1.2.327**; ProductVersion do MSI: **1.2.327.0**.
- **120 testes passaram** na base atual de produção, com dados sintéticos e
  conexões externas bloqueadas. Nenhum serviço real foi iniciado para testar.
- PyInstaller **6.20.0** e Python **3.14.5** do ambiente existente; WiX já disponível.
  Ferramentas chamadas diretamente no worktree, sem executar os scripts que mudam
  o diretório para o checkout original. Nenhuma dependência foi instalada.
- MSI: `dist/NewProd_Setup_v1.2.327.msi`, **74.596.352 bytes**.
- SHA-256: `a1cf9c9fbc04244896b576af582d59448b87fd0342d316d8b2a2f5e5707f0f1d`.
- Código compilado de `newprod_temp`, `engine`, `app`, `agent_worker`, `print_service`,
  `color_profiles`, `db`, `security_config` e `agent_version` comparado com as fontes.
  DLLs de impressão, credencial restrita e seis arquivos do frontend embutido conferidos.
- Pool e credencial restrita preparados pelo fluxo existente, sem expor conteúdo;
  nenhum `.env` ou chave de serviço foi copiado para o worktree ou para o pacote.
- Revisão de diff, whitespace e segredos nos 15 arquivos da entrega concluída.
- Distribuição no bucket existente `agent-releases`: upload sem sobrescrita,
  download público com tamanho/hash, seguido da ativação de `latest.json`.

Instalação e medição da Laser 01 continuam pendentes. Publicação do manifesto não
comprova que a estação recebeu a versão. Rollback exige versão superior a 1.2.327.
