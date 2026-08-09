# Publicação Segura — Plano de Implementação

> **SEGREDO-DE-MENTIRA** — as chaves que aparecem neste documento sao fabricadas, para
> ilustrar a regra do freio de segredo. Esta declaracao dispensa o arquivo da checagem
> do `publicar.ps1`; sem ela, o documento que explica o freio travaria a publicacao.


> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar ao processo de publicação um ponto de restauração por versão, conferências que abortam antes de qualquer coisa ir ao ar, e um caminho de volta que um iniciante consiga executar sozinho.

**Architecture:** Toda a lógica que decide algo (isto é rascunho? isto é segredo? esta versão é maior?) vira função pura num módulo PowerShell (`ferramentas/Publicacao.psm1`), testada com Pester sem tocar git, rede ou disco. Os scripts de ponta (`publicar.ps1`, `voltar.ps1`, `publicar_agente.ps1`) só coletam o estado, chamam essas funções e agem. Assim os freios são testáveis de verdade em vez de só existirem dentro de um script que ninguém consegue exercitar sem publicar.

**Tech Stack:** PowerShell 5.1 (Windows), Pester 3.4.0 (já instalado — sintaxe `Should Be`, sem hífen), Python 3.14.5 no `venv`, Vercel CLI 54.10.3, git.

## Global Constraints

- **PowerShell 5.1**: sem `&&`, `||`, ternário `?:`, `??` ou `?.`. Encadeamento condicional é `A; if ($?) { B }`.
- **Pester 3.4.0**: sintaxe antiga — `$x | Should Be $y`, `Should BeExactly`, `Should Throw`. **Não** use `Should -Be` (v5).
- **Encoding**: todo arquivo escrito com `Set-Content -Encoding UTF8`. Ao reescrever HTML preservando bytes, use `-Raw` na leitura e `-NoNewline` na escrita.
- **`Set-Content`**: `-Path` e `-Value` sempre **nomeados**, nunca posicionais — `-Path` aceita `string[]` e engole os dois argumentos no mesmo array, falhando com erro enganoso sobre `Encoding`.
- **Nada de `git reset --hard`** em nenhum script. Desfazer é sempre `git revert`.
- **Nunca redirecionar `2>&1`** de executável nativo: no PS 5.1 cada linha de stderr vira `ErrorRecord` e aborta com `$ErrorActionPreference = "Stop"`. O PyInstaller escreve em stderr mesmo com sucesso.
- **Versão do agente hoje**: `1.2.22`. **Versão do site hoje**: `v490`. **Commit publicado hoje**: `2dac724`.
- **Bucket de releases**: `agent-releases` em `https://vwbtitjlpelrcnsytzqw.supabase.co` (constantes em `security_config.py`, não duplicar o literal em script novo — ler de lá).
- **Idioma**: mensagens ao usuário em português. Comentários explicam **por quê**, não o quê.

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `ferramentas/Publicacao.psm1` (criar) | Funções puras de decisão: rascunho, segredo, versão. Zero efeito colateral. |
| `ferramentas/VersaoAgente.psm1` (criar) | Funções puras que reescrevem o número da versão nos três formatos de arquivo do agente. |
| `tests/Publicacao.Tests.ps1` (criar) | Pester do primeiro módulo. |
| `tests/VersaoAgente.Tests.ps1` (criar) | Pester do segundo módulo. |
| `ferramentas/faxina.ps1` (criar) | Roda **uma vez**: move rascunhos e reorganiza a raiz. |
| `publicar.ps1` (modificar) | Orquestra: freios → bump → commit → push → deploy → tag. |
| `voltar.ps1` (criar) | Volta em dois níveis. |
| `publicar_agente.ps1` (criar) | Release do agente, da versão ao manifesto. |
| `publicar.bat` (modificar) | Vira invólucro fino do `.ps1`. |
| `docs/PUBLICAR.md` (criar) | O manual único. |
| `.gitignore` (modificar) | Padrões de rascunho. |

Dois módulos e não um: as funções do agente só interessam ao release do agente, e mantê-las separadas deixa cada arquivo pequeno o bastante para ser lido inteiro.

---

# FASE 1 — Rede de segurança

## Task 1: Marcar o estado que está no ar

**Files:**
- Nenhum arquivo alterado. Só git.

**Interfaces:**
- Consumes: nada.
- Produces: a tag `v490` em `2dac724`, que a Task 9 (`voltar.ps1`) usa como alvo mais antigo conhecido.

- [ ] **Step 1: Confirmar que não existe nenhuma tag ainda**

```powershell
git tag -l
```
Esperado: saída vazia. Se houver tags, PARE e reporte — o plano assume ponto de partida limpo.

- [ ] **Step 2: Confirmar que `2dac724` é mesmo o commit publicado**

```powershell
git log --oneline -1 2dac724
```
Esperado: `2dac724 docs: modelo de arquivo por elemento, skill de PDF/SVG e o episodio do "zero dados"`

- [ ] **Step 3: Criar a tag anotada**

```powershell
git tag -a v490 2dac724 -m @'
Marco inicial do processo de publicacao com rede de seguranca.

Este e o estado que estava no ar em 2026-08-09, antes de qualquer mudanca
nos scripts. E o alvo mais antigo para o qual o voltar.ps1 sabe voltar.
'@
```

- [ ] **Step 4: Verificar que a tag aponta para o commit certo**

```powershell
git rev-parse v490^{commit}
```
Esperado: um hash começando em `2dac724`.

- [ ] **Step 5: Empurrar a tag**

```powershell
git push origin v490
```
Esperado: `* [new tag] v490 -> v490`

---

## Task 2: Faxina da raiz

**Files:**
- Create: `ferramentas/faxina.ps1`
- Modify: `.gitignore`
- Move: ~100 arquivos da raiz para `rascunhos/`, `tests/`, `sql/`, `scripts/migracoes/`

**Interfaces:**
- Consumes: a tag `v490` da Task 1 (rede de segurança — todo arquivo movido continua acessível por ela).
- Produces: as pastas `tests/`, `sql/`, `scripts/migracoes/` e `rascunhos/`; a raiz sem rascunho versionado, que é a pré-condição do freio da Task 7.

- [ ] **Step 1: Confirmar que a árvore está limpa antes de mexer**

```powershell
git status --porcelain
```
Esperado: saída vazia. Se não estiver, PARE — commite ou guarde o trabalho pendente primeiro.

- [ ] **Step 2: Escrever o script da faxina**

Create `ferramentas/faxina.ps1`:

