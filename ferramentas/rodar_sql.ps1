<#
.SINOPSE
    Roda um arquivo .sql no banco do Supabase, daqui, sem abrir o painel.

.POR QUE ELE EXISTE
    Todo SQL deste projeto sai como arquivo completo, pronto para colar no SQL
    Editor. Colar continua funcionando -- mas quem cola e o usuario, e um passo
    manual num painel de terceiro e onde a versao do banco desanda em silencio:
    ninguem lembra se rodou, e o codigo que le a coluna nova ja esta no ar.

    Este script fecha esse buraco. Ele manda o arquivo INTEIRO, do jeito que
    esta, para a API de gerenciamento do Supabase -- a mesma que o SQL Editor
    usa por baixo.

.O QUE ELE EXIGE
    `SUPABASE_ACCESS_TOKEN` no .env.local: o token pessoal de acesso (comeca com
    `sbp_`). Ele NAO e a service_role, e nao serve para ler dado nenhum -- serve
    para administrar o projeto. Por isso ele nunca e impresso aqui.

.EXEMPLO
    .\ferramentas\rodar_sql.ps1 sql\schema_acesso_setor_bloqueado.sql
    .\ferramentas\rodar_sql.ps1 sql\schema_acesso_setor_bloqueado.sql -Conferir
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [string]$Arquivo,

    # So mostra o que seria enviado. Nada e executado.
    [switch]$Conferir,

    # O projeto. O padrao e o unico que este repositorio usa; ver security_config.py.
    [string]$Projeto = 'vwbtitjlpelrcnsytzqw'
)

$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot

# ── O arquivo ───────────────────────────────────────────────────────────────

if (-not [System.IO.Path]::IsPathRooted($Arquivo)) {
    $Arquivo = Join-Path $raiz $Arquivo
}
if (-not (Test-Path $Arquivo)) {
    Write-Host "  Nao achei o arquivo: $Arquivo" -ForegroundColor Red
    exit 1
}
# `ReadAllText`, e nao `Get-Content -Raw`: no PowerShell 5.1 o `Get-Content`
# devolve a string DECORADA com propriedades do provedor de arquivo (PSPath,
# PSDrive, PSProvider...). Elas nao aparecem quando se imprime a variavel, mas o
# `ConvertTo-Json` serializa todas -- e o corpo enviado vira um objeto de dez mil
# caracteres com o SQL escondido dentro, que a API recusa com um "expected
# string, received object" que nao ajuda ninguem a entender o que houve.
$sql = [System.IO.File]::ReadAllText($Arquivo, [System.Text.Encoding]::UTF8)

Write-Host ''
Write-Host '  RODAR SQL NO SUPABASE' -ForegroundColor Cyan
Write-Host "  arquivo : $(Split-Path -Leaf $Arquivo)"
Write-Host "  projeto : $Projeto"
Write-Host "  tamanho : $($sql.Length) caracteres"
Write-Host ''

# ── O freio ─────────────────────────────────────────────────────────────────
#
# DROP e TRUNCATE em banco de producao de uma grafica que esta trabalhando NAO
# passam por aqui sem alguem dizer que e de proposito. O `-Conferir` mostra o
# arquivo; a decisao de rodar mesmo assim e do usuario, no painel, onde ele ve
# o que vai acontecer.
$perigosos = @('DROP TABLE', 'DROP COLUMN', 'TRUNCATE', 'DELETE FROM')
foreach ($p in $perigosos) {
    # Sem os comentarios: os arquivos deste projeto trazem o "como desfazer"
    # comentado no fim, e ele cita justamente esses comandos.
    $semComentario = ($sql -split "`n" | Where-Object { $_.TrimStart() -notlike '--*' }) -join "`n"
    if ($semComentario -match [regex]::Escape($p)) {
        Write-Host "  RECUSADO: o arquivo contem '$p' fora de comentario." -ForegroundColor Red
        Write-Host '  Comando destrutivo nao sobe por script. Rode no SQL Editor,'
        Write-Host '  olhando o que vai acontecer.'
        exit 1
    }
}

if ($Conferir) {
    Write-Host '  --- o que seria enviado ---' -ForegroundColor DarkGray
    Write-Host $sql
    Write-Host '  --- fim (nada foi executado) ---' -ForegroundColor DarkGray
    exit 0
}

# ── O token ─────────────────────────────────────────────────────────────────
#
# Lido do .env.local, que o git ignora. Nunca impresso.

$token = $env:SUPABASE_ACCESS_TOKEN
if (-not $token) {
    $env_local = Join-Path $raiz '.env.local'
    if (Test-Path $env_local) {
        foreach ($linha in Get-Content $env_local -Encoding UTF8) {
            if ($linha -match '^\s*SUPABASE_ACCESS_TOKEN\s*=\s*(.+?)\s*$') {
                $token = $matches[1].Trim('"').Trim("'")
            }
        }
    }
}
if (-not $token) {
    Write-Host '  Nao achei SUPABASE_ACCESS_TOKEN no ambiente nem no .env.local.' -ForegroundColor Red
    Write-Host '  Ele e o token pessoal de acesso do Supabase (comeca com sbp_).'
    exit 1
}

# ── A chamada ───────────────────────────────────────────────────────────────

$url = "https://api.supabase.com/v1/projects/$Projeto/database/query"
$corpo = @{ query = $sql } | ConvertTo-Json -Depth 3 -Compress

# O CORPO VAI EM BYTES UTF-8, E NAO COMO STRING.
#
# No Windows PowerShell 5.1, `Invoke-RestMethod -Body <string>` com
# `application/json` sem charset codifica o texto em Latin-1: todo acento chega
# ao servidor estropiado. E chega EM SILENCIO -- a API aceita, o SQL roda, e o
# estrago so aparece depois, dentro do banco.
#
# Foi assim que a funcao `link_cliente_status` nasceu recusando 'Em Alteração':
# o literal com cedilha e til virou outra coisa no caminho, e por meses o
# cliente pedia alteracao da arte sem o status do link mudar. Descoberto em
# 20/08/2026, ao rodar o conserto e ver que a versao SEM acento passava e a
# COM acento continuava recusada.
#
# Convertendo aqui, o que a API recebe e exatamente o que esta no arquivo.
$bytes = [System.Text.Encoding]::UTF8.GetBytes($corpo)

try {
    $r = Invoke-RestMethod -Method Post -Uri $url -Body $bytes `
        -ContentType 'application/json; charset=utf-8' `
        -Headers @{ Authorization = "Bearer $token" }
}
catch {
    Write-Host '  O Supabase recusou:' -ForegroundColor Red
    $detalhe = $_.ErrorDetails.Message
    if (-not $detalhe) { $detalhe = $_.Exception.Message }
    Write-Host "  $detalhe"
    exit 1
}

Write-Host '  RODOU.' -ForegroundColor Green
if ($r) {
    Write-Host '  resposta:' -ForegroundColor DarkGray
    $r | ConvertTo-Json -Depth 4 | Write-Host
}
Write-Host ''
