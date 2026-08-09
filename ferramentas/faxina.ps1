# Roda UMA VEZ. Reorganiza a raiz do repositorio.
#
# Move, nunca apaga: os arquivos continuam no disco (em rascunhos/) e o
# historico completo segue acessivel pela tag v490. Desfazer e um
# `git revert` do commit que este script produz.
#
# Opera SO sobre arquivos rastreados pelo git. A raiz tambem tem PDFs e
# bancos de teste que ja estao no .gitignore — eles sao invisiveis ao git,
# nao aparecem no `git status` e portanto nao disparam o freio de rascunho.
# Mexer neles seria risco (algum pode ser insumo de runtime) sem ganho.
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

# --- Rascunho: sai do git, fica no disco em rascunhos/ ---------------------
# Padroes (o mesmo conjunto que vira freio permanente no Publicacao.psm1)
# mais uma lista explicita do que so existe por acidente historico e nao
# tem padrao que o descreva.
$padroes = @(
    'scratch_*', 'temp_*', 'temp.py', 'temp2.py',
    'patch_*', 'patch2.py',
    'check_*', 'fix_*',
    'diag_engine.py', 'diag2.py',
    'test_debug*.js', 'test.js', 'test.py', 'test2.py', 'test3.py',
    'test4.py', 'test5.py', 'test-fetch.js', 'test_api*.js',
    'test_browser.js', 'test_col.js', 'test_final.js', 'test_pdf.js',
    # scratch_func.txt nao entra aqui: ja e coberto por 'scratch_*' acima, e
    # listar duas vezes faz o segundo `git rm --cached` falhar barulhentamente
    # sobre um arquivo que ja saiu.
    'diff.txt', 'build_log.txt', 'mangled.txt', 'py_out.txt',
    'test_out.txt', 'snapshot.jpg'
)
$explicitos = @(
    'engine_backup.py',   # o git ja e o backup
    'read_pdf.py', 'poll_render.py', 'find_tipos.py', 'move_tipos.ps1',
    'update_engine.py',
    'imposition.db', 'local_db.sqlite'   # ambos com 0 byte
)

# --- Fica no git, so muda de lugar ----------------------------------------
$paraTests = @(
    'test_engine_dual_vdp.py', 'test_engine_rotation.py', 'test_impose.py',
    'test_pdf_duplex.py', 'test_pdf_multiple.py', 'test_pdf_offset_cropbox.py',
    'test_multi_artes.py', 'test_multi_artes_capa.py', 'test_mapa.py',
    'test_render.py', 'test_local.py', 'test_gen.py', 'test_capa.py',
    'test_db.py', 'test_diag.py', 'test_fastapi.py', 'test_enc_front.py',
    'run_impose.py', 'teste_dados.csv'
)
$paraSql = @('schema*.sql', 'alter_*.sql', 'rls_fase1_catalogo.sql',
             'criar_bucket_previews.sql', 'migration_data.sql')
$paraMigracoes = @('migrate_*.py', 'migrar_previews_para_storage.py',
                   'add_pc_fonts.py', 'add_popular_fonts.py')

foreach ($d in 'rascunhos', 'tests', 'sql', 'scripts\migracoes') {
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Force $d | Out-Null }
}

$rastreados = @(git ls-files | Where-Object { $_ -notmatch '/' })
Write-Host "$($rastreados.Count) arquivos rastreados na raiz." -ForegroundColor Cyan

# -like e nao -Filter de proposito: o -Filter do Get-ChildItem herda o
# casamento por nome 8.3 do Windows, entao 'test_api*.js' tambem pegaria um
# 'test_api2.jsx'. Aqui um falso positivo tira do git um arquivo que deveria
# ficar.
function Selecionar-Raiz {
    param([string]$Alvo)
    return @($rastreados | Where-Object { $_ -like $Alvo })
}

$movidos = 0

function Mover-ParaFora {
    param([string[]]$Alvos)
    foreach ($alvo in $Alvos) {
        foreach ($nome in (Selecionar-Raiz $alvo)) {
            git rm --cached --quiet -- $nome
            if (Test-Path -PathType Leaf $nome) {
                Move-Item -Force -Path $nome -Destination "rascunhos\$nome"
            }
            Write-Host "  rascunhos/  $nome" -ForegroundColor DarkGray
            $script:movidos++
        }
    }
}

function Mover-NoGit {
    param([string[]]$Alvos, [string]$Destino)
    foreach ($alvo in $Alvos) {
        foreach ($nome in (Selecionar-Raiz $alvo)) {
            git mv -- $nome "$Destino/$nome"
            Write-Host "  $Destino/  $nome" -ForegroundColor DarkGray
            $script:movidos++
        }
    }
}

Write-Host "`nMovendo rascunhos para fora do git..." -ForegroundColor Cyan
Mover-ParaFora ($padroes + $explicitos)

Write-Host "`nOrganizando o que fica versionado..." -ForegroundColor Cyan
Mover-NoGit $paraTests      'tests'
Mover-NoGit $paraSql        'sql'
Mover-NoGit $paraMigracoes  'scripts/migracoes'

Write-Host "`n$movidos arquivo(s) movidos. Confira com 'git status' antes de commitar." -ForegroundColor Green