```powershell
# Roda UMA VEZ. Reorganiza a raiz do repositorio.
#
# Move, nunca apaga: os arquivos continuam no disco (em rascunhos/) e o
# historico completo segue acessivel pela tag v490. Desfazer e um
# `git revert` do commit que este script produz.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot\..

# --- Rascunho: sai do git, fica no disco em rascunhos/ ---------------------
# Padroes (o mesmo conjunto que vira freio permanente na Task 4) mais uma
# lista explicita do que so existe por acidente historico e nao tem padrao.
$padroes = @(
    'scratch_*', 'temp_*', 'temp.py', 'temp2.py',
    'patch_*', 'patch2.py',
    'check_*', 'fix_*',
    'diag_engine.py', 'diag2.py',
    'test_debug*.js', 'test.js', 'test.py', 'test2.py', 'test3.py',
    'test4.py', 'test5.py', 'test-fetch.js', 'test_api*.js',
    'test_browser.js', 'test_col.js', 'test_final.js', 'test_pdf.js',
    'diff.txt', 'build_log.txt', 'mangled.txt', 'py_out.txt',
    'test_out.txt', 'scratch_func.txt', 'snapshot.jpg'
)
$explicitos = @(
    'engine_backup.py',   # o git ja e o backup
    'read_pdf.py', 'poll_render.py', 'find_tipos.py', 'move_tipos.ps1',
    'update_engine.py',
    'imposition.db', 'local_db.sqlite'   # ambos com 0 byte
)

# --- Fica no git, so muda de lugar ----------------------------------------
$paraTests = @(
    'test_engine_dual_vdp.py', 'test_engine_rotation.py', 'test_impose.py',
    'test_pdf_duplex.py', 'test_pdf_multiple.py', 'test_pdf_offset_cropbox.py',
    'test_multi_artes.py', 'test_multi_artes_capa.py', 'test_mapa.py',
    'test_render.py', 'test_local.py', 'test_gen.py', 'test_capa.py',
    'test_db.py', 'test_diag.py', 'test_fastapi.py', 'test_enc_front.py',
    'run_impose.py', 'teste_dados.csv'
)
$paraSql = @('schema*.sql', 'alter_*.sql', 'rls_fase1_catalogo.sql',
             'criar_bucket_previews.sql', 'migration_data.sql')
$paraMigracoes = @('migrate_*.py', 'migrar_previews_para_storage.py',
                   'add_pc_fonts.py', 'add_popular_fonts.py')

foreach ($d in 'rascunhos', 'tests', 'sql', 'scripts\migracoes') {
    if (-not (Test-Path $d)) { New-Item -ItemType Directory -Force $d | Out-Null }
}

# -like e nao -Filter de proposito: o -Filter do Windows herda o casamento
# por nome 8.3, entao 'test_api*.js' tambem pegaria um 'test_api2.jsx'. Aqui
# um falso positivo tira do git um arquivo que deveria ficar.
function Selecionar-Raiz {
    param([string]$Alvo)
    return @(Get-ChildItem -File | Where-Object { $_.Name -like $Alvo })
}

function Mover-ParaFora {
    param([string[]]$Alvos)
    foreach ($alvo in $Alvos) {
        foreach ($f in (Selecionar-Raiz $alvo)) {
            git rm --cached --quiet -- $f.Name
            Move-Item -Force -Path $f.Name -Destination "rascunhos\$($f.Name)"
            Write-Host "  rascunhos/  $($f.Name)" -ForegroundColor DarkGray
        }
    }
}

function Mover-NoGit {
    param([string[]]$Alvos, [string]$Destino)
    foreach ($alvo in $Alvos) {
        foreach ($f in (Selecionar-Raiz $alvo)) {
            git mv -- $f.Name "$Destino/$($f.Name)"
            Write-Host "  $Destino/  $($f.Name)" -ForegroundColor DarkGray
        }
    }
}

Write-Host "Movendo rascunhos para fora do git..." -ForegroundColor Cyan
Mover-ParaFora ($padroes + $explicitos)

Write-Host "Organizando o que fica versionado..." -ForegroundColor Cyan
Mover-NoGit $paraTests      'tests'
Mover-NoGit $paraSql        'sql'
Mover-NoGit $paraMigracoes  'scripts/migracoes'

Write-Host "`nFaxina concluida. Confira com 'git status' antes de commitar." -ForegroundColor Green
```

- [ ] **Step 3: Acrescentar os padrões ao `.gitignore`**

Append ao final de `.gitignore`:

```
# Rascunho de sessao — script escrito para resolver um problema pontual.
# Fica no disco, fora do controle de versao. O freio do publicar.ps1 avisa
# se algum deles for adicionado ao git por engano.
rascunhos/
scratch_*
temp_*
temp.py
temp2.py
patch_*
patch2.py
check_*
fix_*
diag_engine.py
diag2.py
test_debug*.js
test.js
test.py
test[2-5].py
test-fetch.js
test_api*.js
test_browser.js
test_col.js
test_final.js
test_pdf.js
diff.txt
build_log.txt
mangled.txt
py_out.txt
test_out.txt
scratch_func.txt
snapshot.jpg
engine_backup.py
```

- [ ] **Step 4: Rodar a faxina**

```powershell
.\ferramentas\faxina.ps1
```
Esperado: lista de arquivos movidos, terminando em `Faxina concluida.`

- [ ] **Step 5: Conferir que o motor continua subindo**

Este é o teste que importa: se algo movido fosse necessário em tempo de execução, o import quebra.

```powershell
.\venv\Scripts\python.exe -c "import app, engine, db; print('import OK')"
```
Esperado: termina com `import OK` (a linha `[db.py] Supabase do Vibecode ativo: ...` antes dela é normal). Confira o código de saída com `$LASTEXITCODE` — deve ser `0`.

- [ ] **Step 6: Conferir que a raiz encolheu e nada essencial sumiu**

```powershell
(git ls-files | Where-Object { $_ -notmatch '/' }).Count
git ls-files | Where-Object { $_ -notmatch '/' } | Sort-Object
```
Esperado: contagem em torno de 60 (era 169). Na lista devem continuar presentes: `app.py`, `engine.py`, `db.py`, `main.py`, `security_config.py`, `font_cache.py`, `ppd_parser.py`, `print_service.py`, `utils_generator.py`, `local_print_agent.py`, todos os `agent_*`, `installer.iss`, `license.rtf`, `compilar_msi.ps1`, `compilar_instalador.ps1`, `build_agent.ps1`, `render.yaml`, `vercel.json`, `package.json`, `requirements.txt`, `formats_db.json`, `firestore.rules`, `Diagnostico_Fontes.ps1`, `iniciar_servidores.bat`, `Encerrar_Servidor.bat`, `Iniciar_Servidor.vbs`, `Liberar_Firewall.bat` e os `.md`.

Se algum deles faltar, PARE e reporte antes de commitar.

- [ ] **Step 7: Subir o app e abrir o painel**

Use a skill `rodar-app` do projeto. Confirme que o painel carrega e mostra dados. Isto fecha a verificação: o import passar não garante que um asset movido não fazia falta em runtime.

- [ ] **Step 8: Commit**

```powershell
git add -A
git commit -m @'
chore(repo): faxina da raiz — rascunhos fora do git, testes e SQL organizados

169 arquivos versionados na raiz viravam ruido no `git add -A` do publicar:
uma edicao pela metade subia junto sem ninguem ver. Os rascunhos saem do
controle de versao com `git rm --cached` (continuam no disco, em rascunhos/),
os testes de verdade vao para tests/, o SQL para sql/ e as migracoes para
scripts/migracoes/.

Nada foi apagado. O historico completo segue acessivel pela tag v490.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 3: Apagar as branches já incorporadas

**Files:** nenhum. Só git.

**Interfaces:**
- Consumes: nada.
- Produces: um `git branch` legível, pré-condição para o manual da Task 13 não precisar explicar branches mortas.

- [ ] **Step 1: Reconfirmar que todas estão dentro da `main`**

```powershell
git branch --no-merged main
```
Esperado: saída vazia. Se listar alguma branch, PARE — ela tem trabalho não incorporado.

- [ ] **Step 2: Apagar as branches locais**

```powershell
git branch -d chore/versao-1.2.4 feature/ajuste-tabela-producao feature/colunas-painel-producao feature/layout-elementos-numeracao feature/numeracao-ticket feature/numeracao-tipo fix/seguranca-agente-local
```
Esperado: uma linha `Deleted branch ...` para cada. O `-d` (minúsculo) recusa branch não incorporada — é o freio embutido.

- [ ] **Step 3: Apagar as remotas**

```powershell
git push origin --delete feature/ajuste-tabela-producao feature/colunas-painel-producao feature/layout-elementos-numeracao feature/numeracao-ticket feature/numeracao-tipo
```

- [ ] **Step 4: Verificar**

```powershell
git branch -a
```
Esperado: só `* main`, `remotes/origin/HEAD -> origin/main` e `remotes/origin/main`.

---

# FASE 2 — Freios e volta

## Task 4: Módulo de publicação — detectar rascunho

**Files:**
- Create: `ferramentas/Publicacao.psm1`
- Test: `tests/Publicacao.Tests.ps1`

**Interfaces:**
- Consumes: nada.
- Produces: `Test-ArquivoDeRascunho([string]$Caminho) -> [bool]`. Usada pela Task 7.

- [ ] **Step 1: Escrever o teste que falha**

Create `tests/Publicacao.Tests.ps1`:

```powershell
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
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
Invoke-Pester -Path tests\Publicacao.Tests.ps1
```
Esperado: FALHA — o módulo não existe (`Import-Module` não encontra o caminho).

- [ ] **Step 3: Implementar o mínimo**

Create `ferramentas/Publicacao.psm1`:

```powershell
# Funcoes puras de decisao usadas pelos scripts de publicacao.
#
# Puras de proposito: nenhuma toca git, rede ou disco. E o que permite
# exercitar os freios com Pester sem publicar nada.

# Rascunho e o que foi escrito para resolver um problema pontual. O padrao
# vale so para a raiz — um arquivo com nome parecido dentro de tests/ ou
# frontend/ esta onde deveria estar.
$script:PadroesRascunho = @(
    '^scratch_',
    '^temp_',
    '^temp\d*\.',
    '^patch_',
    '^patch\d+\.',
    '^check_',
    '^fix_',
    '^diag_',
    '^diag\d*\.',
    '^test_debug\d*\.js$',
    '^test\d*\.(js|py)$',
    '^test-fetch\.js$',
    '^test_api\d*\.js$',
    '^(test_browser|test_col|test_final|test_pdf)\.js$',
    '^(diff|build_log|mangled|py_out|test_out|scratch_func)\.txt$',
    '^snapshot\.jpg$',
    '^engine_backup\.py$'
)

function Test-ArquivoDeRascunho {
    [CmdletBinding()]
    [OutputType([bool])]
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Caminho)

    if ([string]::IsNullOrWhiteSpace($Caminho)) { return $false }
    # git usa barra normal em qualquer plataforma.
    if ($Caminho -match '[\\/]') { return $false }

    foreach ($padrao in $script:PadroesRascunho) {
        if ($Caminho -match $padrao) { return $true }
    }
    return $false
}

Export-ModuleMember -Function Test-ArquivoDeRascunho
```

- [ ] **Step 4: Rodar e ver passar**

```powershell
Invoke-Pester -Path tests\Publicacao.Tests.ps1
```
Esperado: `Passed: 8 Failed: 0`

- [ ] **Step 5: Commit**

```powershell
git add ferramentas/Publicacao.psm1 tests/Publicacao.Tests.ps1
git commit -m @'
feat(publicacao): funcao pura que reconhece arquivo de rascunho

Primeiro freio do publicar.ps1. Puro e testavel: os casos que mais importam
sao os negativos — test_engine_dual_vdp.py, teste_dados.csv e
Diagnostico_Fontes.ps1 nao podem ser confundidos com rascunho, senao o
alarme toca em toda publicacao e se aprende a ignora-lo.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 5: Módulo de publicação — detectar segredo

**Files:**
- Modify: `ferramentas/Publicacao.psm1`
- Modify: `tests/Publicacao.Tests.ps1`

**Interfaces:**
- Consumes: `ferramentas/Publicacao.psm1` da Task 4.
- Produces: `ConvertFrom-JwtPayload([string]$Jwt) -> [string] ou $null` e `Find-SegredoNoTexto([string]$Texto) -> [string]` (string vazia = nada encontrado; senão, a descrição do achado). Usadas pela Task 7.

**Por que a regra é essa:** a chave **anônima** do Supabase também é um JWT (`eyJ...`) e está legitimamente versionada em `frontend/supabase-config.js` — o navegador precisa dela, ela é pública por natureza. Verificado: o payload dela decodifica para `{"iss":"supabase","ref":"vwbtitjlpelrcnsytzqw","role":"anon",...}`. Um freio que barrasse todo `eyJ` dispararia em toda alteração daquele arquivo. Barrar pelo **nome** `SUPABASE_SERVICE_KEY` também não serve: `GUIA_AGENTE.md` cita esse nome como documentação. A regra correta é decodificar o payload e barrar só quando o papel for `service_role`.

- [ ] **Step 1: Escrever os testes que falham**

Append a `tests/Publicacao.Tests.ps1`:

```powershell
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

