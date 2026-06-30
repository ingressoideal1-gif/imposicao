import json
import os
import uuid
import urllib.request
import urllib.parse

# Caminho absoluto baseado na localização do script — independente do CWD
DB_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "formats_db.json")

DEFAULT_DB = {
    "formatos": [
        {
            "id": "fmt_1",
            "name": "Ingresso Padrão 100x50",
            "width_mm": 100,
            "height_mm": 50,
            "cols": 2,
            "rows": 5,
            "gap_h_mm": 3,
            "gap_v_mm": 2
        },
        {
            "id": "fmt_2",
            "name": "Cartela A6 105x148",
            "width_mm": 105,
            "height_mm": 148,
            "cols": 2,
            "rows": 2,
            "gap_h_mm": 0,
            "gap_v_mm": 0
        }
    ],
    "numeracoes": [],
    "saidas": [
        {
            "id": "sai_1",
            "name": "SRA3 - Paisagem",
            "width_mm": 450,
            "height_mm": 320,
            "file_format": "pdf"
        },
        {
            "id": "sai_2",
            "name": "A4 - Retrato",
            "width_mm": 210,
            "height_mm": 297,
            "file_format": "pdf"
        },
        {
            "id": "sai_3",
            "name": "A3 - Retrato",
            "width_mm": 297,
            "height_mm": 420,
            "file_format": "pdf"
        }
    ],
    "cores": [],
    "modelos_imposicao": []
}

# ─── CARREGAR CREDENCIAIS SUPABASE DO PARCEIRO VIBECODE ────────────────────────

DEFAULT_SUPABASE_URL = "https://vwbtitjlpelrcnsytzqw.supabase.co"
DEFAULT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o"

SUPABASE_URL = None
SUPABASE_KEY = None

env_local_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env.local")
if os.path.exists(env_local_path):
    try:
        with open(env_local_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                parts = line.split("=", 1)
                if len(parts) == 2:
                    k, v = parts[0].strip(), parts[1].strip()
                    if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
                        v = v[1:-1]
                    if k == "NEXT_PUBLIC_SUPABASE_URL":
                        SUPABASE_URL = v
                    elif k == "NEXT_PUBLIC_SUPABASE_ANON_KEY":
                        SUPABASE_KEY = v
    except Exception as e:
        print(f"[db.py] Erro ao ler .env.local: {e}")

# Sobrescrever via variáveis de ambiente se presentes
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL)
SUPABASE_KEY = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", SUPABASE_KEY)

# Fallback para os valores padrão do parceiro Vibecode
if not SUPABASE_URL:
    SUPABASE_URL = DEFAULT_SUPABASE_URL
if not SUPABASE_KEY:
    SUPABASE_KEY = DEFAULT_SUPABASE_KEY

IS_SUPABASE_ACTIVE = bool(SUPABASE_URL and SUPABASE_KEY)

if IS_SUPABASE_ACTIVE:
    print(f"[db.py] Supabase do Vibecode ativo: {SUPABASE_URL}")
else:
    print("[db.py] Supabase inativo, operando em modo local (formats_db.json)")


# ─── UTILITÁRIO SUPABASE REST REQUEST ──────────────────────────────────────────

def _supabase_request(method: str, path: str, body: dict = None) -> list | dict | None:
    if not IS_SUPABASE_ACTIVE:
        return None
        
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }
    
    if method in ("POST", "PATCH"):
        headers["Prefer"] = "return=representation"
        
    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        
    req = urllib.request.Request(url, headers=headers, method=method, data=data)
    try:
        with urllib.request.urlopen(req) as resp:
            content = resp.read().decode("utf-8")
            if content:
                return json.loads(content)
            return None
    except Exception as e:
        print(f"[db.py] Erro Supabase REST {method} em {path}: {e}")
        raise e


# ─── Internal helpers (fallback local) ─────────────────────────────────────────

