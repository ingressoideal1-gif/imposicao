<# Aplicador exclusivo da restricao DELETE anon em pagamentos. Sem -Executar: previa. #>
[CmdletBinding()]
param(
    [switch]$Executar,
    [string]$CredencialProtegida,
    [string]$RevisaoConsumidores,
    [string]$Diretorio = 'C:\ProjetosLocais\auditorias-rls\e-deal'
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$raizRls = Split-Path -Parent $PSScriptRoot
$sqlPathRls = Join-Path $raizRls 'sql\auditoria_rls\04_pagamentos_sem_delete_anon.sql'
$hashRls = 'F38BCEF9588799ECFA6220E1A5443A7AE9E82F849EEE263962A87A22CE27D441'
if ((Get-FileHash -LiteralPath $sqlPathRls -Algorithm SHA256).Hash -cne $hashRls) {
    throw 'SQL divergente da versao testada; revisar e testar antes de aplicar.'
}
Write-Output 'Alvo: e-deal / producao / vwbtitjlpelrcnsytzqw / public.pagamentos_v2.'
Write-Output 'Efeito: revogar somente DELETE direto de anon. Zero linhas comerciais modificadas.'
Write-Output 'SELECT e privilegios authenticated/service_role preservados por assercoes transacionais.'
Write-Output 'Falha antes de COMMIT reverte a transacao. Nao reabrir anon automaticamente apos COMMIT.'
if (-not $Executar) { Write-Output 'PREVIA: sem rede ou leitura de credencial.'; return }
if ([string]::IsNullOrWhiteSpace($RevisaoConsumidores)) { throw 'Informe a evidencia de revisao dos consumidores.' }
if ([string]::IsNullOrWhiteSpace($CredencialProtegida)) { throw 'Informe o arquivo protegido do projeto.' }
if ($env:OS -ne 'Windows_NT') { throw 'Credencial protegida exige Windows.' }

# O coletor confirma o alvo e recusa evidencias dentro de Git antes de qualquer escrita remota.
& (Join-Path $PSScriptRoot 'coletar_rls.ps1') -Executar -CredencialProtegida $CredencialProtegida -Diretorio $Diretorio
$destinoRls = [IO.Path]::GetFullPath($Diretorio)
$loteRls = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ') + '-' + [Guid]::NewGuid().ToString('N')
function Salvar-ReciboRls($Nome, $Objeto) {
    $pathRls = Join-Path $destinoRls ($loteRls + '-' + $Nome + '.json')
    $bytesRls = [Text.UTF8Encoding]::new($false).GetBytes(($Objeto | ConvertTo-Json -Depth 8))
    $streamRls = [IO.File]::Open($pathRls,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
    try { $streamRls.Write($bytesRls,0,$bytesRls.Length) } finally { $streamRls.Dispose() }
    Write-Output "Registro local: $pathRls"
}
$credencialRls = $null
$headersRls = $null
$enviadoRls = $false
try {
    $credencialRls = Import-Clixml -LiteralPath $CredencialProtegida
    if ($credencialRls -isnot [Management.Automation.PSCredential] -or $credencialRls.UserName -cne 'vwbtitjlpelrcnsytzqw') { throw 'Credencial divergente.' }
    $headersRls = @{ Authorization = 'Bearer ' + $credencialRls.GetNetworkCredential().Password }
    Salvar-ReciboRls 'intencao-pagamentos' @{
        projeto='vwbtitjlpelrcnsytzqw'; ambiente='producao'; hash_sql=$hashRls;
        efeito='REVOKE DELETE ON public.pagamentos_v2 FROM anon'; linhas_alteradas=0;
        revisao_consumidores=$RevisaoConsumidores; estado='preparado; ainda nao comprova execucao'
    }
    $sqlRls = "SET imposition.pagamentos_delete_anon_revisado = 'sim';`n" + [IO.File]::ReadAllText($sqlPathRls)
    $corpoRls = @{query=$sqlRls;read_only=$false} | ConvertTo-Json -Compress
    $enviadoRls = $true
    $null = Invoke-RestMethod -Method Post -Uri 'https://api.supabase.com/v1/projects/vwbtitjlpelrcnsytzqw/database/query' -Headers $headersRls -Body ([Text.Encoding]::UTF8.GetBytes($corpoRls)) -ContentType 'application/json' -TimeoutSec 60 -MaximumRedirection 0
    # Verificacao independente em consulta somente leitura; nunca testar DELETE em dados reais.
    $verificacaoRls = @"
BEGIN READ ONLY;
SELECT has_table_privilege('anon','public.pagamentos_v2','SELECT') AS anon_le,
       has_table_privilege('anon','public.pagamentos_v2','DELETE') AS anon_exclui,
       has_table_privilege('authenticated','public.pagamentos_v2','DELETE') AS autenticado_exclui,
       has_table_privilege('service_role','public.pagamentos_v2','DELETE') AS backend_exclui;
ROLLBACK;
"@
    $corpoRls = @{query=$verificacaoRls;read_only=$true} | ConvertTo-Json -Compress
    $resultadoRls = @(Invoke-RestMethod -Method Post -Uri 'https://api.supabase.com/v1/projects/vwbtitjlpelrcnsytzqw/database/query' -Headers $headersRls -Body ([Text.Encoding]::UTF8.GetBytes($corpoRls)) -ContentType 'application/json' -TimeoutSec 45 -MaximumRedirection 0)
    if ($resultadoRls.Count -ne 1 -or $resultadoRls[0].anon_le -ne $true -or $resultadoRls[0].anon_exclui -ne $false -or $resultadoRls[0].autenticado_exclui -ne $true -or $resultadoRls[0].backend_exclui -ne $true) { throw 'Pos-condicoes divergentes.' }
    Salvar-ReciboRls 'resultado-pagamentos' @{projeto='vwbtitjlpelrcnsytzqw';hash_sql=$hashRls;estado='verificado';privilegios=$resultadoRls[0]}
    Write-Output 'Restricao aplicada e verificada: anon sem DELETE; leituras e demais papeis preservados.'
} catch {
    if ($enviadoRls) {
        throw 'Aplicacao ou verificacao interrompida. O COMMIT pode ter ocorrido: conferir metadados antes de repetir. Nao reabrir anon. Detalhes privados omitidos.'
    }
    throw 'Preparacao interrompida antes do envio SQL; detalhes privados omitidos.'
} finally {
    if ($headersRls) { $headersRls.Clear() }
    if ($credencialRls -is [Management.Automation.PSCredential]) { $credencialRls.Password.Dispose() }
}
