param([string]$PastaPiloto = (Join-Path $env:LOCALAPPDATA 'NewProd Piloto'), [switch]$AbrirPainel)
$ErrorActionPreference = 'Stop'
if ($env:COMPUTERNAME -ne 'PC-JR-HOME') { throw 'Inicializador exclusivo da estacao piloto.' }
 $raizPiloto = [IO.Path]::GetFullPath($PastaPiloto)
 $ativa = Get-Content -LiteralPath (Join-Path $raizPiloto 'versao-ativa.json') -Raw | ConvertFrom-Json
 $Executavel = [IO.Path]::GetFullPath((Join-Path $raizPiloto $ativa.executavel))
 if (-not $Executavel.StartsWith($raizPiloto + '\versoes\', [StringComparison]::OrdinalIgnoreCase) -or
     [IO.Path]::GetFileName($Executavel) -ne 'NewProdPiloto.exe') { throw 'Executavel fora da instalacao independente.' }
 if ((Get-FileHash -LiteralPath $Executavel -Algorithm SHA256).Hash -ne $ativa.sha256) { throw 'Executavel do Piloto divergente.' }
$emExecucao = @(Get-Process -Name NewProdPiloto -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $Executavel })
if ($emExecucao.Count) {
    if ($AbrirPainel) { Start-Process 'http://127.0.0.1:9001/app/' }
    exit 0
}
if (Get-NetTCPConnection -LocalPort 9001 -State Listen -ErrorAction SilentlyContinue) { throw 'Porta 9001 ocupada; nenhuma instancia foi alterada.' }
$protegido = Get-Content -LiteralPath (Join-Path $PastaPiloto 'token-local.dpapi') -Raw
$seguro = ConvertTo-SecureString ($protegido.Trim())
$ponteiro = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($seguro)
$variaveis = @('NEWPROD_CANAL','NEWPROD_PILOTO_TOKEN','NEWPROD_PILOTO_LOCAL','NEWPROD_PILOTO_AUTONOMO','NEWPROD_PILOTO_EMPRESA','NEWPROD_PILOTO_ESTACAO','NEWPROD_PILOTO_RAIZ','NEWPROD_PILOTO_PAUSADO')
$anteriores = @{}
foreach($nome in $variaveis) { $anteriores[$nome] = [Environment]::GetEnvironmentVariable($nome, 'Process') }
try {
    $env:NEWPROD_CANAL = 'piloto'
    $env:NEWPROD_PILOTO_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ponteiro)
    $env:NEWPROD_PILOTO_LOCAL = '1'
    $env:NEWPROD_PILOTO_AUTONOMO = '1'
    $env:NEWPROD_PILOTO_EMPRESA = 'Ingresso Ideal'
    $env:NEWPROD_PILOTO_ESTACAO = 'PC-JR-HOME'
    $env:NEWPROD_PILOTO_RAIZ = Join-Path $PastaPiloto 'dados'
    $env:NEWPROD_PILOTO_PAUSADO = '1'
    Start-Process -FilePath $Executavel -WorkingDirectory (Split-Path -Parent $Executavel) -WindowStyle Hidden
    if ($AbrirPainel) {
        for($tentativa=0; $tentativa -lt 30; $tentativa++) {
            try {
                $status=Invoke-RestMethod 'http://127.0.0.1:9001/api/status' -TimeoutSec 2
                if($status.canal -eq 'piloto') { Start-Process 'http://127.0.0.1:9001/app/'; break }
            } catch { Start-Sleep -Seconds 1 }
        }
    }
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ponteiro)
    foreach($nome in $variaveis) { [Environment]::SetEnvironmentVariable($nome, $anteriores[$nome], 'Process') }
}
