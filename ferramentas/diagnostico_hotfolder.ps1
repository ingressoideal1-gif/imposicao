<#
.SYNOPSIS
    Descobre COMO o RIP quer que o arquivo apareca na pasta observada.

.DESCRIPTION
    Roda na propria estacao, com o RIP aberto e observando a pasta. Nao precisa
    de Python, nao precisa do repositorio e nao altera o agente: e so
    diagnostico. Qualquer Windows roda.

    O script larga o mesmo PDF na pasta seis vezes, cada uma por um caminho
    diferente de sistema de arquivos, e espera para ver qual delas o RIP
    consome. Cada metodo produz uma sequencia distinta de eventos do Windows:

      rename       -> cria "nome.pdf.tmp" e renomeia   (o que o agente fazia)
      chrome       -> cria "nome.pdf.crdownload" e renomeia  (o navegador)
      direto       -> cria ja com o nome final         (o que o agente faz hoje)
      exclusivo    -> nome final, trancado enquanto escreve
      copia        -> copia de fora para dentro        (arrastar no Explorer)
      rename_toque -> rename mais um toque na data

    O que interessa e a COMPARACAO. Se "chrome" funcionar e "rename" nao, a
    diferenca esta na extensao do temporario. Se os dois falharem e "direto"
    passar, o RIP so reage a arquivo criado. Se todos passarem, a causa esta em
    outro lugar — provavelmente no ritmo em que o agente larga varios arquivos
    seguidos, e nao no modo de gravar.

.EXAMPLE
    .\diagnostico_hotfolder.ps1 -Pasta "C:\HotFolder\Sublimacao"

.EXAMPLE
    .\diagnostico_hotfolder.ps1 -Pasta "\\RIP\HotFolder" -Pdf "C:\um\imposto.pdf"

.PARAMETER Rajada
    Depois dos seis metodos, larga tres arquivos em sequencia rapida pelo metodo
    que o agente usa hoje. Serve para testar se o problema e o ritmo, e nao o
    modo de gravacao.
#>
param(
    [string]$Pasta = "",
    [string]$Pdf = "",
    [int]$EsperaSegundos = 15,
    [switch]$Rajada
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Pasta)) {
    Write-Host ""
    Write-Host "  Cole o caminho da pasta que o RIP observa (hot folder)." -ForegroundColor Cyan
    $Pasta = Read-Host "  Pasta"
}
$Pasta = $Pasta.Trim().Trim('"')

if (-not (Test-Path -LiteralPath $Pasta -PathType Container)) {
    Write-Host "  A pasta nao existe: $Pasta" -ForegroundColor Red
    exit 2
}

# ─── O PDF de teste ──────────────────────────────────────────────────────────
if (-not [string]::IsNullOrWhiteSpace($Pdf) -and (Test-Path -LiteralPath $Pdf -PathType Leaf)) {
    $bytes = [System.IO.File]::ReadAllBytes($Pdf)
    $origem = "arquivo $Pdf"
} else {
    # PDF minimo e valido, uma pagina A4 em branco. Serve para saber se o
    # arquivo e IMPORTADO; nao serve para julgar o resultado impresso.
    $texto = @"
%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj
trailer<</Root 1 0 R>>
%%EOF
"@
    $bytes = [System.Text.Encoding]::ASCII.GetBytes($texto)
    $origem = "gerado aqui"
}

# ─── Os seis jeitos de fazer o arquivo aparecer ──────────────────────────────

function Gravar-PorRename {
    param($Destino, $Bytes, $Extensao = ".tmp")
    $temporario = $Destino + $Extensao
    [System.IO.File]::WriteAllBytes($temporario, $Bytes)
    Move-Item -LiteralPath $temporario -Destination $Destino -Force
}

function Gravar-Direto {
    param($Destino, $Bytes)
    [System.IO.File]::WriteAllBytes($Destino, $Bytes)
}

function Gravar-Exclusivo {
    param($Destino, $Bytes)
    # FileShare::None — quem tentar abrir no meio recebe ERROR_SHARING_VIOLATION,
    # que e o mesmo que qualquer copia em andamento produz.
    $fs = New-Object System.IO.FileStream(
        $Destino,
        [System.IO.FileMode]::CreateNew,
        [System.IO.FileAccess]::Write,
        [System.IO.FileShare]::None)
    try {
        $fs.Write($Bytes, 0, $Bytes.Length)
        $fs.Flush($true)
    } finally {
        $fs.Close()
    }
}

function Gravar-PorCopia {
    param($Destino, $Bytes)
    $fora = Join-Path $env:TEMP ("hf_origem_" + [System.IO.Path]::GetFileName($Destino))
    [System.IO.File]::WriteAllBytes($fora, $Bytes)
    try {
        Copy-Item -LiteralPath $fora -Destination $Destino -Force
    } finally {
        Remove-Item -LiteralPath $fora -Force -ErrorAction SilentlyContinue
    }
}

$metodos = @(
    @{ Nome = "rename";       Desc = "cria .tmp e renomeia (o agente antigo)";  Acao = { param($d,$b) Gravar-PorRename $d $b ".tmp" } },
    @{ Nome = "chrome";       Desc = "cria .crdownload e renomeia (navegador)"; Acao = { param($d,$b) Gravar-PorRename $d $b ".crdownload" } },
    @{ Nome = "direto";       Desc = "cria ja com o nome final (agente hoje)";  Acao = { param($d,$b) Gravar-Direto $d $b } },
    @{ Nome = "exclusivo";    Desc = "nome final, trancado enquanto escreve";   Acao = { param($d,$b) Gravar-Exclusivo $d $b } },
    @{ Nome = "copia";        Desc = "copia de fora (arrastar no Explorer)";    Acao = { param($d,$b) Gravar-PorCopia $d $b } },
    @{ Nome = "rename_toque"; Desc = "rename mais toque na data";               Acao = { param($d,$b)
            Gravar-PorRename $d $b ".tmp"
            (Get-Item -LiteralPath $d).LastWriteTime = Get-Date } }
)

