$ErrorActionPreference = "Stop"

Set-Location "C:\Users\Junior\Projetos Ingresso ideal\ideal-imposition"

Write-Host "--- COMPILANDO INSTALADOR .MSI DO NEWPROD AGENT ---" -ForegroundColor Cyan

# 1. Verificar se o executavel dist\NewProd.exe existe
if (-not (Test-Path "dist\NewProd.exe")) {
    Write-Host "Executavel dist\NewProd.exe nao encontrado. Compilando com PyInstaller..." -ForegroundColor Yellow
    powershell -ExecutionPolicy Bypass -File build_agent.ps1
}

# 2. Procurar o WiX Toolset no sistema ou baixar versao portavel
$wixCandle = $null
$wixLight = $null

$possiblePaths = @(
    "C:\Program Files (x86)\WiX Toolset v3.11\bin",
    "C:\Program Files (x86)\WiX Toolset v3.14\bin",
    "C:\Program Files\WiX Toolset v3.11\bin",
    "$env:LOCALAPPDATA\WiXToolset\bin",
    "tools\wix"
)

foreach ($path in $possiblePaths) {
    $c = Join-Path $path "candle.exe"
    $l = Join-Path $path "light.exe"
    if ((Test-Path $c) -and (Test-Path $l)) {
        $wixCandle = $c
        $wixLight = $l
        break
    }
}

if ($null -eq $wixCandle) {
    Write-Host "WiX Toolset nao encontrado localmente. Baixando binarios portaveis do WiX Toolset..." -ForegroundColor Yellow
    $wixZipUrl = "https://github.com/wixtoolset/wix3/releases/download/wix3112rtm/wix311-binaries.zip"
    $wixDir = "tools\wix"
    
    if (-not (Test-Path $wixDir)) {
        New-Item -ItemType Directory -Path $wixDir | Out-Null
    }
    
    $zipPath = Join-Path $wixDir "wix_binaries.zip"
    Write-Host "Baixando $wixZipUrl..." -ForegroundColor Green
    Invoke-WebRequest -Uri $wixZipUrl -OutFile $zipPath -UseBasicParsing
    
    Write-Host "Extraindo arquivos do WiX Toolset..." -ForegroundColor Green
    Expand-Archive -Path $zipPath -DestinationPath $wixDir -Force
    Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
    
    $wixCandle = Join-Path $wixDir "candle.exe"
    $wixLight = Join-Path $wixDir "light.exe"
}

Write-Host "Compilador WiX localizado:" -ForegroundColor Green
Write-Host "  Candle: $wixCandle" -ForegroundColor Gray
Write-Host "  Light:  $wixLight" -ForegroundColor Gray

# 3. Compilar agent_installer.wxs -> agent_installer.wixobj
Write-Host "`nEtapa 1/2: Compilando XML (.wxs -> .wixobj)..." -ForegroundColor Green
& $wixCandle -ext WixUIExtension -nologo "agent_installer.wxs" -out "dist\agent_installer.wixobj"

# 4. Enlincar .wixobj -> NewProd_Setup_v<versao>.msi
# A versao precisa bater com Version= em agent_installer.wxs e com
# LOCAL_AGENT_VERSION em app.py — o MSI usa esse campo para decidir se o
# upgrade se aplica, e o frontend compara o valor reportado pelo agente.
Write-Host "Etapa 2/2: Gerando pacote final MSI (.wixobj -> .msi)..." -ForegroundColor Green
$msiOutput = "dist\NewProd_Setup_v1.2.24.msi"
& $wixLight -ext WixUIExtension -nologo -sval "dist\agent_installer.wixobj" -out $msiOutput

if (Test-Path $msiOutput) {
    $sizeMb = [math]::Round((Get-Item $msiOutput).Length / 1MB, 2)
    Write-Host "`n========================================================" -ForegroundColor Green
    Write-Host " SUCESSO! Pacote MSI gerado com sucesso!" -ForegroundColor Green
    Write-Host " Arquivo: $msiOutput ($sizeMb MB)" -ForegroundColor Cyan
    Write-Host "========================================================" -ForegroundColor Green
} else {
    Write-Host "[ERRO] Falha ao gerar o arquivo MSI." -ForegroundColor Red
    exit 1
}
