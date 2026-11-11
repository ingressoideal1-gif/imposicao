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
        seq_start=1, seq_end=kwargs.pop('seq_end', 40), sheets_per_block=kwargs.pop('sheets_per_block', 3), **kwargs,
    )


def paginas(engine):
    resultado = []
    for arquivo in engine.generated_files:
        with fitz.open(arquivo["path"]) as doc:
            resultado.extend(p.get_pixmap().digest for p in doc)
    return resultado


@pytest.mark.parametrize('schema', ['sequential', 'cut_stack'])
@pytest.mark.parametrize('capa', [False, True])
@pytest.mark.parametrize('duplex', [False, True])
def test_trechos_de_dez_preservam_bloco_50_capas_versos_e_sobras(tmp_path, schema, capa, duplex):
    opts = dict(seq_end=212, sheets_per_block=50, capa=capa, layout_schema=schema,
                cut_stack_mode='strict_assembly', print_mode='duplex' if duplex else 'front')
    original = ImpositionEngine(config(tmp_path, 'inteiro.pdf', **opts))
    original.process()
    limitado = ImpositionEngine(config(tmp_path, 'trechos.pdf', limite_paginas_envio=10, **opts))
    limitado.process()
    assert paginas(limitado) == paginas(original)
    for f in limitado.generated_files:
        with fitz.open(f['path']) as pdf:
            assert len(pdf) <= 10
            if duplex and f['type'] == 'miolo': assert len(pdf) % 2 == 0
    assert [f['type'] for f in limitado.generated_files if f['type'] in ('capa','contracapa')] == [
        f['type'] for f in original.generated_files if f['type'] in ('capa','contracapa')]


def test_dez_paginas_enviadas_e_confirmadas_antes_da_decima_primeira(tmp_path, monkeypatch):
    fila = EntregasPendentes()
    token = fila.registrar()
    recebido, liberado = threading.Event(), threading.Event()
    arquivos = []
    def enviar(f):
        with fitz.open(f['path']) as doc: arquivos.append(len(doc))
        if len(arquivos) == 1:
            recebido.set()
            fila.esperar(token, threading.Event(), timeout=2)
            liberado.set()
    motor = ImpositionEngine(config(tmp_path, 'real.pdf', seq_end=212, sheets_per_block=50,
                                   layout_schema='cut_stack', cut_stack_mode='strict_assembly',
                                   limite_paginas_envio=10), enviar)
    desenhadas=[]
    nova=fitz.Document.new_page
    def contar(doc,*a,**k):
        if k.get('width')==motor.cfg.sheet_w:desenhadas.append(1)
        return nova(doc,*a,**k)
    monkeypatch.setattr(fitz.Document,'new_page',contar)
    with ThreadPoolExecutor() as ex:
        tarefa=ex.submit(motor.process)
        assert recebido.wait(2)
        assert arquivos == [10]
        assert len(desenhadas)==10, 'pagina 11 nao pode ser gerada antes de confirmar envio'
        assert not liberado.is_set() and not tarefa.done()
        assert fila.acompanhar(token)
        assert arquivos == [10] and not liberado.is_set()
        assert len(desenhadas)==10
        assert fila.confirmar(token)
        tarefa.result(timeout=10)
    assert arquivos == [10,10,10,10,10,3]


def test_multi_artes_ticket_em_dez_preserva_celulas_e_numeros(tmp_path):
    artes=[]
    for inicio in [1,1001]:
        artes.append(dict(qtd=120,bloco=50,numeracao=dict(tipo='TICKET',start=inicio,ticket_qtd=2,
            elements=[dict(type='TEXT',x_mm=10,y_mm=10+pos*10,font_size=12,ticket_pos=pos)
                      for pos in [1,2]])))
    opts=dict(multi_artes=artes,layout_schema='multi_artes',cut_stack_mode='strict_assembly',sheets_per_block=50,capa=True)
    original=ImpositionEngine(config(tmp_path,'multi.pdf',**opts));original.process()
    trechos=ImpositionEngine(config(tmp_path,'multi10.pdf',limite_paginas_envio=10,**opts));trechos.process()
    assert trechos.cfg.total_items==original.cfg.total_items==240
    assert paginas(trechos)==paginas(original)
    for f in trechos.generated_files:
        with fitz.open(f['path']) as pdf:assert len(pdf)<=10


def test_falha_no_primeiro_trecho_nao_gera_os_seguintes(tmp_path):
    arquivos=[]
    def falhar(f):
        arquivos.append(f)
        raise RuntimeError('spool simulado recusou')
    motor=ImpositionEngine(config(tmp_path,'falha.pdf',seq_end=212,sheets_per_block=50,
                                  layout_schema='cut_stack',cut_stack_mode='strict_assembly',
                                  limite_paginas_envio=10),falhar)
    with pytest.raises(RuntimeError,match='spool simulado'):motor.process()
    assert len(arquivos)==1
    with fitz.open(arquivos[0]['path']) as pdf:assert len(pdf)==10


