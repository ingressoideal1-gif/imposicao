# Decisoes reutilizaveis do entrega-segura.ps1.
#
# As funcoes deste modulo nao executam git, deploy ou escrita remota. As poucas
# que escrevem recebem uma raiz explicita e cuidam somente de arquivos de cache
# do frontend. Isso permite testar o contrato sem publicar nada.

function ConvertTo-NomeEntrega {
    [CmdletBinding()]
    [OutputType([string])]
    param([Parameter(Mandatory)][string]$Nome)

    $normalizado = $Nome.Trim().ToLowerInvariant()
    $normalizado = $normalizado -replace '[^a-z0-9]+', '-'
    $normalizado = $normalizado.Trim('-')
    if ([string]::IsNullOrWhiteSpace($normalizado)) {
        throw 'O nome da entrega precisa conter letras ou numeros.'
    }
    if ($normalizado.Length -gt 60) {
        throw 'O nome normalizado da entrega nao pode passar de 60 caracteres.'
    }
    return $normalizado
}

function Get-EscopoEntrega {
    [CmdletBinding()]
    [OutputType([string])]
    param([Parameter(Mandatory)][AllowEmptyCollection()][string[]]$Caminhos)

    $tipos = @()
    foreach ($original in @($Caminhos)) {
        $caminho = ([string]$original).Replace('\', '/').TrimStart('./')
        if (-not $caminho) { continue }

        if ($caminho -like 'supabase/functions/*') { $tipos += 'EdgeFunctions'; continue }
        if ($caminho -like 'sql/*' -or $caminho -match '(^|/)(schema|migration|migracao)[^/]*\.(sql|py)$') {
            $tipos += 'Banco'; continue
        }
        if ($caminho -like 'frontend/*') { $tipos += 'Frontend'; continue }
        if ($caminho -match '^(agent_|app\.py$|engine\.py$|db\.py$|print_service\.py$|hotfolder\.py$|balanca\.py$|color_profiles\.py$|newprod_)' -or
            $caminho -match '^(agent_installer\.wxs|agent_tray\.spec|build_agent\.ps1|compilar_(msi|instalador)\.ps1)$') {
            $tipos += 'NewProd'; continue
        }
        if ($caminho -eq 'entrega-segura.ps1' -or $caminho -like 'ferramentas/*.psm1' -or
            $caminho -like 'ferramentas/*.ps1') {
            $tipos += 'Operacional'; continue
        }
        # Testes e documentacao acompanham o codigo principal. So definem o
        # escopo quando nao existe nenhum arquivo de producao na entrega.
        if ($caminho -like 'tests/*') { continue }
        if ($caminho -like 'docs/*' -or $caminho -match '^[^/]+\.md$') {
            $tipos += 'Documentacao'; continue
        }
        $tipos += 'Desconhecido'
    }

    $principais = @($tipos | Where-Object { $_ -ne 'Documentacao' } | Select-Object -Unique)
    if ($principais.Count -eq 0) {
        if (@($tipos | Where-Object { $_ -eq 'Documentacao' }).Count -gt 0 -or $Caminhos.Count -gt 0) {
            return 'Documentacao'
        }
        return 'Vazio'
    }
    if ($principais.Count -gt 1) { return 'Misto' }
    return [string]$principais[0]
}

function Test-CaminhoNoEscopo {
    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [Parameter(Mandatory)][string]$Caminho,
        [Parameter(Mandatory)][string]$Escopo
    )

    $p = $Caminho.Replace('\', '/').TrimStart('./')
    if ($p -like 'tests/*' -or $p -like 'docs/*' -or $p -match '^(CHANGELOG|GUIA_AGENTE)\.md$') {
        return $true
    }
    switch ($Escopo) {
        'Frontend'      { return $p -like 'frontend/*' }
        'EdgeFunctions' { return $p -like 'supabase/functions/*' }
        'Documentacao'  { return $p -like 'docs/*' -or $p -match '^[^/]+\.md$' }
        'Operacional'   {
            return $p -eq 'entrega-segura.ps1' -or $p -like 'ferramentas/*.psm1' -or
                   $p -like 'ferramentas/*.ps1'
        }
        default         { return $false }
    }
}

function Test-ArtefatoDeBuildEntrega {
    [CmdletBinding()]
    [OutputType([bool])]
    param([Parameter(Mandatory)][string]$Caminho)

    $p = $Caminho.Replace('\', '/')
    return $p -match '(^|/)(node_modules|__pycache__|build|dist|coverage|\.pytest_cache)/' -or
           $p -match '\.(exe|msi|pdb|pyc|tmp)$'
}

function Get-ProximaVersaoEntrega {
    [CmdletBinding()]
    [OutputType([int])]
    param(
        [AllowEmptyCollection()][string[]]$Tags = @(),
        [AllowEmptyCollection()][string[]]$ConteudosHtml = @()
    )

    $maior = 0
    foreach ($tag in @($Tags)) {
        if ($tag -match '^v(\d+)$') { $maior = [Math]::Max($maior, [int]$Matches[1]) }
    }
    foreach ($html in @($ConteudosHtml)) {
        foreach ($m in [regex]::Matches([string]$html, '[?&]v=(\d+)')) {
            $maior = [Math]::Max($maior, [int]$m.Groups[1].Value)
        }
    }
    if ($maior -eq [int]::MaxValue) { throw 'A versao publica excedeu o limite numerico.' }
    return $maior + 1
}

function Get-AssetsVersionaveis {
    [CmdletBinding()]
    [OutputType([string[]])]
    param([Parameter(Mandatory)][AllowEmptyCollection()][string[]]$Caminhos)

    return @($Caminhos | ForEach-Object { $_.Replace('\', '/') } |
        Where-Object { $_ -match '^frontend/[^/]+\.(js|css)$' } |
        Sort-Object -Unique)
}

function Update-ReferenciasDeAssets {
    [CmdletBinding()]
    [OutputType([string[]])]
    param(
        [Parameter(Mandatory)][string]$Raiz,
        [Parameter(Mandatory)][AllowEmptyCollection()][string[]]$Assets,
        [Parameter(Mandatory)][int]$Versao,
        [switch]$Simular
    )

    $frontend = Join-Path $Raiz 'frontend'
    $alterados = @()
    $encontrados = @{}
    foreach ($asset in @($Assets)) { $encontrados[[IO.Path]::GetFileName($asset)] = $false }

    foreach ($arquivo in @(Get-ChildItem -LiteralPath $frontend -Filter '*.html' -File)) {
        $texto = [IO.File]::ReadAllText($arquivo.FullName)
        $novo = $texto
        foreach ($asset in @($Assets)) {
            $nome = [IO.Path]::GetFileName($asset)
            $escapado = [regex]::Escape($nome)
            $padraoQualquer = '(?i)(src|href)=["''][^"'']*' + $escapado + '(?:\?[^"'']*)?["'']'
            if ([regex]::IsMatch($texto, $padraoQualquer)) {
                $encontrados[$nome] = $true
                $padraoVersao = '(?i)(?<antes>(src|href)=["''][^"'']*' + $escapado + '\?v=)\d+'
                if (-not [regex]::IsMatch($texto, $padraoVersao)) {
                    throw "O asset '$nome' e carregado por $($arquivo.Name) sem ?v=NNN."
                }
                $novo = [regex]::Replace($novo, $padraoVersao, "`${antes}$Versao")
            }
        }
        if ($novo -ne $texto) {
            $alterados += 'frontend/' + $arquivo.Name
            if (-not $Simular) {
                [IO.File]::WriteAllText($arquivo.FullName, $novo, [Text.UTF8Encoding]::new($false))
            }
        }
    }

    foreach ($nome in @($encontrados.Keys)) {
        if (-not $encontrados[$nome]) {
            # Nem todo modulo e carregado diretamente pelo HTML. Ausencia de
            # referencia nao e erro; nesse caso o arquivo pai versionado e que
            # deve provocar a atualizacao do navegador.
            continue
        }
    }
    return @($alterados | Sort-Object -Unique)
}

function Get-HashTextoNormalizado {
    [CmdletBinding()]
    [OutputType([string])]
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Texto)

    $normalizado = $Texto.TrimStart([char]0xFEFF).Replace("`r`n", "`n").Replace("`r", "`n")
    $bytes = [Text.UTF8Encoding]::new($false).GetBytes($normalizado)
    $sha = [Security.Cryptography.SHA256]::Create()
    try { return -join ($sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') }) }
    finally { $sha.Dispose() }
}

function Get-AlvosPublicosEntrega {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][AllowEmptyCollection()][string[]]$Caminhos,
        [int]$Versao = 0
    )

    $alvos = @()
    foreach ($original in @($Caminhos | Sort-Object -Unique)) {
        $p = $original.Replace('\', '/')
        if ($p -notlike 'frontend/*') { continue }
        $relativo = $p.Substring('frontend/'.Length)
        if ($relativo -eq 'index.html') { $publico = '/' }
        else { $publico = '/' + $relativo }
        if ($Versao -gt 0 -and $p -match '\.(js|css)$') { $publico += "?v=$Versao" }
        $alvos += [pscustomobject]@{ Local = $p; Publico = $publico }
    }
    return $alvos
}

Export-ModuleMember -Function ConvertTo-NomeEntrega, Get-EscopoEntrega,
    Test-CaminhoNoEscopo, Test-ArtefatoDeBuildEntrega, Get-ProximaVersaoEntrega,
    Get-AssetsVersionaveis, Update-ReferenciasDeAssets, Get-HashTextoNormalizado,
    Get-AlvosPublicosEntrega