Describe "Find-SegredoNoTexto" {
    It "barra um JWT cujo papel e service_role" {
        # {"role":"service_role"} em base64url.
        $jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.assinatura'
        Find-SegredoNoTexto "SUPABASE_SERVICE_KEY=$jwt" | Should Not Be ''
    }
    It "barra service_role em texto claro num JSON de credencial" {
        Find-SegredoNoTexto '{ "role": "service_role", "key": "x" }' | Should Not Be ''
    }
    It "DEIXA PASSAR a chave anonima real do projeto" {
        # Regressao: esta chave e publica por natureza e esta versionada.
        # Um freio que a barrasse tocaria em toda alteracao do config.
        $config = Get-Content -Raw -Encoding UTF8 "$PSScriptRoot\..\frontend\supabase-config.js"
        Find-SegredoNoTexto $config | Should Be ''
    }
    It "DEIXA PASSAR o GUIA_AGENTE.md, que so cita o nome da variavel" {
        $guia = Get-Content -Raw -Encoding UTF8 "$PSScriptRoot\..\GUIA_AGENTE.md"
        Find-SegredoNoTexto $guia | Should Be ''
    }
    It "deixa passar texto comum" {
        Find-SegredoNoTexto 'def imposicao(): pass' | Should Be ''
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
Invoke-Pester -Path tests\Publicacao.Tests.ps1
```
Esperado: os 8 da Task 4 passam; os 7 novos falham com `The term 'ConvertFrom-JwtPayload' is not recognized`.

- [ ] **Step 3: Implementar**

Append a `ferramentas/Publicacao.psm1`, antes do `Export-ModuleMember`:

```powershell
function ConvertFrom-JwtPayload {
    <#
    .SYNOPSIS
        Decodifica o payload (2a parte) de um JWT. Nao valida assinatura.
    #>
    [CmdletBinding()]
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Jwt)

    $partes = $Jwt -split '\.'
    if ($partes.Count -lt 2) { return $null }

    # base64url -> base64, e repor o padding que o formato omite.
    $p = $partes[1].Replace('-', '+').Replace('_', '/')
    switch ($p.Length % 4) {
        2 { $p += '==' }
        3 { $p += '=' }
        1 { return $null }   # comprimento impossivel em base64
    }
    try {
        return [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($p))
    } catch {
        return $null
    }
}

function Find-SegredoNoTexto {
    <#
    .SYNOPSIS
        Devolve a descricao do segredo encontrado, ou string vazia.
    .DESCRIPTION
        Procura apenas a service_role key, que da controle total do banco.
        NAO barra por nome de variavel nem por "parece um JWT": a chave
        anonima do Supabase e um JWT publico e versionado de proposito, e o
        GUIA_AGENTE.md cita o nome SUPABASE_SERVICE_KEY como documentacao.
        Barrar qualquer um dos dois faria o alarme tocar sempre.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Texto)

    if ([string]::IsNullOrEmpty($Texto)) { return '' }

    $jwts = [regex]::Matches($Texto, 'eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+')
    foreach ($m in $jwts) {
        $payload = ConvertFrom-JwtPayload $m.Value
        if ($payload -and $payload -match '"role"\s*:\s*"service_role"') {
            return 'chave service_role do Supabase (JWT) — da controle total do banco'
        }
    }

    # Credencial colada em JSON/YAML sem ser um JWT completo.
    if ($Texto -match '"role"\s*:\s*"service_role"') {
        return 'service_role em texto claro'
    }

    return ''
}
```

E trocar a última linha do módulo por:

```powershell
Export-ModuleMember -Function Test-ArquivoDeRascunho, ConvertFrom-JwtPayload, Find-SegredoNoTexto
```

- [ ] **Step 4: Rodar e ver passar**

```powershell
Invoke-Pester -Path tests\Publicacao.Tests.ps1
```
Esperado: `Passed: 15 Failed: 0`

- [ ] **Step 5: Commit**

```powershell
git add ferramentas/Publicacao.psm1 tests/Publicacao.Tests.ps1
git commit -m @'
feat(publicacao): freio de segredo que decodifica o JWT antes de barrar

Barra so a service_role key, decodificando o payload do JWT. Os dois testes
que mais importam sao os negativos: a chave anonima real do projeto e o
GUIA_AGENTE.md precisam passar. Um freio que barrasse todo "eyJ" ou toda
mencao a SUPABASE_SERVICE_KEY tocaria em toda publicacao.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 6: Módulo de publicação — versões e tags

**Files:**
- Modify: `ferramentas/Publicacao.psm1`
- Modify: `tests/Publicacao.Tests.ps1`

**Interfaces:**
- Consumes: `ferramentas/Publicacao.psm1` das Tasks 4-5.
- Produces: `Get-ProximaVersao([string]$HtmlIndex) -> [int]`, `ConvertTo-TuplaVersao([string]$Texto) -> [int[]]`, `Test-VersaoMaior([string]$Nova, [string]$Atual) -> [bool]`, `Get-TagAnterior([string[]]$Tags, [string]$Referencia) -> [string]`. Usadas pelas Tasks 7, 9 e 11.

- [ ] **Step 1: Escrever os testes que falham**

Append a `tests/Publicacao.Tests.ps1`:

```powershell
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
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
Invoke-Pester -Path tests\Publicacao.Tests.ps1
```
Esperado: 15 passam, 15 falham com `is not recognized`.

- [ ] **Step 3: Implementar**

Append a `ferramentas/Publicacao.psm1`, antes do `Export-ModuleMember`:

```powershell
function Get-ProximaVersao {
    <#
    .SYNOPSIS
        Le o ?v=NNN de script.js no HTML e devolve NNN+1. Zero se nao achar.
    #>
    [CmdletBinding()]
    [OutputType([int])]
    param([Parameter(Mandatory)][AllowEmptyString()][string]$HtmlIndex)

    $m = [regex]::Match($HtmlIndex, 'script\.js\?v=(\d+)')
    if (-not $m.Success) { return 0 }
    return ([int]$m.Groups[1].Value) + 1
}

function ConvertTo-TuplaVersao {
    <#
    .SYNOPSIS
        'NewProd 1.2.5' e '1.2.5.0' viram arrays de inteiros comparaveis.
    .DESCRIPTION
        Espelha agent_version.como_tupla() em Python. Se um dos dois mudar,
        o auto-update do agente passa a discordar do publicador — mantenha
        os dois iguais.
    #>
    [CmdletBinding()]
    [OutputType([int[]])]
    param([Parameter(Mandatory)][AllowEmptyString()][string]$Texto)

    $nums = @([regex]::Matches($Texto, '\d+') | Select-Object -First 4 |
              ForEach-Object { [int]$_.Value })
    if ($nums.Count -eq 0) { return @(0) }
    return $nums
}

function Test-VersaoMaior {
    <#
    .SYNOPSIS
        True se $Nova for estritamente maior que $Atual.
    #>
    [CmdletBinding()]
    [OutputType([bool])]
    param(
        [Parameter(Mandatory)][string]$Nova,
        [Parameter(Mandatory)][string]$Atual
    )

    $a = ConvertTo-TuplaVersao $Nova
    $b = ConvertTo-TuplaVersao $Atual
    $total = [Math]::Max($a.Count, $b.Count)
    for ($i = 0; $i -lt $total; $i++) {
        $x = 0; if ($i -lt $a.Count) { $x = $a[$i] }
        $y = 0; if ($i -lt $b.Count) { $y = $b[$i] }
        if ($x -gt $y) { return $true }
        if ($x -lt $y) { return $false }
    }
    return $false
}

function Get-TagAnterior {
    <#
    .SYNOPSIS
        Dada a lista de tags vNNN, devolve a anterior a $Referencia.
    .DESCRIPTION
        Ordena por numero e nao por texto: em ordem textual 'v9' vem depois
        de 'v10', o que faria o voltar.ps1 escolher o alvo errado.
    #>
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][AllowEmptyCollection()][string[]]$Tags,
        [Parameter(Mandatory)][string]$Referencia
    )

    $ordenadas = @($Tags |
        Where-Object { $_ -match '^v\d+$' } |
        Sort-Object { [int]($_.Substring(1)) })

    $i = [array]::IndexOf($ordenadas, $Referencia)
    if ($i -lt 1) { return '' }
    return $ordenadas[$i - 1]
}
```

E atualizar a exportação:

```powershell
Export-ModuleMember -Function Test-ArquivoDeRascunho, ConvertFrom-JwtPayload,
    Find-SegredoNoTexto, Get-ProximaVersao, ConvertTo-TuplaVersao,
    Test-VersaoMaior, Get-TagAnterior
```

- [ ] **Step 4: Rodar e ver passar**

```powershell
Invoke-Pester -Path tests\Publicacao.Tests.ps1
```
Esperado: `Passed: 30 Failed: 0`

- [ ] **Step 5: Commit**

