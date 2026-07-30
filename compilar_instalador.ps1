$ErrorActionPreference = "Stop"

Set-Location "C:\Users\Junior\Projetos Ingresso ideal\ideal-imposition"

Write-Host "--- COMPILANDO INSTALADOR DO AGENTE LOCAL WINDOWS ---" -ForegroundColor Cyan

# 1. Verificar se o executável compilado existe
if (-not (Test-Path "dist\NewProd.exe")) {
    Write-Host "[ERRO] Executável dist\NewProd.exe não encontrado. Por favor, execute primeiro: .\build_agent.ps1" -ForegroundColor Red
    exit 1
}

# 2. Caminhos possíveis do compilador do Inno Setup (ISCC)
$isccPaths = @(
    "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
    "C:\Program Files\Inno Setup 6\ISCC.exe",
    "C:\Program Files (x86)\Inno Setup 5\ISCC.exe"
)

$iscc = $null
foreach ($path in $isccPaths) {
    if (Test-Path $path) {
        $iscc = $path
        break
    }
}

if ($null -eq $iscc) {
    Write-Host "[AVISO] Compilador Inno Setup (ISCC.exe) não detectado no sistema." -ForegroundColor Yellow
    Write-Host "Por favor, baixe e instale o Inno Setup 6 em: https://jrsoftware.org/isdl.php" -ForegroundColor Cyan
    Write-Host "Após instalar, execute este script novamente para gerar o instalador automático." -ForegroundColor Cyan
    exit 1
}

# 3. Rodar a compilação
Write-Host "Inno Setup compilador localizado em: $iscc" -ForegroundColor Green
Write-Host "Gerando instalador executável..." -ForegroundColor Green
& $iscc "installer.iss"

Write-Host "`nSUCESSO! Instalador compilado e salvo na pasta 'dist/'" -ForegroundColor Green
