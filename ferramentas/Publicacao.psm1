# Funcoes puras de decisao usadas pelos scripts de publicacao.
#
# Puras de proposito: nenhuma toca git, rede ou disco. E o que permite
# exercitar os freios com Pester sem publicar nada.

# ─── Rascunho ────────────────────────────────────────────────────────────────
# Rascunho e o que foi escrito para resolver um problema pontual. O padrao
# vale so para a raiz — um arquivo com nome parecido dentro de tests/ ou
# frontend/ esta onde deveria estar.
$script:PadroesRascunho = @(
    '^scratch_',
    '^temp_',
    '^temp\d*\.',
    '^patch_',
    '^patch\d+\.',
    '^check_',
    '^fix_',
    '^diag_',
    '^diag\d*\.',
    '^test_debug\d*\.js$',
    '^test\d*\.(js|py)$',
    '^test-fetch\.js$',
    '^test_api\d*\.js$',
    '^(test_browser|test_col|test_final|test_pdf)\.js$',
    '^(diff|build_log|mangled|py_out|test_out|scratch_func)\.txt$',
    '^snapshot\.jpg$',
    '^engine_backup\.py$'
)

function Test-ArquivoDeRascunho {
    <#
    .SYNOPSIS
        True quando o caminho e de um rascunho na raiz do repositorio.
    #>
    [CmdletBinding()]
    [OutputType([bool])]
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Caminho)

    if ([string]::IsNullOrWhiteSpace($Caminho)) { return $false }
    # Rascunho dentro de uma subpasta esta onde deveria estar. O git usa
    # barra normal em qualquer plataforma; a invertida cobre entrada manual.
    if ($Caminho -match '[\\/]') { return $false }

    foreach ($padrao in $script:PadroesRascunho) {
        if ($Caminho -match $padrao) { return $true }
    }
    return $false
}

# ─── Segredo ─────────────────────────────────────────────────────────────────
function ConvertFrom-JwtPayload {
    <#
    .SYNOPSIS
        Decodifica o payload (2a parte) de um JWT. Nao valida assinatura.
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Jwt)

    $partes = $Jwt -split '\.'
    if ($partes.Count -lt 2) { return $null }

    # base64url -> base64, e repor o padding que o formato omite.
    $p = $partes[1].Replace('-', '+').Replace('_', '/')
    switch ($p.Length % 4) {
        2 { $p += '==' }
        3 { $p += '=' }
        1 { return $null }   # comprimento impossivel em base64
    }
    try {
        return [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p))
    } catch {
        return $null
    }
}

# Declaracao de que as chaves de um arquivo sao fabricadas. Existe para os
# arquivos que PRECISAM conter uma chave falsa: o proprio teste do freio, e os
# documentos que explicam a regra. Sem isso, o arquivo que testa o detector
# dispara o detector, e a publicacao trava sempre que ele for editado.
#
# E uma porta com placa, nao um buraco: quem a usa esta declarando por escrito
# que a chave e de mentira, e a declaracao aparece no diff da revisao.
$script:MarcaSegredoFalso = 'SEGREDO-DE-MENTIRA'

function Find-SegredoNoTexto {
    <#
    .SYNOPSIS
        Devolve a descricao do segredo encontrado, ou string vazia.
    .DESCRIPTION
        Procura apenas a service_role key, que da controle total do banco.

        NAO barra por nome de variavel nem por "parece um JWT", e isso e
        deliberado: a chave anonima do Supabase tambem e um JWT e esta
        legitimamente versionada em frontend/supabase-config.js — o
        navegador precisa dela, ela e publica por natureza. O GUIA_AGENTE.md,
        por sua vez, cita o nome SUPABASE_SERVICE_KEY como documentacao.
        Barrar qualquer um dos dois faria o alarme tocar em toda publicacao,
        e um alarme que sempre toca e um alarme que se aprende a ignorar.

        Um arquivo que contenha a marca SEGREDO-DE-MENTIRA e dispensado da
        checagem — ver o comentario da constante acima.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Texto)

    if ([string]::IsNullOrEmpty($Texto)) { return '' }
    if ($Texto -match $script:MarcaSegredoFalso) { return '' }

    $jwts = [regex]::Matches($Texto, 'eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+')
    foreach ($m in $jwts) {
        $payload = ConvertFrom-JwtPayload $m.Value
        if ($payload -and $payload -match '"role"\s*:\s*"service_role"') {
            return 'chave service_role do Supabase (JWT) — da controle total do banco'
        }
    }

    # Credencial colada em JSON/YAML sem ser um JWT completo.
    if ($Texto -match '"role"\s*:\s*"service_role"') {
        return 'service_role em texto claro'
    }

    return ''
}

