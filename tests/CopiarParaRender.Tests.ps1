#
# A conferencia das tres variaveis do controle de acesso antes de subirem ao
# Render.
#
# O modo de falhar que estes testes previnem ja aconteceu de verdade: a
# SUPABASE_SERVICE_KEY foi copiada do painel do Supabase com um caractere
# sobrando no inicio e um "=" no fim. O Supabase respondeu "401 Invalid API
# key", mas a chave PARECIA certa - decodificada, trazia role: service_role e
# validade em 2035. A investigacao custou meia hora e comecou pela hipotese
# errada (chave rotacionada).
#
# O que torna isso detectavel sem sair da maquina: a assinatura de um JWT
# HMAC-SHA256 tem 32 bytes, que em base64url sem enchimento sao exatamente 43
# caracteres, e o cabecalho comeca sempre por "eyJ". As duas violacoes daquela
# copia eram visiveis dai.
#
# ATENCAO: este arquivo e ASCII puro de proposito. Aspa tipografica vinda de
# mojibake ja quebrou a compilacao de um arquivo inteiro deste projeto, com o
# erro apontando trinta linhas abaixo da causa.
#

$raiz = Split-Path -Parent $PSScriptRoot
$script = Join-Path $raiz "ferramentas\copiar_para_render.ps1"
. $script

# Um JWT de mentira com as proporcoes certas: 43 caracteres de assinatura.
$assinaturaBoa = "a" * 43
$jwtBom = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.$assinaturaBoa"

