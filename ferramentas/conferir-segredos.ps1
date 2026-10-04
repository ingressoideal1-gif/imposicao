param([switch]$TodosRastreados)
$ErrorActionPreference = 'Stop'
Import-Module (Join-Path $PSScriptRoot 'Publicacao.psm1') -Force
if ($TodosRastreados) {
    $arquivos = @(git ls-files)
} else {
    $arquivos = @(git diff --cached --name-only --diff-filter=ACM)
}
if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel selecionar arquivos Git.' }
$problemas = @()
foreach ($arquivo in $arquivos) {
    if ($arquivo -notmatch '\.(py|js|mjs|ts|ps1|psm1|md|yml|yaml|html|css|spec|sql)$' -and
        $arquivo -notin @('package.json','package-lock.json','permissoes_padroes.json')) { continue }
    # Conteudo do indice/commit, nunca .env real ou credenciais locais ignoradas.
    $ref = if ($TodosRastreados) { 'HEAD:' + $arquivo } else { ':' + $arquivo }
    $texto = git show $ref | Out-String
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel ler arquivo selecionado.' }
    if (Find-SegredoNoTexto $texto) { $problemas += $arquivo }
}
if ($problemas.Count) {
    $problemas | ForEach-Object { Write-Output ('REVISAR_SEGREDO=' + $_) }
    throw 'Material suspeito em arquivos versionados; valores nao foram exibidos.'
}
Write-Output 'SEGREDOS_VERSIONADOS=nenhum detectado pelos padroes configurados'
