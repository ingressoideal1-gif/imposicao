# NewProd Piloto como produto oficial

Decisao humana de 07/10/2026: descontinuar o NewProd anterior e substitui-lo
pelo NewProd Piloto. Nao manter dois produtos operacionais apos a migracao.
As autorizacoes anteriores para correcao, gerenciamento e entrega permanecem
no escopo. Este documento registra a decisao; nao comprova implantacao.

## Contrato da transicao

- Preservar identidade da estacao usada pelas filas, impressoras, configuracoes,
  dados protegidos, pedidos preparados, historico e trabalhos do Windows.
- Impedir dois consumidores da mesma fila. Transferir a responsabilidade para
  o novo produto antes de retirar o inicio automatico do anterior.
- NewProd Piloto recebe as futuras alteracoes por release remoto validado;
  editar uma fonte nao equivale a publicar automaticamente codigo em producao.
- Consultar atualizacao periodicamente; informar versao disponivel, download,
  integridade, adiamento, instalacao, reinicio, validacao e eventual recuperacao.
- Revalidar ociosidade depois do download; bloquear novas admissoes durante a
  troca. Nao apagar spool nem reenviar trabalhos automaticamente.
- Validar painel HTTP e identidade/versao apos reiniciar. Heartbeat sozinho
  nao comprova sucesso. Retorno a versao anterior e recuperacao excepcional,
  nao continuidade do desenvolvimento de um segundo produto.
- Retirar os atalhos e inicio automatico antigos somente quando o substituto
  estiver confirmado. Preservar backup recuperavel, sem duas instancias ativas.

## Lacunas verificadas na base 048e3006

O Piloto .29 retorna antes de consultar atualizacoes em agent_worker.py e
nao consome print_queue. Sua identidade difere da identidade original. O MSI
inicial recusa manifesto ativo diferente em vez de efetuar upgrade de runtime.
Esses comportamentos precisam ser substituidos explicitamente; renomear o
produto ou publicar somente um novo manifesto nao os altera nas estacoes.

O atualizador original pode servir de transporte para um pacote de transicao,
desde que sua rotina de reinicio e o destino do MSI sejam compativeis. Nao
apontar latest.json para o MSI independente atual: o atualizador antigo
reinicia NewProd.exe e esse MSI nao substitui o produto original.

O erro confirmado da LASER-01 foi a inicializacao sem NEWPROD_PILOTO_RAIZ.
O pacote de transicao precisa inicializar o ambiente tambem em partida direta,
inicio automatico e reinicio apos atualizacao. A correcao de atalhos entregue
como MSI 1.2.364 nao adiciona atualizacao remota ao agente .29.

## Gerenciamento que acompanha o produto oficial

Registrar por estacao, pedido/modelo e trabalho: inicio/fim/falha de geracao,
PDF de bloco, capa e contracapa, envio, impressora, identificador do spool,
estado observado e conferencia fisica separada. Guardar eventos localmente
durante falta de internet e sincronizar com deduplicacao e autorizacao.

A central deve mostrar saude do servidor HTTP separada da presenca do worker,
fila e eventos recentes, versoes, atualizacoes, erros, disco e backups. Alertas
de inicio/falha/fim precisam informar a fonte do estado. Desaparecimento da fila
nao deve virar automaticamente prova de papel impresso.

Detalhes de pedidos e logs nao devem ser acrescentados ao heartbeat de leitura
ampla; exigem canal administrativo autorizado, limites e ocultacao de segredos.

## Preflight implementado

ferramentas/auditar_transicao_piloto.py recebe inventario JSON e gera pendencias
por estacao. E somente leitura, exige coleta e presenca recentes para mostrar
fila e nao interpreta fila vazia como autorizacao para instalar. Cinco testes
sinteticos cobrem agrupamento, dados antigos/futuros, fila ativa, coleta antiga
e a diferenca entre fila vazia e preflight de motor/backup.

Inventario real consultado em 07/10/2026 por volta de 11h41 BRT: presenca de
Piloto no Junior e LASER-01; LASER-02 informou apenas o original. Ha trabalhos
na fila do Junior e TEX-01. Evidencia local temporaria em
tmp_auditoria_transicao.json; reconsultar antes de qualquer instalacao.

## Estado desta preparacao

Implementacao preparada e validada em worktree isolada. Junior migrou para
1.2.366 e recebeu 1.2.367 automaticamente pelo novo manifesto: HTTP 9001,
produto_oficial=true, identidade original e quatro jobs antigos preservados.
A porta 9000 foi encerrada e o startup do Piloto independente retirado somente
apos confirmar HTTP. Backup cifrado teve ensaio de recuperacao do executavel.
Evidencias locais em tmp_instalar_oficial366.log e ultimo_update.json/oficial-validado.json
da instalacao; backup protegido em migracao-oficial-20261007.