Describe "Conferencia das variaveis do controle de acesso" {

    Context "a chave de servico" {

        It "aprova um JWT bem formado" {
            (Test-Segredo -Valor $jwtBom -Tipo 'jwt').Count | Should Be 0
        }

        It "pega o caractere sobrando no inicio - o erro que ja aconteceu" {
            $problemas = Test-Segredo -Valor "e$jwtBom" -Tipo 'jwt'
            ($problemas -join ' ') | Should Match "eyJ"
        }

        It "pega o = sobrando no fim - o outro metade do mesmo erro" {
            $problemas = Test-Segredo -Valor "$jwtBom=" -Tipo 'jwt'
            ($problemas -join ' ') | Should Match "="
        }

        It "pega assinatura de tamanho errado" {
            $curto = "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoieCJ9." + ("a" * 40)
            $problemas = Test-Segredo -Valor $curto -Tipo 'jwt'
            ($problemas -join ' ') | Should Match "43"
        }

        It "recusa o que nem parece um JWT" {
            $problemas = Test-Segredo -Valor "chave-qualquer" -Tipo 'jwt'
            ($problemas -join ' ') | Should Match "3 partes"
        }

        It "recusa valor ausente" {
            (Test-Segredo -Valor "" -Tipo 'jwt').Count | Should Be 1
            (Test-Segredo -Valor $null -Tipo 'jwt').Count | Should Be 1
        }
    }

    Context "os dois segredos do proprio projeto" {

        It "aprova um segredo longo" {
            (Test-Segredo -Valor ("x" * 64) -Tipo 'segredo').Count | Should Be 0
        }

        It "recusa segredo curto demais para resistir a forca bruta" {
            $problemas = Test-Segredo -Valor "senha123" -Tipo 'segredo'
            ($problemas -join ' ') | Should Match "curto"
        }
    }

    Context "o valor nunca vaza" {

        It "o diagnostico nao repete o valor conferido" {
            $segredo = "SEGREDOxSUPERxSECRETOxQUExNAOxPODExAPARECER"
            $problemas = Test-Segredo -Valor $segredo -Tipo 'jwt'
            $problemas.Count | Should Not Be 0
            ($problemas -join ' ') | Should Not Match "SEGREDOx"
        }

        It "o script nao imprime o valor de nenhuma variavel" {
            # Set-Clipboard recebe o valor; Write-Host so recebe o NOME.
            $texto = Get-Content (Join-Path $raiz "ferramentas\copiar_para_render.ps1") -Raw
            $texto | Should Match "Set-Clipboard -Value \`$valores"
            $texto | Should Not Match "Write-Host \`$valores"
            $texto | Should Not Match "Write-Host \`$valor\b"
        }
    }

    Context "a leitura do .env.local" {

        It "tira aspas e espaco em volta do valor" {
            $tmp = Join-Path $env:TEMP "envlocal_teste_$PID.txt"
            Set-Content -Path $tmp -Encoding utf8 -Value @(
                '# comentario',
                'VAZIA=',
                'COM_ASPAS="abc"',
                '  COM_ESPACO =  def  ',
                'COM_IGUAL=eyJ.abc.def=='
            )
            try {
                $v = Read-EnvLocal -Caminho $tmp
                $v['COM_ASPAS'] | Should Be 'abc'
                $v['COM_ESPACO'] | Should Be 'def'
                $v['COM_IGUAL'] | Should Be 'eyJ.abc.def=='
                $v['VAZIA'] | Should Be ''
                $v.ContainsKey('# comentario') | Should Be $false
            }
            finally {
                Remove-Item $tmp -Force -ErrorAction SilentlyContinue
            }
        }

        It "devolve vazio sem explodir quando nao ha .env.local" {
            $v = Read-EnvLocal -Caminho (Join-Path $env:TEMP "nao_existe_$PID.txt")
            $v.Count | Should Be 0
        }
    }

    Context "as quatro variaveis certas" {

        It "confere exatamente as quatro que o Render precisa" {
            $nomes = $VARIAVEIS | ForEach-Object { $_.Nome }
            $nomes -contains 'SUPABASE_SERVICE_KEY' | Should Be $true
            $nomes -contains 'ACESSO_AGENTE_SEGREDO' | Should Be $true
            $nomes -contains 'QR_PEDIDO_SEGREDO' | Should Be $true
            $nomes -contains 'ACESSO_ELEVACAO_SEGREDO' | Should Be $true
            $nomes.Count | Should Be 4
        }

        It "o -Somente aceita as mesmas quatro, e nada alem" {
            # Se as duas listas saissem de sincronia, -Somente recusaria uma
            # variavel que o script precisa copiar, ou aceitaria um nome que
            # nao existe no .env.local e copiaria vazio.
            $texto = Get-Content $script -Raw
            foreach ($nome in ($VARIAVEIS | ForEach-Object { $_.Nome })) {
                $texto | Should Match "ValidateSet\([^)]*'$nome'"
            }
        }
    }

    Context "a limpeza da area de transferencia" {

        It "nao usa string vazia, que o PowerShell 5.1 recusa" {
            # Set-Clipboard -Value '' levanta ArgumentNullException no 5.1, e o
            # -Clear so existe no PowerShell 7. A falha deixaria o segredo na
            # area de transferencia depois de colado, que e justamente o que
            # esta linha existe para evitar.
            $texto = Get-Content $script -Raw
            $texto | Should Not Match "Set-Clipboard -Value ''"
            $texto | Should Not Match 'Set-Clipboard\s+-Clear'
        }

        It "sobrescreve a area de transferencia no fim do modo interativo" {
            $texto = Get-Content $script -Raw
            $texto | Should Match "liberada pelo copiar_para_render"
        }
    }
}

Describe 'A quarta variavel' {
    $script:fonte = Get-Content (Join-Path $PSScriptRoot '..\ferramentas\copiar_para_render.ps1') -Raw

    It 'conhece a ACESSO_ELEVACAO_SEGREDO' {
        $script:fonte | Should Match 'ACESSO_ELEVACAO_SEGREDO'
    }

    It 'aceita a nova no -Somente' {
        # Sem isto o parametro recusaria justamente a variavel nova, e quem
        # fosse recopiar so ela levaria um erro de validacao sem explicacao.
        $script:fonte | Should Match "ValidateSet\([^)]*ACESSO_ELEVACAO_SEGREDO"
    }

    It 'nao manda ninguem para o projeto errado do Render' {
        $script:fonte | Should Not Match 'ideal-imposition-api'
    }
}