```powershell
git add ferramentas/Publicacao.psm1 tests/Publicacao.Tests.ps1
git commit -m @'
feat(publicacao): comparacao de versao e busca da tag anterior

Test-VersaoMaior espelha agent_version.como_tupla() — comparacao numerica,
para que 1.2.9 nao passe por maior que 1.2.22. Get-TagAnterior ordena por
numero pelo mesmo motivo: em ordem textual v9 vem depois de v10 e o
voltar.ps1 escolheria o alvo errado.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 7: `publicar.ps1` com freios e tag

**Files:**
- Modify: `publicar.ps1` (reescrita completa)

**Interfaces:**
- Consumes: todas as funções de `ferramentas/Publicacao.psm1` (Tasks 4-6).
- Produces: a tag `vNNN` por publicação, que a Task 9 (`voltar.ps1`) consome.

- [ ] **Step 1: Reescrever o script**

Replace o conteúdo inteiro de `publicar.ps1`:

```powershell
<#
.SYNOPSIS
    Publica o site e o motor: confere, sobe a versao dos assets, commita,
    empurra, faz o deploy na Vercel e marca a versao com uma tag.

.DESCRIPTION
    IMPORTANTE: um `git push origin main` publica DUAS coisas — o site na
    Vercel e o motor no Render, que escuta o mesmo repositorio. Nao existe
    publicar so o site por aqui.

.EXAMPLE
    .\publicar.ps1 "fix(painel): corrigir ordenacao da fila"

.PARAMETER SemFreio
    Pula as conferencias. So para emergencia — imprime aviso.
#>
param(
    [Parameter(Mandatory = $true, Position = 0,
               HelpMessage = "Mensagem do commit, ex: 'fix(painel): corrigir ordenacao da fila'")]
    [ValidateNotNullOrEmpty()]
    [string]$Mensagem,

    [switch]$SemFreio
)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $raiz
Import-Module "$raiz\ferramentas\Publicacao.psm1" -Force

function Abortar {
    param([string]$Motivo, [string]$OQueFazer)
    Write-Host ""
    Write-Host "  PAROU ANTES DE PUBLICAR" -ForegroundColor Red
    Write-Host "  $Motivo" -ForegroundColor Red
    Write-Host ""
    Write-Host "  O que fazer: $OQueFazer" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "  Nada foi ao ar. Nada precisa ser desfeito." -ForegroundColor Gray
    exit 1
}

# ── Freios ───────────────────────────────────────────────────────────────────
if ($SemFreio) {
    Write-Host "  AVISO: publicando SEM as conferencias (-SemFreio)." -ForegroundColor Yellow
} else {
    Write-Host "Conferindo antes de publicar..." -ForegroundColor Cyan

    # 1. O que vai junto.
    $mudados = @(git status --porcelain | ForEach-Object { $_.Substring(3).Trim('"') })
    if ($mudados.Count -eq 0) {
        Abortar "Nao ha nada para publicar." "Edite alguma coisa antes de rodar o publicar."
    }
    Write-Host "  $($mudados.Count) arquivo(s) vao junto:" -ForegroundColor Gray
    foreach ($f in $mudados) {
        $tam = ''
        if (Test-Path -PathType Leaf $f) {
            $mb = (Get-Item $f).Length / 1MB
            if ($mb -gt 1) { $tam = (" [{0:N1} MB — confira se e proposital]" -f $mb) }
        }
        Write-Host "    $f$tam" -ForegroundColor Gray
    }

    # 2. Rascunho.
    $rascunhos = @($mudados | Where-Object { Test-ArquivoDeRascunho $_ })
    if ($rascunhos.Count -gt 0) {
        Abortar "Arquivo de rascunho no commit: $($rascunhos -join ', ')" `
                "Mova para rascunhos/ ou, se for codigo de verdade, renomeie."
    }

    # 3. Segredo. So o conteudo que vai ao ar — arquivo apagado nao tem o que ler.
    foreach ($f in $mudados) {
        if (-not (Test-Path -PathType Leaf $f)) { continue }
        $conteudo = Get-Content -Raw -Encoding UTF8 -ErrorAction SilentlyContinue $f
        if ($null -eq $conteudo) { continue }
        $achado = Find-SegredoNoTexto $conteudo
        if ($achado -ne '') {
            Abortar "Segredo em '$f': $achado" `
                    "Tire a chave do arquivo e ponha no .env.local, que e ignorado pelo git."
        }
    }

    # 4. O motor sobe? Pega erro de sintaxe antes de o Render falhar a build.
    Write-Host "  Conferindo se o motor sobe..." -ForegroundColor Gray
    & "$raiz\venv\Scripts\python.exe" -c "import app, engine, db" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Abortar "O motor nao sobe — ha erro em app.py, engine.py ou db.py." `
                "Rode '.\venv\Scripts\python.exe -c \"import app, engine, db\"' para ver o erro."
    }
    Write-Host "  Motor OK." -ForegroundColor Green
}

# ── Versao ───────────────────────────────────────────────────────────────────
$indexFile = "frontend\index.html"
$proxima = Get-ProximaVersao (Get-Content -Raw -Encoding UTF8 $indexFile)
if ($proxima -eq 0) {
    Abortar "Nao achei 'script.js?v=NNN' em $indexFile." "Confira se o index.html esta intacto."
}

# ── Confirmacao ──────────────────────────────────────────────────────────────
if (-not $SemFreio) {
    Write-Host ""
    Write-Host "  Mensagem : $Mensagem" -ForegroundColor White
    Write-Host "  Versao   : v$proxima" -ForegroundColor White
    Write-Host "  Publica  : o SITE (Vercel) e o MOTOR (Render) — os dois, juntos." -ForegroundColor Yellow
    Write-Host ""
    $resp = Read-Host "  Publicar? (s/n)"
    if ($resp -notmatch '^[sS]') {
        Write-Host "  Cancelado. Nada foi ao ar." -ForegroundColor Gray
        exit 0
    }
}

# ── Bump dos assets ──────────────────────────────────────────────────────────
# Bumpa TODO asset local versionado (.js?v= e .css?v=) em todas as paginas, por
# padrao e nao por nome: uma lista fixa deixava style.css e criador-arte.js
# congelados, e suas alteracoes nao chegavam ao navegador de quem tinha cache.
# Os CDNs nao sao afetados — eles fixam versao no caminho, nunca em querystring.
Write-Host "Atualizando a versao dos assets para v$proxima..." -ForegroundColor Cyan
$substituicao = '.$1?v=' + $proxima
Get-ChildItem "frontend\*.html" | ForEach-Object {
    $html = Get-Content -Encoding UTF8 -Raw $_.FullName
    $novo = $html -replace '\.(js|css)\?v=\d+', $substituicao
    if ($novo -ne $html) {
        # -Raw + -NoNewline preserva o arquivo byte a byte fora as substituicoes.
        # -Path e -Value NOMEADOS: na forma posicional o -Path (string[]) engole
        # caminho e conteudo no mesmo array e falha com erro sobre 'Encoding'.
        Set-Content -Encoding UTF8 -NoNewline -Path $_.FullName -Value $novo
        Write-Host "  $($_.Name)" -ForegroundColor Gray
    }
}

# ── Git ──────────────────────────────────────────────────────────────────────
Write-Host "Commitando..." -ForegroundColor Cyan
git add -A
git commit -m "$Mensagem (v$proxima)"
if ($LASTEXITCODE -ne 0) {
    Abortar "O commit falhou." "Rode 'git status' para ver o estado."
}

git push origin main
if ($LASTEXITCODE -ne 0) {
    Abortar "O push falhou — o commit ficou so na sua maquina." `
            "Confira a conexao e rode 'git push origin main' de novo."
}

# ── Ponto de restauracao ─────────────────────────────────────────────────────
# Depois do push de proposito: a tag so marca o que ja esta no servidor.
git tag -a "v$proxima" -m "$Mensagem"
git push origin "v$proxima"
Write-Host "  Ponto de restauracao gravado: v$proxima" -ForegroundColor Green

# ── Vercel ───────────────────────────────────────────────────────────────────
Write-Host "Publicando o site na Vercel..." -ForegroundColor Cyan
Push-Location "$raiz\frontend"
try {
    vercel --prod --yes
    if ($LASTEXITCODE -ne 0) {
        Write-Host ""
        Write-Host "  O deploy da Vercel falhou, mas o codigo JA foi empurrado." -ForegroundColor Red
        Write-Host "  O motor (Render) vai atualizar mesmo assim." -ForegroundColor Red
        Write-Host "  Rode de novo so o deploy: cd frontend; vercel --prod --yes" -ForegroundColor Yellow
        exit 1
    }
} finally {
    Pop-Location
}

