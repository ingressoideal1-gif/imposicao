param(
    [string]$Python = (Join-Path (Split-Path -Parent $PSScriptRoot) '.venv\Scripts\python.exe'),
    [string]$Wix = 'C:\ProjetosLocais\ideal-imposition\tools\wix',
    [string]$Pool = (Join-Path $env:LOCALAPPDATA 'NewProd Agent\qr_ideal_pool.bin'),
    [string]$Saida = ('C:\ProjectBackups\IdealImpositionProtegido\newprod-piloto-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
)
$ErrorActionPreference = 'Stop'
throw 'Fluxo antigo desativado: compartilhava o MSI da producao e incluia o pool privado. Use compilar-piloto.ps1 e a instalacao independente documentada.'
$raiz = Split-Path -Parent $PSScriptRoot
$usuario = [Security.Principal.WindowsIdentity]::GetCurrent()
if ($usuario.Name -match 'CodexSandbox') { throw 'Execute sob a conta Windows do operador.' }
$saidaAbsoluta = [IO.Path]::GetFullPath($Saida)
$limitePrivado = 'C:\ProjectBackups\IdealImpositionProtegido\'
if (-not $saidaAbsoluta.StartsWith($limitePrivado, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'O piloto inclui o pool de codigos e exige a area privada aprovada.'
}
if (Test-Path -LiteralPath $saidaAbsoluta) { throw 'Use uma pasta de saida nova.' }
foreach ($arquivo in @($Python, (Join-Path $Wix 'candle.exe'), (Join-Path $Wix 'light.exe'), $Pool)) {
    if (-not (Test-Path -LiteralPath $arquivo -PathType Leaf)) { throw "Insumo ausente: $arquivo" }
}
if ((Get-Item -LiteralPath $Pool).Length -ne 24000000) { throw 'Pool da estacao tem tamanho inesperado.' }
New-Item -ItemType Directory -Path $saidaAbsoluta | Out-Null
$acl = New-Object Security.AccessControl.DirectorySecurity
$acl.SetAccessRuleProtection($true, $false)
$acl.SetOwner($usuario.User)
foreach ($sid in @($usuario.User, (New-Object Security.Principal.SecurityIdentifier('S-1-5-18')))) {
    $acl.AddAccessRule((New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')))
}
Set-Acl -LiteralPath $saidaAbsoluta -AclObject $acl
$dist = Join-Path $saidaAbsoluta 'dist'
$build = Join-Path $saidaAbsoluta 'build'
Set-Location $raiz
& $Python -m PyInstaller --noconfirm --distpath $dist --workpath $build agent_tray.spec
if ($LASTEXITCODE -ne 0) { throw 'Falha no PyInstaller; preserve a pasta do piloto.' }
Copy-Item -LiteralPath $Pool -Destination (Join-Path $dist 'qr_ideal_pool.bin')
[xml]$instalador = Get-Content -Raw -LiteralPath (Join-Path $raiz 'agent_installer.wxs')
$ns = New-Object Xml.XmlNamespaceManager($instalador.NameTable)
$ns.AddNamespace('w', 'http://schemas.microsoft.com/wix/2006/wi')
foreach ($arquivo in $instalador.SelectNodes('//w:File', $ns)) {
    $nome = if ($arquivo.Id -eq 'NewProdExe') { 'NewProd.exe' } else { 'qr_ideal_pool.bin' }
    $arquivo.Source = Join-Path $dist $nome
}
$instalador.SelectSingleNode('//w:Icon', $ns).SourceFile = Join-Path $raiz 'agent_icon.ico'
$instalador.SelectSingleNode('//w:WixVariable', $ns).Value = Join-Path $raiz 'license.rtf'
$versao = $instalador.SelectSingleNode('//w:Product', $ns).Version
$versaoCurta = ($versao -split '\.')[0..2] -join '.'
$wxs = Join-Path $saidaAbsoluta 'piloto.wxs'
$obj = Join-Path $saidaAbsoluta 'piloto.wixobj'
$msi = Join-Path $saidaAbsoluta "NewProd_Setup_v$versaoCurta.msi"
$instalador.Save($wxs)
& (Join-Path $Wix 'candle.exe') -ext WixUIExtension -nologo $wxs -out $obj
if ($LASTEXITCODE -ne 0) { throw 'Falha no candle; preserve os artefatos.' }
& (Join-Path $Wix 'light.exe') -ext WixUIExtension -nologo -sval $obj -out $msi
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $msi)) { throw 'Falha gerando MSI piloto.' }
$prova = [ordered]@{ versao = $versaoCurta; arquivo = $msi; bytes = (Get-Item -LiteralPath $msi).Length;
    sha256 = (Get-FileHash -LiteralPath $msi -Algorithm SHA256).Hash.ToLowerInvariant();
    privado = $true; publicacao_autorizada = $false; credencial_embutida = $false }
$prova | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $saidaAbsoluta 'evidencia-build.json') -Encoding UTF8
'PILOTO PRIVADO: inclui pool de codigos. Nao enviar a bucket publico nem ativar latest.json.' |
    Set-Content -LiteralPath (Join-Path $saidaAbsoluta 'NAO_PUBLICAR.txt') -Encoding UTF8
$prova | ConvertTo-Json -Compress
