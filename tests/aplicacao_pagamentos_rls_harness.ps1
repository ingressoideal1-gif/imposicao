# HTTP simulado; credencial sintetica DPAPI; nenhum acesso remoto.
param([ValidateSet('DELETE','TRUNCATE')][string]$Operacao='DELETE')
$ErrorActionPreference='Stop'
$aplicadorTeste=Join-Path (Split-Path -Parent $PSScriptRoot) 'ferramentas\aplicar_restricao_pagamentos_rls.ps1'
if ($Operacao -eq 'TRUNCATE') { $aplicadorTeste=Join-Path (Split-Path -Parent $PSScriptRoot) 'ferramentas\aplicar_restricao_truncate_pagamentos_rls.ps1' }
$global:operacaoAplicacao=$Operacao
$baseTeste=[IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
$pastaTeste=Join-Path $baseTeste ('imposition-aplicacao-rls-'+[Guid]::NewGuid().ToString('N'))
$global:cenarioAplicacao='sucesso'
$global:escritasAplicacao=0
$global:chamadasAplicacao=0
function Invoke-RestMethod {
    param($Method,$Uri,$Headers,$Body,$ContentType,$TimeoutSec,$MaximumRedirection)
    $global:chamadasAplicacao++
    if ($Uri -notlike 'https://api.supabase.com/v1/projects/vwbtitjlpelrcnsytzqw*' -or $MaximumRedirection -ne 0) { throw 'Alvo incorreto' }
    if ($Headers.Authorization -cne 'Bearer token-sintetico-aplicacao') { throw 'Credencial incorreta' }
    if ($Method -eq 'Get') {
        return [pscustomobject]@{ref='vwbtitjlpelrcnsytzqw';name=$(if ($global:cenarioAplicacao -eq 'alvo-errado') {'outro'} else {'e-deal'})}
    }
    $b=[Text.Encoding]::UTF8.GetString($Body)|ConvertFrom-Json
    if ($b.read_only -eq $false) {
        $global:escritasAplicacao++
        $nomeOperacao=$global:operacaoAplicacao.ToLowerInvariant()
        if ($b.query -notmatch "SET imposition.pagamentos_${nomeOperacao}_anon_revisado = 'sim';" -or $b.query -notmatch "REVOKE $global:operacaoAplicacao ON TABLE public.pagamentos_v2 FROM anon;") {throw 'SQL inesperado'}
        if ($global:cenarioAplicacao -eq 'falha-envio') {throw 'token-sintetico-aplicacao'}
        return @()
    }
    if ($b.query -match 'AS auditoria_rls;') { return [pscustomobject]@{auditoria_rls=@{formato='imposition-rls-v1';contexto=@{projeto='vwbtitjlpelrcnsytzqw';ambiente='producao';read_only=$true}}} }
    if ($b.query -match 'AS auditoria_buckets;') { return [pscustomobject]@{auditoria_buckets=@{formato='imposition-rls-buckets-v1';projeto='vwbtitjlpelrcnsytzqw';ambiente='producao';read_only=$true}} }
    if ($global:operacaoAplicacao -eq 'TRUNCATE') { return [pscustomobject]@{anon_le=$true;anon_esvazia=($global:cenarioAplicacao -eq 'verificacao-divergente');autenticado_esvazia=$true;backend_esvazia=$true} }
    return [pscustomobject]@{anon_le=$true;anon_exclui=($global:cenarioAplicacao -eq 'verificacao-divergente');autenticado_exclui=$true;backend_exclui=$true}
}
try {
    $null=& $aplicadorTeste
    if ($global:chamadasAplicacao -ne 0) {throw 'Previa fez rede'}
    [void][IO.Directory]::CreateDirectory($pastaTeste)
    $credTeste=Join-Path $pastaTeste 'sintetica.clixml'
    $s=ConvertTo-SecureString 'token-sintetico-aplicacao' -AsPlainText -Force
    [Management.Automation.PSCredential]::new('vwbtitjlpelrcnsytzqw',$s)|Export-Clixml -LiteralPath $credTeste
    foreach ($cenario in @('sucesso','alvo-errado','falha-envio','verificacao-divergente')) {
        $global:cenarioAplicacao=$cenario
        $global:escritasAplicacao=0
        $destino=Join-Path $pastaTeste $cenario
        $falhou=$false
        try {$null=& $aplicadorTeste -Executar -CredencialProtegida $credTeste -RevisaoConsumidores 'Cenario sintetico' -Diretorio $destino} catch {
            $falhou=$true
            if ($_.Exception.Message.Contains('token-sintetico-aplicacao')) {throw 'Segredo exposto'}
            if ($cenario -in @('falha-envio','verificacao-divergente') -and $_.Exception.Message -notmatch 'COMMIT pode ter ocorrido') {throw 'Resultado incerto ocultado'}
        }
        if (($cenario -eq 'sucesso') -eq $falhou) {throw "Resultado inesperado: $cenario"}
        $esperado=if ($cenario -eq 'alvo-errado') {0} else {1}
        if ($global:escritasAplicacao -ne $esperado) {throw 'Escrita repetida ou alvo errado'}
        $filtro=if ($Operacao -eq 'TRUNCATE') {'*resultado-truncate-pagamentos.json'} else {'*resultado-pagamentos.json'}
        if ($cenario -eq 'sucesso' -and @(Get-ChildItem -LiteralPath $destino -Filter $filtro).Count -ne 1) {throw 'Recibo ausente'}
    }
    Write-Output 'Aplicador: previa, sucesso, alvo errado, falha HTTP e verificacao divergente aprovados; sem rede.'
} finally {
    if (Test-Path -LiteralPath $pastaTeste) {
        $absoluto=[IO.Path]::GetFullPath((Resolve-Path -LiteralPath $pastaTeste).Path)
        if ((Split-Path -Parent $absoluto).TrimEnd('\') -ne $baseTeste -or -not (Split-Path -Leaf $absoluto).StartsWith('imposition-aplicacao-rls-')) {throw 'Limpeza fora do TEMP'}
        Remove-Item -LiteralPath $absoluto -Recurse -Force
    }
}
