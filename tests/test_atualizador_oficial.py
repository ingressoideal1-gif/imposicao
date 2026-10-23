import base64
from pathlib import Path
import subprocess
import json
import pytest
import atualizador_oficial as a


def test_script_tem_escopo_por_pid_log_e_reinicio_limpo(tmp_path):
    exe=tmp_path/'Nome com espaco'/'NewProd.exe'
    texto=a.script(tmp_path/'nova.msi',exe,'1.2.367',123,122)
    assert '@(123,122)' in texto
    assert '$p.ExecutablePath -ieq $alvoExe' in texto
    assert 'taskkill' not in texto and '/IM' not in texto
    assert '/norestart /L*v' in texto
    assert "Registrar 'instalacao_falhou'" in texto
    assert texto.index('_PYI_ARCHIVE_FILE') < texto.index("Start-Process -FilePath 'msiexec.exe'")
    assert a.literal("D'Agua") == "'D''Agua'"


def test_powershell_do_updater_compila_sem_executar(tmp_path):
    texto=a.script(tmp_path/"D'Agua $x"/'nova.msi',tmp_path/'NewProd.exe','1.2.367',123,122)
    arquivo=tmp_path/'verificar.ps1';arquivo.write_text(texto,encoding='utf-8-sig')
    # Apenas parser AST, nao executa script nem para processo.
    cmd="$e=$null;$t=$null;[System.Management.Automation.Language.Parser]::ParseFile("+a.literal(arquivo)+",[ref]$t,[ref]$e)|Out-Null;if($e.Count){$e|Out-String|Write-Output;exit 1}"
    r=subprocess.run(['powershell','-NoProfile','-EncodedCommand',base64.b64encode(cmd.encode('utf-16-le')).decode()],capture_output=True,text=True)
    assert r.returncode==0,r.stdout+r.stderr


@pytest.mark.parametrize('codigo,confirma', [(0,True), (3010,True), (1603,True), (1618,True), (0,False)])
def test_fluxo_powershell_com_processos_simulados(tmp_path, codigo, confirma):
    exe = tmp_path/'NewProd.exe'
    recibo = tmp_path/'oficial-validado.json'
    chamadas = tmp_path/'chamadas.txt'
    # Nenhum msiexec, encerramento ou executavel real: comandos externos
    # substituidos por funcoes PowerShell no escopo do script.
    mocks = f"""
function Start-Sleep {{ param($Seconds) }}
function Get-CimInstance {{ param($ClassName,$Filter) }}
function Stop-Process {{ throw 'Nao deve encerrar processo real' }}
function Wait-Process {{ throw 'Nao deve esperar processo real' }}
function Start-Process {{
    param($FilePath,$ArgumentList,[switch]$Wait,[switch]$PassThru,$WindowStyle,$WorkingDirectory)
    if ($FilePath -eq 'msiexec.exe') {{
        if ($env:_PYI_ARCHIVE_FILE) {{ throw 'Ambiente contaminado antes do MSI' }}
        Add-Content -LiteralPath {a.literal(chamadas)} -Value 'msi'
        return [pscustomobject]@{{ExitCode={codigo}}}
    }}
    Add-Content -LiteralPath {a.literal(chamadas)} -Value 'reinicio'
    @{{versao={'"1.3.33"' if confirma else '"1.3.32"'};painel_validado=$true;quando=[DateTime]::UtcNow.ToString('o')}} |
        ConvertTo-Json | Set-Content -LiteralPath {a.literal(recibo)}
}}
$env:_PYI_ARCHIVE_FILE='antigo'
"""
    script = tmp_path/'simular.ps1'
    texto = a.script(tmp_path/'novo.msi',exe,'1.3.33',987654,987653)
    # Encurta apenas o prazo de confirmacao; nenhuma espera real no teste.
    script.write_text(mocks+texto.replace('AddSeconds(120)', 'AddSeconds(0)'), encoding='utf-8-sig')
    r = subprocess.run(['powershell','-NoProfile','-NonInteractive','-File',str(script)],
                       capture_output=True,text=True,timeout=20)
    assert r.returncode == 0, r.stdout+r.stderr
    estado = json.loads((tmp_path/'ultimo_update.json').read_text(encoding='utf-8-sig'))
    esperado = ('validado' if confirma else 'validacao_pendente') if codigo in (0,3010) else 'instalacao_falhou'
    assert estado['etapa'] == esperado
    if codigo not in (0,3010):
        assert estado['erro'] == f'MSI {codigo}'
    assert chamadas.read_text().splitlines() == ['msi','reinicio']
