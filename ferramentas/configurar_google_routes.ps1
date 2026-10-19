<# Configura somente os dois segredos do calculo de previsoes no projeto e-deal. #>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:OS -ne 'Windows_NT') { throw 'Execute no Windows com o usuario que configurou o acesso Supabase.' }
$headersRoutes = $null
$chaveRoutes = $null
$seguroRoutes = $null
$corpoRoutes = $null
$credencialRoutes = $null
$etapaRoutes = 'leitura da credencial protegida'
try {
    $pastaRoutes = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'IdealImposition\rls'
    $arquivoRoutes = Get-ChildItem -LiteralPath $pastaRoutes -Filter 'e-deal-*.clixml' -File | Sort-Object Name -Descending | Select-Object -First 1
    if (-not $arquivoRoutes) { throw 'Credencial ausente.' }
    $credencialRoutes = Import-Clixml -LiteralPath $arquivoRoutes.FullName
    if ($credencialRoutes -isnot [Management.Automation.PSCredential] -or $credencialRoutes.UserName -cne 'vwbtitjlpelrcnsytzqw') { throw 'Credencial divergente.' }
    $headersRoutes = @{ Authorization = 'Bearer ' + $credencialRoutes.GetNetworkCredential().Password }
    $baseRoutes = 'https://api.supabase.com/v1/projects/vwbtitjlpelrcnsytzqw'
    $etapaRoutes = 'validacao do projeto'
    $projetoRoutes = Invoke-RestMethod -Method Get -Uri $baseRoutes -Headers $headersRoutes -TimeoutSec 30 -MaximumRedirection 0
    $refRoutes = if ($projetoRoutes.PSObject.Properties['ref']) { $projetoRoutes.ref } else { $projetoRoutes.id }
    if ($refRoutes -cne 'vwbtitjlpelrcnsytzqw' -or $projetoRoutes.name -ine 'e-deal') { throw 'Projeto divergente.' }
    Write-Host 'Destino: Supabase e-deal. Configura GOOGLE_ROUTES_API_KEY e VIBE_ROUTES_ENABLED. Nao altera pedidos ou tabelas.'
    $etapaRoutes = 'entrada oculta da chave Google'
    $seguroRoutes = Read-Host 'Cole a NOVA chave Google Routes do servidor (entrada oculta)' -AsSecureString
    $chaveRoutes = [Net.NetworkCredential]::new('', $seguroRoutes).Password.Trim()
    if ($chaveRoutes -notmatch '^AIza[0-9A-Za-z_-]{35}$') { throw 'Formato invalido.' }
    $corpoRoutes = @(@{name='GOOGLE_ROUTES_API_KEY';value=$chaveRoutes}, @{name='VIBE_ROUTES_ENABLED';value='true'}) | ConvertTo-Json -Compress
    $etapaRoutes = 'gravacao dos segredos'
    $null = Invoke-RestMethod -Method Post -Uri ($baseRoutes + '/secrets') -Headers $headersRoutes -ContentType 'application/json' -Body $corpoRoutes -TimeoutSec 30 -MaximumRedirection 0
    $etapaRoutes = 'verificacao dos nomes dos segredos'
    $nomesRoutes = @(Invoke-RestMethod -Method Get -Uri ($baseRoutes + '/secrets') -Headers $headersRoutes -TimeoutSec 30 -MaximumRedirection 0 | ForEach-Object { $_.name })
    if ('GOOGLE_ROUTES_API_KEY' -notin $nomesRoutes -or 'VIBE_ROUTES_ENABLED' -notin $nomesRoutes) { throw 'Verificacao incompleta.' }
    Write-Output 'Chave Google Routes configurada no servidor.'
    Write-Output 'A ativacao das previsoes ainda depende da publicacao da implementacao. Nenhuma entrega foi alterada.'
} catch {
    $statusRoutes = 'indisponivel'
    if ($_.Exception.PSObject.Properties['Response'] -and $_.Exception.Response -and $_.Exception.Response.PSObject.Properties['StatusCode']) {
        $statusRoutes = [string][int]$_.Exception.Response.StatusCode
    }
    throw "Configuracao interrompida na etapa '$etapaRoutes' (HTTP $statusRoutes). Valores e resposta omitidos. HTTP 401/403: confira a permissao edge_functions_secrets_write e reconfigure o token pelo configurar_acesso_rls.ps1. Como alternativa, configure os dois segredos pelo painel Supabase, em Edge Functions > Secrets."
} finally {
    if ($headersRoutes) { $headersRoutes.Clear() }
    $corpoRoutes = $null
    $chaveRoutes = $null
    if ($seguroRoutes) { $seguroRoutes.Dispose() }
    if ($credencialRoutes -is [Management.Automation.PSCredential]) { $credencialRoutes.Password.Dispose() }
}
