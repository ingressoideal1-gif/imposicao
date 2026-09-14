Import-Module "$PSScriptRoot\..\ferramentas\EntregaSegura.psm1" -Force

Describe 'Nome e escopo da entrega segura' {
    It 'normaliza um nome para branch e pasta' {
        ConvertTo-NomeEntrega ' Retorno para Arte 21396 ' | Should Be 'retorno-para-arte-21396'
    }

    It 'recusa nome sem letras ou numeros' {
        $mensagem = ''
        try { ConvertTo-NomeEntrega '---' | Out-Null }
        catch { $mensagem = $_.Exception.Message }
        $mensagem | Should Match 'letras ou numeros'
    }

    It 'detecta frontend sem deixar testes e docs criarem escopo misto' {
        Get-EscopoEntrega @('frontend/script.js', 'tests/arte_harness.js', 'docs/arte.md') |
            Should Be 'Frontend'
    }

    It 'detecta mistura de frontend e Edge Functions' {
        Get-EscopoEntrega @('frontend/script.js', 'supabase/functions/painel/index.ts') |
            Should Be 'Misto'
    }

    It 'detecta banco e NewProd como escopos especiais' {
        Get-EscopoEntrega @('sql/migracao.sql') | Should Be 'Banco'
        Get-EscopoEntrega @('engine.py', 'tests/test_engine.py') | Should Be 'NewProd'
    }

    It 'aceita somente caminhos coerentes com o escopo' {
        Test-CaminhoNoEscopo 'frontend/script.js' 'Frontend' | Should Be $true
        Test-CaminhoNoEscopo 'tests/script_harness.js' 'Frontend' | Should Be $true
        Test-CaminhoNoEscopo 'supabase/functions/painel/index.ts' 'Frontend' | Should Be $false
        Test-CaminhoNoEscopo 'entrega-segura.ps1' 'Operacional' | Should Be $true
    }

    It 'barra artefatos de build' {
        Test-ArtefatoDeBuildEntrega 'dist/NewProd.exe' | Should Be $true
        Test-ArtefatoDeBuildEntrega 'frontend/script.js' | Should Be $false
    }
}

Describe 'Versao e cache dos assets' {
    It 'escolhe um numero maior que tags e HTML' {
        Get-ProximaVersaoEntrega -Tags @('v873', 'v875') `
            -ConteudosHtml @('<script src="x.js?v=874"></script>') | Should Be 876
    }

    It 'lista apenas JS e CSS diretamente versionaveis' {
        $r = @(Get-AssetsVersionaveis @(
            'frontend/script.js', 'frontend/style.css', 'frontend/modulos/x.js', 'docs/x.md'
        ))
        $r.Count | Should Be 2
        $r -contains 'frontend/script.js' | Should Be $true
        $r -contains 'frontend/style.css' | Should Be $true
    }

    It 'bumpa so o asset alterado em todas as paginas que o carregam' {
        $raiz = Join-Path $TestDrive 'cache'
        $frontend = Join-Path $raiz 'frontend'
        New-Item -ItemType Directory -Path $frontend | Out-Null
        [IO.File]::WriteAllText((Join-Path $frontend 'index.html'),
            '<script src="script.js?v=874"></script><script src="pedido.js?v=874"></script>',
            [Text.UTF8Encoding]::new($false))
        [IO.File]::WriteAllText((Join-Path $frontend 'producao.html'),
            '<script src="/script.js?v=874"></script>', [Text.UTF8Encoding]::new($false))

        $mudados = @(Update-ReferenciasDeAssets -Raiz $raiz `
            -Assets @('frontend/script.js') -Versao 875)
        $mudados.Count | Should Be 2
        (Get-Content -Raw (Join-Path $frontend 'index.html')) | Should Match 'script\.js\?v=875'
        (Get-Content -Raw (Join-Path $frontend 'index.html')) | Should Match 'pedido\.js\?v=874'
        (Get-Content -Raw (Join-Path $frontend 'producao.html')) | Should Match 'script\.js\?v=875'
        $bytes = [IO.File]::ReadAllBytes((Join-Path $frontend 'index.html'))
        ($bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) | Should Be $false
    }

    It 'recusa asset carregado sem marcador de versao' {
        $raiz = Join-Path $TestDrive 'sem-versao'
        $frontend = Join-Path $raiz 'frontend'
        New-Item -ItemType Directory -Path $frontend | Out-Null
        Set-Content -Path (Join-Path $frontend 'index.html') -Value '<script src="script.js"></script>'
        $mensagem = ''
        try {
            Update-ReferenciasDeAssets -Raiz $raiz -Assets @('frontend/script.js') -Versao 875 |
                Out-Null
        } catch { $mensagem = $_.Exception.Message }
        $mensagem | Should Match 'sem \?v=NNN'
    }

    It 'simula o bump sem modificar o HTML' {
        $raiz = Join-Path $TestDrive 'simular-cache'
        $frontend = Join-Path $raiz 'frontend'
        New-Item -ItemType Directory -Path $frontend | Out-Null
        $pagina = Join-Path $frontend 'index.html'
        [IO.File]::WriteAllText($pagina, '<script src="script.js?v=874"></script>',
            [Text.UTF8Encoding]::new($false))
        $antes = [IO.File]::ReadAllBytes($pagina)
        $mudados = @(Update-ReferenciasDeAssets -Raiz $raiz `
            -Assets @('frontend/script.js') -Versao 875 -Simular)
        $mudados | Should Be @('frontend/index.html')
        [Convert]::ToBase64String([IO.File]::ReadAllBytes($pagina)) |
            Should Be ([Convert]::ToBase64String($antes))
    }
}

Describe 'Prova publica' {
    It 'normaliza BOM e finais de linha antes do hash' {
        Get-HashTextoNormalizado ([char]0xFEFF + "linha1`r`nlinha2`r`n") |
            Should Be (Get-HashTextoNormalizado "linha1`nlinha2`n")
    }

    It 'mapeia index, pagina e asset para URLs publicas' {
        $alvos = @(Get-AlvosPublicosEntrega `
            @('frontend/index.html', 'frontend/producao.html', 'frontend/script.js', 'tests/x.js') 875)
        $alvos.Count | Should Be 3
        ($alvos | Where-Object Local -eq 'frontend/index.html').Publico | Should Be '/'
        ($alvos | Where-Object Local -eq 'frontend/producao.html').Publico | Should Be '/producao.html'
        ($alvos | Where-Object Local -eq 'frontend/script.js').Publico | Should Be '/script.js?v=875'
    }
}

