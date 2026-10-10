"""PDF real sintetico; Windows, cores e telemetria isolados. Nunca imprime."""
import hashlib
import json
from pathlib import Path
from types import SimpleNamespace
import uuid

import fitz
import pytest

import gestao_estacoes as gestao
import print_experimental as experimental
import print_service as service


@pytest.fixture
def job(tmp_path):
    path = tmp_path / 'amostra.pdf'
    with fitz.open() as doc:
        for n in range(2):
            page = doc.new_page(width=72, height=144)
            page.insert_text((5, 15), 'Teste %d' % n, fontsize=8)
        doc.save(path)
    return str(path), dict(experimental=True, dpi=300, copies=1, paper_size=9,
                          tray=7, duplex=2, color=2, orientation=1,
                          gestao_envio_id=str(uuid.uuid4()),
                          integridade_sha256=hashlib.sha256(path.read_bytes()).hexdigest())


@pytest.fixture
def hardware(tmp_path, monkeypatch):
    calls = []
    caps = dict(LOGPIXELSX=1200, LOGPIXELSY=1200, HORZRES=1200, VERTRES=2400,
                PHYSICALWIDTH=1200, PHYSICALHEIGHT=2400, PHYSICALOFFSETX=0, PHYSICALOFFSETY=0)
    class DC:
        def GetDeviceCaps(self, key): return caps[key]
        def StartPage(self): calls.append('StartPage')
        def EndPage(self): calls.append('EndPage')
        def EndDoc(self): calls.append('EndDoc')
        def AbortDoc(self): calls.append('AbortDoc')
        def DeleteDC(self): calls.append('DeleteDC')
    def start(*args):
        calls.append('StartDoc')
        return 42
    def devmode(printer, options):
        calls.append(('options', dict(options)))
        return SimpleNamespace(Copies=options["copies"], PaperSize=9, DefaultSource=7, Duplex=2, Color=2, Orientation=1)
    class Dib:
        def __init__(self, image): calls.append(('image', image.size, image.mode))
        def draw(self, hdc, rect): calls.append(('draw', rect))
    monkeypatch.setattr(service, 'HAS_WIN32', True)
    monkeypatch.setattr(service, 'HAS_WIN32UI', True)
    monkeypatch.setattr(service, 'win32con', SimpleNamespace(**{k: k for k in caps}), raising=False)
    monkeypatch.setattr(service, 'win32print', SimpleNamespace(StartDoc=start), raising=False)
    monkeypatch.setattr(service, 'win32gui', SimpleNamespace(CreateDC=lambda *a: 17), raising=False)
    monkeypatch.setattr(service, 'win32ui', SimpleNamespace(CreateDCFromHandle=lambda h: DC()), raising=False)
    monkeypatch.setattr(service, '_apply_devmode_options', devmode)
    monkeypatch.setattr(service.color_profiles, 'resolver_config', lambda p: (None, ''))
    monkeypatch.setattr(experimental.ImageWin, 'Dib', Dib)
    history = gestao.Historico(tmp_path / 'historico')
    monkeypatch.setattr(gestao, '_historico', history)
    monkeypatch.setattr(gestao, '_thread', object())
    # Nao existe qualquer saida de rede, RAW, fallback ou impressora real nesta fixture.
    def forbidden(*args, **kwargs): raise AssertionError('Motor normal acionado pelo teste experimental')
    for name in ('_send_pdf_raw', '_send_ps_ghostscript', '_send_gdi_raster'):
        monkeypatch.setattr(service, name, forbidden)
    return calls, history, caps


@pytest.mark.parametrize('dpi', [300, 600])
def test_resolucao_limitada_escala_100_e_pdf_intacto(job, hardware, dpi):
    path, opts = job
    opts['dpi'] = dpi
    before = Path(path).read_bytes()
    calls, history, caps = hardware
    result = experimental.enviar('Sintetica', path, opts)
    assert result['driver_dpi'] == [1200, 1200]
    assert result['raster_rgb_bytes'] == dpi * (dpi * 2) * 3 * 2
    assert calls.count(('image', (dpi, dpi * 2), 'RGB')) == 2
    assert calls.count(('draw', (0, 0, 1200, 2400))) == 2
    assert calls.count('StartDoc') == 1 and calls.count('EndDoc') == 1
    assert 'AbortDoc' not in calls and calls[-1] == 'DeleteDC'
    assert Path(path).read_bytes() == before
    row = history.relatorio()['trabalhos'][0]
    assert row['estado'] == 'enviado' and row['origem'] == 'experimental_gdi'
    assert row['spool_id'] == 42


