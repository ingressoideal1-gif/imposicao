# Gerenciamento das estacoes — 07/10/2026

## Escopo

Autorizado pelo operador: corrigir e executar os controles de gerenciamento,
logs, acompanhamento da impressao, disco e relatorios. Fonte isolada de
`origin/main` 5d75d5ed; checkout operacional preservado.

Entrega inicial: NewProd 1.2.361, Piloto 1.2.361-piloto-local.28 e painel v1033.
Este registro distingue implementacao de comprovacao de instalacao/publicacao.

## Controles

- Gerenciar estacoes no menu administrativo, nas portas 9000/9001 e na web.
  A web consulta o inventario central; detalhes e comandos exigem a sessao
  administrativa da estacao. Consulta usa `perm_admin_view`, alteracoes usam
  `perm_admin_edit`, com auditoria de operador.
- Presenca independente do Piloto, sem habilitar consumo duplicado da fila
  remota. O seletor remoto exclui agentes com `recebe_fila_remota=false`.
- Fila Windows consultada a cada cinco segundos; identidade inclui impressora,
  ID e data para evitar confusao quando o Windows reutiliza IDs. Pausa/retomada
  exigem confirmacao e revalidacao. Nenhum cancelamento ou reenvio automatico.
- Diario SQLite persistente por canal, correlacionando tentativa, digest e ID
  Windows. Reinicio e desaparecimento do spool geram estado incerto. Sucesso
  HTTP ou desaparicao do arquivo de hotfolder nao comprovam papel impresso.
  Conferencia fisica e cancelamento registrado sao declaracoes do operador.
- Tentativas identificadas no painel nao sao reenviadas silenciosamente.
  Fallback de estrategia para quando o envio ao spool ja comecou.
- Logs continuam entre reinicios, com seis arquivos de ate 5 MiB, redacao de
  credenciais e extrato administrativo limitado. Eventos de erro extraidos do
  log sao agrupados em intervalos de dez segundos, nao um contador exato de
  todas as excecoes. Historico estruturado registra transicoes separadamente.
- Metricas de disco a cada cinco minutos, volumes fixos, caches, pacotes,
  versoes e temporarios. Alertas centrais usam menos de 10% ou 5 GiB livres.
- Limpeza limitada aos temporarios gerenciados abandonados ha 24 horas, com
  marcador valido e trava livre; previa e auditoria. Versoes de recuperacao,
  pacotes de pedidos, fontes e spool nao sao apagados por idade.
- Backup diario local de configuracoes e SQLite apos cinco minutos ociosos,
  cifra, snapshots SQLite e ensaio de leitura/hash. Backup manual disponivel.
  A chave DPAPI exige a mesma conta Windows; nao substitui backup portatil.
  Recuperacao: `NewProd.exe --restaurar-gestao arquivo.iib pasta-nova` (ou
  `NewProdPiloto.exe` no Piloto), sob a conta original. Confere cifra, inventario,
  caminhos e hashes antes de extrair; nao aplica sobre o runtime existente.
- Exportacao JSON/CSV, totais diarios por estado, eventos paginados, periodo
  1/7/30/90 dias. A consulta limita trabalhos a 500 (API ate 1000), metricas
  a 288 amostras e eventos por pagina. Registros de trabalho ficam persistidos;
  metricas e eventos encerrados possuem retencao de 90 dias. O inventario
  central recebe somente resumos dos ultimos 30 dias, sem logs/documentos.

## Recuperacao e validacao

Backup portatil inicial cifrado e ensaiado:
`C:\ProjectBackups\IdealImpositionProtegido\backup-20261007-073820-7396324a`.
SHA-256 do snapshot:
`aac08c98b67790847dd2a89158274bcebf6d69330f543f4db0def22f39d853de`.
Restauracao confirmou Git, 34 worktrees alterados, 202 arquivos nao rastreados
e 11 arquivos de runtime. A chave permanece fora do repositorio.

Testes sinteticos cobrem dois canais, navegador, autorizacao, redacao,
rotacao, idempotencia, spool reciclado, backup cifrado e historico. Nove falhas
antigas em `test_temp_manager.py` foram reproduzidas na base anterior.
Os contextos sinteticos foram atualizados com o canal e a dependencia de
mapas, sem alterar as verificacoes nem consultar banco real. A suite de
temporarios passa a integrar a conferencia obrigatoria dos dois canais.

Na instalacao, preservar a escolha de Junior: Piloto principal e original
disponivel para recuperacao. Preservar trabalhos Windows 4, 5, 6 e 9, que ja
existiam desde setembro. Nao confundir ociosidade do processamento NewProd
com fila vazia. A recuperacao usa o manifesto anterior e os atalhos/startup
salvos em `troca-principal-20261007-072947`.

