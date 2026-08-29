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
import balanca
import color_profiles
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

# Controle de acesso: só onde a SUPABASE_SERVICE_KEY existe — o que, desde
# 17/08/2026, quer dizer "em lugar nenhum em produção": estas rotas viraram Edge
# Function, e a chave mora nos segredos do Supabase. Nas estações ela nunca
# esteve. O NewProd.exe embute o acesso_api.py mas não a chave, e montar o router
# lá deixaria endpoints respondendo 503 a tudo, o que só confunde quem for
# diagnosticar por que uma publicação não chegou.
import acesso_api
import acesso_config
import acesso_interno
import acesso_portaria
if acesso_api.disponivel():
    app.include_router(acesso_api.router)
    app.include_router(acesso_config.router)
    app.include_router(acesso_portaria.router)
    app.include_router(acesso_interno.router)
    print("[app] Controle de acesso ativo.", flush=True)
else:
    print(f"[app] Controle de acesso inativo ({acesso_api.CHAVE_ENV} ausente).", flush=True)

# ─── Nada de escrita anônima na nuvem ────────────────────────────────────────
#
# Medido em 16/08/2026, sem nenhuma credencial, de fora:
#
#     GET  <servidor da nuvem>/api/acessos-locais  ->  200
#     GET  <servidor da nuvem>/api/user/permissions -> 200
#
# A primeira devolvia os CÓDIGOS de acesso local em texto claro — três pessoas,
# uma delas com papel `admin`. É o código que destranca o painel do NewProd numa
# estação. A segunda devolvia a grade de permissões inteira, e o `POST` dela
# deixaria qualquer um se dar `admin`.
#
# A causa é que `get_current_user` (mais abaixo) é um carimbo: devolve admin para
# todo mundo, sem conferir nada. Isso nunca foi um problema na estação, que vive
# na LAN da gráfica atrás da trava do código local — mas o MESMO `app.py` rodava
# também numa cópia hospedada, num endereço público.
#
# Aquela cópia saiu do ar em 17/08/2026. A regra abaixo FICA: ela é o que impede a
# próxima cópia deste arquivo de nascer aberta.
#
# ## A regra
#
# Na NUVEM, toda escrita e toda leitura de dado sensível exige uma sessão de
# verdade do Supabase. Na ESTAÇÃO nada muda: exigir sessão ali quebraria o
# operador que entrou pelo código local, offline, que é justamente o caso para o
# qual o `acesso_local` existe.
#
# O `/api/acesso/*` fica de fora porque já tem trava própria, e mais forte: token
# de aparelho na portaria, segredo do agente na publicação, papel lido do banco
# no Ideal Control.
_LEITURAS_SENSIVEIS = (
    "/api/user/permissions",
    "/api/acessos-locais",
    "/api/admin/users",
    "/api/email",
    "/api/diag",
)


def precisa_de_sessao(metodo: str, caminho: str) -> bool:
    """Esta requisição, na nuvem, exige sessão? Pura, para poder ser testada."""
    if not caminho.startswith("/api/"):
        return False
    # O preflight não carrega cabeçalho nenhum, por definição do navegador.
    if metodo == "OPTIONS":
        return False
    # Trava própria, e mais forte que uma sessão de painel.
    if caminho.startswith("/api/acesso/"):
        return False
    # A imposição na nuvem já recusa TODO MUNDO desde a Fase 1, com uma frase
    # que diz ao operador por onde o trabalho sai ("use a estação, localhost:9000").
    # Exigir sessão antes trocaria essa frase por um 401 seco, sem fechar nada
    # que já não estivesse fechado.
    if caminho == "/api/impose":
        return False
    if caminho.startswith(_LEITURAS_SENSIVEIS):
        return True
    return metodo in ("POST", "PUT", "PATCH", "DELETE")


