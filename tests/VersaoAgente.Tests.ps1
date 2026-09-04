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

# ── O ENVIO DO MSI AGUENTA A REDE OSCILAR (04/09/2026) ──────────────────────
#
# A publicacao do 1.2.301 caiu tres vezes seguidas com a conexao sendo
# resetada no meio dos 68 MB, e cada queda custava um build inteiro. O envio
# passou a tentar de novo -- mas so' quando a QUEDA e de transporte, e nunca
# por cima de um objeto que ja chegou ao bucket.
Describe "O envio do MSI aguenta a rede oscilar" {
    BeforeAll {
        $script:Publicar = Get-Content -Raw -Encoding UTF8 "$PSScriptRoot\..\publicar_agente.ps1"
    }

    It "tenta mais de uma vez" {
        $script:Publicar -match '\$TENTATIVAS\s*=\s*[2-9]' | Should Be $true
    }

    It "espera entre uma tentativa e outra, em vez de martelar a rede" {
        $script:Publicar -match 'Start-Sleep -Seconds \$espera' | Should Be $true
    }

    It "pergunta ao bucket antes de reenviar — nunca sobrescreve o que ja chegou" {
        $script:Publicar -match 'if \(Test-ObjetoNoBucket -Url \$urlPublica\)' | Should Be $true
    }

    It "a pergunta ao bucket usa a URL PUBLICA, que e a que o agente le" {
        $script:Publicar -match 'function Test-ObjetoNoBucket[\s\S]{0,400}Invoke-WebRequest -Uri \$Url -Method Head' | Should Be $true
    }

    It "resposta do servidor NAO e retentada — 401 e 'ja existe' nao melhoram esperando" {
        # O Abortar dentro do ramo de status ruim e' o que garante isto: ele
        # sai do script, em vez de cair no laco de novo.
        $script:Publicar -match 'if \(-not \$resposta.IsSuccessStatusCode\)[\s\S]{0,300}Abortar' | Should Be $true
    }

    It "esgotadas as tentativas, aborta dizendo que o objeto NAO chegou ao bucket" {
        $script:Publicar -match 'falhou nas \$TENTATIVAS tentativas' | Should Be $true
        $script:Publicar -match 'o objeto nao chegou ao bucket' | Should Be $true
    }

    It "o manifesto continua vindo DEPOIS da conferencia do sha" {
        # A ordem e' a razao de o release nunca apontar para arquivo ausente.
        $iEnvio = $script:Publicar.IndexOf('Enviando o MSI')
        $iSha = $script:Publicar.IndexOf('sha256 confere')
        $iManifesto = $script:Publicar.IndexOf('$urlManifesto')
        ($iEnvio -gt 0 -and $iSha -gt $iEnvio -and $iManifesto -gt $iSha) | Should Be $true
    }
}
