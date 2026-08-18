<#
.SINOPSE
    Monta o MP4 do vídeo do Ideal Control a partir dos quadros que o `gravar.js`
    deixou prontos.

.DESCRICAO
    Três coisas acontecem aqui, e nenhuma delas o Node alcança sozinho:

      1. **A narração.** A voz em português do Windows (SAPI) lê o texto de cada
         cena e grava um WAV. Nenhum serviço na internet entra nisso — o vídeo
         se gera com a máquina desligada da rede, e nenhuma frase do roteiro sai
         daqui.

      2. **A duração de cada cena.** Quem manda é a NARRAÇÃO, não a imagem: se a
         voz demora mais do que os quadros gravados, o último quadro fica
         parado até ela terminar. O contrário — cortar a frase no meio para
         caber na imagem — deixaria o vídeo incompreensível justamente para
         quem depende do áudio.

      3. **A composição.** Fundo, tela do celular, moldura, barra do topo e a
         faixa de legenda viram uma imagem de 1080×1920 — vertical, que é como o
         WhatsApp e o Instagram mostram sem cortar.

    A legenda é QUEIMADA na imagem de propósito. No WhatsApp o vídeo toca mudo:
    legenda em arquivo separado ninguém liga. O `.srt` sai junto mesmo assim,
    para quem for subir o vídeo em algum lugar que o aceite.

.PARAMETRO Trabalho
    A pasta que o `gravar.js` preencheu. Padrão: midia\_trabalho

.PARAMETRO Saida
    O arquivo MP4 final. Padrão: midia\ideal-control-como-usar.mp4
#>
[CmdletBinding()]
param(
    [string]$Trabalho,
    [string]$Saida,
    [string]$Voz
)

$ErrorActionPreference = 'Stop'
$RAIZ = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)

if (-not $Trabalho) { $Trabalho = Join-Path $RAIZ 'midia\_trabalho' }
if (-not $Saida)    { $Saida    = Join-Path $RAIZ 'midia\ideal-control-como-usar.mp4' }

<#
    Caminho relativo vira absoluto aqui, e nao e zelo.

    O demuxer `concat` do ffmpeg resolve os caminhos de dentro da lista a partir
    da PASTA DO ARQUIVO DE LISTA, e nao do diretorio de trabalho. Chamado com
    `-Trabalho midia\_trabalho`, cada linha saia relativa e o ffmpeg procurava
    `midia\_trabalho\midia/_trabalho/pedacos/01-abertura.mp4` -- depois de ja ter
    narrado e codificado as 24 cenas, que e o unico pedaco caro do script.

    A base e a RAIZ do repositorio, e nao o diretorio atual: assim o comando faz
    a mesma coisa venha de onde vier.
#>
function Caminho-Absoluto([string]$p) {
    if ([IO.Path]::IsPathRooted($p)) { return [IO.Path]::GetFullPath($p) }
    return [IO.Path]::GetFullPath((Join-Path $RAIZ $p))
}
$Trabalho = Caminho-Absoluto $Trabalho
$Saida    = Caminho-Absoluto $Saida

# ── Onde está o ffmpeg ───────────────────────────────────────────────────────
#
# Instalado por `winget install Gyan.FFmpeg`, ele nem sempre está no PATH da
# sessão que acabou de instalá-lo — o PATH só é relido em terminal novo. Por
# isso procuramos também na pasta do winget antes de desistir.

function Achar-Executavel([string]$nome) {
    $c = Get-Command $nome -ErrorAction SilentlyContinue
    if ($c) { return $c.Source }
    $pacotes = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
    if (Test-Path $pacotes) {
        $achado = Get-ChildItem $pacotes -Recurse -Filter "$nome.exe" -ErrorAction SilentlyContinue |
                  Select-Object -First 1
        if ($achado) { return $achado.FullName }
    }
    return $null
}

$FFMPEG  = Achar-Executavel 'ffmpeg'
$FFPROBE = Achar-Executavel 'ffprobe'
if (-not $FFMPEG -or -not $FFPROBE) {
    throw "Nao achei o ffmpeg. Instale com: winget install --id Gyan.FFmpeg -e"
}

