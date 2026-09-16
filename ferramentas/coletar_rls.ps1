<#
Coleta somente metadados do e-deal. Sem -Executar, apenas mostra a previa.
Nao le .env, nao grava token, nao aplica migrations e nao imprime respostas.
Com -SolicitarToken, recebe o token de gerenciamento por entrada oculta.
#>
[CmdletBinding()]
param(
    [string]$Diretorio = 'C:\ProjetosLocais\auditorias-rls\e-deal',
    [switch]$Executar,
    [switch]$SolicitarToken,
    [string]$CredencialProtegida
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$projetoRls = 'vwbtitjlpelrcnsytzqw'
$ambienteRls = 'producao'
$raizRls = Split-Path -Parent $PSScriptRoot
$destinoRls = [IO.Path]::GetFullPath($Diretorio)

# Nao permitir evidencias com expressoes privadas dentro de qualquer checkout.
$ancestralRls = $destinoRls
while ($ancestralRls) {
    if (Test-Path -LiteralPath (Join-Path $ancestralRls '.git')) {
        throw 'Escolha um diretorio de evidencias fora de repositorios Git.'
    }
    $paiRls = Split-Path -Parent $ancestralRls
    if ($paiRls -eq $ancestralRls) { break }
    $ancestralRls = $paiRls
}

$consultasRls = @(
    @{ Arquivo = '01_metadados.sql'; Coluna = 'auditoria_rls'; Nome = 'metadados'; Formato = 'imposition-rls-v1' },
    @{ Arquivo = '02_buckets.sql'; Coluna = 'auditoria_buckets'; Nome = 'buckets'; Formato = 'imposition-rls-buckets-v1' }
)
foreach ($consultaRls in $consultasRls) {
    $arquivoRls = Join-Path $raizRls ('sql\auditoria_rls\' + $consultaRls.Arquivo)
    $consultaRls.Sql = [IO.File]::ReadAllText($arquivoRls, [Text.Encoding]::UTF8)
}

if (-not $Executar) {
    Write-Output "PREVIA: e-deal / $ambienteRls / $projetoRls"
    Write-Output 'GET de identificacao e duas consultas SQL com read_only=true; nenhuma alteracao.'
    Write-Output "Saida: $destinoRls (arquivos novos, sem sobrescrever)."
    Write-Output 'Sem rede, sem leitura de token e sem criar arquivos nesta previa.'
    return
}

$tokenRls = $null
$seguroRls = $null
$headersRls = $null
$etapaRls = 'credencial'
try {
    if ($SolicitarToken -and $CredencialProtegida) { throw 'Escolha apenas uma origem da credencial.' }
    if ($SolicitarToken) {
        $seguroRls = Read-Host 'Token de gerenciamento Supabase (digitacao oculta)' -AsSecureString
        $tokenRls = [Net.NetworkCredential]::new('', $seguroRls).Password
    } elseif ($CredencialProtegida) {
        if ($env:OS -ne 'Windows_NT') { throw 'Credencial protegida exige Windows.' }
        $credencialRls = Import-Clixml -LiteralPath $CredencialProtegida
        if ($credencialRls -isnot [Management.Automation.PSCredential] -or $credencialRls.UserName -cne $projetoRls) {
            throw 'Credencial invalida para este projeto.'
        }
        $seguroRls = $credencialRls.Password
        $tokenRls = $credencialRls.GetNetworkCredential().Password
    } else {
        $tokenRls = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN', 'Process')
    }
    if ([string]::IsNullOrWhiteSpace($tokenRls)) {
        throw 'Credencial ausente.'
    }
    $headersRls = @{ Authorization = 'Bearer ' + $tokenRls }
    $baseRls = "https://api.supabase.com/v1/projects/$projetoRls"
    $etapaRls = 'identificacao do projeto'
    $identidadeRls = Invoke-RestMethod -Method Get -Uri $baseRls -Headers $headersRls `
        -TimeoutSec 30 -MaximumRedirection 0
    $refRls = if ($identidadeRls.PSObject.Properties['ref']) { $identidadeRls.ref } else { $identidadeRls.id }
    if ($refRls -cne $projetoRls -or $identidadeRls.name -ine 'e-deal') {
        throw 'Identidade do projeto divergente.'
    }

    $etapaRls = 'preparacao da pasta local'
    [void][IO.Directory]::CreateDirectory($destinoRls)
    $loteRls = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8)
    foreach ($consultaRls in $consultasRls) {
        $etapaRls = 'consulta ' + $consultaRls.Nome
        $corpoRls = @{ query = $consultaRls.Sql; read_only = $true } | ConvertTo-Json -Depth 4 -Compress
        $bytesRls = [Text.Encoding]::UTF8.GetBytes($corpoRls)
        $respostaRls = Invoke-RestMethod -Method Post -Uri ($baseRls + '/database/query') `
            -Headers $headersRls -ContentType 'application/json; charset=utf-8' `
            -Body $bytesRls -TimeoutSec 60 -MaximumRedirection 0
        $linhasRls = @($respostaRls)
        if ($linhasRls.Count -ne 1 -or -not $linhasRls[0].PSObject.Properties[$consultaRls.Coluna]) {
            throw 'Resultado SELECT ausente ou ambiguo; conferir compatibilidade do endpoint sem retirar READ ONLY.'
        }
        $snapshotRls = $linhasRls[0].($consultaRls.Coluna)
        if ($snapshotRls -is [string]) { $snapshotRls = $snapshotRls | ConvertFrom-Json }
        $contextoRls = if ($consultaRls.Nome -eq 'metadados') { $snapshotRls.contexto } else { $snapshotRls }
        if ($snapshotRls.formato -cne $consultaRls.Formato -or $contextoRls.projeto -cne $projetoRls `
            -or $contextoRls.ambiente -cne $ambienteRls -or $contextoRls.read_only -ne $true) {
            throw 'Resposta sem comprovacao do alvo ou modo somente leitura.'
        }
        $etapaRls = 'gravacao local ' + $consultaRls.Nome
        $caminhoRls = Join-Path $destinoRls ($loteRls + '-' + $consultaRls.Nome + '.json')
        $jsonRls = ConvertTo-Json -InputObject $snapshotRls -Depth 100
        $conteudoRls = [Text.UTF8Encoding]::new($false).GetBytes($jsonRls + [Environment]::NewLine)
        $streamRls = [IO.File]::Open($caminhoRls, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
        try { $streamRls.Write($conteudoRls, 0, $conteudoRls.Length) } finally { $streamRls.Dispose() }
        Write-Output "Evidencia salva: $caminhoRls"
    }
    Write-Output 'Coleta concluida. Nenhuma policy, grant, dado comercial ou arquivo remoto foi alterado.'
} catch {
    # Nao repassar corpo, cabecalhos ou excecao HTTP: podem conter dados privados.
    throw "Coleta interrompida na etapa '$etapaRls'. Credencial e resposta omitidas. Preserve eventuais arquivos ja salvos; confira acesso, identidade e compatibilidade antes de repetir."
} finally {
    if ($headersRls) { $headersRls.Clear() }
    $tokenRls = $null
    if ($seguroRls) { $seguroRls.Dispose() }
    $seguroRls = $null
}