@pytest.mark.parametrize('schema,modo,ultimo', [('cut_stack','strict_assembly',3), ('cut_stack','strict',3), ('sequential','independent',1)])
def test_refazer_somente_capas_equivale_as_capas_originais(tmp_path, monkeypatch, schema, modo, ultimo):
    opts=dict(seq_end=612,sheets_per_block=50,capa=True,layout_schema=schema,cut_stack_mode=modo)
    original=ImpositionEngine(config(tmp_path,'completo.pdf',**opts));original.process()
    capas=[f for f in original.generated_files if f['type']=='capa']
    de=2 if ultimo>1 else 1
    esperado=[]
    for f in capas[de-1:ultimo]:
        with fitz.open(f['path']) as doc:esperado.extend(p.get_pixmap().digest for p in doc)
    refazer=ImpositionEngine(config(tmp_path,'capas.pdf',refazer_capas=True,refazer_set=de,refazer_set_ate=ultimo,**opts))
    def nao_miolo(*a,**k):raise AssertionError('nao deve gerar miolo')
    monkeypatch.setattr(refazer,'_render_item_front',nao_miolo)
    monkeypatch.setattr(refazer,'_render_item_back',nao_miolo)
    refazer.process()
    assert len(refazer.generated_files)==ultimo-de+1
    assert all(f['type']=='capa' for f in refazer.generated_files)
    assert paginas(refazer)==esperado


@pytest.mark.parametrize('extra', [dict(capa=False),dict(refazer_set=5),dict(refazer_de=1),dict(refazer_celulas=[1])])
def test_refazer_capas_recusa_sem_capa_fora_da_faixa_e_modos_mistos(tmp_path, extra):
    opts=dict(capa=True,refazer_set=1,layout_schema='cut_stack',cut_stack_mode='strict_assembly')
    opts.update(extra)
    motor=ImpositionEngine(config(tmp_path,'invalido.pdf',refazer_capas=True,**opts))
    with pytest.raises(ValueError):motor.process()
    assert not motor.generated_files


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


def test_envio_de_330_segundos_so_libera_apos_confirmacao(monkeypatch):
    agora = [0.0]
    fila = EntregasPendentes(relogio=lambda: agora[0])
    token = fila.registrar()
    evento = fila._pendentes[token]['evento']
    def passo(_):
        agora[0] += 30
        assert fila.acompanhar(token)
        assert not evento.is_set(), 'renovacao nao pode confirmar o lote'
        if agora[0] == 330:
            assert fila.confirmar(token)
    monkeypatch.setattr(evento, 'wait', passo)
    fila.esperar(token, threading.Event())
    assert agora[0] == 330
    assert not fila.acompanhar(token)


@pytest.mark.parametrize('renovar', [False, True])
def test_envio_travado_tem_limite_mesmo_com_painel_ativo(monkeypatch, renovar):
    agora = [0.0]
    fila = EntregasPendentes(relogio=lambda: agora[0])
    token = fila.registrar()
    evento = fila._pendentes[token]['evento']
    def passo(_):
        agora[0] += 30
        if renovar: fila.acompanhar(token)
    monkeypatch.setattr(evento, 'wait', passo)
    with pytest.raises(RuntimeError, match='nao confirmado'):
        fila.esperar(token, threading.Event())
    assert agora[0] == (900 if renovar else 300)
    assert not fila.confirmar(token)
    assert not fila.acompanhar(token)


def test_renovacao_nao_ressuscita_token_vencido_nem_libera_outro():
    agora = [0.0]
    fila = EntregasPendentes(relogio=lambda: agora[0])
    primeiro, segundo = fila.registrar(), fila.registrar()
    agora[0] = 290
    assert fila.acompanhar(segundo)
    agora[0] = 301
    assert not fila.acompanhar(primeiro)
    assert not fila.confirmar(primeiro)
    assert fila.acompanhar(segundo)
    assert not fila._pendentes[segundo]['evento'].is_set()


def test_cancelamento_prevalece_sobre_renovacao():
    fila = EntregasPendentes()
    token = fila.registrar()
    assert fila.acompanhar(token)
    cancelado = threading.Event(); cancelado.set()
    with pytest.raises(RuntimeError, match='conexao encerrada'):
        fila.esperar(token, cancelado)
    assert not fila.confirmar(token)


def test_impressao_normal_libera_event_loop_para_acompanhamento(tmp_path):
    import io
    import shutil
    from types import SimpleNamespace
    arvore=ast.parse(Path('app.py').read_text(encoding='utf-8'))
    funcao=next(n for n in arvore.body if isinstance(n,ast.AsyncFunctionDef) and n.name=='submit_print_job')
    funcao.decorator_list=[]
    for arg in funcao.args.args: arg.annotation=None
    funcao.args.defaults=[ast.Constant(None) for _ in funcao.args.defaults]
    modulo=ast.fix_missing_locations(ast.Module(body=[funcao],type_ignores=[]))
    principal=threading.get_ident();executores=[]
    class Temporarios:
        def __enter__(self):return self
        def __exit__(self,*a):pass
        def arquivo(self,**k):return (tmp_path/'sintetico.pdf').open('wb')
    def enviar(**k):
        executores.append(threading.get_ident())
        assert Path(k['pdf_path']).read_bytes()==b'pdf sintetico'
        return True,'simulado'
    contexto=dict(temp_manager=SimpleNamespace(TrabalhoTemporario=Temporarios),
                  print_service=SimpleNamespace(send_print_job_windows=enviar),shutil=shutil,json=json,os=os)
    exec(compile(modulo,'app.py:submit','exec'),contexto)
    resposta=asyncio.run(contexto['submit_print_job'](SimpleNamespace(file=io.BytesIO(b'pdf sintetico'),filename='teste.pdf'),'simulada','{}'))
    assert resposta['status']=='success'
    assert len(executores)==1 and executores[0]!=principal


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
        assert dados['acompanhar_entrega'] is True
        assert not continuou.wait(0.05), "motor avancou antes do envio"
        assert entregas.confirmar(dados["token_entrega"])
        assert "event: done" in await anext(gerador)
        assert continuou.is_set()
        await gerador.aclose()

    asyncio.run(executar())