def _sessao_do_supabase(authorization: str | None) -> bool:
    """O token é uma sessão viva? Quem responde é o próprio Supabase."""
    if not authorization or not authorization.lower().startswith("bearer "):
        return False
    token = authorization.split(" ", 1)[1].strip()
    if not token:
        return False
    import urllib.error
    import urllib.request
    req = urllib.request.Request(
        f"{db.SUPABASE_URL}/auth/v1/user",
        headers={"apikey": db.SUPABASE_KEY, "Authorization": f"Bearer {token}"},
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status == 200
    except urllib.error.HTTPError:
        return False
    except Exception as e:
        # Rede fora não é credencial inválida. Recusar assim mesmo é o certo
        # aqui: é uma escrita, e deixar passar por não conseguir conferir seria
        # transformar uma falha de rede em porta aberta.
        print(f"[app] nao consegui conferir a sessao: {e}", flush=True)
        return False


@app.middleware("http")
async def exigir_sessao_na_nuvem(request: Request, call_next):
    if security_config.is_cloud_runtime() and precisa_de_sessao(
        request.method, request.url.path
    ):
        if not _sessao_do_supabase(request.headers.get("authorization")):
            return JSONResponse(
                status_code=401,
                content={"detail": "faca login no painel para esta operacao"},
            )
    return await call_next(request)


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


# ─── O HTML do painel nunca fica em cache ─────────────────────────────────────
# O agente troca os arquivos do painel no disco a cada 30 min, mas nada disso
# chega ao navegador que já está aberto na estação. Os scripts se protegem com
# `?v=NNN`; quem carrega esse carimbo é o próprio HTML, e ele não tem como se
# invalidar. Servido sem Cache-Control, o Chrome aplica cache heurístico e
# segura o index.html por horas — então a estação pedia `pedido.js?v=528` do
# próprio cache e mostrava o painel de nove releases atrás com o executável mais
# novo instalado. Foi exatamente esse o sintoma na gráfica em 12/08/2026.
#
# Vale só para text/html: é o único arquivo sem carimbo, e é ele que carrega
# todos os outros. O resto continua cacheável, que é o que mantém a tela rápida.
@app.middleware("http")
async def painel_html_sem_cache(request: Request, call_next):
    response = await call_next(request)
    if (response.headers.get("content-type") or "").lower().startswith("text/html"):
        response.headers["Cache-Control"] = "no-store, must-revalidate"
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
    """Copia para `destino` o que faltar de `origem` — e o que lá estiver velho.

    Nunca sobrescrever congelava para sempre o arquivo que a sincronização não
    cobre: quem instalasse um agente novo continuava com o `csv-editor.js` da
    primeira instalação, dez releases atrás. Agora a cópia embutida também
    repõe o que for mais antigo que ela.

    A comparação por mtime é segura nos dois sentidos: `copy2` preserva a data
    do build, e `sincronizar_painel` grava com a data do download, sempre
    posterior. Um arquivo recém-baixado da nuvem nunca volta para a versão do
    build por causa desta função.
    """
    try:
        os.makedirs(destino, exist_ok=True)
        for nome in os.listdir(origem):
            org = os.path.join(origem, nome)
            dst = os.path.join(destino, nome)
            if not os.path.isfile(org):
                continue
            if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(org):
                continue
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
    """Quem sou eu, e — principalmente — ONDE estou rodando.

    O `onde` existe por causa de 15/08/2026. Este mesmo arquivo servia a estação
    e uma cópia hospedada, então a nuvem respondia exatamente o que o agente
    responde: `{"status": "running", "message": "NewProd Agent ativo", ...}`.

    O painel procura o agente testando três endereços, e o primeiro é o da
    própria página — que na Vercel era desviado para aquela cópia. Ele
    acreditava, parava de procurar, e mandava a imposição para a nuvem
    **mostrando na tela o selo "⚡ AGENTE LOCAL"**.

    O estrago era grande e silencioso: o QR Ideal não podia ser impresso por
    caminho nenhum (a nuvem não tem o pool, e nunca vai ter), a imposição rodava
    pela rede contra a razão de o agente existir, e a faixa de credenciais não
    subia.

    A cópia hospedada saiu do ar em 17/08/2026, e hoje `is_cloud_runtime()` é
    sempre falso — mas o campo fica, e o painel continua conferindo. É o que
    impede que uma próxima cópia deste arquivo, em qualquer serviço, volte a se
    passar por agente. Não é configurável de fora de propósito: quem controlasse
    a configuração poderia fazer a nuvem se declarar estação de novo.
    """
    return {"status": "running", "message": "NewProd Agent ativo", "version": LOCAL_AGENT_VERSION,
            "agent_id": _agent_id_local(), "capabilities": ["impose", "print"],
            "onde": "nuvem" if security_config.is_cloud_runtime() else "local"}

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

    # Sem allowlist este endpoint é um SSRF: no agente, alcança a LAN inteira da
    # gráfica. Só o Storage do Supabase é legítimo aqui.
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


# ─── O peso por setor, para o painel servido pela estacao ────────────────────
#
# O Painel do Acabamento grava o peso em `propostas_os_setores`, tabela do
# parceiro com RLS de `authenticated`. A pagina servida pela estacao fala com o
# Supabase como `anon` e nao enxerga essa tabela — medido em 21/08/2026: a
# leitura volta `[]` com HTTP 200, vazia e sem erro.
#
# Estas duas rotas sao a porta da estacao. Elas nao tocam no banco: repassam a
# `acesso-estacao` com o segredo do agente, exatamente como o catalogo de fontes
# faz. O `get_current_user` continua valendo — quem chama e o painel, atras da
# trava do codigo de acesso local.


@app.get("/api/peso-setores/{pedido_id_int}")
def listar_peso_setores(pedido_id_int: int, user: dict = Depends(get_current_user)):
    try:
        return {"setores": db.ler_peso_dos_setores(pedido_id_int)}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Nao deu para ler o peso: {e}")


@app.post("/api/peso-setores/{pedido_id_int}")
async def gravar_peso_setor(pedido_id_int: int, request: Request,
                            user: dict = Depends(get_current_user)):
    import urllib.error

    dados = await request.json()
    try:
        r = db.gravar_peso_do_setor(pedido_id_int, dados.get("setor"),
                                    dados.get("peso_real_kg"))
    except urllib.error.HTTPError as e:
        # A recusa do servidor (setor invalido, peso que nao e numero) chega com
        # o motivo escrito. Repassar o 502 generico esconderia dele o que dizer
        # ao operador.
        corpo = ""
        try:
            corpo = e.read().decode("utf-8")
        except Exception:
            pass
        raise HTTPException(status_code=e.code if e.code in (400, 401, 422) else 502,
                            detail=corpo or f"o servidor recusou o peso ({e.code})")
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Nao deu para gravar o peso: {e}")
    return {"status": "success", **r}


# ─── A balanca da estacao ────────────────────────────────────────────────────
#
# A balanca Urano CP 3/0.5 POP do acabamento, lida na porta serial. O protocolo
# inteiro mora no `balanca.py`; aqui e so a porta de entrada do painel.
#
# Ler porta serial NAO da para fazer no navegador sem WebSerial, que so existe
# no Chrome e pede permissao maquina a maquina — e nenhuma solucao deste projeto
# pode depender de configurar navegador, porque cada estacao usa um diferente.
# Por isso a leitura e do agente, como a impressao.
#
# As tres respondem 200 mesmo quando NAO acham a balanca, com `ok: false` e o
# motivo escrito. Nao achar balanca e estado de operacao, nao falha de servidor:
# a saida serial da CP POP e opcional de fabrica e pode estar desligada no
# teclado dela (FUNCAO 8, senha 191249). Um 502 chegaria a tela como "erro
# interno" e esconderia justamente a parte que o operador precisa ler.


@app.get("/api/balanca/peso")
def balanca_peso(porta: str = "", user: dict = Depends(get_current_user)):
    """O peso agora, em quilos. Espera ate 4 s o peso estabilizar no prato."""
    return balanca.ler_peso(porta=porta or None)


@app.get("/api/balanca/portas")
def balanca_portas(user: dict = Depends(get_current_user)):
    """O diagnostico: o que cada porta COM desta maquina respondeu."""
    achado = balanca.procurar()
    achado.pop("_leitura", None)
    return achado


@app.post("/api/balanca/porta")
async def balanca_porta(request: Request, user: dict = Depends(get_current_user)):
    """Grava a porta escolhida a mao, para quando o diagnostico nao decidir."""
    dados = await request.json()
    porta = str(dados.get("porta") or "").strip()
    if not porta:
        return {"ok": False, "motivo": "Escolha uma porta da lista."}
    if not balanca.guardar_porta(porta):
        return {"ok": False, "porta": porta,
                "motivo": "Não deu para gravar a escolha nesta máquina.",
                "comoResolver": "Rode o agente com permissão de escrever na pasta dele."}
    return {"ok": True, "porta": porta}


def _repassar_recusa(e, oque: str):
    """A recusa do servidor chega ao operador com o motivo, e nao como 502.

    Sem isto, "setor invalido" e "pedido nao encontrado" viram a mesma frase
    generica na tela — e o operador nao tem o que corrigir.
    """
    import urllib.error

    if isinstance(e, urllib.error.HTTPError):
        corpo = ""
        try:
            corpo = e.read().decode("utf-8")
        except Exception:
            pass
        return HTTPException(
            status_code=e.code if e.code in (400, 401, 404, 422) else 502,
            detail=corpo or f"o servidor recusou ({e.code})")
    return HTTPException(status_code=502, detail=f"Nao deu para {oque}: {e}")


@app.post("/api/setor-concluido/{pedido_id_int}")
async def marcar_setor_concluido(pedido_id_int: int, request: Request,
                                 user: dict = Depends(get_current_user)):
    dados = await request.json()
    try:
        r = db.concluir_setor(pedido_id_int, dados.get("setor"),
                              dados.get("concluido", True))
    except Exception as e:
        raise _repassar_recusa(e, "carimbar o setor")
    return {"status": "success", **r}


@app.post("/api/expedicao/{pedido_id_int}")
def mandar_para_expedicao(pedido_id_int: int, user: dict = Depends(get_current_user)):
    try:
        r = db.enviar_para_expedicao(pedido_id_int)
    except Exception as e:
        raise _repassar_recusa(e, "mandar o pedido para expedicao")
    return {"status": "success", **r}


@app.post("/api/senha-liberacao/conferir")
async def conferir_senha_de_liberacao(request: Request,
                                      user: dict = Depends(get_current_user)):
    """A senha semanal que libera um peso real fora dos 5 % do estimado.

    A estação não conhece a senha: manda o que o operador digitou e recebe
    sim ou não. A regra (semana, derivação, comparação em tempo constante)
    mora na Edge Function, com um segredo que nunca vem para cá.
    """
    dados = await request.json()
    try:
        r = db.conferir_senha_de_liberacao(dados.get("senha"))
    except Exception as e:
        raise _repassar_recusa(e, "conferir a senha de liberacao")
    return {"status": "success", **r}

# ─── Embutir fontes do sistema nos elementos da numeração ─────────────────────
#
# ## A ponte entre dois jeitos de chamar a mesma fonte
#
# O elemento guarda a FAMÍLIA, como o Windows a chama: `system:Comic Sans MS`.
# O catálogo guarda as 222 fontes de sistema pelo nome do ARQUIVO: `comic`,
# `comicbd`, `arial`, `arialbd`. Onde os dois coincidem — `arial` — casava por
# sorte; onde não coincidem, a fonte sumia calada e o papel saía em Helvetica.
#
# A tela não denunciava porque ela resolve por outro caminho: o `@font-face` tem
# `local('Comic Sans MS')`, então a fonte instalada no Windows daquela máquina
# desenha a prévia sem tocar no catálogo. O motor não tem esse recurso — PyMuPDF
# só aceita bytes. Daí o defeito do pedido 19775, em 17/08/2026: os dois modelos
# certos na janela e errados no papel.
#
# A tradução família → arquivo é a que o próprio Windows guarda no registro, e
# ela vale exatamente quando a prévia também vale: se a fonte está instalada, os
# dois lados acertam. Se não estiver, cai no que já havia — o nome próprio no
# catálogo, e o alerta no log.

_FONTES_INSTALADAS = None

# `Bold`/`Italic` só contam como estilo no FIM do nome: há família com essas
# palavras no meio, e tratá-las como estilo apagaria a família inteira.
_SUFIXOS_DE_ESTILO = (
    ("bold italic", True, True),
    ("bolditalic", True, True),
    ("bold oblique", True, True),
    ("bold", True, False),
    ("italic", False, True),
    ("oblique", False, True),
)


def _familia_e_estilo_do_registro(nome: str):
    """"Comic Sans MS Bold (TrueType)" -> ("comic sans ms", True, False)."""
    import re
    n = re.sub(r"\s*\((TrueType|OpenType|All res|VGA res)\)\s*$", "", nome or "",
               flags=re.IGNORECASE).strip().lower()
    for sufixo, bold, italic in _SUFIXOS_DE_ESTILO:
        if n.endswith(" " + sufixo):
            return n[: -(len(sufixo) + 1)].strip(), bold, italic
    return n, False, False


def _fontes_instaladas() -> dict:
    """{(familia, bold, italic): "comic.ttf"} das fontes instaladas no Windows.

    Lida uma vez por processo. Fora do Windows devolve vazio, e aí tudo continua
    funcionando como antes desta função existir.
    """
    global _FONTES_INSTALADAS
    if _FONTES_INSTALADAS is not None:
        return _FONTES_INSTALADAS

    _FONTES_INSTALADAS = {}
    try:
        import winreg
        import os as _os
        caminho = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts"
        # HKCU cobre a fonte instalada só para o usuário, que e o caso comum de
        # quem instala fonte de cliente sem ser administrador da maquina.
        for raiz in (winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER):
            try:
                with winreg.OpenKey(raiz, caminho) as chave:
                    total = winreg.QueryInfoKey(chave)[1]
                    for i in range(total):
                        try:
                            nome, valor, _ = winreg.EnumValue(chave, i)
                        except OSError:
                            continue
                        if not isinstance(valor, str) or not valor:
                            continue
                        # Uma colecao (.ttc) lista varios arquivos numa entrada.
                        arquivo = _os.path.basename(valor.split(",")[0].strip())
                        _FONTES_INSTALADAS.setdefault(
                            _familia_e_estilo_do_registro(nome), arquivo)
            except OSError:
                continue
    except Exception as e:  # pragma: no cover — so em Windows quebrado
        print(f"[impose] nao consegui ler as fontes instaladas: {e}", flush=True)

    return _FONTES_INSTALADAS


def _chaves_de_fonte(family: str, bold: bool, italic: bool, instaladas: dict) -> list:
    """As chaves a tentar no catálogo, da melhor para a reserva.

    Pura de propósito: é o coração do conserto, e precisa poder ser conferida
    sem Windows, sem registro e sem rede.
    """
    import os as _os
    fam = (family or "").strip().lower()
    chaves = []

    def _por(bold_, italic_):
        arquivo = instaladas.get((fam, bold_, italic_))
        if not arquivo:
            return
        base = _os.path.splitext(arquivo)[0].lower()
        if base and base not in chaves:
            chaves.append(base)

    if bold or italic:
        _por(bold, italic)
        # Nem toda familia tem as quatro variacoes. Sem esta escada, um
        # `bold italic` numa familia que so tem bold voltaria para a regular —
        # perdendo os dois estilos em vez de um.
        if bold and italic:
            _por(True, False)
            _por(False, True)

    if fam and fam not in chaves:
        chaves.append(fam)
    _por(False, False)
    return chaves


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
        bold = italic = False
        if raw_fn.startswith("system:"):
            parts = raw_fn[7:].split("|")
            family = parts[0]
            marcas = [p.strip().lower() for p in parts[1:]]
            bold = "bold" in marcas
            italic = "italic" in marcas
        else:
            family = raw_fn

        # O elemento tambem pode trazer o estilo em campo proprio, que e o que o
        # engine.py le. Considerar os dois evita embutir a regular num texto que
        # o motor vai desenhar como negrito.
        bold = bold or el.get("font_weight") == "bold" or el.get("bold") is True
        italic = italic or el.get("font_style") == "italic"

        family_lower = family.lower()

        if el.get("_font_data"):
            continue

        chave = next((c for c in _chaves_de_fonte(family, bold, italic, _fontes_instaladas())
                      if c in fontes_map), None)

        if chave is None:
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

        fonte_info = fontes_map[chave]
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

# ─── QR IDEAL ─────────────────────────────────────────────────────────────────

_POOL_QR = None


def _pool_qr_ou_none():
    """O pool do QR Ideal, aberto uma vez por processo.

    Devolve None quando o arquivo nao esta na maquina — o que e o normal no
    servidor da nuvem, que nao imprime. Quem cobra a falta e o ramo QR_IDEAL
    do motor, e so quando o trabalho realmente usa o elemento: um trabalho sem
    QR Ideal nao pode falhar por causa de um arquivo que ele nao usa.

    O `False` guardado no lugar de None e proposital: sem ele, cada chamada
    tentaria abrir de novo um arquivo que ja se sabe ausente.
    """
    global _POOL_QR
    if _POOL_QR is None:
        try:
            import qr_ideal
            _POOL_QR = qr_ideal.PoolQR()
            print(f"[qr-ideal] pool carregado de {_POOL_QR.caminho}")
        except (FileNotFoundError, ValueError) as e:
            print(f"[qr-ideal] pool indisponivel: {e}")
            _POOL_QR = False
    return _POOL_QR or None


def _publicar_faixa_qr_ideal(config, data):
    """Manda a faixa de codigos para a nuvem — DEPOIS que os PDFs sairam.

    Chamada logo apos `engine.process()` terminar com sucesso, nos dois
    caminhos de `/api/impose` (o com stream e o sincrono). Ela devolve na hora:
    o calculo dos hashes e o envio acontecem numa thread de fundo, porque o
    operador esta de pe na frente da impressora e o agente existe por causa
    disso.

    Nao levanta nunca. Uma falha aqui nao pode derrubar um trabalho cujo papel
    ja saiu — o pior que acontece e a faixa subir na proxima impressao, e o
    evento e dias depois.
    """
    try:
        if not data.get("pedido"):
            return
        import acesso_publicacao

        numeracoes = _numeracoes_por_modelo(config)
        if not numeracoes:
            # Nenhum modelo deste trabalho tem QR, QR Ideal ou codigo de barras:
            # nao ha o que a portaria leia, e calcular hash de uma tiragem
            # inteira a toa seria desperdicio puro.
            return
        if acesso_publicacao._precisa_do_pool(numeracoes) and not _pool_qr_ou_none():
            return
        acesso_publicacao.publicar_em_fundo(
            data["pedido"], _pool_qr_ou_none, numeracoes
        )
    except Exception as e:
        print(f"[acesso] Nao consegui iniciar a publicacao da faixa: {e}", flush=True)


def _numeracoes_por_modelo(config):
    """`{modelo_id: numeracao_achatada}` do trabalho que acabou de ser impresso.

    Este e o unico ponto do sistema que sabe, ao mesmo tempo, QUAIS modelos
    estao na folha e QUAL numeracao cada um usa. O agente nao sabe: ele recebe
    do servidor so `{modelo: quantidade}`, o que bastava enquanto o codigo saia
    do pool por formula.

    Numa folha `multi_artes` cada arte e um modelo com a numeracao dele. Fora
    dela ha um modelo so, e os elementos sao os do proprio `config`.

    As DUAS numeracoes da arte entram na conta: o QR pode estar no verso, e o
    `ImpositionConfig` achata as duas na mesma lista justamente porque, para o
    papel, elas sao um conjunto so.
    """
    import acesso_publicacao

    mapa = {}
    artes = getattr(config, "multi_artes", None) or []
    if artes:
        for arte in artes:
            modelo = arte.get("modelo")
            if modelo in (None, ""):
                continue
            els = []
            for chave in ("numeracao", "numeracao_2"):
                els.extend(((arte.get(chave) or {}).get("elements")) or [])
            achatada = acesso_publicacao.numeracao_do_modelo(els)
            if achatada:
                mapa[int(modelo)] = achatada
        return mapa

    modelo = getattr(config, "modelo", None)
    if modelo in (None, ""):
        return {}
    achatada = acesso_publicacao.numeracao_do_modelo(config.elements)
    return {int(modelo): achatada} if achatada else {}


@app.get("/api/qr-ideal")
def qr_ideal_previa(pedido: str, modelo: str, item: int = 1):
    """O codigo do QR Ideal de um ingresso, para a previa do editor.

    Existe so onde o pool existe: na estacao, servida pelo proprio agente. Na
    nuvem responde 503, e a tela desenha um QR de exemplo AVISADO — um QR falso
    mudo seria pior que nenhum, porque o operador acharia que conferiu.

    Devolve um codigo por vez, nunca a lista: quem tem a lista inteira consegue
    emitir ingresso para qualquer evento, e ela nao sai da estacao.
    """
    pool = _pool_qr_ou_none()
    if pool is None:
        raise HTTPException(
            status_code=503,
            detail="Pool do QR Ideal indisponivel nesta maquina."
        )
    import qr_ideal as _qi
    idx = _qi.indice(pedido, modelo, item)
    return {
        "codigo": pool.codigo(pedido, modelo, item),
        "conteudo": pool.conteudo(pedido, modelo, item),
        "coluna": _qi.coluna_do_modelo(pedido, modelo),
        "linha": (idx % _qi.LINHAS) + 1,
    }


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
    # 16/08/2026: imposicao e impressao so acontecem na estacao da grafica.
    # Decisao de seguranca do usuario -- ver
    # docs/superpowers/specs/2026-08-16-migrar-render-para-supabase-design.md
    #
    # Esta e a SEGUNDA barreira. A primeira e o painel, que nao desvia mais para
    # ca. Esta existe porque painel fica em cache no navegador da estacao: sem
    # ela, uma copia antiga continuaria mandando a arte do cliente para a nuvem
    # por semanas, sem ninguem perceber.
    #
    # Fica ANTES do `try` de proposito. Dentro dele a primeira coisa que
    # acontece e `db.get_formato(...)`, que vai a rede: recusar depois disso
    # seria pagar uma viagem ao Supabase para dizer nao.
    #
    # 403 e nao 404 de proposito: aqui o operador PRECISA ler o motivo, porque a
    # mensagem e o que o manda para a estacao. O /api/update esconde que existe;
    # este avisa que existe e nao serve aqui.
    if security_config.is_cloud_runtime():
        raise HTTPException(
            status_code=403,
            detail=("A imposicao so roda na estacao da grafica. Abra o painel por "
                    "http://localhost:9000, na maquina onde o NewProd esta aberto, "
                    "e refaca o trabalho por la."),
        )

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

        # ── O trabalho pediu numeração e ela não chegou? Para aqui. ──────────
        #
        # 15/08/2026: o pedido 20508 saiu da impressora TRÊS VEZES sem número e
        # sem QR, com a prévia mostrando os dois. Sessenta e dois ingressos
        # perdidos. O motor recebia `numeracao_id` preenchido e `numeracao`
        # nula, não tinha o que desenhar, desenhava só a arte — e não dizia
        # nada. No log ficava o silêncio de uma linha que não aparece, e é
        # preciso conhecer muito bem este arquivo para reparar numa ausência.
        #
        # Um ingresso sem código não parece defeituoso: ele é entregue, e só
        # falha na portaria do evento. Vale a mesma regra do QR Ideal sem pool
        # — falhar alto é a regra, não a exceção.
        #
        # O `numeracao_id` no log é o que faz a PRÓXIMA investigação começar com
        # o dado na mão, em vez de começar pela falta de uma linha.
        # Duas formas de chegar inútil, e as duas dão a mesma folha em branco:
        # o objeto não vir, ou vir sem `elements`. A segunda é mais traiçoeira,
        # porque o diagnóstico abaixo só imprime quando há `elements` — então
        # ela produzia o MESMO silêncio no log.
        _n_els = len((numeracao or {}).get("elements") or [])
        print(f"[impose] numeracao_id={data.get('numeracao_id')!r} "
              f"objeto={'veio' if numeracao else 'NAO VEIO'} elements={_n_els} | "
              f"numeracao_2_id={data.get('numeracao_2_id')!r} "
              f"objeto={'veio' if numeracao_2 else 'nao veio'}", flush=True)

        if data.get("numeracao_id") and not _n_els:
            _falta = "nao chegou" if not numeracao else "chegou SEM elementos"
            raise ValueError(
                f"Este trabalho pede numeracao, mas ela {_falta} ao motor: o "
                f"painel mandou numeracao_id={data.get('numeracao_id')!r}. A folha "
                "sairia so com a arte, sem numero e sem QR — e um ingresso sem "
                "codigo so falha na portaria do evento, quando ja nao da para "
                "consertar. Reabra o modelo, escolha a numeracao no seletor e "
                "gere de novo."
            )

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

        # Matching por INDICE (mais robusto que por filename no Linux)
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
            refazer_set=int(data.get("refazer_set", 1) or 1),
            refazer_celulas=data.get("refazer_celulas") or [],
            # QR Ideal: `pedido` e `pedidos_modelos.id_int`, `modelo` e
            # `pedidos_modelos.id`. Chegam do frontend porque so ele sabe de que
            # pedido o trabalho veio; o motor so calcula.
            pedido=data.get("pedido"),
            modelo=data.get("modelo"),
            pool_qr=_pool_qr_ou_none(),
            # ENTREGAR ENQUANTO GERA (27/08/2026). Desmarcado por padrao -- ver
            # `_folhas_por_lote` no engine.py. O caminho de entrega ja existia:
            # cada lote que o motor grava dispara o `on_file_gen` logo abaixo, e
            # de la vai para a resposta em streaming e para o hotfolder ou a
            # impressora, sem esperar o trabalho terminar.
            entregar_por_bloco=bool(data.get("entregar_por_bloco", False))
        )

        wants_stream = data.get("stream", False)

        if wants_stream:
            import asyncio
            import threading
            loop = asyncio.get_running_loop()
            queue = asyncio.Queue()

            # QUANTOS LOTES O MOTOR PODE ESTAR NA FRENTE (27/08/2026)
            #
            # Aqui havia um `time.sleep(1.2)` na thread do motor a cada arquivo:
            # uma pausa fixa para o event loop conseguir despachar o anterior.
            # Com capa e miolo eram dois ou tres arquivos e ninguem sentia. Com
            # a entrega por bloco sao centenas -- 350 lotes viravam sete minutos
            # de espera pura, dentro do recurso que existe justamente para o
            # papel comecar a sair antes.
            #
            # No lugar da pausa adivinhada, a conta de verdade: o motor so
            # comeca o lote seguinte se houver vaga, e a vaga volta quando o
            # lote anterior ja saiu na resposta. Duas vagas para que ele nunca
            # fique parado esperando a rede, e nunca mais que dois lotes de
            # base64 vivos na memoria.
            vagas = threading.Semaphore(2)
            cliente_saiu = threading.Event()

            def esperar_vaga():
                # Se o navegador fechar a aba no meio, o `finally` do gerador
                # levanta o `cliente_saiu` e o motor segue ate o fim sem travar
                # -- ele ainda precisa terminar para os temporarios serem
                # apagados.
                while not cliente_saiu.is_set():
                    if vagas.acquire(timeout=1.0):
                        return

            def on_file_gen(file_info):
                import base64
                path = file_info["path"]
                name = file_info["name"]
                ftype = file_info["type"]
                # Refazer entrega miolo avulso: capa e contracapa pertencem ao set
                # inteiro e já saíram na tiragem original. O motor também já não as
                # gera nesse caso — esta é a segunda tranca, para o dia em que um
                # caminho novo do motor esquecer a primeira.
                refazendo = (
                    int(data.get("refazer_de", 0) or 0) > 0
                    or bool(data.get("refazer_celulas") or [])
                )
                if refazendo and ftype in ["capa", "contracapa"]:
                    return
                if os.path.exists(path):
                    with open(path, "rb") as f_pdf:
                        b64_data = base64.b64encode(f_pdf.read()).decode("utf-8")
                    esperar_vaga()
                    loop.call_soon_threadsafe(queue.put_nowait, {
                        "type": "file",
                        "name": name,
                        "file_type": ftype,
                        "data": b64_data,
                        # So os lotes trazem: e a conta que a tela mostra a quem
                        # cancelar no meio. Ver `_folhas_por_lote` no engine.py.
                        "folhas": file_info.get("folhas"),
                        "folhas_entregues": file_info.get("folhas_entregues"),
                        "folhas_no_trabalho": file_info.get("folhas_no_trabalho"),
                    })

            engine = ImpositionEngine(config, on_file_generated=on_file_gen)
            print(f"[DIAG impose stream] schema={data.get('schema')!r} cut_stack_mode={data.get('cut_stack_mode')!r}")

            async def run_engine_task():
                try:
                    await asyncio.to_thread(engine.process)
                    _publicar_faixa_qr_ideal(config, data)
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
                        # Lote despachado: o motor ganha a vaga de volta. Como
                        # sao duas, ele nao ficou parado durante a pausa acima.
                        vagas.release()
                finally:
                    cliente_saiu.set()
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
        _publicar_faixa_qr_ideal(config, data)

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


