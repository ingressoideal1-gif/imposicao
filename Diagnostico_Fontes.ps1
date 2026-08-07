# Diagnostico de fontes - rodar NA ESTACAO que apresenta o problema.
# Nao altera nada; so consulta e imprime.
# Uso: botao direito > "Executar com PowerShell", ou colar no PowerShell.
#
# ASCII puro de proposito: o PowerShell 5.1 le arquivo UTF-8 sem BOM como ANSI,
# e qualquer acento ou travessao aqui quebra o parser antes de rodar.

$ErrorActionPreference = "SilentlyContinue"
$SUPA = "https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes"

function Titulo($t) { Write-Host "`n=== $t ===" -ForegroundColor Cyan }

# Tenta 3 vezes antes de declarar falha. Uma tentativa unica transforma um soluco
# de rede em "a rede bloqueia o Supabase" e manda o diagnostico para o lado errado
# - aconteceu no primeiro teste deste script.
function Tentar($url, $metodo = "Get", $tentativas = 3) {
    for ($i = 1; $i -le $tentativas; $i++) {
        try {
            $r = Invoke-WebRequest $url -UseBasicParsing -TimeoutSec 25 -Method $metodo
            return @{ ok = $true; status = $r.StatusCode; tamanho = $r.RawContentLength; tentativa = $i }
        } catch {
            $detalhe = $_.Exception.Message
            $corpo = ""
            try {
                $resp = $_.Exception.Response
                if ($resp) {
                    $sr = New-Object System.IO.StreamReader($resp.GetResponseStream())
                    $corpo = $sr.ReadToEnd()
                    $sr.Close()
                }
            } catch {}
            if ($i -eq $tentativas) {
                return @{ ok = $false; erro = $detalhe; corpo = $corpo; tentativa = $i }
            }
            Start-Sleep -Seconds 2
        }
    }
}

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
    # NAO usar $supa aqui: em PowerShell o nome da variavel nao distingue
    # maiusculas, entao isso sobrescreveria a constante $SUPA com um numero — foi
    # exatamente o que aconteceu e fez o diagnostico acusar "rede inalcancavel"
    # quando o problema era a URL virar "316/comic.ttf".
    $rel        = @($fontes | Where-Object { $_.arquivo_url -like "/fonts_local/*" }).Count
    $goo        = @($fontes | Where-Object { $_.arquivo_url -like "*gstatic*" }).Count
    $noStorage  = @($fontes | Where-Object { $_.arquivo_url -like "*supabase.co*" }).Count
    Write-Host "   total no catalogo : $($fontes.Count)"
    Write-Host "   /fonts_local      : $rel (esperado 0)"
    Write-Host "   gstatic           : $goo (esperado 0)"
    Write-Host "   Supabase Storage  : $noStorage (esperado ~316)"
    if ($rel -gt 0 -or $goo -gt 0) {
        Write-Host "   >>> CATALOGO NAO MIGROU - a correcao nao rodou nesta maquina" -ForegroundColor Red
    }
} catch {
    Write-Host "   falhou: $($_.Exception.Message)" -ForegroundColor Red
}

Titulo "3. Cache local de fontes"
$cache = Join-Path $env:LOCALAPPDATA "NewProd Agent\fonts_cache"
if (Test-Path $cache) {
    $arqs = @(Get-ChildItem $cache -File)
    $mb = [math]::Round((($arqs | Measure-Object Length -Sum).Sum) / 1MB, 1)
    Write-Host "   pasta    : $cache"
    Write-Host "   arquivos : $($arqs.Count) - $mb MB (esperado ~270 / ~143 MB)"
    if ($arqs.Count -lt 200) {
        Write-Host "   >>> SYNC INCOMPLETO - pode estar baixando, ou a rede bloqueia" -ForegroundColor Yellow
    }
} else {
    Write-Host "   PASTA NAO EXISTE - o sync de fontes nunca rodou" -ForegroundColor Red
}

Titulo "4. Esta maquina alcanca o Supabase?"
foreach ($alvo in @("$SUPA/comic.ttf", "$SUPA/google/89434ffa32f6c994.ttf")) {
    $nome = $alvo.Substring($alvo.LastIndexOf('/') + 1)
    $res = Tentar $alvo "Head"
    if ($res.ok) {
        $obs = if ($res.tentativa -gt 1) { " (na tentativa $($res.tentativa) - rede instavel)" } else { "" }
        Write-Host "   OK $($res.status) - $nome$obs"
    } else {
        Write-Host "   FALHOU apos 3 tentativas - $nome" -ForegroundColor Red
        Write-Host "      $($res.erro)" -ForegroundColor Red
        Write-Host "      >>> se as duas falharem, a rede desta estacao nao alcanca o Storage" -ForegroundColor Red
    }
}

Titulo "5. O agente entrega a fonte do cache?"
$u = [uri]::EscapeDataString("$SUPA/comic.ttf")
$res = Tentar "http://127.0.0.1:9000/api/fonte?url=$u"
if ($res.ok) {
    $obs = if ($res.tentativa -gt 1) { " (na tentativa $($res.tentativa))" } else { "" }
    Write-Host "   OK $($res.status) - $($res.tamanho) bytes$obs"
} else {
    Write-Host "   FALHOU apos 3 tentativas -> $($res.erro)" -ForegroundColor Red
    if ($res.corpo) { Write-Host "      resposta do agente: $($res.corpo)" -ForegroundColor Red }
    Write-Host "      (se o agente for anterior a 1.2.12 esta rota nao existe)"
}

Titulo "6. Fonte instalada no Windows?"
foreach ($nome in @("comic.ttf", "lobster*")) {
    $achou = @(Get-ChildItem "$env:WINDIR\Fonts" -Filter $nome -ErrorAction SilentlyContinue)
    $achou += @(Get-ChildItem "$env:LOCALAPPDATA\Microsoft\Windows\Fonts" -Filter $nome -ErrorAction SilentlyContinue)
    if ($achou.Count -gt 0) {
        Write-Host "   $nome : instalada"
    } else {
        Write-Host "   $nome : NAO instalada"
    }
}

Write-Host "`nEnvie a saida completa acima.`n" -ForegroundColor Green
if ($Host.Name -eq "ConsoleHost" -and -not $env:CI) {
    Read-Host "Pressione Enter para fechar"
}
