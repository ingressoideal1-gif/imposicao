import json
import shutil
import tempfile
import os

# ─── Monkeypatch Starlette MultiPartParser para permitir uploads/campos maiores (ex: PDFs em base64 grandes) ───
import starlette.formparsers
_original_init = starlette.formparsers.MultiPartParser.__init__
def _patched_init(self, *args, **kwargs):
    kwargs["max_part_size"] = 100 * 1024 * 1024  # Aumenta o limite para 100MB
    _spool_max_size = 100 * 1024 * 1024          # Aumenta o limite do spool
    self.spool_max_size = _spool_max_size
    _original_init(self, *args, **kwargs)
starlette.formparsers.MultiPartParser.__init__ = _patched_init

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Request, BackgroundTasks
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
import io

DIAG_LOGS = []
def log_diag(msg: str):
    import datetime
    now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    DIAG_LOGS.append(f"[{now}] {msg}")
    print(f"[{now}] {msg}")
from engine import ImpositionConfig, ImpositionEngine
import db
import print_service
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Iniciar o worker de impressão local em uma thread paralela de forma robusta
    import threading
    try:
        import agent_worker
        worker_thread = threading.Thread(target=agent_worker.run_loop, daemon=True, name="IdealAgentWorker")
        worker_thread.start()
        print("[app] Print worker thread (Cloud Relay) iniciada com sucesso.")
    except Exception as e:
        print(f"[app] Erro ao inicializar worker de impressão: {e}")
    yield

app = FastAPI(title="Ideal Imposition API", description="Sistema de Imposição Gráfica com Dados Variáveis", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_private_network=True,
)

@app.middleware("http")
async def add_pna_header(request: Request, call_next):
    response = await call_next(request)
    if request.headers.get("access-control-request-private-network") == "true" or request.headers.get("Access-Control-Request-Private-Network") == "true":
        response.headers["Access-Control-Allow-Private-Network"] = "true"
    return response

import sys
_FRONTEND_DIR = None
if getattr(sys, 'frozen', False):
    # Pasta do PyInstaller onde os recursos compilados são extraídos
    _FRONTEND_DIR = os.path.join(getattr(sys, '_MEIPASS', ''), "frontend")
else:
    # Pasta local em desenvolvimento
    _FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend")

if not _FRONTEND_DIR or not os.path.isdir(_FRONTEND_DIR):
    for _candidate in [
        os.path.join(os.path.dirname(sys.executable), "frontend"),
        "frontend"
    ]:
        if os.path.isdir(_candidate):
            _FRONTEND_DIR = _candidate
            break

if not _FRONTEND_DIR or not os.path.isdir(_FRONTEND_DIR):
    _FRONTEND_DIR = "frontend"
    os.makedirs(_FRONTEND_DIR, exist_ok=True)

app.mount("/app", StaticFiles(directory=_FRONTEND_DIR, html=True), name="frontend")

# ─── ROTAS UTILITÁRIAS ────────────────────────────────────────────────────────

@app.get("/", include_in_schema=False)
def root_redirect():
    """Redireciona a raiz para o frontend."""
    return RedirectResponse(url="/app/index.html")

@app.get("/api/health")
def health_check():
    """Endpoint de health check — usado pelo frontend para pré-aquecer o servidor."""
    return {"status": "ok"}

LOCAL_AGENT_VERSION = "v358"

@app.get("/api/status")
def read_root():
    return {"status": "running", "message": "Ideal Imposition Agent ativo", "version": LOCAL_AGENT_VERSION, "capabilities": ["impose", "print"]}

@app.get("/api/version")
def version_info():
    """Retorna versão/commit para confirmar qual código está rodando."""
    return {"version": LOCAL_AGENT_VERSION, "commit": "local_agent_" + LOCAL_AGENT_VERSION, "desc": "strict_assembly_v2", "engine": "fastpath+garbage4"}

@app.post("/api/update")
async def trigger_update(request: Request):
    try:
        data = await request.json()
        download_url = data.get("download_url")
        if not download_url:
            raise HTTPException(status_code=400, detail="download_url não informado")
            
        import urllib.request
        import subprocess
        import sys
        
        is_compiled = getattr(sys, 'frozen', False)
        exe_path = sys.executable
        
        # Pasta do executável
        target_dir = os.path.dirname(exe_path)
        temp_exe = os.path.join(target_dir, "ideal-imposition-agent.new")
        
        # Baixar o novo executável
        print(f"[Update] Baixando atualização de {download_url}...")
        req = urllib.request.Request(download_url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=60) as response:
            with open(temp_exe, "wb") as f_out:
                f_out.write(response.read())
        print(f"[Update] Download concluído. Salvo em {temp_exe}")
        
        if not is_compiled:
            # Em modo de desenvolvimento, apenas removemos o temp e simulamos
            if os.path.exists(temp_exe):
                os.remove(temp_exe)
            return {"status": "success", "message": "[DEV MODE] Simulação de atualização realizada com sucesso."}
            
        # Escrever script batch de atualização
        bat_path = os.path.join(target_dir, "update.bat")
        with open(bat_path, "w", encoding="utf-8") as f_bat:
            f_bat.write(f"""@echo off
chcp 65001 > nul
echo Aguardando o encerramento do agente...
timeout /t 2 /nobreak > nul
echo Substituindo executável antigo...
move /y "{temp_exe}" "{exe_path}"
echo Inicializando nova versão...
start "" "{exe_path}"
echo Atualização concluída.
del "%~f0"
""")
            
        # Executar bat de forma assíncrona desanexada
        print(f"[Update] Executando script de atualização {bat_path}...")
        subprocess.Popen([bat_path], shell=True, creationflags=subprocess.CREATE_NEW_CONSOLE)
        
        # Forçar o encerramento imediato do processo atual
        print("[Update] Encerrando processo atual...")
        os._exit(0)
        
    except Exception as e:
        print(f"[Update] Falha na atualização: {e}")
        raise HTTPException(status_code=500, detail=f"Falha na atualização: {str(e)}")