O usuario informou nao ter acesso a LASER-01. A revisao 1.2.368 acrescenta
handoff local no preservador MSI: confere hash/caminho do Piloto, consulta seu
estado autenticado por DPAPI, exige motor/preparador ociosos e fila Windows
vazia em duas observacoes separadas. Encerra somente processos daquele EXE e
conserva a preferencia de coleta. Estado indisponivel ou atividade adia a troca.
O protocolo legado nao fornece reserva atomica entre processos: a migracao
inicial depende dessas observacoes; atualizacoes futuras no oficial usam a
reserva de producao do proprio processo antes de instalar.

O atualizador oficial consulta a cada 6 horas, inclusive na primeira checagem
apos iniciar; o menu permite verificar e atualizar manualmente a qualquer momento.
A instalacao manual tambem respeita a protecao contra trabalhos em andamento.
Valida manifesto/URL/tamanho
e SHA-256, baixa sem redirecionamento e revalida ociosidade antes de reservar
a instalacao. Encerra apenas PIDs conferidos pelo caminho; MSI tem log local,
retorno registrado e reinicio com ambiente PyInstaller limpo. Falha conserva
o instalador e registra instalacao_falhou. O painel embutido acompanha o MSI;
nao se mistura uma tela nova com agente de contrato antigo.

Vinculos limitados de coleta criados para LASER-04, TEX-01, FLEXO, GUSTAVO-PROD
e LAPTOP-9BSK81S0. Mesma grade restrita das LASER-01/02; responsavel conferido.
Chamadas readonly do catalogo retornaram HTTP 200 nas oito estacoes autorizadas
e 403 na estacao nao autorizada. Rollback por IDs exatos em area protegida.
PRD-ACABAMENTO e cadastros antigos nao entram na liberacao desta migracao.

Publicar novas alteracoes por publicar_agente.ps1 <versao> ou
ferramentas/publicar-oficial.ps1 -Versao <versao>, com SUPABASE_SERVICE_KEY no
ambiente autorizado. O fluxo executa regressoes, gera o MSI oficial, confere
download e ativa newprod-piloto-oficial.json. Sem lista explicita, conserva
as estacoes ja autorizadas. -Simular prepara localmente sem publicar e conserva
a versao preparada na fonte. Nunca substituir bytes de um MSI ja publicado.
Para retomar upload de artefato existente, usar publicar_pacote_oficial.py.
--bootstrap-legado tambem publica latest.json; e somente a ponte de migracao.
Fontes nao publicadas ou simples salvamento de arquivo nao atualizam estacoes:
e necessario concluir o release para que o agente receba a alteracao.

O desligamento e a versao final da grafica precisam ser comprovados por
heartbeat recente com produto_oficial e painel HTTP saudavel, por estacao.

## Liberacao de 07/10/2026, 13h24 BRT

1.2.368 liberada nos manifestos oficial e de transicao para PC-JR-HOME,
LASER-01, LASER-02, LASER-04, TEX-01, FLEXO, GUSTAVO-PROD e LAPTOP-9BSK81S0.
Junior recebeu 366 -> 367 -> 368 pelo pull do proprio agente, sem POST manual
de atualizacao; ultimo_update registrou validado e HTTP confirmou a versao.
Identidade original e os quatro jobs antigos foram preservados.

MSI: NewProdPiloto_Oficial_v1.2.368.msi, 194719744 bytes.
SHA-256: 9c5aaeb20036da623568aa2d3d227003269035596f9e50479178a4321851aa69.
Download publico integral conferido antes de ativar. Os manifestos anteriores
ficaram preservados em dist/*.antes-*. --promover amplia a liberacao do mesmo
MSI somente com prova local do download correspondente, sem reenviar binario.
Regressoes: 511 testes + 2 subtests em cada canal, 2 skips, harnesses JS/browser;
mais 2 testes do publicador. CI passa a incluir explicitamente o canal oficial.

A primeira compilacao do preservador 368 foi recusada pela auditoria por faltar
win32timezone. O componente foi incluido e o MSI so foi publicado depois de
passar na mesma auditoria. A versao 368 publicada inclui essa correcao de pacote.
A confirmacao final da frota e registrada separadamente, conforme heartbeats
chegam; liberacao remota por si so nao comprova instalacao em todas as estacoes.
