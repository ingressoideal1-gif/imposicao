# Reescreve o numero da versao do agente nos tres formatos de arquivo.
#
# Funcoes puras: recebem e devolvem texto, nao tocam disco. E o que permite
# testar contra os arquivos reais sem risco de corrompe-los.
#
# Cada uma LANCA se nao achar o padrao. Silenciar aqui seria pior que falhar:
# um arquivo nao atualizado significa MSI que o Windows recusa instalar, ou
# auto-update que nunca dispara — e os dois falham em silencio, sem erro
# visivel em lugar nenhum.

function Update-VersaoAgentPy {
    <#
    .SYNOPSIS
        Troca o AGENT_VERSION no texto do agent_version.py.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][string]$Texto,
        [Parameter(Mandatory)][string]$Versao
    )
    $padrao = 'AGENT_VERSION\s*=\s*"[\d.]+"'
    if ($Texto -notmatch $padrao) {
        throw "Nao achei 'AGENT_VERSION = ""...""' em agent_version.py."
    }
    return [regex]::Replace($Texto, $padrao, "AGENT_VERSION = `"$Versao`"")
}

function Update-VersaoWxs {
    <#
    .SYNOPSIS
        Troca a Version no texto do agent_installer.wxs, no formato X.Y.Z.0.
    .DESCRIPTION
        O padrao tem duas barreiras contra o mesmo acidente: o arquivo tem
        InstallerVersion="300" quatro linhas abaixo da Version, e um regex
        ingenuo de Version= casa com os dois — trocar aquele valor corrompe
        o instalador.

        Barreira 1: (?<![A-Za-z]) exige que nada alfabetico venha antes de
        "Version", o que descarta "InstallerVersion".
        Barreira 2: exigir quatro partes numericas, que "300" nao tem.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][string]$Texto,
        [Parameter(Mandatory)][string]$Versao
    )
    $padrao = '(?<![A-Za-z])Version="\d+\.\d+\.\d+\.\d+"'
    if ($Texto -notmatch $padrao) {
        throw "Nao achei 'Version=""X.Y.Z.0""' em agent_installer.wxs."
    }
    return [regex]::Replace($Texto, $padrao, "Version=`"$Versao.0`"")
}

function Update-VersaoCompilar {
    <#
    .SYNOPSIS
        Troca o nome do .msi gerado no texto do compilar_msi.ps1.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][string]$Texto,
        [Parameter(Mandatory)][string]$Versao
    )
    $padrao = 'NewProd_Setup_v[\d.]+\.msi'
    if ($Texto -notmatch $padrao) {
        throw "Nao achei 'NewProd_Setup_vX.Y.Z.msi' em compilar_msi.ps1."
    }
    return [regex]::Replace($Texto, $padrao, "NewProd_Setup_v$Versao.msi")
}

function Get-MensagemTag {
    <#
    .SYNOPSIS
        Mensagem da tag do agente, nunca vazia.
    .DESCRIPTION
        Publicar sem -Notas deixava $Notas como "" — e o PowerShell DESCARTA o
        argumento vazio ao chamar um executavel, entao o git recebia
        "tag -a agente-vX -m" e recusava com "switch 'm' requires a value".

        A tag e o ponto de restauracao do agente: voltar uma versao exige
        compilar o codigo antigo com um numero novo (-Codigo agente-vX), e sem
        a tag nao ha de onde traze-lo. Perde-la em silencio significa descobrir
        que ela nao existe justamente no dia em que for preciso voltar.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][string]$Versao,
        [AllowEmptyString()][string]$Notas = ""
    )
    if ([string]::IsNullOrWhiteSpace($Notas)) { return "Agente $Versao" }
    return $Notas
}

Export-ModuleMember -Function Update-VersaoAgentPy, Update-VersaoWxs, Update-VersaoCompilar, Get-MensagemTag
