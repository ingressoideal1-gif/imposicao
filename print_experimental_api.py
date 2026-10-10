"""Rotas exclusivas: agentes antigos recusam com 404, sem cair no motor normal."""
import json

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, Request
from starlette.concurrency import run_in_threadpool

import newprod_temp as temp_manager
import print_experimental
import impressao_destinos

router = APIRouter(prefix='/api/print/experimental')


@router.get('/capabilities')
def capabilities():
    return {'schema': 2, 'modos': list(print_experimental.MODOS), 'dpi': [300, 600],
            'max_pages': print_experimental.MAX_PAGES, 'max_bytes': print_experimental.MAX_BYTES,
            'perfil_destino': 1, 'lote_gdi': 1}


@router.post('/destino')
def destino(payload: dict):
    try:
        perfil = impressao_destinos.consultar(payload.get('printer_name'))
        impressao_destinos.validar_opcoes(perfil, payload.get('options'))
        return perfil
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post('/submit')
async def submit(file: UploadFile = File(...), printer_name: str = Form(...), options: str = Form(...)):
    try:
        selected = json.loads(options)
        if not printer_name.strip():
            raise ValueError('Selecione a impressora.')
        with temp_manager.TrabalhoTemporario() as temporarios:
            with temporarios.arquivo(suffix='.pdf') as target:
                while chunk := await file.read(1024 * 1024):
                    target.write(chunk)
                path = target.name
            return await run_in_threadpool(print_experimental.enviar, printer_name, path, selected)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        print('[print][EXPERIMENTAL] falha:', type(error).__name__, str(error))
        raise HTTPException(status_code=500, detail='Teste interrompido. Confira a fila e os logs antes de iniciar outro envio.') from error


@router.post('/submit-lote')
async def submit_lote(request: Request):
    try:
        import print_experimental_lote
        # Folha-a-folha pode gerar mais de mil arquivos; nao impor esse teto
        # implicito do parser. Uploads continuam sendo mantidos em disco.
        async with request.form(max_files=float('inf'), max_fields=2) as form:
            printer_name = form.get('printer_name')
            options = form.get('options')
            if not isinstance(printer_name, str) or not printer_name.strip() or not isinstance(options, str):
                raise ValueError('Impressora ou configuracao ausente.')
            selected = json.loads(options)
            files = form.getlist('files')
            if not files or any(not hasattr(f, 'read') for f in files):
                raise ValueError('Nenhum PDF recebido.')
            with temp_manager.TrabalhoTemporario() as temporarios:
                paths = []
                for file in files:
                    with temporarios.arquivo(suffix='.pdf') as target:
                        while chunk := await file.read(1024 * 1024):
                            target.write(chunk)
                        paths.append(target.name)
                return await run_in_threadpool(print_experimental_lote.enviar, printer_name, paths, selected)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        print('[print][LOTE EXPERIMENTAL] falha:', type(error).__name__)
        raise HTTPException(status_code=500, detail='Trabalho interrompido. Confira o spool antes de retomar; nao houve reenvio automatico.') from error
