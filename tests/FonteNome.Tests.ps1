# O nome da fonte sai de DENTRO do arquivo (tabela `name` do sfnt), nao da
# digitacao do usuario. O harness node monta TTFs minimos em memoria e confere
# a extracao, o fallback para o nome do arquivo e a chave de duplicata.

Describe 'fonte-nome.js -- extracao do nome' {
    It 'tem o node disponivel' {
        $node = Get-Command node -ErrorAction SilentlyContinue
        ($null -ne $node) | Should Be $true
    }
    It 'passa todos os casos do harness' {
        $saida = & node "$PSScriptRoot\fonte_nome_harness.js" 2>&1
        if ($LASTEXITCODE -ne 0) { throw "harness falhou:`n$saida" }
        $LASTEXITCODE | Should Be 0
    }
}