$manifesto = Join-Path $Trabalho 'cenas.json'
if (-not (Test-Path $manifesto)) {
    throw "Nao achei $manifesto. Rode o gravar.js antes."
}
$dados = Get-Content $manifesto -Raw -Encoding UTF8 | ConvertFrom-Json
$FPS = $dados.fps

# ── A voz ────────────────────────────────────────────────────────────────────
#
# Duas gerações de voz convivem neste Windows, e a diferença se ouve:
#
#   OneCore  -- "Microsoft Daniel" e "Microsoft Maria", as vozes modernas do
#               sistema. Sao as que o Narrador e o Edge usam. Alcancadas so pelo
#               WinRT (`Windows.Media.SpeechSynthesis`).
#   SAPI 5   -- "Microsoft Maria Desktop", de duas decadas atras. E a unica que
#               o `System.Speech` enxerga, e foi a que narrou o primeiro video.
#
# O usuario ouviu o primeiro corte e disse: "narracao muito artificial". Era a
# Maria Desktop. Daqui em diante a narracao sai pela OneCore, e o SAPI fica como
# reserva -- numa maquina sem as modernas, um video com voz velha ainda e melhor
# que nenhum video.

Add-Type -AssemblyName System.Speech
Add-Type -AssemblyName System.Runtime.WindowsRuntime | Out-Null

$vozModerna = $null
$sintetizador = $null

try {
    [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media, ContentType = WindowsRuntime] | Out-Null
    [Windows.Storage.Streams.DataReader, Windows.Storage.Streams, ContentType = WindowsRuntime] | Out-Null

    # `AsTask` e o que transforma a promessa do WinRT em algo que o PowerShell
    # 5.1 sabe esperar. Sem ele, cada chamada volta um `IAsyncOperation` que
    # ninguem consegue abrir.
    $script:AsTask = [System.WindowsRuntimeSystemExtensions].GetMethods() |
        Where-Object {
            $_.Name -eq 'AsTask' -and $_.IsGenericMethodDefinition -and
            $_.GetParameters().Count -eq 1 -and
            $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
        } | Select-Object -First 1

    $todas = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices
    if ($Voz) {
        $vozModerna = $todas | Where-Object { $_.DisplayName -eq $Voz } | Select-Object -First 1
    }
    if (-not $vozModerna) {
        # Daniel primeiro: voz masculina, e a que soa menos sintetica das duas.
        $vozModerna = $todas | Where-Object {
            $_.Language -eq 'pt-BR' -and $_.DisplayName -match 'Daniel'
        } | Select-Object -First 1
    }
    if (-not $vozModerna) {
        $vozModerna = $todas | Where-Object { $_.Language -eq 'pt-BR' } | Select-Object -First 1
    }
} catch {
    $vozModerna = $null
}

function Esperar-WinRT($operacao, $tipo) {
    $t = $script:AsTask.MakeGenericMethod($tipo).Invoke($null, @($operacao))
    if (-not $t.Wait(120000)) { throw 'a voz do Windows nao respondeu' }
    return $t.Result
}

if ($vozModerna) {
    Write-Host ("Narracao: " + $vozModerna.DisplayName + " (voz moderna do Windows)")
} else {
    $sintetizador = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $emPortugues = $sintetizador.GetInstalledVoices() |
        Where-Object { $_.VoiceInfo.Culture.Name -eq 'pt-BR' } |
        Select-Object -First 1
    if (-not $emPortugues) {
        throw ("Nenhuma voz em portugues do Brasil instalada. " +
               "Configuracoes > Hora e idioma > Idioma > Portugues (Brasil) > Voz.")
    }
    $sintetizador.SelectVoice($emPortugues.VoiceInfo.Name)
    $sintetizador.Rate = -1
    Write-Host ("Narracao: " + $emPortugues.VoiceInfo.Name + " (reserva)")
}

<#
    Grava a narracao de uma cena num .wav.

    Pela voz moderna vai SSML, e nao texto cru: e o que permite pedir um ritmo
    um pouco mais lento (quem assiste esta aprendendo a mexer no aplicativo
    enquanto ouve) e um respiro entre as frases. Sem isso a voz emenda tudo
    numa linha so, que e metade do que soa artificial numa narracao.
