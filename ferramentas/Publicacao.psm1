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
#
# CUIDADO AO DOCUMENTAR: a comparacao e por substring, entao escrever o texto
# da marca em QUALQUER arquivo isenta aquele arquivo inteiro da checagem. Ao
# explicar a regra em documentacao, cite esta constante pelo nome
# (MarcaSegredoFalso) em vez de reproduzir o valor — foi assim que o
# CHANGELOG.md quase se isentou sozinho ao descrever o proprio freio.
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

    # Personal Access Token do Supabase, o `sbp_`. Entrou no radar em
    # 16/08/2026, quando a migracao do backend para o Supabase passou a exigir um
    # para publicar Edge Functions.
    #
    # Ele merece freio proprio por duas razoes que a service_role nao tem:
    #
    # 1. NAO EXPIRA. Vale ate alguem revogar a mao. Um vazamento nao se corrige
    #    com o tempo.
    # 2. E DA CONTA, nao do projeto. Alcanca todos os projetos Supabase do dono,
    #    nao so este. E a credencial mais abrangente que este repositorio chega
    #    perto de tocar.
    #
    # Exige os 40 hexadecimais do token de verdade, e nao so o prefixo: assim
    # `sbp_...` e `sbp_seu_token_aqui` continuam podendo aparecer na
    # documentacao que ensina onde colar o token. Vale aqui a mesma regra do
    # resto desta funcao -- um alarme que sempre toca e um alarme que se aprende
    # a ignorar.
    if ($Texto -match 'sbp_[0-9a-f]{40}') {
        return 'Personal Access Token do Supabase (sbp_) — alcanca a conta inteira e nao expira'
    }

    return ''
}

function Find-ProjetoSupabaseErrado {
    <#
    .SYNOPSIS
        Devolve a descricao do problema, ou string vazia se o projeto ligado
        for o certo.
    .DESCRIPTION
        Existe por causa de uma armadilha de NOME, confirmada em 16/08/2026.

        A conta do usuario tem tres projetos Supabase com nomes que parecem os
        certos -- "Ideal Imposicao", "Ideal Control", "Pagina da ARTE" -- e
        NENHUM deles e o desta aplicacao. Sao restos de tentativas antigas, com
        esquemas de outra epoca (catalogo sem o prefixo `imposition_`, acesso sem
        o `producao_acesso_`) e algumas centenas de linhas dentro.

        O projeto que roda a grafica se chama "e-deal", e vive na organizacao do
        parceiro Vibe. Quem escolher pelo nome no painel acerta o nome e erra o
        projeto.

        O estrago disso e do tipo silencioso: uma Edge Function de controle de
        acesso publicada no projeto errado sobe sem erro nenhum, responde
        bonito, e simplesmente nao enxerga credencial alguma -- a portaria
        recusa ingresso bom, e a investigacao comeca pelo lugar errado.

        Por isso a conferencia e contra o `security_config.py`, que e versionado
        e e a mesma fonte que o agente compila dentro do executavel. O nome do
        painel nao entra nesta conta.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][AllowEmptyString()][string]$RefEsperado,
        [Parameter(Mandatory)][AllowEmptyString()][string]$RefLigado
    )

    $esperado = ($RefEsperado -replace '\s', '').ToLower()
    $ligado   = ($RefLigado   -replace '\s', '').ToLower()

    # Nao saber o que conferir e pior que achar diferenca: um freio que perdeu a
    # referencia passaria a aprovar qualquer projeto, calado.
    if ([string]::IsNullOrEmpty($esperado)) {
        return 'nao consegui ler o projeto esperado do security_config.py — o freio ficou sem referencia'
    }
    if ([string]::IsNullOrEmpty($ligado)) {
        return "a CLI nao esta ligada a projeto nenhum. Rode: npx supabase link --project-ref $esperado"
    }
    if ($esperado -ne $ligado) {
        return "a CLI esta ligada a '$ligado', mas o codigo aponta para '$esperado'. " +
               "CUIDADO: ha projetos na conta com nomes parecidos e vazios. " +
               "Rode: npx supabase link --project-ref $esperado"
    }
    return ''
}

