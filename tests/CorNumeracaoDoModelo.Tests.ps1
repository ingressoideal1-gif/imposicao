#
# A Cor e a Numeracao de um modelo existem duas vezes na linha de pedidos_modelos:
# como NOME, escrito pelo sistema parceiro (padrao / gabarito_operacional), e como
# ID, derivado depois pelo painel (amostra_cor_id / amostra_num_id).
#
# O que estes testes protegem e a regra de desempate. Ela nao e simetrica, e a
# assimetria e o ponto: a cor sempre segue o nome do parceiro, mas a numeracao NAO
# pode seguir cegamente — uma numeracao customizada e gravada so no id, deixando o
# gabarito_operacional apontando para o modelo base. Seguir o texto ali jogaria fora
# o trabalho do operador e devolveria a numeracao ao gabarito de fabrica, sem aviso.
#

$raizProjeto = Split-Path -Parent $PSScriptRoot

# Catalogos de mentira, mas com a forma exata dos de producao — inclusive o nome
# "Sem Numeracao" repetido, que existe duas vezes no banco real e torna a busca
# por nome ambigua.
$cores = @(
    @{ id = 'cor-azul';    name = 'Azul' },
    @{ id = 'cor-rosa';    name = 'Rosa Bebe' },
    @{ id = 'cor-amarelo'; name = 'Amarelo Fluor' },
    @{ id = 'cor-prata';   name = 'Prata' }
)

$numeracoes = @(
    @{ id = 'num-mobi';     name = 'Mobi Padrao';       is_custom = $false },
    @{ id = 'num-triband';  name = 'Triband Padrao';    is_custom = $false },
    @{ id = 'num-90x140';   name = '90x140 - Amostra';  is_custom = $false },
    @{ id = 'num-1000270';  name = '1000270';           is_custom = $true  },
    @{ id = 'num-sem-a';    name = 'Sem Numeracao';     is_custom = $false },
    @{ id = 'num-sem-b';    name = 'Sem Numeracao';     is_custom = $false }
)

function Invoke-Reconciliacao {
    param($Linha, $Cores = $cores, $Numeracoes = $numeracoes)

    $arquivo = [System.IO.Path]::GetTempFileName()
    try {
        $caso = @{ linha = $Linha; cores = $Cores; numeracoes = $Numeracoes }
        $caso | ConvertTo-Json -Depth 8 | Set-Content -Path $arquivo -Encoding utf8
        $saida = & node "$PSScriptRoot\cor_numeracao_harness.js" $arquivo
        if ($LASTEXITCODE -ne 0) { throw "harness node falhou: $saida" }
        return ($saida | ConvertFrom-Json)
    } finally {
        Remove-Item $arquivo -ErrorAction SilentlyContinue
    }
}

Describe "reconciliarCorNumDoModelo - Cor" {

    It "o nome escrito pelo parceiro vence o id que o painel tinha em cache" {
        # Caso real do pedido 20517, modelo 1000286: o parceiro trocou a cor para
        # Rosa Bebe e a tela continuava mostrando Amarelo Fluor, para sempre.
        $r = Invoke-Reconciliacao @{
            padrao = 'Rosa Bebe'; amostra_cor_id = 'cor-amarelo'
            gabarito_operacional = $null; amostra_num_id = $null
        }
        $r.corId | Should Be 'cor-rosa'
        $r.corTrocada | Should Be $true
    }

    It "preenche a cor quando o painel ainda nao tinha id nenhum" {
        $r = Invoke-Reconciliacao @{ padrao = 'Azul'; amostra_cor_id = $null }
        $r.corId | Should Be 'cor-azul'
    }

    It "nao mexe quando o nome e o id ja concordam" {
        $r = Invoke-Reconciliacao @{ padrao = 'Azul'; amostra_cor_id = 'cor-azul' }
        $r.corId | Should Be 'cor-azul'
        $r.corTrocada | Should Be $false
    }

    It "nome sem correspondente no catalogo NAO apaga a cor escolhida" {
        # 'Amarela' existe em tres pedidos de producao e nao existe no catalogo.
        # Zerar a selecao por causa disso tiraria a cor do papel de um pedido pronto.
        $r = Invoke-Reconciliacao @{ padrao = 'Amarela'; amostra_cor_id = 'cor-prata' }
        $r.corId | Should Be 'cor-prata'
        $r.corTrocada | Should Be $false
    }

    It "id que nao esta no catalogo carregado e preservado" {
        # No link do cliente o catalogo vem filtrado. Trocar o que nao da para
        # conferir seria adivinhar.
        $r = Invoke-Reconciliacao @{ padrao = 'Azul'; amostra_cor_id = 'cor-que-nao-veio' }
        $r.corId | Should Be 'cor-que-nao-veio'
    }
}