@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    """Retorna 204 para evitar erros de favicon no console."""
    from fastapi.responses import Response
    return Response(status_code=204)

@app.get("/api/proxy")
async def proxy_url(url: str):
    import requests
    from fastapi.responses import Response
    try:
        r = requests.get(url, timeout=10)
        return Response(content=r.content, media_type=r.headers.get("content-type", "application/pdf"))
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ─── AUTENTICAÇÃO E CONTROLE DE PERMISSÕES ─────────────────────────────────────
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi import Depends

security_scheme = HTTPBearer(auto_error=False)

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security_scheme)):
    # Sem auth por enquanto (Supabase RLS disabled)
    return {"uid": "local-fallback-user", "email": "local@ideal.com", "admin": True, "editor": True}

async def check_admin(user: dict = Depends(get_current_user)):
    if not user.get("admin", False):
        raise HTTPException(
            status_code=403,
            detail="Acesso restrito a administradores."
        )
    return user

# ─── ROTAS ADMINISTRATIVAS DE USUÁRIOS ──────────────────────────────────────────
@app.get("/api/admin/users")
async def admin_list_users(admin_user: dict = Depends(check_admin)):
    """Lista todos os usuários registrados no Firebase Auth."""
    return []

@app.post("/api/admin/users/{uid}/role")
async def admin_set_user_role(uid: str, payload: dict, admin_user: dict = Depends(check_admin)):
    """Atualiza o papel (role) de um usuário específico."""
    raise HTTPException(status_code=501, detail="Não implementado com Supabase.")


# ─── FORMATOS ─────────────────────────────────────────────────────────────────

@app.get("/api/formatos")
def list_formatos(user: dict = Depends(get_current_user)):
    return db.get_formatos()

@app.get("/api/formatos/{fmt_id}")
def get_formato(fmt_id: str, user: dict = Depends(get_current_user)):
    f = db.get_formato(fmt_id)
    if not f:
        raise HTTPException(status_code=404, detail="Formato não encontrado")
    return f

@app.post("/api/formatos")
async def create_formato(request: Request, user: dict = Depends(get_current_user)):
    data = await request.json()
    new_id = db.add_formato(data)
    return {"id": new_id, "status": "success"}

@app.put("/api/formatos/{fmt_id}")
async def update_formato(fmt_id: str, request: Request, user: dict = Depends(get_current_user)):
    data = await request.json()
    ok = db.update_formato(fmt_id, data)
    if not ok:
        raise HTTPException(status_code=404, detail="Formato não encontrado")
    return {"status": "success"}

@app.delete("/api/formatos/{fmt_id}")
def delete_formato(fmt_id: str, user: dict = Depends(get_current_user)):
    db.delete_formato(fmt_id)
    return {"status": "success"}

# ─── NUMERAÇÕES ───────────────────────────────────────────────────────────────

@app.get("/api/numeracoes")
def list_numeracoes(user: dict = Depends(get_current_user)):
    return db.get_numeracoes()

@app.get("/api/numeracoes/{num_id}")
def get_numeracao(num_id: str, user: dict = Depends(get_current_user)):
    n = db.get_numeracao(num_id)
    if not n:
        raise HTTPException(status_code=404, detail="Numeração não encontrada")
    return n

@app.post("/api/numeracoes")
async def create_numeracao(request: Request, user: dict = Depends(get_current_user)):
    data = await request.json()
    new_id = db.add_numeracao(data)
    return {"id": new_id, "status": "success"}

@app.put("/api/numeracoes/{num_id}")
async def update_numeracao(num_id: str, request: Request, user: dict = Depends(get_current_user)):
    data = await request.json()
    ok = db.update_numeracao(num_id, data)
    if not ok:
        raise HTTPException(status_code=404, detail="Numeração não encontrada")
    return {"status": "success"}

@app.delete("/api/numeracoes/{num_id}")
def delete_numeracao(num_id: str, user: dict = Depends(get_current_user)):
    db.delete_numeracao(num_id)
    return {"status": "success"}