function Get-FuncoesEdgeDoRepo {
    <#
    .SYNOPSIS
        Nomes das Edge Functions versionadas neste repositorio.
    .DESCRIPTION
        Uma pasta por funcao, dentro de `supabase/functions/`.

        As pastas que comecam com `_` sao biblioteca compartilhada e NAO sao
        funcoes: `_compartilhado` guarda o hash do QR Ideal e o acesso ao banco,
        e publica-lo como funcao criaria um endpoint publico que ninguem quis
        criar -- expondo pela rede o que so deveria ser chamado de dentro.

        Devolve sempre ARRAY, inclusive com um item so.

        REPARE NA VIRGULA do `return ,@(...)`, e nao a apague: o `@()` sozinho
        NAO basta, porque o PowerShell desembrulha array de um elemento na saida
        da funcao. Com uma funcao so no repositorio -- que e o caso hoje, a
        `portaria` --, quem chamasse receberia a string crua e o `foreach`
        passaria a iterar os CARACTERES do nome, tentando publicar uma funcao
        chamada "p", outra "o", outra "r".

        A virgula cria um array de um elemento cujo unico item e o nosso array,
        e o desembrulho da saida tira essa camada extra em vez da nossa.
    #>
    [CmdletBinding()]
    [OutputType([string[]])]
    param([Parameter(Mandatory)][string]$Raiz)

    $pasta = Join-Path $Raiz "supabase\functions"
    # SEM a virgula aqui, ao contrario do return de baixo: `,@()` produz um
    # array que CONTEM um array vazio, e quem contasse acharia um item onde nao
    # ha nenhum.
    if (-not (Test-Path -PathType Container $pasta)) { return @() }

    return ,@(Get-ChildItem -Path $pasta -Directory |
              Where-Object { -not $_.Name.StartsWith('_') } |
              ForEach-Object { $_.Name })
}