@pytest.mark.parametrize('field,value', [('experimental', False), ('dpi', 1200), ('dpi', True),
                                      ('copies', 0), ('copies', True), ('tray', -1),
                                      ('duplex', 0), ('integridade_sha256', 'invalido'),
                                      ('gestao_envio_id', 'invalido')])
def test_preflight_recusa_sem_abrir_spool(job, hardware, field, value):
    path, opts = job
    opts[field] = value
    with pytest.raises(ValueError): experimental.enviar('Sintetica', path, opts)
    assert not hardware[0]


def test_falha_depois_do_startdoc_aborta_e_nao_repete(job, hardware, monkeypatch):
    def failure(*args): raise OSError('Falha sintetica no DIB')
    monkeypatch.setattr(experimental.ImageWin, 'Dib', failure)
    with pytest.raises(OSError): experimental.enviar('Sintetica', *job)
    calls, history, _ = hardware
    assert calls.count('StartDoc') == 1
    assert 'AbortDoc' in calls and 'EndDoc' not in calls
    assert history.relatorio()['trabalhos'][0]['estado'] == 'incerto'
    with pytest.raises(ValueError, match='ja foi registrado'): experimental.enviar('Sintetica', *job)
    assert calls.count('StartDoc') == 1


def test_mesma_tentativa_aceita_nao_duplica(job, hardware):
    experimental.enviar('Sintetica', *job)
    with pytest.raises(ValueError, match='ja foi registrado'): experimental.enviar('Sintetica', *job)
    assert hardware[0].count('StartDoc') == 1


def test_papel_menor_recusa_antes_do_startdoc(job, hardware):
    hardware[2]['PHYSICALWIDTH'] = 600
    with pytest.raises(ValueError, match='excede'): experimental.enviar('Sintetica', *job)
    assert 'StartDoc' not in hardware[0]
    assert hardware[0][-1] == 'DeleteDC'


def test_driver_nao_confirma_opcoes_bloqueia(job, hardware, monkeypatch):
    monkeypatch.setattr(service, '_apply_devmode_options', lambda *a: SimpleNamespace(Copies=2))
    with pytest.raises(ValueError, match='nao confirmou'): experimental.enviar('Sintetica', *job)
    assert 'StartDoc' not in hardware[0]


def test_ajustes_antes_do_perfil_cores(job, hardware, monkeypatch):
    order = []
    monkeypatch.setattr(service.color_profiles, 'resolver_config', lambda p: ({'path': 'sintetico', 'ajustes': {'brilho': 1}}, ''))
    monkeypatch.setattr(service.color_profiles, 'transform_para_gdi', lambda cfg: 'transform')
    def adjust(img, cfg): order.append('ajustes'); return img.copy()
    def transform(img, cfg): order.append('icc'); return img.copy()
    monkeypatch.setattr(service.color_profiles, 'aplicar_ajustes', adjust)
    monkeypatch.setattr(experimental.ImageCms, 'applyTransform', transform)
    experimental.enviar('Sintetica', *job)
    assert order == ['ajustes', 'icc', 'ajustes', 'icc']


@pytest.mark.parametrize('large', [False, True])
def test_rota_exclusiva_nao_chama_envio_normal(job, monkeypatch, tmp_path, large):
    from contextlib import contextmanager
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    import print_experimental_api as api
    class Temp:
        def __enter__(self): return self
        def __exit__(self, *args): pass
        @contextmanager
        def arquivo(self, suffix):
            with (tmp_path / ('upload' + suffix)).open('wb') as target: yield target
    monkeypatch.setattr(api.temp_manager, 'TrabalhoTemporario', Temp)
    calls = []
    def send(printer, path, options):
        calls.append(printer)
        return experimental.validar(path, options)
    monkeypatch.setattr(experimental, 'enviar', send)
    app = FastAPI()
    app.include_router(api.router)
    with TestClient(app) as client:
        caps = client.get('/api/print/experimental/capabilities').json()
        assert caps['schema'] == 2
        assert caps['modos'] == ['gdi_atual', 'experimental_gdi', 'pdf_raw']
        assert client.post('/api/print/submit').status_code == 404
        path, opts = job
        if large:
            data = Path(path).read_bytes() + b'\n%' + b' ' * (21 * 1024 * 1024)
            Path(path).write_bytes(data)
            opts['integridade_sha256'] = hashlib.sha256(data).hexdigest()
        assert caps['max_pages'] is None and caps['max_bytes'] is None
        response = client.post('/api/print/experimental/submit', data={'printer_name': 'Sintetica', 'options': json.dumps(opts)},
                               files={'file': ('teste.pdf', Path(path).read_bytes(), 'application/pdf')})
        assert response.status_code == 200
        assert response.json()['dpi'] == 300
        assert calls == ['Sintetica']


