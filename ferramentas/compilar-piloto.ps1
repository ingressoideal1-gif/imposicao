param([Parameter(Mandatory)][string]$Python, [string]$Saida = '', [switch]$PermitirPainel)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
$Python = (Resolve-Path -LiteralPath $Python).Path
if (-not $Saida) { $Saida = Join-Path $raiz 'dist\piloto' }
$Saida = [IO.Path]::GetFullPath($Saida)
New-Item -ItemType Directory -Path $Saida -Force | Out-Null
Push-Location $raiz
try {
    $argumentos = @('ferramentas/entrega_impacto.py', 'preparar', '--saida', $Saida)
    if ($PermitirPainel) { $argumentos += '--permitir-painel' }
    & $Python @argumentos
    if ($LASTEXITCODE -ne 0) { throw 'Falha preparando entrega do Piloto.' }
    $resultado = Get-Content -Raw -LiteralPath (Join-Path $Saida 'resultado-entrega.json') | ConvertFrom-Json
    if (-not $PermitirPainel) {
        # Contrato antigo do publicar_agente.ps1: exige EXE completo neste caminho.
        foreach ($nome in @('NewProdPiloto.exe', 'manifesto-piloto.json')) {
            Copy-Item -LiteralPath (Join-Path $resultado.destino $nome) -Destination (Join-Path $Saida $nome) -Force
        }
    }
    Write-Host "  Piloto: $($resultado.acao); $($resultado.segundos)s; $($resultado.destino)"
} finally {
    Pop-Location
}
