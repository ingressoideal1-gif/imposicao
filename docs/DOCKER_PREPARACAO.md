# Docker para backup e ensaio do banco

Roteiro para preparar o ambiente sem reinicialização automática. Não é prova
de instalação. Evidências reais e informações da estação ficam em pasta privada.

## Requisitos

Conferir Windows suportado, memória, SLAT, serviço LanmanServer e virtualização
ativa no firmware. Habilitar virtualização na BIOS/UEFI exige intervenção local
e reinício escolhido pelo operador. Confirmar WSL antes de executar o instalador.

## Instalador preparado

Docker Desktop 4.93.0, build 240920, Windows x64, fonte oficial:
https://desktop.docker.com/win/main/amd64/240920/Docker%20Desktop%20Installer.exe

Guardar o instalador fora de arquivos versionados. Tamanho de referência:
627791792 bytes. SHA-256 publicado pelo fornecedor:
`c139124c9cf71477dc565c3c0ea5a18f90b93d68ebe9aaa848a065960416c0bc`.
Exigir assinatura Authenticode válida do editor Docker Inc antes da execução.
Guardar a evidência de conferência fora do Git público.

## Sequência para a instalação posterior

1. Escolher uma janela fora da impressão e salvar o trabalho. Habilitar Intel
   VT-x / AMD SVM na BIOS/UEFI; verificar novamente a virtualização no Windows.
2. Configurar WSL 2 com o procedimento oficial da Microsoft, em terminal
   administrativo. Usar instalação sem distribuição e sem reinício automático
   quando essas opções estiverem disponíveis: `wsl --install --no-distribution --no-reboot`.
   Confirmar antes com `wsl --help`; não remover as opções para contornar erro.
   Se o Windows solicitar reinício, parar e deixar a decisão ao operador.
3. Depois do reinício manual, conferir `wsl --version` (mínimo 2.1.5).
   Instalar Docker por usuário, backend WSL 2, sem containers Windows.
   Conferir novamente assinatura e hash do arquivo antes de executá-lo.
   Não usar `--accept-license` automaticamente; o operador revisa os termos
   na primeira abertura. O modo por usuário evita o serviço privilegiado do
   instalador para todos os usuários.
4. Abrir Docker Desktop, conferir `docker version` e funcionamento do daemon.
   Só então executar exportação administrativa e ensaio isolado do PostgreSQL.

Não há comando de reinicialização neste procedimento preparado. O backup não
deve restaurar dados em produção: usar volume/container novo, sem porta pública,
sem credenciais de produção nas funções ou na aplicação restaurada. Conferir
schema, dados, roles e permissões; comparar contagens e relações. Dumps devem
ficar sob ACL privada e ser cifrados antes de copiar ao Drive.

Para desfazer uma instalação futura, usar a desinstalação oficial do Docker.
Não remover distribuições WSL, volumes ou backups automaticamente: isso pode
apagar dados de outras tarefas. Registrar os recursos criados no ensaio.

Referências: [instalação Docker](https://docs.docker.com/desktop/setup/install/windows-install/),
[checksum da versão](https://desktop.docker.com/win/main/amd64/240920/checksums.txt)
e [instalação WSL](https://learn.microsoft.com/en-us/windows/wsl/install).