Describe 'Freios do orquestrador' {
    $raiz = Split-Path -Parent $PSScriptRoot
    $script = Get-Content -Raw -Encoding UTF8 (Join-Path $raiz 'entrega-segura.ps1')

    It 'nao usa comandos que descartam o checkout' {
        $script | Should Not Match 'git\s+(stash|reset|clean|checkout\s+--)'
    }

    It 'recusa main e separa NewProd e banco' {
        $script | Should Match "branch -eq 'main'"
        $script | Should Match 'nao distribui NewProd'
        $script | Should Match 'SQL e banco remoto nunca entram neste comando'
    }

    It 'PR sem gh para aguardando integracao em vez de empurrar main' {
        $script | Should Match 'AGUARDANDO_INTEGRACAO'
        $script | Should Match "Integracao -eq 'PR'"
        $script | Should Match "'push', 'origin', 'HEAD:main'"
    }

    It 'comprova Cloudflare e hash depois da integracao' {
        $integracao = $script.IndexOf('$script:IntegracaoConcluida = $true')
        $cloudflare = $script.IndexOf('Wait-CloudflarePages -Commit')
        $hash = $script.IndexOf('Test-ArquivosPublicos -Arquivos')
        $integracao | Should BeGreaterThan -1
        ($cloudflare -gt $integracao) | Should Be $true
        ($hash -gt $cloudflare) | Should Be $true
    }
}

