"""Instala uma versao conferida; encerra somente o executavel desta conta."""
import base64
import os
from pathlib import Path
import subprocess


def literal(valor):
    return "'" + str(valor).replace("'", "''") + "'"


def script(msi, exe, versao, pid, pai):
    msi, exe = Path(msi).absolute(), Path(exe).absolute()
    log = exe.parent / ('update-' + versao + '.log')
    estado = exe.parent / 'ultimo_update.json'
    return f"""$ErrorActionPreference='Stop'
$alvoExe={literal(exe)}
$alvoMsi={literal(msi)}
Start-Sleep -Seconds 3
foreach ($alvoPid in @({int(pid)},{int(pai)})) {{
    $p=Get-CimInstance Win32_Process -Filter ('ProcessId='+$alvoPid)
    if ($p -and $p.ExecutablePath -ieq $alvoExe) {{ Stop-Process -Id $alvoPid -Force -ErrorAction Stop }}
}}
Start-Sleep -Seconds 2
$argsMsi='/i "'+$alvoMsi+'" /qn /norestart /L*v "'+{literal(log)}+'"'
$inst=Start-Process -FilePath 'msiexec.exe' -ArgumentList $argsMsi -Wait -PassThru -WindowStyle Hidden
if ($inst.ExitCode -notin @(0,3010)) {{
    $r=@{{quando=[DateTime]::UtcNow.ToString('o');etapa='instalacao_falhou';versao_alvo={literal(versao)};erro=('MSI '+$inst.ExitCode)}} | ConvertTo-Json
    [IO.File]::WriteAllText({literal(estado)},$r,(New-Object Text.UTF8Encoding($false)))
}}
foreach ($n in @('_PYI_APPLICATION_HOME_DIR','_PYI_ARCHIVE_FILE','_PYI_PARENT_PROCESS_LEVEL','_MEIPASS2')) {{ [Environment]::SetEnvironmentVariable($n,$null,'Process') }}
Start-Process -FilePath $alvoExe -WorkingDirectory (Split-Path -Parent $alvoExe) -WindowStyle Hidden
"""


def iniciar(msi, exe, versao):
    texto = script(msi, exe, versao, os.getpid(), os.getppid())
    encoded = base64.b64encode(texto.encode('utf-16-le')).decode('ascii')
    subprocess.Popen(['powershell.exe', '-NoProfile', '-NonInteractive', '-EncodedCommand', encoded],
                     creationflags=subprocess.CREATE_NO_WINDOW)
