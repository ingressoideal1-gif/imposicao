"""Sem app/db reais, rede, instalador ou impressora. Exercita funções do worker por AST."""
import ast
import asyncio
import hashlib
import io
import json
from pathlib import Path
from types import SimpleNamespace
import sys
import threading

import pytest
import controle_producao as cp


def test_reservas_e_instalacao_sao_exclusivas():
    c = cp.ControleProducao()
    a, b = c.reservar(), c.reservar()
    assert not c.iniciar_atualizacao()
    a.liberar(); a.liberar()
    assert not c.iniciar_atualizacao()
    b.liberar()
    assert c.iniciar_atualizacao() and c.reservar() is None
    assert not c.iniciar_atualizacao()
    c.cancelar_atualizacao()
    assert not c.ocupado()


def test_disputa_entre_instalacao_e_producao():
    for _ in range(30):
        c = cp.ControleProducao()
        inicio = threading.Barrier(2)
        resultados = {}
        def produzir():
            inicio.wait(); resultados['reserva'] = c.reservar()
        t = threading.Thread(target=produzir)
        t.start(); inicio.wait(); resultados['instala'] = c.iniciar_atualizacao(); t.join()
        assert (resultados['reserva'] is None) == resultados['instala']


@pytest.mark.parametrize('path', sorted(cp.ProtegerProducaoMiddleware.CAMINHOS))
def test_middleware_protege_resposta_e_recusa_durante_update(path):
    c = cp.ControleProducao()
    async def application(scope, receive, send):
        assert not c.iniciar_atualizacao()
        await send({'type': 'http.response.start', 'status': 200, 'headers': []})
        await asyncio.sleep(0)
        assert not c.iniciar_atualizacao()
        await send({'type': 'http.response.body', 'body': b'ok'})
    middleware = cp.ProtegerProducaoMiddleware(application, c)
    async def run():
        messages = []
        async def send(message): messages.append(message)
        await middleware({'type': 'http', 'method': 'POST', 'path': path}, None, send)
        assert not c.ocupado()
        assert c.iniciar_atualizacao()
        await middleware({'type': 'http', 'method': 'POST', 'path': path}, None, send)
        assert [m['status'] for m in messages if 'status' in m] == [200, 503]
    asyncio.run(run())


def test_middleware_libera_reserva_apos_erro():
    c = cp.ControleProducao()
    async def fail(*args): raise RuntimeError('simulado')
    with pytest.raises(RuntimeError):
        asyncio.run(cp.ProtegerProducaoMiddleware(fail, c)({'type': 'http', 'method': 'POST', 'path': '/api/impose'}, None, None))
    assert not c.ocupado()


@pytest.fixture
def updater(tmp_path, monkeypatch):
    c = cp.ControleProducao()
    monkeypatch.setattr(cp, 'controle', c)
    monkeypatch.setitem(sys.modules, 'security_config', SimpleNamespace(MANIFEST_URL='https://synthetic.invalid/latest', is_allowed_release_url=lambda _: True))
    msi = b'instalador sintetico, nunca executado'
    log, installs, requests = [], [], []
    reserva_download = []
    def urlopen(request, **kwargs):
        requests.append(request)
        if len(requests) == 1:
            return io.BytesIO(json.dumps({'version': '99.0.0', 'url': 'https://synthetic.invalid/new.msi', 'sha256': hashlib.sha256(msi).hexdigest()}).encode())
        if ns.get('ocupar_no_download'): reserva_download.append(c.reservar())
        return io.BytesIO(msi)
    def install(*args):
        assert c.reservar() is None, 'instalacao bloqueia nova producao'
        if ns.get('falhar_instalador'): raise OSError('simulado')
        installs.append(args)
    ns = dict(sys=SimpleNamespace(frozen=True), json=json, os=__import__('os'), time=SimpleNamespace(time=lambda: 1),
              tempfile=SimpleNamespace(gettempdir=lambda: str(tmp_path)),
              urllib=SimpleNamespace(request=SimpleNamespace(Request=lambda *a, **k: a[0], urlopen=urlopen)),
              _registrar_update=lambda status, **kwargs: log.append(status), _iniciar_instalador=install)
    tree = ast.parse(Path('agent_worker.py').read_text(encoding='utf-8'))
    funcs = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in ('verificar_atualizacao', '_verificar_atualizacao_ociosa')]
    exec(compile(ast.Module(body=funcs, type_ignores=[]), 'worker-isolado', 'exec'), ns)
    return c, ns, log, installs, requests, reserva_download


def test_update_adiado_antes_do_download(updater):
    c, ns, log, installs, requests, _ = updater
    r = c.reservar()
    ns['verificar_atualizacao'](True)
    assert log == ['adiado_producao'] and not requests and not installs
    r.liberar()


def test_update_confere_de_novo_apos_download(updater):
    c, ns, log, installs, _, reservations = updater
    ns['ocupar_no_download'] = True
    ns['verificar_atualizacao']()
    assert log == ['adiado_producao'] and not installs
    reservations[0].liberar()
    assert not c.ocupado()


def test_update_ocioso_fecha_admissoes(updater):
    c, ns, _, installs, _, _ = updater
    ns['verificar_atualizacao']()
    assert len(installs) == 1 and c.reservar() is None


def test_falha_ao_iniciar_instalador_reabre_admissoes(updater):
    c, ns, log, installs, _, _ = updater
    ns['falhar_instalador'] = True
    with pytest.raises(OSError): ns['verificar_atualizacao']()
    assert not c.ocupado() and not installs and log == ['instalacao_nao_iniciada']


@pytest.mark.parametrize('quando_ocupar', ['antes', 'download', None])
def test_sincronizacao_do_painel_respeita_producao(tmp_path, monkeypatch, quando_ocupar):
    c = cp.ControleProducao()
    monkeypatch.setattr(cp, 'controle', c)
    monkeypatch.setitem(sys.modules, 'security_config', SimpleNamespace(
        PAINEL_SYNC_BASE_URL='https://synthetic.invalid', PAINEL_ARQUIVOS=['index.html']))
    pasta = tmp_path / 'painel'; pasta.mkdir()
    (pasta / 'index.html').write_bytes(b'antigo')
    reservations, requests = [], []
    if quando_ocupar == 'antes': reservations.append(c.reservar())
    def urlopen(request, **kwargs):
        requests.append(request)
        if quando_ocupar == 'download': reservations.append(c.reservar())
        stream = io.BytesIO(b'<html>novo</html>'); stream.status = 200
        return stream
    ns = dict(PAINEL_DIR=str(pasta), os=__import__('os'), shutil=__import__('shutil'),
              time=SimpleNamespace(time=lambda: 1), _painel_valido=lambda _: True,
              urllib=SimpleNamespace(request=SimpleNamespace(Request=lambda *a, **k: a[0], urlopen=urlopen)))
    tree = ast.parse(Path('agent_worker.py').read_text(encoding='utf-8'))
    func = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'sincronizar_painel')
    exec(compile(ast.Module(body=[func], type_ignores=[]), 'painel-isolado', 'exec'), ns)
    assert ns['sincronizar_painel']() is (quando_ocupar is None)
    assert (pasta / 'index.html').read_bytes() == (b'antigo' if quando_ocupar else b'<html>novo</html>')
    if quando_ocupar == 'antes': assert not requests
    for r in reservations: r.liberar()
    assert not c.ocupado()
