# Entrada e saida em setores com reentrada

O setor configurado como "Permite sair e voltar" exige confirmacao online.
Primeira leitura valida: entrada. Enquanto dentro: popup Entrada / Saida.
Entrada nesse popup e recusada como "Ingresso ja se encontra no Local".
Saida confirmada muda a presenca para fora; a leitura seguinte registra entrada.
Cancelar o popup nao registra passagem. Todos os resultados exigem Ler o proximo.
Entrada continua verde, saida usa azul; numero e setor ficam destacados.

O servidor serializa por ingresso, compara a versao da presenca ao confirmar e
grava movimento, presenca e recibo na mesma transacao. O recibo inclui identidade,
acao, instante e versao esperada. Tambem conserva respostas do popup: uma consulta
repetida depois de uma saida nao vira entrada automaticamente. Um recibo permitido
antigo nao libera novamente se a presenca ja mudou. O historico original permanece.

Uma falha de rede deixa a tentativa persistida no IndexedDB antes do envio. O
botao Consultar confirmacao repete a mesma identidade. Reabrir a pagina recupera
essa pendencia; baixar a carga nao a apaga e preparar outro evento e bloqueado.
Sem confirmacao nao se deve liberar a passagem. Som/vibracao mantem a compatibilidade
do aparelho (o iPhone nao oferece a API de vibracao usada pelo PWA).

Saidas registradas de quem esta dentro continuam permitidas apos fechamento ou
bloqueio do setor/evento, desde que o aparelho continue autorizado ao setor.
Uma nova entrada permanece sujeita a status, faixa, horario e permissoes.

## Historico e metricas

Leituras antigas permanecem entradas; nenhuma e convertida em saida. Na primeira
consulta, a presenca e inicializada pelo ultimo movimento permitido registrado.
Portanto ingressos com entrada antiga e sem saida registrada aparecem dentro:
isso e um saldo dos registros, nao prova de presenca fisica. A conferencia na
portaria deve registrar a saida de quem realmente estiver saindo.

O painel separa entradas, saidas, ingressos utilizados e No local (registro).
Negativas nao alteram a presenca. O contador do leitor conta entradas, nunca saidas.
O zeramento existente invalida presencas e recibos anteriores pelo marcador do evento.

## Publicacao e recuperacao

Alvo: Supabase vwbtitjlpelrcnsytzqw; Cloudflare imposition.ai-ideal.com.br e
imposicao.pages.dev. Aplicar sql/ideal_control_presenca_20261012.sql em transacao,
apos guardar definicoes atuais das duas RPCs substituidas. A migracao cria duas
tabelas privadas vazias e nao atualiza nem apaga leituras/eventos/setores existentes.
Conferencia anterior a entrega: um setor reentrada e tres leituras nesse setor.

Depois publicar portaria, acesso-conta e acesso-interno (relatorio compartilhado),
integrar a versao web e conferir hashes e service worker nos dois dominios.
Atualizar todos os leitores do setor antes da operacao: a RPC antiga recusa novas
reentradas e pede atualizacao. Uma copia antiga completamente offline nao pode
receber a regra nova; nao opera este modo com garantia de presenca.

Recuperacao deve preservar tabelas, movimentos e recibos. Voltar so o frontend
nao restaura a operacao de reentrada: leitores antigos recebem atualizacao
necessaria. Nao restaurar RPC permissiva nem remover historico durante evento.
Qualquer retorno exige plano especifico e verificacao dos registros ja feitos.

Validacao: PostgreSQL sintetico com concorrencia, rollback, reenvio e zeramento;
rotas Deno com banco simulado; navegador com IndexedDB, cancelamento, recuperacao
apos reabertura e falta de conexao; contratos dos canais e painel compativel.
