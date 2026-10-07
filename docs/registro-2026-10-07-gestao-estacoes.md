# Gerenciamento das estacoes — 07/10/2026

## Escopo

Autorizado pelo operador: corrigir e executar os controles de gerenciamento,
logs, acompanhamento da impressao, disco e relatorios. Fonte isolada de
`origin/main` 5d75d5ed; checkout operacional preservado.

Entrega prevista: NewProd 1.2.361, Piloto 1.2.361-piloto-local.28 e painel v1033.
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