# ─── PERFIS ICC (GERENCIAMENTO DE CORES) ──────────────────────────────────────
# O perfil e propriedade da IMPRESSORA, nao do trabalho: configurado uma vez,
# vale para todo pedido que va para ela. Mesmo padrao do mapa de PPDs.

@app.get("/api/icc")
def list_icc():
    return color_profiles.listar_perfis()

@app.post("/api/icc/upload")
async def upload_icc(file: UploadFile = File(...)):
    filename = os.path.basename(file.filename or "")
    if not filename.lower().endswith((".icc", ".icm")):
        raise HTTPException(status_code=400, detail="Apenas arquivos .icc ou .icm são suportados")
    dest_path = os.path.join(color_profiles.ICC_DIR, filename)
    with open(dest_path, "wb") as f:
        f.write(await file.read())
    try:
        return {"ok": True, "perfil": color_profiles.perfil_info(dest_path)}
    except ValueError as e:
        # Perfil invalido nao fica na pasta enganando a listagem
        os.remove(dest_path)
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/printers/icc-map")
def get_icc_map():
    return color_profiles.load_printer_icc_map()

@app.post("/api/printers/icc-map")
async def save_icc_map(request: Request):
    mapping = await request.json()
    color_profiles.save_printer_icc_map(mapping)
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

