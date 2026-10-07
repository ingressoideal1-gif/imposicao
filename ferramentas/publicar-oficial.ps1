param([Parameter(Mandatory)][ValidatePattern('^\d+\.\d+\.\d+$')][string]$Versao,
      [string]$Notas='', [string[]]$Estacoes=@(), [switch]$Simular, [switch]$BootstrapLegado)
$ErrorActionPreference='Stop'
$raiz=Split-Path -Parent $PSScriptRoot
Push-Location $raiz
try {
 if(-not $Simular -and -not $env:SUPABASE_SERVICE_KEY){throw 'Credencial de publicacao deve estar no ambiente antes de iniciar; nao inclua a chave no comando ou no Git'}
 $python=Join-Path $raiz '.venv\Scripts\python.exe'
 if(-not(Test-Path -LiteralPath $python)){throw 'Ambiente Python do projeto ausente'}
 $msi=Join-Path $raiz ('dist\NewProdPiloto_Oficial_v'+$Versao+'.msi')
 if(Test-Path -LiteralPath $msi){throw 'Pacote ja existe; preserve os bytes e use publicar_pacote_oficial.py para retomar a publicacao'}
 $utf8=New-Object Text.UTF8Encoding($false)
 $arquivo=Join-Path $raiz 'agent_version.py'
 $texto=[IO.File]::ReadAllText($arquivo)
 $atual=[regex]::Match($texto,'AGENT_VERSION\s*=\s*"([\d.]+)"').Groups[1].Value
 if([version]$Versao -le [version]$atual){throw 'Nova versao deve superar a versao da fonte'}
 [IO.File]::WriteAllText($arquivo,[regex]::Replace($texto,'AGENT_VERSION\s*=\s*"[\d.]+"',('AGENT_VERSION = "'+$Versao+'"')),$utf8)
 $arquivo=Join-Path $raiz 'agent_installer.wxs'
 $texto=[IO.File]::ReadAllText($arquivo)
 [IO.File]::WriteAllText($arquivo,[regex]::Replace($texto,'(?<![A-Za-z])Version="\d+\.\d+\.\d+"',('Version="'+$Versao+'"')),$utf8)
 $arquivo=Join-Path $raiz 'compilar_msi.ps1'
 $texto=[IO.File]::ReadAllText($arquivo)
 [IO.File]::WriteAllText($arquivo,[regex]::Replace($texto,'NewProdPiloto_Oficial_v[\d.]+\.msi',('NewProdPiloto_Oficial_v'+$Versao+'.msi')),(New-Object Text.UTF8Encoding($true)))
 & $python ferramentas/conferir_duas_versoes.py
 if($LASTEXITCODE -ne 0){throw 'Regressoes de compatibilidade falharam'}
 & $python ferramentas/conferir_duas_versoes.py oficial
 if($LASTEXITCODE -ne 0){throw 'Regressoes do produto oficial falharam'}
 & .\build_agent.ps1
 if($LASTEXITCODE -ne 0){throw 'Build oficial falhou'}
 & .\compilar_msi.ps1
 if($LASTEXITCODE -ne 0){throw 'MSI oficial falhou'}
 if($Simular){Write-Host ('Pacote preparado sem publicacao: '+$msi);return}
 $argumentos=@('ferramentas/publicar_pacote_oficial.py','--msi',$msi,'--ativar')
 foreach($estacao in $Estacoes){$argumentos+=@('--estacao',$estacao)}
 if($BootstrapLegado){$argumentos+='--bootstrap-legado'}
 & $python @argumentos
 if($LASTEXITCODE -ne 0){throw 'Publicacao nao concluida; preserve o MSI para retomar'}
} finally {Pop-Location}
