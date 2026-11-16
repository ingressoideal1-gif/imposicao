"""Concorrencia da abertura com coleta/retencao, somente dados sinteticos."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import threading

import pytest

from selecao_piloto import SelecaoPiloto
from test_abertura_persistida import ambiente_v2
from test_catalogo_revisoes import entrada, registros, servico
from test_revisao_pedido_piloto import ambiente
from test_retencao_cache import preparado, limpar


@pytest.fixture(autouse=True)
def perfil_isolado(tmp_path, monkeypatch):
    monkeypatch.setenv('LOCALAPPDATA', str(tmp_path / 'perfil'))


def test_reabre_pedido_enquanto_varredura_espera_disco_e_preserva_retencao(tmp_path, monkeypatch):
    s, estado, dados, anterior = preparado(tmp_path)
    entrou, liberar = threading.Event(), threading.Event()
    copias = s.copias_presentes

    def disco_lento(*args, **kwargs):
        entrou.set()
        assert liberar.wait(10)
        return copias(*args, **kwargs)

    monkeypatch.setattr(s, 'copias_presentes', disco_lento)
    with ThreadPoolExecutor(max_workers=2) as pool:
        fila = pool.submit(s.atualizar_fila)
        try:
            assert entrou.wait(3)
            assert limpar(s)['adiado']
            abertura = pool.submit(s.offline.selecao.preparar_pedido, dados)
            novo = abertura.result(timeout=2)
            assert novo['reutilizados'] == 1
            assert novo['pacotes'][0]['revisao'] == anterior['pacotes'][0]['revisao']
            assert estado['downloads'] == 1
        finally:
            liberar.set()
        fila.result(timeout=5)
    assert s.local._cache_em_uso == 0
    assert limpar(s)['modelos'] == 1


def test_conferencia_remota_nao_trava_pedido_pronto_nem_permite_limpeza(tmp_path):
    s, estado, dados, _ = preparado(tmp_path)
    entrou, liberar = threading.Event(), threading.Event()

    def rede_lenta(*args):
        entrou.set()
        assert liberar.wait(10)
        return datetime.now(timezone.utc).isoformat()

    with ThreadPoolExecutor(max_workers=2) as pool:
        antecipacao = pool.submit(s.antecipar, entrada('20'), _conferidor=rede_lenta)
        try:
            assert entrou.wait(3)
            assert limpar(s)['adiado']
            abertura = pool.submit(s.offline.selecao.preparar_pedido, dados)
            assert abertura.result(timeout=2)['reutilizados'] == 1
            assert estado['downloads'] == 1
        finally:
            liberar.set()
        antecipacao.result(timeout=5)
    assert s.local._cache_em_uso == 0


def test_varredura_de_copias_preparadas_nao_reabre_sqlite_por_modelo(tmp_path, monkeypatch):
    s, _, _, dados = ambiente(tmp_path, total=32)
    SelecaoPiloto(s).preparar_pedido(dados)
    conexoes = []
    db = s._db

    def contar():
        conexoes.append(1)
        return db()

    monkeypatch.setattr(s, '_db', contar)
    s.atualizar_fila()
    assert len(conexoes) <= 2
    assert not s.preparador._tarefas


def test_abertura_busca_modelo_por_chave_sem_carregar_catalogo_inteiro(tmp_path, monkeypatch):
    s, estado, _, _ = ambiente_v2(tmp_path)

    def proibido():
        raise AssertionError('Abertura nao deve carregar o catalogo inteiro')

    monkeypatch.setattr(s, 'catalogo', proibido)
    r = SelecaoPiloto(s).abrir_pedido({'pedido': '99'})
    assert len(r['pacotes']) == 2 and estado['downloads'] == 2
    con = s._db()
    try:
        modelo, revisao = con.execute('SELECT modelo,revisao FROM catalogo LIMIT 1').fetchone()
    finally:
        con.close()
    s.preparar_abertura({'modelo': modelo, 'revisao': revisao})
    assert (s.empresa, modelo, revisao) in s.preparador._tarefas


def test_varredura_nao_reagenda_revisao_arquivada_durante_leitura(tmp_path, monkeypatch):
    s = servico(tmp_path, limite=2)
    antiga = s.antecipar(entrada(versao=1))['revisao']
    s.antecipar(entrada(versao=2))
    entrou, liberar = threading.Event(), threading.Event()
    copias = s.copias_presentes

    def primeiro_item(*args, **kwargs):
        if not entrou.is_set():
            entrou.set()
            assert liberar.wait(10)
        return copias(*args, **kwargs)

    monkeypatch.setattr(s, 'copias_presentes', primeiro_item)
    with ThreadPoolExecutor(max_workers=2) as pool:
        fila = pool.submit(s.atualizar_fila)
        try:
            assert entrou.wait(3)
            pool.submit(s.antecipar, entrada(versao=3)).result(timeout=2)
            assert ('1', antiga) in registros(s, 'catalogo_arquivo')
        finally:
            liberar.set()
        fila.result(timeout=5)
    assert ('teste', '1', antiga) not in s.preparador._tarefas


def test_falha_na_varredura_libera_protecao_do_cache(tmp_path, monkeypatch):
    s, _, _, _ = preparado(tmp_path)

    def falhar(*args, **kwargs):
        raise OSError('disco simulado indisponivel')

    monkeypatch.setattr(s, 'copias_presentes', falhar)
    with pytest.raises(OSError):
        s.atualizar_fila()
    assert s.local._cache_em_uso == 0
    assert limpar(s)['modelos'] == 1
