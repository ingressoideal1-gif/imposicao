# NewProd 1.4.2: retorno manual sem perder a primeira impressao

Base completa: agente-v1.4.1 / 744b0f14. Preserva atualizador, QR, limpeza de
bundles, confirmacao pela rede, controle de concorrencia e recibos locais do
agente publicado. Nao substitui essa fonte pela main da web.

O operador pode voltar de Impresso para Aguardando pelo seletor. Essa acao usa
retornar_impressao_aguardando com o carimbo que estava na tela. A resposta e a
releitura devem confirmar o mesmo modelo/pedido/status antes de registrar o
recibo local. Autosave nao recebe a permissao de retorno manual.

A migracao do PR 207 preserva status_impressao_em e recusa regressoes por
gravacoes comuns. status_impressao_registrado_em continua identificando a
ultima mudanca de status. O pacote depende da aplicacao coordenada dessa RPC.
Versoes anteriores nao usam a RPC e terao retorno manual recusado depois da
ativacao da protecao; a confirmacao de Impresso continua aceita.

## Validacao e pacote

- 1204 testes Python, 2 ignorados e 2 subtestes aprovados em cada canal:
  producao, Piloto e oficial. Todos os harnesses obrigatorios passaram.
- O teste de rede cobre RPC, recibo local, retorno/reabertura, primeira hora
  preservada, reimpressao e recusa de tela anterior a uma nova confirmacao.
- Auditoria de EXE, preservador e MSI aprovada, sem arquivos privados ou
  modulo de segredo. Seis assets embutidos comparados byte a byte com a fonte.
- ProductVersion: 1.4.2; painel script.js/pedido.js: 1401.
- NewProdPiloto_Oficial_v1.4.2.msi: 196808704 bytes.
- SHA-256: 6ea04ff228737a19321078843f25d91fd45193c0a81167e06c54457f906d0804.

## Publicacao

Somente canal producao: pacote imutavel, download publico completo e hash
antes de ativar newprod-piloto-oficial.json e latest.json. Canal de teste
permanece em 1.3.35. Nao alterar a versao minima online nem instalar/reiniciar
estacoes nesta entrega. Publicacao nao comprova adocao ou impressao fisica.
Os recibos de upload, download e ativacao ficam em dist, junto ao MSI.

Rollback de codigo exige versao maior; nao ha downgrade automatico. Os
manifestos anteriores devem ser preservados pelo publicador. Recuperacao do
banco usa as definicoes capturadas no preflight, sem apagar datas registradas.