@app.get("/api/hotfolder/listar")
def hotfolder_listar():
    """As pastas ja autorizadas nesta estacao, para a tela desenhar os ladrilhos.

    A lista existia desde sempre no hot_folders.json, mas so' era consultada por
    dentro (para autorizar a gravacao). Sem esta rota, a tela nao tinha como
    mostrar ao operador o que ele ja tinha escolhido antes: cada trabalho
    recomecava do seletor nativo.

    `existe` vai junto de proposito. Pasta que sumiu (a rede caiu, alguem
    renomeou) precisa aparecer QUEBRADA na tela; se ela s'o falhasse na hora do
    envio, o operador descobriria com o material pronto e a impressora parada.

    COM PRAZO, e por um motivo que custa caro: `os.path.isdir` num caminho de
    rede cujo servidor nao responde nao devolve "false" — ele TRAVA, ate o
    timeout do SMB, que sao dezenas de segundos. Esta rota e' esperada pela
    tela ao abrir o modelo; sem prazo, uma pasta de rede fora do ar seguraria a
    janela inteira, e o operador esta de pe na frente da impressora.

    Pasta que nao responde a tempo devolve `existe: null` -- "nao sei", que e'
    diferente de "nao existe". A tela so' marca como quebrada quem responde
    `false`: acusar de sumida uma pasta que apenas demorou seria mentir.

    Nao expoe nada de novo: o /api/print-config/{produto_id} ja devolve o
    hot_folder_path gravado, e o CORS do agente e' restrito as origens do painel.
    """
    import concurrent.futures

    pastas = [p for p in db.list_hot_folders() if (p.get("path") or "").strip()]
    caminhos = [(p.get("path") or "").strip() for p in pastas]

    existe = {}
    if caminhos:
        # SEM `with`, de proposito. O __exit__ do ThreadPoolExecutor chama
        # shutdown(wait=True) e espera TODAS as threads terminarem -- inclusive
        # a que esta travada no SMB. Medido: com `with`, a resposta so' saia
        # 26,6s depois, mesmo com o wait() de 1,5s ja tendo retornado. O prazo
        # existia e nao servia para nada.
        pool = concurrent.futures.ThreadPoolExecutor(max_workers=8)
        try:
            futuros = {pool.submit(os.path.isdir, c): c for c in caminhos}
            # Prazo TOTAL, e nao por pasta: dez pastas travadas com 1,5s cada
            # dariam quinze segundos de janela parada.
            feitos, _ = concurrent.futures.wait(futuros, timeout=1.5)
            for f in feitos:
                try:
                    existe[futuros[f]] = f.result()
                except Exception:
                    existe[futuros[f]] = None
        finally:
            # A thread presa termina sozinha quando o SMB desistir; ate la ela
            # nao segura mais ninguem.
            pool.shutdown(wait=False)

    saida = [{
        "path": c,
        "nome": hotfolder.nome_curto(c),
        "existe": existe.get(c),          # None = nao deu tempo de conferir
        "registrada_em": p.get("registrada_em") or "",
    } for p, c in zip(pastas, caminhos)]

    saida.sort(key=lambda d: d["nome"].lower())
    return {"ok": True, "pastas": saida}