def test_gdi_padrao_continua_no_motor_existente(job, monkeypatch):
    called = []
    monkeypatch.setattr(service, 'HAS_WIN32', True)
    monkeypatch.setattr(service.color_profiles, 'resolver_config', lambda p: (None, ''))
    monkeypatch.setattr(service, '_apply_devmode_options', lambda *a: 'devmode')
    monkeypatch.setattr(service, '_send_gdi_raster', lambda *a: (called.append(a) or True, 'normal'))
    assert service._send_print_job_windows('Sintetica', job[0], {}) == (True, 'normal')
    assert called == [('Sintetica', job[0], 'devmode', 'impressao.pdf', None)]


def test_pdf_maior_que_limites_antigos_e_copias_do_modelo(job, hardware):
    path, opts = job
    with fitz.open() as doc:
        for _ in range(12): doc.new_page(width=72, height=72)
        data = doc.tobytes() + b'\n%' + b' ' * (21 * 1024 * 1024)
    Path(path).write_bytes(data)
    opts.update(copies=3, integridade_sha256=hashlib.sha256(data).hexdigest())
    result = experimental.enviar('Sintetica', path, opts)
    assert result['paginas'] == 12 and result['pdf_bytes'] == len(data)
    assert hardware[0][0][1]['copies'] == 3
    assert hardware[0].count('StartPage') == 12


def test_memoria_por_pagina_continua_protegida(job, hardware):
    path, opts = job
    with fitz.open() as doc:
        doc.new_page(width=10000, height=10000)
        data = doc.tobytes()
    Path(path).write_bytes(data)
    opts['integridade_sha256'] = hashlib.sha256(data).hexdigest()
    with pytest.raises(ValueError): experimental.enviar('Sintetica', path, opts)
    assert hardware[0] == []


def test_exclusao_mutua_impede_teste_concorrente(job, hardware):
    experimental._lock.acquire()
    try:
        with pytest.raises(ValueError, match='andamento'): experimental.enviar('Sintetica', *job)
    finally:
        experimental._lock.release()
    assert hardware[0] == []


def test_sem_monitor_nao_envia_teste_sem_historico(job, hardware, monkeypatch):
    monkeypatch.setattr(gestao, '_thread', None)
    with pytest.raises(ValueError, match='agente completo'): experimental.enviar('Sintetica', *job)
    assert hardware[0] == []


def test_gdi_atual_usa_dpi_driver_e_png(job, hardware, monkeypatch):
    path, opts = job
    opts['modo'] = 'gdi_atual'
    calls, history, _ = hardware
    original = experimental.Image.open
    decoded = []
    def read_png(stream):
        decoded.append(stream.getvalue()[:8])
        return original(stream)
    monkeypatch.setattr(experimental.Image, 'open', read_png)
    result = experimental.enviar('Sintetica', path, opts)
    assert result['dpi'] == 1200 and result['modo'] == 'gdi_atual'
    assert decoded == [b'\x89PNG\r\n\x1a\n'] * 2
    assert calls.count(('image', (1200, 2400), 'RGB')) == 2
    assert calls.count(('draw', (0, 0, 1200, 2400))) == 2
    assert result['raster_rgb_bytes'] == 1200 * 2400 * 3 * 2
    assert history.relatorio()['trabalhos'][0]['origem'] == 'experimental_gdi_atual'


@pytest.mark.parametrize('modo', ['gdi_atual', 'experimental_gdi'])
def test_gdi_falha_sem_fallback_nos_dois_modos(job, hardware, monkeypatch, modo):
    job[1]['modo'] = modo
    def fail(*args): raise OSError('DIB indisponivel')
    monkeypatch.setattr(experimental.ImageWin, 'Dib', fail)
    with pytest.raises(OSError): experimental.enviar('Sintetica', *job)
    assert hardware[0].count('StartDoc') == 1
    assert 'AbortDoc' in hardware[0] and 'EndDoc' not in hardware[0]


