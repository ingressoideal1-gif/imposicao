Import-Module "$PSScriptRoot\..\ferramentas\Publicacao.psm1" -Force

Describe "Test-ArquivoDeRascunho" {
    It "reconhece um scratch como rascunho" {
        Test-ArquivoDeRascunho 'scratch_fix_all.py' | Should Be $true
    }
    It "reconhece temp2.py como rascunho" {
        Test-ArquivoDeRascunho 'temp2.py' | Should Be $true
    }
    It "reconhece test_debug3.js como rascunho" {
        Test-ArquivoDeRascunho 'test_debug3.js' | Should Be $true
    }
    It "NAO confunde um teste de verdade com rascunho" {
        Test-ArquivoDeRascunho 'test_engine_dual_vdp.py' | Should Be $false
    }
    It "NAO confunde teste_dados.csv com o padrao test<N>." {
        Test-ArquivoDeRascunho 'teste_dados.csv' | Should Be $false
    }
    It "NAO confunde Diagnostico_Fontes.ps1 com o padrao diag_" {
        Test-ArquivoDeRascunho 'Diagnostico_Fontes.ps1' | Should Be $false
    }
    It "deixa passar codigo de producao" {
        Test-ArquivoDeRascunho 'engine.py' | Should Be $false
    }
    It "ignora arquivo fora da raiz — rascunho em subpasta e intencional" {
        Test-ArquivoDeRascunho 'tests/test_impose.py' | Should Be $false
    }
}

Describe "ConvertFrom-JwtPayload" {
    It "decodifica o payload de um JWT bem formado" {
        # {"role":"anon"} em base64url, com cabecalho e assinatura de mentira.
        $jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.assinatura'
        ConvertFrom-JwtPayload $jwt | Should Be '{"role":"anon"}'
    }
    It "devolve nulo para texto que nao e JWT" {
        ConvertFrom-JwtPayload 'nao-e-um-jwt' | Should Be $null
    }
}

Describe "Find-SegredoNoTexto" {
    It "barra um JWT cujo papel e service_role" {
        $jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.assinatura'
        Find-SegredoNoTexto "SUPABASE_SERVICE_KEY=$jwt" | Should Not Be ''
    }
    It "barra service_role em texto claro num JSON de credencial" {
        Find-SegredoNoTexto '{ "role": "service_role", "key": "x" }' | Should Not Be ''
    }
    It "DEIXA PASSAR a chave anonima real do projeto" {
        # Regressao: esta chave e publica por natureza e esta versionada em
        # frontend/supabase-config.js — o navegador precisa dela. Um freio
        # que a barrasse tocaria em toda alteracao daquele arquivo.
        $config = Get-Content -Raw -Encoding UTF8 "$PSScriptRoot\..\frontend\supabase-config.js"
        Find-SegredoNoTexto $config | Should Be ''
    }
    It "DEIXA PASSAR o GUIA_AGENTE.md, que so cita o nome da variavel" {
        $guia = Get-Content -Raw -Encoding UTF8 "$PSScriptRoot\..\GUIA_AGENTE.md"
        Find-SegredoNoTexto $guia | Should Be ''
    }
    It "deixa passar texto comum" {
        Find-SegredoNoTexto 'def imposicao(): pass' | Should Be ''
    }
}

Describe "Get-ProximaVersao" {
    It "le a versao do index e soma um" {
        Get-ProximaVersao '<script src="script.js?v=490"></script>' | Should Be 491
    }
    It "devolve 0 quando nao acha a marca" {
        Get-ProximaVersao '<html></html>' | Should Be 0
    }
    It "le o index.html real do projeto" {
        $html = Get-Content -Raw -Encoding UTF8 "$PSScriptRoot\..\frontend\index.html"
        Get-ProximaVersao $html | Should BeGreaterThan 490
    }
}

Describe "ConvertTo-TuplaVersao" {
    It "extrai os numeros de 'NewProd 1.2.5'" {
        (ConvertTo-TuplaVersao 'NewProd 1.2.5') -join '.' | Should Be '1.2.5'
    }
    It "extrai os numeros de '1.2.5.0'" {
        (ConvertTo-TuplaVersao '1.2.5.0') -join '.' | Should Be '1.2.5.0'
    }
    It "devolve 0 para texto sem numero" {
        (ConvertTo-TuplaVersao 'sem numero') -join '.' | Should Be '0'
    }
}