@app.post("/api/hotfolder/esquecer")
async def hotfolder_esquecer(request: Request):
    """Tira uma pasta da lista da estacao.

    Nasceu junto com os ladrilhos: enquanto a lista era invisivel, pasta velha
    nao incomodava ninguem. Mostrada na tela, ela vira entulho que o operador
    precisa poder limpar — e uma lista que so' cresce acaba escondendo a pasta
    certa no meio das antigas.

    Esquecer tambem RETIRA a autorizacao de gravar ali, que e' o que a lista
    guarda. Nada e' apagado do disco: a pasta continua onde estava.
    """
    try:
        data = await request.json()
    except Exception:
        data = {}
    caminho = (data.get("path") or "").strip()
    if not caminho:
        return {"ok": False, "detail": "informe a pasta"}
    return {"ok": db.esquecer_hot_folder(caminho)}


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

# 503 e nao 200-com-ok-false: "nao consegui perguntar ao banco" e "este usuario
# nao tem permissao nenhuma" sao respostas MUITO diferentes, e o painel precisa
# saber qual das duas recebeu antes de gravar qualquer coisa por cima.
@app.get("/api/user/permissions/{user_id}")
async def get_user_permissions_endpoint(user_id: str):
    try:
        perms = db.get_user_permissions(user_id)
    except db.BancoIndisponivel as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"ok": True, "permissions": perms}

