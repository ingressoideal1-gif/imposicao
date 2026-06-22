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

# Garante que o agent_config.json fique sempre ao lado do .exe ou do script
_SCRIPT_DIR = os.path.dirname(os.path.abspath(sys.executable if getattr(sys, 'frozen', False) else __file__))
CONFIG_FILE = os.path.join(_SCRIPT_DIR, "agent_config.json")
AGENT_ID = None

if os.path.exists(CONFIG_FILE):
    try:
        with open(CONFIG_FILE, "r") as f:
            cfg = json.load(f)
            AGENT_ID = cfg.get("agent_id")
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

def sync_heartbeat():
    try:
        printers = print_service.get_printers()
        ppds = print_service.get_ppd_list()
        ppd_map = print_service.load_printer_ppd_map()
        
        printers_json = {
            "printers": printers,
            "ppds": ppds,
            "ppd_map": ppd_map
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

            selected_codes = {}
            mapping = print_service.load_printer_ppd_map()
            ppd_file = mapping.get(printer_name)
            if ppd_file:
                ppd_path = os.path.join(print_service.PPD_DIR, ppd_file)
                if os.path.exists(ppd_path):
                    try:
                        parser = ppd_parser.PPDParser(ppd_path)
                        for opt_key, choice_key in ppd_options.items():
                            if opt_key in parser.options and choice_key in parser.options[opt_key]["choices"]:
                                selected_codes[opt_key] = parser.options[opt_key]["choices"][choice_key]["code"]
                    except Exception as e:
                        print(f"[agent_worker] Erro ao ler PPD: {e}")

            success, msg = print_service.send_print_job(
                printer_name=printer_name,
                pdf_path=temp_pdf.name,
                selected_options_codes=selected_codes,
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

def run_loop():
    print(f"Iniciando Agent Worker (Cloud Relay) - ID: {AGENT_ID}", flush=True)
    heartbeat_timer = 0
    while True:
        try:
            if heartbeat_timer <= 0:
                sync_heartbeat()
                heartbeat_timer = 30
            process_queue()
            time.sleep(5)
            heartbeat_timer -= 5
        except Exception as e:
            print(f"[agent_worker] Erro no loop principal: {e}", flush=True)
            time.sleep(5)
            heartbeat_timer -= 5 # Garantir decremento


if __name__ == "__main__":
    run_loop()
