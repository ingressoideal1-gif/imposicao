Import-Module "$PSScriptRoot\..\ferramentas\VersaoAgente.psm1" -Force

Describe "Update-VersaoAgentPy" {
    It "troca o AGENT_VERSION" {
        $antes = 'AGENT_VERSION = "1.2.22"'
        Update-VersaoAgentPy $antes '1.2.23' | Should Be 'AGENT_VERSION = "1.2.23"'
    }
    It "reclama quando nao acha o padrao" {
        { Update-VersaoAgentPy 'nada aqui' '1.2.23' } | Should Throw 'Nao achei'
    }
    It "funciona no arquivo real do projeto" {
        $txt = Get-Content -Raw -Encoding UTF8 "$PSScriptRoot\..\agent_version.py"
        (Update-VersaoAgentPy $txt '9.9.9') -match 'AGENT_VERSION = "9\.9\.9"' | Should Be $true
    }
}

Describe "Update-VersaoWxs" {
    It "troca a Version para o formato de quatro partes" {
        Update-VersaoWxs 'Version="1.2.22.0"' '1.2.23' | Should Be 'Version="1.2.23.0"'
    }
    It "NAO confunde InstallerVersion com Version — corromperia o instalador" {
        # O perigo real: os dois atributos convivem no mesmo arquivo, e um
        # regex ingenuo de Version= casa com ambos. So a Version pode mudar.
        $antes = '<Product Version="1.2.22.0"><Package InstallerVersion="300" /></Product>'
        Update-VersaoWxs $antes '1.2.23' |
            Should Be '<Product Version="1.2.23.0"><Package InstallerVersion="300" /></Product>'
    }
    It "reclama quando o arquivo nao tem Version nenhuma" {
        { Update-VersaoWxs '<Package InstallerVersion="300" />' '1.2.23' } | Should Throw 'Nao achei'
    }
    It "no arquivo real, troca a Version e preserva InstallerVersion" {
        $txt = Get-Content -Raw -Encoding UTF8 "$PSScriptRoot\..\agent_installer.wxs"
        $novo = Update-VersaoWxs $txt '9.9.9'
        ($novo -match 'Version="9\.9\.9\.0"')   | Should Be $true
        ($novo -match 'InstallerVersion="300"') | Should Be $true
    }
}

Describe "Update-VersaoCompilar" {
    It "troca o nome do msi" {
        $antes = '$msiOutput = "dist\NewProd_Setup_v1.2.22.msi"'
        Update-VersaoCompilar $antes '1.2.23' |
            Should Be '$msiOutput = "dist\NewProd_Setup_v1.2.23.msi"'
    }
    It "reclama quando nao acha o padrao" {
        { Update-VersaoCompilar 'nada aqui' '1.2.23' } | Should Throw 'Nao achei'
    }
    It "funciona no arquivo real do projeto" {
        $txt = Get-Content -Raw -Encoding UTF8 "$PSScriptRoot\..\compilar_msi.ps1"
        (Update-VersaoCompilar $txt '9.9.9') -match 'NewProd_Setup_v9\.9\.9\.msi' | Should Be $true
    }
}

Describe "Get-MensagemTag" {
    It "usa as notas quando elas existem" {
        Get-MensagemTag -Versao '1.2.28' -Notas 'corrige a fonte no verso' |
            Should Be 'corrige a fonte no verso'
    }
    It "NUNCA devolve vazio — foi o que fez o git recusar a tag do 1.2.28" {
        # 'git tag -a X -m' sem valor aborta com "switch 'm' requires a value",
        # e o agente ficava publicado sem ponto de restauracao.
        Get-MensagemTag -Versao '1.2.28' -Notas ''    | Should Be 'Agente 1.2.28'
        Get-MensagemTag -Versao '1.2.28' -Notas '   ' | Should Be 'Agente 1.2.28'
        Get-MensagemTag -Versao '1.2.28'              | Should Be 'Agente 1.2.28'
    }
}
