$ErrorActionPreference = 'Stop'
$scriptRls = Join-Path (Split-Path -Parent $PSScriptRoot) 'ferramentas\configurar_acesso_rls.ps1'
$global:falhaAcessoRls = $false
$global:gravouAcessoRls = $false
function Read-Host { param($Prompt, [switch]$AsSecureString) ConvertTo-SecureString 'somente-token-sintetico' -AsPlainText -Force }
function Invoke-RestMethod {
    param($Method,$Uri,$Headers,$TimeoutSec,$MaximumRedirection)
    if ($Method -ne 'Get' -or $Uri -cne 'https://api.supabase.com/v1/projects/vwbtitjlpelrcnsytzqw' -or $MaximumRedirection -ne 0) { throw 'Requisicao inesperada' }
    if ($global:falhaAcessoRls) { throw 'somente-token-sintetico' }
    [pscustomobject]@{ ref = 'vwbtitjlpelrcnsytzqw'; name = 'e-deal' }
}
function Export-Clixml {
    param([Parameter(ValueFromPipeline)]$InputObject,$LiteralPath,[switch]$NoClobber)
    process {
        if (-not $NoClobber -or $InputObject.UserName -cne 'vwbtitjlpelrcnsytzqw') { throw 'Destino incorreto' }
        $xmlRls = [Management.Automation.PSSerializer]::Serialize($InputObject)
        if ($xmlRls.Contains('somente-token-sintetico')) { throw 'Segredo em texto aberto' }
        $voltaRls = [Management.Automation.PSSerializer]::Deserialize($xmlRls)
        if ($voltaRls.GetNetworkCredential().Password -cne 'somente-token-sintetico') { throw 'Falha DPAPI' }
        $global:gravouAcessoRls = $true
    }
}
$saidaRls = & $scriptRls
if (-not $global:gravouAcessoRls -or ($saidaRls -join '').Contains('somente-token-sintetico')) { throw 'Falha na protecao' }
$global:falhaAcessoRls = $true
$global:gravouAcessoRls = $false
$recusouRls = $false
try { & $scriptRls } catch {
    $recusouRls = $true
    if ($_.Exception.Message.Contains('somente-token-sintetico')) { throw 'Erro exposto' }
}
if (-not $recusouRls -or $global:gravouAcessoRls) { throw 'Gravou credencial recusada' }
Write-Output 'Entrada oculta, DPAPI e recusa HTTP aprovados; sem rede ou gravacao de credencial.'
