# Capas de camarote no canal padrao — 1.2.397

Autorizacao: disponibilizar a correcao para todas as estacoes. Aplicado somente
o diff do motor e a regressao de capas do commit de teste c9f08265, sobre a
base oficial 0accb12d. O painel e os recursos experimentais nao foram copiados.

Na montagem em blocos, gerar uma capa por camarote, com inicio e lotacao do
modelo. Paginar capas adicionais e igualar a quantidade de contracapas. Evitar
duplicacao quando um camarote atravessa blocos. Preservar miolo e numeracao.

Selecao de regressao: 96 passaram, 2 pulados. Inclui dez casos de camarote,
modelos combinados, blocos, montagem e teatro. Sem envio fisico a impressoras.
`conferir_duas_versoes.py` concluiu com sucesso para producao, piloto e oficial:
543 testes passaram e 2 foram pulados em cada perfil, alem dos 16 harnesses
por perfil, todos sem falha. Logs em dist/capas-oficial-397-canais.log e
dist/capas-oficial-397-oficial.log. Build e auditoria de pacote aprovados.
MSI: 194985984 bytes, SHA-256
`5189c503dabec97178d574d4659bad3d3d93cfcb539cb576f8875652a43ae49c`.
Conferidos ProductVersion, bytecode do motor, DLLs de impressao e os 356
arquivos rastreados do painel incorporados ao executavel.

Pacote: dist/NewProdPiloto_Oficial_v1.2.397.msi. Liberacao no manifesto oficial
e ponte legada para as oito estacoes ja autorizadas: LASER-04, TEX-01, FLEXO,
LAPTOP-9BSK81S0, GUSTAVO-PROD, LASER-02, ACABAMENTO e DESKTOP-PM6TG1B.
Junior (PC-JR-HOME) e LASER-01 conservam o canal de teste 1.2.397, que ja contem
a mesma correcao. Disponibilidade nao comprova instalacao nas estacoes.

C_INI=0 do modelo 1002451 continua pendente da definicao da faixa; nao houve
alteracao de dados de pedidos no banco. A instalacao manual no Junior segue
adiada conforme pedido anterior. Nenhum processo de estacao foi encerrado.

Publicacao concluida: download publico completo identico ao MSI local;
newprod-piloto-oficial.json e latest.json relidos com versao 1.2.397 e as oito
estacoes preservadas. Evidencia em
evidencias/publicacao-capas-camarote-oficial-397.json. O manifesto de teste nao
foi modificado. Instalacoes efetivas e impressao fisica ainda nao conferidas.
