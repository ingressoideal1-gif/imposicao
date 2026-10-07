# Historico de impressao por pedido, modelo e estacao

Implementacao da solicitacao de 07/10/2026. O painel administrativo consulta
a central, sem acessar nem varrer arquivos dos computadores da grafica.

## Conteudo e limites

- Cada tentativa de envio tem identificador proprio e eventos com horario,
  estacao, impressora, identificador Windows e estado observado.
- O painel captura pedido/modelo antes de gerar; essa selecao acompanha os
  arquivos no envio direto, modal, relay e hot folder. Reimpressao e tipo
  capa/contracapa/miolo sao metadados separados.
- Em combinacoes, os modelos selecionados compartilham o trabalho. Isso nao
  equivale a contar folhas fisicas por modelo. Arquivos avulsos e antigos sem
  metadados permanecem explicitamente sem identificacao.
- Eventos de envio/fila/RIP nao comprovam papel impresso. Conferencia fisica
  feita no gerenciamento local aparece como evento de operador. O registro
  comercial IMPRESSO em pedidos_modelos continua em seu fluxo existente;
  este recurso nao muda esse status nem cria uma confirmacao automaticamente.
- PDFs, bancos de numeracao, conteudo das artes, caminhos de hot folder e
  credenciais nao sao enviados ao historico central.

## Desempenho e durabilidade

O contexto e gravado na mesma transacao de admissao que ja existia. Nao ha
nova chamada de rede no caminho de impressao. Estado inalterado do spool nao
regrava o trabalho. Uma thread separada le por indice, no maximo 30 eventos
por ciclo de 30 segundos, com corpo de ate 192 KiB e timeout de rede de 5 s.
Falhas usam espera progressiva ate 15 minutos, sem reenviar PDFs.

O cursor so avanca depois de ACK da central. INSERT com chave unica e
ignore-duplicates suporta resposta perdida. O timestamp integra a chave para
nao conflitar com novas tentativas depois de restaurar um backup antigo.
Eventos nao sincronizados nao sao removidos pela retencao local de 90 dias.
Sem internet prolongada, os pequenos registros pendentes ocupam disco;
nao ha promessa de espaco zero nem de impacto absolutamente nulo.

Ensaio local sintetico, 200 trabalhos por variante (admissao e duas transicoes):
anterior mediana 25,40 ms / p95 31,46 ms / SQLite 188416 bytes;
novo mediana 25,24 ms / p95 32,39 ms / SQLite 282624 bytes.
Nao e uma medicao da LASER-01 nem prova de desempenho sob carga real.
Teste de rede bloqueada confirma que a transacao SQLite e encerrada antes do
envio HTTP e outra admissao continua disponivel.

## Nuvem e acesso

Projeto de producao: vwbtitjlpelrcnsytzqw. Tabela exclusiva
public.imposition_historico_impressao, criada por
sql/historico_impressao_estacoes.sql em transacao; inicialmente zero registros.
RLS habilitada, anon/authenticated sem acesso direto; somente service_role
recebe SELECT/INSERT. Nao altera tabelas comerciais.

A Edge Function historico-impressao autentica a estacao pelo mecanismo
existente de segredo do agente e vinculo ativo/revogavel de estacao/empresa.
A consulta exige JWT validado em auth/v1/user, permissao administrativa e
empresa conferida no servidor. Consulta paginada de 100 eventos, periodo
de 1 a 90 dias, filtros por pedido/modelo/estacao e exportacao da pagina.

## Recuperacao e validacao

Desativar a coleta central nao interfere na impressao; conserva pendencias
locais. Nao excluir a tabela para reverter a interface ou o agente.
MSI e publicacao precisam de prova separada; este documento, por si so, nao
confirma instalacao nas estacoes. Registros anteriores sem identificadores
nao podem ser atribuidos retroativamente a pedidos por suposicao.

O teste antigo test_destino_impressao_modal.py pressupoe AGENTE_LOCAL_URL
literal na fonte e ja falha na base 4f970597, onde a URL depende do canal.
O novo historico_impressao_harness.js exercita o envio real do modal com
dependencias simuladas e confere destino, metadados e nao duplicacao.

Validacao final local: 525 passed, 2 skipped e 2 subtests em cada um dos
tres canais, mais harnesses de navegador; seis testes da Edge passaram.
O complemento sql/historico_impressao_permissoes.sql removeu privilegios
herdados de service_role; INSERT permitido e DELETE recusado conferidos.
O executavel final teve codigo compilado comparado a fonte nos sete modulos
afetados, alem da auditoria do pacote sem arquivos privados.
