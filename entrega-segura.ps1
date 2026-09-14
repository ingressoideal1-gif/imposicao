<#
.SYNOPSIS
    Prepara, verifica e publica entregas isoladas do Ideal Imposition.

.DESCRIPTION
    Orquestra worktree, escopo, validacoes, commit, integracao e comprovacao
    publica. Nao executa SQL remoto e nao distribui o NewProd.

.EXAMPLE
    .\entrega-segura.ps1 preparar -Nome retorno-arte-21396

.EXAMPLE
    .\entrega-segura.ps1 verificar -Escopo Frontend

.EXAMPLE
    .\entrega-segura.ps1 publicar -Escopo Frontend -Mensagem "Corrige retorno para Arte"
#>
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateSet('preparar', 'verificar', 'publicar')]
    [string]$Acao,

    [string]$Nome,

    [ValidateSet('Auto', 'Frontend', 'EdgeFunctions', 'Documentacao', 'Operacional', 'NewProd')]
    [string]$Escopo = 'Auto',

    [string]$Mensagem,

    [ValidateSet('PR', 'Direta')]
    [string]$Integracao = 'PR',

    [string[]]$Teste = @(),

    [switch]$Sim,

    [switch]$Simular,

    [switch]$Detalhar,

    [string]$Dominio = 'https://imposition.ai-ideal.com.br',

    [ValidateRange(30, 1800)]
    [int]$TimeoutHospedagemSegundos = 300
)

$ErrorActionPreference = 'Stop'
$script:Raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
$script:IntegracaoConcluida = $false
$script:EfeitoRemotoIniciado = $false
$script:BranchEnviada = $false

Import-Module (Join-Path $script:Raiz 'ferramentas\Publicacao.psm1') -Force
Import-Module (Join-Path $script:Raiz 'ferramentas\EntregaSegura.psm1') -Force

function Write-Titulo {
    param([string]$Texto)
    Write-Host ''
    Write-Host "  $Texto" -ForegroundColor Cyan
}

function Invoke-Git {
    param(
        [Parameter(Mandatory)][string[]]$Argumentos,
        [switch]$PermitirFalha
    )
    # Windows PowerShell 5.1 transforma stderr nativo em ErrorRecord. Git usa
    # stderr tambem para progresso bem-sucedido; com ErrorActionPreference=Stop
    # isso interromperia um fetch/push/worktree cujo exit code e zero.
    $preferenciaAnterior = $ErrorActionPreference
    $arquivoErro = [IO.Path]::GetTempFileName()
    try {
        $ErrorActionPreference = 'Continue'
        $saida = @(& git -C $script:Raiz @Argumentos 2> $arquivoErro)
        $codigo = $LASTEXITCODE
        $errosNativos = @([IO.File]::ReadAllLines($arquivoErro))
    } finally {
        $ErrorActionPreference = $preferenciaAnterior
        Remove-Item -LiteralPath $arquivoErro -Force -ErrorAction SilentlyContinue
    }
    if ($codigo -ne 0 -and -not $PermitirFalha) {
        $detalhes = @($saida + $errosNativos) -join [Environment]::NewLine
        throw "git $($Argumentos -join ' ') falhou: $detalhes"
    }
    return $saida
}

function Get-CaminhoAbsolutoGit {
    param([Parameter(Mandatory)][string]$Caminho)
    if ([IO.Path]::IsPathRooted($Caminho)) { return [IO.Path]::GetFullPath($Caminho) }
    return [IO.Path]::GetFullPath((Join-Path $script:Raiz $Caminho))
}

function Get-CheckoutPrincipal {
    $comum = [string](Invoke-Git @('rev-parse', '--git-common-dir') | Select-Object -Last 1)
    $absoluto = Get-CaminhoAbsolutoGit $comum.Trim()
    if ((Split-Path -Leaf $absoluto) -ne '.git') {
        throw "Diretorio Git comum inesperado: $absoluto"
    }
    return [IO.Path]::GetFullPath((Split-Path -Parent $absoluto))
}

