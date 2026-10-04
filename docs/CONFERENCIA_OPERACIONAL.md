# Conferencia operacional

Execute `./ferramentas/conferir.ps1` na raiz do checkout a conferir. O comando
consulta a referencia local `origin/main`; nao faz fetch nem sincronizacao.
Arquivos locais pendentes continuam preservados.

O Python e escolhido entre `.venv/Scripts/python.exe` e `venv/Scripts/python.exe`.
Em um worktree sem ambiente Python, informe `-Python CAMINHO_DO_PYTHON_DO_PROJETO`.
A vinculacao da CLI Supabase e lida no checkout principal do mesmo repositorio,
pois worktrees isolados nao precisam repetir a configuracao operacional.

Os testes executados sao `Publicacao.Tests.ps1` e `EntregaSegura.Tests.ps1`.
Ambos aceitam Pester 3.4 e 5.9. Falha ou ausencia de testes produz codigo de
saida 1. Outras suites Python, JavaScript e Deno devem ser executadas conforme
o escopo da alteracao; este diagnostico nao as substitui.

A verificacao distingue versao no repositorio, manifesto publico e agente
instalado. Igualdade dessas versoes nao comprova impressao fisica. Para conferir
o frontend publicado, compare os arquivos dos dominios operacionais com a fonte
apos a propagacao. Publicacao e instalacao continuam tendo provas separadas.
