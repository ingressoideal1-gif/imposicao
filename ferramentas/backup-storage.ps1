param(
 [string]$Cli = 'C:\ProjetosLocais\ideal-imposition\node_modules\.bin\supabase.cmd',
 [string]$AreaBackup = 'C:\ProjectBackups\IdealImpositionProtegido',
 [string]$Chave = 'C:\ProjectBackups\IdealImpositionChave\recuperacao.key',
 [string]$Drive = 'G:\Meu Drive\Ideal Imposition - Backups protegidos',
 [string]$Python = (Join-Path (Split-Path -Parent $PSScriptRoot) '.venv\Scripts\python.exe'),
 [string]$AgentPreCopiado
)
$ErrorActionPreference = 'Stop'
$area = [IO.Path]::GetFullPath($AreaBackup)
if (-not (Get-Acl -LiteralPath $area).AreAccessRulesProtected) { throw 'Area do backup precisa ter ACL privada.' }
$nome = 'storage-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
$destino = Join-Path $area $nome
$argumentosStorage = @((Join-Path $PSScriptRoot 'backup_storage.py'), '--cli', $Cli, '--destino', $destino, '--chave', $Chave)
if ($AgentPreCopiado) { $argumentosStorage += @('--agent-pre-copiado', $AgentPreCopiado) }
& $Python @argumentosStorage
if ($LASTEXITCODE -ne 0) { throw 'Backup Storage incompleto; nao sera enviado ao Drive.' }
if (-not (Test-Path -LiteralPath $Drive)) { Write-Warning 'Copia externa pendente; Drive Desktop indisponivel.'; return }
$remoto = Join-Path $Drive $nome
if (Test-Path -LiteralPath $remoto) { throw 'Destino remoto ja existe.' }
New-Item -ItemType Directory -Path $remoto | Out-Null
foreach ($arquivo in Get-ChildItem -LiteralPath $destino -File) {
 if ($arquivo.Extension -ne '.iib' -and $arquivo.Name -ne 'manifesto-storage.json') { throw 'Arquivo nao cifrado recusado na copia externa.' }
 Copy-Item -LiteralPath $arquivo.FullName -Destination $remoto
 if ((Get-FileHash -LiteralPath $arquivo.FullName).Hash -ne (Get-FileHash -LiteralPath (Join-Path $remoto $arquivo.Name)).Hash) { throw 'Hash da copia externa divergente.' }
}
Write-Output "STORAGE_CIFRADO_DRIVE_DESKTOP=$remoto"
