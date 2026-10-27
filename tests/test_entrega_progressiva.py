import threading
import ast
import asyncio
import json
import os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor

import fitz
import pytest

from engine import ImpositionConfig, ImpositionEngine
from entrega_progressiva import EntregasPendentes


def config(tmp_path, nome, **kwargs):
    return ImpositionConfig(
        base_file="", out_pdf=str(tmp_path / nome),
        formato={"width_mm": 100, "height_mm": 50, "cols": 2, "rows": 2,
                 "has_cover": kwargs.pop("capa", False)},
        saida={"width_mm": 300, "height_mm": 300},
        numeracao={"tipo": "SEQUENCIAL", "elements": [
            {"type": "TEXT", "x_mm": 10, "y_mm": 20, "font_size": 14}]},
        seq_start=1, seq_end=40, sheets_per_block=3, **kwargs,
    )


def paginas(engine):
    resultado = []
    for arquivo in engine.generated_files:
        with fitz.open(arquivo["path"]) as doc:
            resultado.extend(p.get_pixmap().digest for p in doc)
    return resultado


@pytest.mark.parametrize("schema", ["sequential", "cut_stack"])
@pytest.mark.parametrize("capa", [False, True])
@pytest.mark.parametrize("duplex", [False, True])
def test_folha_preserva_paginas_e_ordem(tmp_path, schema, capa, duplex):
    opts = dict(layout_schema=schema, cut_stack_mode="strict_assembly",
                capa=capa, print_mode="duplex" if duplex else "front")
    original = ImpositionEngine(config(tmp_path, "original.pdf", **opts))
    original.process()
    progressivo = ImpositionEngine(config(tmp_path, "progressivo.pdf", folha_a_folha=True, **opts))
    progressivo.process()
    assert paginas(progressivo) == paginas(original)
    lotes = [f for f in progressivo.generated_files if f["type"] == "lote"]
    assert len(lotes) == 10
    for f in lotes:
        with fitz.open(f["path"]) as doc:
            assert len(doc) == (2 if duplex else 1)


@pytest.mark.parametrize("folha", [False, True])
@pytest.mark.parametrize("schema", ["sequential", "cut_stack"])
def test_entrega_antes_de_desenhar_proxima_folha_ou_bloco(tmp_path, monkeypatch, folha, schema):
    cfg = config(tmp_path, "progressivo.pdf", folha_a_folha=folha,
                 entregar_por_bloco=True, layout_schema=schema,
                 cut_stack_mode="strict_assembly")
    eventos = []
    original = fitz.Document.new_page

    def nova(doc, *args, **kwargs):
        if kwargs.get("width") == cfg.sheet_w:
            eventos.append("desenho")
        return original(doc, *args, **kwargs)

    monkeypatch.setattr(fitz.Document, "new_page", nova)
    motor = ImpositionEngine(cfg, on_file_generated=lambda _: eventos.append("envio"))
    motor.process()
    tamanho = 1 if folha else 3
    assert eventos[:tamanho + 2] == ["desenho"] * tamanho + ["envio", "desenho"]


def test_falha_de_entrega_interrompe_motor(tmp_path):
    recebidos = []

    def falhar(arquivo):
        recebidos.append(arquivo)
        raise RuntimeError("impressora recusou")

    motor = ImpositionEngine(config(tmp_path, "saida.pdf", folha_a_folha=True), falhar)
    with pytest.raises(RuntimeError, match="impressora recusou"):
        motor.process()
    assert len(recebidos) == 1
    assert len(list(tmp_path.glob("*.pdf"))) == 1


@pytest.mark.parametrize("schema", ["sequential", "cut_stack"])
def test_refazer_celulas_por_folha_preserva_selecao(tmp_path, schema):
    opts = dict(layout_schema=schema, cut_stack_mode="strict_assembly",
                refazer_celulas=[2, 5, 7, 10, 20, 35])
    original = ImpositionEngine(config(tmp_path, "original.pdf", **opts))
    original.process()
    progressivo = ImpositionEngine(config(tmp_path, "progressivo.pdf", folha_a_folha=True, **opts))
    progressivo.process()
    assert paginas(progressivo) == paginas(original)
    assert len(progressivo.generated_files) == 2


def test_confirmacao_libera_somente_seu_lote():
    fila = EntregasPendentes()
    token = fila.registrar()
    outro = fila.registrar()
    with ThreadPoolExecutor() as executor:
        tarefa = executor.submit(fila.esperar, token, threading.Event(), 2)
        assert fila.confirmar(outro)
        assert not tarefa.done()
        assert not fila.confirmar("invalido")
        assert fila.confirmar(token)
        tarefa.result(timeout=2)
    assert not fila.confirmar(token)
    fila.esperar(outro, threading.Event())


@pytest.mark.parametrize("cancelar", [False, True])
def test_cancelamento_e_timeout_removem_pendencia(cancelar):
    fila = EntregasPendentes()
    token = fila.registrar()
    cancelado = threading.Event()
    if cancelar:
        cancelado.set()
    with pytest.raises(RuntimeError):
        fila.esperar(token, cancelado, timeout=0)
    assert not fila.confirmar(token)


def test_stream_aguarda_confirmacao_do_painel(tmp_path):
    """Executa o ramo real do endpoint sem importar app/db ou iniciar servicos."""
    from starlette.responses import StreamingResponse
    from entrega_progressiva import entregas

    arvore = ast.parse(Path("app.py").read_text(encoding="utf-8"))
    impose = next(n for n in arvore.body if isinstance(n, ast.AsyncFunctionDef) and n.name == "impose_file")
    ramo = next(n for n in ast.walk(impose) if isinstance(n, ast.If)
                and isinstance(n.test, ast.Name) and n.test.id == "wants_stream")
    funcao = ast.AsyncFunctionDef(name="executar", args=ast.arguments(
        posonlyargs=[], args=[], kwonlyargs=[], kw_defaults=[], defaults=[]),
        body=ramo.body, decorator_list=[])
    modulo = ast.fix_missing_locations(ast.Module(body=[funcao], type_ignores=[]))
    arquivo = tmp_path / "lote.pdf"
    arquivo.write_bytes(b"pdf simulado")
    continuou = threading.Event()

    class Motor:
        def __init__(self, config, on_file_generated, resolver_recurso=None):
            self.callback = on_file_generated

        def process(self):
            self.callback({"path": str(arquivo), "name": arquivo.name, "type": "lote"})
            continuou.set()

    class Temporarios:
        def close(self):
            pass

    contexto = dict(data={"confirmar_entrega": True, "integridade": {"job_id": "teste"}}, config=None, temporarios=Temporarios(), resolver_local=None,
                    ImpositionEngine=Motor, StreamingResponse=StreamingResponse, os=os, json=json,
                    _IMPOSE_TASKS=set(), _publicar_faixa_qr_ideal=lambda *args: None)
    exec(compile(modulo, "app.py:stream", "exec"), contexto)

    async def executar():
        resposta = await contexto["executar"]()
        gerador = resposta.body_iterator
        evento = await anext(gerador)
        dados = json.loads(evento.split("data: ", 1)[1])
        assert not continuou.wait(0.05), "motor avancou antes do envio"
        assert entregas.confirmar(dados["token_entrega"])
        assert "event: done" in await anext(gerador)
        assert continuou.is_set()
        await gerador.aclose()

    asyncio.run(executar())