Write-Host ""
Write-Host "  SUCESSO — v$proxima no ar." -ForegroundColor Green
Write-Host "  https://ideal-imposition.vercel.app" -ForegroundColor Cyan
Write-Host "  Deu errado? '.\voltar.ps1 -Agora' devolve o site em segundos." -ForegroundColor Gray
```

- [ ] **Step 2: Provar que o freio de rascunho barra**

Numa cópia descartável, para não sujar o repositório real:

```powershell
$tmp = "$env:TEMP\claude\teste-freio"
Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
git clone --no-hardlinks . $tmp
Copy-Item ferramentas\Publicacao.psm1 "$tmp\ferramentas\" -Force
Set-Content -Encoding UTF8 -Path "$tmp\scratch_teste.py" -Value "print(1)"
Push-Location $tmp; git add -f scratch_teste.py; Pop-Location
Push-Location $tmp; .\publicar.ps1 "teste"; Pop-Location
```
Esperado: `PAROU ANTES DE PUBLICAR` / `Arquivo de rascunho no commit: scratch_teste.py`, código de saída 1, sem commit.

- [ ] **Step 3: Provar que o freio de segredo barra**

```powershell
Push-Location $tmp
git rm -f --cached scratch_teste.py; Remove-Item scratch_teste.py
$jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.x'
Set-Content -Encoding UTF8 -Path "config_teste.py" -Value "CHAVE = '$jwt'"
git add config_teste.py
.\publicar.ps1 "teste"
Pop-Location
```
Esperado: `Segredo em 'config_teste.py': chave service_role do Supabase (JWT)`, saída 1.

- [ ] **Step 4: Provar que o freio do motor barra**

```powershell
Push-Location $tmp
git rm -f --cached config_teste.py; Remove-Item config_teste.py
Add-Content -Encoding UTF8 -Path "app.py" -Value "def quebrado(:"
.\publicar.ps1 "teste"
Pop-Location
```
Esperado: `O motor nao sobe — ha erro em app.py, engine.py ou db.py.`, saída 1.

Obs.: o clone não tem `venv/` (está no `.gitignore`), então aponte o teste para o `venv` real ou rode este passo na raiz com o `app.py` temporariamente quebrado e **desfaça com `git checkout -- app.py`** logo em seguida.

- [ ] **Step 5: Limpar a cópia de teste**

```powershell
Remove-Item -Recurse -Force $tmp
git status --porcelain
```
Esperado: só o `publicar.ps1` modificado.

- [ ] **Step 6: Commit**

```powershell
git add publicar.ps1
git commit -m @'
feat(publicar): freios antes do commit e tag por versao publicada

Quatro conferencias que abortam ANTES de qualquer escrita — rascunho,
segredo, motor que nao sobe, e a confirmacao final — mais a tag vNNN, que
e o ponto de restauracao que nao existia. A mensagem de confirmacao diz em
uma linha o que o script antes escondia: o push publica o site E o motor.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 8: `publicar.bat` vira invólucro

**Files:**
- Modify: `publicar.bat` (reescrita completa)

**Interfaces:**
- Consumes: `publicar.ps1` da Task 7.
- Produces: nada novo.

**Por quê:** hoje o `.bat` reimplementa a lógica inteira em batch. Duas implementações da mesma coisa divergem com o tempo — o `.bat` já não ganharia nenhum dos freios da Task 7.

- [ ] **Step 1: Reescrever**

Replace o conteúdo inteiro de `publicar.bat`:

```bat
@echo off
chcp 65001 > nul
REM Invocro fino do publicar.ps1. Existe so para quem prefere clicar duas
REM vezes num .bat em vez de abrir o PowerShell.
REM
REM A logica de publicacao mora TODA no publicar.ps1. Nao reimplemente nada
REM aqui: duas versoes da mesma coisa divergem, e foi o que aconteceu antes.
cd /d "%~dp0"

set "MSG=%~1"
if "%MSG%"=="" set /p "MSG=Mensagem do commit: "
if "%MSG%"=="" (
    echo Mensagem vazia. Cancelado.
    pause
    exit /b 1
)

powershell -ExecutionPolicy Bypass -NoProfile -File "%~dp0publicar.ps1" -Mensagem "%MSG%"
pause
```

- [ ] **Step 2: Conferir que ele chama o script certo e cancela sem publicar**

```powershell
cmd /c "publicar.bat ""teste de invocacao"" < nul"
```
Esperado: aparecem os freios e a pergunta `Publicar? (s/n)`; com a entrada vazia o script sai com `Cancelado. Nada foi ao ar.` Confirme com `git log --oneline -1` que nenhum commit novo apareceu.

- [ ] **Step 3: Commit**

```powershell
git add publicar.bat
git commit -m @'
refactor(publicar): .bat vira invocro fino do .ps1

O .bat reimplementava a logica inteira em batch e nao teria nenhum dos
freios novos. Duas implementacoes da mesma coisa divergem com o tempo.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 9: `voltar.ps1`

**Files:**
- Create: `voltar.ps1`

**Interfaces:**
- Consumes: `Get-TagAnterior` da Task 6; as tags `vNNN` das Tasks 1 e 7; `publicar.ps1` da Task 7.
- Produces: nada que outra task consuma.

- [ ] **Step 1: Escrever o script**

Create `voltar.ps1`:

```powershell
<#
.SYNOPSIS
    Volta a aplicacao para uma versao anterior. Dois niveis.

.DESCRIPTION
    FREIO DE MAO (-Agora): devolve SO O SITE ao deploy anterior, em segundos.
    O motor nao volta e o codigo do git segue adiantado. E curativo para o
    cliente parar de ver erro agora, nao a correcao.

    VOLTA DE VERDADE (sem parametro): desfaz as mudancas no codigo com
    `git revert` e republica site e motor juntos, consistentes.

    Nunca usa `reset --hard`: nada e apagado, a volta vira um commit novo e
    da para voltar da volta.

.EXAMPLE
    .\voltar.ps1 -Agora      # emergencia: so o site, ~30 s
.EXAMPLE
    .\voltar.ps1             # volta de verdade, para a versao anterior
.EXAMPLE
    .\voltar.ps1 v487        # volta de verdade, para uma versao especifica
#>
param(
    [Parameter(Position = 0)]
    [string]$Tag,

    [switch]$Agora
)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $raiz
Import-Module "$raiz\ferramentas\Publicacao.psm1" -Force

# ── Freio de mao ─────────────────────────────────────────────────────────────
if ($Agora) {
    Write-Host ""
    Write-Host "  FREIO DE MAO — devolve so o SITE ao deploy anterior." -ForegroundColor Yellow
    Write-Host "  O MOTOR (Render) nao volta. O codigo do git segue adiantado." -ForegroundColor Yellow
    Write-Host ""
    $resp = Read-Host "  Continuar? (s/n)"
    if ($resp -notmatch '^[sS]') { Write-Host "  Cancelado."; exit 0 }

    Push-Location "$raiz\frontend"
    try {
        vercel rollback --yes
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  O rollback falhou. Use o painel: vercel.com -> Deployments -> Promote." -ForegroundColor Red
            exit 1
        }
    } finally { Pop-Location }

    Write-Host ""
    Write-Host "  Site devolvido." -ForegroundColor Green
    Write-Host "  ISTO E UM CURATIVO. Rode '.\voltar.ps1' (sem -Agora) para" -ForegroundColor Yellow
    Write-Host "  voltar o motor tambem e deixar tudo consistente." -ForegroundColor Yellow
    exit 0
}

# ── Volta de verdade ─────────────────────────────────────────────────────────
$todas = @(git tag -l 'v*')
if ($todas.Count -eq 0) {
    Write-Host "  Nao ha nenhuma tag — nao existe versao marcada para voltar." -ForegroundColor Red
    exit 1
}
$ordenadas = @($todas | Where-Object { $_ -match '^v\d+$' } |
                Sort-Object { [int]($_.Substring(1)) })
$atual = $ordenadas[-1]

if ([string]::IsNullOrWhiteSpace($Tag)) {
    $Tag = Get-TagAnterior $ordenadas $atual
    if ($Tag -eq '') {
        Write-Host "  So existe uma versao marcada ($atual). Nao ha para onde voltar." -ForegroundColor Red
        exit 1
    }
}
if ($ordenadas -notcontains $Tag) {
    Write-Host "  A versao '$Tag' nao existe. Versoes marcadas:" -ForegroundColor Red
    Write-Host "  $(($ordenadas | Select-Object -Last 10) -join '  ')" -ForegroundColor Gray
    exit 1
}

Write-Host ""
Write-Host "  Versao no ar : $atual" -ForegroundColor White
Write-Host "  Voltar para  : $Tag" -ForegroundColor White
Write-Host ""
Write-Host "  O que vai ser desfeito:" -ForegroundColor Cyan
git log --oneline "$Tag..HEAD"
Write-Host ""
Write-Host "  Nada e apagado: a volta vira um commit novo e da para voltar dela." -ForegroundColor Gray
$resp = Read-Host "  Confirma? (s/n)"
if ($resp -notmatch '^[sS]') { Write-Host "  Cancelado. Nada mudou."; exit 0 }

git revert --no-commit "$Tag..HEAD"
if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "  O revert deu conflito — arquivos foram mudados nos dois lados." -ForegroundColor Red
    Write-Host "  Para desistir e nao mudar nada: git revert --abort" -ForegroundColor Yellow
    exit 1
}

Write-Host "  Republicando site e motor na versao de $Tag..." -ForegroundColor Cyan
& "$raiz\publicar.ps1" -Mensagem "revert: volta para $Tag"
```

- [ ] **Step 2: Provar o revert numa branch descartável**

```powershell
git checkout -b teste-voltar
"linha que deveria sumir" | Add-Content -Encoding UTF8 frontend\index.html
git add -A; git commit -m "teste: mudanca a ser revertida"
git tag -a v999 -m "teste"
git revert --no-commit "v490..HEAD"
Select-String -Path frontend\index.html -Pattern "linha que deveria sumir"
```
Esperado: **nenhuma correspondência** — o revert desfez a linha.

- [ ] **Step 3: Limpar o teste**

```powershell
git revert --abort
git checkout main
git branch -D teste-voltar
git tag -d v999
git status --porcelain
```
Esperado: só o `voltar.ps1` novo, não rastreado. A tag `v999` nunca foi empurrada.

- [ ] **Step 4: Conferir que `vercel rollback` existe nesta CLI**

```powershell
vercel rollback --help
```
Esperado: a ajuda do comando. **Não execute o rollback de verdade.**

- [ ] **Step 5: Commit**

```powershell
git add voltar.ps1
git commit -m @'
feat(voltar): caminho de volta em dois niveis

