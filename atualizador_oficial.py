"""Instala uma versao conferida; encerra somente o executavel desta conta."""
import base64
import hashlib
import os
from pathlib import Path
import subprocess


def literal(valor):
    return "'" + str(valor).replace("'", "''") + "'"


def script(msi, exe, versao, pid, pai):
    msi, exe = Path(msi).absolute(), Path(exe).absolute()
    log = exe.parent / ('update-' + versao + '.log')
    estado = exe.parent / 'ultimo_update.json'
    recibo = exe.parent / 'oficial-validado.json'
    trava = 'Local\\NewProdUpdate-' + hashlib.sha256(str(exe).casefold().encode()).hexdigest()[:24]
    return f"""$ErrorActionPreference='Stop'
$alvoExe={literal(exe)}
$alvoMsi={literal(msi)}
$mutex=New-Object Threading.Mutex($false,{literal(trava)})
$tomada=$false
try {{ $tomada=$mutex.WaitOne(0) }} catch [Threading.AbandonedMutexException] {{ $tomada=$true }}
if (-not $tomada) {{ $mutex.Dispose(); exit 0 }}
function Registrar([string]$etapa,[string]$erro) {{
    $r=@{{quando=[DateTime]::UtcNow.ToString('o');etapa=$etapa;versao_alvo={literal(versao)};erro=$erro}} | ConvertTo-Json
    $arquivo={literal(estado)}
    $temporario=$arquivo+'.'+$PID+'.tmp'
    [IO.File]::WriteAllText($temporario,$r,(New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $temporario -Destination $arquivo -Force
}}
$reiniciar=$false
$fase='preparacao'
try {{
# Limpar ANTES do MSI, que tambem executa um helper PyInstaller.
foreach ($n in @('_PYI_APPLICATION_HOME_DIR','_PYI_ARCHIVE_FILE','_PYI_PARENT_PROCESS_LEVEL','_MEIPASS2')) {{ [Environment]::SetEnvironmentVariable($n,$null,'Process') }}
[Environment]::SetEnvironmentVariable('PYINSTALLER_RESET_ENVIRONMENT','1','Process')
Start-Sleep -Seconds 3
$fase='encerramento'
$reiniciar=$true
foreach ($alvoPid in @({int(pid)},{int(pai)})) {{
    $p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$alvoPid)
    if ($p -and $p.ExecutablePath -ieq $alvoExe) {{
        Stop-Process -Id $alvoPid -Force -ErrorAction Stop
        Wait-Process -Id $alvoPid -Timeout 30 -ErrorAction SilentlyContinue
    }}
}}
if (@(Get-CimInstance Win32_Process | Where-Object {{ $_.ExecutablePath -ieq $alvoExe }}).Count -gt 0) {{
    $reiniciar=$false
    Registrar 'instalacao_nao_confirmada' 'agente_ainda_executando'
    return
}}
$argsMsi='/i "'+$alvoMsi+'" /qn /norestart /L*v "'+{literal(log)}+'"'
$fase='execucao_msi'
$inst=Start-Process -FilePath 'msiexec.exe' -ArgumentList $argsMsi -Wait -PassThru -WindowStyle Hidden
if ($inst.ExitCode -notin @(0,3010)) {{
    Registrar 'instalacao_falhou' ('MSI '+$inst.ExitCode)
    return
}}
Registrar 'validacao_pendente' ''
$inicio=[DateTime]::UtcNow
$fase='reinicio'
Start-Process -FilePath $alvoExe -WorkingDirectory (Split-Path -Parent $alvoExe) -WindowStyle Hidden
$reiniciar=$false
$fase='confirmacao'
$fim=$inicio.AddSeconds(120)
do {{
    Start-Sleep -Seconds 2
    try {{
        $prova=Get-Content -LiteralPath {literal(recibo)} -Raw | ConvertFrom-Json
        if ($prova.versao -eq {literal(versao)} -and $prova.painel_validado -eq $true -and
            [DateTime]::Parse($prova.quando).ToUniversalTime() -ge $inicio) {{
            Registrar 'validado' ''
            return
        }}
    }} catch {{ }}
}} while ([DateTime]::UtcNow -lt $fim)
Registrar 'validacao_pendente' 'sem_confirmacao_apos_reinicio'
}} catch {{
    Registrar 'instalacao_nao_confirmada' ('falha_'+$fase)
}} finally {{
    try {{
        if ($reiniciar) {{
            try {{ Start-Process -FilePath $alvoExe -WorkingDirectory (Split-Path -Parent $alvoExe) -WindowStyle Hidden }}
            catch {{ Registrar 'reinicio_falhou' 'executavel_nao_iniciou' }}
        }}
    }} finally {{ $mutex.ReleaseMutex(); $mutex.Dispose() }}
}}
"""


def iniciar(msi, exe, versao):
    texto = script(msi, exe, versao, os.getpid(), os.getppid())
    encoded = base64.b64encode(texto.encode('utf-16-le')).decode('ascii')
    subprocess.Popen(['powershell.exe', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
                     creationflags=subprocess.CREATE_NO_WINDOW)