#>
function Narrar([string]$texto, [string]$wav) {
    $limpo = Para-Voz $texto
    if (-not $vozModerna) {
        $sintetizador.SetOutputToWaveFile($wav)
        $sintetizador.Speak($limpo)
        $sintetizador.SetOutputToDefaultAudioDevice()
        return
    }

    $escapado = [Security.SecurityElement]::Escape($limpo)
    $ssml = @"
<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='pt-BR'>
<prosody rate='-8%'>$escapado</prosody>
</speak>
"@

    $s = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
    $s.Voice = $vozModerna
    $fluxo = Esperar-WinRT $s.SynthesizeSsmlToStreamAsync($ssml) `
        ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])

    $leitor = New-Object Windows.Storage.Streams.DataReader($fluxo.GetInputStreamAt(0))
    $n = [uint32]$fluxo.Size
    Esperar-WinRT $leitor.LoadAsync($n) ([uint32]) | Out-Null
    $bytes = New-Object byte[] $n
    $leitor.ReadBytes($bytes)
    [IO.File]::WriteAllBytes($wav, $bytes)
    $leitor.Dispose()
    $fluxo.Dispose()
    $s.Dispose()
}

<#
    A pontuacao que a voz tropeca.

    O travessao vira uma pausa esquisita e as reticencias, quando lidas, saem
    como um silencio longo no meio da frase. Trocar por virgula e ponto muda so
    o que a VOZ recebe -- a legenda continua com a pontuacao certa, porque ela
    foi desenhada la no `gravar.js`, a partir do texto original.
#>
function Para-Voz([string]$t) {
    return ($t -replace '—', ',' -replace '–', ',' -replace '…', '.' -replace '\s+', ' ').Trim()
}

function Segundos-Do-Audio([string]$caminho) {
    $bruto = & $FFPROBE -v error -show_entries format=duration -of csv=p=0 $caminho
    return [double]::Parse(($bruto | Select-Object -First 1).Trim(),
                           [Globalization.CultureInfo]::InvariantCulture)
}

<#
    O ffmpeg le numero com PONTO, sempre.

    Esta maquina esta em portugues, e converter um double para texto aqui
    entregaria "8,45". O ffmpeg leria o "8" e descartaria o resto sem reclamar:
    toda cena sairia com oito segundos cravados, a narracao seria cortada no
    meio, e nada no terminal diria que houve problema.
#>
function Numero([double]$n) {
    return $n.ToString('0.###', [Globalization.CultureInfo]::InvariantCulture)
}

function Tempo-SRT([double]$s) {
    $ts = [TimeSpan]::FromSeconds($s)
    return ('{0:00}:{1:00}:{2:00},{3:000}' -f $ts.Hours, $ts.Minutes, $ts.Seconds, $ts.Milliseconds)
}

# ── A composição ─────────────────────────────────────────────────────────────
#
# As coordenadas espelham as do `gravar.js`. Mudar uma sem a outra desalinha a
# moldura da tela do celular, e o defeito aparece como uma borda torta que
# ninguem consegue explicar.
#
#   1080×1920   a tela inteira, na cor de fundo do aplicativo
#   (0,0)       a barra do topo, 1080×120
#   (140,150)   a tela do celular, 800×1400
#   (100,110)   a moldura, 880×1480, que arredonda os cantos da tela
#   (0,1590)    a faixa de legenda, 1080×300

$FILTRO = @(
    'color=c=0x0a0f1e:s=1080x1920:r=24[bg]',
    '[0:v]tpad=stop_mode=clone:stop_duration=600,fps=24[app]',
    '[bg][app]overlay=140:150[a]',
    '[a][1:v]overlay=100:110[b]',
    '[b][2:v]overlay=0:0[c]',
    '[c][3:v]overlay=0:1590[v]',
    '[4:a]apad[au]'
) -join ';'

$narracoes = Join-Path $Trabalho 'narracao'
$pedacos   = Join-Path $Trabalho 'pedacos'
New-Item -ItemType Directory -Force -Path $narracoes, $pedacos | Out-Null

$moldura = Join-Path $Trabalho 'moldura.png'
$barra   = Join-Path $Trabalho 'barra.png'

$lista = New-Object System.Collections.Generic.List[string]
$srt   = New-Object System.Text.StringBuilder
$relogio = 0.0
$indice = 0

foreach ($cena in $dados.cenas) {
    $indice++
    Write-Host ("[{0}/{1}] {2}" -f $indice, $dados.cenas.Count, $cena.id) -NoNewline

    # 1. A narração.
    $wav = Join-Path $narracoes ($cena.id + '.wav')
    if (Test-Path $wav) { Remove-Item $wav -Force }
    Narrar $cena.narracao $wav

    # 2. A duração: a maior entre a voz e a imagem, mais um respiro.
    $daVoz    = Segundos-Do-Audio $wav
    $daImagem = $cena.quadros / $FPS
    $duracao  = [Math]::Round([Math]::Max($daVoz, $daImagem) + 0.55, 3)

    # 3. A composição.
    $legenda = Join-Path $Trabalho ('legendas\' + $cena.id + '.png')
    $quadros = Join-Path $Trabalho ('quadros\' + $cena.id + '\%04d.jpg')
    $pedaco  = Join-Path $pedacos ($cena.id + '.mp4')

    & $FFMPEG -hide_banner -loglevel error -y `
        -framerate $FPS -i $quadros `
        -i $moldura -i $barra -i $legenda -i $wav `
        -filter_complex $FILTRO `
        -map '[v]' -map '[au]' -t (Numero $duracao) `
        -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -r 24 `
        -c:a aac -b:a 128k -ar 48000 -ac 2 `
        $pedaco
    if ($LASTEXITCODE -ne 0) { throw "ffmpeg falhou na cena $($cena.id)" }

    $lista.Add("file '" + ($pedaco -replace '\\', '/') + "'")

    [void]$srt.AppendLine([string]$indice)
    [void]$srt.AppendLine((Tempo-SRT $relogio) + ' --> ' + (Tempo-SRT ($relogio + $duracao - 0.05)))
    [void]$srt.AppendLine($cena.legenda)
    [void]$srt.AppendLine('')
    $relogio += $duracao

    Write-Host ("  {0:N1}s  (voz {1:N1}s, imagem {2:N1}s)" -f $duracao, $daVoz, $daImagem)
}