# ─── Versoes e tags ──────────────────────────────────────────────────────────
function Get-ProximaVersao {
    <#
    .SYNOPSIS
        Le o ?v=NNN de script.js no HTML e devolve NNN+1. Zero se nao achar.
    #>
    [CmdletBinding()]
    [OutputType([int])]
    param([Parameter(Mandatory)][AllowEmptyString()][string]$HtmlIndex)

    $m = [regex]::Match($HtmlIndex, 'script\.js\?v=(\d+)')
    if (-not $m.Success) { return 0 }
    return ([int]$m.Groups[1].Value) + 1
}

function ConvertTo-TuplaVersao {
    <#
    .SYNOPSIS
        'NewProd 1.2.5' e '1.2.5.0' viram arrays de inteiros comparaveis.
    .DESCRIPTION
        Espelha agent_version.como_tupla() em Python. Se um dos dois mudar,
        o auto-update do agente passa a discordar do publicador — mantenha
        os dois iguais.
    #>
    [CmdletBinding()]
    [OutputType([int[]])]
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Texto)

    $nums = @([regex]::Matches($Texto, '\d+') | Select-Object -First 4 |
              ForEach-Object { [int]$_.Value })
    if ($nums.Count -eq 0) { return @(0) }
    return $nums
}

function Test-VersaoMaior {
    <#
    .SYNOPSIS
        True se $Nova for estritamente maior que $Atual.
    #>
    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [Parameter(Mandatory)][string]$Nova,
        [Parameter(Mandatory)][string]$Atual
    )

    $a = ConvertTo-TuplaVersao $Nova
    $b = ConvertTo-TuplaVersao $Atual
    $total = [Math]::Max($a.Count, $b.Count)
    for ($i = 0; $i -lt $total; $i++) {
        $x = 0; if ($i -lt $a.Count) { $x = $a[$i] }
        $y = 0; if ($i -lt $b.Count) { $y = $b[$i] }
        if ($x -gt $y) { return $true }
        if ($x -lt $y) { return $false }
    }
    return $false
}

function Get-TagAnterior {
    <#
    .SYNOPSIS
        Dada a lista de tags vNNN, devolve a anterior a $Referencia.
    .DESCRIPTION
        Ordena por numero e nao por texto: em ordem textual 'v9' vem depois
        de 'v10', o que faria o voltar.ps1 escolher o alvo errado.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][AllowEmptyCollection()][string[]]$Tags,
        [Parameter(Mandatory)][string]$Referencia
    )

    $ordenadas = @($Tags |
        Where-Object { $_ -match '^v\d+$' } |
        Sort-Object { [int]($_.Substring(1)) })

    $i = [array]::IndexOf($ordenadas, $Referencia)
    if ($i -lt 1) { return '' }
    return $ordenadas[$i - 1]
}

# ─── Deploys da Vercel ───────────────────────────────────────────────────────
function ConvertFrom-VercelLs {
    <#
    .SYNOPSIS
        Extrai os deploys da saida do `vercel ls --prod`, mais recente
        primeiro.
    .DESCRIPTION
        Pura de proposito: recebe o texto, nao chama a CLI. E o que permite
        testar o parser contra amostras reais sem tocar a rede.

        Lida com as DUAS formas de saida da CLI, e a distincao importa:

        - Canalizada (o nosso caso): a tabela bonita vai para o console e o
          stdout recebe so as URLs, uma por linha. E o comportamento
          deliberado da Vercel, para que `vercel ls | head -1` devolva uma
          URL utilizavel. Nesta forma nao ha idade nem status.
        - Interativa: a tabela completa, com idade e status por linha.

        Cuidado ao usar o resultado: cada publicacao cria DOIS deploys de
        producao — um pela integracao Git da Vercel (disparada pelo push) e
        outro pelo `vercel --prod` do publicar.ps1. Entao o deploy logo
        abaixo do topo costuma ser o gemeo da MESMA versao, nao a versao
        anterior. Por isso o voltar.ps1 mostra a lista e deixa a escolha com
        quem sabe o que foi publicado.
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Saida)

    $deploys = @()
    foreach ($linha in ($Saida -split "`r?`n")) {
        $mUrl = [regex]::Match($linha, 'https://[A-Za-z0-9._\-]+\.vercel\.app')
        if (-not $mUrl.Success) { continue }

        # Idade e status so existem na forma interativa; ficam vazios na
        # canalizada, e o chamador precisa tratar isso.
        $idade = ''
        $mIdade = [regex]::Match($linha, '^\s*(\d+[smhd])\s')
        if ($mIdade.Success) { $idade = $mIdade.Groups[1].Value }

        $status = ''
        $mStatus = [regex]::Match($linha, 'Ready|Error|Building|Queued|Canceled')
        if ($mStatus.Success) { $status = $mStatus.Value }

        $deploys += [pscustomobject]@{
            Idade  = $idade
            Url    = $mUrl.Value
            Status = $status
        }
    }
    return $deploys
}

Export-ModuleMember -Function Test-ArquivoDeRascunho, ConvertFrom-JwtPayload,
    Find-SegredoNoTexto, Get-ProximaVersao, ConvertTo-TuplaVersao,
    Test-VersaoMaior, Get-TagAnterior, ConvertFrom-VercelLs
