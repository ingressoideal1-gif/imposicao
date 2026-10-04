param(
    [ValidateSet('estado','pausar','retomar')][string]$Acao = 'estado',
    [string]$PastaPiloto = (Join-Path $env:LOCALAPPDATA 'NewProd Piloto')
)
$ErrorActionPreference = 'Stop'
$seguro = ConvertTo-SecureString ((Get-Content -LiteralPath (Join-Path $PastaPiloto 'token-local.dpapi') -Raw).Trim())
$ponteiro = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
try {
    $headers = @{'X-NewProd-Piloto'=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiro)}
    $base = 'http://127.0.0.1:9001/api/pacotes-locais'
    if ($Acao -ne 'estado') {
        $pausar = if ($Acao -eq 'pausar') { 'true' } else { 'false' }
        $null = Invoke-RestMethod ($base + '/pausa/' + $pausar) -Method Post -Headers $headers -TimeoutSec 10
    }
    $estado = Invoke-RestMethod ($base + '/estado') -Headers $headers -TimeoutSec 15
    [pscustomobject]@{
        Empresa=$estado.empresa; Setor=$estado.setor
        Pausado=$estado.fila.pausado; Ocupado=$estado.fila.ocupado
        Coleta=$estado.coleta_autonoma.estado
        Modelos=@($estado.modelos).Count
        RecursosAntecipados=@($estado.modelos | Where-Object estado -eq 'recursos_antecipados').Count
        Pendentes=$estado.fila.pendentes
        ErroCatalogo=$estado.erro_catalogo
        ImpressaoOffline=$estado.execucao_offline
    } | Format-List
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiro)
    $headers = $null
}