def raw_options(opts):
    return {**{k: opts[k] for k in ('experimental', 'copies', 'gestao_envio_id', 'integridade_sha256')},
            'modo': 'pdf_raw', 'raw_confirmado': True}


@pytest.mark.parametrize('failure', [False, True])
def test_raw_pdf_intacto_escrita_parcial_aborta_sem_alterar_driver(job, hardware, monkeypatch, failure):
    path, opts = job
    opts = raw_options(opts)
    calls, history, _ = hardware
    written = bytearray()
    def write(handle, chunk):
        if failure and written:
            raise OSError('Spool interrompido')
        amount = min(31, len(chunk))
        written.extend(chunk[:amount])
        return amount
    # Sem SetPrinter, DEVMODE, CreateDC, PNG, ICC ou outro modo disponivel.
    def forbidden(*args): raise AssertionError('RAW nao pode alterar ou rasterizar PDF')
    monkeypatch.setattr(service, '_apply_devmode_options', forbidden)
    monkeypatch.setattr(service.color_profiles, 'resolver_config', forbidden)
    monkeypatch.setattr(service, 'HAS_WIN32UI', False)
    monkeypatch.setattr(service, 'win32print', SimpleNamespace(
        OpenPrinter=lambda p: calls.append('OpenPrinter') or 17,
        StartDocPrinter=lambda h, level, info: calls.append(info) or 42,
        StartPagePrinter=lambda h: calls.append('StartPagePrinter'),
        WritePrinter=write,
        EndPagePrinter=lambda h: calls.append('EndPagePrinter'),
        EndDocPrinter=lambda h: calls.append('EndDocPrinter'),
        AbortPrinter=lambda h: calls.append('AbortPrinter'),
        ClosePrinter=lambda h: calls.append('ClosePrinter')))
    if failure:
        with pytest.raises(OSError): experimental.enviar('Sintetica', path, opts)
        assert 'AbortPrinter' in calls and 'EndDocPrinter' not in calls
        assert history.relatorio()['trabalhos'][0]['estado'] == 'incerto'
    else:
        result = experimental.enviar('Sintetica', path, opts)
        assert bytes(written) == Path(path).read_bytes()
        assert result['raw_bytes'] == len(written) and result['dpi'] is None
        assert 'EndDocPrinter' in calls and 'AbortPrinter' not in calls
        assert history.relatorio()['trabalhos'][0]['estado'] == 'enviado'
    assert calls[-1] == 'ClosePrinter'
    with pytest.raises(ValueError, match='ja foi registrado'): experimental.enviar('Sintetica', path, opts)
    assert calls.count('OpenPrinter') == 1


@pytest.mark.parametrize('change', [{'raw_confirmado': False}, {'tray': 7}, {'modo': 'auto'}, {'modo': ''}])
def test_raw_sem_aceite_ou_opcoes_de_driver_recusado(job, hardware, change):
    path, opts = job
    opts = dict(raw_options(opts), **change)
    with pytest.raises(ValueError): experimental.enviar('Sintetica', path, opts)
    assert hardware[0] == []


def test_perfil_alterado_impede_spool_e_libera_lock(job, hardware, monkeypatch):
    import impressao_destinos
    job[1]['perfil_driver'] = 'a' * 64
    def rejeitar(*args):
        raise ValueError('A fila ou o driver mudou')
    monkeypatch.setattr(impressao_destinos, 'conferir_identidade', rejeitar)
    with pytest.raises(ValueError, match='mudou'):
        experimental.enviar('Sintetica', *job)
    assert hardware[0] == []
    assert not experimental._lock.locked()


