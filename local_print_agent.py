# -*- coding: utf-8 -*-
import multiprocessing
multiprocessing.freeze_support()
import sys
import os
import asyncio
import shutil
import tempfile
import json
import hashlib
import io
import uvicorn
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Request, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

import print_service
import ppd_parser
from engine import ImpositionConfig, ImpositionEngine
import db

app = FastAPI(title="Local Print Agent", description="Agente local para impressao direta e imposicao de PDFs.")

# ─────────────────────────────────────────────────────────────
# Cache de arte em memória: evita re-salvar o arquivo temp
# quando o mesmo PDF/imagem é enviado em jobs consecutivos.
# Chave = sha256 dos bytes do arquivo. Valor = caminho temp em disco.
# O arquivo temp permanece enquanto o agente estiver rodando.
# ─────────────────────────────────────────────────────────────
_ART_CACHE: dict[str, str] = {}
_ART_CACHE_PATHS: list[str] = []  # para limpeza ao encerrar

def _get_cached_art_path(content_bytes: bytes, ext: str) -> str:
    """Retorna caminho de arquivo temp já existente para este conteúdo,
    ou cria um novo arquivo temp e o armazena no cache."""
    file_hash = hashlib.sha256(content_bytes).hexdigest()
    if file_hash in _ART_CACHE and os.path.exists(_ART_CACHE[file_hash]):
        return _ART_CACHE[file_hash]
    # Criar arquivo temp persistente (delete=False — gerenciado pelo cache)
    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
        tmp.write(content_bytes)
        tmp_path = tmp.name
    _ART_CACHE[file_hash] = tmp_path
    _ART_CACHE_PATHS.append(tmp_path)
    return tmp_path

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

# Montar frontend estático (mesma pasta que o exe ou repositório)
_FRONTEND_DIR = None
for _candidate in [
    os.path.join(os.path.dirname(sys.executable), "frontend"),  # ao lado do exe
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "frontend"),  # ao lado do .py
]:
    if os.path.isdir(_candidate):
        _FRONTEND_DIR = _candidate
        break

if _FRONTEND_DIR:
    app.mount("/app", StaticFiles(directory=_FRONTEND_DIR, html=True), name="frontend")

LOCAL_AGENT_VERSION = "v355"

@app.get("/", include_in_schema=False)
def root_redirect():
    """Retorna status JSON (compatibilidade) e serve como health check."""
    return {"status": "running", "message": "NewProd Agent ativo", "version": LOCAL_AGENT_VERSION, "capabilities": ["impose", "print"]}

@app.get("/api/status")
def read_root():
    return {"status": "running", "message": "NewProd Agent ativo", "version": LOCAL_AGENT_VERSION, "capabilities": ["impose", "print"]}

