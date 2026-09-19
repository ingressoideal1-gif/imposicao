# Exercita o coletor com HTTP e entrada de token simulados. Nunca faz rede.
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$coletorTeste = Join-Path (Split-Path -Parent $PSScriptRoot) 'ferramentas\coletar_rls.ps1'
$baseTeste = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$pastaTeste = Join-Path $baseTeste ('imposition-coleta-rls-' + [Guid]::NewGuid().ToString('N'))
$tokenAnteriorTeste = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'Process')
$global:cenarioRlsTeste = 'sucesso'
$global:chamadasRlsTeste = @()
$global:promptsRlsTeste = 0

function Exigir-Teste($condicao, [string]$mensagem) {
    if (-not $condicao) { throw $mensagem }
}
function Read-Host {
    param($Prompt, [switch]$AsSecureString)
    Exigir-Teste $AsSecureString 'O token precisa de entrada oculta.'
    $global:promptsRlsTeste++
    return ConvertTo-SecureString 'token-sintetico-oculto' -AsPlainText -Force
}
function Invoke-RestMethod {
    param($Method, $Uri, $Headers, $TimeoutSec, $MaximumRedirection, $ContentType, $Body)
    Exigir-Teste ($Uri -like 'https://api.supabase.com/v1/projects/vwbtitjlpelrcnsytzqw*') 'Host/projeto incorreto.'
    Exigir-Teste ($MaximumRedirection -eq 0) 'Nao seguir redirecionamentos com credencial.'
    Exigir-Teste ($Headers.Authorization -eq 'Bearer token-sintetico-oculto') 'Token simulado nao recebido.'
    $global:chamadasRlsTeste += $Method
    if ($Method -eq 'Get') {
        return [pscustomobject]@{ ref = 'vwbtitjlpelrcnsytzqw'; name = $(if ($global:cenarioRlsTeste -eq 'projeto-errado') { 'outro' } else { 'e-deal' }) }
    }
    $consultaTeste = [Text.Encoding]::UTF8.GetString($Body) | ConvertFrom-Json
    Exigir-Teste ($consultaTeste.read_only -eq $true) 'API sem read_only.'
    Exigir-Teste ($consultaTeste.query -match 'BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;') 'SQL sem READ ONLY.'
    Exigir-Teste ($consultaTeste.query -match 'ROLLBACK;\s*$') 'SQL sem ROLLBACK.'
    $contextoTeste = [pscustomobject]@{ projeto = 'vwbtitjlpelrcnsytzqw'; ambiente = 'producao'; read_only = $true }
    if ($global:cenarioRlsTeste -eq 'resposta-vazia') { return @() }
    if ($consultaTeste.query -match 'AS auditoria_rls;') {
        if ($global:cenarioRlsTeste -eq 'sem-readonly') { $contextoTeste.read_only = $false }
        return @([pscustomobject]@{ auditoria_rls = [pscustomobject]@{ formato = 'imposition-rls-v1'; contexto = $contextoTeste } })
    }
    if ($global:cenarioRlsTeste -eq 'erro-bucket') { throw 'HTTP com token-sintetico-oculto e dados privados sinteticos' }
    return @([pscustomobject]@{ auditoria_buckets = [pscustomobject]@{
        formato = 'imposition-rls-buckets-v1'; projeto = $contextoTeste.projeto;
        ambiente = $contextoTeste.ambiente; read_only = $true; buckets = @() } })
}