Describe "reconciliarCorNumDoModelo - Numeracao" {

    It "a numeracao customizada do operador sobrevive ao texto do parceiro" {
        # Caso real do pedido 20495: editCustomNumeracao grava so o amostra_num_id
        # e deixa o gabarito_operacional no gabarito base. Seguir o texto aqui
        # apagaria a numeracao que o operador montou.
        $r = Invoke-Reconciliacao @{
            gabarito_operacional = '90x140 - Amostra'; amostra_num_id = 'num-1000270'
        }
        $r.numId | Should Be 'num-1000270'
        $r.numTrocada | Should Be $false
    }

    It "o nome do parceiro vence quando o id em cache aponta para outro gabarito" {
        $r = Invoke-Reconciliacao @{
            gabarito_operacional = 'Mobi Padrao'; amostra_num_id = 'num-triband'
        }
        $r.numId | Should Be 'num-mobi'
        $r.numTrocada | Should Be $true
    }

    It "nome repetido no catalogo nao troca quando o id em cache ja tem esse nome" {
        # 'Sem Numeracao' existe duas vezes. As duas linhas satisfazem o texto,
        # entao a que ja esta escolhida esta certa.
        $r = Invoke-Reconciliacao @{
            gabarito_operacional = 'Sem Numeracao'; amostra_num_id = 'num-sem-b'
        }
        $r.numId | Should Be 'num-sem-b'
        $r.numTrocada | Should Be $false
    }

    It "nome ambiguo nao troca uma numeracao que aponta para outra coisa" {
        $r = Invoke-Reconciliacao @{
            gabarito_operacional = 'Sem Numeracao'; amostra_num_id = 'num-triband'
        }
        $r.numId | Should Be 'num-triband'
        $r.numTrocada | Should Be $false
    }

    It "preenche a numeracao quando o painel ainda nao tinha id nenhum" {
        $r = Invoke-Reconciliacao @{ gabarito_operacional = 'Mobi Padrao'; amostra_num_id = $null }
        $r.numId | Should Be 'num-mobi'
    }

    It "gabarito sem correspondente no catalogo NAO apaga a numeracao escolhida" {
        $r = Invoke-Reconciliacao @{
            gabarito_operacional = 'Gabarito Que Foi Renomeado'; amostra_num_id = 'num-mobi'
        }
        $r.numId | Should Be 'num-mobi'
    }
}

Describe "reconciliarCorNumDoModelo - degradacao segura" {

    It "catalogo vazio nao mexe em nada" {
        # loadOSItens pode rodar antes de as cores chegarem. Sem catalogo nao ha
        # como conferir, entao o certo e nao tocar em nada.
        $r = Invoke-Reconciliacao -Linha @{
            padrao = 'Rosa Bebe'; amostra_cor_id = 'cor-amarelo'
            gabarito_operacional = 'Mobi Padrao'; amostra_num_id = 'num-triband'
        } -Cores @() -Numeracoes @()
        $r.corId | Should Be 'cor-amarelo'
        $r.numId | Should Be 'num-triband'
    }

    It "linha sem nome nenhum devolve o que ja estava" {
        $r = Invoke-Reconciliacao @{
            padrao = $null; amostra_cor_id = 'cor-prata'
            gabarito_operacional = ''; amostra_num_id = 'num-mobi'
        }
        $r.corId | Should Be 'cor-prata'
        $r.numId | Should Be 'num-mobi'
    }

    It "linha inexistente nao explode" {
        $r = Invoke-Reconciliacao -Linha $null
        $r.corId | Should Be $null
        $r.numId | Should Be $null
    }
}
