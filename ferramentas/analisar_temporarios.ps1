# Somente inventario de metadados. Nao le conteudo nem exclui arquivos.
# Executar no PowerShell do usuario que utiliza o NewProd em cada estacao.
[CmdletBinding()]
param([string]$OutputPath)

$ErrorActionPreference = 'Stop'
$agora = [DateTime]::UtcNow

function Get-Categoria([System.IO.FileInfo]$Arquivo, [string]$Raiz) {
    $relativo = $Arquivo.FullName.Substring($Raiz.TrimEnd('\').Length).TrimStart('\')
    if ($relativo -match '^_MEI[^\\]*\\') { return 'Pacotes _MEI (varios apps PyInstaller)' }
    if ($Arquivo.Name -like 'NewProd_Setup_*.msi' -or $Arquivo.Name -eq 'newprod_update.bat') {
        return 'Atualizador NewProd'
    }
    if ($Arquivo.Name -like 'tmp*.ttf') { return 'Fontes tmp*.ttf (origem nao comprovada)' }
    if ($Arquivo.Extension -ieq '.pdf') { return 'PDFs (origem nao comprovada)' }
    return 'Outros arquivos'
}

function Measure-Pasta([string]$Nome, [string]$Caminho) {
    $r = [ordered]@{
        area = $Nome; caminho = $Caminho; estado = 'ok'; arquivos = 0
        bytes = [long]0; bytes_mais_7_dias = [long]0; bytes_mais_30_dias = [long]0
        erros_leitura = 0; links_ignorados = 0; categorias = @(); extensoes = @()
        maior_arquivo_bytes = [long]0; arquivo_mais_antigo_utc = $null
    }
    try { $item = Get-Item -LiteralPath $Caminho -Force -ErrorAction Stop }
    catch [System.Management.Automation.ItemNotFoundException] {
        $r.estado = 'ausente'; return [pscustomobject]$r
    }
    catch { $r.estado = 'inacessivel'; $r.erros_leitura = 1; return [pscustomobject]$r }
    if (-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        $r.estado = 'ignorado: nao e pasta comum'; return [pscustomobject]$r
    }
    $pilha = New-Object 'System.Collections.Generic.Stack[string]'
    $pilha.Push($item.FullName)
    $categorias = @{}
    $extensoes = @{}
    while ($pilha.Count -gt 0) {
        $pasta = $pilha.Pop()
        $falhas = @()
        Get-ChildItem -LiteralPath $pasta -Force -ErrorAction SilentlyContinue -ErrorVariable falhas | ForEach-Object {
            $filho = $_
            if ($filho.Attributes -band [IO.FileAttributes]::ReparsePoint) {
                $r.links_ignorados++
            } elseif ($filho.PSIsContainer) {
                $pilha.Push($filho.FullName)
            } else {
                $tamanho = [long]$filho.Length
                $r.arquivos++
                $r.bytes += $tamanho
                if ($filho.LastWriteTimeUtc -lt $agora.AddDays(-7)) { $r.bytes_mais_7_dias += $tamanho }
                if ($filho.LastWriteTimeUtc -lt $agora.AddDays(-30)) { $r.bytes_mais_30_dias += $tamanho }
                if ($tamanho -gt $r.maior_arquivo_bytes) { $r.maior_arquivo_bytes = $tamanho }
                if ($null -eq $r.arquivo_mais_antigo_utc -or $filho.LastWriteTimeUtc -lt $r.arquivo_mais_antigo_utc) {
                    $r.arquivo_mais_antigo_utc = $filho.LastWriteTimeUtc
                }
                $categoria = Get-Categoria $filho $Caminho
                $ext = $filho.Extension.ToLowerInvariant()
                if (-not $ext) { $ext = '(sem extensao)' }
                foreach ($par in @(@($categorias, $categoria), @($extensoes, $ext))) {
                    $mapa = $par[0]; $chave = $par[1]
                    if (-not $mapa.ContainsKey($chave)) {
                        $mapa[$chave] = [pscustomobject]@{tipo = $chave; arquivos = 0; bytes = [long]0}
                    }
                    $mapa[$chave].arquivos++
                    $mapa[$chave].bytes += $tamanho
                }
            }
        }
        $r.erros_leitura += $falhas.Count
    }
    if ($r.erros_leitura -gt 0) { $r.estado = 'parcial: falhas de leitura' }
    if ($null -ne $r.arquivo_mais_antigo_utc) {
        $r.arquivo_mais_antigo_utc = $r.arquivo_mais_antigo_utc.ToString('o')
    }
    $r.categorias = @($categorias.Values | Sort-Object bytes -Descending)
    $r.extensoes = @($extensoes.Values | Sort-Object bytes -Descending | Select-Object -First 15)
    return [pscustomobject]$r
}

$raizes = @(
    @{nome = 'Temporarios do usuario atual'; caminho = [IO.Path]::GetTempPath().TrimEnd('\')},
    @{nome = 'Temporarios do Windows'; caminho = (Join-Path $env:SystemRoot 'Temp')},
    @{nome = 'Cache de fontes NewProd'; caminho = (Join-Path $env:LOCALAPPDATA 'NewProd Agent\fonts_cache')},
    @{nome = 'Cache de fotos NewProd'; caminho = (Join-Path $env:LOCALAPPDATA 'NewProd\cache\fotos')}
)
$resultados = @()
foreach ($raiz in $raizes) {
    Write-Host ('Medindo: ' + $raiz.nome)
    $resultados += Measure-Pasta $raiz.nome $raiz.caminho
}
$discos = @(Get-PSDrive -PSProvider FileSystem | Where-Object { $_.Root -match '^[A-Za-z]:\\$' } | ForEach-Object {
    [pscustomobject]@{unidade = $_.Name; bytes_usados = $_.Used; bytes_livres = $_.Free}
})
$processos = @(Get-Process -Name NewProd -ErrorAction SilentlyContinue | ForEach-Object {
    [pscustomobject]@{pid = $_.Id; nome = $_.ProcessName}
})
$relatorio = [ordered]@{
    estacao = [Environment]::MachineName
    inicio_utc = $agora.ToString('o')
    fim_utc = [DateTime]::UtcNow.ToString('o')
    somente_leitura = $true
    discos = $discos
    processos_newprod = $processos
    areas = $resultados
    limites = @(
        'Metadados apenas; arquivos podem mudar durante a coleta.'
        'Somente temporarios do usuario atual, Windows Temp e dois caches NewProd.'
        'Nao inclui outros perfis, Lixeira, Downloads, Windows Update ou spool de impressao.'
        'Extensao e nome nao comprovam origem no NewProd; _MEI e usado por outros apps.'
        'Idade por ultima modificacao; arquivo antigo nao significa seguro para excluir.'
        'Links nao sao seguidos; bytes representam tamanho logico, nao alocacao fisica.'
        'Areas podem se sobrepor se TEMP tiver configuracao personalizada; nao somar sem conferir.'
    )
}
$json = $relatorio | ConvertTo-Json -Depth 8
if ($OutputPath) {
    $destino = [IO.Path]::GetFullPath($OutputPath)
    # CreateNew impede sobrescrever qualquer arquivo existente.
    $stream = [IO.File]::Open($destino, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
    try {
        $bytes = (New-Object Text.UTF8Encoding($false)).GetBytes($json)
        $stream.Write($bytes, 0, $bytes.Length)
    } finally { $stream.Dispose() }
    Write-Host ('Relatorio salvo: ' + $destino)
} else {
    $json
}