try {
    $env:SUPABASE_ACCESS_TOKEN = 'token-sintetico-oculto'
    $previaTeste = & $coletorTeste -Diretorio $pastaTeste
    Exigir-Teste ($global:chamadasRlsTeste.Count -eq 0) 'Previa fez rede.'
    Exigir-Teste ($global:promptsRlsTeste -eq 0) 'Previa solicitou segredo.'
    Exigir-Teste (-not (Test-Path -LiteralPath $pastaTeste)) 'Previa criou pasta.'

    $saidaTeste = & $coletorTeste -Diretorio $pastaTeste -Executar -SolicitarToken
    Exigir-Teste ($global:promptsRlsTeste -eq 1) 'Entrada oculta nao utilizada.'
    Exigir-Teste (($global:chamadasRlsTeste -join ',') -eq 'Get,Post,Post') 'Sequencia de leitura incorreta.'
    Exigir-Teste (@(Get-ChildItem -LiteralPath $pastaTeste -Filter '*.json').Count -eq 2) 'Snapshots nao gravados.'
    Exigir-Teste (($saidaTeste -join '') -notmatch 'token-sintetico-oculto') 'Token na saida.'
    foreach ($arquivoTeste in Get-ChildItem -LiteralPath $pastaTeste -Filter '*.json') {
        Exigir-Teste ([IO.File]::ReadAllText($arquivoTeste.FullName) -notmatch 'token-sintetico-oculto') 'Token no arquivo.'
    }
    $null = & $coletorTeste -Diretorio $pastaTeste -Executar
    Exigir-Teste (@(Get-ChildItem -LiteralPath $pastaTeste -Filter '*.json').Count -eq 4) 'Coleta sobrescreveu evidencias.'

    foreach ($cenarioTeste in @('projeto-errado', 'resposta-vazia', 'sem-readonly', 'erro-bucket')) {
        $global:cenarioRlsTeste = $cenarioTeste
        $global:chamadasRlsTeste = @()
        $destinoTeste = Join-Path $pastaTeste $cenarioTeste
        $recusouTeste = $false
        try { $null = & $coletorTeste -Diretorio $destinoTeste -Executar }
        catch {
            $recusouTeste = $true
            Exigir-Teste ($_.Exception.Message -notmatch 'token-sintetico-oculto|dados privados sinteticos') 'Erro divulgou conteudo privado.'
        }
        Exigir-Teste $recusouTeste ('Nao recusou ' + $cenarioTeste)
        if ($cenarioTeste -eq 'projeto-errado') {
            Exigir-Teste (($global:chamadasRlsTeste -join ',') -eq 'Get') 'SQL enviado ao projeto incorreto.'
        }
        if ($cenarioTeste -eq 'erro-bucket') {
            Exigir-Teste (@(Get-ChildItem -LiteralPath $destinoTeste -Filter '*-metadados.json').Count -eq 1) 'Perdeu primeira evidencia.'
        }
    }
    $env:SUPABASE_ACCESS_TOKEN = $null
    $global:chamadasRlsTeste = @()
    $recusouTeste = $false
    try { $null = & $coletorTeste -Diretorio $pastaTeste -Executar } catch { $recusouTeste = $true }
    Exigir-Teste $recusouTeste 'Ausencia de token nao recusada.'
    Exigir-Teste ($global:chamadasRlsTeste.Count -eq 0) 'Tentou rede sem token.'

    $repoFalsoTeste = Join-Path $pastaTeste 'repo'
    [void][IO.Directory]::CreateDirectory($repoFalsoTeste)
    [IO.File]::WriteAllText((Join-Path $repoFalsoTeste '.git'), 'worktree sintetico')
    $recusouTeste = $false
    try { $null = & $coletorTeste -Diretorio (Join-Path $repoFalsoTeste 'saida') } catch { $recusouTeste = $true }
    Exigir-Teste $recusouTeste 'Aceitou evidencias dentro de um repositorio.'
    Write-Output 'Coletor: cenarios simulados aprovados; nenhuma rede ou credencial real utilizada.'
} finally {
    $env:SUPABASE_ACCESS_TOKEN = $tokenAnteriorTeste
    if (Test-Path -LiteralPath $pastaTeste) {
        $absolutoTeste = [IO.Path]::GetFullPath((Resolve-Path -LiteralPath $pastaTeste).Path)
        Exigir-Teste ((Split-Path -Parent $absolutoTeste).TrimEnd('\') -eq $baseTeste.TrimEnd('\')) 'Pasta de limpeza fora do TEMP.'
        Exigir-Teste ((Split-Path -Leaf $absolutoTeste).StartsWith('imposition-coleta-rls-')) 'Pasta de limpeza inesperada.'
        Remove-Item -LiteralPath $absolutoTeste -Recurse -Force
    }
}
