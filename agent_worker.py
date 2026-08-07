# -*- coding: utf-8 -*-
import time
import datetime
import json
import os
import sys
import uuid
import tempfile
import urllib.request
import urllib.error

import db
import print_service
import ppd_parser

# O config fica num caminho fixo por maquina, nao ao lado do executavel: antes,
# rodar do codigo-fonte ou reinstalar em outra pasta gerava um AGENT_ID novo e
# uma linha nova em print_agents. Uma unica maquina chegou a acumular 21
# registros, todos com status "online", porque nada nunca os remove.
_APPDATA = os.environ.get("LOCALAPPDATA") or os.path.expanduser("~")
_CONFIG_DIR = os.path.join(_APPDATA, "NewProd Agent")
try:
    os.makedirs(_CONFIG_DIR, exist_ok=True)
except Exception:
    _CONFIG_DIR = os.path.dirname(os.path.abspath(sys.executable if getattr(sys, 'frozen', False) else __file__))
CONFIG_FILE = os.path.join(_CONFIG_DIR, "agent_config.json")

# Caminho antigo, para herdar o ID de quem ja estava instalado em vez de
# aparecer como agente novo depois da atualizacao.
_CONFIG_ANTIGO = os.path.join(
    os.path.dirname(os.path.abspath(sys.executable if getattr(sys, 'frozen', False) else __file__)),
    "agent_config.json")

AGENT_ID = None
for _origem in (CONFIG_FILE, _CONFIG_ANTIGO):
    if AGENT_ID:
        break
    if os.path.exists(_origem):
        try:
            with open(_origem, "r") as f:
                AGENT_ID = json.load(f).get("agent_id")
        except Exception:
            pass

if not AGENT_ID:
    AGENT_ID = str(uuid.uuid4())
    try:
        with open(CONFIG_FILE, "w") as f:
            json.dump({"agent_id": AGENT_ID}, f)
    except Exception:
        pass

AGENT_NAME = os.environ.get("COMPUTERNAME", "Agente Ideal")

