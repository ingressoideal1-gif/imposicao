# -*- coding: utf-8 -*-
import multiprocessing
multiprocessing.freeze_support()

import sys
import os
import threading
import webbrowser
import socket
import time

if getattr(sys, 'frozen', False):
    # ── Modo executavel (PyInstaller) ──────────────────────────────────────
    # Com console=False, o subsistema Win32 de mensagens nao e inicializado
    # corretamente, causando crash silencioso do pystray.
    # AllocConsole() + FreeConsole() forcam a inicializacao sem mostrar janela.
    import ctypes
    try:
        ctypes.windll.kernel32.AllocConsole()
        ctypes.windll.kernel32.FreeConsole()
    except Exception:
        pass
    # Ocultar qualquer janela de console que possa ter aparecido
    try:
        hwnd = ctypes.windll.kernel32.GetConsoleWindow()
        if hwnd:
            ctypes.windll.user32.ShowWindow(hwnd, 0)  # SW_HIDE
    except Exception:
        pass

    BASE_DIR = sys._MEIPASS
    EXE_DIR = os.path.dirname(sys.executable)
    sys.path.insert(0, BASE_DIR)
    os.chdir(EXE_DIR)
    # Redirecionar stdout/stderr para log
    _log_path = os.path.join(EXE_DIR, "agent_log.txt")
    try:
        _log_file = open(_log_path, "w", encoding="utf-8", buffering=1)
        sys.stdout = _log_file
        sys.stderr = _log_file
    except Exception:
        pass
else:
    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    EXE_DIR = BASE_DIR
    os.chdir(BASE_DIR)

import agent_worker

server_thread = None


def find_icon():
    candidates = [
        os.path.join(EXE_DIR, "agent_icon.ico"),
        os.path.join(BASE_DIR, "agent_icon.ico"),
        os.path.join(EXE_DIR, "Logo Ideal Dark.png"),
        os.path.join(BASE_DIR, "Logo Ideal Dark.png"),
    ]
    for p in candidates:
        if os.path.exists(p):
            return p
    return None


def create_tray_image():
    from PIL import Image, ImageDraw
    icon_path = find_icon()
    if icon_path:
        try:
            img = Image.open(icon_path).convert("RGBA")
            img = img.resize((64, 64), Image.LANCZOS)
            return img
        except Exception:
            pass
    img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
    dc = ImageDraw.Draw(img)
    dc.ellipse([2, 2, 62, 62], fill=(26, 54, 93, 255))
    return img


def run_worker():
    agent_worker.run_loop()

def run_server():
    import asyncio
    import uvicorn
    from local_print_agent import app
    # Criar um event loop asyncio dedicado para o uvicorn neste thread
    # Evita conflito com o loop do pystray/Win32 no thread principal
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    config = uvicorn.Config(app, host="127.0.0.1", port=9000, log_level="warning", loop="none")
    server = uvicorn.Server(config)
    loop.run_until_complete(server.serve())

def start_server_thread():
    global server_thread
    server_thread = threading.Thread(target=run_server, daemon=True, name="IdealAgentServer")
    server_thread.start()
    
    worker_thread = threading.Thread(target=run_worker, daemon=True, name="IdealAgentWorker")
    worker_thread.start()
    time.sleep(1)


def open_panel(icon=None, item=None):
    # Abre a aplicacao online que detecta automaticamente o agente local (porta 9000)
    webbrowser.open("https://imposicao.onrender.com/app/index.html")


def add_to_startup(icon=None, item=None):
    try:
        import winreg
        exe_path = sys.executable if getattr(sys, 'frozen', False) else os.path.abspath(__file__)
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0, winreg.KEY_SET_VALUE
        )
        winreg.SetValueEx(key, "IdealImpositionAgent", 0, winreg.REG_SZ, f'"{exe_path}"')
        winreg.CloseKey(key)
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, "Adicionado ao inicio do Windows com sucesso!", "Ideal Agent", 0)
    except Exception as e:
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, f"Erro: {e}", "Ideal Agent", 0)


def remove_from_startup(icon=None, item=None):
    try:
        import winreg
        key = winreg.OpenKey(
            winreg.HKEY_CURRENT_USER,
            r"Software\Microsoft\Windows\CurrentVersion\Run",
            0, winreg.KEY_SET_VALUE
        )
        try:
            winreg.DeleteValue(key, "IdealImpositionAgent")
        except FileNotFoundError:
            pass
        winreg.CloseKey(key)
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, "Removido do inicio do Windows.", "Ideal Agent", 0)
    except Exception as e:
        import ctypes
        ctypes.windll.user32.MessageBoxW(0, f"Erro: {e}", "Ideal Agent", 0)

def quit_agent(icon, item):
    icon.stop()

def setup_tray(icon):
    icon.visible = True


def main():
    try:
        import pystray
        from PIL import Image
    except ImportError as e:
        # Sem tray: iniciar servidor direto e manter vivo
        print(f"[agent] pystray nao disponivel: {e} - rodando apenas servidor")
        start_server_thread()
        threading.Event().wait()
        return

    tray_image = create_tray_image()

    menu = pystray.Menu(
        pystray.MenuItem("Ideal Imposition Agent", None, enabled=False),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem(f"Ativo - Cloud Relay", None, enabled=False),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Abrir Web App", open_panel),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Iniciar com o Windows", add_to_startup),
        pystray.MenuItem("Remover do Inicio", remove_from_startup),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Encerrar Agente", quit_agent),
    )

    icon = pystray.Icon(
        name="IdealImpositionAgent",
        icon=tray_image,
        title="Ideal Imposition Agent - Ativo",
        menu=menu,
    )

    def setup_tray(icon):
        icon.visible = True

    # Iniciar servidor e worker ANTES do icon.run()
    # (o AllocConsole/FreeConsole no topo ja garantiu o Win32 message pump)
    print("[agent] Iniciando worker e servidor...")
    start_server_thread()
    print("[agent] Worker e servidor iniciados com sucesso!")

    icon.run(setup=setup_tray)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        import traceback
        traceback.print_exc()
        if getattr(sys, 'frozen', False):
            # Gravar erro em arquivo para diagnostico
            err_path = os.path.join(EXE_DIR, "agent_crash.txt")
            with open(err_path, "w", encoding="utf-8") as f:
                traceback.print_exc(file=f)
