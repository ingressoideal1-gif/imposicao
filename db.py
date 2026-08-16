import json
import os
import uuid
import urllib.request
import urllib.parse
import urllib.error

import sys
import datetime

# Resolve o diretório correto para o banco de dados local persistente
if getattr(sys, 'frozen', False):
    DB_DIR = os.path.dirname(sys.executable)
else:
    DB_DIR = os.path.dirname(os.path.abspath(__file__))

DB_FILE = os.path.join(DB_DIR, "formats_db.json")

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
    "numeracoes": [
        {
            "id": "num_1",
            "name": "Numeração Padrão",
            "print_mode": "front",
            "elements": [
                {
                    "type": "TEXT",
                    "text": "Nº #NUM#",
                    "x": 10,
                    "y": 10,
                    "font": "Helvetica-Bold",
                    "size": 12,
                    "color": "#ff0000"
                }
            ]
        }
    ],
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
    "cores": [
        {
            "id": "cor_1",
            "name": "Preto",
            "hex": "#000000"
        },
        {
            "id": "cor_2",
            "name": "Azul",
            "hex": "#0000ff"
        }
    ],
    "modelos_imposicao": [],
    "ordens_servico": [
        {
            "id": "os_1",
            "numero": "2501",
            "cliente": "Gráfica Ideal - Show Local",
            "vendedor": "Junior",
            "status": "ARTE_EM_ANDAMENTO",
            "status_interno": "ARTE",
            "status_arte": "Em Arte",
            "created_at": "2026-07-06T12:00:00Z"
        },
        {
            "id": "os_2",
            "numero": "2502",
            "cliente": "Teatro Central - Peça Infantil",
            "vendedor": "Junior",
            "status": "EM IMPRESSÃO",
            "status_interno": "EM PRODUCAO",
            "status_arte": "Aprovada",
            "created_at": "2026-07-06T12:05:00Z"
        }
    ],
    "os_itens": [
        {
            "id": "item_1",
            "os_id": "os_1",
            "produto_nome": "Ingresso VIP Camarote A",
            "nome_modelo": "Ingresso VIP Camarote A",
            "produto": "Ingresso VIP Camarote A",
            "qtd": 500,
            "quantidade": 500,
            "cor": "Preto",
            "padrao": "Preto",
            "numeracao": "Numeração Padrão",
            "num_inicial": 1,
            "numeracao_inicio": 1,
            "num_final": 500,
            "numeracao_fim": 500,
            "verso": False,
            "verso_tipo": "SÓ FRENTE",
            "impressao": "AGUARD.",
            "status_producao": "AGUARD.",
            "amostra_status": "PENDENTE",
            "status_arte": "PENDENTE",
            "formato_id": "fmt_1",
            "cor_id": "cor_1",
            "amostra_cor_id": "cor_1",
            "numeracao_id": "num_1",
            "amostra_num_id": "num_1",
            "setor": "PVC",
            "_dbLoaded": True
        },
        {
            "id": "item_2",
            "os_id": "os_2",
            "produto_nome": "Bilhete Plateia Geral",
            "nome_modelo": "Bilhete Plateia Geral",
            "produto": "Bilhete Plateia Geral",
            "qtd": 1000,
            "quantidade": 1000,
            "cor": "Azul",
            "padrao": "Azul",
            "numeracao": "Numeração Padrão",
            "num_inicial": 1,
            "numeracao_inicio": 1,
            "num_final": 1000,
            "numeracao_fim": 1000,
            "verso": False,
            "verso_tipo": "SÓ FRENTE",
            "impressao": "AGUARD.",
            "status_producao": "AGUARD.",
            "amostra_status": "APROVADA",
            "status_arte": "APROVADA",
            "formato_id": "fmt_2",
            "cor_id": "cor_2",
            "amostra_cor_id": "cor_2",
            "numeracao_id": "num_1",
            "amostra_num_id": "num_1",
            "setor": "PVC",
            "_dbLoaded": True
        }
    ]
}

# ─── CARREGAR CREDENCIAIS SUPABASE DO PARCEIRO VIBECODE ────────────────────────

DEFAULT_SUPABASE_URL = "https://vwbtitjlpelrcnsytzqw.supabase.co"
DEFAULT_SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ3YnRpdGpscGVscmNuc3l0enF3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg5NzE5NTEsImV4cCI6MjA2NDU0Nzk1MX0.te1kg9RKJUQ-gBQ7YiXLDk-Ej8JMNcujIzIR-fTGR-o"

ENV_LOCAL = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env.local")


def ler_env_local(chave: str, padrao=None):
    """Lê uma chave do `.env.local` — o arquivo de segredos que o git ignora.

    Existe como função nomeada porque o mesmo segredo tem três origens possíveis
    conforme onde o código roda: variável de ambiente no Render, `.env.local` em
    desenvolvimento, e nada na estação. Antes isso era um laço solto aqui em
    cima que só conhecia duas chaves; o controle de acesso precisa de outras.

    Devolve `padrao` quando o arquivo não existe ou a chave não está lá. Nunca
    levanta: um `.env.local` malformado não pode impedir o app de subir.
    """
    if not os.path.exists(ENV_LOCAL):
        return padrao
    try:
        with open(ENV_LOCAL, "r", encoding="utf-8") as f:
            for linha in f:
                linha = linha.strip()
                if not linha or linha.startswith("#"):
                    continue
                partes = linha.split("=", 1)
                if len(partes) != 2:
                    continue
                k, v = partes[0].strip(), partes[1].strip()
                if k != chave:
                    continue
                if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
                    v = v[1:-1]
                return v
    except Exception as e:
        print(f"[db.py] Erro ao ler .env.local: {e}")
    return padrao


