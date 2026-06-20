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
    BASE_DIR = sys._MEIPASS
    EXE_DIR = os.path.dirname(sys.executable)
    sys.path.insert(0, BASE_DIR)
    os.chdir(EXE_DIR)
    # Redirecionar stdout/stderr para log (console=False nao tem saida)
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

def start_server_thread():
    global server_thread
    server_thread = threading.Thread(target=run_worker, daemon=True, name="IdealAgentServer")
    server_thread.start()
    time.sleep(1)


def open_panel(icon=None, item=None):
    # Pode manter abrindo o vercel app com um parametro para gerenciar a pagina de agentes locais, ou apenas a home.
    # O "panel" local nao existira mais com a porta 9000
    webbrowser.open("https://supabase-imposicao-pm1w.vercel.app")


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
    print("[agent] Iniciando worker do Supabase Cloud Relay...")
    start_server_thread()
    print("[agent] Worker iniciado com sucesso!")

    try:
        import pystray
        from PIL import Image
    except ImportError as e:
        print(f"[agent] pystray nao disponivel: {e} - rodando apenas servidor")
        # Manter o processo vivo mesmo sem tray
        import signal
        signal.pause() if hasattr(signal, 'pause') else threading.Event().wait()
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
