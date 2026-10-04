"""Concorrencia e ciclo de vida do seletor, sem abrir janela nem acessar dados."""
import ctypes
import threading
from types import SimpleNamespace

import pytest
import hotfolder


class Funcao:
    def __init__(self, chamada):
        self.chamada = chamada

    def __call__(self, *args):
        return self.chamada(*args)


@pytest.fixture
def windows(monkeypatch):
    liberacoes = []
    ole32 = SimpleNamespace(CoInitialize=Funcao(lambda _: 0),
                            CoUninitialize=Funcao(lambda: liberacoes.append(True)))
    monkeypatch.setattr(hotfolder, 'sys', SimpleNamespace(platform='win32'))
    monkeypatch.setattr(ctypes, 'windll', SimpleNamespace(ole32=ole32), raising=False)
    monkeypatch.setattr(hotfolder, '_dialogo_ativo', None)
    monkeypatch.setattr(hotfolder, '_focar_dialogo', lambda _: True)
    return ole32, liberacoes


def test_clique_repetido_recupera_mesma_janela_e_mesma_escolha(windows, monkeypatch):
    abriu, concluir, recuperou = threading.Event(), threading.Event(), threading.Event()
    chamadas, resultados, erros = [], [], []

    def abrir(inicial):
        chamadas.append(inicial)
        abriu.set()
        assert concluir.wait(5)
        return r'C:\pasta-sintetica'

    def escolher():
        try:
            resultados.append(hotfolder.escolher_pasta('inicial'))
        except Exception as e:
            erros.append(e)

    monkeypatch.setattr(hotfolder, '_abrir_dialogo', abrir)
    primeiro = threading.Thread(target=escolher)
    segundo = threading.Thread(target=escolher)
    primeiro.start()
    assert abriu.wait(3)
    def focar(_):
        if threading.current_thread() is segundo:
            recuperou.set()
        return True
    monkeypatch.setattr(hotfolder, '_focar_dialogo', focar)
    segundo.start()
    try:
        assert recuperou.wait(3)
    finally:
        concluir.set()
        primeiro.join(3)
        segundo.join(3)
    assert not primeiro.is_alive() and not segundo.is_alive()
    assert erros == []
    assert chamadas == ['inicial']
    assert resultados == [r'C:\pasta-sintetica'] * 2
    assert hotfolder._dialogo_ativo is None
    assert len(windows[1]) == 1


def test_cancelar_permite_escolher_novamente(windows, monkeypatch):
    escolhas = iter(['', r'C:\pasta-sintetica'])
    monkeypatch.setattr(hotfolder, '_abrir_dialogo', lambda _: next(escolhas))
    assert hotfolder.escolher_pasta() == ''
    assert hotfolder.escolher_pasta() == r'C:\pasta-sintetica'
    assert hotfolder._dialogo_ativo is None
    assert len(windows[1]) == 2


def test_erro_nativo_libera_estado_e_permite_retry(windows, monkeypatch):
    def erro(_):
        raise OSError('erro sintetico')
    monkeypatch.setattr(hotfolder, '_abrir_dialogo', erro)
    with pytest.raises(OSError, match='erro sintetico'):
        hotfolder.escolher_pasta()
    assert hotfolder._dialogo_ativo is None
    monkeypatch.setattr(hotfolder, '_abrir_dialogo', lambda _: '')
    assert hotfolder.escolher_pasta() == ''


def test_com_recusado_nao_abre_janela_nem_desinicializa(windows, monkeypatch):
    windows[0].CoInitialize.chamada = lambda _: -2147417850
    monkeypatch.setattr(hotfolder, '_abrir_dialogo', lambda _: pytest.fail('COM recusado'))
    with pytest.raises(OSError, match='80010106'):
        hotfolder.escolher_pasta()
    assert windows[1] == []
    assert hotfolder._dialogo_ativo is None


def test_erro_ao_encerrar_com_nao_deixa_seletor_bloqueado(windows, monkeypatch):
    def erro():
        raise OSError('encerramento sintetico')
    windows[0].CoUninitialize.chamada = erro
    monkeypatch.setattr(hotfolder, '_abrir_dialogo', lambda _: '')
    with pytest.raises(OSError, match='encerramento sintetico'):
        hotfolder.escolher_pasta()
    assert hotfolder._dialogo_ativo is None


def test_pontes_win32_preservam_ponteiros_64_bits(monkeypatch):
    from ctypes import wintypes
    ponteiro = 0x123456789ABC
    chamadas = []
    def selecionar(info):
        dados = info._obj
        dados.lpfn(0x12345678, 1, 0, 0)
        return ponteiro
    def caminho(pidl, buffer):
        assert pidl == ponteiro
        buffer.value = r'C:\pasta-sintetica'
        return True
    shell32 = SimpleNamespace(SHBrowseForFolderW=Funcao(selecionar),
                              SHGetPathFromIDListW=Funcao(caminho))
    ole32 = SimpleNamespace(CoTaskMemFree=Funcao(lambda p: chamadas.append(('free', p))))
    user32 = SimpleNamespace(SetWindowPos=Funcao(lambda *a: chamadas.append(('show', a[-1]))),
                             SetForegroundWindow=Funcao(lambda *_: 1),
                             SendMessageW=Funcao(lambda h, m, w, p: chamadas.append(('inicial', ctypes.wstring_at(p)))))
    monkeypatch.setattr(ctypes, 'windll', SimpleNamespace(shell32=shell32, ole32=ole32, user32=user32), raising=False)
    monkeypatch.setattr(ctypes, 'WINFUNCTYPE', getattr(ctypes, 'WINFUNCTYPE', ctypes.CFUNCTYPE), raising=False)
    assert hotfolder._abrir_dialogo(r'C:\inicial') == r'C:\pasta-sintetica'
    assert ('free', ponteiro) in chamadas
    assert ('inicial', r'C:\inicial') in chamadas
    assert any(c[0] == 'show' and c[1] & 0x40 for c in chamadas)
    assert ole32.CoTaskMemFree.argtypes == [ctypes.c_void_p]
    assert user32.SendMessageW.argtypes[-1] == wintypes.LPARAM


def test_pasta_virtual_tambem_libera_pidl(monkeypatch):
    frees = []
    shell32 = SimpleNamespace(SHBrowseForFolderW=Funcao(lambda _: 0x123456789ABC),
                              SHGetPathFromIDListW=Funcao(lambda *_: False))
    ole32 = SimpleNamespace(CoTaskMemFree=Funcao(frees.append))
    user32 = SimpleNamespace(SetWindowPos=Funcao(lambda *_: 1),
                             SetForegroundWindow=Funcao(lambda *_: 1), SendMessageW=Funcao(lambda *_: 1))
    monkeypatch.setattr(ctypes, 'windll', SimpleNamespace(shell32=shell32, ole32=ole32, user32=user32), raising=False)
    monkeypatch.setattr(ctypes, 'WINFUNCTYPE', getattr(ctypes, 'WINFUNCTYPE', ctypes.CFUNCTYPE), raising=False)
    assert hotfolder._abrir_dialogo() == ''
    assert frees == [0x123456789ABC]
