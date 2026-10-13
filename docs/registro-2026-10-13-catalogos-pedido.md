# Catálogos ao abrir pedidos no canal de teste

O Junior .393 mantinha formatos e saídas no SQLite por 30 minutos e no estado
do painel até uma recarga. No caso relatado do pedido 23435, o catálogo local
ainda tinha o formato com altura 440 mm, enquanto o cadastro online tinha
480 mm e outra saída padrão. A saída havia sido renomeada para A3 Cartaz 33x48.

A .394 de teste atualiza os catálogos na abertura explícita de um pedido online,
inclusive quando a revisão do pedido não mudou. A resposta entrega o catálogo
ao painel, que aplica formatos e saídas antes de carregar os modelos e descarta
o bootstrap anterior. A coleta de fundo continua com seu intervalo anterior;
não há atualização de geometria no meio de uma geração já iniciada.

A abertura offline usa somente o catálogo persistido. Respostas incompletas ou
recusas não substituem o catálogo anterior nem liberam uma abertura online com
dados silenciosamente antigos. As escritas do catálogo são serializadas com a
coleta. A validação de integridade antes de gerar permanece ativa.

Não altera pedido, numeração, saída escolhida explicitamente no modelo, fila de
impressão ou configuração de impressora. Não necessita mudança de banco ou Edge.

Validação: 38 testes Python de abertura, persistência, rotas e sincronização;
harness offline em Chromium e 16 harnesses em cada canal (32 execuções).
Bateria ampla: 544 passaram, 2 ignorados e 4 falharam em cada canal. As mesmas
quatro falhas foram reproduzidas sem a alteração, no commit 96d0e12d:
teste de versão oficial não aceita sufixo teste; dois testes de publicação
oficial usam manifesto incompatível com o canal teste; lista de arquivos do
painel não inclui impressao-teste-modelo.js. Não foram ocultadas ou modificadas.

MSI NewProdPiloto_Teste_v1.2.394.msi: 196661248 bytes, SHA256
970df26fa837f9f62f8d2601a15d15be3df7122facb78cc7fbb97601a08951dc.
Auditoria de privacidade aprovada; versão MSI, versão Python embutida, dois
scripts do painel e três DLLs de impressão conferidos. O MSI inclui o módulo
offline com o novo método de sincronização.

Publicação comprovada separadamente em evidencias/publicacao-catalogos-394.json.
Somente o manifesto teste conserva seus alvos LASER-01 e PC-JR-HOME. A versão
oficial não foi alterada. Disponibilidade não comprova instalação: conferir
/api/version após instalar e reabrir o pedido 23435 para validar a prévia.
Geração e impressão física continuam dependentes de validação operacional.

Recuperação: o instalador preserva os dados da estação pelo fluxo já existente.
Não excluir catálogo ou snapshots para contornar divergências. Se necessário
reverter a lógica, empacotar a fonte anterior com versão superior; não rebaixar
automaticamente nem sobrescrever o MSI público.

Instalado no Junior após saída confirmada pelo operador: MSI exit 0, servidor
NewProd 1.2.394-teste.1 e scripts servidos conferidos, configurações idênticas
antes/depois. Spool vazio antes e depois. Backup de executável/painel e arquivo
DPAPI das configurações com restauração em memória conferida; caminho local
registrado na evidência. Abertura da prévia 23435 ainda depende do operador.
