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

Describe "Get-FuncoesEdgeDoRepo" {
    It "lista as funcoes que existem no repositorio" {
        $r = Get-FuncoesEdgeDoRepo -Raiz "$PSScriptRoot\.."
        $r -contains 'portaria' | Should Be $true
    }
    It "IGNORA as pastas que comecam com underscore" {
        # `_compartilhado` e biblioteca, nao funcao. Publicar como funcao criaria
        # um endpoint publico que ninguem quis criar -- e ele exporia o que so
        # deveria ser chamado de dentro.
        $r = Get-FuncoesEdgeDoRepo -Raiz "$PSScriptRoot\.."
        $r -contains '_compartilhado' | Should Be $false
    }
    It "devolve vazio quando nao ha pasta de funcoes" {
        $vazio = Join-Path $env:TEMP "sem-funcoes-$(Get-Random)"
        New-Item -ItemType Directory -Force $vazio | Out-Null
        try {
            @(Get-FuncoesEdgeDoRepo -Raiz $vazio).Count | Should Be 0
        } finally {
            Remove-Item -Recurse -Force $vazio
        }
    }
    It "devolve ARRAY mesmo com uma funcao so" {
        # Sem o @() o PowerShell devolve a string crua quando ha um item, e o
        # `foreach` do publicar.ps1 passaria a iterar os CARACTERES do nome --
        # tentando publicar uma funcao chamada "p", outra "o", outra "r"...
        $r = Get-FuncoesEdgeDoRepo -Raiz "$PSScriptRoot\.."
        $r -is [array] | Should Be $true
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

    It "confere a sintaxe do JavaScript do frontend" {
        # Nasceu de um estrago real: a v765 (28/08/2026) foi ao ar com um `}` a
        # menos no script.js e o painel inteiro parou de carregar. Nenhum freio
        # daqui lia o frontend — os testes exercitam PEDACOS do script, nunca o
        # arquivo todo.
        $textoPub | Should Match 'node --check'
        $textoPub | Should Match 'Conferindo se o painel abre'
    }

    It "o freio do frontend roda antes da confirmacao" {
        $painel = $textoPub.IndexOf('Conferindo se o painel abre')
        $conf   = $textoPub.IndexOf('Publicar? (s/n)')
        $painel | Should Not Be -1
        ($painel -lt $conf) | Should Be $true
    }

    It "o freio do frontend aborta, e nao apenas avisa" {
        # Um freio que so imprime um aviso nao e freio: a publicacao seguiria.
        $i = $textoPub.IndexOf('Conferindo se o painel abre')
        $trecho = $textoPub.Substring($i, 900)
        $trecho | Should Match 'Abortar'
    }
}

Describe "O painel de verdade passa no freio do frontend" {
    # Nao e' teste do script: e' teste do que esta na pasta AGORA. Se alguem
    # quebrar um .js do frontend, este teste acusa antes de a publicacao ser
    # tentada.
    $raiz = Split-Path -Parent $PSScriptRoot

    It "todo .js do frontend tem sintaxe valida" {
        $quebrados = @()
        foreach ($js in (Get-ChildItem "$raiz\frontend" -Filter *.js -File)) {
            & node --check $js.FullName 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) { $quebrados += $js.Name }
        }
        ($quebrados -join ', ') | Should Be ''
    }
}

Describe "Select-ArquivosDaLeva" {
    # Existe porque neste repositorio e' rotina haver duas sessoes trabalhando ao
    # mesmo tempo. Publicar enquanto a outra esta no meio de uma edicao levaria o
    # trabalho pela metade dela ao ar.
    $todos = @(
        'frontend/script.js',
        'frontend/controle.js',
        'docs/aproveitamento_de_folha.md',
        'supabase/functions/acesso-conta/index.ts',
        'tests/aproveitamento_harness.js'
    )

    It "sem -Somente, leva tudo — o caso comum nao muda" {
        (Select-ArquivosDaLeva -Mudados $todos -Somente @()).Count | Should Be 5
        (Select-ArquivosDaLeva -Mudados $todos -Somente $null).Count | Should Be 5
    }

    It "leva so o arquivo declarado" {
        # O @() e' parte do contrato: a funcao devolve pela pipeline, entao um
        # resultado de um item so chega como escalar. Quem chama envolve --
        # inclusive o publicar.ps1. A alternativa (virgula unaria na funcao)
        # aninharia o array quando somada a esse @(), que foi o defeito de
        # 18/08/2026.
        $r = @(Select-ArquivosDaLeva -Mudados $todos -Somente @('frontend/script.js'))
        $r.Count | Should Be 1
        $r[0] | Should Be 'frontend/script.js'
    }

    It "aceita pasta, e nao leva o vizinho de nome parecido" {
        $r = Select-ArquivosDaLeva -Mudados @('docs/a.md', 'docs2/b.md', 'docs/sub/c.md') -Somente @('docs/')
        $r.Count | Should Be 2
        # `Should Contain` do Pester 3 e' sobre CONTEUDO DE ARQUIVO, nao
        # pertinencia em colecao — dai o -contains explicito.
        ($r -contains 'docs/sub/c.md') | Should Be $true
        ($r -contains 'docs2/b.md')    | Should Be $false
    }

    It "a contrabarra do Windows e a barra do git sao a mesma coisa" {
        $r = Select-ArquivosDaLeva -Mudados $todos -Somente @('frontend\script.js', 'TESTS/')
        $r.Count | Should Be 2
        ($r -contains 'tests/aproveitamento_harness.js') | Should Be $true
    }

    It "o que nao foi declarado fica de fora — inclusive o da outra sessao" {
        $r = Select-ArquivosDaLeva -Mudados $todos -Somente @('frontend/script.js', 'docs/')
        ($r -contains 'frontend/controle.js') | Should Be $false
        ($r -contains 'supabase/functions/acesso-conta/index.ts') | Should Be $false
    }

    It "lista vazia de mudados devolve vazio, e nao erro" {
        (Select-ArquivosDaLeva -Mudados @() -Somente @('frontend/script.js')).Count | Should Be 0
        (Select-ArquivosDaLeva -Mudados $null -Somente @('x')).Count | Should Be 0
    }
}

