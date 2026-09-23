# Entrega segura: fotos na folha combinada do pedido 22241

## Estado

- Worktree de entrega: `C:\ProjetosLocais\ideal-imposition-foto-combinada-22241-entrega`, branch `fix/foto-combinada-22241-entrega`, baseada em `origin/main` no commit `99afa35e` (v956).
- Correção local em `engine.py`: a conferencia de fotos usa os elementos, a fatia de CSV e a quantidade de cada modelo da folha combinada. A numeracao geral nao participa dessa conferencia. Uma pendencia real informa modelo, linha e coluna; a linha ausente do modelo tambem bloqueia a geracao.
- Testes de regressao em `tests/test_engine_foto.py` cobrem a falsa pendencia de oito linhas com coluna vazia na numeracao geral, foto ausente em uma arte, linha ausente e deslocamento no banco geral.
- Versao preparada: NewProd `1.2.338` em `agent_version.py`, `agent_installer.wxs` (`1.2.338.0`) e `compilar_msi.ps1` (`NewProd_Setup_v1.2.338.msi`).

## Evidencia local

- `pytest -n 0` em `test_engine_foto.py`, `test_engine_banco_nunca_vira_sequencial.py`, `test_multi_artes.py`, `test_impressao_combinada.py` e `test_heartbeat_versao.py`: 58 testes e 23 subtestes passaram.
- Pester `tests/VersaoAgente.Tests.ps1`, no Windows PowerShell 5.1: 19 passaram.
- `git diff --check`: sem erro de whitespace.
- Leitura publica com cache buster em 23/09/2026: `agent-releases/latest.json` apontava para `1.2.337`; GET do objeto `NewProd_Setup_v1.2.338.msi` respondeu `NoSuchKey`.
- Build local autorizado: `build_agent.ps1` concluiu com verificacao de segredo e pool QR (24.000.000 bytes); `compilar_msi.ps1` gerou `dist/NewProd_Setup_v1.2.338.msi`.
- MSI local: ProductVersion `1.2.338.0`, 156.160.000 bytes, SHA-256 `0742f3130175b9f317b928d7744a108d56778060140dfac09f249689eaa290fb`.
- A tabela de arquivos do MSI inclui `NewProd.exe` (140.985.186 bytes) e `qr_ideal_pool.bin` (24.000.000 bytes). O arquivo PyInstaller inclui `engine`, `agent_version`, `acesso_segredo`, `win32ui.pyd` e as DLLs MFC/VCRUNTIME de que ele depende. Nenhum valor de segredo foi exibido.

## Publicacao em 23/09/2026

- Commit do codigo e da versao: `2452f99c635b63c5292a7e6348fea94ef386d151`, enviado a `origin/main` por fast-forward e confirmado por `git ls-remote`.
- Antes do envio, o bucket `agent-releases` informou limite de 209.715.200 bytes e o nome `NewProd_Setup_v1.2.338.msi` respondeu `NoSuchKey`.
- O MSI foi enviado para `agent-releases/NewProd_Setup_v1.2.338.msi`. Um download pela URL publica simples retornou 156.160.000 bytes e SHA-256 `0742f3130175b9f317b928d7744a108d56778060140dfac09f249689eaa290fb`, iguais ao arquivo local.
- So depois dessa comparacao, `latest.json` foi ativado. As consultas publicas simples e com cache buster responderam 200 e trouxeram `version=1.2.338`, a URL esperada, `size=156160000` e o SHA-256 acima.
- Nenhum arquivo de `frontend/` foi alterado neste release.

## Limites e retomada

- Nao houve consulta atual aos dados do pedido nem captura do payload real. A reproducao local prova o mecanismo da falsa pendencia, mas nao comprova que todas as fotos do pedido estejam associadas.
- O build usou o ambiente virtual, o pool e a configuracao de segredo existentes no checkout legado, sob a autorizacao dada para executar a simulacao local. Nao foi copiado `.env.local` para o worktree. O build gerou `acesso_segredo.py` (ignorado pelo Git) e copiou o pool para `dist/` para embuti-los no pacote local. A limpeza do arquivo gerado foi rejeitada pela revisao automatica de seguranca; ele permanece no worktree e nao deve ser adicionado ao Git.
- A tag `agente-v1.2.338` registra o commit final desta evidencia no Git.
- A instalacao na estacao, heartbeat da versao nova e impressao fisica do pedido sao verificacoes separadas. Nao foram executadas.