# ─── SAÍDAS ───────────────────────────────────────────────────────────────────

@app.get("/api/saidas")
def list_saidas(user: dict = Depends(get_current_user)):
    return db.get_saidas()

@app.get("/api/saidas/{sai_id}")
def get_saida(sai_id: str, user: dict = Depends(get_current_user)):
    s = db.get_saida(sai_id)
    if not s:
        raise HTTPException(status_code=404, detail="Saída não encontrada")
    return s

@app.post("/api/saidas")
async def create_saida(request: Request, user: dict = Depends(get_current_user)):
    data = await request.json()
    new_id = db.add_saida(data)
    return {"id": new_id, "status": "success"}

@app.put("/api/saidas/{sai_id}")
async def update_saida(sai_id: str, request: Request, user: dict = Depends(get_current_user)):
    data = await request.json()
    ok = db.update_saida(sai_id, data)
    if not ok:
        raise HTTPException(status_code=404, detail="Saída não encontrada")
    return {"status": "success"}

@app.delete("/api/saidas/{sai_id}")
def delete_saida(sai_id: str, user: dict = Depends(get_current_user)):
    db.delete_saida(sai_id)
    return {"status": "success"}

# ─── CORES ────────────────────────────────────────────────────────────────────

@app.get("/api/cores")
def list_cores(user: dict = Depends(get_current_user)):
    return db.get_cores()

@app.get("/api/cores/{cor_id}")
def get_cor(cor_id: str, user: dict = Depends(get_current_user)):
    c = db.get_cor(cor_id)
    if not c:
        raise HTTPException(status_code=404, detail="Cor não encontrada")
    return c

@app.post("/api/cores")
async def create_cor(request: Request, user: dict = Depends(get_current_user)):
    data = await request.json()
    new_id = db.add_cor(data)
    return {"id": new_id, "status": "success"}

@app.put("/api/cores/{cor_id}")
async def update_cor(cor_id: str, request: Request, user: dict = Depends(get_current_user)):
    data = await request.json()
    ok = db.update_cor(cor_id, data)
    if not ok:
        raise HTTPException(status_code=404, detail="Cor não encontrada")
    return {"status": "success"}

@app.delete("/api/cores/{cor_id}")
def delete_cor(cor_id: str, user: dict = Depends(get_current_user)):
    db.delete_cor(cor_id)
    return {"status": "success"}

# ─── MODELOS DE IMPOSIÇÃO ──────────────────────────────────────────────────────

@app.get("/api/modelos_imposicao")
def list_modelos_imposicao(user: dict = Depends(get_current_user)):
    return db.get_modelos_imposicao()

@app.get("/api/modelos_imposicao/{mod_id}")
def get_modelo_imposicao(mod_id: str, user: dict = Depends(get_current_user)):
    m = db.get_modelo_imposicao(mod_id)
    if not m:
        raise HTTPException(status_code=404, detail="Modelo de imposição não encontrado")
    return m

@app.post("/api/modelos_imposicao")
async def create_modelo_imposicao(request: Request, user: dict = Depends(get_current_user)):
    data = await request.json()
    new_id = db.add_modelo_imposicao(data)
    return {"id": new_id, "status": "success"}

@app.put("/api/modelos_imposicao/{mod_id}")
async def update_modelo_imposicao(mod_id: str, request: Request, user: dict = Depends(get_current_user)):
    data = await request.json()
    ok = db.update_modelo_imposicao(mod_id, data)
    if not ok:
        raise HTTPException(status_code=404, detail="Modelo de imposição não encontrado")
    return {"status": "success"}

@app.delete("/api/modelos_imposicao/{mod_id}")
def delete_modelo_imposicao(mod_id: str, user: dict = Depends(get_current_user)):
    db.delete_modelo_imposicao(mod_id)
    return {"status": "success"}

# — MAPAS DE TEATRO —

@app.get("/api/mapas_teatro")
def list_mapas_teatro(user: dict = Depends(get_current_user)):
    return db.get_mapas_teatro()

@app.get("/api/mapas_teatro/{mapa_id}")
def get_mapa_teatro(mapa_id: str, user: dict = Depends(get_current_user)):
    m = db.get_mapa_teatro(mapa_id)
    if not m:
        raise HTTPException(status_code=404, detail="Mapa no encontrado")
    return m

@app.post("/api/mapas_teatro")
async def create_mapa_teatro(request: Request, user: dict = Depends(get_current_user)):
    data = await request.json()
    new_id = db.add_mapa_teatro(data)
    return {"id": new_id, "status": "success"}

@app.put("/api/mapas_teatro/{mapa_id}")
async def update_mapa_teatro(mapa_id: str, request: Request, user: dict = Depends(get_current_user)):
    data = await request.json()
    ok = db.update_mapa_teatro(mapa_id, data)
    if not ok:
        raise HTTPException(status_code=404, detail="Mapa no encontrado")
    return {"status": "success"}

