param(
    [string]$ScriptBackup = (Join-Path $PSScriptRoot 'backup-estacao.ps1'),
    [string]$Python = (Join-Path (Split-Path -Parent $PSScriptRoot) '.venv\Scripts\python.exe'),
    [string]$Raiz = (Split-Path -Parent $PSScriptRoot),
    [string]$Horario = '20:00',
    [switch]$Aplicar
)
$ErrorActionPreference = 'Stop'
$nome = 'IdealImposition-BackupProtegido'
$usuario = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$scriptAbsoluto = [IO.Path]::GetFullPath($ScriptBackup)
$pythonAbsoluto = [IO.Path]::GetFullPath($Python)
$raizAbsoluta = [IO.Path]::GetFullPath($Raiz)
foreach ($path in @($scriptAbsoluto,$pythonAbsoluto)) { if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw 'Arquivo da automacao ausente.' } }
if (($scriptAbsoluto + $pythonAbsoluto + $raizAbsoluta) -match '["\r\n]') { throw 'Caminho invalido para o agendamento.' }
$argumentos = '-NoProfile -NonInteractive -File "' + $scriptAbsoluto + '" -Python "' + $pythonAbsoluto + '" -Raiz "' + $raizAbsoluta + '"'
$executavel = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
Write-Output "TAREFA=$nome; HORARIO=$Horario; USUARIO=$usuario; CONTA_LOGADA=sim"
if (-not $Aplicar) { Write-Output 'SIMULACAO: nenhuma tarefa registrada'; return }
if (Get-ScheduledTask -TaskName $nome -ErrorAction SilentlyContinue) { throw 'Tarefa ja existe; nao sera sobrescrita.' }
$acao = New-ScheduledTaskAction -Execute $executavel -Argument $argumentos -WorkingDirectory $raizAbsoluta
$gatilho = New-ScheduledTaskTrigger -Daily -At $Horario
$principal = New-ScheduledTaskPrincipal -UserId $usuario -LogonType Interactive -RunLevel Limited
$config = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 60) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName $nome -Action $acao -Trigger $gatilho -Principal $principal -Settings $config -Description 'Backup Git cifrado e copia no Google Drive Desktop; sem credenciais de nuvem; chave separada; sem exclusao automatica.' | Select-Object TaskName,State
