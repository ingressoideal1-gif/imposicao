$ErrorActionPreference = "Stop"

Set-Location "C:\Users\Junior\Projetos Ingresso ideal\ideal-imposition"

# 1. Obter a versão atual do index.html
$indexFile = "frontend\index.html"
$content = Get-Content $indexFile -Raw
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
(Get-Content $indexFile) -replace "script\.js\?v=$currentV", "script.js?v=$nextV" | Set-Content $indexFile
(Get-Content $indexFile) -replace "pedido\.js\?v=\d+", "pedido.js?v=$nextV" | Set-Content $indexFile

$clienteFile = "frontend\cliente.html"
(Get-Content $clienteFile) -replace "cliente\.js\?v=\d+", "cliente.js?v=$nextV" | Set-Content $clienteFile

$producaoFile = "frontend\producao.html"
(Get-Content $producaoFile) -replace "script\.js\?v=\d+", "script.js?v=$nextV" | Set-Content $producaoFile
(Get-Content $producaoFile) -replace "pedido\.js\?v=\d+", "pedido.js?v=$nextV" | Set-Content $producaoFile

# 3. Git commit e push
Write-Host "Fazendo commit no Git..."
git add -A
git commit -m "fix: correcao de encoding dos emojis nos botoes (v$nextV)"
git push origin main

# 4. Vercel deploy
Write-Host "Fazendo deploy na Vercel..."
Set-Location "C:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\frontend"
vercel --prod --yes

Write-Host "SUCESSO! v$nextV publicada."