@app.delete("/api/mapas_teatro/{mapa_id}")
def delete_mapa_teatro(mapa_id: str, user: dict = Depends(get_current_user)):
    db.delete_mapa_teatro(mapa_id)
    return {"status": "success"}

# ─── Embutir fontes do sistema nos elementos da numeração ─────────────────────

def _embed_system_fonts(numeracao_obj):
    """Embute o binário das fontes do sistema nos elementos para garantir
    que funcionem independentemente do ambiente de deploy."""
    if not numeracao_obj or "elements" not in numeracao_obj:
        return
    import glob as _glob
    import base64
    font_cache = {}  # cache_key -> base64 data
    font_dirs = [
        "C:/Windows/Fonts",
        os.path.expanduser("~/AppData/Local/Microsoft/Windows/Fonts"),
        "/usr/share/fonts",
        "/System/Library/Fonts",
        os.path.expanduser("~/Library/Fonts"),
    ]
    for el in numeracao_obj["elements"]:
        raw_fn = el.get("font_name", "")
        if not raw_fn.startswith("system:"):
            continue
        parts = raw_fn[7:].split("|")
        family = parts[0]
        is_bold = "bold" in parts[1:]
        is_italic = "italic" in parts[1:]
        cache_key = f"{family}|{'b' if is_bold else ''}|{'i' if is_italic else ''}"
        if cache_key in font_cache:
            el["_font_data"] = font_cache[cache_key]
            continue
        family_lower = family.lower().replace(" ", "")
        fam_norm = family_lower.replace("-", "").replace("_", "")
        found_file = None
        
        search_dirs = [
            os.path.join(os.path.dirname(os.path.abspath(__file__)), "fonts"),
            "C:/Windows/Fonts",
            "/usr/share/fonts",
            "/usr/local/share/fonts",
            "~/.fonts"
        ]


        for search_dir in search_dirs:
            if not os.path.isdir(os.path.expanduser(search_dir)):
                continue
            for ext in ("**/*.ttf", "**/*.otf", "**/*.TTF", "**/*.OTF"):
                for fpath in _glob.glob(os.path.join(os.path.expanduser(search_dir), ext), recursive=True):
                    base = os.path.splitext(os.path.basename(fpath))[0].lower().replace(" ", "").replace("-", "").replace("_", "")
                    bold_match = ("bold" in base) == is_bold
                    italic_match = ("italic" in base or "oblique" in base) == is_italic
                    if base.startswith(fam_norm) and bold_match and italic_match:
                        found_file = fpath
                        break
                    if fam_norm in base and not found_file:
                        if bold_match and italic_match:
                            found_file = fpath
                if found_file:
                    break
            if found_file:
                break
        if found_file:
            try:
                with open(found_file, "rb") as f:
                    font_bytes = base64.b64encode(f.read()).decode("ascii")
                    el["_font_data"] = font_bytes
                    font_cache[cache_key] = font_bytes
                    print(f"[impose] Fonte embutida: {family} -> {found_file} ({len(font_bytes)} chars b64)")
            except Exception as ex:
                print(f"[impose] Erro ao embutir fonte {family}: {ex}")

# ─── IMPOSIÇÃO ────────────────────────────────────────────────────────────────

