param(
    [Parameter(Mandatory)][string]$Backup,
    [Parameter(Mandatory)][string]$Destino,
    [Parameter(Mandatory)][string]$Chave,
    [string]$Python = (Join-Path (Split-Path -Parent $PSScriptRoot) '.venv\Scripts\python.exe'),
    [switch]$Verificar
)
$ErrorActionPreference = 'Stop'
$destinoAbsoluto = [IO.Path]::GetFullPath($Destino)
$raiz = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if (Test-Path -LiteralPath $destinoAbsoluto) { throw 'Escolha uma pasta nova; restauracao nunca sobrescreve a operacao.' }
if ($destinoAbsoluto -eq $raiz -or $destinoAbsoluto.StartsWith($raiz + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Restauracao deve ficar fora do repositorio.' }
# O pai deve ter ACL restrita; o material restaurado pode conter dados privados.
$parent = Split-Path -Parent $destinoAbsoluto
if (-not (Get-Acl -LiteralPath $parent).AreAccessRulesProtected) { throw 'Prepare um pai com ACL privada antes de restaurar.' }
& $Python (Join-Path $PSScriptRoot 'backup_portatil.py') restaurar --backup $Backup --destino $destinoAbsoluto --chave $Chave
if ($LASTEXITCODE -ne 0) { throw 'Restauracao incompleta; preserve o destino protegido.' }
if ($Verificar) {
    & $Python (Join-Path $PSScriptRoot 'backup_portatil.py') verificar --destino $destinoAbsoluto
    if ($LASTEXITCODE -ne 0) { throw 'Ensaio de restauracao falhou.' }
}