@app.get("/api/version")
def version_info():
    return {"version": LOCAL_AGENT_VERSION, "commit": "local_agent_" + LOCAL_AGENT_VERSION}

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
        raise HTTPException(status_code=400, detail="Apenas arquivos .ppd sao suportados")
    dest_path = os.path.join(print_service.PPD_DIR, filename)
    with open(dest_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
    try:
        parser = ppd_parser.PPDParser(dest_path)
        return {"filename": filename, "nick_name": parser.nick_name, "model_name": parser.model_name, "options": parser.options}
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
    options: str = Form(...)
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

@app.post("/api/impose")
async def impose_file(
    request: Request,
    file: UploadFile | None = File(None),
    csv_file: UploadFile | None = File(None),
    multi_artes_files: list[UploadFile] = File(default=[]),
    payload: str = Form(...),
    background_tasks: BackgroundTasks = None,
):
    try:
        import csv
        import io
        data = json.loads(payload)

        formato = data.get("formato") or db.get_formato(data.get("formato_id"))
        saida   = data.get("saida") or db.get_saida(data.get("saida_id"))
        numeracao = data.get("numeracao") or (db.get_numeracao(data.get("numeracao_id")) if data.get("numeracao_id") else None)
        numeracao_2 = data.get("numeracao_2") or (db.get_numeracao(data.get("numeracao_2_id")) if data.get("numeracao_2_id") else None)

        if not formato:
            raise HTTPException(status_code=400, detail="Formato nao encontrado.")
        if not saida:
            raise HTTPException(status_code=400, detail="Saida nao encontrada.")

        csv_data = None
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

        base_file_path = ""
        if file:
            original_name = file.filename or "upload.pdf"
            ext = os.path.splitext(original_name)[1].lower() or ".pdf"
            if ext not in [".pdf", ".jpg", ".jpeg", ".png"]:
                raise HTTPException(status_code=400, detail=f"Formato de arquivo nao suportado: {ext}")
            # Usa cache: se o mesmo arquivo já foi enviado antes, reutiliza o temp em disco
            art_bytes = await file.read()
            base_file_path = _get_cached_art_path(art_bytes, ext)
        elif data.get("schema") != "multi_artes" and not data.get("multi_artes"):
            raise HTTPException(status_code=400, detail="Arquivo principal nao enviado.")

        # Saída: arquivo temp para o engine escrever
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp_out:
            out_pdf_path = tmp_out.name

        multi_artes_list = data.get("multi_artes", [])
        ma_files_map = {}
        temp_paths_ma = []

        form_data = await request.form()
        files_list = []
        for i in range(len(multi_artes_list)):
            f = form_data.get(f"ma_file_{i}")
            if f and hasattr(f, "filename"):
                files_list.append(f)
        
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
                    ext = os.path.splitext(ma_file.filename)[1].lower() if ma_file.filename else ".pdf"
                    with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp_in:
                        await ma_file.seek(0)
                        content = await ma_file.read()
                        tmp_in.write(content)
                        ma["local_path"] = tmp_in.name
                        temp_paths_ma.append(tmp_in.name)
                        ma_files_map[ma_file.filename or f"arte_{file_idx}"] = tmp_in.name

        print(f"[multi_artes:agent] Arquivos recebidos ({len(ma_files_map)}): {list(ma_files_map.keys())}")
        for _ma in multi_artes_list:
            _pn = _ma.get("pdf_name"); _lp = _ma.get("local_path")
            print(f"[multi_artes:agent] Arte pdf_name={_pn!r} -> local_path={_lp is not None}")

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
            block_depth=data.get("block_depth", 1)
        )

        engine = ImpositionEngine(config)
        # Chamada sincrona: fitz/PyMuPDF nao e thread-safe, run_in_executor causa lentidao
        engine.process()

        suffix_fn = f"CSV_{len(csv_data)}" if csv_data else f"{data.get('seq_start', 1)}-{data.get('seq_end', 100)}"
        download_name = f"VDP_{formato['name'].replace(' ', '_')}_{suffix_fn}.pdf"

        # Lê o PDF gerado para memória e remove o arquivo temp imediatamente
        with open(out_pdf_path, "rb") as f_pdf:
            pdf_bytes = f_pdf.read()

        # Limpeza em background: apenas arquivos temp de multi_artes e o out_pdf
        # (base_file_path fica no cache, não é apagado)
        if background_tasks:
            for temp_path in temp_paths_ma:
                if os.path.exists(temp_path):
                    background_tasks.add_task(os.remove, temp_path)
            if os.path.exists(out_pdf_path):
                background_tasks.add_task(os.remove, out_pdf_path)

        # StreamingResponse: envia direto da memória sem precisar do arquivo em disco
        return StreamingResponse(
            io.BytesIO(pdf_bytes),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{download_name}"',
                     "Content-Length": str(len(pdf_bytes))}
        )

    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))

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
        import os
        
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

if __name__ == "__main__":
    print("Iniciando Local Print Agent na porta 9000...")
    uvicorn.run("local_print_agent:app", host="0.0.0.0", port=9000, reload=True, reload_excludes=["venv/*"])
