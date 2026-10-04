param(
    [Parameter(Mandatory)][string]$Pacote,
    [Parameter(Mandatory)][string]$Destino,
    [Parameter(Mandatory)][string]$Chave,
    [string]$Python = (Join-Path (Split-Path -Parent $PSScriptRoot) '.venv\Scripts\python.exe')
)
$ErrorActionPreference = 'Stop'
$destinoAbsoluto = [IO.Path]::GetFullPath($Destino)
$raiz = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if (Test-Path -LiteralPath $destinoAbsoluto) { throw 'Escolha uma pasta nova; restauracao nunca sobrescreve.' }
if ($destinoAbsoluto -eq $raiz -or $destinoAbsoluto.StartsWith($raiz + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Restauracao deve ficar fora do repositorio.' }
$parent = Split-Path -Parent $destinoAbsoluto
if (-not (Get-Acl -LiteralPath $parent).AreAccessRulesProtected) { throw 'Prepare um pai com ACL privada antes de restaurar.' }
& $Python (Join-Path $PSScriptRoot 'restaurar_storage.py') --pacote $Pacote --destino $destinoAbsoluto --chave $Chave
if ($LASTEXITCODE -ne 0) { throw 'Restauracao Storage incompleta; preserve o destino protegido.' }
