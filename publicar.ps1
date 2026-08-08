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
#
# Bumpa TODO asset local versionado (.js?v= e .css?v=) em todas as paginas, em
# vez de uma lista fixa de arquivos.
#
# A lista fixa cobria so script.js, pedido.js e cliente.js. style.css, mapas.js
# e criador-arte.js nunca eram bumpados: ficaram congelados (style.css em v=9/7/5
# conforme a pagina, os outros dois em v=2) e suas alteracoes nao chegavam ao
# navegador de quem ja tinha o arquivo em cache. Qualquer asset novo entraria no
# mesmo buraco -- por isso a regra agora e por padrao, nao por nome.
#
# Os CDNs nao sao afetados: eles fixam versao no caminho (/3.11.174/pdf.min.js),
# nunca em querystring.
Write-Host "Atualizando arquivos HTML..."
$substituicao = '.$1?v=' + $nextV
Get-ChildItem "frontend\*.html" | ForEach-Object {
    $html = Get-Content -Encoding UTF8 $_.FullName -Raw
    $novo = $html -replace '\.(js|css)\?v=\d+', $substituicao
    if ($novo -ne $html) {
        # -Raw + -NoNewline preserva o arquivo byte a byte fora as substituicoes
        # (o Get-Content/Set-Content por linha normalizava as quebras de linha).
        #
        # -Path e -Value NOMEADOS de proposito: -Path aceita string[], entao na
        # forma posicional o PowerShell engole caminho E conteudo no mesmo array
        # de -Path, deixa -Value sem ligar e falha com um erro enganoso sobre
        # 'Encoding'. Nao passe esses dois por posicao.
        Set-Content -Encoding UTF8 -NoNewline -Path $_.FullName -Value $novo
        Write-Host "  $($_.Name)"
    }
}

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