Describe "O -Somente do publicar.ps1" {
    $fonte = Get-Content -Raw -Encoding UTF8 (Join-Path $PSScriptRoot '..\publicar.ps1')

    It "recorta o git add em vez de usar -A" {
        $fonte | Should Match 'git add -- @\(\$paraCommitar\)'
        $fonte | Should Match 'git add -A'          # o caminho comum continua existindo
    }

    It "leva junto as paginas que o bump dos assets mexeu" {
        # Sem isto o commit sairia com o codigo novo e o ?v= velho, e o
        # navegador da estacao continuaria servindo o arquivo do cache.
        $fonte | Should Match '\$bumpados \+='
        $fonte | Should Match '\$Somente \+ \$bumpados'
    }

    It "diz o que ficou de fora, em vez de recortar calado" {
        $fonte | Should Match 'FICAM DE FORA'
    }

    It "nao pula freio nenhum" {
        # O -Somente recorta a leva; quem pula conferencia e' o -SemFreio, e os
        # dois nao podem se confundir.
        $fonte | Should Match 'Conferindo se o motor sobe'
        $fonte | Should Match 'Arquivo de rascunho no commit'
        $fonte | Should Match 'Segredo em '
    }
}

Describe "Select-ArquivosDaLeva devolve lista plana" {
    # O primeiro uso real falhou aqui: a funcao devolvia `,@(...)`, quem chama
    # envolvia em `@(...)`, e o resultado era um array DENTRO de um array. Os
    # quatro caminhos viravam um elemento so -- o freio de rascunho recebeu a
    # lista inteira no lugar de um nome de arquivo e o script morreu.
    It "cada item e uma string, e nao outro array" {
        $r = @(Select-ArquivosDaLeva -Mudados @('a.js', 'b.js') -Somente @('a.js', 'b.js'))
        $r.Count | Should Be 2
        ($r[0] -is [string]) | Should Be $true
        ($r[1] -is [string]) | Should Be $true
    }
    It "continua plana quando quem chama envolve em @()" {
        $r = @(Select-ArquivosDaLeva -Mudados @('a.js', 'b.js') -Somente @())
        $r.Count | Should Be 2
        ($r[0] -is [string]) | Should Be $true
    }
    It "um item so nao vira escalar para quem envolve em @()" {
        $r = @(Select-ArquivosDaLeva -Mudados @('a.js', 'b.js') -Somente @('a.js'))
        $r.Count | Should Be 1
        ($r[0] -is [string]) | Should Be $true
    }
}

Describe "rodar_sql.ps1 manda o SQL em UTF-8" {
    # No Windows PowerShell 5.1, `Invoke-RestMethod -Body <string>` com
    # `application/json` sem charset codifica o texto em Latin-1: todo acento
    # chega ao servidor estropiado, EM SILENCIO -- a API aceita e o SQL roda.
    #
    # Foi assim que a funcao `link_cliente_status` nasceu recusando
    # 'Em Alteração': o literal com cedilha e til virou outra coisa no caminho,
    # e por meses o cliente pedia alteracao da arte sem o status do link mudar.
    $script = Get-Content "$PSScriptRoot\..\ferramentas\rodar_sql.ps1" -Raw

    It "converte o corpo para bytes UTF-8 antes de enviar" {
        ($script -match '\[System\.Text\.Encoding\]::UTF8\.GetBytes\(\$corpo\)') | Should Be $true
    }
    It "envia esses bytes, e nao a string" {
        ($script -match '-Body \$bytes') | Should Be $true
    }
    It "declara o charset no content-type" {
        ($script -match "application/json; charset=utf-8") | Should Be $true
    }
    It "nao manda mais o corpo como string" {
        ($script -match '-Body \$corpo') | Should Be $false
    }
}

Describe "publicar.ps1 sobe as Edge Functions sem Docker" {
    # A CLI do Supabase empacota a funcao dentro de um container antes de
    # subir. Nenhuma maquina da grafica tem Docker instalado, entao a CLI
    # avisava "Docker is not running", devolvia erro, e o `publicar.ps1`
    # abortava a publicacao inteira ANTES do commit -- inclusive quando a
    # mudanca nao tinha nada a ver com Edge Function.
    #
    # O `--use-api` monta o bundle no servidor do Supabase. O resultado
    # publicado e' o mesmo; muda so onde ele e' montado.
    $script = Get-Content "$PSScriptRoot\..\publicar.ps1" -Raw

    It "passa --use-api no deploy" {
        ($script -match 'functions deploy \$f --project-ref \$refEsperado --use-api') | Should Be $true
    }
    It "nao deixa nenhuma chamada de deploy sem --use-api" {
        # So as CHAMADAS -- linha que comeca com o comando. O texto de ajuda
        # do topo do script cita `npx supabase functions deploy` de proposito,
        # e citar nao publica nada.
        $semFlag = [regex]::Matches($script, '(?m)^\s*npx supabase functions deploy[^\r\n]*') |
                   Where-Object { $_.Value -notmatch '--use-api' }
        @($semFlag).Count | Should Be 0
    }
}
