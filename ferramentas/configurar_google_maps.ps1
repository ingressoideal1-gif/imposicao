param()
$ErrorActionPreference = 'Stop'
# Apenas armazenamento local protegido. Nao publica, nao chama APIs e nao altera o banco.
Write-Host 'Informe a chave de NAVEGADOR restrita aos dominios do Imposition e as APIs de mapas.'
$segredoMapa = Read-Host 'Chave Google Maps (entrada oculta)' -AsSecureString
if ($segredoMapa.Length -eq 0) { throw 'Nenhuma chave informada.' }
$pastaMapa = Join-Path $env:LOCALAPPDATA 'IdealImposition\maps'
$arquivoMapa = Join-Path $pastaMapa 'google-maps-browser.clixml'
if (Test-Path -LiteralPath $arquivoMapa) { throw 'Ja existe uma chave protegida neste caminho. Preserve-a e informe que a configuracao ja existe.' }
New-Item -ItemType Directory -Path $pastaMapa -Force | Out-Null
$credencialMapa = New-Object System.Management.Automation.PSCredential('google-maps-browser', $segredoMapa)
try {
    $credencialMapa | Export-Clixml -LiteralPath $arquivoMapa
    Write-Host 'Chave armazenada com protecao do Windows. A ativacao das APIs e as restricoes ainda precisam ser verificadas.'
} finally {
    $credencialMapa = $null
    $segredoMapa.Dispose()
}