function Select-ArquivosDaLeva {
    <#
    .SYNOPSIS
        Dos arquivos mudados, os que ESTA publicacao leva.

    .DESCRIPTION
        O `publicar.ps1` commita com `git add -A`, e isso e' o certo no caso
        comum: uma pessoa, uma pasta, tudo o que mudou vai junto.

        Neste repositorio, porem, e' rotina haver duas sessoes trabalhando ao
        mesmo tempo. Publicar enquanto a outra esta no meio de uma edicao
        levaria o trabalho pela metade dela ao ar — e nao ha como desfazer isso
        sem tirar do ar tambem o que foi publicado de proposito.

        Com `-Somente`, a leva se restringe aos caminhos declarados. Aceita
        arquivo (`frontend/script.js`) e pasta (`docs/`), com barra de qualquer
        um dos dois lados e sem diferenciar maiuscula: o que chega aqui vem de
        `git status`, que usa barra normal, e o que o operador digita costuma
        vir com a contrabarra do Windows.

        O que fica DE FORA e' devolvido por quem chama, para ser dito em voz
        alta. Recorte silencioso num script de publicacao e' pior que recorte
        nenhum: quem le a saida acha que levou tudo.
    #>
    [CmdletBinding()]
    [OutputType([string[]])]
    param(
        [AllowEmptyCollection()][string[]]$Mudados,
        [AllowEmptyCollection()][string[]]$Somente
    )

    # Sem a virgula unaria de proposito: quem chama ja envolve em @(), e o
    # `,@(...)` somado a isso produz um array DENTRO de um array — os quatro
    # caminhos viravam um elemento so, e o freio de rascunho recebia a lista
    # inteira no lugar de um nome de arquivo.
    if ($null -eq $Mudados) { return @() }
    if ($null -eq $Somente -or $Somente.Count -eq 0) { return @($Mudados) }

    $alvos = @($Somente |
        Where-Object { $_ -ne $null -and $_.Trim() -ne '' } |
        ForEach-Object { (($_ -replace '\\', '/').Trim() -replace '^\./', '').ToLowerInvariant() })

    return @($Mudados | Where-Object {
        $c = (($_ -replace '\\', '/').Trim() -replace '^\./', '').ToLowerInvariant()
        $bate = $false
        foreach ($a in $alvos) {
            if ($c -eq $a) { $bate = $true; break }
            if ($c.StartsWith($a.TrimEnd('/') + '/')) { $bate = $true; break }
        }
        $bate
    })
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

# ─── O segredo que autoriza a estacao a publicar a faixa ─────────────────────
#
# Vive aqui, e nao dentro de um dos scripts de build, porque a raiz do defeito de
# 15/08/2026 nao foi nenhum dos dois scripts isoladamente: foi existirem DOIS,
# cada um com a sua copia, e as duas divergirem sem ninguem notar.
#
#   - publicar_agente.ps1, que compila todo release, nunca gerava o arquivo;
#   - build_agent.ps1 gerava DEPOIS de ja ter chamado o PyInstaller.
#
# O resultado foi um agente que imprime perfeitamente e nao publica credencial
# nenhuma -- sem erro, sem aviso, ate a portaria do evento. O pedido 20508 saiu
# com 143 ingressos que a portaria recusaria.

function New-SegredoDoAgente {
    <#
    .SYNOPSIS
      Gera o acesso_segredo.py que o PyInstaller embute no executavel.

    .DESCRIPTION
      TEM DE RODAR ANTES do PyInstaller. Gerado depois, o arquivo so entra no
      build SEGUINTE -- que foi exatamente o defeito do build_agent.ps1.

      O segredo vai DENTRO do executavel, e nao num arquivo solto ao lado como o
      pool: e curto, e nao ha por que deixa-lo legivel para quem abrir a pasta.
      O git o ignora; ele nunca existe no repositorio.

      Ele NAO e a service_role. So autoriza publicar faixa de codigos.

    .PARAMETER Raiz
      A pasta do projeto: e de la que sai o .env.local e e la que o arquivo e
      escrito, ao lado do agent_tray.py que o PyInstaller varre.
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$Raiz)

    $segredo = $env:ACESSO_AGENTE_SEGREDO
    if (-not $segredo) {
        $envLocal = Join-Path $Raiz ".env.local"
        if (Test-Path $envLocal) {
            $linha = Get-Content $envLocal |
                     Where-Object { $_ -match '^\s*ACESSO_AGENTE_SEGREDO\s*=' } |
                     Select-Object -First 1
            if ($linha) { $segredo = ($linha -split '=', 2)[1].Trim().Trim('"').Trim("'") }
        }
    }
    if (-not $segredo) {
        # `throw`, e nao um aviso: um agente sem segredo imprime normalmente e
        # nao publica nada. Seguir seria produzir exatamente o release que
        # custou o pedido 20508.
        throw ("ACESSO_AGENTE_SEGREDO nao encontrado. Sem ele o agente imprime " +
               "normalmente mas NAO publica a faixa de codigos, e a portaria do " +
               "evento fica sem o que conferir. Ponha a linha no .env.local, com " +
               "o MESMO valor gravado nos segredos do Supabase (a funcao " +
               "`acesso-estacao` confere os dois): ACESSO_AGENTE_SEGREDO=<valor>")
    }

    # A barra invertida primeiro: invertida a ordem, o escape da aspa seria
    # escapado de novo e o .py sairia com erro de sintaxe -- e o agente sairia
    # sem o segredo, em silencio, de novo.
    $escapado = $segredo.Replace('\', '\\').Replace('"', '\"')
    $destino = Join-Path $Raiz "acesso_segredo.py"
    @"
# -*- coding: utf-8 -*-
# GERADO NA COMPILACAO. Nao edite, nao versione.
# O .gitignore cobre este arquivo: ele e o segredo que autoriza a estacao a
# publicar a faixa de codigos do QR Ideal no backend da nuvem.
SEGREDO = "$escapado"
"@ | Out-File -FilePath $destino -Encoding utf8

    return $destino
}

function Test-SegredoNoBuild {
    <#
    .SYNOPSIS
      Confere, DEPOIS de compilar, que o modulo do segredo entrou no executavel.

    .DESCRIPTION
      A trava que nao depende de ninguem lembrar. O PyInstaller escreve os
      modulos que nao achou em build\agent_tray\warn-agent_tray.txt, e a linha

          missing module named acesso_segredo - imported by acesso_publicacao

      esteve la em TODOS os builds ate 15/08/2026 sem que ninguem lesse o
      arquivo. Agora ela para o release.

    .PARAMETER Aviso
      Caminho do warn-agent_tray.txt que o PyInstaller acabou de escrever.
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory = $true)][string]$Aviso)

    if (-not (Test-Path $Aviso)) {
        # Sem o arquivo nao da para afirmar nada, e dizer "esta ok" seria a
        # mesma omissao de antes com outra roupa.
        throw "Nao achei o aviso do PyInstaller em '$Aviso'; nao da para confirmar que o segredo entrou."
    }
    $texto = Get-Content -Raw $Aviso
    if ($texto -match 'missing module named acesso_segredo') {
        throw ("O PyInstaller nao achou o modulo acesso_segredo: o agente sairia " +
               "sem o segredo e NAO publicaria faixa nenhuma. Confira se o " +
               "New-SegredoDoAgente rodou ANTES da compilacao.")
    }
}

Export-ModuleMember -Function Test-ArquivoDeRascunho, ConvertFrom-JwtPayload,
    Find-SegredoNoTexto, Find-ProjetoSupabaseErrado, Get-FuncoesEdgeDoRepo,
    Select-ArquivosDaLeva, Get-ProximaVersao, ConvertTo-TuplaVersao,
    Test-VersaoMaior, Get-TagAnterior, ConvertFrom-VercelLs,
    New-SegredoDoAgente, Test-SegredoNoBuild
