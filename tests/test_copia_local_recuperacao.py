"""Regressões locais, sem acesso a estações ou à nuvem."""
from concurrent.futures import ThreadPoolExecutor
import threading

import pytest

from coleta_autonoma import ColetaAutonoma
from conferencia_piloto import ConferenciaIndisponivel
from pacotes_api import ServicoPacotes
from selecao_piloto import SelecaoPiloto
from test_abertura_persistida import ambiente_v2


def test_operador_aguarda_preparacao_anterior_sem_liberar_snapshot_antes(tmp_path):
    s, estado, _, _ = ambiente_v2(tmp_path)
    p = SelecaoPiloto(s)
    entrou = threading.Event()
    liberar = threading.Event()
    original = s.coleta_autonoma.cliente.abrir_pedido

    def conferir(*args):
        if not entrou.is_set():
            entrou.set()
            assert liberar.wait(5)
        return original(*args)

    s.coleta_autonoma.cliente.abrir_pedido = conferir
    with ThreadPoolExecutor(max_workers=2) as pool:
        fundo = pool.submit(p.abrir_pedido, {'pedido': '99'})
        assert entrou.wait(5)
        tela = pool.submit(p.abrir_pedido, {'pedido': '99'})
        try:
            with pytest.raises(TimeoutError):
                tela.result(timeout=.1)
        finally:
            liberar.set()
        assert fundo.result(timeout=5)['pedido'] == '99'
        assert tela.result(timeout=5)['reutilizados'] == 2
    assert estado['downloads'] == 2


def test_fundo_nao_espera_operador_e_nao_consulta_origem(tmp_path):
    s, estado, _, _ = ambiente_v2(tmp_path)
    p = SelecaoPiloto(s)
    with p._lock:
        with pytest.raises(ConferenciaIndisponivel):
            p.abrir_pedido({'pedido': '99'}, aguardar=False)
    assert estado['consultas'] == 0


def test_espera_tem_limite_e_nao_libera_pedido(tmp_path):
    s, estado, _, _ = ambiente_v2(tmp_path)
    p = SelecaoPiloto(s)

    class Ocupado:
        def acquire(self, *, timeout):
            assert timeout == 30
            return False

    p._lock = Ocupado()
    with pytest.raises(ConferenciaIndisponivel):
        p.abrir_pedido({'pedido': '99'})
    assert estado['consultas'] == 0


def test_comando_reinicia_coleta_encerrada_sem_reiniciar_processo(tmp_path):
    s = ServicoPacotes(tmp_path, host='test.invalid', empresa='teste')
    s.coleta_autonoma = ColetaAutonoma(s, None)
    rodou = threading.Event()
    s.coleta_autonoma.rodar = rodou.set
    assert s.encerrar()
    try:
        s.iniciar_copia()
        assert rodou.wait(5)
        assert s._thread.is_alive()
        assert s.preparador._thread.is_alive()
        assert not s.preparador.resumo()['encerrando']
        assert s.coleta_autonoma._manual.is_set()
    finally:
        assert s.encerrar()


def test_nao_reinicia_coleta_encerrada_em_estacao_ocupada(tmp_path):
    s = ServicoPacotes(tmp_path, host='test.invalid', empresa='teste', ocupado=lambda: True)
    s.coleta_autonoma = ColetaAutonoma(s, None)
    assert s.encerrar()
    with pytest.raises(RuntimeError):
        s.iniciar_copia()
    assert s._stop.is_set() and s._thread is None


def test_fundo_usa_abertura_sem_espera(tmp_path):
    from test_offline_estacao import ambiente
    s, _, p, offline, _ = ambiente(tmp_path)
    chamadas = []

    def abrir(dados, *, aguardar):
        chamadas.append((dados, aguardar))

    p.abrir_pedido = abrir
    offline.ciclo()
    assert chamadas == [({'pedido': '99'}, False)]
