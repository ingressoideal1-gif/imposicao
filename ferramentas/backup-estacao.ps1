param(
    [string]$Raiz = (Split-Path -Parent $PSScriptRoot),
    [string]$AreaBackup = 'C:\ProjectBackups\IdealImpositionProtegido',
    [string]$PastaChave = 'C:\ProjectBackups\IdealImpositionChave',
    [string]$Drive = 'G:\Meu Drive\Ideal Imposition - Backups protegidos',
    [string]$Python = (Join-Path (Split-Path -Parent $PSScriptRoot) '.venv\Scripts\python.exe'),
    [string[]]$Runtime = @(),
    [switch]$Ensaiar,
    [switch]$CriarChave
)
$ErrorActionPreference = 'Stop'
$usuario = [Security.Principal.WindowsIdentity]::GetCurrent()
if ($usuario.Name -match 'CodexSandbox') { throw 'Execute sob a conta Windows do operador.' }
function New-PastaPrivada([string]$Caminho) {
    $absoluto = [IO.Path]::GetFullPath($Caminho)
    if (-not (Test-Path -LiteralPath $absoluto)) {
        New-Item -ItemType Directory -Path $absoluto | Out-Null
        $acl = New-Object Security.AccessControl.DirectorySecurity
        $acl.SetAccessRuleProtection($true, $false)
        $acl.SetOwner($usuario.User)
        foreach ($sid in @($usuario.User, (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))) {
            $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
        }
        Set-Acl -LiteralPath $absoluto -AclObject $acl
    }
    $aclAtual = Get-Acl -LiteralPath $absoluto
    if (-not $aclAtual.AreAccessRulesProtected -or $aclAtual.Owner -ne $usuario.Name) { throw 'O destino precisa de ACL privada da conta do operador.' }
    return $absoluto
}
$area = New-PastaPrivada $AreaBackup
$pasta = New-PastaPrivada $PastaChave
$raizAbsoluta = [IO.Path]::GetFullPath($Raiz)
if ($pasta -eq $raizAbsoluta -or $pasta.StartsWith($raizAbsoluta + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'A chave deve ficar fora do repositorio.' }
$chave = Join-Path $pasta 'recuperacao.key'
if (-not (Test-Path -LiteralPath $chave)) {
    if (-not $CriarChave) { throw 'Chave ausente. Use -CriarChave uma unica vez e guarde uma copia offline.' }
    $bytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
    $stream = [IO.File]::Open($chave, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
    try { $stream.Write($bytes, 0, $bytes.Length) } finally { $stream.Dispose(); [Array]::Clear($bytes, 0, $bytes.Length) }
}
if ([IO.Path]::GetFullPath($Drive).StartsWith($pasta + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'A chave nao pode ficar junto do backup remoto.' }
if (-not $PSBoundParameters.ContainsKey('Runtime')) {
    $instalacao = Join-Path $env:LOCALAPPDATA 'NewProd Agent'
    $Runtime = @(foreach ($nomeArquivo in @('formats_db.json','acessos_locais.json','qr_ideal_pool.bin','agent_config.json','credencial-publicacao.json')) {
        $arquivo = Join-Path $instalacao $nomeArquivo
        if (Test-Path -LiteralPath $arquivo -PathType Leaf) { $arquivo }
    })
    foreach ($nomePasta in @('NewProd Dados Protegidos','NewProd Piloto Dados Protegidos')) {
        $dadosProtegidos = Join-Path $env:LOCALAPPDATA $nomePasta
        foreach ($nomeArquivo in @('qr_ideal_pool.bin','qr_ideal_pool_qr12_1.bin','credencial-publicacao.json')) {
            $arquivo = Join-Path $dadosProtegidos $nomeArquivo
            if (Test-Path -LiteralPath $arquivo -PathType Leaf) { $Runtime += $arquivo }
        }
        $contratos = Join-Path $dadosProtegidos 'qr-contratos'
        if (Test-Path -LiteralPath $contratos -PathType Container) {
            $Runtime += @(Get-ChildItem -LiteralPath $contratos -Filter '*.json' -File | Select-Object -ExpandProperty FullName)
        }
    }
}
$nome = 'backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,8)
$destino = Join-Path $area $nome
$argsBackup = @((Join-Path $PSScriptRoot 'backup_portatil.py'), 'criar', '--raiz', $Raiz, '--destino', $destino, '--chave', $chave)
foreach ($arquivo in $Runtime) { $argsBackup += @('--runtime', $arquivo) }
& $Python @argsBackup
if ($LASTEXITCODE -ne 0) { throw 'Falha na criacao do backup; preserve o destino protegido.' }
if ($Ensaiar) {
    $ensaio = Join-Path $area ($nome + '-ensaio')
    & $Python (Join-Path $PSScriptRoot 'backup_portatil.py') restaurar --backup $destino --destino $ensaio --chave $chave
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao abrir o backup no ensaio.' }
    & $Python (Join-Path $PSScriptRoot 'backup_portatil.py') verificar --destino $ensaio
    if ($LASTEXITCODE -ne 0) { throw 'Falha na verificacao da restauracao.' }
    Copy-Item -LiteralPath (Join-Path $ensaio 'evidencia-restauracao.json') -Destination $destino
    Write-Output "ENSAIO_PRESERVADO=$ensaio"
}
# O Drive Desktop envia somente os arquivos cifrados. A chave e o ensaio nunca
# entram nesta copia. A existencia local nao comprova sincronizacao na nuvem.
if (Test-Path -LiteralPath $Drive) {
    $remoto = Join-Path $Drive $nome
    if (Test-Path -LiteralPath $remoto) { throw 'Destino do Drive ja existe.' }
    New-Item -ItemType Directory -Path $remoto | Out-Null
    foreach ($arquivo in @('snapshot.iib','manifesto.json','evidencia-restauracao.json')) {
        $origem = Join-Path $destino $arquivo
        if (-not (Test-Path -LiteralPath $origem)) { continue }
        Copy-Item -LiteralPath $origem -Destination $remoto
        if ((Get-FileHash -LiteralPath $origem).Hash -ne (Get-FileHash -LiteralPath (Join-Path $remoto $arquivo)).Hash) { throw 'Copia no Drive Desktop divergente.' }
    }
    Write-Output "DRIVE_DESKTOP_COPIA_VERIFICADA=$remoto"
} else {
    Write-Warning 'Google Drive Desktop indisponivel. Backup local concluido; envio externo pendente.'
}
# Retencao nao exclui dados: apresenta candidatos de mais de 30 dias para revisao.
$candidatos = @(Get-ChildItem -LiteralPath $area -Directory | Where-Object { $_.Name -match '^backup-\d{8}-\d{6}-[a-f0-9]{8}$' -and $_.CreationTime -lt (Get-Date).AddDays(-30) } | Select-Object -ExpandProperty FullName)
ConvertTo-Json -InputObject @($candidatos) | Set-Content -LiteralPath (Join-Path $area 'retencao-revisar.json') -Encoding UTF8
Write-Output "BACKUP_PORTATIL=$destino"
Write-Output "CHAVE_GUARDAR_OFFLINE=$chave"
