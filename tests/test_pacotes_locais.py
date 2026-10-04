"""Somente arquivos sintéticos em tmp_path; sem app, banco remoto ou impressora."""
import copy
from concurrent.futures import ThreadPoolExecutor
import hashlib
from types import SimpleNamespace

import pytest

import pacotes_locais as pl


@pytest.fixture
def pacote(tmp_path):
    frente = tmp_path / "origem.bin"
    frente.write_bytes(b"arte sintetica para transporte")
    info = {"sha256": hashlib.sha256(frente.read_bytes()).hexdigest(),
            "bytes": frente.stat().st_size}
    manifesto = {"schema": 1, "empresa": "empresa-teste", "modelo": "1",
                 "revisao": "r1", "configuracao": {"setor": "laser"},
                 "arquivos": {"frente": info, "verso": None}}
    armazem = pl.ArmazemPacotes(tmp_path / "carteira", habilitado=True, reserva_bytes=0)
    return armazem, manifesto, {"frente": frente}


def test_desativado_nao_cria_arquivos(tmp_path, pacote):
    _, m, fontes = pacote
    a = pl.ArmazemPacotes(tmp_path / "desligado")
    assert a.consultar(m['empresa'], '1', 'r1')['estado'] == 'desativado'
    with pytest.raises(RuntimeError):
        a.preparar(m, fontes)
    assert not a.raiz.exists()


def test_reabertura_integridade_e_atualidade(pacote):
    a, m, fontes = pacote
    assert a.preparar(m, fontes)['estado'] == 'local_validado'
    novo = pl.ArmazemPacotes(a.raiz, habilitado=True)
    resultado = novo.consultar(m['empresa'], '1', 'r1')
    assert resultado['origem'] == 'local'
    assert resultado['atualidade_online'] == 'desconhecida'
    assert resultado['autorizado_offline'] is False
    assert novo.consultar(m['empresa'], '1', 'r1', revisao_online='r2')['estado'] == 'atualizacao_pendente'


def test_reuso_sem_fonte_e_isolamento_modelo_empresa(pacote):
    a, m, fontes = pacote
    a.preparar(m, fontes)
    m2 = copy.deepcopy(m); m2['modelo'] = '2'
    assert a.preparar(m2, {})['estado'] == 'local_validado'
    assert len(list(a.raiz.rglob('objetos/*'))) == 1
    assert a.consultar(m['empresa'], '3', 'r1')['estado'] == 'sem_copia'
    m2['empresa'] = 'outra'
    with pytest.raises(pl.PacoteInvalido):
        a.preparar(m2, {})


def test_mesma_revisao_nao_pode_mudar(pacote):
    a, m, fontes = pacote
    a.preparar(m, fontes)
    alterado = copy.deepcopy(m); alterado['configuracao']['setor'] = 'outro'
    with pytest.raises(pl.PacoteInvalido, match='imutável'):
        a.preparar(alterado, fontes)
    assert a.consultar(m['empresa'], '1', 'r1')['estado'] == 'local_validado'


@pytest.mark.parametrize('falha', ['ausente', 'hash', 'maior', 'disco', 'interrupcao'])
def test_falha_nao_publica_revisao_nem_destroi_anterior(pacote, monkeypatch, falha):
    a, m, fontes = pacote
    a.preparar(m, fontes)
    novo = copy.deepcopy(m); novo['revisao'] = 'r2'
    fonte = fontes['frente'].with_name('outro.bin'); fonte.write_bytes(b'novo verso')
    novo['arquivos']['verso'] = {'sha256': hashlib.sha256(fonte.read_bytes()).hexdigest(), 'bytes': 10}
    fontes = {'verso': fonte}
    if falha == 'ausente': fontes = {}
    if falha == 'hash': novo['arquivos']['verso']['sha256'] = '0' * 64
    if falha == 'maior': novo['arquivos']['verso']['bytes'] = 2
    if falha == 'disco': monkeypatch.setattr(pl.shutil, 'disk_usage', lambda _: SimpleNamespace(free=0))
    if falha == 'interrupcao':
        def interromper(*args): raise OSError('queda simulada antes da ativacao')
        monkeypatch.setattr(pl.os, 'replace', interromper)
    with pytest.raises((pl.PacoteInvalido, OSError)):
        a.preparar(novo, fontes)
    assert a.consultar(m['empresa'], '1', 'r2')['estado'] == 'sem_copia'
    assert a.consultar(m['empresa'], '1', 'r1')['estado'] == 'local_validado'
    assert not list(a.raiz.rglob('parcial-*'))


def test_corrupcao_detectada_e_reparada(pacote):
    a, m, fontes = pacote
    a.preparar(m, fontes)
    next(a.raiz.rglob('objetos/*')).write_bytes(b'alterado')
    assert a.consultar(m['empresa'], '1', 'r1')['estado'] == 'falha_validacao'
    assert a.preparar(m, fontes)['estado'] == 'local_validado'


def test_frente_ausente_intencionalmente(pacote):
    a, m, fontes = pacote
    m['arquivos']['verso'] = m['arquivos']['frente']; m['arquivos']['frente'] = None
    assert a.preparar(m, {'verso': fontes['frente']})['estado'] == 'local_validado'


@pytest.mark.parametrize('campo,valor', [('sha256', '../../escape'), ('bytes', -1), ('bytes', True)])
def test_metadados_invalidos_nao_criam_indice(pacote, campo, valor):
    a, m, fontes = pacote
    m['arquivos']['frente'][campo] = valor
    with pytest.raises(pl.PacoteInvalido): a.preparar(m, fontes)
    assert not a.raiz.exists()


def test_concorrencia_mesma_revisao(pacote):
    a, m, fontes = pacote
    with ThreadPoolExecutor(max_workers=2) as pool:
        resultados = list(pool.map(lambda _: a.preparar(m, fontes), range(2)))
    assert all(r['estado'] == 'local_validado' for r in resultados)
    assert len(list(a.raiz.rglob('objetos/*'))) == 1


def test_desativar_preserva_pacote(pacote):
    a, m, fontes = pacote
    a.preparar(m, fontes)
    a.habilitado = False
    assert a.consultar(m['empresa'], '1', 'r1')['estado'] == 'desativado'
    a.habilitado = True
    assert a.consultar(m['empresa'], '1', 'r1')['estado'] == 'local_validado'


def test_indice_corrompido_nao_mostra_validado(pacote):
    a, m, fontes = pacote
    a.preparar(m, fontes)
    next(a.raiz.rglob('indice.sqlite3')).write_bytes(b'indice corrompido')
    assert a.consultar(m['empresa'], '1', 'r1')['estado'] == 'falha_validacao'


def test_previa_limpeza_preserva_compartilhados_e_protegidos(pacote):
    a, m, fontes = pacote
    a.preparar(m, fontes)
    m2 = copy.deepcopy(m); m2['modelo'] = '2'
    a.preparar(m2, {})
    previa = a.prever_limpeza(m['empresa'], {('1', 'r1')}, set())
    assert previa['bytes_recuperaveis'] == 0
    previa = a.prever_limpeza(m['empresa'], {('1', 'r1'), ('2', 'r1')}, {('2', 'r1')})
    assert previa['bytes_recuperaveis'] == 0
    previa = a.prever_limpeza(m['empresa'], {('1', 'r1'), ('2', 'r1')}, set())
    assert previa['bytes_recuperaveis'] == m['arquivos']['frente']['bytes']
    assert a.consultar(m['empresa'], '1', 'r1')['estado'] == 'local_validado'
