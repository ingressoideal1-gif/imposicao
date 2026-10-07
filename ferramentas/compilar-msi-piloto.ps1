param([Parameter(Mandatory)][string]$Python, [Parameter(Mandatory)][string]$ExecutavelPiloto,
      [Parameter(Mandatory)][string]$Wix)
$ErrorActionPreference='Stop'
$raiz=Split-Path -Parent $PSScriptRoot
Push-Location $raiz
try {
 $Python=(Resolve-Path -LiteralPath $Python).Path
 $ExecutavelPiloto=(Resolve-Path -LiteralPath $ExecutavelPiloto).Path
 $shaEsperado='8c17bacae50bff20ce8fcf105e3a56bc979d4c9ed5129948dfc033ca87d39b64'
 if((Get-FileHash -LiteralPath $ExecutavelPiloto).Hash.ToLowerInvariant() -ne $shaEsperado){throw 'Executavel diferente da versao .29 auditada'}
 $saida=Join-Path $raiz 'dist\msi-piloto'
 if(Test-Path -LiteralPath $saida){throw 'Saida ja existe; preserve o pacote e use outro checkout para nova revisao'}
 New-Item -ItemType Directory -Path $saida | Out-Null
 & $Python -m PyInstaller --onefile --noconsole --name IniciarNewProdPiloto --distpath $saida --workpath build\instalador-piloto --specpath build --exclude-module acesso_segredo piloto_instalacao.py
 if($LASTEXITCODE -ne 0){throw 'Compilacao do inicializador falhou'}
 & $Python ferramentas/conferir_pacote_agente.py --exe $ExecutavelPiloto --migrador (Join-Path $saida 'IniciarNewProdPiloto.exe')
 if($LASTEXITCODE -ne 0){throw 'Conferencia dos executaveis falhou'}
 Copy-Item -LiteralPath $ExecutavelPiloto -Destination (Join-Path $saida 'NewProdPiloto.exe')
 @{canal='piloto';porta=9001;versao='1.2.363-piloto-local.29';executavel='NewProdPiloto.exe';sha256=$shaEsperado;
   commit='3833d9292185c782e02f68df168e641597440bc1';painel='v1034'} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $saida 'pacote-piloto.json') -Encoding UTF8
 Copy-Item -LiteralPath 'docs\instalar-piloto-msi.txt' -Destination (Join-Path $saida 'LEIA-ME.txt')
 & (Join-Path $Wix 'candle.exe') -nologo ('-dPacote='+$saida) piloto_installer.wxs -out (Join-Path $saida 'piloto.wixobj')
 if($LASTEXITCODE -ne 0){throw 'Compilacao WiX falhou'}
 $msi=Join-Path $saida 'NewProdPiloto_Setup_v1.2.363.29.msi'
 & (Join-Path $Wix 'light.exe') -nologo -sval -ext WixUIExtension (Join-Path $saida 'piloto.wixobj') -out $msi
 if($LASTEXITCODE -ne 0){throw 'Geracao MSI falhou'}
 @{arquivo=$msi;bytes=(Get-Item -LiteralPath $msi).Length;sha256=(Get-FileHash -LiteralPath $msi).Hash.ToLowerInvariant()} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $saida 'evidencia-msi.json') -Encoding UTF8
 Get-Content -LiteralPath (Join-Path $saida 'evidencia-msi.json')
} finally {Pop-Location}