@app.get("/api/user/permissions")
async def list_user_permissions_endpoint():
    try:
        perms = db.list_all_user_permissions()
    except db.BancoIndisponivel as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"ok": True, "permissions": perms}

@app.post("/api/user/permissions")
async def save_user_permissions_endpoint(request: Request):
    data = await request.json()
    try:
        linha = db.upsert_user_permissions(data)
    except db.BancoIndisponivel as e:
        raise HTTPException(status_code=503, detail=str(e))
    return {"ok": True, "permissions": linha}

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
    # 503 e nao lista vazia, pela mesma razao das permissoes logo acima: "nao
    # consegui perguntar" e "nao ha operador nenhum" sao respostas opostas, e a
    # segunda faria o administrador recadastrar quem ja existe.
    try:
        return {"ok": True, "acessos": db.listar_acessos_locais()}
    except db.BancoIndisponivel as e:
        raise HTTPException(status_code=503, detail=str(e))


@app.post("/api/acessos-locais")
async def salvar_acesso_local_endpoint(request: Request):
    data = await request.json()
    try:
        acesso = db.salvar_acesso_local(data)
    except db.CodigoInvalido as e:
        # 400 e nao 500: quem digitou o codigo precisa ler o motivo na tela.
        raise HTTPException(status_code=400, detail=str(e))
    except db.BancoIndisponivel as e:
        # A mensagem dela diz o que fazer — tipicamente "use o painel da nuvem",
        # porque a chave de servico nao vai para as estacoes.
        raise HTTPException(status_code=503, detail=str(e))
    if not acesso:
        raise HTTPException(status_code=500, detail="Nao foi possivel salvar o acesso local")
    return {"ok": True, "acesso": acesso}


@app.delete("/api/acessos-locais/{acesso_id}")
async def excluir_acesso_local_endpoint(acesso_id: str):
    try:
        return {"ok": db.excluir_acesso_local(acesso_id)}
    except db.BancoIndisponivel as e:
        raise HTTPException(status_code=503, detail=str(e))


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