-Agora e o freio de mao: devolve so o site pela Vercel em segundos, e diz
na cara que o motor nao voltou. Sem parametro e a volta de verdade: revert
ate a tag alvo e republica site e motor juntos.

Sempre revert, nunca reset --hard. Nada e apagado e da para voltar da volta.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
'@
```

---

# FASE 3 — Release do agente

## Task 10: Módulo de versão do agente

**Files:**
- Create: `ferramentas/VersaoAgente.psm1`
- Test: `tests/VersaoAgente.Tests.ps1`

**Interfaces:**
- Consumes: nada.
- Produces: `Update-VersaoAgentPy`, `Update-VersaoWxs`, `Update-VersaoCompilar` — todas com assinatura `([string]$Texto, [string]$Versao) -> [string]`, lançando exceção se o padrão não for encontrado. Usadas pela Task 11.

**A armadilha do `.wxs`:** o arquivo tem `Version="1.2.22.0"` na linha 10 e **`InstallerVersion="300"` na linha 14**. Um regex `Version="[\d.]+"` casa com os dois e corromperia o instalador. O padrão exige quatro partes numéricas e nenhuma letra imediatamente antes de `Version`.

- [ ] **Step 1: Escrever os testes que falham**

Create `tests/VersaoAgente.Tests.ps1`:

```powershell
Import-Module "$PSScriptRoot\..\ferramentas\VersaoAgente.psm1" -Force

Describe "Update-VersaoAgentPy" {
    It "troca o AGENT_VERSION" {
        $antes = 'AGENT_VERSION = "1.2.22"'
        Update-VersaoAgentPy $antes '1.2.23' | Should Be 'AGENT_VERSION = "1.2.23"'
    }
    It "reclama quando nao acha o padrao" {
        { Update-VersaoAgentPy 'nada aqui' '1.2.23' } | Should Throw
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
    It "NAO toca em InstallerVersion — corromperia o instalador" {
        Update-VersaoWxs '<Package InstallerVersion="300" />' '1.2.23' |
            Should Be '<Package InstallerVersion="300" />'
    }
    It "no arquivo real, troca a Version e preserva InstallerVersion" {
        $txt = Get-Content -Raw -Encoding UTF8 "$PSScriptRoot\..\agent_installer.wxs"
        $novo = Update-VersaoWxs $txt '9.9.9'
        ($novo -match 'Version="9\.9\.9\.0"') | Should Be $true
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
        { Update-VersaoCompilar 'nada aqui' '1.2.23' } | Should Throw
    }
}
```

- [ ] **Step 2: Rodar e ver falhar**

```powershell
Invoke-Pester -Path tests\VersaoAgente.Tests.ps1
```
Esperado: FALHA — o módulo não existe.

- [ ] **Step 3: Implementar**

Create `ferramentas/VersaoAgente.psm1`:

```powershell
# Reescreve o numero da versao do agente nos tres formatos de arquivo.
#
# Funcoes puras: recebem e devolvem texto, nao tocam disco. E o que permite
# testar contra os arquivos reais sem risco de corrompe-los.
#
# Cada uma LANCA se nao achar o padrao. Silenciar aqui seria pior que falhar:
# um arquivo nao atualizado significa MSI que o Windows recusa instalar, ou
# auto-update que nunca dispara.

function Update-VersaoAgentPy {
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][string]$Texto,
        [Parameter(Mandatory)][string]$Versao
    )
    $padrao = 'AGENT_VERSION\s*=\s*"[\d.]+"'
    if ($Texto -notmatch $padrao) {
        throw "Nao achei 'AGENT_VERSION = \"...\"' em agent_version.py."
    }
    return [regex]::Replace($Texto, $padrao, "AGENT_VERSION = `"$Versao`"")
}

function Update-VersaoWxs {
    [CmdletBinding()]
    [OutputType([string])]
    param(
        [Parameter(Mandatory)][string]$Texto,
        [Parameter(Mandatory)][string]$Versao
    )
    # (?<![A-Za-z]) impede casar com InstallerVersion="300"; exigir quatro
    # partes numericas e a segunda barreira contra o mesmo acidente.
    $padrao = '(?<![A-Za-z])Version="\d+\.\d+\.\d+\.\d+"'
    if ($Texto -notmatch $padrao) {
        throw "Nao achei 'Version=\"X.Y.Z.0\"' em agent_installer.wxs."
    }
    return [regex]::Replace($Texto, $padrao, "Version=`"$Versao.0`"")
}

function Update-VersaoCompilar {
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

Export-ModuleMember -Function Update-VersaoAgentPy, Update-VersaoWxs, Update-VersaoCompilar
```

- [ ] **Step 4: Rodar e ver passar**

```powershell
Invoke-Pester -Path tests\VersaoAgente.Tests.ps1
```
Esperado: `Passed: 8 Failed: 0`

- [ ] **Step 5: Confirmar que os arquivos reais não foram tocados**

```powershell
git status --porcelain agent_version.py agent_installer.wxs compilar_msi.ps1
```
Esperado: vazio. As funções são puras; os testes leram, não escreveram.

- [ ] **Step 6: Commit**

```powershell
git add ferramentas/VersaoAgente.psm1 tests/VersaoAgente.Tests.ps1
git commit -m @'
feat(agente): funcoes puras que reescrevem a versao nos tres arquivos

O numero da versao vive em tres lugares que precisam bater; errar um
significa MSI que o Windows recusa ou auto-update que nunca dispara.

O teste que mais importa e o do .wxs: o arquivo tem InstallerVersion="300"
quatro linhas abaixo da Version, e um regex ingenuo de Version= casaria com
os dois e corromperia o instalador.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 11: `publicar_agente.ps1`

**Files:**
- Create: `publicar_agente.ps1`

**Interfaces:**
- Consumes: `Test-VersaoMaior` (Task 6); `Update-VersaoAgentPy`, `Update-VersaoWxs`, `Update-VersaoCompilar` (Task 10); as constantes `RELEASES_BASE_URL` e `SUPABASE_PROJETO` de `security_config.py`.
- Produces: a tag `agente-vX.Y.Z`.

- [ ] **Step 1: Escrever o script**

Create `publicar_agente.ps1`:

```powershell
<#
.SYNOPSIS
    Publica uma versao nova do NewProd Agent, do numero ao manifesto.

.DESCRIPTION
    Executa a lista inteira do GUIA_AGENTE.md, na ordem obrigatoria:
    sobe o MSI -> confere o sha256 baixando pela URL publica -> so entao
    publica o latest.json. Assim o manifesto nunca aponta para um arquivo
    ausente ou corrompido.

    VOLTAR A VERSAO: republicar o MSI antigo com o numero antigo NAO FAZ
    NADA — o agente so instala versao MAIOR que a dele, entao todas as
    estacoes ignoram. Voltar e compilar o codigo antigo com numero novo:
        .\publicar_agente.ps1 1.2.24 -Codigo agente-v1.2.22

.EXAMPLE
    .\publicar_agente.ps1 1.2.23 -Notas "corrige fonte no verso"
.EXAMPLE
    .\publicar_agente.ps1 1.2.23 -Simular
#>
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidatePattern('^\d+\.\d+\.\d+$')]
    [string]$Versao,

    [string]$Notas = "",
    [string]$Codigo = "",
    [switch]$Simular
)

$ErrorActionPreference = "Stop"
$raiz = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $raiz
Import-Module "$raiz\ferramentas\Publicacao.psm1"   -Force
Import-Module "$raiz\ferramentas\VersaoAgente.psm1" -Force

function Abortar {
    param([string]$Motivo, [string]$OQueFazer = "")
    Write-Host ""
    Write-Host "  PAROU: $Motivo" -ForegroundColor Red
    if ($OQueFazer) { Write-Host "  O que fazer: $OQueFazer" -ForegroundColor Yellow }
    exit 1
}

if ($Simular) {
    Write-Host "  MODO SIMULACAO — nada sera enviado ao bucket." -ForegroundColor Yellow
}

# ── 1. A versao precisa ser maior ────────────────────────────────────────────
$atualTxt = Get-Content -Raw -Encoding UTF8 "$raiz\agent_version.py"
$mAtual = [regex]::Match($atualTxt, 'AGENT_VERSION\s*=\s*"([\d.]+)"')
if (-not $mAtual.Success) { Abortar "Nao consegui ler a versao atual de agent_version.py." }
$atual = $mAtual.Groups[1].Value

if (-not (Test-VersaoMaior $Versao $atual)) {
    Abortar "A versao $Versao nao e maior que a atual ($atual)." `
            "O agente so instala versao MAIOR. Escolha um numero acima de $atual."
}
Write-Host "  Versao atual: $atual  ->  nova: $Versao" -ForegroundColor Cyan

# ── 2. Voltar versao: trazer o codigo de uma tag antiga ──────────────────────
if ($Codigo -ne "") {
    $sujo = @(git status --porcelain)
    if ($sujo.Count -gt 0) {
        Abortar "Ha trabalho nao commitado." "Commite ou guarde antes de compilar de outra tag."
    }
    Write-Host "  Trazendo o codigo do agente da tag $Codigo..." -ForegroundColor Cyan
    git checkout $Codigo -- agent_tray.py agent_worker.py app.py db.py engine.py `
                            font_cache.py print_service.py security_config.py `
                            ppd_parser.py utils_generator.py agent_tray.spec
    if ($LASTEXITCODE -ne 0) { Abortar "Nao consegui trazer o codigo de $Codigo." }
}

