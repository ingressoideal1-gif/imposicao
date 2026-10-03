# Backup, restauração e recuperação

A pasta operacional fica em `C:\ProjetosLocais\ideal-imposition`, fora do
Google Drive. Envie **pacotes cifrados**, nunca a pasta `.git` em funcionamento.
Escolha uma pasta privada para a cópia externa. O exemplo do script usa
`G:\Meu Drive\Ideal Imposition - Backups protegidos`; ajuste `-Drive` conforme
o ambiente. Links, evidências e autorizações reais ficam fora do Git público.

## Cobertura

| Material | Cobertura do procedimento local |
|---|---|
| Git | Todas as refs alcançáveis pelo bundle; branches e tags |
| Trabalho pendente | Patches do índice e da árvore, arquivos não rastreados não ignorados de todas as worktrees |
| Estação instalada | Arquivos existentes explicitamente selecionados: `formats_db.json`, `acessos_locais.json`, `qr_ideal_pool.bin`, `agent_config.json` |
| Configurações pessoais e `.env` ignorados | Não coletadas automaticamente; um arquivo adicional exige seleção explícita |
| Banco compartilhado Supabase | Exportação administrativa e ensaio separados, com escopo autorizado e Docker funcional |
| Storage Supabase | Requer cópia dos bytes dos objetos, além dos metadados do banco |
| Navegador / IndexedDB da portaria | Não exportados pelo script; sincronizar e verificar eventos pendentes antes de trocar a estação |
| Impressoras e drivers | Registrar e reinstalar os drivers; o backup dos parâmetros não reproduz o spooler ou impressão física |

O bundle contém o histórico, inclusive material sensível eventualmente antigo;
ele permanece cifrado no Drive. Pools e credenciais nunca entram em logs.
Dados em alteração durante o snapshot não formam uma transação única entre
Git, estação e nuvem. Para recuperação comercial consistente, defina a janela
com o administrador do ERP e registre contagens e hashes do banco e Storage.

## Fazer e conferir

Instale as dependências em ambiente virtual isolado com
`requirements-windows.lock`; a validação registrada usou Windows x64 e Python
3.14.5. O script de backup não importa a aplicação nem inicia o worker.

```powershell
.\ferramentas\backup-estacao.ps1 -Raiz C:\ProjetosLocais\ideal-imposition -CriarChave -Ensaiar
```

`-CriarChave` só cria uma chave ausente e nunca troca a existente. A chave fica
em `C:\ProjectBackups\IdealImpositionChave\recuperacao.key`, com ACL privada.
**Guarde uma cópia recuperável fora deste computador.** Não coloque a chave na
pasta do Drive que contém os backups. Sem ela o backup portátil não pode ser
aberto. Não mostre o conteúdo da chave em terminal, chat ou Git.