@app.post("/api/impose")
async def impose_file(
    request: Request,
    file: UploadFile | None = File(None),
    csv_file: UploadFile | None = File(None),
    multi_artes_files: list[UploadFile] = File(default=[]),
    payload: str = Form(...),
    background_tasks: BackgroundTasks = None,
    user: dict = Depends(get_current_user)
):

    try:
        import csv
        import io
        data = json.loads(payload)

        formato = data.get("formato") or db.get_formato(data.get("formato_id"))
        saida   = data.get("saida") or db.get_saida(data.get("saida_id"))
        numeracao = data.get("numeracao") or (db.get_numeracao(data.get("numeracao_id")) if data.get("numeracao_id") else None)
        numeracao_2 = data.get("numeracao_2") or (db.get_numeracao(data.get("numeracao_2_id")) if data.get("numeracao_2_id") else None)

        # Embutir fontes do sistema nos elementos para deploy cross-platform
        _embed_system_fonts(numeracao)
        _embed_system_fonts(numeracao_2)

        # Diagnóstico de elementos na numeração (font, color, posição)
        for _num_label, _num_obj in [("numeracao", numeracao), ("numeracao_2", numeracao_2)]:
            if _num_obj and "elements" in _num_obj:
                print(f"[impose] {_num_label} tem {len(_num_obj['elements'])} elements")
                for _i, _el in enumerate(_num_obj["elements"]):
                    _t = _el.get("type", "?")
                    if _t in ("TEXT", "FIXED") or _t.startswith("TEATRO_"):
                        print(f"[impose] {_num_label} el[{_i}]: type={_t} font_name={_el.get('font_name')!r} font_size={_el.get('font_size')!r} color={_el.get('color')!r} x_mm={_el.get('x_mm')!r} y_mm={_el.get('y_mm')!r}")
                    elif _t == "PDF":
                        _pc = _el.get("pdf_content", "")
                        _preview = (_pc[:80] + "...") if len(_pc) > 80 else _pc
                        print(f"[impose] {_num_label} el[{_i}] PDF: width={_el.get('width_mm')}mm, height={_el.get('height_mm')}mm, pdf_content={_preview!r}")
                    else:
                        print(f"[impose] {_num_label} el[{_i}]: type={_t}")

        if not formato:
            raise HTTPException(status_code=400, detail="Formato não encontrado.")
        if not saida:
            raise HTTPException(status_code=400, detail="Saída não encontrada.")

        # Ler e parsear CSV se fornecido, caso contrário usar o CSV embutido na numeração se disponível
        csv_data = None
        
        mapa_teatro_id = data.get("mapa_teatro_id")
        print(f"[DEBUG TEATRO] mapa_teatro_id = {mapa_teatro_id!r}")
        if mapa_teatro_id:
            mapa = db.get_mapa_teatro(mapa_teatro_id)
            print(f"[DEBUG TEATRO] mapa loaded = {bool(mapa)}")
            if mapa:
                print(f"[DEBUG TEATRO] mapa keys = {list(mapa.keys()) if mapa else 'None'}")
                print(f"[DEBUG TEATRO] has config = {bool(mapa.get('config'))}")
                if mapa.get("config"):
                    print(f"[DEBUG TEATRO] config keys = {list(mapa['config'].keys())}")
                    print(f"[DEBUG TEATRO] has setores = {bool(mapa['config'].get('setores'))}")
                    if mapa["config"].get("setores"):
                        print(f"[DEBUG TEATRO] num setores = {len(mapa['config']['setores'])}")
                tipos_sufixos = {}
                for t in mapa["config"].get("tiposAssento", []):
                    tipos_sufixos[t.get("id")] = str(t.get("sufixo", "")).strip()

                csv_data = []
                for setor in mapa["config"]["setores"]:
                    # No frontend as cadeiras são um dicionário: setor.cadeiras
                    cadeiras_dict = setor.get("cadeiras", {})
                    assentos = list(cadeiras_dict.values())
                    
                    def sort_key(a):
                        # Tenta usar Y e X, com fallback para labels
                        y_val = a.get("y")
                        x_val = a.get("x")
                        pref = str(a.get("prefixo") or a.get("row_label") or "")
                        num_val = a.get("num") or a.get("col_label") or 0
                        
                        try:
                            num_int = int(num_val)
                        except:
                            num_int = 0

                        if y_val is not None and x_val is not None:
                            try:
                                return (0, float(y_val), float(x_val))
                            except ValueError:
                                pass
                        
                        return (1, pref, num_int)

                    assentos.sort(key=sort_key)
                    
                    for a in assentos:
                        if a.get("tipo") == "Apagado" or a.get("isErased"):
                            continue
                            
                        num_str = str(a.get("num") or a.get("col_label") or "")
                        sufixo = tipos_sufixos.get(a.get("tipo", ""), "")
                        if sufixo:
                            num_str += f" {sufixo}"
                            
                        csv_data.append({
                            "Fila": str(a.get("prefixo") or a.get("row_label") or ""),
                            "Numero": num_str,
                            "Setor": str(setor.get("nome", ""))
                        })
                print(f"[DEBUG TEATRO] csv_data gerado com {len(csv_data)} assentos")
                if csv_data:
                    print(f"[DEBUG TEATRO] primeiro assento = {csv_data[0]}")
            else:
                print(f"[DEBUG TEATRO] FALHA: mapa nao tem config/setores")

        if not csv_data:
            if csv_file and csv_file.filename:
                content = await csv_file.read()
                try:
                    decoded = content.decode("utf-8-sig")
                except UnicodeDecodeError:
                    decoded = content.decode("latin-1")
                
                reader = csv.DictReader(io.StringIO(decoded))
                csv_data = [row for row in reader]
            elif numeracao and "csv_data" in numeracao and numeracao["csv_data"]:
                csv_data = numeracao["csv_data"]

        # Detectar extensão do arquivo enviado
        base_file_path = ""
        if file:
            original_name = file.filename or "upload.pdf"
            ext = os.path.splitext(original_name)[1].lower() or ".pdf"
            if ext not in [".pdf", ".jpg", ".jpeg", ".png"]:
                raise HTTPException(status_code=400, detail=f"Formato de arquivo não suportado: {ext}")

            with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp_in:
                content = await file.read()
                tmp_in.write(content)
                base_file_path = tmp_in.name
        elif data.get("schema") != "multi_artes" and not mapa_teatro_id:
            # Sem arquivo enviado e sem mapa de teatro: tentar buscar via cor_id se for template da cor
            if data.get("is_color_template") and data.get("cor_id"):
                cor_id = data.get("cor_id")
                cor_obj = db.get_cor(cor_id)
                if cor_obj:
                    pdf_frente = cor_obj.get("pdf_base64")
                    pdf_verso = cor_obj.get("pdf_verso_base64") if (data.get("print_mode") == "duplex" and cor_obj.get("frente_verso")) else None
                    
                    if pdf_frente:
                        import base64
                        try:
                            frente_data = pdf_frente.split("base64,")[1] if "base64," in pdf_frente else pdf_frente
                            frente_bytes = base64.b64decode(frente_data)
                            
                            if pdf_verso:
                                verso_data = pdf_verso.split("base64,")[1] if "base64," in pdf_verso else pdf_verso
                                verso_bytes = base64.b64decode(verso_data)
                                
                                doc_merged = fitz.open()
                                doc_frente = fitz.open(stream=frente_bytes, filetype="pdf")
                                doc_merged.insert_pdf(doc_frente)
                                doc_frente.close()
                                
                                doc_verso = fitz.open(stream=verso_bytes, filetype="pdf")
                                doc_merged.insert_pdf(doc_verso)
                                doc_verso.close()
                                
                                with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_in:
                                    doc_merged.save(tmp_in.name)
                                    base_file_path = tmp_in.name
                                doc_merged.close()
                                print(f"[impose] Mesclados Frente e Verso da cor {cor_obj.get('name')} para imposicao duplex")
                            else:
                                with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_in:
                                    tmp_in.write(frente_bytes)
                                    base_file_path = tmp_in.name
                                print(f"[impose] Carregada apenas Frente da cor {cor_obj.get('name')} para imposicao simplex")
                        except Exception as e_cor:
                            print(f"[impose] Erro ao decodificar/mesclar PDF da cor: {e_cor}")
            
            # Se não resolveu acima, base_file_path continua vazio (engine gera apenas numeração)
            pass

        suggested_name = data.get("suggested_filename")
        if base_file_path:
            out_pdf_path = base_file_path.rsplit(".", 1)[0] + "_imposed.pdf"
        elif suggested_name:
            clean_name = os.path.basename(suggested_name)
            if not clean_name.lower().endswith(".pdf"):
                clean_name += ".pdf"
            clean_name = clean_name.replace(" ", "_")
            out_pdf_path = os.path.join(tempfile.gettempdir(), clean_name)
        else:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_out:
                out_pdf_path = tmp_out.name

        multi_artes_list = data.get("multi_artes", [])
        ma_files_map = {}
        temp_paths_ma = []

        # Matching por INDICE (mais robusto que por filename no Linux/Render)
        form_data = await request.form()
        files_list = []
        for i in range(len(multi_artes_list)):
            f = form_data.get(f"ma_file_{i}")
            if f and hasattr(f, "filename"):
                files_list.append(f)
        
        # Se não vier via ma_file_i, tenta usar o multi_artes_files (fallback local/antigo)
        if not files_list:
            files_list = list(multi_artes_files) if multi_artes_files else []
        
        file_idx = 0
        for ma in multi_artes_list:
            wants_file = ma.get("has_raw_file")
            if wants_file is None:
                wants_file = (ma.get("pdf_url") == "local_file" or not ma.get("pdf_url"))

            if wants_file and file_idx < len(files_list):
                ma_file = files_list[file_idx]
                file_idx += 1
                if ma_file and hasattr(ma_file, "filename"):
                    ext = os.path.splitext(ma_file.filename)[1] if ma_file.filename else ".pdf"
                    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp_in:
                        await ma_file.seek(0)
                        content = await ma_file.read()
                        if not content:
                            log_diag(f"[multi_artes] ARQUIVO VAZIO: {ma_file.filename}")
                        tmp_in.write(content)
                        ma["local_path"] = tmp_in.name
                        temp_paths_ma.append(tmp_in.name)
                        ma_files_map[ma_file.filename or f"arte_{file_idx}"] = tmp_in.name

        log_diag(f"[multi_artes] form_data keys: {list(form_data.keys())}")
        log_diag(f"[multi_artes] {len(files_list)} arquivo(s) resolvidos via ma_file_i, multi_artes_list size: {len(multi_artes_list)}")
        log_diag(f"[multi_artes] mapeados: {file_idx}")
        for _ma in multi_artes_list:
            log_diag(f"[multi_artes] pdf_name={_ma.get('pdf_name')!r} has_raw={_ma.get('has_raw_file')} local_path={bool(_ma.get('local_path'))}")

        # Embutir fontes do sistema nos elementos de multi_artes
        for ma in multi_artes_list:
            _embed_system_fonts(ma.get("numeracao"))
            _embed_system_fonts(ma.get("numeracao_2"))

        # Forçar print_mode para duplex se qualquer item em multi_artes tiver verso
        print_mode_val = data.get("print_mode", "front")
        if data.get("schema") == "multi_artes" or len(multi_artes_list) > 0:
            if any(ma.get("pdf_verso_url") for ma in multi_artes_list):
                print_mode_val = "duplex"


        config = ImpositionConfig(
            base_file=base_file_path,
            out_pdf=out_pdf_path,
            formato=formato,
            numeracao=numeracao,
            saida=saida,
            seq_start=data.get("seq_start", 1),
            seq_end=data.get("seq_end", 100),
            seq_increment=data.get("seq_increment", 1),
            layout_schema=data.get("schema", "sequential"),
            csv_data=csv_data,
            print_mode=print_mode_val,
            numeracao_2=numeracao_2,
            rotate_page=data.get("rotate_page", False),
            multi_artes=multi_artes_list,
            cut_stack_mode=data.get("cut_stack_mode", "independent"),
            sheets_per_block=data.get("sheets_per_block", 50),
            block_depth=data.get("block_depth", 1),
            c_ini=int(data.get("c_ini", 1) or 1),
            q_cam=int(data.get("q_cam", 0) or 0),
            l_cam=int(data.get("l_cam", 1) or 1),
            refazer_de=int(data.get("refazer_de", 0) or 0),
            refazer_ate=int(data.get("refazer_ate", 0) or 0),
            refazer_set=int(data.get("refazer_set", 1) or 1)
        )

        wants_stream = data.get("stream", False)

        if wants_stream:
            import asyncio
            import json
            loop = asyncio.get_running_loop()
            queue = asyncio.Queue()

            # Callback para enviar arquivo na fila assim que gerado
            def on_file_gen(file_info):
                path = file_info["path"]
                name = file_info["name"]
                ftype = file_info["type"]
                # Não enviar capas se refazer > 0 e o tipo for capa/contracapa
                refazer_de = int(data.get("refazer_de", 0) or 0)
                if refazer_de > 0 and ftype in ["capa", "contracapa"]:
                    return
                if os.path.exists(path):
                    with open(path, "rb") as f_pdf:
                        b64_data = base64.b64encode(f_pdf.read()).decode("utf-8")
                    loop.call_soon_threadsafe(queue.put_nowait, {
                        "type": "file",
                        "name": name,
                        "file_type": ftype,
                        "data": b64_data
                    })

            engine = ImpositionEngine(config, on_file_generated=on_file_gen)
            print(f"[DIAG impose stream] schema={data.get('schema')!r} cut_stack_mode={data.get('cut_stack_mode')!r}")

            async def run_engine_task():
                try:
                    await asyncio.to_thread(engine.process)
                except Exception as e:
                    import traceback
                    traceback.print_exc()
                    await queue.put({"type": "error", "message": str(e)})
                finally:
                    await asyncio.sleep(0.5)
                    await queue.put("DONE")

            asyncio.create_task(run_engine_task())

            def cleanup_temp_files():
                try:
                    if base_file_path and os.path.exists(base_file_path):
                        os.remove(base_file_path)
                    for temp_path in ma_files_map.values():
                        if os.path.exists(temp_path):
                            os.remove(temp_path)
                    for gf in getattr(engine, "generated_files", []):
                        if os.path.exists(gf["path"]):
                            os.remove(gf["path"])
                    if os.path.exists(out_pdf_path):
                        os.remove(out_pdf_path)
                except Exception as ex:
                    print(f"[impose stream cleanup] Erro: {ex}")

            async def event_generator():
                try:
                    while True:
                        item = await queue.get()
                        if item == "DONE":
                            yield "event: done\ndata: {}\n\n"
                            break
                        if isinstance(item, dict) and item.get("type") == "error":
                            yield f"event: error\ndata: {json.dumps(item)}\n\n"
                            break
                        yield f"event: file\ndata: {json.dumps(item)}\n\n"
                finally:
                    if background_tasks:
                        background_tasks.add_task(cleanup_temp_files)
                    else:
                        cleanup_temp_files()

            return StreamingResponse(
                event_generator(),
                media_type="text/event-stream"
            )

        # Fluxo síncrono original (fallback)
        engine = ImpositionEngine(config)
        print(f"[DIAG impose] schema={data.get('schema')!r} cut_stack_mode={data.get('cut_stack_mode')!r} sheets_per_block={data.get('sheets_per_block')!r} multi_artes_count={len(multi_artes_list)} has_cover={formato.get('has_cover')}")
        engine.process()

        suffix_fn = f"CSV_{len(csv_data)}" if csv_data else f"{data.get('seq_start', 1)}-{data.get('seq_end', 100)}"
        download_name = f"VDP_{formato['name'].replace(' ', '_')}_{suffix_fn}.pdf"

        import base64
        if getattr(engine, "generated_files", None) and len(engine.generated_files) > 1:
            multi_files = []
            for gf in engine.generated_files:
                if os.path.exists(gf["path"]):
                    with open(gf["path"], "rb") as f_pdf:
                        b64_data = base64.b64encode(f_pdf.read()).decode("utf-8")
                        multi_files.append({"name": gf["name"], "data": b64_data})
                    if background_tasks:
                        background_tasks.add_task(os.remove, gf["path"])
            
            if background_tasks:
                if base_file_path and os.path.exists(base_file_path):
                    background_tasks.add_task(os.remove, base_file_path)
                for temp_path in ma_files_map.values():
                    if os.path.exists(temp_path):
                        background_tasks.add_task(os.remove, temp_path)
                        
            return {"type": "multi_file", "files": multi_files}

        # Lógica original (arquivo único)
        out_pdf_to_read = out_pdf_path
        if getattr(engine, "generated_files", None) and len(engine.generated_files) == 1:
            out_pdf_to_read = engine.generated_files[0]["path"]

        with open(out_pdf_to_read, "rb") as f_pdf:
            pdf_bytes = f_pdf.read()

        if background_tasks:
            if base_file_path and os.path.exists(base_file_path):
                background_tasks.add_task(os.remove, base_file_path)
            for temp_path in ma_files_map.values():
                if os.path.exists(temp_path):
                    background_tasks.add_task(os.remove, temp_path)
            if os.path.exists(out_pdf_to_read):
                background_tasks.add_task(os.remove, out_pdf_to_read)

        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{download_name}"',
                "Content-Length": str(len(pdf_bytes))
            }
        )

    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ─── SERVIÇO DE IMPRESSÃO ──────────────────────────────────────────────────────