Write-Host ""
Write-Host "  DIAGNOSTICO DE HOT FOLDER" -ForegroundColor Cyan
Write-Host "  Pasta : $Pasta"
Write-Host "  PDF   : $origem ($($bytes.Length) bytes)"
Write-Host "  Espera: $EsperaSegundos s por metodo"
Write-Host ""
Write-Host "  Deixe o RIP ABERTO e observando esta pasta enquanto isto roda." -ForegroundColor Yellow
Write-Host ""

$resultados = @()
$i = 0
foreach ($m in $metodos) {
    $i++
    $arquivo = "DIAG{0}_{1}.pdf" -f $i, $m.Nome
    $destino = Join-Path $Pasta $arquivo
    Write-Host ("  [{0}/{1}] {2,-13} — {3}" -f $i, $metodos.Count, $m.Nome, $m.Desc)

    try {
        & $m.Acao $destino $bytes
    } catch {
        Write-Host "          nao consegui gravar: $($_.Exception.Message)" -ForegroundColor Red
        $resultados += [pscustomobject]@{ Metodo = $m.Nome; Veredito = "erro ao gravar" }
        continue
    }

    Write-Host "          gravado — aguardando $EsperaSegundos s..." -ForegroundColor Gray
    Start-Sleep -Seconds $EsperaSegundos

    if (Test-Path -LiteralPath $destino) {
        Write-Host "          CONTINUA NA PASTA — o RIP ignorou" -ForegroundColor Yellow
        $resultados += [pscustomobject]@{ Metodo = $m.Nome; Veredito = "ignorado" }
    } else {
        Write-Host "          SUMIU — o RIP importou" -ForegroundColor Green
        $resultados += [pscustomobject]@{ Metodo = $m.Nome; Veredito = "IMPORTADO" }
    }
    Start-Sleep -Seconds 2
}

# ─── Rajada: o problema pode ser o ritmo, nao o modo ─────────────────────────
if ($Rajada) {
    Write-Host ""
    Write-Host "  RAJADA — tres arquivos seguidos, como num pedido de capa/miolo/contracapa" -ForegroundColor Cyan
    $rajadaDestinos = @()
    for ($n = 1; $n -le 3; $n++) {
        $d = Join-Path $Pasta ("RAJADA_{0:d5}_teste.pdf" -f $n)
        Gravar-Direto $d $bytes
        $rajadaDestinos += $d
    }
    Write-Host "          tres gravados sem pausa — aguardando $EsperaSegundos s..." -ForegroundColor Gray
    Start-Sleep -Seconds $EsperaSegundos
    $sobraram = @($rajadaDestinos | Where-Object { Test-Path -LiteralPath $_ })
    Write-Host ("          o RIP importou {0} de 3" -f (3 - $sobraram.Count)) -ForegroundColor Green
    $resultados += [pscustomobject]@{
        Metodo = "rajada(3x)"
        Veredito = if ($sobraram.Count -eq 0) { "IMPORTADO" } else { "$($sobraram.Count) ficaram" }
    }
}

# ─── Resultado ───────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "  ====================================================" -ForegroundColor Cyan
Write-Host "    RESULTADO" -ForegroundColor Cyan
Write-Host "  ====================================================" -ForegroundColor Cyan
foreach ($r in $resultados) {
    if ($r.Veredito -eq "IMPORTADO") {
        Write-Host ("    OK  {0,-14} {1}" -f $r.Metodo, $r.Veredito) -ForegroundColor Green
    } else {
        Write-Host ("    --  {0,-14} {1}" -f $r.Metodo, $r.Veredito) -ForegroundColor Yellow
    }
}
Write-Host ""

$importados = @($resultados | Where-Object { $_.Veredito -eq "IMPORTADO" } | ForEach-Object { $_.Metodo })

if ($importados.Count -eq 0) {
    Write-Host "    Nenhum metodo funcionou. Ou o observador do RIP nao estava ativo," -ForegroundColor Yellow
    Write-Host "    ou esta nao e a pasta associada ao preset no Edge Print." -ForegroundColor Yellow
} elseif ($importados -contains "rename" -and $importados -contains "direto") {
    Write-Host "    Os dois modos funcionam. Entao a causa NAO e o modo de gravacao." -ForegroundColor Yellow
    Write-Host "    Rode de novo com -Rajada: a suspeita passa a ser o ritmo em que o" -ForegroundColor Yellow
    Write-Host "    agente larga varios arquivos seguidos." -ForegroundColor Yellow
} elseif ($importados -notcontains "rename") {
    Write-Host "    O rename NAO funciona, mas $($importados -join ', ') sim." -ForegroundColor Green
    Write-Host "    O agente 1.2.32 ja grava por 'direto'. Se 'direto' estiver na lista" -ForegroundColor Green
    Write-Host "    acima, a correcao publicada resolve o caso." -ForegroundColor Green
} else {
    Write-Host "    Resultado misto. Me mande esta tela inteira." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "    Apague da pasta o que tiver sobrado antes de imprimir de verdade." -ForegroundColor Gray
Write-Host ""
