# Piloto: conferencia por revisao do pedido

Data: 05/10/2026. Escopo autorizado: alterar e instalar o fluxo de verificacao
do Piloto, preservando o NewProd padrao e os dados comerciais.

## Diagnostico e decisao

A abertura anterior lista modelos e, para cada modelo, consulta a nuvem antes
e depois da preparacao. A Edge repete consultas de proposta, produto e banco.
A antecipacao e a consulta local tambem recalculam hashes de arquivos completos.
Quatro workers reduzem espera, mas nao eliminam essas repeticoes.

A .27 usa uma RPC somente de leitura que calcula uma revisao a partir de um
snapshot consistente do pedido. Nao ha coluna de controle comercial nem
triggers nas tabelas do ERP. A revisao e calculada na consulta; nao e um contador
persistente. Assim, alteracoes de qualquer consumidor do banco entram na
conferencia sem depender de esse consumidor avisar o Piloto.

O snapshot inclui modelos completos, bancos vinculados, produto efetivo,
status da proposta, prazos e metadados de objetos do Storage usados nas fontes.
Leitura de Storage e somente de metadados; nenhuma tabela desse schema e alterada.
O digest do modelo/banco continua integral e compativel com a forma bruta do
frontend; METADATA so e normalizado na copia usada pela tela.

## Fluxo e garantias

1. Toda abertura consulta a revisao autenticada do pedido.
2. Revisao igual retorna apenas um recibo compacto. O cache da estacao fornece
   os modelos e referencias de pacotes ja conferidos.
3. Mudanca retorna o catalogo atual do pedido. Copias de modelos cujos digest,
   fontes e versoes dos objetos nao mudaram sao reutilizadas.
4. Modelos afetados ou arquivos ausentes sao preparados com ate quatro workers.
   A revisao e consultada novamente ao terminar. Mudanca durante download bloqueia.
5. Existencia/tamanho sao suficientes para decidir reutilizacao na abertura.
   A leitura usada pelo painel e pelo motor obrigatoriamente confere os bytes
   com SHA-256, impedindo geracao com arquivo local corrompido.

URLs sem objeto/versao/ETag verificavel mantem a revalidacao HTTP. Objetos
versionados sao comparados com o ETag do Storage; um download com versao
divergente ou cache remoto antigo e recusado. Um validador forte anterior que
coincide com o atual permite reaproveitar bytes locais integralmente conferidos.
Num arquivo substituido na mesma URL, version/metadados mudam a revisao.

Nao foi introduzida tolerancia de alguns minutos, dispensa de autorizacao,
alteracao de quantidades/NI/NF/TICKET ou liberacao offline. Os modos sincrono e
streaming continuam usando as mesmas referencias imutaveis de pacote.

## Instalacao, validacao e recuperacao

A RPC e exclusiva de service_role; anon e authenticated nao podem chama-la.
A Edge exige a identidade da estacao, vinculo de empresa e permissoes existentes.
Endpoint antigo e descoberta autonoma permanecem compativeis. Um servidor sem
a RPC nova recusa a nova conferencia; nao libera usando cache desatualizado.

Regressoes sinteticas cobrem revisao igual com uma consulta/zero downloads,
persistencia apos reinicio, alteracao seletiva, mesma URL, corrida, ETag
divergente, ausencia/corrupcao local, recurso sem versao e recibo invalido.
O SQL foi ensaiado em PostgreSQL local com tabelas e dados exclusivamente
sinteticos. Evidencias autenticadas da estacao e medidas ficam em pasta privada.

Entrega exige testes dos dois canais, checks GitHub, publicacao da Edge e da RPC,
backup cifrado e instalacao do pacote independente .27. A instalacao padrao nao
deve ser reiniciada nem receber esses arquivos.

Rollback: aguardar o Piloto ocioso, pausar coleta e restaurar o manifesto do
pacote .26 pelo inicializador exclusivo. As duas funcoes novas de leitura
podem permanecer sem consumidores; nenhuma restauracao comercial e necessaria.
O endpoint anterior da Edge permanece disponivel. Preservar dados, diario e spool.

Avisos Realtime e pre-copia independente de jobs antigos no spool sao melhorias
separadas. Esta entrega reduz o trabalho no clique; a primeira copia de um
arquivo ausente continua dependendo da rede. Aceite visual e impressao fisica
permanecem separados dos ensaios automatizados.