Uma opção para a chave é o **Gerenciador de senhas do Google**.
`preparar-chave-google.ps1` prepara um CSV privado para importação manual;
não envia a chave ao Drive. Em https://passwords.google.com, abrir Configurações,
Importar senhas e selecionar
`C:\ProjectBackups\IdealImpositionChave\importar-google-passwords.csv`.
Conferir a conta e a entrada `backup-recuperacao-AES`. A senha representa os
32 bytes associados a `backup-ideal-imposition.invalid`, endereço reservado
que evita oferecer a chave no preenchimento do login real da aplicação.
O valor está em Base64; recuperar com decodificação Base64, nunca usando o texto
como uma senha arbitrária. A importação depende do operador e precisa ser
conferida. Depois de confirmá-la, remover somente o CSV privado; preservar
`recuperacao.key` para a rotina. Referência:
[importação Google](https://support.google.com/accounts/answer/10500247).

O backup AES-256-GCM fica em `C:\ProjectBackups\IdealImpositionProtegido`.
A verificação abre o pacote completo, compara refs e hashes, executa Git fsck e
reaplica os patches de todas as worktrees com alterações rastreadas. A cópia
no Drive Desktop confere SHA-256 localmente; depois confira a presença no
Drive pela conexão de nuvem. Arquivo local e sincronização remota são provas
diferentes. O script nunca envia a chave ou o ensaio decifrado.

O primeiro backup, de 03/10/2026, usou DPAPI CurrentUser e foi dividido em duas
partes para o limite de 100 MiB da conexão. Ele depende da conta Windows
original. Os novos pacotes portáteis usam a chave separada. A proteção DPAPI
no runtime também depende da conta original: numa instalação nova,
ressincronize acessos e recadastre SMTP; não suponha que esses blobs abrirão.

## Automação e retenção

```powershell
.\ferramentas\agendar-backup.ps1 -Raiz C:\ProjetosLocais\ideal-imposition
.\ferramentas\agendar-backup.ps1 -Raiz C:\ProjetosLocais\ideal-imposition -Aplicar
```

A primeira linha mostra a proposta. A segunda registra a tarefa diária às
20h, sem senha, com a conta do operador logada, uma execução por vez e início
quando disponível. A tarefa recusa sobrescrever outra tarefa com o mesmo nome.
O Drive Desktop precisa estar disponível; se estiver ausente, o backup local
continua e o envio externo fica pendente. Examine `LastTaskResult`, a data do
último pacote e a presença remota. Não trate tarefa cadastrada como execução
comprovada.

A retenção lista candidatos de mais de 30 dias em `retencao-revisar.json`,
sem excluí-los. Antes de excluir, confirme cópia externa, ensaio e quais
pontos históricos precisam ser preservados. Faça um ensaio completo mensal
e antes de uma entrega que mude persistência ou autenticação.

## Restaurar sem afetar a operação

Escolha uma pasta **nova**, fora do repositório, sob um pai com ACL privada:

```powershell
.\ferramentas\restaurar-backup.ps1 -Backup C:\ProjectBackups\IdealImpositionProtegido\backup-AAAAMMDD-HHMMSS-ID -Destino C:\ProjectBackups\IdealImpositionProtegido\recuperacao-NOVA -Chave C:\ProjectBackups\IdealImpositionChave\recuperacao.key -Verificar
```

O processo verifica cifragem autenticada, tamanho, hash e caminhos antes da
extração. Não sobrescreve diretórios existentes, não altera a aplicação, não
acessa banco remoto e não instala o agente. Um erro mantém o original intacto.

Use o mirror `repository.git` recuperado para criar clones novos. Os diretórios
`ensaio-worktree-NNN` comprovam os patches; os arquivos não rastreados ficam
separados em `worktrees/NNN/untracked`, com hashes. Não use o ensaio como pasta
operacional antes de revisar caminhos e arquivos privados. Reinstale um MSI
verificado, aplique os arquivos de runtime seletivamente com o agente parado,
confira identidade e acesso, e valide um pedido sintético antes de reabrir a
produção. Nunca copie o `agent_config.json` para uma segunda estação ativa:
isso duplica a identidade do agente.

## Nuvem e responsabilidades

O projeto esperado é `vwbtitjlpelrcnsytzqw` (e-deal), compartilhado com o ERP.
Confirme o escopo com o administrador do ERP, incluindo arquivos sensíveis da
estação quando necessários. Um dump administrativo e a cópia dos objetos devem
ficar em diretório protegido, ser cifrados antes do Drive e ter um ensaio em
ambiente separado. Não rode importação ou migração sobre produção para testar.

Prepare schema, roles, dados, RLS, funções, configurações de buckets e inventário
de objetos com contagem e SHA-256. Separe as configurações secretas das Edge
Functions; nenhum segredo deve ir para Git. Confirme restore, isolamento por
empresa e referências entre pedidos e arquivos antes da troca de ambiente.
Sem acesso/escopo administrativo comprovado, registre a cobertura como pendente.

A preparação do Docker está em [DOCKER_PREPARACAO.md](DOCKER_PREPARACAO.md).
Os backups físicos mantidos pelo Supabase não substituem o dump externo nem
contêm os bytes do Storage. O script `backup-storage.ps1` copia somente da
nuvem para disco privado, confere nomes/tamanhos, cifra por bucket e testa a
abertura autenticada. O inventário e os objetos em claro permanecem privados;
somente `.iib` e manifesto genérico seguem ao Drive. A janela não é uma
transação conjunta com o banco. A CLI instalada interpreta `C:` como protocolo;
o destino de download usa caminho relativo e `cwd` privado.

O script registra somente buckets que têm objetos no inventário. Configurações
de todos os buckets, inclusive vazios, precisam constar também do dump/metadados
administrativos. Download em andamento ou manifesto sem `completed_at` não
comprova backup do projeto completo.

Referências: [backups Supabase](https://supabase.com/docs/guides/platform/backups)
e [proteção DPAPI](https://learn.microsoft.com/en-us/windows/win32/api/dpapi/nf-dpapi-cryptprotectdata).