@app.get("/api/printers")
def list_printers():
    return print_service.get_printers()

@app.get("/api/ppds")
def list_ppds():
    return print_service.get_ppd_list()

@app.post("/api/ppds/upload")
async def upload_ppd(file: UploadFile = File(...)):
    filename = file.filename
    if not filename.lower().endswith('.ppd'):
        raise HTTPException(status_code=400, detail="Apenas arquivos .ppd são suportados")
    
    dest_path = os.path.join(print_service.PPD_DIR, filename)
    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    try:
        parser = ppd_parser.PPDParser(dest_path)
        return {
            "filename": filename,
            "nick_name": parser.nick_name,
            "model_name": parser.model_name,
            "options": parser.options
        }
    except Exception as e:
        if os.path.exists(dest_path):
            os.remove(dest_path)
        raise HTTPException(status_code=500, detail=f"Erro ao processar PPD: {e}")

@app.get("/api/printers/ppd-map")
def get_ppd_map():
    return print_service.load_printer_ppd_map()

@app.post("/api/printers/ppd-map")
async def save_ppd_map(request: Request):
    mapping = await request.json()
    print_service.save_printer_ppd_map(mapping)
    return {"status": "success"}

@app.post("/api/print/submit")
async def submit_print_job(
    file: UploadFile = File(...),
    printer_name: str = Form(...),
    options: str = Form(...) # JSON string
):
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
        shutil.copyfileobj(file.file, tmp)
        pdf_path = tmp.name

    try:
        mapping = print_service.load_printer_ppd_map()
        ppd_file = mapping.get(printer_name)
        
        selected_codes = {}
        if ppd_file:
            ppd_path = os.path.join(print_service.PPD_DIR, ppd_file)
            if os.path.exists(ppd_path):
                parser = ppd_parser.PPDParser(ppd_path)
                selected_options = json.loads(options)
                for opt_key, choice_key in selected_options.items():
                    if opt_key in parser.options and choice_key in parser.options[opt_key]["choices"]:
                        selected_codes[opt_key] = parser.options[opt_key]["choices"][choice_key]["code"]
        
        success, msg = print_service.send_print_job(
            printer_name=printer_name,
            pdf_path=pdf_path,
            selected_options_codes=selected_codes,
            job_title=f"Ideal Imposition - {os.path.basename(file.filename or 'print')}"
        )
        if not success:
            raise HTTPException(status_code=500, detail=msg)
        return {"status": "success", "message": msg}
    finally:
        if os.path.exists(pdf_path):
            os.remove(pdf_path)


