# Entrega consolidada — Ponte 1.7.5

Inclui a correcao de salvamento da candidata 1.7.4: todos os salvamentos
da ponte usam formato CDR 24.0, compativel com CorelDRAW 24.3, com preservacao
de aparencia e ICC. Copia local anterior preservada quando o formato era
mais novo. Arquivo ja salvo em 27 exige conversao em uma estacao compativel;
a nova ponte nao torna o Corel 24 capaz de abrir esse arquivo antigo.

Nomes de paginas na criacao e na reabertura do mapa compativel:
- FxVerso comum: Modelo A - Frente / Modelo A - Verso.
- FxVerso multipaginas e impar/par: Frente 1 / Verso 1 / Frente 2 / Verso 2.
- Verso fixo: Frente 1 / Frente 2 / Verso unico (com acento na interface).
- Nao cria paginas adicionais em Duplicar para Verso; a duplicacao segue no motor.

IDs, ordem, dimensoes e vinculos permanecem os mesmos. Renomear nao altera
arte nem torna editavel a camada de numeracao/picote.

Validacoes: 114 testes de contratos, importacao, integracao Corel, runtime,
instalador e releases aprovados. Prova real sintetica no Corel 24.3 confirmou
nomes persistidos, referencias protegidas e CDR formato 24.0.
Build isolado: ponte-build-corel-20261030-07; sem instalacao automatica.

Correcao central ja ativa: ponte-drive v10 aceita image/x-coreldraw somente
para nativo CDR registrado, mantendo identidade, pasta, tamanho e SHA-256.
Backups dos pedidos 24555 e 24548 confirmados apos retentativa automatica.

Pedido 24467: teste isolado de importacao passou e usuario confirmou depois
que abriu corretamente. Nao foi identificada causa unica da mensagem generica;
nao atribuir essa recuperacao a alteracao de formato. Atualizar PDF desse caso
nao foi validado nesta sessao.

Distribuicao no mesmo ID de Drive, revisao anterior preservada e download
integral conferido. Rollback pelo instalador; nao excluir CDRs, PDFs ou backups.
Publicacao nao comprova instalacao nas estacoes nem prova de impressao.
