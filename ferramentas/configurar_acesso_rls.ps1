<# Recebe token oculto, valida e-deal e salva usando DPAPI do usuario Windows. #>
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
if ($env:OS -ne 'Windows_NT') { throw 'Este armazenamento exige Windows/DPAPI.' }
$seguroRls = $null
$tokenRls = $null
$headersRls = $null
$etapaRls = 'entrada oculta'
try {
    $seguroRls = Read-Host 'Token Supabase do e-deal (entrada oculta; nao envie na conversa)' -AsSecureString
    $tokenRls = [Net.NetworkCredential]::new('', $seguroRls).Password
    if ([string]::IsNullOrWhiteSpace($tokenRls)) { throw 'Token vazio.' }
    $headersRls = @{ Authorization = 'Bearer ' + $tokenRls }
    $etapaRls = 'validacao do projeto'
    $projetoRls = Invoke-RestMethod -Method Get -Uri 'https://api.supabase.com/v1/projects/vwbtitjlpelrcnsytzqw' -Headers $headersRls -TimeoutSec 30 -MaximumRedirection 0
    $refRls = if ($projetoRls.PSObject.Properties['ref']) { $projetoRls.ref } else { $projetoRls.id }
    if ($refRls -cne 'vwbtitjlpelrcnsytzqw' -or $projetoRls.name -ine 'e-deal') { throw 'Projeto divergente.' }
    $etapaRls = 'gravacao protegida'
    $pastaRls = Join-Path ([Environment]::GetFolderPath('LocalApplicationData')) 'IdealImposition\rls'
    $ancestralRls = $pastaRls
    while ($ancestralRls) {
        if (Test-Path -LiteralPath (Join-Path $ancestralRls '.git')) { throw 'Pasta dentro de Git.' }
        $paiRls = Split-Path -Parent $ancestralRls
        if ($paiRls -eq $ancestralRls) { break }
        $ancestralRls = $paiRls
    }
    [void][IO.Directory]::CreateDirectory($pastaRls)
    $arquivoRls = Join-Path $pastaRls ('e-deal-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssfffZ') + '-' + [Guid]::NewGuid().ToString('N') + '.clixml')
    # PSCredential e serializado com senha criptografada por DPAPI no Windows.
    $credencialRls = [Management.Automation.PSCredential]::new('vwbtitjlpelrcnsytzqw', $seguroRls)
    $credencialRls | Export-Clixml -LiteralPath $arquivoRls -NoClobber
    Write-Output "Credencial validada e protegida: $arquivoRls"
    Write-Output 'Disponivel somente neste usuario/Windows. Nenhuma alteracao no banco. Permissao de escrita ainda nao foi testada.'
} catch {
    throw "Configuracao interrompida na etapa '$etapaRls'. Token e resposta omitidos."
} finally {
    if ($headersRls) { $headersRls.Clear() }
    $tokenRls = $null
    if ($seguroRls) { $seguroRls.Dispose() }
}
