# Diagnostico de fontes — rodar NA ESTACAO que apresenta o problema.
# Nao altera nada; so consulta e imprime.
# Uso: clicar com o botao direito > "Executar com PowerShell", ou colar no PowerShell.

$ErrorActionPreference = "SilentlyContinue"
$SUPA = "https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes"

function Titulo($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }

Titulo "1. Agente"
try {
    $st = (Invoke-WebRequest "http://127.0.0.1:9000/api/status" -UseBasicParsing -TimeoutSec 8).Content | ConvertFrom-Json
    Write-Host "   versao   : $($st.version)"
    Write-Host "   agent_id : $($st.agent_id)"
} catch {
    Write-Host "   AGENTE NAO RESPONDE em 127.0.0.1:9000" -ForegroundColor Red
    Write-Host "   (o resto do diagnostico depende dele)"
}

Titulo "2. Catalogo servido pelo agente"
try {
    $fontes = (Invoke-WebRequest "http://127.0.0.1:9000/api/fontes" -UseBasicParsing -TimeoutSec 20).Content | ConvertFrom-Json
    $rel  = @($fontes | Where-Object { $_.arquivo_url -like "/fonts_local/*" }).Count
    $goo  = @($fontes | Where-Object { $_.arquivo_url -like "*gstatic*" }).Count
    $supa = @($fontes | Where-Object { $_.arquivo_url -like "*supabase.co*" }).Count
    Write-Host "   total no catalogo : $($fontes.Count)"
    Write-Host "   /fonts_local      : $rel   (esperado 0)"
    Write-Host "   gstatic           : $goo   (esperado 0)"
    Write-Host "   Supabase Storage  : $supa  (esperado ~316)"
    if ($rel -gt 0 -or $goo -gt 0) {
        Write-Host "   >>> CATALOGO NAO MIGROU — a correcao nao rodou nesta maquina" -ForegroundColor Red
    }
} catch { Write-Host "   falhou: $_" -ForegroundColor Red }

Titulo "3. Cache local de fontes"
$cache = Join-Path $env:LOCALAPPDATA "NewProd Agent\fonts_cache"
if (Test-Path $cache) {
    $arqs = Get-ChildItem $cache -File
    $mb = [math]::Round(($arqs | Measure-Object Length -Sum).Sum / 1MB, 1)
    Write-Host "   pasta    : $cache"
    Write-Host "   arquivos : $($arqs.Count)   ($mb MB)   — esperado ~270 / ~143 MB"
    if ($arqs.Count -lt 200) {
        Write-Host "   >>> SYNC INCOMPLETO — pode ainda estar baixando, ou a rede bloqueia" -ForegroundColor Yellow
    }
} else {
    Write-Host "   PASTA NAO EXISTE — o sync de fontes nunca rodou" -ForegroundColor Red
}

Titulo "4. Esta maquina alcanca o Supabase?"
foreach ($alvo in @("$SUPA/comic.ttf", "$SUPA/google/89434ffa32f6c994.ttf")) {
    try {
        $r = Invoke-WebRequest $alvo -UseBasicParsing -TimeoutSec 25 -Method Head
        Write-Host "   OK  $($r.StatusCode)  $($alvo.Substring($alvo.LastIndexOf('/')+1))"
    } catch {
        Write-Host "   FALHOU  $($alvo.Substring($alvo.LastIndexOf('/')+1))  -> $($_.Exception.Message)" -ForegroundColor Red
    }
}

Titulo "5. O agente entrega a fonte do cache?"
try {
    $u = [uri]::EscapeDataString("$SUPA/comic.ttf")
    $r = Invoke-WebRequest "http://127.0.0.1:9000/api/fonte?url=$u" -UseBasicParsing -TimeoutSec 25
    Write-Host "   OK  $($r.StatusCode)  $($r.RawContentLength) bytes  tipo=$($r.Headers['Content-Type'])"
} catch {
    Write-Host "   FALHOU -> $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   (se o agente for anterior a 1.2.12 esta rota nao existe)"
}

Titulo "6. Fonte instalada no Windows?"
foreach ($nome in @("comic.ttf", "lobster*")) {
    $achou = @(Get-ChildItem "$env:WINDIR\Fonts" -Filter $nome -ErrorAction SilentlyContinue)
    $achou += @(Get-ChildItem "$env:LOCALAPPDATA\Microsoft\Windows\Fonts" -Filter $nome -ErrorAction SilentlyContinue)
    Write-Host "   $nome : $(if ($achou.Count) { 'instalada' } else { 'NAO instalada' })"
}

Write-Host "`nEnvie a saida completa acima.`n" -ForegroundColor Green
Read-Host "Pressione Enter para fechar"