# ── 3. Escrever a versao nos tres arquivos ───────────────────────────────────
Write-Host "  Escrevendo a versao nos tres arquivos..." -ForegroundColor Cyan
$alvos = @(
    @{ Arquivo = "agent_version.py";     Funcao = { param($t) Update-VersaoAgentPy   $t $Versao } },
    @{ Arquivo = "agent_installer.wxs";  Funcao = { param($t) Update-VersaoWxs       $t $Versao } },
    @{ Arquivo = "compilar_msi.ps1";     Funcao = { param($t) Update-VersaoCompilar  $t $Versao } }
)
foreach ($alvo in $alvos) {
    $caminho = Join-Path $raiz $alvo.Arquivo
    $texto = Get-Content -Raw -Encoding UTF8 $caminho
    $novo = & $alvo.Funcao $texto
    Set-Content -Encoding UTF8 -NoNewline -Path $caminho -Value $novo
    Write-Host "    $($alvo.Arquivo)" -ForegroundColor Gray
}

# ── 4. Compilar ──────────────────────────────────────────────────────────────
# Sem `2>&1`: o PyInstaller escreve em stderr mesmo com sucesso e, no PS 5.1,
# a redirecao transforma cada linha em erro terminante.
Write-Host "  Compilando o executavel..." -ForegroundColor Cyan
& "$raiz\venv\Scripts\python.exe" -m PyInstaller --clean --noconfirm agent_tray.spec
if ($LASTEXITCODE -ne 0) { Abortar "O PyInstaller falhou." }

Write-Host "  Gerando o MSI..." -ForegroundColor Cyan
& "$raiz\compilar_msi.ps1"
if ($LASTEXITCODE -ne 0) { Abortar "A geracao do MSI falhou." }

$msi = "$raiz\dist\NewProd_Setup_v$Versao.msi"
if (-not (Test-Path $msi)) { Abortar "Nao achei $msi depois de compilar." }

# ── 5. Conferir o pacote ─────────────────────────────────────────────────────
$tamanho = (Get-Item $msi).Length
$mb = [math]::Round($tamanho / 1MB, 2)
if ($tamanho -ge 50MB) {
    Abortar "O MSI tem $mb MB — o teto de upload do projeto e 50 MB." `
            "Enxugue o pacote (ppds ~5 MB, cryptography ~10 MB) ou suba o teto do plano."
}
Write-Host "  MSI: $mb MB (teto 50 MB)" -ForegroundColor Green

$sha = (Get-FileHash -Algorithm SHA256 $msi).Hash.ToLower()
Write-Host "  sha256 local: $sha" -ForegroundColor Gray

if ($Simular) {
    Write-Host ""
    Write-Host "  SIMULACAO CONCLUIDA. Nada foi enviado." -ForegroundColor Green
    Write-Host "  Desfaca a mudanca de versao com: git checkout -- agent_version.py agent_installer.wxs compilar_msi.ps1" -ForegroundColor Yellow
    exit 0
}

# ── 6. Subir o MSI ───────────────────────────────────────────────────────────
# A URL vem de security_config.py de proposito: um literal duplicado aqui
# divergiria da constante compilada no binario do agente.
$baseUrl = (& "$raiz\venv\Scripts\python.exe" -c "import security_config; print(security_config.RELEASES_BASE_URL)").Trim()
if ([string]::IsNullOrWhiteSpace($baseUrl)) { Abortar "Nao consegui ler RELEASES_BASE_URL de security_config.py." }

$chave = $null
foreach ($linha in Get-Content -Encoding UTF8 "$raiz\.env.local") {
    if ($linha -match '^\s*SUPABASE_SERVICE_KEY\s*=\s*(.+)\s*$') { $chave = $Matches[1].Trim().Trim('"') }
}
if (-not $chave) { Abortar "SUPABASE_SERVICE_KEY nao esta no .env.local." "Pegue em Project Settings -> API." }

$nomeObjeto = "NewProd_Setup_v$Versao.msi"
$urlUpload = "$baseUrl$nomeObjeto" -replace '/object/public/', '/object/'
Write-Host "  Enviando o MSI..." -ForegroundColor Cyan
Invoke-RestMethod -Method Post -Uri $urlUpload `
    -Headers @{ Authorization = "Bearer $chave"; "Content-Type" = "application/octet-stream" } `
    -InFile $msi | Out-Null

# ── 7. Conferir baixando pela URL publica ────────────────────────────────────
# Pela URL SIMPLES, sem cache-buster: e a que o agente usa, e e ela que
# precisa bater. O nome nunca e reaproveitado porque o CDN da Cloudflare
# continuaria servindo o binario anterior.
Write-Host "  Baixando de volta para conferir o sha256..." -ForegroundColor Cyan
$baixado = Join-Path $env:TEMP "conferencia_$nomeObjeto"
Invoke-WebRequest -Uri "$baseUrl$nomeObjeto" -OutFile $baixado -UseBasicParsing
$shaRemoto = (Get-FileHash -Algorithm SHA256 $baixado).Hash.ToLower()
Remove-Item $baixado -Force

if ($shaRemoto -ne $sha) {
    Abortar "O sha256 do arquivo no servidor nao bate com o local." `
            "NAO publique o manifesto. Suba a versao e refaca — nunca reaproveite o nome do arquivo."
}
Write-Host "  sha256 confere." -ForegroundColor Green

# ── 8. So agora o manifesto ──────────────────────────────────────────────────
$manifesto = [ordered]@{
    version = $Versao
    url     = "$baseUrl$nomeObjeto"
    sha256  = $sha
    size    = $tamanho
    notes   = $Notas
} | ConvertTo-Json

# Parenteses explicitos: sem eles a precedencia entre + e -replace fica
# ambigua para quem le, mesmo que o PowerShell resolva a favor do +.
$urlManifesto = ("$baseUrl" + "latest.json") -replace '/object/public/', '/object/'
Write-Host "  Publicando o manifesto..." -ForegroundColor Cyan
Invoke-RestMethod -Method Post -Uri $urlManifesto `
    -Headers @{ Authorization = "Bearer $chave"; "Content-Type" = "application/json"; "x-upsert" = "true" } `
    -Body $manifesto | Out-Null

# ── 9. Registrar ─────────────────────────────────────────────────────────────
git add agent_version.py agent_installer.wxs compilar_msi.ps1
git commit -m "chore(agente): versao $Versao"
git tag -a "agente-v$Versao" -m "$Notas"
git push origin main
git push origin "agente-v$Versao"

Write-Host ""
Write-Host "  Agente $Versao publicado." -ForegroundColor Green
Write-Host "  As estacoes checam a cada 30 min; para forcar, use o menu da bandeja." -ForegroundColor Gray
```

- [ ] **Step 2: Simular do começo ao fim**

```powershell
.\publicar_agente.ps1 1.2.23 -Simular
```
Esperado: a versão é escrita nos três arquivos, o exe e o MSI são compilados, o tamanho aparece abaixo de 50 MB, o sha256 local é impresso e o script encerra em `SIMULACAO CONCLUIDA. Nada foi enviado.`

- [ ] **Step 3: Conferir a `ProductVersion` dentro do MSI gerado**

```powershell
$wi = New-Object -ComObject WindowsInstaller.Installer
$db = $wi.GetType().InvokeMember('OpenDatabase', 'InvokeMethod', $null, $wi, @("$PWD\dist\NewProd_Setup_v1.2.23.msi", 0))
$v = $db.GetType().InvokeMember('OpenView', 'InvokeMethod', $null, $db, @("SELECT Value FROM Property WHERE Property='ProductVersion'"))
$v.GetType().InvokeMember('Execute', 'InvokeMethod', $null, $v, $null)
$r = $v.GetType().InvokeMember('Fetch', 'InvokeMethod', $null, $v, $null)
$r.GetType().InvokeMember('StringData', 'GetProperty', $null, $r, 1)
```
Esperado: `1.2.23.0`

- [ ] **Step 4: Confirmar que a simulação não publicou nada e desfazer a versão**

```powershell
Invoke-WebRequest -Uri "https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/agent-releases/latest.json?t=$([int](Get-Date -UFormat %s))" -UseBasicParsing | Select-Object -ExpandProperty Content
```
Esperado: o manifesto ainda diz `"version": "1.2.22"`.

```powershell
git checkout -- agent_version.py agent_installer.wxs compilar_msi.ps1
git status --porcelain
```
Esperado: só o `publicar_agente.ps1` novo, não rastreado.

- [ ] **Step 5: Commit**

```powershell
git add publicar_agente.ps1
git commit -m @'
feat(agente): script unico de release, da versao ao manifesto

Automatiza a lista do GUIA_AGENTE.md e, principalmente, a ORDEM: sobe o MSI,
confere o sha256 baixando pela URL publica que o agente usa, e so entao
publica o latest.json. Invertida, essa ordem faz todas as estacoes recusarem
a instalacao.

Recusa versao que nao seja maior que a atual, com a mesma comparacao que o
agente usa. -Simular faz tudo menos publicar. -Codigo <tag> compila o codigo
de uma tag antiga com numero novo, que e a unica forma de voltar a versao.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 12: Documentar o release e a volta no `GUIA_AGENTE.md`

**Files:**
- Modify: `GUIA_AGENTE.md` (seções "Compilar", "Publicar um release" e "Checklist de release")

**Interfaces:**
- Consumes: `publicar_agente.ps1` da Task 11.
- Produces: nada que outra task consuma.

- [ ] **Step 1: Substituir a seção "✅ Checklist de release"**

Troque o bloco de 6 itens numerados ao final do arquivo por:

