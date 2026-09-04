# -*- mode: python ; coding: utf-8 -*-
import os

block_cipher = None

# MEDICAO: bundle do frontend sem fonts_local (222 TTF, ~140 MB dos 254 MB).
# Este build NAO serve para release — as 222 fontes com arquivo_url relativo
# (/fonts_local/...) deixam de existir em disco e o agente falharia ao embuti-las.
# So vale depois que as fontes forem hospedadas e o catalogo migrado para URL absoluta.
# O que o git se RECUSA a versionar nao entra no executavel.
#
# Este walk embute a pasta `frontend/` inteira, arquivo por arquivo, sem olhar
# o que e. Em 17/08/2026 uma anotacao com senha foi deixada ali dentro; ela nao
# chegou a entrar em nenhum MSI por sorte de horario — as compilacoes daquele dia
# sao todas anteriores ao arquivo —, mas a proxima teria embutido a senha num
# instalador de 67 MB que fica num bucket PUBLICO, e de la nao se tira.
#
# O criterio e o do git de proposito: se um arquivo esta no `.gitignore`, alguem
# ja decidiu que ele nao deve sair desta maquina. Sem git disponivel o build para,
# em vez de seguir embutindo tudo — um bundle a menos custa minutos, um segredo
# publicado nao se desfaz.
import subprocess

try:
    _saida = subprocess.run(
        ['git', 'ls-files', '--others', '--ignored', '--exclude-standard', '--', 'frontend'],
        capture_output=True, text=True, check=True, timeout=60).stdout
    _ignorados = {os.path.normpath(_l.strip()) for _l in _saida.splitlines() if _l.strip()}
except Exception as _e:
    raise SystemExit(
        f'[agent_tray.spec] Nao consegui perguntar ao git o que e ignorado ({_e}).\n'
        '  O build para aqui de proposito: sem essa lista, um arquivo com segredo\n'
        '  deixado em frontend/ entraria no instalador publico.')

_frontend_datas = []
_pulados = []
for _raiz, _dirs, _arqs in os.walk('frontend'):
    _dirs[:] = [d for d in _dirs if d != 'fonts_local']
    for _a in _arqs:
        _caminho = os.path.join(_raiz, _a)
        if os.path.normpath(_caminho) in _ignorados:
            _pulados.append(_caminho)
            continue
        _frontend_datas.append((_caminho, os.path.relpath(_raiz, '.')))

if _pulados:
    print('[agent_tray.spec] fora do executavel por estarem no .gitignore: '
          + ', '.join(_pulados))

# mfc140u.dll: o `win32ui.pyd` NAO se basta, e a falta dele so aparece na estacao.
#
# O pedido 21524 (03/09/2026) fez o win32ui entrar nos hiddenimports, e com isso
# o `pythonwin\win32ui.pyd` passou a viajar no executavel. No dia seguinte o
# mesmo erro continuou em ALGUMAS estacoes: o `.pyd` importa `mfc140u.dll` -- o
# runtime do MFC --, que o pywin32 nao traz (a pasta `pythonwin/` do
# site-packages tem o `.pyd` e nada de DLL) e que o Windows nao inclui. Ela
# chega na maquina pelo "Visual C++ 2015-2022 Redistributable (x64)", que outros
# programas instalam ao longo dos anos.
#
# Por isso parecia versao do Windows: as estacoes antigas acumularam o runtime
# (Corel, Adobe, driver de impressora) e a recem-formatada nao. O que decide e o
# historico de instalacoes daquela maquina, e depender disso significa uma
# estacao que nao imprime sem ninguem entender por que.
#
# `MSVCP140.dll`, `VCRUNTIME140.dll` e `VCRUNTIME140_1.dll` ja viajam no bundle;
# o `mfc140u.dll` e o unico que o win32ui pede a mais.
#
# O destino e 'pythonwin', ao lado do `.pyd` que o carrega: o CPython abre
# extensao com `LoadLibraryExW(..., LOAD_WITH_ALTERED_SEARCH_PATH)`, e essa flag
# manda o Windows procurar as dependencias PRIMEIRO na pasta do proprio `.pyd`.
# Na raiz do bundle tambem funcionaria, mas dependeria de o bootloader ter
# acrescentado a raiz ao caminho de busca -- ao lado nao depende de nada.
#
# Sem a DLL o build PARA, em vez de sair um instalador que so falha na estacao:
# e o mesmo criterio da lista do git ali em cima.
_MFC = 'mfc140u.dll'
_mfc_candidatos = [
    os.path.join(os.environ.get('SystemRoot', r'C:\Windows'), 'System32', _MFC),
    os.path.join(os.path.dirname(os.__file__), '..', 'Lib', 'site-packages', 'pythonwin', _MFC),
]
_mfc = next((c for c in _mfc_candidatos if os.path.exists(c)), None)
if not _mfc:
    raise SystemExit(f"""[agent_tray.spec] Nao achei o {_MFC} nesta maquina.
  Ele e a DLL que o win32ui.pyd carrega, e sem ela a impressao GDI
  falha na estacao que nao tiver o Visual C++ Redistributable.
  Instale o "Microsoft Visual C++ 2015-2022 Redistributable (x64)"
  nesta maquina de compilacao e rode de novo.""")

