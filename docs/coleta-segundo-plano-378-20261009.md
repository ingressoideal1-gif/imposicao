# Piloto 1.2.378 — downloads sem janela aberta

Escopo confirmado: Windows ligado, usuario conectado, janela do NewProd fechada.
O agente da bandeja e iniciado pelo registro Run da conta Windows. Nao e
necessario servico com credenciais de outra conta nem sessao de navegador.
Encerrar explicitamente o agente continua encerrando os downloads; o menu
agora informa esse efeito. Nao ha download com computador desligado/suspenso.

## Diagnostico

- O ciclo ja pertence ao lifespan do agente, nao ao navegador.
- A coleta automatica recusava qualquer spool nao vazio, inclusive trabalhos
  antigos/pausados. O inicio manual ignorava esse bloqueio, explicando diferenca
  entre o clique e o modo automatico. A causa de cada estacao ainda depende
  do estado local; o heartbeat anterior nao publicava o estado da coleta.
- No Junior, consulta local encontrou pausa falsa, 15 preparacoes pendentes e
  ciclo manual concluido. Isso nao prova a mesma situacao nas outras estacoes.
- Pausa e persistida e deve continuar respeitada; nao foi apagada em lote.

## Mudancas

- Copia automatica nao aguarda spool vazio. Nao modifica, cancela ou reenvia jobs.
  Checkpoint continua impedindo admissao durante producao ativa do NewProd,
  pausa explicita ou encerramento. A varredura de manutencao por ociosidade
  mantem sua verificacao de spool; apenas a descoberta/copia muda.
- Primeiro ciclo acorda na inicializacao, sem aguardar o timer de 30 segundos.
  Retomar a coleta tambem acorda o ciclo imediatamente.
- MSI e menu Iniciar com Windows usam --background no produto substituto:
  agente inicia na bandeja sem abrir navegador. Atalho normal continua abrindo
  o painel; sem instalar outro consumidor/servico.
- Heartbeat inclui estado/modo/fase da coleta, ultima consulta, contadores,
  pausa/fila, thread ativa e erro de catalogo. Leitura em memoria; nao envia
  pedidos, URLs, credenciais nem logs internos.
- Herda conferencia por revisao da .377. Coleta de recursos antecipada nao
  equivale a autorizacao offline: abertura ainda confirma a revisao na nuvem.

## Validacao

Regressoes locais: download real de bytes sinteticos sem navegador com timer
de uma hora (exige despertar inicial); spool ocupado sem bloquear copia;
pausa/retomada, ocupacao de producao, autenticacao, reinicio e telemetria filtrada.
O teste de thread do PR anterior excedeu 3 segundos no runner remoto Oficial,
embora os outros canais e ensaio local passassem. Nao desabilitado; a nova
entrega mantem o teste e inclui o despertar imediato do ciclo.

Pacote para as nove estacoes operacionais, Junior fora do manifesto de produto.
Nao instalar a build geral sobre o Junior de testes. A instalacao nas estacoes,
o inicio no proximo login e o desempenho sob carga real exigem evidencia
posterior; publicar MSI nao comprova essas etapas.