def _supabase_request(method: str, path: str, body: dict = None, is_storage=False) -> dict | list | None:
    if not db.IS_SUPABASE_ACTIVE:
        return None
    url = f"{db.SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "apikey": db.SUPABASE_KEY,
        "Authorization": f"Bearer {db.SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation"
    }
    
    req_data = None
    if body is not None:
        req_data = json.dumps(body).encode("utf-8")
        
    req = urllib.request.Request(url, data=req_data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            resp_body = response.read().decode("utf-8")
            if resp_body:
                return json.loads(resp_body)
            return None
    except urllib.error.HTTPError as e:
        print(f"[agent_worker] Erro HTTP {method} {path}: {e.code} - {e.read().decode('utf-8')}")
        return None
    except Exception as e:
        print(f"[agent_worker] Erro {method} {path}: {e}")
        return None

def download_file(file_url: str, dest_path: str):
    try:
        urllib.request.urlretrieve(file_url, dest_path)
        return True
    except Exception as e:
        print(f"[agent_worker] Erro ao baixar PDF: {e}")
        return False

def get_local_ip():
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"

def sync_heartbeat():
    try:
        printers = print_service.get_printers()
        capabilities = {}
        for p in printers:
            capabilities[p] = print_service.get_printer_capabilities(p)
            
        from agent_version import AGENT_VERSION

        # A versao vai dentro do printers_json (JSONB) e nao numa coluna propria
        # para nao exigir migracao na tabela print_agents — o local_ip ja segue
        # essa pratica. Sem isto nao ha como saber remotamente qual estacao
        # rodava qual versao.
        printers_json = {
            "printers": printers,
            "capabilities": capabilities,
            "local_ip": get_local_ip(),
            "version": AGENT_VERSION
        }
        
        # Formato UTC explícito com timezone, exigido pelo Supabase
        now_iso = datetime.datetime.now(datetime.timezone.utc).isoformat()

        # UPSERT via POST com Prefer: resolution=merge-duplicates
        payload = {
            "id": AGENT_ID,
            "name": AGENT_NAME,
            "status": "online",
            "last_seen": now_iso,
            "printers_json": printers_json
        }
        url = f"{db.SUPABASE_URL}/rest/v1/print_agents"
        headers = {
            "apikey": db.SUPABASE_KEY,
            "Authorization": f"Bearer {db.SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates"
        }
        req = urllib.request.Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
        try:
            urllib.request.urlopen(req, timeout=10)
            print(f"[agent_worker] Heartbeat OK - {now_iso}", flush=True)
        except urllib.error.HTTPError as e:
            print(f"[agent_worker] Falha no heartbeat HTTP {e.code}: {e.read().decode('utf-8', errors='replace')}", flush=True)
        except Exception as e:
            print(f"[agent_worker] Falha no heartbeat: {e}", flush=True)
    except Exception as e:
        print(f"[agent_worker] Erro fatal no sync_heartbeat: {e}", flush=True)

def process_queue():
    try:
        path = f"print_queue?agent_id=eq.{AGENT_ID}&status=eq.pending&order=created_at.asc&limit=1"
        jobs = _supabase_request("GET", path)
        
        if not jobs:
            return

        for job in jobs:

            job_id = job.get("id")
            file_url = job.get("file_url")
            printer_name = job.get("printer_name")
            ppd_options = job.get("ppd_options", {})
            
            _supabase_request("PATCH", f"print_queue?id=eq.{job_id}", {"status": "printing"})
            print(f"[agent_worker] Processando Job {job_id} para {printer_name}...", flush=True)
            
            temp_pdf = tempfile.NamedTemporaryFile(delete=False, suffix=".pdf")
            temp_pdf.close()
            
            if not download_file(file_url, temp_pdf.name):
                _supabase_request("PATCH", f"print_queue?id=eq.{job_id}", {"status": "error"})
                continue

            # Chamar diretamente a impressão via Windows GDI com as opções enviadas
            success, msg = print_service.send_print_job_windows(
                printer_name=printer_name,
                pdf_path=temp_pdf.name,
                options=ppd_options,
                job_title=f"Cloud Print Job {job_id[:8]}"
            )
            
            try:
                if os.path.exists(temp_pdf.name):
                    os.remove(temp_pdf.name)
            except:
                pass
                
            final_status = "completed" if success else "error"
            _supabase_request("PATCH", f"print_queue?id=eq.{job_id}", {"status": final_status})
            print(f"[agent_worker] Job {job_id} {final_status}: {msg}", flush=True)
    except Exception as e:
        print(f"[agent_worker] Erro fatal no process_queue: {e}", flush=True)

INTERVALO_UPDATE_S = 6 * 3600
INTERVALO_FONTES_S = 6 * 3600


def sincronizar_fontes():
    """Baixa para o cache local toda fonte do catalogo que ainda nao esteja la.

    Deixa a estacao autonoma: depois do primeiro sync o agente serve as fontes
    de disco (/api/fonte), entao tanto a imposicao quanto a tela funcionam sem
    depender da rede. Tambem e o que faz uma fonte nova aparecer sozinha, sem
    reinstalar o agente.

    Roda numa thread propria: sao ~140 MB na primeira vez e nao pode segurar a
    fila de impressao.
    """
    try:
        import font_cache
        fontes = db.get_catalogo_fontes()
        urls = [f.get("arquivo_url") or "" for f in fontes]
        urls = sorted({u for u in urls if u.startswith("http")})

        pasta = font_cache._pasta_cache()
        novas = falhas = 0
        for url in urls:
            destino = os.path.join(pasta, font_cache._nome_em_cache(url))
            if os.path.isfile(destino) and os.path.getsize(destino) > 0:
                continue
            try:
                font_cache.obter_bytes(url)
                novas += 1
            except Exception:
                falhas += 1

        if novas or falhas:
            print(f"[fontes] Sync: {novas} nova(s) em cache, {falhas} falha(s), "
                  f"{len(urls)} no catalogo", flush=True)
    except Exception as e:
        print(f"[fontes] Erro na sincronizacao: {e}", flush=True)


def _sincronizar_fontes_em_thread():
    import threading
    threading.Thread(target=sincronizar_fontes, daemon=True, name="SyncFontes").start()


def verificar_atualizacao(forcado: bool = False):
    """Consulta o manifesto e instala a versao nova, se houver.

    Modelo pull: a URL do manifesto e fixa (security_config), o instalador
    precisa estar no bucket de releases e o sha256 tem que bater. Nenhuma
    entrada externa decide o que e baixado.
    """
    import hashlib
    import subprocess
    import security_config
    from agent_version import AGENT_VERSION, como_tupla

    if not getattr(sys, "frozen", False):
        if forcado:
            print("[update] Modo desenvolvimento: atualizacao ignorada.", flush=True)
        return

    # O Storage fica atras do CDN da Cloudflare: mesmo com cache-control no-cache
    # na origem, a borda serve HIT com o manifesto anterior por um tempo apos a
    # publicacao. Sem o parametro variavel o agente ficaria cego ao release novo.
    # O MSI nao precisa disto — o nome do arquivo ja muda a cada versao.
    url_manifesto = f"{security_config.MANIFEST_URL}?t={int(time.time())}"
    try:
        req = urllib.request.Request(url_manifesto,
                                     headers={"User-Agent": "NewProd Agent",
                                              "Cache-Control": "no-cache"})
        with urllib.request.urlopen(req, timeout=20) as resp:
            manifesto = json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        print(f"[update] Manifesto indisponivel: {e}", flush=True)
        return

    versao_nova = manifesto.get("version")
    url_msi = manifesto.get("url")
    sha_esperado = (manifesto.get("sha256") or "").lower()

    if como_tupla(versao_nova) <= como_tupla(AGENT_VERSION):
        if forcado:
            print(f"[update] Ja esta na versao mais recente ({AGENT_VERSION}).", flush=True)
        return

    if not security_config.is_allowed_release_url(url_msi):
        print(f"[update] BLOQUEADO: instalador fora do bucket de releases: {url_msi!r}", flush=True)
        return
    if len(sha_esperado) != 64:
        print("[update] Manifesto sem sha256 valido — atualizacao abortada.", flush=True)
        return

    print(f"[update] Versao {versao_nova} disponivel (atual {AGENT_VERSION}). Baixando...", flush=True)
    destino = os.path.join(tempfile.gettempdir(), f"NewProd_Setup_{versao_nova}.msi")
    try:
        req = urllib.request.Request(url_msi, headers={"User-Agent": "NewProd Agent"})
        with urllib.request.urlopen(req, timeout=600) as resp, open(destino, "wb") as f:
            f.write(resp.read())
    except Exception as e:
        print(f"[update] Falha no download: {e}", flush=True)
        return

    sha_obtido = hashlib.sha256(open(destino, "rb").read()).hexdigest()
    if sha_obtido != sha_esperado:
        print(f"[update] BLOQUEADO: sha256 divergente "
              f"(esperado {sha_esperado[:12]}, obtido {sha_obtido[:12]}). Arquivo descartado.", flush=True)
        try:
            os.remove(destino)
        except Exception:
            pass
        return

    # O MSI nao consegue substituir o exe enquanto ele roda, e o pacote nao tem
    # CloseApplication configurado — por isso um script solto encerra o agente,
    # instala em silencio e sobe a versao nova.
    exe_path = sys.executable
    bat_path = os.path.join(tempfile.gettempdir(), "newprod_update.bat")
    with open(bat_path, "w", encoding="utf-8") as f:
        f.write(f"""@echo off
timeout /t 3 /nobreak > nul
taskkill /IM "{os.path.basename(exe_path)}" /F > nul 2>&1
msiexec /i "{destino}" /qn
start "" "{exe_path}"
del "{destino}" > nul 2>&1
del "%~f0"
""")

    print(f"[update] sha256 conferido. Instalando {versao_nova} e reiniciando...", flush=True)
    subprocess.Popen([bat_path], shell=True,
                     creationflags=getattr(subprocess, "CREATE_NEW_CONSOLE", 0))


def run_loop():
    print(f"Iniciando Agent Worker (Cloud Relay) - ID: {AGENT_ID}", flush=True)
    heartbeat_timer = 0
    update_timer = 60   # primeira checagem 1 min apos subir
    fontes_timer = 20   # sync de fontes logo no inicio
    while True:
        try:
            if heartbeat_timer <= 0:
                sync_heartbeat()
                heartbeat_timer = 30
            if update_timer <= 0:
                verificar_atualizacao()
                update_timer = INTERVALO_UPDATE_S
            if fontes_timer <= 0:
                _sincronizar_fontes_em_thread()
                fontes_timer = INTERVALO_FONTES_S
            process_queue()
            time.sleep(5)
            heartbeat_timer -= 5
            update_timer -= 5
            fontes_timer -= 5
        except Exception as e:
            print(f"[agent_worker] Erro no loop principal: {e}", flush=True)
            time.sleep(5)
            heartbeat_timer -= 5 # Garantir decremento
            update_timer -= 5
            fontes_timer -= 5


if __name__ == "__main__":
    run_loop()
