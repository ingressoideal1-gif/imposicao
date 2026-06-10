import json
import os
import uuid

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

# ─── Internal helpers ──────────────────────────────────────────────────────────

def _migrate_old_db(data: dict) -> dict:
    """Migra o schema antigo (input_formats / output_formats) para o novo."""
    if "formatos" in data:
        return data  # já está no novo formato

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

    # Verificar se precisa de migração
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
    return _get_db().get("formatos", [])


def get_formato(fmt_id: str) -> dict | None:
    for f in get_formatos():
        if f["id"] == fmt_id:
            return f
    return None


def add_formato(data: dict) -> str:
    db = _get_db()
    new_id = "fmt_" + str(uuid.uuid4())[:8]
    data["id"] = new_id
    db.setdefault("formatos", []).append(data)
    _save_db(db)
    return new_id


def update_formato(fmt_id: str, data: dict) -> bool:
    db = _get_db()
    for i, f in enumerate(db.get("formatos", [])):
        if f["id"] == fmt_id:
            data["id"] = fmt_id
            db["formatos"][i] = data
            _save_db(db)
            return True
    return False


def delete_formato(fmt_id: str):
    db = _get_db()
    db["formatos"] = [f for f in db.get("formatos", []) if f["id"] != fmt_id]
    _save_db(db)


# ─── NUMERAÇÕES ───────────────────────────────────────────────────────────────

def get_numeracoes() -> list:
    return _get_db().get("numeracoes", [])


def get_numeracao(num_id: str) -> dict | None:
    for n in get_numeracoes():
        if n["id"] == num_id:
            return n
    return None


def add_numeracao(data: dict) -> str:
    db = _get_db()
    # Se já existe numeração com mesmo nome, substitui (Bug 2)
    name = data.get("name", "").strip().lower()
    for i, n in enumerate(db.get("numeracoes", [])):
        if n.get("name", "").strip().lower() == name:
            data["id"] = n["id"]
            db["numeracoes"][i] = data
            _save_db(db)
            return n["id"]
    # Nova numeração
    new_id = "num_" + str(uuid.uuid4())[:8]
    data["id"] = new_id
    db.setdefault("numeracoes", []).append(data)
    _save_db(db)
    return new_id


def update_numeracao(num_id: str, data: dict) -> bool:
    db = _get_db()
    for i, n in enumerate(db.get("numeracoes", [])):
        if n["id"] == num_id:
            data["id"] = num_id
            db["numeracoes"][i] = data
            _save_db(db)
            return True
    return False


def delete_numeracao(num_id: str):
    db = _get_db()
    db["numeracoes"] = [n for n in db.get("numeracoes", []) if n["id"] != num_id]
    _save_db(db)


# ─── SAÍDAS ───────────────────────────────────────────────────────────────────

def get_saidas() -> list:
    return _get_db().get("saidas", [])


def get_saida(sai_id: str) -> dict | None:
    for s in get_saidas():
        if s["id"] == sai_id:
            return s
    return None


def add_saida(data: dict) -> str:
    db = _get_db()
    new_id = "sai_" + str(uuid.uuid4())[:8]
    data["id"] = new_id
    db.setdefault("saidas", []).append(data)
    _save_db(db)
    return new_id


def update_saida(sai_id: str, data: dict) -> bool:
    db = _get_db()
    for i, s in enumerate(db.get("saidas", [])):
        if s["id"] == sai_id:
            data["id"] = sai_id
            db["saidas"][i] = data
            _save_db(db)
            return True
    return False


def delete_saida(sai_id: str):
    db = _get_db()
    db["saidas"] = [s for s in db.get("saidas", []) if s["id"] != sai_id]
    _save_db(db)


# ─── CORES ───────────────────────────────────────────────────────────────────

def get_cores() -> list:
    return _get_db().get("cores", [])


def get_cor(cor_id: str) -> dict | None:
    for c in get_cores():
        if c["id"] == cor_id:
            return c
    return None


def add_cor(data: dict) -> str:
    db = _get_db()
    new_id = "cor_" + str(uuid.uuid4())[:8]
    data["id"] = new_id
    db.setdefault("cores", []).append(data)
    _save_db(db)
    return new_id


def update_cor(cor_id: str, data: dict) -> bool:
    db = _get_db()
    for i, c in enumerate(db.get("cores", [])):
        if c["id"] == cor_id:
            data["id"] = cor_id
            db["cores"][i] = data
            _save_db(db)
            return True
    return False


def delete_cor(cor_id: str):
    db = _get_db()
    db["cores"] = [c for c in db.get("cores", []) if c["id"] != cor_id]
    _save_db(db)


# ─── MODELOS DE IMPOSIÇÃO ──────────────────────────────────────────────────────

def get_modelos_imposicao() -> list:
    return _get_db().get("modelos_imposicao", [])


def get_modelo_imposicao(mod_id: str) -> dict | None:
    for m in get_modelos_imposicao():
        if m["id"] == mod_id:
            return m
    return None


def add_modelo_imposicao(data: dict) -> str:
    db = _get_db()
    new_id = "mod_" + str(uuid.uuid4())[:8]
    data["id"] = new_id
    db.setdefault("modelos_imposicao", []).append(data)
    _save_db(db)
    return new_id


def update_modelo_imposicao(mod_id: str, data: dict) -> bool:
    db = _get_db()
    for i, m in enumerate(db.get("modelos_imposicao", [])):
        if m["id"] == mod_id:
            data["id"] = mod_id
            db["modelos_imposicao"][i] = data
            _save_db(db)
            return True
    return False


def delete_modelo_imposicao(mod_id: str):
    db = _get_db()
    db["modelos_imposicao"] = [m for m in db.get("modelos_imposicao", []) if m["id"] != mod_id]
    _save_db(db)