if ($sintetizador) { $sintetizador.Dispose() }

# ── A emenda ─────────────────────────────────────────────────────────────────
#
# `-c copy`: todos os pedaços saíram do mesmo codificador, com os mesmos
# parâmetros, então emendar é copiar. Recodificar aqui perderia qualidade uma
# segunda vez sem ganhar nada.

# Sem marca de ordem de byte (BOM). O `-Encoding UTF8` do PowerShell 5.1 escreve
# uma, e o demuxer `concat` do ffmpeg leria esses tres bytes como parte da
# primeira linha -- "nao achei o arquivo ﻿file '...'", com um caractere invisivel
# no meio da mensagem.
$semBOM = New-Object System.Text.UTF8Encoding($false)
$listaArquivo = Join-Path $Trabalho 'lista.txt'
[IO.File]::WriteAllLines($listaArquivo, $lista, $semBOM)

New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Saida) | Out-Null
& $FFMPEG -hide_banner -loglevel error -y -f concat -safe 0 -i $listaArquivo -c copy $Saida
if ($LASTEXITCODE -ne 0) { throw "ffmpeg falhou ao emendar as cenas" }

# A legenda vai COM marca de ordem de byte, ao contrário da lista acima, e a
# diferença não é descuido: quem lê o `.srt` é um tocador de vídeo, e sem a
# marca muitos deles adivinham a codificação da região do computador. Em
# português isso troca cada acento por dois caracteres errados -- "Ideal
# Control Ã© o aplicativo". O ffmpeg, que lê a lista, não adivinha nada.
$comBOM = New-Object System.Text.UTF8Encoding($true)
$srtArquivo = [IO.Path]::ChangeExtension($Saida, '.srt')
[IO.File]::WriteAllText($srtArquivo, $srt.ToString().TrimEnd(), $comBOM)

$tamanho = [Math]::Round((Get-Item $Saida).Length / 1MB, 1)
Write-Host ''
Write-Host ("Pronto: {0}" -f $Saida) -ForegroundColor Green
Write-Host ("  {0:N0}s de video, {1} MB" -f $relogio, $tamanho)
Write-Host ("  legenda separada em {0}" -f $srtArquivo)
