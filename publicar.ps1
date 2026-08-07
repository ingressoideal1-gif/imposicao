# Publica o frontend: bumpa a versao dos scripts, commita, empurra e faz o
# deploy de producao na Vercel.
#
# Uso:
#   .\publicar.ps1 "fix(painel): corrigir ordenacao da fila"
#
# A versao (vNNN) e acrescentada ao final da mensagem automaticamente.
param(
    [Parameter(Mandatory = $true, Position = 0,
               HelpMessage = "Mensagem do commit, ex: 'fix(painel): corrigir ordenacao da fila'")]
    [ValidateNotNullOrEmpty()]
    [string]$Mensagem
)

$ErrorActionPreference = "Stop"

Set-Location "C:\Users\Junior\Projetos Ingresso ideal\ideal-imposition"

# 1. Obter a versão atual do index.html
$indexFile = "frontend\index.html"
$content = Get-Content -Encoding UTF8 $indexFile -Raw
$match = [regex]::Match($content, 'script\.js\?v=(\d+)')
if ($match.Success) {
    $currentV = [int]$match.Groups[1].Value
    $nextV = $currentV + 1
} else {
    Write-Host "Não foi possível encontrar a versão atual."
    exit 1
}

Write-Host "Versão atual: v$currentV"
Write-Host "Nova versão: v$nextV"

# 2. Atualizar arquivos HTML
Write-Host "Atualizando arquivos HTML..."
(Get-Content -Encoding UTF8 $indexFile) -replace "script\.js\?v=$currentV", "script.js?v=$nextV" | Set-Content -Encoding UTF8 $indexFile
(Get-Content -Encoding UTF8 $indexFile) -replace "pedido\.js\?v=\d+", "pedido.js?v=$nextV" | Set-Content -Encoding UTF8 $indexFile

$clienteFile = "frontend\cliente.html"
(Get-Content -Encoding UTF8 $clienteFile) -replace "cliente\.js\?v=\d+", "cliente.js?v=$nextV" | Set-Content -Encoding UTF8 $clienteFile

$producaoFile = "frontend\producao.html"
(Get-Content -Encoding UTF8 $producaoFile) -replace "script\.js\?v=\d+", "script.js?v=$nextV" | Set-Content -Encoding UTF8 $producaoFile
(Get-Content -Encoding UTF8 $producaoFile) -replace "pedido\.js\?v=\d+", "pedido.js?v=$nextV" | Set-Content -Encoding UTF8 $producaoFile

# 3. Git commit e push
Write-Host "Fazendo commit no Git..."
git add -A
git commit -m "$Mensagem (v$nextV)"
if ($LASTEXITCODE -ne 0) {
    Write-Host "Commit nao realizado (nada a commitar ou erro). Abortando antes do push/deploy."
    exit 1
}
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "Push falhou. Abortando antes do deploy."
    exit 1
}

# 4. Vercel deploy
Write-Host "Fazendo deploy na Vercel..."
Set-Location "C:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\frontend"
vercel --prod --yes

Write-Host "SUCESSO! v$nextV publicada."
