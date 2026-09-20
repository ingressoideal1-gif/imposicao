<#
Copia filtrada do projeto para uma pasta do Google Drive ja conectada.
Por padrao apenas simula. Nao apaga a origem nem arquivos no destino.
O historico Git deste projeto tem .env.local: .git fica somente na origem.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Destino,
    [switch]$Executar,
    [switch]$Continuo
)

$ErrorActionPreference = 'Stop'
$origemDrive = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..')).TrimEnd('\')
$destinoDrive = [IO.Path]::GetFullPath($Destino).TrimEnd('\')
if (-not [IO.Path]::IsPathRooted($Destino) -or $destinoDrive -notmatch '\\Ideal Imposition\\ideal-imposition$') {
    throw 'Informe o caminho absoluto terminado em Ideal Imposition\ideal-imposition no Google Drive.'
}
if ($destinoDrive.StartsWith($origemDrive + '\', [StringComparison]::OrdinalIgnoreCase) -or
    $origemDrive.StartsWith($destinoDrive + '\', [StringComparison]::OrdinalIgnoreCase) -or
    $origemDrive.Equals($destinoDrive, [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Origem e destino nao podem ser iguais ou estar contidos um no outro.'
}
if ($Continuo -and -not $Executar) { throw 'Use a simulacao sem -Continuo.' }

# Caminhos relativos sao ancorados na origem: supabase/functions/painel e fonte.
$pastasRaiz = @(
    '.git', '.agents', '.codex', '.claude', '.superpowers', '.firebase', '.vercel',
    'build', 'dist', 'painel', 'painel.novo', 'Ideal Control', 'perfis_icc',
    'rascunhos', 'scratch', 'midia', 'supabase/.temp'
)
$pastasQualquerNivel = @(
    'node_modules', 'venv', '.venv', '__pycache__', '.pytest_cache', '.mypy_cache',
    '.ruff_cache', '.cache', '.npm', 'tmp', 'temp', 'cache', 'caches', 'logs',
    'coverage', '.nyc_output', 'test-results', 'playwright-report',
    'credentials', 'secrets', '.ssh', '.aws', '.gcloud'
)
$arquivosExcluidos = @(
    '.env', '.env.*', '*.env', '*credential*', '*credencial*', '*secret*', '*segredo*',
    '*senha*', '*password*', '*token*', '.npmrc', '.pypirc', '.netrc',
    '*service-account*', '*service_account*', '*serviceAccount*',
    '*.pem', '*.key', '*.p12', '*.pfx', '*.jks', '*.keystore', '*.kdbx',
    'acessos_locais.json', 'agent_config.json', 'formats_db.json', 'print_configs.json',
    'printer_icc_map.json', 'hot_folders.json', 'settings.local.json',
    '*.db', '*.db-*', '*.sqlite', '*.sqlite3', '*.dump', '*.bak', '*backup*',
    '*.bin', '*.xlsx', '*.xls', '*.pdf', '*.exe', '*.msi', '*.zip', '*.7z', '*.tar', '*.gz',
    '*.pyc', '*.pyo', '*.log', '*.tmp', '*.temp', '*.swp', '*.swo', '*.lock.tmp',
    '*~', '~$*', 'Thumbs.db', 'desktop.ini', '.DS_Store',
    'scratch_*', 'temp_*', 'tmp*', 'patch_*', 'check_*', 'fix_*'
)
$pastasExcluidas = @($pastasRaiz | ForEach-Object { Join-Path $origemDrive $_ }) + $pastasQualquerNivel

# Exclusoes conservadoras por nome: nao inspecionam credenciais. Algumas fontes
# com nomes de senha/token/segredo ficam de fora; veja a simulacao antes de ativar.
$argumentosDrive = @(
    $origemDrive, $destinoDrive, '/E', '/XO', '/COPY:DAT', '/DCOPY:DAT',
    '/R:1', '/W:2', '/XJ', '/SL', '/NP', '/NDL', '/XF'
) + $arquivosExcluidos + @('/XD') + $pastasExcluidas
if (-not $Executar) { $argumentosDrive += '/L' }

$mutexDrive = [Threading.Mutex]::new($false, 'Local\IdealImpositionDriveCopy')
if (-not $mutexDrive.WaitOne(0)) { $mutexDrive.Dispose(); exit 0 }
try {
    do {
        # Nunca criar uma unidade/pasta substituta quando o Drive estiver offline.
        $paiDrive = Split-Path -Parent $destinoDrive
        if (-not (Test-Path -LiteralPath $paiDrive -PathType Container)) {
            if (-not $Continuo) { throw 'Pasta Ideal Imposition indisponivel. Conecte o Google Drive primeiro.' }
            Write-Warning 'Google Drive indisponivel; nova tentativa em 60 segundos.'
        } else {
            & robocopy.exe @argumentosDrive
            $codigoDrive = $LASTEXITCODE
            if ($codigoDrive -ge 8) {
                if (-not $Continuo) { throw "Robocopy falhou com codigo $codigoDrive." }
                Write-Warning "Robocopy falhou com codigo $codigoDrive; nova tentativa em 60 segundos."
            }
        }
        if ($Continuo) { Start-Sleep -Seconds 60 }
    } while ($Continuo)
} finally {
    $mutexDrive.ReleaseMutex()
    $mutexDrive.Dispose()
}