# ─── ORDENS DE SERVIÇO ────────────────────────────────────────────────────────
# Endpoints para modo local (quando não usa Supabase direto no frontend)

@app.get("/api/ordens")
def list_ordens(user: dict = Depends(get_current_user)):
    return db.get_ordens()

@app.get("/api/ordens/{os_id}/itens")
def get_ordens_itens(os_id: str, user: dict = Depends(get_current_user)):
    return db.get_os_itens(os_id)

@app.put("/api/os_itens/{item_id}")
async def update_os_item(item_id: str, request: Request, user: dict = Depends(get_current_user)):
    data = await request.json()
    ok = db.update_os_item(item_id, data)
    if not ok:
        raise HTTPException(status_code=404, detail="Item não encontrado")
    return {"status": "success"}


if __name__ == "__main__":
    import uvicorn
    db.init_db()
    uvicorn.run("app:app", host="0.0.0.0", port=9000, reload=True, reload_excludes=["venv/*"])

@app.get("/api/diag")
def get_diag():
    return {"logs": DIAG_LOGS}

# Fallback mount to serve static files from root (resolves absolute links like /style.css, /script.js, /supabase-config.js in frontend)
app.mount("/", StaticFiles(directory=_FRONTEND_DIR, html=True), name="root_frontend")

