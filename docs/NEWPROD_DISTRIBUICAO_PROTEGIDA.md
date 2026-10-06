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

## QR Ideal de 12 caracteres (1.2.358)

A nova base `qr_ideal_pool_qr12_1.bin` e aleatoria e independente da base legada.
Ela nunca entra no MSI nem pode ser reconstruida usando instaladores antigos.
O administrador deve recebe-la por canal privado e provisionar separadamente
`%LOCALAPPDATA%\NewProd Dados Protegidos` e, quando aplicavel,
`%LOCALAPPDATA%\NewProd Piloto Dados Protegidos`.

Na maquina administrativa com o repositorio, usar
`python ferramentas/provisionar_qr12.py --origem <arquivo-privado> --canal producao`
(ou `--canal piloto`). Tambem e possivel copiar o arquivo conferido para a pasta
protegida existente da conta que executa o agente. O NewProd confere os 24.000.000
bytes e o SHA-256 antes de usar:
`6e968837c7f16a9acd0b0a46adfa84bbb1137dae75010f64512ca7f01351e1dc`.
Base ausente ou divergente bloqueia a nova emissao. Nao substituir o arquivo
legado, necessario para reimprimir ingressos anteriores.

A revisao intermediaria 1.2.357 usava uma derivacao que foi retirada antes de
qualquer contrato v2. O alvo final desta entrega e 1.2.358. Ver
[contrato, implantacao e pendencias](entrega-qr-ideal-12-caracteres-2026-10-05.md).
