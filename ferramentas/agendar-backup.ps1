param(
    [string]$ScriptBackup = (Join-Path $PSScriptRoot 'backup-estacao.ps1'),
    [string]$Python = (Join-Path (Split-Path -Parent $PSScriptRoot) '.venv\Scripts\python.exe'),
    [string]$Raiz = (Split-Path -Parent $PSScriptRoot),
    [string]$Horario = '20:00',
    [switch]$Aplicar,
    [switch]$Atualizar
)
$ErrorActionPreference = 'Stop'
$nome = 'IdealImposition-BackupProtegido'
$identidadeBackup = [Security.Principal.WindowsIdentity]::GetCurrent()
$usuario = $identidadeBackup.Name
$scriptAbsoluto = [IO.Path]::GetFullPath($ScriptBackup)
$pythonAbsoluto = [IO.Path]::GetFullPath($Python)
$raizAbsoluta = [IO.Path]::GetFullPath($Raiz)
foreach ($path in @($scriptAbsoluto,$pythonAbsoluto)) { if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Arquivo da automacao ausente.' } }
if (($scriptAbsoluto + $pythonAbsoluto + $raizAbsoluta) -match '["\r\n]') { throw 'Caminho invalido para o agendamento.' }
$argumentos = '-NoProfile -NonInteractive -File "' + $scriptAbsoluto + '" -Python "' + $pythonAbsoluto + '" -Raiz "' + $raizAbsoluta + '" -Ensaiar'
$executavel = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
Write-Output "TAREFA=$nome; HORARIO=$Horario; USUARIO=$usuario; CONTA_LOGADA=sim"
if (-not $Aplicar) { Write-Output 'SIMULACAO: nenhuma tarefa registrada'; return }
$acao = New-ScheduledTaskAction -Execute $executavel -Argument $argumentos -WorkingDirectory $raizAbsoluta
$existente = Get-ScheduledTask -TaskName $nome -ErrorAction SilentlyContinue
if ($Atualizar) {
    if (-not $existente) { throw 'Tarefa ausente; use o cadastro inicial.' }
    $conta = [string]$existente.Principal.UserId
    if ($conta -match '^S-1-') { $sidTarefa = $conta }
    else { $sidTarefa = ([Security.Principal.NTAccount]::new($conta)).Translate([Security.Principal.SecurityIdentifier]).Value }
    if ($sidTarefa -ne $identidadeBackup.User.Value) { throw 'A tarefa pertence a outra conta; atualizacao interrompida.' }
    Set-ScheduledTask -TaskName $nome -Action $acao | Select-Object TaskName,State
    return
}
if ($existente) { throw 'Tarefa ja existe; use -Atualizar para trocar somente a acao e preservar os gatilhos.' }
$gatilho = New-ScheduledTaskTrigger -Daily -At $Horario
$principal = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Limited
$config = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 60) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilho -Principal $principal -Settings $config -Description 'Backup Git cifrado e copia no Google Drive Desktop; sem credenciais de nuvem; chave separada; sem exclusao automatica.' | Select-Object TaskName,State
