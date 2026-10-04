# Distribuicao do NewProd sem dados privados

A partir de 1.2.354, o MSI publico contem codigo e painel. O pool de ingressos
e a credencial de publicacao pertencem a estacao; nao entram no instalador.

Antes de remover uma versao antiga, o MSI executa o preservador minimo
`PreservarNewProd` sob a conta Windows atual. Ele preserva
o pool existente em `%LOCALAPPDATA%\NewProd Dados Protegidos`, compara os
hashes e protege a pasta para o usuario e SYSTEM. Uma copia divergente ou
truncada interrompe a instalacao antes da remocao da versao antiga.

A credencial existente protegida por DPAPI e preservada. Quando existe
somente no executavel antigo, o migrador le apenas o literal do modulo de
publicacao, sem executar o codigo legado, e grava com DPAPI CurrentUser.
Nenhum valor e mostrado ou incluido no novo executavel.

Em instalacao nova, o MSI nao inventa codigos ou credenciais. O administrador
deve provisionar o pool existente por canal privado e a credencial local
autorizada antes de usar QR Ideal. A conta Windows deve ser a mesma que roda
o agente. A regra de numeracao e os codigos existentes permanecem os mesmos.

O build e a publicacao conferem o executavel e a tabela de arquivos do MSI
antes de upload. `ferramentas/conferir_pacote_agente.py` recusa pool, lista de
acessos, configuracoes secretas, modulo de segredo e pacote sem preservacao.
O backup diario inclui os dois arquivos da nova pasta quando existem.

Validar em uma estacao piloto: preservacao, instalacao sem reinicio, versao
servida, login, PDF sintetico, leitura do pool e fila anterior. Uma resposta
da API ou um trabalho no spooler nao comprova a saida fisica de papel.
Para recuperacao, conservar o MSI anterior em armazenamento privado cifrado,
o backup dos dados e a chave AES separada. Downgrade automatico nao e suportado;
uma reversao publicada precisa de numero superior ao release ativo.
