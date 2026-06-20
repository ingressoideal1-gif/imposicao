@echo off
echo ============================================
echo  Publicando Ideal Imposition no GitHub...
echo ============================================
echo.
cd /d "C:\Users\Junior\Projetos Ingresso ideal\ideal-imposition"
echo Verificando status...
git status --short
echo.
echo Fazendo push para o GitHub (branch main)...
git push origin main
echo.
if %ERRORLEVEL% == 0 (
    echo ============================================
    echo  SUCESSO! Deploy iniciado automaticamente.
    echo  A Vercel vai publicar em ~1-2 minutos.
    echo ============================================
) else (
    echo ============================================
    echo  ERRO: Verifique a conexao com a internet
    echo  e tente novamente.
    echo ============================================
)
echo.
pause