@pytest.fixture
def lote_job(tmp_path, hardware, monkeypatch):
    import impressao_destinos
    monkeypatch.setattr(impressao_destinos, 'conferir_identidade', lambda *a: None)
    calls = hardware[0]
    monkeypatch.setattr(service, '_apply_devmode_options', lambda p, o: SimpleNamespace(
        Copies=o['copies'], PaperSize=o['paper_size'], DefaultSource=o['tray'],
        Duplex=o['duplex'], Color=o['color'], Orientation=o['orientation']))
    def reset(h, dm):
        calls.append(('ResetDC', dm.DefaultSource, dm.Duplex, dm.Copies))
        return h
    service.win32gui.ResetDC = reset
    paths, partes = [], []
    for nome, n, tray, duplex in [('capa', 1, 7, 1), ('miolo', 3, 8, 2)]:
        path = tmp_path / (nome + '.pdf')
        with fitz.open() as pdf:
            for i in range(n):
                p = pdf.new_page(width=72, height=144)
                p.insert_text((5, 15), nome + str(i), fontsize=8)
            pdf.save(path)
        paths.append(str(path))
        partes.append({'tray': tray, 'duplex': duplex, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    return paths, dict(experimental=True, modo='experimental_gdi', dpi=300,
        copies=2, paper_size=9, color=2, orientation=1, partes=partes,
        gestao_envio_id=str(uuid.uuid4()), perfil_driver='a' * 64)


@pytest.mark.parametrize('modo', ['gdi_atual', 'experimental_gdi'])
def test_lote_unico_intercalado_duplex_impar_e_copias(lote_job, hardware, modo):
    import print_experimental_lote
    paths, opts = lote_job
    opts['modo'] = modo
    result = print_experimental_lote.enviar('Sintetica', paths, opts)
    calls = hardware[0]
    assert calls.count('StartDoc') == calls.count('EndDoc') == 1
    assert calls.count('StartPage') == calls.count('EndPage') == 10
    assert [c for c in calls if isinstance(c, tuple) and c[0] == 'ResetDC'] == [
        ('ResetDC', 8, 2, 1), ('ResetDC', 7, 1, 1), ('ResetDC', 8, 2, 1)]
    assert calls.count('DeleteDC') == 3  # dois preflights e um trabalho
    assert result['folhas'] == 6 and result['spool_id'] == 42
    assert 'AbortDoc' not in calls
    with pytest.raises(ValueError, match='ja foi registrado'):
        print_experimental_lote.enviar('Sintetica', paths, opts)
    assert calls.count('StartDoc') == 1


def test_ultimo_pdf_invalido_impede_todo_lote(lote_job, hardware):
    import print_experimental_lote
    paths, opts = lote_job
    opts['partes'][-1]['sha256'] = 'invalido'
    with pytest.raises(ValueError, match='diverge'):
        print_experimental_lote.enviar('Sintetica', paths, opts)
    assert 'StartDoc' not in hardware[0]
    assert not experimental._lock.locked()


def test_reset_recusado_aborta_sem_fallback(lote_job, hardware):
    import print_experimental_lote
    service.win32gui.ResetDC = lambda *a: 0
    with pytest.raises(ValueError, match='recusou'):
        print_experimental_lote.enviar('Sintetica', *lote_job)
    assert hardware[0].count('StartDoc') == 1
    assert hardware[0].count('AbortDoc') == 1
    assert 'EndDoc' not in hardware[0]
    assert not experimental._lock.locked()


def test_lote_raw_nao_finge_aplicar_bandejas(lote_job, hardware):
    import print_experimental_lote
    lote_job[1]['modo'] = 'pdf_raw'
    with pytest.raises(ValueError, match='RAW'):
        print_experimental_lote.enviar('Sintetica', *lote_job)
    assert not hardware[0]


def test_rota_lote_preserva_ordem_e_mais_de_mil_arquivos(tmp_path, monkeypatch):
    from contextlib import contextmanager
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    import print_experimental_api as api
    import print_experimental_lote
    class Temp:
        def __enter__(self): self.n = 0; return self
        def __exit__(self, *args): pass
        @contextmanager
        def arquivo(self, suffix):
            self.n += 1
            with (tmp_path / (str(self.n) + suffix)).open('wb') as target:
                yield target
    monkeypatch.setattr(api.temp_manager, 'TrabalhoTemporario', Temp)
    def enviar(printer, paths, options):
        assert printer == 'Sintetica'
        assert [Path(p).read_bytes() for p in paths] == [str(i).encode() for i in range(1001)]
        return {'spool_id': 42}
    monkeypatch.setattr(print_experimental_lote, 'enviar', enviar)
    app = FastAPI()
    app.include_router(api.router)
    with TestClient(app) as client:
        response = client.post('/api/print/experimental/submit-lote',
            data={'printer_name': 'Sintetica', 'options': '{}'},
            files=[('files', ('../arquivo.pdf', str(i).encode(), 'application/pdf')) for i in range(1001)])
        assert response.status_code == 200, response.text
        assert response.json()['spool_id'] == 42
