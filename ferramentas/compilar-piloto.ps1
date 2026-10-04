param([Parameter(Mandatory)][string]$Python, [string]$Saida = '')
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$Python = (Resolve-Path -LiteralPath $Python).Path
if (-not $Saida) { $Saida = Join-Path $raiz 'dist\piloto' }
$Saida = [IO.Path]::GetFullPath($Saida)
New-Item -ItemType Directory -Path $Saida -Force | Out-Null
Push-Location $raiz
$canalAnterior = $env:NEWPROD_BUILD_PILOTO
try {
    $env:NEWPROD_BUILD_PILOTO = '1'
    & $Python -m PyInstaller --noconfirm --distpath $Saida --workpath (Join-Path $Saida 'build') agent_tray.spec
    if ($LASTEXITCODE -ne 0) { throw 'Falha compilando Piloto independente.' }
    $executavel = Join-Path $Saida 'NewProdPiloto.exe'
    & $Python ferramentas/conferir_pacote_agente.py --exe $executavel
    if ($LASTEXITCODE -ne 0) { throw 'Piloto recusado pela conferencia de segredos.' }
    $manifesto = [ordered]@{ canal='piloto'; executavel='NewProdPiloto.exe';
        sha256=(Get-FileHash -LiteralPath $executavel -Algorithm SHA256).Hash.ToLowerInvariant();
        bytes=(Get-Item -LiteralPath $executavel).Length;
        commit=([string](git rev-parse HEAD)).Trim();
        gerado_em=(Get-Date).ToString('o'); porta=9001 }
    $manifesto | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $Saida 'manifesto-piloto.json') -Encoding UTF8
    $manifesto | ConvertTo-Json -Compress
} finally {
    $env:NEWPROD_BUILD_PILOTO = $canalAnterior
    Pop-Location
}
