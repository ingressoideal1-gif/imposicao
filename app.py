import json
import base64
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
import hotfolder
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

import security_config
# alias: dentro de _embed_system_fonts ja existe um dict local chamado font_cache
import font_cache as font_cache_local

# allow_private_network permanece ligado: é o que autoriza a página HTTPS do
# Vercel a falar com o agente local em 127.0.0.1:9000.
# allow_credentials=False porque nenhuma chamada do frontend usa cookies/sessão
# (não há credentials:'include'); com "*" o navegador já ignorava esta flag.
app.add_middleware(
    CORSMiddleware,
    allow_origins=security_config.ALLOWED_ORIGINS,
    allow_origin_regex=security_config.ALLOWED_ORIGIN_REGEX,
    allow_credentials=False,
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


# ─── De onde o painel é servido ───────────────────────────────────────────────
# No executável, servir direto de _MEIPASS congelava o painel na versão do
# build: cada correção publicada no site exigia um release de agente. Agora o
# painel é servido de uma pasta ao lado do executável, que o agent_worker
# mantém em dia (sincronizar_painel).
#
# A pasta nasce como cópia do que veio embutido, então a estação funciona na
# primeira execução e continua funcionando sem internet — a sincronização só
# substitui arquivo quando o conjunto inteiro chega íntegro.
#
# Fora do executável nada muda: em desenvolvimento serve-se a pasta frontend/ do
# repositório, senão editar um arquivo não teria efeito nenhum.
def _semear_painel(destino: str, origem: str) -> bool:
    """Copia para `destino` o que faltar de `origem`. Não sobrescreve o que já existe."""
    try:
        os.makedirs(destino, exist_ok=True)
        for nome in os.listdir(origem):
            org = os.path.join(origem, nome)
            dst = os.path.join(destino, nome)
            if os.path.isfile(org) and not os.path.exists(dst):
                shutil.copy2(org, dst)
        return os.path.isfile(os.path.join(destino, "index.html"))
    except Exception as e:
        print(f"[app] Não consegui semear o painel local: {e}", flush=True)
        return False


_PAINEL_DIR = _FRONTEND_DIR
if getattr(sys, 'frozen', False):
    _candidato = os.path.join(os.path.dirname(sys.executable), "painel")
    if _semear_painel(_candidato, _FRONTEND_DIR):
        _PAINEL_DIR = _candidato
        print(f"[app] Painel servido de {_PAINEL_DIR}", flush=True)
    else:
        print("[app] Painel local indisponível; servindo a cópia embutida.", flush=True)

app.mount("/app", StaticFiles(directory=_PAINEL_DIR, html=True), name="frontend")

# ─── ROTAS UTILITÁRIAS ────────────────────────────────────────────────────────

@app.get("/", include_in_schema=False)
def root_redirect():
    """Redireciona a raiz para o frontend."""
    return RedirectResponse(url="/app/index.html")

@app.get("/api/health")
def health_check():
    """Endpoint de health check — usado pelo frontend para pré-aquecer o servidor."""
    return {"status": "ok"}

from agent_version import AGENT_VERSION
LOCAL_AGENT_VERSION = f"NewProd {AGENT_VERSION}"

def _agent_id_local():
    """ID deste agente, para o frontend achar o registro certo em print_agents.

    Sem isto o frontend pegava o agente com heartbeat mais recente do banco
    inteiro — o operador de uma estacao podia mandar o job para a impressora
    de outra sala.
    """
    try:
        import agent_worker
        return agent_worker.AGENT_ID
    except Exception:
        return None


@app.get("/api/status")
def read_root():
    return {"status": "running", "message": "NewProd Agent ativo", "version": LOCAL_AGENT_VERSION,
            "agent_id": _agent_id_local(), "capabilities": ["impose", "print"]}

@app.get("/api/version")
def version_info():
    """Retorna versão/commit para confirmar qual código está rodando."""
    return {"version": LOCAL_AGENT_VERSION, "commit": "local_agent_" + LOCAL_AGENT_VERSION, "desc": "strict_assembly_v2", "engine": "fastpath+garbage4"}

@app.get("/api/update/check")
def consultar_atualizacao():
    """Diz se ha versao nova, sem baixar nada.

    Separado do POST /api/update para a interface poder informar antes de
    disparar um download de 47 MB e um reinicio do agente.
    """
    if security_config.is_cloud_runtime():
        raise HTTPException(status_code=404, detail="Nao disponivel neste ambiente.")
    import agent_worker
    return agent_worker.consultar_manifesto()


@app.post("/api/update")
async def trigger_update():
    """Dispara agora a checagem de atualizacao (modelo pull).

    Nao recebe parametro algum: a origem do download vem do manifesto de URL
    fixa em security_config, conferida por sha256 no agent_worker. Antes este
    endpoint aceitava um download_url do corpo da requisicao — qualquer site
    aberto no navegador do operador conseguia mandar o agente baixar e executar
    um binario arbitrario.
    """
    if security_config.is_cloud_runtime():
        raise HTTPException(status_code=404, detail="Nao disponivel neste ambiente.")

    import threading
    import agent_worker
    threading.Thread(target=agent_worker.verificar_atualizacao,
                     kwargs={"forcado": True}, daemon=True).start()
    return {"status": "checking", "message": "Verificacao de atualizacao iniciada."}

@app.get("/favicon.ico", include_in_schema=False)
def favicon():
    """Retorna 204 para evitar erros de favicon no console."""
    from fastapi.responses import Response
    return Response(status_code=204)

@app.get("/api/proxy")
async def proxy_url(url: str):
    import requests
    from fastapi.responses import Response

    # Sem allowlist este endpoint é um SSRF: alcança a rede interna do Render
    # e, no agente, a LAN da gráfica. Só o Storage do Supabase é legítimo aqui.
    if not security_config.is_allowed_proxy_url(url):
        log_diag(f"[proxy] BLOQUEADO: host fora da allowlist: {url!r}")
        raise HTTPException(status_code=403, detail="URL não autorizada para proxy.")

    try:
        r = requests.get(url, timeout=10, allow_redirects=False)
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

# ─── CATALOGO DE FONTES WEB ───────────────────────────────────────────────────

@app.get("/api/fonte")
def servir_fonte_do_cache(url: str):
    """Serve uma fonte a partir do cache local do agente.

    Sem isto, a estacao depende de alcancar o Supabase A CADA carregamento de
    pagina para desenhar texto na tela — o motor de imposicao ja funcionava
    offline pelo cache, mas o navegador nao. Aqui o agente entrega os bytes que
    ja tem em disco, e so vai a rede na primeira vez.

    A mesma allowlist do /api/proxy vale: o parametro so pode apontar para o
    Storage. Nao e um proxy generico.
    """
    from fastapi.responses import Response

    if not security_config.is_allowed_proxy_url(url):
        log_diag(f"[fonte] BLOQUEADO: fora da allowlist: {url!r}")
        raise HTTPException(status_code=403, detail="URL de fonte nao autorizada.")

    try:
        dados = font_cache_local.obter_bytes(url)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Falha ao obter a fonte: {e}")

    return Response(content=dados, media_type="font/ttf",
                    headers={"Cache-Control": "public, max-age=86400"})


@app.get("/api/fontes")
def list_fontes():
    return db.get_catalogo_fontes()

@app.post("/api/fontes")
async def create_fonte(request: Request, user: dict = Depends(get_current_user)):
    data = await request.json()
    res = db.save_catalogo_fonte(data)
    return {"status": "success", "fonte": res}

@app.delete("/api/fontes/{fonte_id}")
def remove_fonte(fonte_id: str, user: dict = Depends(get_current_user)):
    db.delete_catalogo_fonte(fonte_id)
    return {"status": "success"}

# ─── Embutir fontes do sistema nos elementos da numeração ─────────────────────

def _embed_system_fonts(numeracao_obj):
    """Embute o binário das fontes do sistema nos elementos para garantir
    que funcionem independentemente do ambiente de deploy."""
    if not numeracao_obj or "elements" not in numeracao_obj:
        return
    import base64
    import urllib.request
    
    # Busca o catálogo de fontes do banco de dados (restrito e exclusivo)
    fontes_catalogo = db.get_catalogo_fontes()
    fontes_map = {}
    for f in fontes_catalogo:
        if f.get("font_family"):
            fontes_map[f["font_family"].lower().strip()] = f
        if f.get("nome"):
            fontes_map[f["nome"].lower().strip()] = f
    
    font_cache = {}  # url -> base64 data

    for el in numeracao_obj.get("elements", []):
        raw_fn = (el.get("font_name") or el.get("font_family") or "").strip()
        if not raw_fn:
            continue
            
        # Limpar prefixo "system:" caso ainda venha do frontend por cache antigo
        if raw_fn.startswith("system:"):
            parts = raw_fn[7:].split("|")
            family = parts[0]
        else:
            family = raw_fn
            
        family_lower = family.lower()

        if el.get("_font_data"):
            continue

        if family_lower not in fontes_map:
            # Fallback: talvez o frontend já tenha injetado o arquivo_url via _injectFontUrls
            fallback_url = el.get("arquivo_url") or el.get("font_url")
            if fallback_url:
                print(f"[impose] INFO: Fonte '{family}' não encontrada no catálogo do backend, mas arquivo_url do frontend presente: {fallback_url}")
                # Usar a URL do frontend para embutir
                try:
                    font_bytes = base64.b64encode(font_cache_local.obter_bytes(fallback_url)).decode("ascii")
                    el["_font_data"] = font_bytes
                    font_cache[fallback_url] = font_bytes
                    print(f"[impose] Fonte embutida via fallback frontend: {family} -> {fallback_url} ({len(font_bytes)} chars b64)")
                except Exception as ex:
                    print(f"[impose] Erro ao embutir fonte via fallback: {ex}")
            else:
                base14 = {"helv","helv-bold","hebo","times","tiro","times-bold","tibo","cour","cobo","cour-bold"}
                if family_lower not in base14:
                    print(f"[impose] ALERTA: Fonte '{family}' solicitada, mas não está no Catálogo Web e sem arquivo_url. Fallback Helvetica. Chaves disponíveis: {list(fontes_map.keys())[:10]}")
            continue
            
        fonte_info = fontes_map[family_lower]
        url = fonte_info.get("arquivo_url")
        if not url:
            continue
            
        if url in font_cache:
            el["_font_data"] = font_cache[url]
            continue
            
        try:
            if url.startswith("/"):
                import os
                # Caminho relativo (legado): fonte empacotada junto do agente.
                local_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend", url.lstrip("/"))
                if os.path.isfile(local_path):
                    with open(local_path, "rb") as f:
                        font_bytes = base64.b64encode(f.read()).decode("ascii")
                else:
                    # A pasta fonts_local nao e mais empacotada. Se o catalogo
                    # persistente ainda tiver caminho relativo, buscar no Storage
                    # em vez de falhar calado e cair para Helvetica.
                    url_storage = db.FONTES_BUCKET_URL + db._nome_objeto_fonte(os.path.basename(url))
                    print(f"[impose] Fonte relativa sem arquivo local; usando Storage: {url_storage}")
                    font_bytes = base64.b64encode(font_cache_local.obter_bytes(url_storage)).decode("ascii")
            else:
                # Baixa uma vez por maquina e reusa do disco — sem isto, queda de
                # internet impediria a imposicao com as fontes do catalogo.
                font_bytes = base64.b64encode(font_cache_local.obter_bytes(url)).decode("ascii")

            el["_font_data"] = font_bytes
            font_cache[url] = font_bytes
            print(f"[impose] Fonte embutida: {family} -> {url} ({len(font_bytes)} chars b64)")
        except Exception as ex:
            print(f"[impose] Erro ao embutir fonte {family} de {url}: {ex}")

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
                    if _t in ("TEXT", "FIXED") or _t.startswith("TEATRO_") or _t.startswith("CAMAROTE_"):
                        _has_fd = "YES" if _el.get("_font_data") else "NO"
                        _has_url = _el.get("arquivo_url", "N/A")
                        print(f"[impose] {_num_label} el[{_i}]: type={_t} font_name={_el.get('font_name')!r} _font_data={_has_fd} arquivo_url={_has_url!r} font_size={_el.get('font_size')!r} color={_el.get('color')!r}")
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
        if suggested_name:
            clean_name = os.path.basename(suggested_name)
            if not clean_name.lower().endswith(".pdf"):
                clean_name += ".pdf"
            clean_name = clean_name.replace(" ", "_")
            out_pdf_path = os.path.join(tempfile.gettempdir(), clean_name)
        elif base_file_path:
            out_pdf_path = base_file_path.rsplit(".", 1)[0] + "_imposed.pdf"
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
            loop = asyncio.get_running_loop()
            queue = asyncio.Queue()

            def on_file_gen(file_info):
                import base64
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
                    # Pausa na thread do motor para liberar o GIL, permitindo que o event loop
                    # envie o arquivo atual antes que o motor comece a gerar o próximo
                    import time
                    time.sleep(1.2)

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
                        # Pequena pausa assíncrona no event loop para forçar o flush de pacotes de rede
                        await asyncio.sleep(0.1)
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

@app.get("/api/printers/{printer_name}/capabilities")
def get_printer_capabilities_endpoint(printer_name: str):
    return print_service.get_printer_capabilities(printer_name)

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
        selected_options = json.loads(options)
        success, msg = print_service.send_print_job_windows(
            printer_name=printer_name,
            pdf_path=pdf_path,
            options=selected_options,
            # O titulo do job E o nome do arquivo, sem marca do programa: quem
            # le a fila do Windows quer reconhecer o material, e o prefixo de
            # ordem (00001_, 00002_...) ja vem embutido no nome pelo frontend.
            job_title=os.path.basename(file.filename or "impressao.pdf")
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

@app.get("/api/print-config/{produto_id}")
async def get_print_config_endpoint(produto_id: str):
    """Busca config de impressora salva para um produto."""
    config = db.get_print_config(produto_id)
    return {"ok": True, "config": config}

@app.post("/api/print-config")
async def save_print_config_endpoint(request: Request):
    """Salva config de impressora para um produto."""
    data = await request.json()
    ok = db.upsert_print_config(data)
    return {"ok": ok}


# ─── HOT FOLDER ───────────────────────────────────────────────────────────────
# Impressora conduzida por pasta observada (Epson SureColor F9470H + Epson Edge
# Print): o PDF e gravado numa pasta e o RIP o importa, aplicando o preset
# daquela pasta. Toda a logica esta em hotfolder.py; aqui so ha a casca HTTP.

@app.post("/api/hotfolder/escolher")
def hotfolder_escolher(payload: dict | None = None):
    """Abre o seletor nativo de pasta NA ESTACAO e registra o que for escolhido.

    A resposta demora o tempo que o operador levar para escolher — e uma janela
    modal do Windows, nao ha como ser diferente.
    """
    inicial = (payload or {}).get("inicial") or ""
    try:
        caminho = hotfolder.escolher_pasta(inicial)
    except Exception as e:
        return {"ok": False, "detail": str(e)}

    if not caminho:
        return {"ok": False, "cancelado": True, "detail": "nenhuma pasta escolhida"}

    valida, msg = hotfolder.validar_pasta(caminho)
    if not valida:
        return {"ok": False, "detail": msg}

    db.registrar_hot_folder(caminho)
    return {
        "ok": True,
        "path": caminho,
        "aviso_unidade_mapeada": hotfolder.e_unidade_mapeada(caminho),
    }


@app.post("/api/hotfolder/validar")
async def hotfolder_validar(request: Request):
    """Valida um caminho digitado e, dando certo, o registra.

    Existe porque o seletor nativo pode nao estar ao alcance: agente parado, ou
    painel servido pela nuvem sem conseguir falar com o 127.0.0.1. Colar o
    caminho e o plano B.
    """
    data = await request.json()
    caminho = (data.get("path") or "").strip()
    ok, msg = hotfolder.validar_pasta(caminho)
    if not ok:
        return {"ok": False, "detail": msg}
    db.registrar_hot_folder(caminho)
    return {
        "ok": True,
        "path": caminho,
        "aviso_unidade_mapeada": hotfolder.e_unidade_mapeada(caminho),
    }


@app.post("/api/hotfolder/drop")
async def hotfolder_drop(
    file: UploadFile = File(...),
    folder: str = Form(...),
):
    """Grava o PDF na pasta observada. So aceita pasta ja registrada."""
    if not db.hot_folder_registrada(folder):
        raise HTTPException(
            status_code=403,
            detail="pasta nao registrada nesta estacao — escolha a pasta de novo "
                   "pelo botao 'Escolher pasta'")
    dados = await file.read()
    try:
        caminho = hotfolder.soltar(folder, file.filename or "impressao.pdf", dados,
                                   metodo=db.metodo_hot_folder(folder))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True, "path": caminho}


@app.post("/api/hotfolder/conferir")
async def hotfolder_conferir(request: Request):
    """Quais dos caminhos enviados ainda estao na pasta.

    O Edge Print importa e remove o arquivo. Sobrando arquivo, o watcher
    provavelmente nao esta rodando — e depois de largar o PDF esse e o unico
    sinal barato de que o outro lado esta vivo.
    """
    data = await request.json()
    restantes = hotfolder.conferir(data.get("paths") or [])
    return {"ok": True, "restantes": restantes}

@app.get("/api/user/permissions/{user_id}")
async def get_user_permissions_endpoint(user_id: str):
    perms = db.get_user_permissions(user_id)
    return {"ok": True, "permissions": perms}

@app.get("/api/user/permissions")
async def list_user_permissions_endpoint():
    perms = db.list_all_user_permissions()
    return {"ok": True, "permissions": perms}

@app.post("/api/user/permissions")
async def save_user_permissions_endpoint(request: Request):
    data = await request.json()
    ok = db.upsert_user_permissions(data)
    return {"ok": ok}

@app.delete("/api/user/permissions/{user_id}")
async def delete_user_permissions_endpoint(user_id: str):
    ok = db.delete_user_permissions(user_id)
    return {"ok": ok}

# ─── ACESSO LOCAL AO NEWPROD ─────────────────────────────────────────────────
# O CRUD roda na nuvem (o administrador gerencia pelo Menu Usuarios). O login
# roda na estacao, contra a copia que o agent_worker sincroniza — sem rede no
# caminho do operador.

@app.get("/api/acessos-locais")
async def listar_acessos_locais_endpoint():
    return {"ok": True, "acessos": db.listar_acessos_locais()}


@app.post("/api/acessos-locais")
async def salvar_acesso_local_endpoint(request: Request):
    data = await request.json()
    try:
        acesso = db.salvar_acesso_local(data)
    except db.CodigoInvalido as e:
        # 400 e nao 500: quem digitou o codigo precisa ler o motivo na tela.
        raise HTTPException(status_code=400, detail=str(e))
    if not acesso:
        raise HTTPException(status_code=500, detail="Nao foi possivel salvar o acesso local")
    return {"ok": True, "acesso": acesso}


@app.delete("/api/acessos-locais/{acesso_id}")
async def excluir_acesso_local_endpoint(acesso_id: str):
    return {"ok": db.excluir_acesso_local(acesso_id)}


@app.get("/api/local/login/estado")
async def estado_login_local():
    """Ha lista sincronizada nesta estacao?

    Sem lista — instalacao nova, ou maquina que nunca alcancou a nuvem — o painel
    entra como fazia antes. Parar a producao por falta de rede seria pior do que
    o problema que a tranca resolve.
    """
    import acesso_local
    return {"ok": True, "exigir_codigo": acesso_local.ha_lista()}


@app.post("/api/local/login")
async def login_local(request: Request):
    import acesso_local
    data = await request.json()
    acesso = acesso_local.validar(data.get("codigo"))
    if not acesso:
        # Mensagem unica: nao dizer se o codigo existe mas esta inativo.
        raise HTTPException(status_code=401, detail="Codigo invalido")
    return {
        "ok": True,
        "nome": acesso.get("nome") or "Operador",
        "role": acesso.get("role") or "",
        "permissoes": acesso.get("permissoes") or {},
    }

# ─── DISPARO DE E-MAILS & CONFIGURAÇÕES SMTP ─────────────────────────────────

@app.get("/api/email/config")
async def get_email_config_endpoint():
    config = db.get_email_config()
    safe_config = { **config }
    if "password" in safe_config and safe_config["password"]:
        safe_config["has_password"] = True
        safe_config["password"] = "******"
    return {"ok": True, "config": safe_config}

@app.post("/api/email/config")
async def save_email_config_endpoint(request: Request):
    data = await request.json()
    existing = db.get_email_config()
    if data.get("password") == "******" and "password" in existing:
        data["password"] = existing["password"]
    ok = db.save_email_config(data)
    return {"ok": ok}

@app.post("/api/email/enviar")
async def send_email_endpoint(request: Request):
    data = await request.json()
    to_email = data.get("to")
    subject = data.get("subject")
    body_text = data.get("body_text", "")
    body_html = data.get("body_html", "")
    custom_config = data.get("smtp_config")

    if not to_email or not subject:
        raise HTTPException(status_code=400, detail="Destinatário e Assunto são obrigatórios.")

    if not custom_config or not custom_config.get("host"):
        db_config = db.get_email_config()
        if custom_config:
            if not custom_config.get("password") or custom_config.get("password") == "******":
                custom_config["password"] = db_config.get("password")
            merged = { **db_config, **custom_config }
            custom_config = merged
        else:
            custom_config = db_config

    result = db.send_email_smtp(to_email, subject, body_text, body_html, custom_config)
    if not result.get("ok"):
        raise HTTPException(status_code=500, detail=result.get("error", "Erro ao enviar e-mail."))

    return result

# Fallback mount to serve static files from root (resolves absolute links like /style.css, /script.js, /supabase-config.js in frontend)
# Mesma pasta do mount /app: as páginas referenciam /script.js e /style.css por
# caminho absoluto, então servir daqui a cópia embutida enquanto /app serve a
# sincronizada faria a página nova carregar o script velho.
app.mount("/", StaticFiles(directory=_PAINEL_DIR, html=True), name="root_frontend")


