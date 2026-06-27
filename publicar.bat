@echo off
chcp 65001 > nul
setlocal EnableDelayedExpansion

cd /d "C:\Users\Junior\Projetos Ingresso ideal\ideal-imposition"

echo.
echo ╔══════════════════════════════════════════════╗
echo ║       PUBLICAR — Ideal Imposition            ║
echo ╚══════════════════════════════════════════════╝
echo.

REM ── 1. Ler versão atual do index.html ──────────────────────────────────────
set "INDEX=frontend\index.html"
set "CURRENT_V=0"

for /f "tokens=*" %%L in ('findstr /i "script.js?v=" "%INDEX%"') do (
    set "LINE=%%L"
    for /f "tokens=2 delims==>" %%A in ("!LINE!") do (
        set "VPART=%%A"
        for /f "tokens=1 delims=""" %%B in ("!VPART!") do (
            set "VSTR=%%B"
        )
    )
)

REM Extrair número depois de ?v=
for /f "tokens=2 delims==" %%V in ('echo !LINE! ^| findstr /o "v=[0-9]*"') do set "CURRENT_V=%%V"

REM Jeito mais direto: usar PowerShell para extrair e incrementar
for /f %%V in ('powershell -NoProfile -Command "(Select-String -Path '%INDEX%' -Pattern 'script\.js\?v=(\d+)').Matches[0].Groups[1].Value"') do set "CURRENT_V=%%V"
set /a "NEXT_V=CURRENT_V+1"

echo  Versão atual : v%CURRENT_V%
echo  Nova versão  : v%NEXT_V%
echo.

REM ── 2. Pedir mensagem do commit ─────────────────────────────────────────────
set /p "MSG=Mensagem do commit (Enter para usar padrão): "
if "!MSG!"=="" set "MSG=chore: bump v%NEXT_V%"

echo.
echo  Commit: !MSG!
echo.

REM ── 3. Bumpar versão no index.html ──────────────────────────────────────────
echo  Atualizando index.html: v%CURRENT_V% → v%NEXT_V%...
powershell -NoProfile -Command "(Get-Content '%INDEX%') -replace 'script\.js\?v=%CURRENT_V%', 'script.js?v=%NEXT_V%' | Set-Content '%INDEX%'"
if errorlevel 1 (
    echo  [ERRO] Falha ao atualizar versão no index.html
    goto :fim_erro
)

REM ── 4. Git add + commit + push ──────────────────────────────────────────────
echo  Adicionando arquivos ao git...
git add -A

echo  Criando commit...
git commit -m "!MSG!"

echo  Fazendo push para GitHub...
git push origin main
if errorlevel 1 (
    echo.
    echo  [ERRO] Push falhou. Verifique a conexao.
    goto :fim_erro
)

REM ── 5. Deploy na Vercel ─────────────────────────────────────────────────────
echo.
echo  Fazendo deploy na Vercel (producao)...
cmd /c "cd /d "C:\Users\Junior\Projetos Ingresso ideal\ideal-imposition\frontend" && vercel --prod --yes"
if errorlevel 1 (
    echo.
    echo  [ERRO] Deploy Vercel falhou.
    goto :fim_erro
)

REM ── Sucesso ──────────────────────────────────────────────────────────────────
echo.
echo ╔══════════════════════════════════════════════╗
echo ║  SUCESSO! v%NEXT_V% publicada no ar.              ║
echo ║  https://ideal-imposition.vercel.app         ║
echo ╚══════════════════════════════════════════════╝
echo.
goto :fim

:fim_erro
echo.
echo ╔══════════════════════════════════════════════╗
echo ║  ERRO ao publicar. Veja mensagem acima.      ║
echo ╚══════════════════════════════════════════════╝
echo.

:fim
pause
