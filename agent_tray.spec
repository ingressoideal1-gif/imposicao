# -*- mode: python ; coding: utf-8 -*-
import os

block_cipher = None

# MEDICAO: bundle do frontend sem fonts_local (222 TTF, ~140 MB dos 254 MB).
# Este build NAO serve para release — as 222 fontes com arquivo_url relativo
# (/fonts_local/...) deixam de existir em disco e o agente falharia ao embuti-las.
# So vale depois que as fontes forem hospedadas e o catalogo migrado para URL absoluta.
_frontend_datas = []
for _raiz, _dirs, _arqs in os.walk('frontend'):
    _dirs[:] = [d for d in _dirs if d != 'fonts_local']
    for _a in _arqs:
        _frontend_datas.append((os.path.join(_raiz, _a), os.path.relpath(_raiz, '.')))

a = Analysis(
    ['agent_tray.py'],
    pathex=['.'],
    binaries=[],
    datas=[
        ('formats_db.json', '.'),
        ('agent_icon.ico', '.'),
        ('Logo Ideal Dark.png', '.'),
        ('ppds', 'ppds'),
    ] + _frontend_datas,
    hiddenimports=[
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
        'winreg',
        'anyio',
        'anyio._backends._asyncio',
        'email.mime.multipart',
        'engine',
        'db',
        'ppd_parser',
        'print_service',
        'local_print_agent',
        'agent_worker',
        'security_config',
        'font_cache',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
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