Describe "Test-VersaoMaior" {
    It "1.2.23 e maior que 1.2.22" {
        Test-VersaoMaior '1.2.23' '1.2.22' | Should Be $true
    }
    It "1.2.22 NAO e maior que 1.2.22" {
        Test-VersaoMaior '1.2.22' '1.2.22' | Should Be $false
    }
    It "1.2.9 NAO e maior que 1.2.22 — comparacao numerica, nao textual" {
        Test-VersaoMaior '1.2.9' '1.2.22' | Should Be $false
    }
    It "1.3.0 e maior que 1.2.99" {
        Test-VersaoMaior '1.3.0' '1.2.99' | Should Be $true
    }
    It "1.2.22.0 NAO e maior que 1.2.22" {
        Test-VersaoMaior '1.2.22.0' '1.2.22' | Should Be $false
    }
}

Describe "ConvertFrom-VercelLs" {
    # FORMA CANALIZADA — a que o voltar.ps1 realmente recebe. Quando a saida
    # nao e um terminal, a Vercel manda a tabela bonita para o console e
    # deixa no stdout so as URLs, uma por linha. Descobrir isto foi o que
    # fez o parser original (que esperava a tabela) devolver lista vazia.
    $canalizada = @"
https://ideal-imposition-lc86wrz4p-ingressoideal1-7062s-projects.vercel.app
https://ideal-imposition-3msyvsuwf-ingressoideal1-7062s-projects.vercel.app
https://ideal-imposition-nyq7ydemq-ingressoideal1-7062s-projects.vercel.app
"@

    # FORMA INTERATIVA — a tabela completa, quando a saida e um terminal.
    $tabela = @"
Vercel CLI 54.10.3 (Node.js 24.16.0)
> Production deployments for ingressoideal1-7062s-projects/ideal-imposition [548ms]

  Age     Project                                            Deployment                                                                      Status      Environment     Duration     Username
  7h      ingressoideal1-7062s-projects/ideal-imposition     https://ideal-imposition-lc86wrz4p-ingressoideal1-7062s-projects.vercel.app     * Ready     Production      6s           ingressoideal1-7062
  8h      ingressoideal1-7062s-projects/ideal-imposition     https://ideal-imposition-nyq7ydemq-ingressoideal1-7062s-projects.vercel.app     * Ready     Production      5s           ingressoideal1-7062
"@

    It "le as tres URLs da forma canalizada" {
        (ConvertFrom-VercelLs $canalizada).Count | Should Be 3
    }
    It "preserva a ordem: o primeiro e o que esta no ar" {
        (ConvertFrom-VercelLs $canalizada)[0].Url |
            Should Be 'https://ideal-imposition-lc86wrz4p-ingressoideal1-7062s-projects.vercel.app'
    }
    It "na forma canalizada nao inventa idade nem status" {
        (ConvertFrom-VercelLs $canalizada)[0].Idade  | Should Be ''
        (ConvertFrom-VercelLs $canalizada)[0].Status | Should Be ''
    }
    It "le as duas URLs da forma interativa" {
        (ConvertFrom-VercelLs $tabela).Count | Should Be 2
    }
    It "na forma interativa extrai idade e status" {
        (ConvertFrom-VercelLs $tabela)[0].Idade  | Should Be '7h'
        (ConvertFrom-VercelLs $tabela)[0].Status | Should Be 'Ready'
    }
    It "ignora o cabecalho e o ruido da CLI" {
        $urls = @(ConvertFrom-VercelLs $tabela | ForEach-Object { $_.Url })
        ($urls | Where-Object { $_ -notlike 'https://*' }).Count | Should Be 0
    }
    It "devolve vazio quando nao ha deploy nenhum" {
        (ConvertFrom-VercelLs 'nenhum deploy aqui').Count | Should Be 0
    }
}

Describe "Get-TagAnterior" {
    $tags = @('v488', 'v489', 'v490', 'v491')
    It "acha a tag imediatamente anterior" {
        Get-TagAnterior $tags 'v491' | Should Be 'v490'
    }
    It "ordena por numero, nao por texto" {
        Get-TagAnterior @('v9', 'v10', 'v11') 'v11' | Should Be 'v10'
    }
    It "devolve vazio quando a referencia e a mais antiga" {
        Get-TagAnterior $tags 'v488' | Should Be ''
    }
    It "devolve vazio quando a referencia nao esta na lista" {
        Get-TagAnterior $tags 'v999' | Should Be ''
    }
}