function Assert-Repositorio {
    $topo = [string](Invoke-Git @('rev-parse', '--show-toplevel') | Select-Object -Last 1)
    if ([IO.Path]::GetFullPath($topo.Trim()) -ne [IO.Path]::GetFullPath($script:Raiz)) {
        throw 'O entrega-segura.ps1 precisa estar na raiz da worktree em uso.'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $script:Raiz 'frontend')) -or
        -not (Test-Path -LiteralPath (Join-Path $script:Raiz 'ferramentas\Publicacao.psm1'))) {
        throw 'Esta pasta nao tem a estrutura esperada do Ideal Imposition.'
    }
}

function Get-BranchAtual {
    return ([string](Invoke-Git @('branch', '--show-current') | Select-Object -Last 1)).Trim()
}

function Get-DivergenciaOriginMain {
    $linha = ([string](Invoke-Git @('rev-list', '--left-right', '--count', 'HEAD...origin/main') |
        Select-Object -Last 1)).Trim()
    $partes = $linha -split '\s+'
    if ($partes.Count -ne 2) { throw "Nao foi possivel interpretar a divergencia: $linha" }
    return [pscustomobject]@{ Adiante = [int]$partes[0]; Atras = [int]$partes[1] }
}

function Get-ArquivosDaEntrega {
    $caminhos = @()
    $caminhos += @(Invoke-Git @('diff', '--name-only', '--diff-filter=ACDMRTUXB', 'HEAD', '--'))
    $caminhos += @(Invoke-Git @('ls-files', '--others', '--exclude-standard'))
    $caminhos += @(Invoke-Git @('diff', '--name-only', '--diff-filter=ACDMRTUXB', 'origin/main...HEAD', '--'))
    return @($caminhos | ForEach-Object { ([string]$_).Trim().Replace('\', '/') } |
        Where-Object { $_ } | Sort-Object -Unique)
}

function Test-LinksMarkdown {
    param([Parameter(Mandatory)][string[]]$Arquivos)
    foreach ($relativo in @($Arquivos | Where-Object { $_ -match '\.md$' })) {
        $absoluto = Join-Path $script:Raiz $relativo
        if (-not (Test-Path -LiteralPath $absoluto -PathType Leaf)) { continue }
        $texto = [IO.File]::ReadAllText($absoluto)
        foreach ($m in [regex]::Matches($texto, '\]\((?<alvo>[^)]+)\)')) {
            $alvo = $m.Groups['alvo'].Value.Trim().Trim('<', '>')
            if (-not $alvo -or $alvo.StartsWith('#') -or $alvo -match '^[a-z]+://' -or
                $alvo.StartsWith('mailto:')) { continue }
            $semAncora = ($alvo -split '#', 2)[0]
            if (-not $semAncora) { continue }
            $resolvido = Join-Path (Split-Path -Parent $absoluto) $semAncora
            if (-not (Test-Path -LiteralPath $resolvido)) {
                throw "Link local quebrado em $relativo`: $alvo"
            }
        }
    }
}

function Test-SintaxePowerShell {
    param([Parameter(Mandatory)][string[]]$Arquivos)
    foreach ($relativo in @($Arquivos | Where-Object { $_ -match '\.ps(m1|1)$' })) {
        $absoluto = Join-Path $script:Raiz $relativo
        if (-not (Test-Path -LiteralPath $absoluto -PathType Leaf)) { continue }
        $tokens = $null
        $erros = $null
        [Management.Automation.Language.Parser]::ParseFile($absoluto, [ref]$tokens, [ref]$erros) | Out-Null
        if ($erros.Count -gt 0) {
            throw "Sintaxe PowerShell invalida em $relativo`: $($erros[0].Message)"
        }
    }
}

function Invoke-TesteDeclarado {
    param([Parameter(Mandatory)][string]$Relativo)
    $normalizado = $Relativo.Replace('\', '/').TrimStart('./')
    if ($normalizado -notlike 'tests/*') {
        throw "Teste fora da pasta tests/: $Relativo"
    }
    $absoluto = Join-Path $script:Raiz $normalizado
    if (-not (Test-Path -LiteralPath $absoluto -PathType Leaf)) {
        throw "Teste nao encontrado: $normalizado"
    }
    if ($normalizado -match '\.Tests\.ps1$') {
        $resultado = Invoke-Pester -Path $absoluto -Quiet -PassThru
        if ($resultado.FailedCount -gt 0) { throw "$($resultado.FailedCount) teste(s) falharam em $normalizado" }
        return "$normalizado ($($resultado.PassedCount) passaram)"
    }
    if ($normalizado -match '\.js$') {
        & node $absoluto
        if ($LASTEXITCODE -ne 0) { throw "Teste Node falhou: $normalizado" }
        return $normalizado
    }
    if ($normalizado -match '\.py$') {
        $python = Join-Path $script:Raiz 'venv\Scripts\python.exe'
        if (-not (Test-Path -LiteralPath $python)) { throw 'O venv do projeto nao existe nesta worktree.' }
        & $python -m pytest -n 0 $absoluto
        if ($LASTEXITCODE -ne 0) { throw "Pytest falhou: $normalizado" }
        return $normalizado
    }
    throw "Tipo de teste nao suportado: $normalizado"
}

function Invoke-Validacao {
    param([string]$EscopoSolicitado)

    Assert-Repositorio
    $branch = Get-BranchAtual
    if (-not $branch -or $branch -eq 'main') {
        throw 'Verificar/publicar diretamente na main e proibido. Use uma worktree isolada.'
    }
    $principal = Get-CheckoutPrincipal
    if ([IO.Path]::GetFullPath($principal).TrimEnd('\') -eq [IO.Path]::GetFullPath($script:Raiz).TrimEnd('\')) {
        throw 'Esta e a worktree principal. Crie uma entrega isolada antes de continuar.'
    }

    $divergencia = Get-DivergenciaOriginMain
    if ($divergencia.Atras -gt 0) {
        throw "A branch esta $($divergencia.Atras) commit(s) atras de origin/main. Integre o avanco e valide novamente."
    }

    $arquivos = @(Get-ArquivosDaEntrega)
    if ($arquivos.Count -eq 0 -and $divergencia.Adiante -eq 0) {
        throw 'Nao ha mudanca nem commit para entregar.'
    }
    $detectado = Get-EscopoEntrega -Caminhos $arquivos
    if ($detectado -in @('Vazio', 'Misto', 'Desconhecido', 'Banco')) {
        throw "Escopo detectado '$detectado'. Separe a entrega; SQL e banco remoto nunca entram neste comando."
    }
    if ($detectado -eq 'NewProd') {
        throw 'Arquivos do motor/agente exigem o fluxo separado publicar_agente.ps1.'
    }
    $efetivo = if ($EscopoSolicitado -eq 'Auto') { $detectado } else { $EscopoSolicitado }
    if ($efetivo -eq 'NewProd') {
        throw 'O entrega-segura.ps1 nao distribui NewProd. Use publicar_agente.ps1.'
    }
    if ($detectado -ne $efetivo) {
        throw "Escopo declarado '$efetivo' difere do escopo detectado '$detectado'."
    }

    $fora = @($arquivos | Where-Object { -not (Test-CaminhoNoEscopo -Caminho $_ -Escopo $efetivo) })
    if ($fora.Count -gt 0) { throw "Arquivo(s) fora do escopo $efetivo`: $($fora -join ', ')" }

    foreach ($arquivo in $arquivos) {
        if (Test-ArquivoDeRascunho $arquivo) { throw "Rascunho bloqueado: $arquivo" }
        if (Test-ArtefatoDeBuildEntrega $arquivo) { throw "Artefato de build bloqueado: $arquivo" }
        $absoluto = Join-Path $script:Raiz $arquivo
        if (-not (Test-Path -LiteralPath $absoluto -PathType Leaf)) { continue }
        if ((Get-Item -LiteralPath $absoluto).Length -gt 3MB) { continue }
        $conteudo = Get-Content -Raw -Encoding UTF8 -LiteralPath $absoluto -ErrorAction SilentlyContinue
        if ($null -eq $conteudo) { continue }
        $segredo = Find-SegredoNoTexto $conteudo
        if ($segredo) { throw "Possivel segredo em '$arquivo': $segredo" }
    }

    $diffCheck = @()
    $diffCheck += @(Invoke-Git @('diff', '--check'))
    $diffCheck += @(Invoke-Git @('diff', '--check', 'origin/main...HEAD'))
    if ($diffCheck.Count -gt 0) { throw "git diff --check encontrou problema: $($diffCheck -join '; ')" }
    foreach ($arquivo in @($arquivos | Where-Object { $_ -in @(Invoke-Git @('ls-files', '--others', '--exclude-standard')) })) {
        $absoluto = Join-Path $script:Raiz $arquivo
        if ((Get-Content -LiteralPath $absoluto | Where-Object { $_ -match '[ \t]+$' }).Count -gt 0) {
            throw "Whitespace no fim de linha em arquivo novo: $arquivo"
        }
    }

    Test-SintaxePowerShell -Arquivos $arquivos
    Test-LinksMarkdown -Arquivos $arquivos

    $testesExecutados = @()
    foreach ($js in @($arquivos | Where-Object { $_ -match '\.js$' })) {
        $absoluto = Join-Path $script:Raiz $js
        if (-not (Test-Path -LiteralPath $absoluto -PathType Leaf)) { continue }
        & node --check $absoluto
        if ($LASTEXITCODE -ne 0) { throw "Sintaxe JavaScript invalida: $js" }
        $testesExecutados += "node --check $js"
    }

    $automaticos = @($arquivos | Where-Object { $_ -match '^tests/.+_harness\.js$' -or $_ -match '^tests/.+\.Tests\.ps1$' })
    if ($arquivos -contains 'entrega-segura.ps1' -or $arquivos -contains 'ferramentas/EntregaSegura.psm1') {
        if (Test-Path -LiteralPath (Join-Path $script:Raiz 'tests\EntregaSegura.Tests.ps1')) {
            $automaticos += 'tests/EntregaSegura.Tests.ps1'
        }
    }
    foreach ($testeAtual in @($automaticos + $Teste | Sort-Object -Unique)) {
        $testesExecutados += Invoke-TesteDeclarado $testeAtual
    }

    if ($efetivo -eq 'EdgeFunctions') {
        if (-not (Get-Command deno -ErrorAction SilentlyContinue)) { throw 'Deno nao esta instalado; Edge Functions nao foram validadas.' }
        Push-Location (Join-Path $script:Raiz 'supabase\functions')
        try {
            & deno test --allow-env --allow-read --quiet
            if ($LASTEXITCODE -ne 0) { throw 'Os testes Deno falharam.' }
            $testesExecutados += 'deno test --allow-env --allow-read --quiet'
        } finally { Pop-Location }
    }

    $assets = @(Get-AssetsVersionaveis -Caminhos $arquivos)
    Write-Titulo 'PREVIA DA ENTREGA'
    Write-Host "  Branch : $branch"
    Write-Host "  Escopo : $efetivo"
    Write-Host "  Base   : origin/main ($($divergencia.Adiante) commit(s) adiante)"
    Write-Host '  Arquivos:'
    $arquivos | ForEach-Object { Write-Host "    $_" }
    Write-Host '  Testes:'
    if ($testesExecutados.Count -eq 0) { Write-Host '    revisao documental/diff; nenhum executor adicional' }
    else { $testesExecutados | ForEach-Object { Write-Host "    $_" } }

    return [pscustomobject]@{
        Branch = $branch
        Escopo = $efetivo
        Arquivos = $arquivos
        Assets = $assets
        Testes = $testesExecutados
        Adiante = $divergencia.Adiante
    }
}

function Invoke-Preparar {
    if (-not $Nome) { throw 'Informe -Nome para preparar a entrega.' }
    Assert-Repositorio
    $slug = ConvertTo-NomeEntrega $Nome
    Write-Titulo 'PREPARANDO ENTREGA ISOLADA'
    Invoke-Git @('fetch', 'origin', '--prune') | ForEach-Object { Write-Host "  $_" }
    Invoke-Git @('rev-parse', '--verify', 'origin/main') | Out-Null

    $principal = Get-CheckoutPrincipal
    $pai = Split-Path -Parent $principal
    $base = Split-Path -Leaf $principal
    $destino = Join-Path $pai "$base-$slug"
    $branch = "fix/$slug"
    if (Test-Path -LiteralPath $destino) { throw "O caminho ja existe: $destino" }
    $existe = @(Invoke-Git @('branch', '--list', $branch))
    if ($existe.Count -gt 0) { throw "A branch ja existe: $branch" }

    $preferenciaAnterior = $ErrorActionPreference
    $arquivoErro = [IO.Path]::GetTempFileName()
    try {
        $ErrorActionPreference = 'Continue'
        $saida = @(& git -C $principal worktree add -b $branch $destino origin/main 2> $arquivoErro)
        $codigo = $LASTEXITCODE
        $errosNativos = @([IO.File]::ReadAllLines($arquivoErro))
    } finally {
        $ErrorActionPreference = $preferenciaAnterior
        Remove-Item -LiteralPath $arquivoErro -Force -ErrorAction SilentlyContinue
    }
    if ($codigo -ne 0) {
        throw "Nao foi possivel criar a worktree: $(@($saida + $errosNativos) -join [Environment]::NewLine)"
    }
    $baseCommit = ([string](& git -C $destino rev-parse HEAD)).Trim()
    Write-Host "  Worktree: $destino" -ForegroundColor Green
    Write-Host "  Branch:   $branch"
    Write-Host "  Base:     origin/main @ $baseCommit"
    Write-Host '  Nada foi publicado.'
    Write-Host 'ESTADO: PREPARADA' -ForegroundColor Green
}

function Get-RepositorioGitHub {
    $url = ([string](Invoke-Git @('remote', 'get-url', 'origin') | Select-Object -Last 1)).Trim()
    if ($url -match 'github\.com[/:](?<repo>[^/]+/[^/]+?)(?:\.git)?$') { return $Matches['repo'] }
    throw "Remote origin nao e um repositorio GitHub reconhecido: $url"
}

function Invoke-DeployEdge {
    param([Parameter(Mandatory)][string[]]$Arquivos)
    $refEsperado = ''
    $config = Get-Content -Raw -Encoding UTF8 (Join-Path $script:Raiz 'security_config.py')
    if ($config -match 'https://([a-z0-9]+)\.supabase\.co') { $refEsperado = $Matches[1] }
    $arquivoRef = Join-Path $script:Raiz 'supabase\.temp\project-ref'
    $refLigado = if (Test-Path -LiteralPath $arquivoRef) { Get-Content -Raw -Encoding UTF8 $arquivoRef } else { '' }
    $problema = Find-ProjetoSupabaseErrado -RefEsperado $refEsperado -RefLigado $refLigado
    if ($problema) { throw $problema }

    $funcoes = @()
    if (@($Arquivos | Where-Object { $_ -like 'supabase/functions/_*' }).Count -gt 0) {
        $funcoes = @(Get-FuncoesEdgeDoRepo -Raiz $script:Raiz)
    } else {
        $funcoes = @($Arquivos | Where-Object { $_ -like 'supabase/functions/*' } |
            ForEach-Object { ($_ -split '/')[2] } | Where-Object { $_ -and -not $_.StartsWith('_') } |
            Sort-Object -Unique)
    }
    if ($funcoes.Count -eq 0) { throw 'Nenhuma Edge Function publicavel foi identificada.' }
    foreach ($funcao in $funcoes) {
        Write-Host "  Publicando Edge Function: $funcao"
        & npx supabase functions deploy $funcao --project-ref $refEsperado --use-api
        if ($LASTEXITCODE -ne 0) { throw "A Edge Function '$funcao' nao foi publicada." }
        $script:EfeitoRemotoIniciado = $true
    }
}

function Wait-CloudflarePages {
    param([Parameter(Mandatory)][string]$Commit)
    $repo = Get-RepositorioGitHub
    $headers = @{ Accept = 'application/vnd.github+json'; 'User-Agent' = 'entrega-segura' }
    $limite = (Get-Date).AddSeconds($TimeoutHospedagemSegundos)
    do {
        $resposta = Invoke-RestMethod -Headers $headers -Uri "https://api.github.com/repos/$repo/commits/$Commit/check-runs"
        $check = @($resposta.check_runs | Where-Object { $_.name -eq 'Cloudflare Pages' } |
            Sort-Object started_at -Descending | Select-Object -First 1)
        if ($check.Count -gt 0) {
            if ($check[0].status -eq 'completed' -and $check[0].conclusion -eq 'success') { return $check[0].details_url }
            if ($check[0].status -eq 'completed') { throw "Cloudflare Pages terminou como $($check[0].conclusion)." }
        }
        Start-Sleep -Seconds 10
    } while ((Get-Date) -lt $limite)
    throw "Cloudflare Pages nao confirmou sucesso em $TimeoutHospedagemSegundos segundos."
}

function Get-HashBytes {
    param([Parameter(Mandatory)][byte[]]$Bytes)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return -join ($sha.ComputeHash($Bytes) | ForEach-Object { $_.ToString('x2') }) }
    finally { $sha.Dispose() }
}

function Test-ArquivosPublicos {
    param(
        [Parameter(Mandatory)][string[]]$Arquivos,
        [int]$Versao
    )
    $alvos = @(Get-AlvosPublicosEntrega -Caminhos $Arquivos -Versao $Versao)
    if ($alvos.Count -eq 0) { return @() }
    $http = [Net.Http.HttpClient]::new()
    $http.DefaultRequestHeaders.UserAgent.ParseAdd('Mozilla/5.0 entrega-segura')
    try {
        $resultados = @()
        foreach ($alvo in $alvos) {
            $separador = if ($alvo.Publico.Contains('?')) { '&' } else { '?' }
            $url = $Dominio.TrimEnd('/') + $alvo.Publico + $separador + '_entrega=' +
                [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            $bytesPublicos = $http.GetByteArrayAsync($url).GetAwaiter().GetResult()
            $bytesLocais = [IO.File]::ReadAllBytes((Join-Path $script:Raiz $alvo.Local))
            if ($alvo.Local -match '\.(html|js|css|json|txt|svg)$') {
                $local = Get-HashTextoNormalizado ([Text.Encoding]::UTF8.GetString($bytesLocais))
                $publico = Get-HashTextoNormalizado ([Text.Encoding]::UTF8.GetString($bytesPublicos))
            } else {
                $local = Get-HashBytes $bytesLocais
                $publico = Get-HashBytes $bytesPublicos
            }
            if ($local -ne $publico) { throw "Hash publico difere do local: $($alvo.Local) ($url)" }
            $resultados += [pscustomobject]@{ Arquivo = $alvo.Local; Url = $url; Sha256 = $local }
            Write-Host "  CONFERE: $($alvo.Local)  $local" -ForegroundColor Green
        }
        return $resultados
    } finally { $http.Dispose() }
}

function Invoke-Publicar {
    if (-not $Mensagem) { throw 'Informe -Mensagem para publicar.' }
    Write-Titulo 'SINCRONIZANDO ANTES DA PUBLICACAO'
    Invoke-Git @('fetch', 'origin', '--prune') | ForEach-Object { Write-Host "  $_" }
    $plano = Invoke-Validacao $Escopo
    $versao = 0
    $bumpados = @()

    if ($plano.Escopo -eq 'Frontend') {
        $html = @(Get-ChildItem (Join-Path $script:Raiz 'frontend') -Filter '*.html' -File |
            ForEach-Object { [IO.File]::ReadAllText($_.FullName) })
        $tags = @(Invoke-Git @('tag', '--list', 'v*'))
        $versao = Get-ProximaVersaoEntrega -Tags $tags -ConteudosHtml $html
        $remota = @(Invoke-Git -Argumentos @('ls-remote', '--tags', 'origin', "refs/tags/v$versao") -PermitirFalha)
        if ($remota.Count -gt 0) { throw "A tag v$versao ja existe no remoto." }
        $bumpados = @(Update-ReferenciasDeAssets -Raiz $script:Raiz -Assets $plano.Assets `
            -Versao $versao -Simular)
        if ($bumpados.Count -gt 0) {
            Write-Host "  Cache planejado em v$versao`: $($bumpados -join ', ')"
        }
    }

    Write-Titulo 'CONFIRMACAO FINAL'
    Write-Host "  Mensagem  : $Mensagem"
    Write-Host "  Escopo    : $($plano.Escopo)"
    Write-Host "  Integracao: $Integracao"
    if ($versao -gt 0) { Write-Host "  Versao    : v$versao" }
    Write-Host "  Destino   : origin/main e $Dominio"

    if ($Simular) {
        Write-Host '  Simulacao encerrada antes de commit, push ou deploy.' -ForegroundColor Yellow
        Write-Host 'ESTADO: VALIDADA' -ForegroundColor Green
        return 0
    }
    if (-not $Sim) {
        $resposta = Read-Host 'Publicar? (s/n)'
        if ($resposta -notmatch '^[sS]') {
            Write-Host 'Cancelado. Nada foi publicado.'
            Write-Host 'ESTADO: VALIDADA' -ForegroundColor Yellow
            return 0
        }
    } else {
        Write-Host '  Publicar? (s/n) s  [confirmado por -Sim]'
    }

    if ($plano.Escopo -eq 'Frontend' -and $bumpados.Count -gt 0) {
        Update-ReferenciasDeAssets -Raiz $script:Raiz -Assets $plano.Assets -Versao $versao |
            Out-Null
        Write-Host "  Cache preparado em v$versao. Revalidando a entrega..."
        $plano = Invoke-Validacao $Escopo
    }

    $arquivos = @(Get-ArquivosDaEntrega)
    $trabalhoPendente = @(Invoke-Git @('status', '--porcelain'))
    if ($trabalhoPendente.Count -gt 0) {
        Invoke-Git (@('add', '--') + $arquivos) | Out-Null
        $staged = @(Invoke-Git @('diff', '--cached', '--name-only'))
        $inesperados = @($staged | Where-Object { $_.Replace('\', '/') -notin $arquivos })
        if ($inesperados.Count -gt 0) { throw "Arquivo staged fora da entrega: $($inesperados -join ', ')" }
        $mensagemCommit = if ($versao -gt 0) { "$Mensagem (v$versao)" } else { $Mensagem }
        Invoke-Git @('commit', '-m', $mensagemCommit) | ForEach-Object { Write-Host "  $_" }
    }

    if ($plano.Escopo -eq 'EdgeFunctions') { Invoke-DeployEdge -Arquivos $arquivos }

    $branch = Get-BranchAtual
    Invoke-Git @('push', '-u', 'origin', $branch) | ForEach-Object { Write-Host "  $_" }
    $script:BranchEnviada = $true

    if ($Integracao -eq 'PR') {
        if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
            $repo = Get-RepositorioGitHub
            $url = "https://github.com/$repo/pull/new/$([Uri]::EscapeDataString($branch))"
            Write-Host "  Branch enviada. Abra e integre o PR: $url" -ForegroundColor Yellow
            Write-Host 'ESTADO: AGUARDANDO_INTEGRACAO' -ForegroundColor Yellow
            return 2
        }
        $urlPr = [string](& gh pr view $branch --json url --jq .url 2>$null)
        if ($LASTEXITCODE -ne 0 -or -not $urlPr.Trim()) {
            $urlPr = [string](& gh pr create --base main --head $branch --title $Mensagem `
                --body 'Entrega preparada e validada por entrega-segura.ps1.')
            if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel criar o pull request.' }
        }
        & gh pr merge $urlPr.Trim() --merge
        if ($LASTEXITCODE -ne 0) { throw "Nao foi possivel integrar o PR: $($urlPr.Trim())" }
    } else {
        Invoke-Git @('fetch', 'origin', '--prune') | Out-Null
        $divergencia = Get-DivergenciaOriginMain
        if ($divergencia.Atras -gt 0) { throw 'origin/main avancou antes da integracao direta; nada foi empurrado para main.' }
        $ancestral = @(Invoke-Git -Argumentos @('merge-base', '--is-ancestor', 'origin/main', 'HEAD') -PermitirFalha)
        if ($LASTEXITCODE -ne 0) { throw 'A integracao direta nao seria fast-forward.' }
        Invoke-Git @('push', 'origin', 'HEAD:main') | ForEach-Object { Write-Host "  $_" }
    }

    Invoke-Git @('fetch', 'origin', '--prune') | Out-Null
    $head = ([string](Invoke-Git @('rev-parse', 'HEAD') | Select-Object -Last 1)).Trim()
    Invoke-Git @('merge-base', '--is-ancestor', $head, 'origin/main') | Out-Null
    if ($Integracao -eq 'Direta') {
        # Um novo commit pode entrar em main logo depois do nosso push. A tag
        # desta entrega continua pertencendo ao nosso HEAD, nao ao sucessor.
        $integrado = $head
    } else {
        # Em PR com merge commit, acha o primeiro descendente de HEAD no caminho
        # ate main. Assim um avanco posterior nao rouba a tag da entrega.
        $caminho = @(Invoke-Git @('rev-list', '--ancestry-path', '--reverse', "$head..origin/main"))
        $integrado = if ($caminho.Count -gt 0) { ([string]$caminho[0]).Trim() } else { $head }
    }
    $script:IntegracaoConcluida = $true
    $script:EfeitoRemotoIniciado = $true

    if ($versao -gt 0) {
        $tagRemota = @(Invoke-Git @('ls-remote', '--tags', 'origin', "refs/tags/v$versao"))
        if ($tagRemota.Count -gt 0) { throw "A tag v$versao passou a existir durante a publicacao." }
        Invoke-Git @('tag', '-a', "v$versao", $integrado, '-m', $Mensagem) | Out-Null
        Invoke-Git @('push', 'origin', "v$versao") | ForEach-Object { Write-Host "  $_" }
    }

    if ($plano.Escopo -eq 'Frontend') {
        Write-Titulo 'AGUARDANDO CLOUDFLARE PAGES'
        $detalhes = Wait-CloudflarePages -Commit $integrado
        Write-Host "  Cloudflare Pages: sucesso ($detalhes)" -ForegroundColor Green
        Write-Titulo 'COMPARANDO ARQUIVOS PUBLICOS'
        Test-ArquivosPublicos -Arquivos $arquivos -Versao $versao | Out-Null
    }

    Write-Host ''
    Write-Host "  Commit integrado: $integrado" -ForegroundColor Green
    if ($versao -gt 0) { Write-Host "  Tag: v$versao" -ForegroundColor Green }
    Write-Host '  Frontend publicado nao comprova NewProd nem impressao fisica.'
    Write-Host 'ESTADO: PUBLICADA_E_VERIFICADA' -ForegroundColor Green
    return 0
}

try {
    Set-Location $script:Raiz
    switch ($Acao) {
        'preparar' { Invoke-Preparar; exit 0 }
        'verificar' {
            Invoke-Validacao $Escopo | Out-Null
            Write-Host 'ESTADO: VALIDADA' -ForegroundColor Green
            exit 0
        }
        'publicar' { $codigo = Invoke-Publicar; exit $codigo }
    }
} catch {
    Write-Host ''
    Write-Host "  ERRO: $($_.Exception.Message)" -ForegroundColor Red
    if ($Detalhar) { Write-Host "  $($_.ScriptStackTrace)" -ForegroundColor DarkGray }
    if ($script:EfeitoRemotoIniciado -or $script:IntegracaoConcluida) {
        Write-Host '  Pode haver efeito remoto. Nao repita no escuro; confira GitHub, hospedagem e o resumo acima.' -ForegroundColor Yellow
        Write-Host 'ESTADO: FALHA_APOS_INTEGRACAO' -ForegroundColor Red
    } elseif ($script:BranchEnviada) {
        Write-Host '  A branch foi enviada, mas main nao foi confirmada como integrada.' -ForegroundColor Yellow
        Write-Host 'ESTADO: AGUARDANDO_INTEGRACAO' -ForegroundColor Yellow
    } else {
        Write-Host '  Nenhum efeito remoto foi iniciado. Pode existir commit local; confira git status e git log.' -ForegroundColor Gray
        Write-Host 'ESTADO: FALHA_ANTES_DA_PUBLICACAO' -ForegroundColor Red
    }
    exit 1
}