_binarios = [(_mfc, 'pythonwin')]

a = Analysis(
    ['agent_tray.py'],
    pathex=['.'],
    binaries=_binarios,
    # ('ppds', 'ppds') foi removido em 2026-08-09, e nao deve voltar.
    #
    # A pasta nunca teve um .ppd: continha 7 temporarios .TMP commitados por
    # acidente, um deles de 5 MB — 5,19 MB de lixo em cada instalador, o que
    # levou o MSI a 51,63 MB e estourou o teto de 50 MB do Supabase.
    #
    # E o caminho PPD nao e usado pelo executavel distribuido. Quem imprime e
    # send_print_job_windows() (DEVMODE do driver do Windows), chamada por
    # app.py e agent_worker.py. A send_print_job(), que injeta codigos PPD em
    # PostScript, so e chamada por local_print_agent.py — que roda apenas em
    # desenvolvimento. O print_service.py recria a pasta vazia com makedirs
    # no import, entao nada quebra sem ela.
    datas=[
        ('formats_db.json', '.'),
        ('agent_icon.ico', '.'),
        ('Logo Ideal Dark.png', '.'),
    ] + _frontend_datas,
    hiddenimports=[
        # Gerado pelo build_agent.ps1 e importado so dentro de uma funcao do
        # acesso_publicacao.py, entao o PyInstaller nao o acha varrendo o
        # codigo. Sem esta linha o agente sai sem o segredo e nao publica faixa
        # nenhuma -- sem erro, sem aviso, ate a portaria do evento.
        'acesso_segredo',
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.loops.asyncio',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.http.h11_impl',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'pystray._win32',
        'PIL',
        'PIL.Image',
        'PIL.ImageDraw',
        # A extensao C _imagingcms (LittleCMS) so e achada pelo PyInstaller com
        # o import explicito — sem esta linha o agente sobe, mas a primeira
        # impressao com gerenciamento de cores morre com ImportError no log.
        'PIL.ImageCms',
        'fastapi',
        'starlette',
        'starlette.routing',
        'starlette.requests',
        'starlette.responses',
        'starlette.middleware.cors',
        'multipart',
        'python_multipart',
        'fitz',
        'qrcode',
        'qrcode.image.pil',
        'barcode',
        'barcode.writer',
        'barcode.codex',
        'barcode.ean',
        'win32print',
        # win32ui, win32gui e win32con: o pedido 21524 (03/09/2026) foi quem
        # descobriu a falta. Diferente de 'win32print' (mora em
        # site-packages/win32/), 'win32ui' mora em site-packages/pythonwin/ e
        # carrega uma DLL nativa propria -- o mesmo padrao de 'PIL.ImageCms' e
        # de 'serial.serialwin32' logo abaixo: o agente COMPILA sem estas
        # linhas, e so falha na estacao, no clique do operador, com um
        # ImportError cru ("DLL load failed while importing win32ui") em vez
        # de qualquer coisa que explique o que fazer. `print_service.py` tem
        # a bandeira `HAS_WIN32UI` para o dia em que a estacao realmente nao
        # tiver o componente -- esta lista aqui e' para o executavel sair
        # COM ele sempre que a maquina que compila o tiver.
        'win32ui',
        'win32gui',
        'win32con',
        'winreg',
        'anyio',
        'anyio._backends._asyncio',
        'email.mime.multipart',
        'engine',
        'db',
        'ppd_parser',
        'print_service',
        'color_profiles',
        'hotfolder',
        'acesso_local',
        'local_print_agent',
        'agent_worker',
        'security_config',
        'font_cache',
        'agent_version',
        'balanca',
        # A balanca Urano da estacao, na porta serial. O 'serial.serialwin32' e o
        # backend do Windows, escolhido em tempo de execucao -- o PyInstaller nao
        # o acha varrendo o codigo, e sem ele o agente COMPILA e so falha na
        # estacao, no clique do operador, sem nada no log que explique.
        'serial',
        'serial.tools',
        'serial.tools.list_ports',
        'serial.serialwin32',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    # 'cryptography' chegou a ser excluido daqui em 2026-08-09, para caber no
    # teto de 50 MB que o plano do Supabase impunha na epoca. O teto subiu
    # para 200 MB no bucket agent-releases no mesmo dia, entao a exclusao foi
    # DESFEITA: ela economizava 3,4 MB num pacote que agora tem ~152 MB de
    # folga, em troca de um risco pequeno mas nao verificado no TLS das
    # estacoes. Nao vale a pena — se o espaco voltar a apertar, a analise que
    # justifica a exclusao esta no GUIA_AGENTE.md.
    #
    # NAO acrescente 'lxml' aqui: ele parece orfao, mas vem do svglib e e
    # obrigatorio para impor elementos SVG (ver engine.py). Foi ele, alias,
    # quem levou o pacote de 46,5 para 50,7 MB quando o SVG foi implementado.
    excludes=['firebase_admin', 'google.cloud', 'grpc', 'tkinter'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='NewProd',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='agent_icon.ico',
)
