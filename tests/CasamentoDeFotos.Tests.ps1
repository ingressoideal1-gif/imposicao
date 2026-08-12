#
# O casamento entre o lote de fotos e as linhas do banco e JavaScript de
# navegador, e mora no frontend/foto-lib.js. Os casos estao escritos em
# tests/foto_lib_harness.js, que roda em node e sai com codigo 1 quando algum
# falha; este arquivo so o traz para dentro da suite do projeto, do mesmo jeito
# que CorNumeracaoDoModelo.Tests.ps1 faz com a reconciliacao.
#
# Por que isto merece teste: um casamento errado nao quebra nada. Ele imprime a
# credencial da Ana com a foto do Bruno, e quem descobre e o cliente.
#

Describe 'Casamento de fotos com as linhas do banco' {

    It 'tem o node disponivel para rodar a regra' {
        $node = Get-Command node -ErrorAction SilentlyContinue
        ($null -ne $node) | Should Be $true
    }

    It 'passa em todos os casos do foto_lib_harness' {
        $harness = Join-Path $PSScriptRoot 'foto_lib_harness.js'
        $saida = & node $harness 2>&1
        $codigo = $LASTEXITCODE
        if ($codigo -ne 0) {
            Write-Host ($saida -join "`n")
        }
        $codigo | Should Be 0
        ($saida -join ' ') | Should Match 'casos passaram'
    }
}
