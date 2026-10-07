import base64
from pathlib import Path
import subprocess
import atualizador_oficial as a


def test_script_tem_escopo_por_pid_log_e_reinicio_limpo(tmp_path):
    exe=tmp_path/'Nome com espaco'/'NewProd.exe'
    texto=a.script(tmp_path/'nova.msi',exe,'1.2.367',123,122)
    assert '@(123,122)' in texto
    assert '$p.ExecutablePath -ieq $alvoExe' in texto
    assert 'taskkill' not in texto and '/IM' not in texto
    assert '/norestart /L*v' in texto
    assert "etapa='instalacao_falhou'" in texto
    assert texto.index('_PYI_ARCHIVE_FILE') < texto.index('Start-Process -FilePath $alvoExe')
    assert a.literal("D'Agua") == "'D''Agua'"


def test_powershell_do_updater_compila_sem_executar(tmp_path):
    texto=a.script(tmp_path/"D'Agua $x"/'nova.msi',tmp_path/'NewProd.exe','1.2.367',123,122)
    arquivo=tmp_path/'verificar.ps1';arquivo.write_text(texto,encoding='utf-8-sig')
    # Apenas parser AST, nao executa script nem para processo.
    cmd="$e=$null;$t=$null;[System.Management.Automation.Language.Parser]::ParseFile("+a.literal(arquivo)+",[ref]$t,[ref]$e)|Out-Null;if($e.Count){$e|Out-String|Write-Output;exit 1}"
    r=subprocess.run(['powershell','-NoProfile','-EncodedCommand',base64.b64encode(cmd.encode('utf-16-le')).decode()],capture_output=True,text=True)
    assert r.returncode==0,r.stdout+r.stderr
