param([string]$PastaChave = 'C:\ProjectBackups\IdealImpositionChave')
$ErrorActionPreference = 'Stop'
$base = [IO.Path]::GetFullPath($PastaChave)
if (-not (Get-Acl -LiteralPath $base).AreAccessRulesProtected) { throw 'A pasta da chave precisa ter ACL privada.' }
$entrada = Join-Path $base 'recuperacao.key'
$saida = Join-Path $base 'importar-google-passwords.csv'
if (Test-Path -LiteralPath $saida) { throw 'O arquivo de importacao ja existe; nao sera sobrescrito.' }
$bytes = [IO.File]::ReadAllBytes($entrada)
if ($bytes.Length -ne 32) { throw 'Chave invalida.' }
try {
    $senha = [Convert]::ToBase64String($bytes)
    $registro = [PSCustomObject]@{url='https://imposition.ai-ideal.com.br';username='backup-recuperacao-AES';password=$senha}
    $linhas = @($registro | ConvertTo-Csv -NoTypeInformation)
    [IO.File]::WriteAllLines($saida, $linhas, (New-Object Text.UTF8Encoding($false)))
} finally { [Array]::Clear($bytes,0,$bytes.Length); $senha=$null; $registro=$null; $linhas=$null }
Write-Output "IMPORTACAO_PREPARADA=$saida"
Write-Output 'Importe em passwords.google.com > Configuracoes > Importar. Confirme a conta e a entrada backup-recuperacao-AES. O valor da chave nao foi exibido.'
Write-Output 'Depois de confirmar a importacao, remova somente o CSV de importacao; preserve recuperacao.key para a tarefa de backup. Nunca envie este CSV ao Drive de backups.'
