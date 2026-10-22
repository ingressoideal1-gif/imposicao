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

## Provisionamento automatico da base v2

O agente passa a solicitar a base v2 ao preparar um pedido que a exige, somente
quando `qr_ideal_pool_qr12_1.bin` esta ausente. A base legada, contratos, numeracao
e arquivos existentes permanecem intactos. Um arquivo v2 existente e divergente
continua bloqueado: o provisionamento automatico nao o substitui.

A rota `POST /functions/v1/piloto-local/base-qr-v2` usa a credencial privada ja
provisionada no agente e o vinculo ativo da estacao. Exige as permissoes de
producao e impressao, a empresa configurada e a inclusao explicita da estacao em
`NEWPROD_QR_V2_ESTACOES` (nomes separados por virgula, sem curinga). Ausencia da
configuracao bloqueia todas as estacoes. O nome enviado nao e um certificado de
hardware: a autenticacao usa o segredo do agente e os vinculos existentes.

O servidor usa `basePrivada(2)`, que le o objeto autenticado ja existente e
confere seu tamanho e SHA-256. Nao aceita URL, bucket ou arquivo do cliente e nao
devolve URL assinada. A resposta binaria tem `private, no-store`; requisicoes
com Origin, inclusive localhost, sao recusadas. Sessoes de usuario e chave anon
nao substituem a credencial do agente.

O agente acessa somente a URL HTTPS fixa do projeto, recusa redirecionamentos,
confere revisao, tamanho e SHA-256 fixos e grava um temporario dentro da pasta
protegida. Publica o arquivo por link atomico sem sobrescrita, apos validacao.
Uma falha capturada remove o temporario; uma corrida aceita somente o destino ja
validado. Encerramento abrupto pode deixar um temporario na pasta protegida,
mas nunca o promove a base utilizavel. Na tentativa seguinte, o arquivo instalado valido e reutilizado sem
rede. A base nao entra no MSI nem nos logs. Os diagnosticos registram somente
categorias fixas de recusa, indisponibilidade, tamanho ou integridade.

Ordem de ativacao: publicar a Edge Function preservando sua autenticacao;
configurar a lista de estacoes aprovadas no servidor; publicar o agente; conferir
a versao instalada e uma nova abertura do pedido afetado. Nao e necessaria
migracao nem alteracao dos contratos. Os testes locais usam apenas bytes
sinteticos e nao comprovam o provisionamento real na grafica.

Para suspender novas entregas, remover as estacoes dessa lista. Isso nao apaga
nem revoga uma base ja instalada; a revogacao de estacao segue os controles
existentes. Nao publicar a base no Storage publico para contornar uma recusa.
