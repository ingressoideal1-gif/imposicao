# Sessao local e intervalo de atualizacao — 07/10/2026

O usuario relatou retorno ao login a cada 60 segundos nas estacoes. A telemetria
consultada as 16h51 BRT nao indicava reinstalacao: GUSTAVO-PROD/LASER-01 estavam
aguardando liberacao, outras estacoes na mesma versao informavam sem atualizacao.
No Junior os processos estavam ativos desde 14h21, sem reinicio.

Reproduzido em teste: o wrapper de fetch tratava qualquer 401 de uma API local
como expiracao da sessao. A ponte de propostas tambem repassa 401 remoto, e a
consulta periodica de status e executada a cada minuto. Isso permite encerrar
um login local ainda valido. Nao foi capturado o 401 de cada estacao remota;
essa associacao causal depende de confirmacao operacional apos instalar.

A revisao 1.2.371 consulta /api/local/sessao antes de encerrar o login por 401
de outra rota. Somente a confirmacao 401 dessa rota, com o mesmo token ainda
ativo, solicita novo login. Erro de rede/503 nao confirma expiracao. A chamada
original continua recusada e nao e repetida. Tokens antigos nao encerram um
login novo. A consulta adicional tem limite de cinco segundos e compartilha
consultas simultaneas do mesmo token. Permissoes e validade de oito horas da
sessao local permanecem aplicadas pelo backend.

Pedido de atualizacao automatica: intervalo de seis horas, inclusive primeira
checagem apos iniciar. O menu Verificar atualizacoes/Atualizar agora permanece
disponivel e respeita producao em andamento. O teste usa relogio simulado e
confirma chamadas somente em 21600 e 43200 segundos. Sincronizacao de dados,
heartbeat e consulta de pedidos nao sao atualizacoes do executavel.

A GUSTAVO-PROD permanece fora da liberacao do Piloto. O pacote de retorno ao
Original recebe a mesma correcao de sessao na revisao 1.2.372, mantendo sua
suspensao de atualizacoes. A LASER-01 permanece suspensa pelo erro MSI1603.
Nenhuma liberacao nova deve habilitar novamente essas estacoes implicitamente.

Validacao: regressao JS falhou antes da correcao por encerrar sessao valida;
passou depois, incluindo expiracao real, falha 503 e resposta de token antigo.
O teste do intervalo e incorporado a conferencia dos tres canais. Conferir
os logs locais de validacao final/build/MSI e o heartbeat antes de declarar
implantacao em cada estacao. Correcao publicada nao prova sessao estavel na grafica.
