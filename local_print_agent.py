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

@app.get("/", include_in_schema=False)
def root_redirect():
    """Retorna status JSON (compatibilidade) e serve como health check."""
    return {"status": "running", "message": "Ideal Imposition Agent ativo", "capabilities": ["impose", "print"]}

@app.get("/api/status")
def read_root():
    return {"status": "running", "message": "Ideal Imposition Agent ativo", "capabilities": ["impose", "print"]}

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
        elif data.get("schema") != "multi_artes":
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
            print_mode=data.get("print_mode", "front"),
            numeracao_2=numeracao_2,
            rotate_page=data.get("rotate_page", False),
            multi_artes=multi_artes_list
        )

        engine = ImpositionEngine(config)
        # Rodar em thread pool: engine.process() é CPU-bound e não deve bloquear o event loop
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, engine.process)

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

if __name__ == "__main__":
    print("Iniciando Local Print Agent na porta 9000...")
    uvicorn.run("local_print_agent:app", host="127.0.0.1", port=9000, reload=True, reload_excludes=["venv/*"])