SUPABASE_URL = ler_env_local("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = ler_env_local("NEXT_PUBLIC_SUPABASE_ANON_KEY")

# Sobrescrever via variáveis de ambiente se presentes
SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", SUPABASE_URL)
SUPABASE_KEY = os.environ.get("NEXT_PUBLIC_SUPABASE_ANON_KEY", SUPABASE_KEY)

# Fallback para os valores padrão do parceiro Vibecode
if not SUPABASE_URL:
    SUPABASE_URL = DEFAULT_SUPABASE_URL
if not SUPABASE_KEY:
    SUPABASE_KEY = DEFAULT_SUPABASE_KEY

# A chave de serviço, quando este processo a tiver. Existe no Render e em
# desenvolvimento; NUNCA nas estações, por decisão registrada em
# `acesso_api.py` — ela abre o banco inteiro, incluindo cliente, proposta e
# financeiro do parceiro.
#
# Desde 16/08/2026 ela é o que faz as escritas em `imposition_user_permissions` e
# `imposition_acessos_locais` funcionarem: aquelas duas tabelas passaram a ter
# RLS, e a chave anônima — que é pública e está no código-fonte de toda página —
# deixou de poder escrever nelas. Ver `sql/rls_acessos_e_permissoes.sql`.
SUPABASE_SERVICE_KEY = (os.environ.get("SUPABASE_SERVICE_KEY")
                        or ler_env_local("SUPABASE_SERVICE_KEY"))

import sys
# Forçar modo local no executável compilado (Windows Agent) para rodar 100% offline
if getattr(sys, 'frozen', False):
    IS_SUPABASE_ACTIVE = False
else:
    IS_SUPABASE_ACTIVE = bool(SUPABASE_URL and SUPABASE_KEY)

if IS_SUPABASE_ACTIVE:
    print(f"[db.py] Supabase do Vibecode ativo: {SUPABASE_URL}")
else:
    print("[db.py] Supabase inativo, operando em modo 100% local/offline (formats_db.json)")


# ─── UTILITÁRIO SUPABASE REST REQUEST ──────────────────────────────────────────

def _supabase_request(method: str, path: str, body: dict = None) -> list | dict | None:
    if not IS_SUPABASE_ACTIVE:
        return None
    return _supabase_call(method, path, body)


def _supabase_call(method: str, path: str, body: dict = None,
                   silencioso: bool = False) -> list | dict | None:
    """A requisição em si, sem perguntar se o Supabase está "ativo".

    Existe separada porque `IS_SUPABASE_ACTIVE` é False de propósito no executável,
    para que o CATÁLOGO seja lido do disco (decisão de desempenho: a imposição roda na
    estação). Quem precisa ESCREVER no banco compartilhado a partir da estação — o
    cadastro de fonte, por exemplo — entra por aqui. Sem essa separação, a escrita
    devolvia None em silêncio e a fonte morria na estação onde foi cadastrada.

    `silencioso` é para quem já trata a falha e não quer a linha vermelha: o erro
    continua subindo, só não vira ruído no log. Quem chama assim tem a obrigação de
    avisar por conta própria, uma vez.
    """
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
        if not silencioso:
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

FONTES_BUCKET_URL = "https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/fontes/"


def _nome_objeto_fonte(nome_arquivo: str) -> str:
    """Mesma normalizacao usada ao enviar as fontes para o Storage."""
    import unicodedata
    base = unicodedata.normalize("NFKD", nome_arquivo)
    base = base.encode("ascii", "ignore").decode("ascii")
    return "".join(c if (c.isalnum() or c in "._-") else "_" for c in base)


def _nome_objeto_fonte_google(url: str) -> str:
    """Nome do objeto para uma fonte que vinha do fonts.gstatic.com.

    Derivado APENAS da URL de origem, que e o que a estacao tem guardado — assim
    o calculo aqui bate com o que foi usado no envio, sem tabela de conversao.
    """
    import hashlib
    return "google/" + hashlib.sha1(url.encode("utf-8")).hexdigest()[:16] + ".ttf"


def _migrar_fontes_para_storage(data: dict) -> bool:
    """Aponta todo o catalogo para o Storage: nenhuma fonte de origem externa.

    Necessario porque este arquivo e PERSISTENTE ao lado do executavel: o MSI
    instala apenas o NewProd.exe e nunca o substitui. Estacoes atualizadas
    continuavam com o catalogo antigo, e as fontes falhavam tanto na imposicao
    quanto na tela, sem erro visivel para o operador.

    Dois casos:
      /fonts_local/...      -> pasta que deixou de ser empacotada na 1.2.5
      fonts.gstatic.com/... -> a rede da grafica alcanca o Supabase mas nao o
                               Google, entao as 94 fontes web tambem migraram
    """
    alterou = False
    for fonte in data.get("catalogo_fontes", []):
        url = fonte.get("arquivo_url") or ""
        if url.startswith("/fonts_local/"):
            nome = url.split("/fonts_local/")[-1]
            fonte["arquivo_url"] = FONTES_BUCKET_URL + _nome_objeto_fonte(nome)
            alterou = True
        elif "gstatic.com" in url:
            fonte["arquivo_url"] = FONTES_BUCKET_URL + _nome_objeto_fonte_google(url)
            alterou = True

    # Registro de teste que sobrou no catalogo e aparece na lista do operador
    # como se fosse fonte. O alvo e exato de proposito — nao remover por heuristica.
    antes = len(data.get("catalogo_fontes", []))
    data["catalogo_fontes"] = [
        f for f in data.get("catalogo_fontes", [])
        if (f.get("arquivo_url") or "").rstrip("/") != "http://test.com"
    ]
    if len(data["catalogo_fontes"]) != antes:
        print("[db] catalogo: removida a entrada de teste 'http://test.com'")
        alterou = True

    return alterou


def _banco_empacotado() -> dict | None:
    """Le o formats_db.json que veio DENTRO do executavel (pasta _MEIPASS).

    Nao e o mesmo arquivo do DB_FILE: aquele fica ao lado do .exe e persiste
    entre versoes; este vem no pacote e traz o catalogo de fabrica.
    """
    if getattr(sys, "frozen", False):
        base = getattr(sys, "_MEIPASS", "")
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    if not base:
        return None
    caminho = os.path.join(base, "formats_db.json")
    if not os.path.isfile(caminho):
        return None
    if os.path.abspath(caminho) == os.path.abspath(DB_FILE):
        return None   # em desenvolvimento sao o mesmo arquivo
    try:
        with open(caminho, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        print(f"[db] Nao consegui ler o banco empacotado: {e}")
        return None


def init_db():
    if not os.path.exists(DB_FILE):
        # Semear do arquivo empacotado, nao do DEFAULT_DB: o DEFAULT_DB nao tem
        # catalogo_fontes, entao toda instalacao limpa ficava com ZERO fontes —
        # sem @font-face no navegador e com o engine caindo em Helvetica. Foi o
        # que aconteceu nas estacoes da grafica, onde as fontes nunca
        # funcionaram; nas maquinas com instalacao antiga o arquivo ja existia e
        # o defeito passava despercebido.
        empacotado = _banco_empacotado()
        _save_db(empacotado or DEFAULT_DB)
        if empacotado:
            print(f"[db] {DB_FILE} criado a partir do banco empacotado no agente "
                  f"({len(empacotado.get('catalogo_fontes', []))} fontes)")

    with open(DB_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    mudou = False
    if "input_formats" in data or "formatos" not in data:
        data = _migrate_old_db(data)
        mudou = True

    # Reparo para quem ja ficou com o catalogo vazio antes desta correcao.
    if not data.get("catalogo_fontes"):
        empacotado = _banco_empacotado()
        if empacotado and empacotado.get("catalogo_fontes"):
            data["catalogo_fontes"] = empacotado["catalogo_fontes"]
            print(f"[db] Catalogo de fontes estava vazio; "
                  f"{len(data['catalogo_fontes'])} fontes restauradas do pacote")
            mudou = True

    if _migrar_fontes_para_storage(data):
        print(f"[db] Catalogo de fontes migrado para o Storage em {DB_FILE}")
        mudou = True

    if mudou:
        _save_db(data)

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
            "ticket_logica": data.get("ticket_logica", "PILHA"),
            "Cli_Num": data.get("Cli_Num"),
            "print_mode": data.get("print_mode", "front")
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
                "ticket_logica": data.get("ticket_logica", "PILHA"),
                "Cli_Num": data.get("Cli_Num"),
                "print_mode": data.get("print_mode", "front")
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
            "pdf_filename": data.get("pdf_filename", ""),
            "formato_id": data.get("formato_id"),
            "width_mm": float(data["width_mm"]) if data.get("width_mm") is not None else None,
            "height_mm": float(data["height_mm"]) if data.get("height_mm") is not None else None,
            "pdf_base64": data.get("pdf_base64"),
            "frente_verso": bool(data.get("frente_verso", False)),
            "name_verso": data.get("name_verso", ""),
            "pdf_verso_base64": data.get("pdf_verso_base64")
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
                "pdf_filename": data.get("pdf_filename", ""),
                "formato_id": data.get("formato_id"),
                "width_mm": float(data["width_mm"]) if data.get("width_mm") is not None else None,
                "height_mm": float(data["height_mm"]) if data.get("height_mm") is not None else None,
                "pdf_base64": data.get("pdf_base64"),
                "frente_verso": bool(data.get("frente_verso", False)),
                "name_verso": data.get("name_verso", ""),
                "pdf_verso_base64": data.get("pdf_verso_base64")
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

# ─── Catálogo de fontes: uma lista só, com cópia em disco ─────────────────────
#
# A lista mora na tabela `catalogo_fontes` do Supabase (ver
# `sql/schema_catalogo_fontes.sql`). Os binários sempre estiveram no Storage; o que
# mudou em 15/08/2026 é onde mora a LISTA.
#
# Por que mudou: até então a lista era um arquivo em disco na máquina que respondia
# ao painel. Quando o operador abria o painel pelo site publicado, quem respondia era
# o Render — cujo disco volta ao conteúdo versionado a cada publicação. Quatro fontes
# cadastradas em 14/08 sumiram na publicação seguinte, e a numeração 1000289 passou a
# exibir o nome da fonte no seletor mas a desenhar com outra. Guardar só na estação
# não resolvia: o link que o cliente abre para aprovar a arte lê o catálogo da nuvem.
#
# ── A regra que não pode ser quebrada ──
#
# A ESTAÇÃO NUNCA VAI À REDE PARA LER O CATÁLOGO. A imposição roda na estação por
# causa de tempo, e o operador está de pé na frente da impressora. Por isso a leitura
# do agente sai sempre do `formats_db.json` em disco; quem atualiza essa cópia é o
# `sincronizar_catalogo_fontes` do agent_worker, em segundo plano.
#
# `IS_SUPABASE_ACTIVE` é False de propósito no executável (ver o topo deste arquivo) e
# é exatamente isso que separa os dois mundos: quem tem essa flag ligada (a nuvem e o
# desenvolvimento) não guarda cópia sincronizada e portanto lê da tabela; quem a tem
# desligada (a estação) lê do disco. A ESCRITA é outra história — ver
# `_catalogo_remoto_ativo`.

# Memória curta da lista para quem lê da tabela. Sem ela, uma tela que desenha 40
# elementos faria 40 consultas. Não vale para a estação, que lê do disco.
#
# `tentar_depois_de` cobre o caso do erro: enquanto a tabela não tiver sido criada, ou
# a rede estiver fora, a consulta é adiada em vez de repetida a cada chamada. Sem isso
# o motor imprimia uma linha vermelha por leitura de catálogo — e log vermelho de
# rotina treina qualquer um a ignorar log vermelho, que foi metade do motivo de o
# catálogo ter virado local em 14/08.
_CATALOGO_MEMO = {"lista": None, "expira": 0.0, "tentar_depois_de": 0.0, "avisou": False}
_CATALOGO_MEMO_S = 60


def _catalogo_remoto_ativo() -> bool:
    """Dá para gravar a fonte na tabela compartilhada?

    Depende só de haver URL e chave — NÃO de `IS_SUPABASE_ACTIVE`, que a estação
    desliga de propósito para ler o catálogo do disco. Amarrar a escrita àquela flag
    faria a fonte cadastrada numa estação morrer ali mesmo, sem nunca chegar às outras
    nem ao link do cliente: o defeito de 14/08 de novo, só que mais silencioso.

    É o mesmo erro que já aconteceu uma vez com a fila de impressão — ver
    `agent_worker._relay_ativo`.
    """
    return bool(SUPABASE_URL and SUPABASE_KEY)


def _catalogo_do_disco() -> list:
    return list(_get_db().get("catalogo_fontes", []))


def guardar_catalogo_local(lista: list) -> bool:
    """Grava no `formats_db.json` a lista vinda da tabela. Devolve se mudou algo.

    Usado pelo sincronismo do agente. Uma lista VAZIA é recusada: um erro de rede que
    devolvesse `[]` deixaria a estação sem nenhuma fonte, e aí toda arte sairia em
    Helvetica sem ninguém entender por quê.
    """
    if not lista:
        return False
    db = _get_db()
    if db.get("catalogo_fontes") == lista:
        return False
    db["catalogo_fontes"] = lista
    _save_db(db)
    return True


def get_catalogo_fontes() -> list:
    """Lista as fontes do catálogo.

    Na estação: do disco, sempre, sem tocar na rede.
    Na nuvem e no desenvolvimento: da tabela, com memória de 60s e queda para o disco
    se a consulta falhar — o link do cliente sem catálogo nenhum desenharia toda a
    arte com fonte genérica, o que é pior do que uma lista velha.
    """
    if not IS_SUPABASE_ACTIVE:
        return _catalogo_do_disco()

    import time
    agora = time.time()
    if _CATALOGO_MEMO["lista"] is not None and agora < _CATALOGO_MEMO["expira"]:
        return list(_CATALOGO_MEMO["lista"])
    if agora < _CATALOGO_MEMO["tentar_depois_de"]:
        return _catalogo_do_disco()

    try:
        lista = _supabase_call("GET", "catalogo_fontes?select=*&order=nome.asc",
                               silencioso=True) or []
    except Exception as e:
        lista = []
        if not _CATALOGO_MEMO["avisou"]:
            _CATALOGO_MEMO["avisou"] = True
            print(f"[db] Catalogo compartilhado indisponivel ({e}); "
                  f"usando a copia em disco. Aviso dado uma vez por processo.")

    if not lista:
        _CATALOGO_MEMO["tentar_depois_de"] = agora + _CATALOGO_MEMO_S
        return _catalogo_do_disco()

    _CATALOGO_MEMO["lista"] = lista
    _CATALOGO_MEMO["expira"] = agora + _CATALOGO_MEMO_S
    _CATALOGO_MEMO["avisou"] = False
    return list(lista)


def save_catalogo_fonte(fonte_data: dict) -> dict:
    """Salva uma fonte no catálogo compartilhado e na cópia em disco.

    Duplicata de nome é RECUSADA pelo índice único da tabela, e aqui isso vira "já
    existe, fica a que estava" — nunca troca o binário de uma fonte já usada em arte
    aprovada. É a mesma regra que o frontend aplica antes de enviar; o índice é a
    garantia de verdade, para o caso de duas estações subirem a mesma fonte juntas.
    """
    fid = fonte_data.get("id") or str(uuid.uuid4())
    fonte_data["id"] = fid

    if _catalogo_remoto_ativo():
        try:
            gravada = _supabase_call("POST", "catalogo_fontes", fonte_data)
            if gravada:
                fonte_data = gravada[0] if isinstance(gravada, list) else gravada
        except Exception as e:
            if "23505" in str(e) or "duplicate key" in str(e).lower():
                nome = (fonte_data.get("nome") or "").strip()
                print(f"[db] Fonte '{nome}' ja existia no catalogo; mantida a que estava.")
                existente = _fonte_por_nome(nome)
                if existente:
                    return existente
            else:
                print(f"[db] Nao consegui gravar a fonte no catalogo compartilhado: {e}")

    _CATALOGO_MEMO["lista"] = None
    db = _get_db()
    catalogo = [f for f in db.get("catalogo_fontes", []) if f.get("id") != fonte_data["id"]]
    catalogo.append(fonte_data)
    db["catalogo_fontes"] = catalogo
    _save_db(db)
    return fonte_data


def _fonte_por_nome(nome: str) -> dict | None:
    """A fonte já cadastrada com este nome, olhando a tabela quando dá.

    Consulta a tabela em vez da cópia em disco porque quem chama acabou de tomar uma
    recusa por duplicata: a linha que ganhou a corrida está lá e pode ainda não ter
    chegado ao disco desta estação.
    """
    alvo = (nome or "").strip().lower()
    if _catalogo_remoto_ativo():
        try:
            achadas = _supabase_call(
                "GET", f"catalogo_fontes?nome=ilike.{urllib.parse.quote(alvo)}&limit=1")
            if achadas:
                return achadas[0]
        except Exception:
            pass
    for f in _catalogo_do_disco():
        if (f.get("nome") or "").strip().lower() == alvo:
            return f
    return None


def delete_catalogo_fonte(fonte_id: str):
    """Remove uma fonte do catálogo compartilhado e da cópia em disco.

    O binário no Storage continua onde está: apagá-lo quebraria qualquer arte antiga
    que ainda aponte para aquela URL, e guardar o arquivo é barato.
    """
    if _catalogo_remoto_ativo():
        try:
            _supabase_call("DELETE", f"catalogo_fontes?id=eq.{urllib.parse.quote(fonte_id)}")
        except Exception as e:
            print(f"[db] Nao consegui remover a fonte do catalogo compartilhado: {e}")

    _CATALOGO_MEMO["lista"] = None
    db = _get_db()
    if "catalogo_fontes" in db:
        db["catalogo_fontes"] = [f for f in db["catalogo_fontes"] if f.get("id") != fonte_id]
        _save_db(db)

def _headers():
    return {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}"
    }


def _headers_servico():
    """Cabeçalhos com a chave de SERVIÇO, para o que o RLS fecha à chave pública.

    Levanta `BancoIndisponivel` quando este processo não tem a chave — o que é o
    caso de toda estação, de propósito.

    Falhar alto aqui é o ponto. Sem isto, a escrita sairia com a chave anônima,
    o PostgREST responderia 200 com ZERO linhas afetadas (é assim que o RLS
    recusa um UPDATE: a linha simplesmente não existe para quem pediu), e o
    painel diria "permissão ativada" para uma gravação que nunca aconteceu.
    Um administrador não tem como desconfiar de um visto verde — a mesma lição
    que o `upsert_user_permissions` já carrega no próprio docstring.
    """
    if not SUPABASE_SERVICE_KEY:
        raise BancoIndisponivel(
            "Esta operacao so acontece pela nuvem: a chave de servico do banco "
            "nao vai para as estacoes. Use o painel em imposicao.vercel.app."
        )
    return {
        "apikey": SUPABASE_SERVICE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_KEY}",
    }

# ─── Configuracao de impressao por produto ────────────────────────────────────
# Fica em disco, nesta maquina, e nao no banco compartilhado: nome de impressora,
# IDs de bandeja e tamanhos de papel sao propriedades fisicas da estacao. Guardar
# isso no Supabase fazia duas estacoes disputarem a mesma linha (a chave era so
# produto_id), e a ultima a salvar sobrescrevia a outra.
#
# Fica ao lado do executavel, como o formats_db.json, entao sobrevive a
# atualizacao do agente — o MSI substitui apenas o NewProd.exe.
PRINT_CONFIG_FILE = os.path.join(DB_DIR, "print_configs.json")


def _semear_print_configs() -> dict:
    """Na primeira vez, herda do Supabase o que pertencer a esta maquina.

    Nao ha como saber a qual estacao cada linha antiga pertence — as tabelas
    nunca tiveram identificacao de agente. O criterio possivel e a impressora:
    se ela existe nesta maquina, a configuracao era daqui.
    """
    if not IS_SUPABASE_ACTIVE:
        return {}
    try:
        import print_service
        locais = {p.lower() for p in print_service.get_printers()}
    except Exception:
        return {}

    herdadas = {}
    for tabela in ("producao_print_config", "producao_config_impressora"):
        try:
            url = f"{SUPABASE_URL}/rest/v1/{tabela}?select=*"
            req = urllib.request.Request(url, headers=_headers(), method='GET')
            with urllib.request.urlopen(req, timeout=8) as resp:
                linhas = json.loads(resp.read().decode('utf-8'))
        except Exception:
            continue
        for linha in linhas:
            impressora = (linha.get("printer_name") or "").lower()
            pid = str(linha.get("produto_id") or "")
            if pid and impressora in locais and pid not in herdadas:
                herdadas[pid] = linha

    if herdadas:
        print(f"[db] print_configs: {len(herdadas)} config(s) herdada(s) do Supabase "
              f"(impressora presente nesta maquina)")
        _salvar_print_configs(herdadas)
    return herdadas


def _carregar_print_configs() -> dict:
    if not os.path.exists(PRINT_CONFIG_FILE):
        return _semear_print_configs()
    try:
        with open(PRINT_CONFIG_FILE, "r", encoding="utf-8") as f:
            return json.load(f) or {}
    except Exception as e:
        print(f"[db] print_configs ilegivel ({e}); recomecando vazio")
        return {}


def _salvar_print_configs(configs: dict):
    tmp = PRINT_CONFIG_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(configs, f, ensure_ascii=False, indent=2)
    os.replace(tmp, PRINT_CONFIG_FILE)   # troca atomica: nunca meio arquivo


def get_print_config(produto_id):
    """Config de impressao deste produto, nesta maquina."""
    return _carregar_print_configs().get(str(produto_id))


def upsert_print_config(data):
    """Grava a config do produto. Todos os campos enviados sao preservados."""
    pid = str(data.get("produto_id") or "").strip()
    if not pid:
        print("[db] upsert_print_config: produto_id ausente")
        return False
    try:
        configs = _carregar_print_configs()
        data['updated_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        configs[pid] = data
        _salvar_print_configs(configs)
        print(f"[db] print_config salva para o produto {pid} "
              f"({data.get('printer_name')})")
        return True
    except Exception as e:
        print(f"[db] upsert_print_config erro: {e}")
        return False


def list_print_configs():
    """Todas as configs desta maquina — util para diagnostico."""
    return _carregar_print_configs()


# ─── Pastas observadas (hot folder) ───────────────────────────────────────────
# Lista branca dos caminhos que podem receber PDF. Fica ao lado do
# print_configs.json, e pela mesma razao: pasta e propriedade fisica da estacao.
#
# A lista existe por seguranca, nao por organizacao. O endpoint que grava um PDF
# num caminho qualquer e uma primitiva de escrita em disco, e o agente aceita
# requisicao de origem externa por CORS — sem a lista, qualquer pagina aberta no
# navegador do operador poderia gravar arquivos na estacao. So entra aqui o que
# o proprio operador escolheu no seletor nativo ou validou explicitamente.
HOT_FOLDER_FILE = os.path.join(DB_DIR, "hot_folders.json")


def _carregar_hot_folders() -> list:
    if not os.path.exists(HOT_FOLDER_FILE):
        return []
    try:
        with open(HOT_FOLDER_FILE, "r", encoding="utf-8") as f:
            dados = json.load(f) or []
        return [d for d in dados if isinstance(d, dict) and d.get("path")]
    except Exception as e:
        print(f"[db] hot_folders ilegivel ({e}); recomecando vazio")
        return []


def _salvar_hot_folders(pastas: list):
    tmp = HOT_FOLDER_FILE + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(pastas, f, ensure_ascii=False, indent=2)
    os.replace(tmp, HOT_FOLDER_FILE)   # troca atomica: nunca meio arquivo


def _chave_hot_folder(caminho: str) -> str:
    """Forma canonica para comparar caminhos. Espelha hotfolder.normalizar()."""
    if not caminho:
        return ""
    return os.path.normcase(os.path.abspath(os.path.normpath(caminho.strip())))


def list_hot_folders() -> list:
    """Pastas ja registradas nesta estacao."""
    return _carregar_hot_folders()


def hot_folder_registrada(caminho: str) -> bool:
    alvo = _chave_hot_folder(caminho)
    if not alvo:
        return False
    return any(_chave_hot_folder(p.get("path")) == alvo for p in _carregar_hot_folders())


def metodo_hot_folder(caminho: str) -> str | None:
    """Como gravar nesta pasta, se a estacao tiver dito algo diferente do padrao.

    Existe para poder trocar o modo de gravacao editando o hot_folders.json e
    reiniciando o agente, sem esperar um release novo. O modo importa mais do
    que parece: e ele que decide se o RIP enxerga o arquivo (ver hotfolder.py).
    """
    alvo = _chave_hot_folder(caminho)
    if not alvo:
        return None
    for p in _carregar_hot_folders():
        if _chave_hot_folder(p.get("path")) == alvo:
            return (p.get("metodo") or "").strip() or None
    return None


def registrar_hot_folder(caminho: str) -> bool:
    """Autoriza esta pasta a receber PDF. Idempotente."""
    alvo = (caminho or "").strip()
    if not alvo:
        return False
    if hot_folder_registrada(alvo):
        return True
    try:
        pastas = _carregar_hot_folders()
        pastas.append({
            "path": alvo,
            "registrada_em": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        })
        _salvar_hot_folders(pastas)
        print(f"[db] hot folder registrada: {alvo}")
        return True
    except Exception as e:
        print(f"[db] registrar_hot_folder erro: {e}")
        return False


class BancoIndisponivel(RuntimeError):
    """Nao deu para perguntar ao banco. NAO significa 'nao existe'.

    Existe porque as duas respostas chegavam iguais ao navegador — `null` para
    "este usuario nao tem linha" e `null` para "o Supabase nao respondeu" — e o
    painel tratava as duas como primeiro acesso. Com o motor lento (o Render
    dorme, e o timeout aqui e de 8s), isso GRAVAVA o perfil visualizador por cima
    das permissoes reais de quem so estava entrando de novo.
    """


def get_user_permissions(user_id):
    """Permissoes do Imposition de um usuario.

    Devolve None quando o usuario nao tem linha, e levanta BancoIndisponivel
    quando a pergunta nao chegou ao banco. Quem chama PRECISA distinguir os dois
    antes de gravar qualquer coisa.
    """
    if not IS_SUPABASE_ACTIVE:
        raise BancoIndisponivel("Supabase desativado neste processo")
    try:
        url = f"{SUPABASE_URL}/rest/v1/imposition_user_permissions?user_id=eq.{user_id}&select=*"
        req = urllib.request.Request(url, headers=_headers_servico(), method='GET')
        with urllib.request.urlopen(req, timeout=8) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return data[0] if data else None
    except Exception as e:
        print(f"[db] get_user_permissions erro: {e}")
        raise BancoIndisponivel(str(e)) from e


def list_all_user_permissions():
    """Lista as permissoes de todos os usuarios.

    Tambem levanta BancoIndisponivel em vez de devolver lista vazia: uma lista
    vazia por falha de rede significaria "nao ha nenhum usuario ainda", e e
    exatamente isso que faz o painel conceder ADMIN ao proximo que entrar.
    """
    if not IS_SUPABASE_ACTIVE:
        raise BancoIndisponivel("Supabase desativado neste processo")
    try:
        url = f"{SUPABASE_URL}/rest/v1/imposition_user_permissions?select=*&order=created_at.asc"
        req = urllib.request.Request(url, headers=_headers_servico(), method='GET')
        with urllib.request.urlopen(req, timeout=8) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except Exception as e:
        print(f"[db] list_all_user_permissions erro: {e}")
        raise BancoIndisponivel(str(e)) from e


def upsert_user_permissions(data):
    """Grava as permissoes de um usuario (upsert por user_id) e devolve a linha.

    Levanta BancoIndisponivel quando o Supabase recusa. Antes devolvia False, o
    endpoint respondia {"ok": false} com HTTP 200, e o card de Usuarios — que nem
    olhava a resposta — dizia "permissao ativada" para uma gravacao que nunca
    aconteceu. Um administrador nao tem como desconfiar de um visto verde.
    """
    if not IS_SUPABASE_ACTIVE:
        raise BancoIndisponivel("Supabase desativado neste processo")
    try:
        data['updated_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        body = json.dumps(data).encode('utf-8')
        url = f"{SUPABASE_URL}/rest/v1/imposition_user_permissions?on_conflict=user_id"
        headers = _headers_servico()
        headers['Content-Type'] = 'application/json'
        headers['Prefer'] = 'resolution=merge-duplicates,return=representation'
        req = urllib.request.Request(url, data=body, headers=headers, method='POST')
        with urllib.request.urlopen(req, timeout=10) as resp:
            result = resp.read().decode('utf-8')
            print(f"[db] upsert_user_permissions: {resp.status} -> {result[:200]}")
            linhas = json.loads(result) if result.strip() else []
            # Resposta vazia é gravação que não aconteceu. Devolver `data` aqui
            # era dizer "salvo" com base no que o CHAMADOR mandou, e não no que
            # o banco gravou -- e é assim que uma recusa de RLS (200, zero
            # linhas) vira visto verde na tela do administrador.
            if not linhas:
                raise BancoIndisponivel(
                    "o banco aceitou a requisicao e nao gravou linha nenhuma")
            return linhas[0]
    except urllib.error.HTTPError as e:
        # O corpo do erro do PostgREST diz o motivo (coluna que nao existe,
        # RLS ligado, chave unica). Sem ele a tela so poderia dizer "deu erro".
        detalhe = ""
        try:
            detalhe = e.read().decode('utf-8')[:300]
        except Exception:
            pass
        print(f"[db] upsert_user_permissions erro HTTP {e.code}: {detalhe}")
        raise BancoIndisponivel(detalhe or f"HTTP {e.code}") from e
    except BancoIndisponivel:
        # Já é a exceção certa, com a mensagem certa. Sem esta linha ela cairia
        # no `except Exception` abaixo e seria embrulhada em si mesma.
        raise
    except Exception as e:
        print(f"[db] upsert_user_permissions erro: {e}")
        raise BancoIndisponivel(str(e)) from e



def delete_user_permissions(user_id):
    """Remove permissões de um usuário."""
    if not IS_SUPABASE_ACTIVE:
        return False
    try:
        url = f"{SUPABASE_URL}/rest/v1/imposition_user_permissions?user_id=eq.{user_id}"
        req = urllib.request.Request(url, headers=_headers_servico(), method='DELETE')
        with urllib.request.urlopen(req, timeout=8) as resp:
            return True
    except Exception as e:
        print(f"[db] delete_user_permissions erro: {e}")
        return False


# ─── ACESSO LOCAL AO NEWPROD ──────────────────────────────────────────────────
# Lista própria de operadores, sem vínculo com as contas do sistema: quem opera a
# estação não tem conta no Supabase, e exigir uma colocaria a rede no caminho de
# quem só quer imprimir. Quem escolhe o código é o administrador — ele digita, lê
# na tela e entrega ao operador.

ALFABETO_CODIGO_ACESSO = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
TAMANHO_CODIGO_ACESSO = 6


class CodigoInvalido(ValueError):
    """O código que o administrador digitou não serve. A mensagem vai à tela."""


def normalizar_codigo_acesso(codigo) -> str:
    """Maiúsculas e sem espaços — quem digita não precisa acertar a forma."""
    return "".join(str(codigo or "").split()).upper()


def validar_codigo_acesso(codigo, existentes=None) -> str:
    """Confere o código escolhido pelo administrador e devolve a forma gravável.

    Recebe os códigos já em uso em vez de consultar o banco aqui: quem chama já
    tem a lista, e a conferência de duplicidade fica antes da gravação — a
    mensagem "esse código já é de outro operador" é muito mais útil do que o erro
    de chave única que o Postgres devolveria.
    """
    limpo = normalizar_codigo_acesso(codigo)
    if len(limpo) != TAMANHO_CODIGO_ACESSO:
        raise CodigoInvalido(
            f"O codigo precisa ter exatamente {TAMANHO_CODIGO_ACESSO} caracteres.")
    if any(c not in ALFABETO_CODIGO_ACESSO for c in limpo):
        raise CodigoInvalido("O codigo aceita apenas letras e numeros.")
    usados = {normalizar_codigo_acesso(c) for c in (existentes or []) if c}
    if limpo in usados:
        raise CodigoInvalido("Esse codigo ja esta em uso por outro operador.")
    return limpo


def listar_acessos_locais():
    """Lista os operadores com acesso ao NewProd local.

    Levanta `BancoIndisponivel` quando a pergunta não chegou ao banco, em vez de
    devolver lista vazia. Devolver `[]` dizia ao Menu Usuários "não há operador
    nenhum cadastrado" — e o administrador que lesse isso cadastraria de novo
    quem já existe, ou concluiria que a tranca da estação sumiu. É a mesma lição
    do freio em `sincronizar_acessos`: resposta vazia por recusa não é resposta
    vazia por verdade.

    A leitura sai pela chave de SERVIÇO desde 16/08/2026. A chave anônima perdeu
    o `SELECT` desta tabela (`sql/rls_acessos_e_permissoes.sql`, passo 3) porque
    ela é pública — está no código-fonte de toda página do painel — e com ela
    qualquer pessoa lia os códigos de acesso da gráfica.
    """
    if not IS_SUPABASE_ACTIVE:
        raise BancoIndisponivel("Supabase desativado neste processo")
    try:
        url = f"{SUPABASE_URL}/rest/v1/imposition_acessos_locais?select=*&order=nome.asc"
        req = urllib.request.Request(url, headers=_headers_servico(), method='GET')
        with urllib.request.urlopen(req, timeout=8) as resp:
            return json.loads(resp.read().decode('utf-8'))
    except BancoIndisponivel:
        raise
    except Exception as e:
        print(f"[db] listar_acessos_locais erro: {e}")
        raise BancoIndisponivel(str(e)) from e


def salvar_acesso_local(data):
    """Cria ou atualiza um acesso local (upsert por id).

    Criar exige o código digitado pelo administrador. Atualizar sem a chave
    `codigo` no corpo não toca no código — mudar o perfil de alguém não pode
    trocar a senha dele e deixá-lo do lado de fora sem ninguém entender por quê.

    Levanta CodigoInvalido quando o código não serve; quem chama transforma isso
    em mensagem na tela.
    """
    if not IS_SUPABASE_ACTIVE:
        return None

    registro = dict(data or {})
    agora = datetime.datetime.now(datetime.timezone.utc).isoformat()
    registro['atualizado_em'] = agora
    criando = not registro.get('id')

    if criando:
        registro['id'] = str(uuid.uuid4())
        registro['criado_em'] = agora
        registro.setdefault('ativo', True)
        registro.setdefault('permissoes', {})

    # Fora do try: CodigoInvalido precisa chegar a quem chamou, e não virar um
    # "nao foi possivel salvar" que não diz o que houve de errado.
    if criando or 'codigo' in registro:
        usados = [a.get('codigo') for a in listar_acessos_locais()
                  if a.get('id') != registro['id']]
        registro['codigo'] = validar_codigo_acesso(registro.get('codigo'), usados)

    # Criar e atualizar sao verbos diferentes aqui, e nao um upsert so.
    #
    # O upsert do PostgREST e um INSERT com ON CONFLICT: ele valida o corpo como
    # se fosse linha nova. Um corpo parcial — trocar o perfil, desativar — nao
    # traz `nome` nem `codigo`, que sao NOT NULL, e a requisicao morre com 400
    # antes de chegar ao UPDATE. O PATCH so escreve as colunas que vieram, que e
    # exatamente o que "atualizacao parcial" quer dizer.
    try:
        headers = _headers_servico()
        headers['Content-Type'] = 'application/json'
        headers['Prefer'] = 'return=representation'

        if criando:
            url = f"{SUPABASE_URL}/rest/v1/imposition_acessos_locais"
            metodo = 'POST'
        else:
            alvo = urllib.parse.quote(str(registro.pop('id')), safe='')
            url = f"{SUPABASE_URL}/rest/v1/imposition_acessos_locais?id=eq.{alvo}"
            metodo = 'PATCH'

        body = json.dumps(registro).encode('utf-8')
        req = urllib.request.Request(url, data=body, headers=headers, method=metodo)
        with urllib.request.urlopen(req, timeout=10) as resp:
            resultado = json.loads(resp.read().decode('utf-8') or '[]')
            # Resposta VAZIA é gravação que não aconteceu, e não sucesso. Era
            # `return registro`, e isso diria "salvo" para um PATCH que não casou
            # linha nenhuma -- inclusive para o caso em que o RLS recusa, que
            # responde 200 com zero linhas. Visto verde sobre gravação que não
            # existiu é o defeito mais caro desta tela.
            if not resultado:
                print("[db] salvar_acesso_local: o banco nao devolveu linha "
                      "(id inexistente, ou escrita recusada).")
                return None
            return resultado[0]
    except BancoIndisponivel:
        # A mensagem dela diz o que fazer ("use o painel da nuvem"). Virar None
        # aqui a trocaria por "nao foi possivel salvar", que não diz nada.
        raise
    except urllib.error.HTTPError as e:
        print(f"[db] salvar_acesso_local erro: {e} -> {e.read().decode('utf-8')[:300]}")
        return None
    except Exception as e:
        print(f"[db] salvar_acesso_local erro: {e}")
        return None


def excluir_acesso_local(acesso_id):
    """Remove um acesso local."""
    if not IS_SUPABASE_ACTIVE:
        return False
    try:
        url = f"{SUPABASE_URL}/rest/v1/imposition_acessos_locais?id=eq.{acesso_id}"
        req = urllib.request.Request(url, headers=_headers_servico(), method='DELETE')
        with urllib.request.urlopen(req, timeout=8):
            return True
    except BancoIndisponivel:
        raise
    except Exception as e:
        print(f"[db] excluir_acesso_local erro: {e}")
        return False


def get_email_config() -> dict:
    """Busca configurações salvas do servidor SMTP de e-mail."""
    if IS_SUPABASE_ACTIVE:
        try:
            res = _supabase_request("GET", "configuracoes_email?id=eq.default")
            if res and len(res) > 0:
                return res[0]
        except Exception as e:
            print(f"[db] get_email_config Supabase erro: {e}")
    db_data = _get_db()
    return db_data.get("email_config", {})


def save_email_config(config: dict) -> bool:
    """Salva configurações do servidor SMTP de e-mail."""
    config["updated_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    if IS_SUPABASE_ACTIVE:
        try:
            config["id"] = "default"
            body = json.dumps(config).encode('utf-8')
            url = f"{SUPABASE_URL}/rest/v1/configuracoes_email?on_conflict=id"
            headers = _headers()
            headers['Content-Type'] = 'application/json'
            headers['Prefer'] = 'resolution=merge-duplicates,return=representation'
            req = urllib.request.Request(url, data=body, headers=headers, method='POST')
            with urllib.request.urlopen(req, timeout=10) as resp:
                print(f"[db] save_email_config Supabase: {resp.status}")
        except Exception as e:
            print(f"[db] save_email_config Supabase erro: {e}")

    db_data = _get_db()
    db_data["email_config"] = config
    _save_db(db_data)
    return True


def send_email_smtp(to_email: str, subject: str, body_text: str, body_html: str = None, smtp_config: dict = None) -> dict:
    """Realiza o disparo de e-mail via servidor SMTP (TLS/SSL)."""
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    config = smtp_config or get_email_config()
    email_remetente = config.get("email_remetente") or os.getenv("SMTP_EMAIL_REMETENTE") or "atendimento@ingressoideal.com.br"
    nome_remetente = config.get("nome_remetente") or os.getenv("SMTP_NOME_REMETENTE") or "Ingresso Ideal"
    host = config.get("host") or os.getenv("SMTP_HOST")
    port = int(config.get("port") or os.getenv("SMTP_PORT") or 587)
    user = config.get("user") or os.getenv("SMTP_USER") or email_remetente
    password = config.get("password") or os.getenv("SMTP_PASSWORD")
    use_tls = config.get("use_tls", True)
    use_ssl = config.get("use_ssl", False) or port == 465

    if not host or not user or not password:
        return {"ok": False, "error": "Servidor SMTP não configurado. Por favor, cadastre o e-mail remetente e as credenciais nas configurações de e-mail do sistema."}

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"{nome_remetente} <{email_remetente}>"
        msg["To"] = to_email

        if body_text:
            msg.attach(MIMEText(body_text, "plain", "utf-8"))
        if body_html:
            msg.attach(MIMEText(body_html, "html", "utf-8"))
        elif body_text:
            # Converter quebras de linha em <br> para HTML limpo
            html_content = f"""<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.6;">
                {body_text.replace(chr(10), '<br>')}
            </div>"""
            msg.attach(MIMEText(html_content, "html", "utf-8"))

        if use_ssl or port == 465:
            server = smtplib.SMTP_SSL(host, port, timeout=15)
        else:
            server = smtplib.SMTP(host, port, timeout=15)
            if use_tls:
                server.starttls()

        server.login(user, password)
        server.sendmail(email_remetente, [to_email], msg.as_string())
        server.quit()

        return {"ok": True, "message": f"E-mail enviado com sucesso para {to_email}!"}
    except Exception as e:
        print(f"[SMTP Error] Erro ao enviar e-mail para {to_email}:", e)
        return {"ok": False, "error": str(e)}