def _migrate_old_db(data: dict) -> dict:
    if "formatos" in data:
        return data
    new_db = {**DEFAULT_DB, "formatos": [], "numeracoes": [], "saidas": []}
    for f in data.get("input_formats", []):
        new_db["formatos"].append({
            "id": f.get("id", "fmt_" + str(uuid.uuid4())[:8]),
            "name": f.get("name", "Formato"),
            "width_mm": f.get("width_mm", 100),
            "height_mm": f.get("height_mm", 50),
            "cols": f.get("layout_cols", 1),
            "rows": f.get("layout_rows", 1),
            "gap_h_mm": 0,
            "gap_v_mm": 0
        })
    for o in data.get("output_formats", []):
        new_db["saidas"].append({
            "id": o.get("id", "sai_" + str(uuid.uuid4())[:8]),
            "name": o.get("name", "Saída"),
            "width_mm": o.get("width_mm", 210),
            "height_mm": o.get("height_mm", 297),
            "file_format": "pdf"
        })
    return new_db

def init_db():
    if not os.path.exists(DB_FILE):
        _save_db(DEFAULT_DB)
        return
    with open(DB_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
    if "input_formats" in data or "formatos" not in data:
        migrated = _migrate_old_db(data)
        _save_db(migrated)

def _get_db() -> dict:
    init_db()
    with open(DB_FILE, "r", encoding="utf-8") as f:
        return json.load(f)

def _save_db(db_data: dict):
    with open(DB_FILE, "w", encoding="utf-8") as f:
        json.dump(db_data, f, indent=4, ensure_ascii=False)


# ─── FORMATOS ─────────────────────────────────────────────────────────────────

def get_formatos() -> list:
    if IS_SUPABASE_ACTIVE:
        try:
            return _supabase_request("GET", "producao_formatos?order=name.asc") or []
        except Exception:
            return []
    return _get_db().get("formatos", [])

def get_formato(fmt_id: str) -> dict | None:
    if IS_SUPABASE_ACTIVE:
        try:
            res = _supabase_request("GET", f"producao_formatos?id=eq.{fmt_id}")
            return res[0] if res else None
        except Exception:
            return None
    for f in get_formatos():
        if f["id"] == fmt_id:
            return f
    return None

def add_formato(data: dict) -> str:
    new_id = data.get("id") or (str(uuid.uuid4()) if IS_SUPABASE_ACTIVE else ("fmt_" + str(uuid.uuid4())[:8]))
    data["id"] = new_id
    if IS_SUPABASE_ACTIVE:
        clean_data = {
            "id": new_id,
            "name": data.get("name"),
            "width_mm": float(data.get("width_mm", 0)),
            "height_mm": float(data.get("height_mm", 0)),
            "cols": int(data.get("cols", 1)),
            "rows": int(data.get("rows", 1)),
            "gap_h_mm": float(data.get("gap_h_mm", 0)),
            "gap_v_mm": float(data.get("gap_v_mm", 0)),
            "offset_h_mm": float(data.get("offset_h_mm", 0)),
            "offset_v_mm": float(data.get("offset_v_mm", 0)),
            "rotations": data.get("rotations", {}),
            "default_schema": data.get("default_schema") or "sequential",
            "default_saida_id": data.get("default_saida_id"),
            "default_cut_stack_mode": data.get("default_cut_stack_mode") or "independent",
            "default_sheets_per_block": int(data.get("default_sheets_per_block", 50) or 50),
            "default_block_depth": int(data.get("default_block_depth", 1) or 1),
            "default_rotate_page": bool(data.get("default_rotate_page", False)),
            "has_cover": bool(data.get("has_cover", False)),
            "cover_scale": float(data.get("cover_scale", 80.0)),
            "cover_offset_x": float(data.get("cover_offset_x", 0.0)),
            "cover_offset_y": float(data.get("cover_offset_y", 0.0)),
            "cover_font_size": int(data.get("cover_font_size", 12)),
            "cover_font_color": data.get("cover_font_color", "#000000"),
            "cover_font_x": float(data.get("cover_font_x", 10.0)),
            "cover_font_y": float(data.get("cover_font_y", 10.0))
        }
        _supabase_request("POST", "producao_formatos", clean_data)
        return new_id
    db = _get_db()
    db.setdefault("formatos", []).append(data)
    _save_db(db)
    return new_id

def update_formato(fmt_id: str, data: dict) -> bool:
    if IS_SUPABASE_ACTIVE:
        try:
            clean_data = {
            "name": data.get("name"),
            "width_mm": float(data.get("width_mm", 0)),
            "height_mm": float(data.get("height_mm", 0)),
            "cols": int(data.get("cols", 1)),
            "rows": int(data.get("rows", 1)),
            "gap_h_mm": float(data.get("gap_h_mm", 0)),
            "gap_v_mm": float(data.get("gap_v_mm", 0)),
            "offset_h_mm": float(data.get("offset_h_mm", 0)),
            "offset_v_mm": float(data.get("offset_v_mm", 0)),
            "rotations": data.get("rotations", {}),
            "default_schema": data.get("default_schema") or "sequential",
            "default_saida_id": data.get("default_saida_id"),
            "default_cut_stack_mode": data.get("default_cut_stack_mode") or "independent",
            "default_sheets_per_block": int(data.get("default_sheets_per_block", 50) or 50),
            "default_block_depth": int(data.get("default_block_depth", 1) or 1),
            "default_rotate_page": bool(data.get("default_rotate_page", False)),
            "has_cover": bool(data.get("has_cover", False)),
            "cover_scale": float(data.get("cover_scale", 80.0)),
            "cover_offset_x": float(data.get("cover_offset_x", 0.0)),
            "cover_offset_y": float(data.get("cover_offset_y", 0.0)),
            "cover_font_size": int(data.get("cover_font_size", 12)),
            "cover_font_color": data.get("cover_font_color", "#000000"),
            "cover_font_x": float(data.get("cover_font_x", 10.0)),
            "cover_font_y": float(data.get("cover_font_y", 10.0))
        }
            res = _supabase_request("PATCH", f"producao_formatos?id=eq.{fmt_id}", clean_data)
            return bool(res)
        except Exception:
            return False
    db = _get_db()
    for i, f in enumerate(db.get("formatos", [])):
        if f["id"] == fmt_id:
            data["id"] = fmt_id
            db["formatos"][i] = data
            _save_db(db)
            return True
    return False

def delete_formato(fmt_id: str):
    if IS_SUPABASE_ACTIVE:
        try:
            _supabase_request("DELETE", f"producao_formatos?id=eq.{fmt_id}")
            return
        except Exception:
            pass
    db = _get_db()
    db["formatos"] = [f for f in db.get("formatos", []) if f["id"] != fmt_id]
    _save_db(db)


# ─── NUMERAÇÕES ───────────────────────────────────────────────────────────────

def get_numeracoes() -> list:
    if IS_SUPABASE_ACTIVE:
        try:
            return _supabase_request("GET", "producao_numeracoes?order=name.asc") or []
        except Exception:
            return []
    return _get_db().get("numeracoes", [])

def get_numeracao(num_id: str) -> dict | None:
    if IS_SUPABASE_ACTIVE:
        try:
            res = _supabase_request("GET", f"producao_numeracoes?id=eq.{num_id}")
            return res[0] if res else None
        except Exception:
            return None
    for n in get_numeracoes():
        if n["id"] == num_id:
            return n
    return None

def add_numeracao(data: dict) -> str:
    name = data.get("name", "").strip().lower()
    existing_id = None
    if IS_SUPABASE_ACTIVE:
        try:
            escaped_name = urllib.parse.quote(data.get("name", "").strip())
            res = _supabase_request("GET", f"producao_numeracoes?name=ilike.{escaped_name}")
            if res:
                existing_id = res[0]["id"]
        except Exception:
            pass
    else:
        db = _get_db()
        for n in db.get("numeracoes", []):
            if n.get("name", "").strip().lower() == name:
                existing_id = n["id"]
                break
    if existing_id:
        update_numeracao(existing_id, data)
        return existing_id

    new_id = data.get("id") or (str(uuid.uuid4()) if IS_SUPABASE_ACTIVE else ("num_" + str(uuid.uuid4())[:8]))
    data["id"] = new_id
    if IS_SUPABASE_ACTIVE:
        clean_data = {
            "id": new_id,
            "name": data.get("name"),
            "formato_id": data.get("formato_id"),
            "csv_filename": data.get("csv_filename", ""),
            "csv_headers": data.get("csv_headers", []),
            "csv_data": data.get("csv_data"),
            "svg_content": data.get("svg_content", ""),
            "svg_filename": data.get("svg_filename", ""),
            "elements": data.get("elements", []),
            "preview_jpg": data.get("preview_jpg", ""),
            "tipo": data.get("tipo", "SEQUENCIAL"),
            "ticket_qtd": data.get("ticket_qtd", 1),
            "ticket_logica": data.get("ticket_logica", "PILHA")
        }
        _supabase_request("POST", "producao_numeracoes", clean_data)
        return new_id
    db = _get_db()
    db.setdefault("numeracoes", []).append(data)
    _save_db(db)
    return new_id

def update_numeracao(num_id: str, data: dict) -> bool:
    if IS_SUPABASE_ACTIVE:
        try:
            clean_data = {
                "name": data.get("name"),
                "formato_id": data.get("formato_id"),
                "csv_filename": data.get("csv_filename", ""),
                "csv_headers": data.get("csv_headers", []),
                "csv_data": data.get("csv_data"),
                "svg_content": data.get("svg_content", ""),
                "svg_filename": data.get("svg_filename", ""),
                "elements": data.get("elements", []),
                "preview_jpg": data.get("preview_jpg", ""),
                "tipo": data.get("tipo", "SEQUENCIAL"),
                "ticket_qtd": data.get("ticket_qtd", 1),
                "ticket_logica": data.get("ticket_logica", "PILHA")
            }
            res = _supabase_request("PATCH", f"producao_numeracoes?id=eq.{num_id}", clean_data)
            return bool(res)
        except Exception:
            return False
    db = _get_db()
    for i, n in enumerate(db.get("numeracoes", [])):
        if n["id"] == num_id:
            data["id"] = num_id
            db["numeracoes"][i] = data
            _save_db(db)
            return True
    return False

def delete_numeracao(num_id: str):
    if IS_SUPABASE_ACTIVE:
        try:
            _supabase_request("DELETE", f"producao_numeracoes?id=eq.{num_id}")
            return
        except Exception:
            pass
    db = _get_db()
    db["numeracoes"] = [n for n in db.get("numeracoes", []) if n["id"] != num_id]
    _save_db(db)


# ─── SAÍDAS ───────────────────────────────────────────────────────────────────

def get_saidas() -> list:
    if IS_SUPABASE_ACTIVE:
        try:
            return _supabase_request("GET", "producao_saidas?order=name.asc") or []
        except Exception:
            return []
    return _get_db().get("saidas", [])

def get_saida(sai_id: str) -> dict | None:
    if IS_SUPABASE_ACTIVE:
        try:
            res = _supabase_request("GET", f"producao_saidas?id=eq.{sai_id}")
            return res[0] if res else None
        except Exception:
            return None
    for s in get_saidas():
        if s["id"] == sai_id:
            return s
    return None

def add_saida(data: dict) -> str:
    new_id = data.get("id") or (str(uuid.uuid4()) if IS_SUPABASE_ACTIVE else ("sai_" + str(uuid.uuid4())[:8]))
    data["id"] = new_id
    if IS_SUPABASE_ACTIVE:
        clean_data = {
            "id": new_id,
            "name": data.get("name"),
            "width_mm": float(data.get("width_mm", 0)),
            "height_mm": float(data.get("height_mm", 0)),
            "file_format": data.get("file_format", "pdf")
        }
        _supabase_request("POST", "producao_saidas", clean_data)
        return new_id
    db = _get_db()
    db.setdefault("saidas", []).append(data)
    _save_db(db)
    return new_id

def update_saida(sai_id: str, data: dict) -> bool:
    if IS_SUPABASE_ACTIVE:
        try:
            clean_data = {
                "name": data.get("name"),
                "width_mm": float(data.get("width_mm", 0)),
                "height_mm": float(data.get("height_mm", 0)),
                "file_format": data.get("file_format", "pdf")
            }
            res = _supabase_request("PATCH", f"producao_saidas?id=eq.{sai_id}", clean_data)
            return bool(res)
        except Exception:
            return False
    db = _get_db()
    for i, s in enumerate(db.get("saidas", [])):
        if s["id"] == sai_id:
            data["id"] = sai_id
            db["saidas"][i] = data
            _save_db(db)
            return True
    return False

def delete_saida(sai_id: str):
    if IS_SUPABASE_ACTIVE:
        try:
            _supabase_request("DELETE", f"producao_saidas?id=eq.{sai_id}")
            return
        except Exception:
            pass
    db = _get_db()
    db["saidas"] = [s for s in db.get("saidas", []) if s["id"] != sai_id]
    _save_db(db)


# ─── CORES ───────────────────────────────────────────────────────────────────

def get_cores() -> list:
    if IS_SUPABASE_ACTIVE:
        try:
            return _supabase_request("GET", "producao_cores?order=name.asc") or []
        except Exception:
            return []
    return _get_db().get("cores", [])

def get_cor(cor_id: str) -> dict | None:
    if IS_SUPABASE_ACTIVE:
        try:
            res = _supabase_request("GET", f"producao_cores?id=eq.{cor_id}")
            return res[0] if res else None
        except Exception:
            return None
    for c in get_cores():
        if c["id"] == cor_id:
            return c
    return None

def add_cor(data: dict) -> str:
    new_id = data.get("id") or (str(uuid.uuid4()) if IS_SUPABASE_ACTIVE else ("cor_" + str(uuid.uuid4())[:8]))
    data["id"] = new_id
    if IS_SUPABASE_ACTIVE:
        clean_data = {
            "id": new_id,
            "name": data.get("name"),
            "hex": data.get("hex", ""),
            "pdf_url": data.get("pdf_url", ""),
            "pdf_filename": data.get("pdf_filename", "")
        }
        _supabase_request("POST", "producao_cores", clean_data)
        return new_id
    db = _get_db()
    db.setdefault("cores", []).append(data)
    _save_db(db)
    return new_id

def update_cor(cor_id: str, data: dict) -> bool:
    if IS_SUPABASE_ACTIVE:
        try:
            clean_data = {
                "name": data.get("name"),
                "hex": data.get("hex", ""),
                "pdf_url": data.get("pdf_url", ""),
                "pdf_filename": data.get("pdf_filename", "")
            }
            res = _supabase_request("PATCH", f"producao_cores?id=eq.{cor_id}", clean_data)
            return bool(res)
        except Exception:
            return False
    db = _get_db()
    for i, c in enumerate(db.get("cores", [])):
        if c["id"] == cor_id:
            data["id"] = cor_id
            db["cores"][i] = data
            _save_db(db)
            return True
    return False

def delete_cor(cor_id: str):
    if IS_SUPABASE_ACTIVE:
        try:
            _supabase_request("DELETE", f"producao_cores?id=eq.{cor_id}")
            return
        except Exception:
            pass
    db = _get_db()
    db["cores"] = [c for c in db.get("cores", []) if c["id"] != cor_id]
    _save_db(db)


# ─── MODELOS DE IMPOSIÇÃO ──────────────────────────────────────────────────────

def get_modelos_imposicao() -> list:
    if IS_SUPABASE_ACTIVE:
        try:
            res = _supabase_request("GET", "producao_modelos_imposicao?order=name.asc") or []
            flat_res = []
            for m in res:
                cfg = m.get("config") or {}
                flat_res.append({
                    "id": m["id"],
                    "name": m["name"],
                    "formato_id": m.get("formato_id"),
                    "saida_id": m.get("saida_id"),
                    "numeracao_id": m.get("numeracao_id"),
                    "cor_id": m.get("cor_id"),
                    **cfg
                })
            return flat_res
        except Exception:
            return []
    return _get_db().get("modelos_imposicao", [])

def get_modelo_imposicao(mod_id: str) -> dict | None:
    if IS_SUPABASE_ACTIVE:
        try:
            res = _supabase_request("GET", f"producao_modelos_imposicao?id=eq.{mod_id}")
            if res:
                m = res[0]
                cfg = m.get("config") or {}
                return {
                    "id": m["id"],
                    "name": m["name"],
                    "formato_id": m.get("formato_id"),
                    "saida_id": m.get("saida_id"),
                    "numeracao_id": m.get("numeracao_id"),
                    "cor_id": m.get("cor_id"),
                    **cfg
                }
            return None
        except Exception:
            return None
    for m in get_modelos_imposicao():
        if m["id"] == mod_id:
            return m
    return None

def add_modelo_imposicao(data: dict) -> str:
    new_id = data.get("id") or (str(uuid.uuid4()) if IS_SUPABASE_ACTIVE else ("mod_" + str(uuid.uuid4())[:8]))
    data["id"] = new_id
    if IS_SUPABASE_ACTIVE:
        name = data.get("name", "Modelo")
        formato_id = data.get("formato_id")
        saida_id = data.get("saida_id")
        numeracao_id = data.get("numeracao_id")
        cor_id = data.get("cor_id")
        config = dict(data)
        for k in ("id", "name", "formato_id", "saida_id", "numeracao_id", "cor_id"):
            if k in config:
                del config[k]
        clean_data = {
            "id": new_id,
            "name": name,
            "formato_id": formato_id,
            "saida_id": saida_id,
            "numeracao_id": numeracao_id,
            "cor_id": cor_id,
            "config": config
        }
        _supabase_request("POST", "producao_modelos_imposicao", clean_data)
        return new_id
    db = _get_db()
    db.setdefault("modelos_imposicao", []).append(data)
    _save_db(db)
    return new_id

def update_modelo_imposicao(mod_id: str, data: dict) -> bool:
    if IS_SUPABASE_ACTIVE:
        try:
            name = data.get("name", "Modelo")
            formato_id = data.get("formato_id")
            saida_id = data.get("saida_id")
            numeracao_id = data.get("numeracao_id")
            cor_id = data.get("cor_id")
            config = dict(data)
            for k in ("id", "name", "formato_id", "saida_id", "numeracao_id", "cor_id"):
                if k in config:
                    del config[k]
            clean_data = {
                "name": name,
                "formato_id": formato_id,
                "saida_id": saida_id,
                "numeracao_id": numeracao_id,
                "cor_id": cor_id,
                "config": config
            }
            res = _supabase_request("PATCH", f"producao_modelos_imposicao?id=eq.{mod_id}", clean_data)
            return bool(res)
        except Exception:
            return False
    db = _get_db()
    for i, m in enumerate(db.get("modelos_imposicao", [])):
        if m["id"] == mod_id:
            data["id"] = mod_id
            db["modelos_imposicao"][i] = data
            _save_db(db)
            return True
    return False

def delete_modelo_imposicao(mod_id: str):
    if IS_SUPABASE_ACTIVE:
        try:
            _supabase_request("DELETE", f"producao_modelos_imposicao?id=eq.{mod_id}")
            return
        except Exception:
            pass
    db = _get_db()
    db["modelos_imposicao"] = [m for m in db.get("modelos_imposicao", []) if m["id"] != mod_id]
    _save_db(db)


# ─── ORDENS DE SERVIÇO ────────────────────────────────────────────────────────

def get_ordens() -> list:
    if IS_SUPABASE_ACTIVE:
        try:
            res = _supabase_request("GET", "producao_ordens_servico?select=*,producao_os_itens(id)")
            if not res:
                return []
            for os in res:
                os["_itens_count"] = len(os.get("producao_os_itens", []))
                if "producao_os_itens" in os:
                    del os["producao_os_itens"]
            return res
        except Exception:
            return []
            
    db_data = _get_db()
    ordens = db_data.get("ordens_servico", [])
    os_itens = db_data.get("os_itens", [])
    for os_item in ordens:
        os_item["_itens_count"] = len([i for i in os_itens if i.get("os_id") == os_item["id"]])
    return ordens

def get_os_itens(os_id: str) -> list:
    if IS_SUPABASE_ACTIVE:
        try:
            return _supabase_request("GET", f"producao_os_itens?os_id=eq.{os_id}&order=created_at.asc") or []
        except Exception:
            return []
            
    db_data = _get_db()
    return [i for i in db_data.get("os_itens", []) if i.get("os_id") == os_id]

def update_os_item(item_id: str, data: dict) -> bool:
    if IS_SUPABASE_ACTIVE:
        try:
            clean_data = {}
            for key in ["impressao", "formato_id", "cor_id", "numeracao_id"]:
                if key in data:
                    clean_data[key] = data[key]
            if not clean_data:
                return True
            res = _supabase_request("PATCH", f"producao_os_itens?id=eq.{item_id}", clean_data)
            return bool(res)
        except Exception:
            return False
            
    db_data = _get_db()
    for i, item in enumerate(db_data.get("os_itens", [])):
        if item["id"] == item_id:
            for key in ["impressao", "formato_id", "cor_id", "numeracao_id"]:
                if key in data:
                    db_data["os_itens"][i][key] = data[key]
            _save_db(db_data)
            return True
    return False

# — MAPAS DE TEATRO —

def get_mapas_teatro() -> list:
    if IS_SUPABASE_ACTIVE:
        try:
            res = _supabase_request("GET", "producao_mapas_teatro?order=name.asc") or []
            return res
        except Exception:
            return []
    db = _get_db()
    return db.get("mapas_teatro", [])

def get_mapa_teatro(mapa_id: str) -> dict | None:
    if IS_SUPABASE_ACTIVE:
        try:
            res = _supabase_request("GET", f"producao_mapas_teatro?id=eq.{mapa_id}")
            if res:
                return res[0]
            return None
        except Exception:
            return None
    db = _get_db()
    for m in db.get("mapas_teatro", []):
        if m["id"] == mapa_id:
            return m
    return None

def add_mapa_teatro(data: dict) -> str:
    new_id = data.get("id") or (str(uuid.uuid4()) if IS_SUPABASE_ACTIVE else ("mapa_" + str(uuid.uuid4())[:8]))
    data["id"] = new_id
    if IS_SUPABASE_ACTIVE:
        clean_data = {
            "id": new_id,
            "name": data.get("name", "Novo Mapa"),
            "config": data.get("config", {}),
            "total_lugares": data.get("total_lugares", 0),
            "lugares_por_setor": data.get("lugares_por_setor", [])
        }
        _supabase_request("POST", "producao_mapas_teatro", clean_data)
        return new_id
    
    db = _get_db()
    if "mapas_teatro" not in db:
        db["mapas_teatro"] = []
    db["mapas_teatro"].append(data)
    _save_db(db)
    return new_id

def update_mapa_teatro(mapa_id: str, data: dict) -> bool:
    if IS_SUPABASE_ACTIVE:
        try:
            clean_data = {}
            if "name" in data:
                clean_data["name"] = data["name"]
            if "config" in data:
                clean_data["config"] = data["config"]
            if "total_lugares" in data:
                clean_data["total_lugares"] = data["total_lugares"]
            if "lugares_por_setor" in data:
                clean_data["lugares_por_setor"] = data["lugares_por_setor"]
            
            if not clean_data: return True
            res = _supabase_request("PATCH", f"producao_mapas_teatro?id=eq.{mapa_id}", clean_data)
            return bool(res)
        except Exception:
            return False
            
    db = _get_db()
    for i, m in enumerate(db.get("mapas_teatro", [])):
        if m["id"] == mapa_id:
            db["mapas_teatro"][i].update(data)
            _save_db(db)
            return True
    return False

def delete_mapa_teatro(mapa_id: str):
    if IS_SUPABASE_ACTIVE:
        try:
            _supabase_request("DELETE", f"producao_mapas_teatro?id=eq.{mapa_id}")
            return
        except Exception:
            pass
        return

    db = _get_db()
    if "mapas_teatro" in db:
        db["mapas_teatro"] = [m for m in db["mapas_teatro"] if m["id"] != mapa_id]
        _save_db(db)