## Limites operacionais

Estacoes desligadas nao recebem a versao nem fornecem telemetria nova.
O inventario central mostra o ultimo sinal, nao conexao permanente.
Controle remoto arbitrario, reinicio do Windows, exclusao geral de disco e
cancelamento coletivo de spool nao integram esta administracao.
Impressao fisica exige conferencia do operador; driver/RIP nao garantem isso.
Backup externo so pode ser considerado confirmado com prova de copia externa;
arquivo no Drive Desktop nao comprova sincronizacao na nuvem.

## Evidencias da entrega

- PR 109 integrado em `1406c800e85c4e399b31435a75e6f99ebf93bb2e`, tag `v1033`.
  Fonte dos executaveis: `3ddb98cd061e77b29840f0e4270f508b5e164e35`.
- Checks dos dois canais, consulta autenticada e seguranca/recuperacao passaram
  no workflow `37613523486`. A suite comum inclui os 26 testes de temporarios.
- Cloudflare Pages: `56abec98-ffc7-43a9-9657-287d42f226ba`.
  Os quatro arquivos alterados conferiram por hash normalizado nos dois
  dominios publicos, oito verificacoes apos propagacao.
- MSI `NewProd_Setup_v1.2.361.msi`: ProductVersion `1.2.361.0`, 153616384 bytes,
  SHA-256 `d54b04c7b6aada7279057ad192b044008088cf9823c07a02ffe4fb4584a090f2`.
  Download publico conferido antes de ativar `latest.json` em 07/10, 08:31 BRT.
- Junior/9000: MSI retornou zero; executavel
  `c5bf4bbcb1aed9cd238f4e74acc1cfba666e67516e1751416d30e32c17c9ba95`.
- Junior/9001: executavel
  `5a66656f7a121f0cd222bab6dfb11317becdf4e3fc29cb595e455a1db9f55de6`.
  Manifesto anterior preservado em
  `%LOCALAPPDATA%\NewProd Piloto\gestao\instalacao-20261007-082417`.
- As duas portas retornam as versoes novas; os quatro arquivos de cada painel
  conferem com a fonte, incluindo somente as injecoes previstas da identidade
  visual do Piloto. Rotas administrativas sem sessao retornaram HTTP 401.
- O painel padrao havia sincronizado a versao web anterior durante a entrega.
  Foi atualizado com os quatro arquivos ja conferidos publicamente, mantendo
  copia anterior em `C:\ProjectBackups\IdealImpositionProtegido\painel-gestao-20261007`.
- Backups locais reais dos dois canais foram cifrados e restaurados em pasta
  separada antes da instalacao. A recuperacao pelo executavel instalado tambem
  retornou zero e restaurou dez entradas, sem aplicar sobre a estacao.
- Backup automatico do Piloto confirmado as 08:20:36 e do padrao as 08:28:32,
  ambos verificados. A consulta remota vazia nao reinicia mais a ociosidade.
- Backup completo agendado teve resultado zero em 06/10 as 20:00. O snapshot
  inicial desta tarefa foi copiado ao Drive Desktop e comparado por hash;
  nao foi declarada prova de sincronizacao na nuvem.
- Junior continua com apenas `NewProdPiloto` no inicio automatico; atalhos
  principais usam o inicializador que valida o manifesto/hash. Coleta retomada.
  Spool 4/5/6/9 preservado com mesmos tamanhos. Nenhuma impressao real executada.
- Nao havia temporarios gerenciados elegiveis para limpeza na inspecao dos
  dois canais. A rotina automatica e a limpeza manual respeitam idade/travas.

A propagacao nas outras estacoes e conferida por `last_seen`, versao e estado
da gestao, sem presumir instalacao apenas porque o manifesto foi publicado.
O mecanismo existente consulta atualizacoes a cada 30 minutos e adia quando
ha producao. Evidencias locais desta entrega ficam nos arquivos `tmp_*` do
worktree de gestao; este complemento documental nao republica a aplicacao.

## Correcao dos periodos — 1.2.362 / Piloto .29

A conferencia com evento sintetico anterior ao corte reproduziu inclusao
indevida no total de 24 horas. A causa era comparar texto ISO (`T` e fuso) com
o texto retornado por `datetime` do SQLite. Consultas e retencao passam a
comparar instantes com `julianday`, sem alterar dados existentes ou remover
trabalhos pendentes. A regressao confirma a exclusao do evento fora do periodo.
O MSI 1.2.361 permanece imutavel; a correcao usa novo pacote 1.2.362 e Piloto
1.2.362-piloto-local.29. O frontend continua v1033.
