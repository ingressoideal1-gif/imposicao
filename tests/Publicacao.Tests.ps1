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

# SEGREDO-DE-MENTIRA: as chaves deste arquivo sao fabricadas, para exercitar
# o proprio freio. Sem esta declaracao, o arquivo que testa o detector
# dispararia o detector e travaria a publicacao sempre que fosse editado.
Describe "Find-SegredoNoTexto" {
    It "barra um JWT cujo papel e service_role" {
        $jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.assinatura'
        Find-SegredoNoTexto "SUPABASE_SERVICE_KEY=$jwt" | Should Not Be ''
    }
    It "dispensa o arquivo que se declara portador de chave falsa" {
        $jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.assinatura'
        Find-SegredoNoTexto "# SEGREDO-DE-MENTIRA`nCHAVE = '$jwt'" | Should Be ''
    }
    It "NAO dispensa quando a marca esta ausente" {
        $jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.assinatura'
        Find-SegredoNoTexto "CHAVE = '$jwt'" | Should Not Be ''
    }
    It "DEIXA PASSAR os proprios arquivos de teste e projeto deste repositorio" {
        # Regressao do defeito encontrado em 09/08/2026: este arquivo e os
        # documentos de projeto contem chaves falsas e travavam o publicar.
        foreach ($alvo in @(
            "$PSScriptRoot\Publicacao.Tests.ps1",
            "$PSScriptRoot\..\docs\superpowers\plans\2026-08-09-publicacao-segura.md",
            "$PSScriptRoot\..\docs\superpowers\specs\2026-08-09-publicacao-segura-design.md"
        )) {
            $texto = Get-Content -Raw -Encoding UTF8 $alvo
            Find-SegredoNoTexto $texto | Should Be ''
        }
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
    It "barra um Personal Access Token do Supabase" {
        # Montado por pedacos de proposito: escrever o token inteiro num literal
        # deixaria no repositorio uma coisa com cara de credencial de verdade.
        $pat = 'sbp_' + ('0123456789abcdef' * 2) + '01234567'
        Find-SegredoNoTexto "SUPABASE_ACCESS_TOKEN=$pat" | Should Not Be ''
    }
    It "DEIXA PASSAR o marcador de documentacao sbp_..." {
        # O freio exige os 40 hexadecimais do token real. Sem isso, toda linha
        # de documentacao que ensina onde colar o token faria o alarme tocar --
        # e alarme que sempre toca e alarme que se aprende a ignorar.
        Find-SegredoNoTexto 'SUPABASE_ACCESS_TOKEN=sbp_...' | Should Be ''
        Find-SegredoNoTexto 'coloque o seu sbp_seu_token_aqui no .env.local' | Should Be ''
    }
    It "deixa passar texto comum" {
        Find-SegredoNoTexto 'def imposicao(): pass' | Should Be ''
    }
}

Describe "Find-ProjetoSupabaseErrado" {
    # A conta do usuario tem projetos chamados "Ideal Imposicao" e "Ideal
    # Control" que NAO sao os desta aplicacao -- sao restos de tentativas
    # antigas, confirmados por ele em 16/08/2026. O que roda a grafica se chama
    # "e-deal". Quem escolher pelo nome publica no lugar errado, e uma Edge
    # Function de controle de acesso no projeto errado falha em silencio.
    #
    # Por isso o freio compara contra o que o CODIGO diz, que e versionado, e
    # nao contra o nome, que so existe no painel.
    $CERTO   = 'vwbtitjlpelrcnsytzqw'
    $ERRADO  = 'atsxtuibeitloosckmlc'   # o projeto vazio chamado "Ideal Imposicao"

    It "aprova quando o ref ligado e o mesmo que o codigo aponta" {
        Find-ProjetoSupabaseErrado -RefEsperado $CERTO -RefLigado $CERTO | Should Be ''
    }
    It "acusa quando a CLI esta ligada a outro projeto, e diz qual" {
        $r = Find-ProjetoSupabaseErrado -RefEsperado $CERTO -RefLigado $ERRADO
        $r | Should Not Be ''
        $r | Should Match $ERRADO
    }
    It "acusa quando nao ha projeto ligado" {
        Find-ProjetoSupabaseErrado -RefEsperado $CERTO -RefLigado '' | Should Not Be ''
    }
    It "acusa quando nao consegue ler o ref esperado do codigo" {
        # Silencio aqui seria pior que alarme: significaria que o freio parou de
        # saber o que conferir, e passaria a aprovar qualquer coisa.
        Find-ProjetoSupabaseErrado -RefEsperado '' -RefLigado $CERTO | Should Not Be ''
    }
    It "nao se incomoda com espaco em branco nem com caixa" {
        Find-ProjetoSupabaseErrado -RefEsperado $CERTO -RefLigado "  $($CERTO.ToUpper())`r`n" | Should Be ''
    }
    It "o security_config.py deste repositorio continua apontando o projeto certo" {
        # Regressao: se alguem trocar o projeto no codigo sem querer, e aqui que
        # aparece -- antes de virar Edge Function publicada no lugar errado.
        $texto = Get-Content -Raw -Encoding UTF8 "$PSScriptRoot\..\security_config.py"
        $texto | Should Match 'https://vwbtitjlpelrcnsytzqw\.supabase\.co'
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

Describe "Confirmacao do publicar.ps1" {

    # O -Sim existe porque o Read-Host falha em terminal sem teclado, e a unica
    # alternativa seria o -SemFreio -- que pularia TODAS as conferencias para
    # resolver um problema que nao tem nada a ver com elas. Os dois nao podem
    # se confundir.

    $raizPub = Split-Path -Parent $PSScriptRoot
    $textoPub = Get-Content (Join-Path $raizPub "publicar.ps1") -Raw

    It "aceita -Sim como parametro" {
        $textoPub | Should Match '\[switch\]\$Sim'
    }

    It "o -Sim vive DENTRO do bloco que so roda com os freios ligados" {
        # Se ele estivesse fora do 'if (-not $SemFreio)', confirmar passaria a
        # significar tambem pular conferencia.
        $i = $textoPub.IndexOf('if (-not $SemFreio) {')
        $j = $textoPub.IndexOf('if ($Sim) {')
        $i | Should Not Be -1
        $j | Should Not Be -1
        ($j -gt $i) | Should Be $true
    }

    It "sem -Sim continua perguntando" {
        $textoPub | Should Match 'Read-Host\s+"\s*Publicar\? \(s/n\)"'
    }

    It "o -SemFreio continua existindo e separado" {
        $textoPub | Should Match '\[switch\]\$SemFreio'
    }

    It "as conferencias continuam antes da confirmacao" {
        # A ordem importa: confirmar o que nao foi conferido nao vale nada.
        $motor = $textoPub.IndexOf('Conferindo se o motor sobe')
        $conf  = $textoPub.IndexOf('Publicar? (s/n)')
        $motor | Should Not Be -1
        ($motor -lt $conf) | Should Be $true
    }
}