Describe 'Ensaio em repositorio temporario' {
    It 'preparar preserva checkout principal sujo e cria base em origin/main' {
        $fonte = Split-Path -Parent $PSScriptRoot
        $area = Join-Path $TestDrive 'ensaio'
        $principal = Join-Path $area 'ideal-imposition'
        $remoto = Join-Path $area 'origin.git'
        New-Item -ItemType Directory -Path $area | Out-Null
        & git init --bare $remoto | Out-Null
        & git init $principal | Out-Null
        & git -C $principal config user.email 'teste@example.invalid'
        & git -C $principal config user.name 'Teste Entrega Segura'
        New-Item -ItemType Directory -Path (Join-Path $principal 'frontend') | Out-Null
        New-Item -ItemType Directory -Path (Join-Path $principal 'ferramentas') | Out-Null
        Copy-Item (Join-Path $fonte 'entrega-segura.ps1') $principal
        Copy-Item (Join-Path $fonte 'ferramentas\EntregaSegura.psm1') (Join-Path $principal 'ferramentas')
        Copy-Item (Join-Path $fonte 'ferramentas\Publicacao.psm1') (Join-Path $principal 'ferramentas')
        Set-Content (Join-Path $principal 'frontend\placeholder.txt') 'painel'
        Set-Content (Join-Path $principal 'README.md') 'base'
        & git -C $principal add .
        & git -C $principal commit -m 'base' | Out-Null
        & git -C $principal branch -M main
        & git -C $principal remote add origin $remoto
        & git -C $principal push -u origin main | Out-Null
        Set-Content (Join-Path $principal 'mudanca-local.txt') 'nao tocar'

        $comando = Join-Path $principal 'entrega-segura.ps1'
        $saida = @(& powershell -NoProfile -ExecutionPolicy Bypass -File $comando `
            preparar -Nome 'Teste Seguro' 2>&1)
        if ($LASTEXITCODE -ne 0) { Write-Host ($saida -join "`n") }
        $LASTEXITCODE | Should Be 0
        ($saida -join "`n") | Should Match 'ESTADO: PREPARADA'
        Test-Path (Join-Path $principal 'mudanca-local.txt') | Should Be $true
        (& git -C $principal status --porcelain) | Should Match 'mudanca-local.txt'

        $isolada = Join-Path $area 'ideal-imposition-teste-seguro'
        Test-Path $isolada | Should Be $true
        (& git -C $isolada branch --show-current) | Should Be 'fix/teste-seguro'
        (& git -C $isolada rev-parse HEAD) | Should Be (& git -C $principal rev-parse origin/main)

        Set-Content (Join-Path $isolada 'docs.md') 'documentacao local'
        $antes = & git -C $principal rev-parse origin/main
        $simulacao = @(& powershell -NoProfile -ExecutionPolicy Bypass -File `
            (Join-Path $isolada 'entrega-segura.ps1') publicar -Escopo Documentacao `
            -Mensagem 'Documenta teste' -Simular -Detalhar 2>&1)
        if ($LASTEXITCODE -ne 0) { Write-Host ($simulacao -join "`n") }
        $LASTEXITCODE | Should Be 0
        ($simulacao -join "`n") | Should Match 'ESTADO: VALIDADA'
        (& git -C $principal rev-parse origin/main) | Should Be $antes
        (& git -C $isolada status --porcelain) | Should Match 'docs.md'

        $publicacao = @(& powershell -NoProfile -ExecutionPolicy Bypass -File `
            (Join-Path $isolada 'entrega-segura.ps1') publicar -Escopo Documentacao `
            -Mensagem 'Documenta teste' -Integracao Direta -Sim -Detalhar 2>&1)
        if ($LASTEXITCODE -ne 0) { Write-Host ($publicacao -join "`n") }
        $LASTEXITCODE | Should Be 0
        ($publicacao -join "`n") | Should Match 'ESTADO: PUBLICADA_E_VERIFICADA'
        (& git -C $principal rev-parse origin/main) | Should Not Be $antes
        (& git -C $remoto rev-parse main) | Should Be (& git -C $isolada rev-parse HEAD)
        Test-Path (Join-Path $principal 'mudanca-local.txt') | Should Be $true

        $pagina = Join-Path $isolada 'frontend\index.html'
        $javascript = Join-Path $isolada 'frontend\script.js'
        [IO.File]::WriteAllText($pagina, '<script src="script.js?v=10"></script>',
            [Text.UTF8Encoding]::new($false))
        [IO.File]::WriteAllText($javascript, 'console.log("teste");',
            [Text.UTF8Encoding]::new($false))
        $paginaAntes = [Convert]::ToBase64String([IO.File]::ReadAllBytes($pagina))
        $mainAntes = & git -C $remoto rev-parse main
        $frontendSimulado = @(& powershell -NoProfile -ExecutionPolicy Bypass -File `
            (Join-Path $isolada 'entrega-segura.ps1') publicar -Escopo Frontend `
            -Mensagem 'Simula frontend' -Simular -Detalhar 2>&1)
        if ($LASTEXITCODE -ne 0) { Write-Host ($frontendSimulado -join "`n") }
        $LASTEXITCODE | Should Be 0
        ($frontendSimulado -join "`n") | Should Match 'Cache planejado em v11'
        [Convert]::ToBase64String([IO.File]::ReadAllBytes($pagina)) | Should Be $paginaAntes
        (& git -C $remoto rev-parse main) | Should Be $mainAntes
    }
}