```markdown
## ✅ Publicar um release

```powershell
.\publicar_agente.ps1 1.2.23 -Notas "corrige a fonte no verso"
```

O script executa a lista inteira e **para** se qualquer passo falhar: recusa
versão que não seja maior que a atual, escreve o número nos três arquivos,
compila, confere o tamanho e a `ProductVersion`, sobe o MSI, **baixa de volta
pela URL pública e confere o sha256**, e só então publica o `latest.json`.
Ao final, commita e cria a tag `agente-v1.2.23`.

Use `-Simular` para executar tudo menos os envios.

A lista manual continua descrita acima, nas seções de compilação e de
manifesto, para quando for preciso entender ou depurar o que o script faz.

## ⏮️ Voltar a versão do agente

**Republicar o MSI antigo com o número antigo não faz nada.** O agente só
instala versão **maior** que a dele (`agent_worker.consultar_manifesto()`),
então todas as estações ignoram silenciosamente — e o sintoma é o pior
possível: nenhum erro, nenhuma mudança, e a impressão de que o release
funcionou.

Voltar é compilar o código antigo com um número **novo**:

```powershell
.\publicar_agente.ps1 1.2.24 -Codigo agente-v1.2.22
```

O `-Codigo` traz os arquivos do agente da tag indicada, e o `1.2.24` é o
número que faz as estações aceitarem. O resultado é a 1.2.22 rodando sob o
nome 1.2.24.
```

- [ ] **Step 2: Conferir que o documento não ficou se contradizendo**

Leia a seção "🔢 Versão: quatro pontos que precisam bater" e acrescente, logo após a tabela:

```markdown
> O `publicar_agente.ps1` escreve os três primeiros automaticamente e falha se
> não encontrar o padrão esperado em algum deles. O `agent_tray.spec` continua
> manual — ele só muda quando entra um módulo Python novo.
```

- [ ] **Step 3: Commit**

```powershell
git add GUIA_AGENTE.md
git commit -m @'
docs(agente): publicar por script, e como voltar a versao

A checklist manual vira uma linha de comando. E fica escrito o que nao
estava em lugar nenhum: republicar o MSI antigo com o numero antigo e
ignorado por todas as estacoes, sem erro nenhum — voltar exige numero novo
com codigo antigo.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
'@
```

---

# FASE 4 — O manual

## Task 13: `docs/PUBLICAR.md`

**Files:**
- Create: `docs/PUBLICAR.md`
- Delete: `docs/DEPLOY.md`
- Modify: `DEPLOY.md` (vira ponteiro)

**Interfaces:**
- Consumes: tudo das Tasks 1-12.
- Produces: nada.

- [ ] **Step 1: Escrever o manual**

Create `docs/PUBLICAR.md`:

````markdown
# Publicar o Ideal Imposition

Este é o único documento sobre publicação. Se outro texto discordar dele, ele
está velho.

## As três peças

| Peça | O que é | Onde roda |
|---|---|---|
| **Site** | as telas que você abre no navegador | Vercel |
| **Motor** | quem monta o PDF e faz a imposição | Render |
| **Agente** | o `NewProd.exe` no computador da gráfica | a própria estação |

**Site e motor andam juntos.** Publicar manda os dois. Não existe publicar só
um dos dois por aqui — e é bom que seja assim: eles precisam combinar.

**O agente é separado.** Tem número próprio (`1.2.22`) e sai por outro comando.

## Publicar

```powershell
.\publicar.ps1 "descreva o que mudou"
```

Antes de mandar qualquer coisa, o script confere quatro coisas e mostra o
resultado. Se algo estiver errado ele **para antes do commit** — nada foi ao ar
e nada precisa ser desfeito:

1. **O que vai junto** — a lista de arquivos, com aviso em arquivo grande.
2. **Rascunho** — recusa `scratch_*`, `temp_*` e afins.
3. **Segredo** — recusa a chave `service_role`, que dá controle total do banco.
4. **O motor sobe** — testa se o Python carrega sem erro.

Depois ele pergunta `Publicar? (s/n)`. Esse é o último freio, e é seu.

Ao terminar, grava um **ponto de restauração** com o número da versão (`v491`).
É o que torna possível voltar depois.

Para ver os pontos de restauração que existem:

```powershell
git tag -l
```

## Voltar

### Está pegando fogo agora

```powershell
.\voltar.ps1 -Agora
```

Devolve **só o site** à versão anterior, em cerca de 30 segundos. O motor não
volta. É curativo, não correção — use quando o cliente está vendo erro *neste
minuto*, e depois faça a volta de verdade.

### Volta de verdade

```powershell
.\voltar.ps1
```

Desfaz as mudanças e republica site e motor juntos, na versão anterior. Para
uma versão específica:

```powershell
.\voltar.ps1 v487
```

O script mostra o que vai ser desfeito e pergunta antes.

**Nada é apagado.** A volta vira um registro novo, então dá para voltar da
volta. Se algo der conflito, o script diz como desistir sem mudar nada.

## Publicar o agente

```powershell
.\publicar_agente.ps1 1.2.23 -Notas "o que mudou"
```

Para ensaiar sem publicar nada: acrescente `-Simular`.

**Para voltar a versão do agente**, o número precisa ser **novo**:

```powershell
.\publicar_agente.ps1 1.2.24 -Codigo agente-v1.2.22
```

Republicar o número antigo não faz nada — as estações só aceitam número maior
que o delas, e ignoram em silêncio. Detalhes em [GUIA_AGENTE.md](../GUIA_AGENTE.md).

## Quando dá errado

| O que você vê | Causa provável | O que fazer |
|---|---|---|
| `PAROU ANTES DE PUBLICAR` | um dos quatro freios | leia a linha "O que fazer" na tela — nada foi ao ar |
| O site abre, mas com erro em tudo | o motor não subiu no Render | veja os logs em dashboard.render.com; se persistir, `.\voltar.ps1` |
| A tela é a antiga mesmo depois de publicar | cache do navegador | `Ctrl+Shift+R`; se persistir, confira se a versão em `frontend/index.html` subiu |
| `O push falhou` | sem internet, ou alguém publicou antes | `git pull --rebase origin main` e publique de novo |
| `O deploy da Vercel falhou` | erro só no site — o código já foi empurrado | `cd frontend; vercel --prod --yes` |
| O agente não atualiza na estação | número igual ou menor que o instalado | publique com número **maior**; veja "Voltar a versão do agente" |
| Uma estação ficou para trás | ela checa a cada 30 min | menu da bandeja → "Atualizar agora" |

## Onde ficam as coisas

- **Chaves e segredos:** `.env.local`, que o git ignora. Nunca ponha chave em
  arquivo versionado. A chave *anônima* em `frontend/supabase-config.js` é
  exceção proposital — ela é pública por natureza, o navegador precisa dela.
- **Banco e arquivos:** Supabase (`vwbtitjlpelrcnsytzqw`).
- **Rascunhos:** `rascunhos/`, fora do git.
- **Instaladores do agente:** bucket `agent-releases` no Supabase Storage.
````

- [ ] **Step 2: Apagar o `docs/DEPLOY.md` obsoleto**

Ele descreve Firebase + Hosting, arquitetura que o projeto não usa mais. Dois manuais que discordam são piores que nenhum.

```powershell
git rm docs/DEPLOY.md
```

- [ ] **Step 3: Transformar o `DEPLOY.md` da raiz em ponteiro**

Replace o conteúdo inteiro de `DEPLOY.md`:

```markdown
# Deploy

O guia de publicação do dia a dia — como publicar, como voltar e o que fazer
quando dá errado — está em **[docs/PUBLICAR.md](docs/PUBLICAR.md)**.

Para a instalação inicial da infraestrutura do zero (criar o projeto no
Supabase, o serviço no Render, o projeto na Vercel), veja o histórico deste
arquivo antes de 2026-08-09 — ele não é necessário para operar o que já está
no ar.
```

- [ ] **Step 4: Conferir que os links funcionam**

```powershell
Test-Path docs\PUBLICAR.md
Test-Path GUIA_AGENTE.md
Test-Path docs\DEPLOY.md
```
Esperado: `True`, `True`, `False`.

- [ ] **Step 5: Rodar toda a suíte uma última vez**

```powershell
Invoke-Pester -Path tests\Publicacao.Tests.ps1, tests\VersaoAgente.Tests.ps1
```
Esperado: `Passed: 38 Failed: 0`

- [ ] **Step 6: Commit**

```powershell
git add docs/PUBLICAR.md DEPLOY.md docs/DEPLOY.md
git commit -m @'
docs: manual unico de publicacao, no lugar dos dois DEPLOY.md que discordavam

O docs/DEPLOY.md descrevia Firebase + Hosting, arquitetura abandonada; o da
raiz descrevia Supabase + Vercel + Render. Dois manuais que se contradizem
sao piores que nenhum.

O docs/PUBLICAR.md e escrito para quem esta aprendendo: o que e cada peca,
como publicar, como voltar nos dois niveis, e uma tabela de sintoma -> o que
fazer.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
'@
```

---

## Verificação final (depois da Task 13)

- [ ] `Invoke-Pester -Path tests\Publicacao.Tests.ps1, tests\VersaoAgente.Tests.ps1` → 38 passam, 0 falham
- [ ] `git tag -l` → mostra `v490` e as versões publicadas desde então
- [ ] `git branch -a` → só `main`
- [ ] `(git ls-files | Where-Object { $_ -notmatch '/' }).Count` → em torno de 60
- [ ] `.\venv\Scripts\python.exe -c "import app, engine, db"` → sai com 0
- [ ] Subir o app pela skill `rodar-app` e abrir o painel → carrega com dados
- [ ] `.\publicar.ps1 "chore: primeira publicacao com os freios novos"` → freios rodam, pergunta, publica e grava a tag
