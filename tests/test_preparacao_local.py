"""Fila de preparação isolada; não importa app, rede ou impressora."""
from datetime import datetime, timedelta, timezone
import hashlib
import threading
import time

import pytest

from pacotes_locais import ArmazemPacotes
from preparacao_local import PreparadorLocal, prioridade


def recursos(tmp_path, modelo='1'):
    fonte = tmp_path / 'origem.bin'
    fonte.write_bytes(b'recurso sintetico')
    m = {'schema': 1, 'empresa': 'teste', 'modelo': modelo, 'revisao': 'r1',
         'configuracao': {}, 'arquivos': {'frente': {
             'sha256': hashlib.sha256(fonte.read_bytes()).hexdigest(),
             'bytes': fonte.stat().st_size}, 'verso': None}}
    return m, {'frente': fonte}


def aguardar(funcao):
    fim = time.monotonic() + 3
    while time.monotonic() < fim:
        if funcao():
            return
        time.sleep(0.01)
    pytest.fail('Preparação não atingiu estado esperado')


def test_prioridades_setor_prazo_fuso():
    agora = datetime.now(timezone.utc)
    vencido = prioridade('LASER', agora - timedelta(days=1), 'laser', agora)
    breve = prioridade('laser', agora + timedelta(hours=4), 'laser', agora)
    depois = prioridade('laser', agora + timedelta(days=3), 'laser', agora)
    sem_prazo = prioridade('laser', None, 'laser', agora)
    outro = prioridade('outro', agora - timedelta(days=2), 'laser', agora)
    assert vencido < breve < depois < sem_prazo < outro
    with pytest.raises(ValueError): prioridade('laser', datetime.now(), 'laser', agora)


def test_real_prepara_consulta_leve_e_expira(tmp_path, monkeypatch):
    m, fontes = recursos(tmp_path)
    a = ArmazemPacotes(tmp_path / 'cache', habilitado=True, reserva_bytes=0)
    tempo = [0]
    p = PreparadorLocal(a, relogio=lambda: tempo[0])
    try:
        p.agendar(m, fontes, setor='laser'); p.iniciar()
        aguardar(lambda: p.estado('teste', '1', 'r1')['estado'] == 'local_validado')
        # O status da interface não pode refazer o hash ou consultar SQLite.
        def proibido(*args, **kwargs): raise AssertionError('I/O na consulta leve')
        monkeypatch.setattr(a, 'consultar', proibido)
        assert p.estado('teste', '1', 'r1')['verificado_em']
        assert not p.estado('teste', '1', 'r1')['autorizado_offline']
        assert p.estado('teste', '1', 'r1', revisao_online='r2')['estado'] == 'atualizacao_pendente'
        tempo[0] = 61
        assert p.estado('teste', '1', 'r1')['estado'] == 'revalidacao_pendente'
        assert p.estado('outra', '1', 'r1')['estado'] == 'desconhecido'
    finally:
        assert p.encerrar()


def test_ocupado_adia_e_ordena(tmp_path):
    ocupado = threading.Event(); ocupado.set()
    ordem = []
    class Armazem:
        habilitado = True
        def preparar(self, m, fontes, checkpoint):
            checkpoint(); ordem.append(m['modelo'])
            return {'estado': 'local_validado'}
    p = PreparadorLocal(Armazem(), ocupado=ocupado.is_set)
    agora = datetime.now(timezone.utc)
    try:
        for modelo, setor, prazo in [('outro', 'outro', agora),
                                      ('depois', 'laser', agora + timedelta(days=3)),
                                      ('urgente', 'laser', agora - timedelta(hours=1))]:
            m, fontes = recursos(tmp_path, modelo)
            p.agendar(m, fontes, setor=setor, prazo=prazo)
        p.iniciar()
        time.sleep(0.03)
        assert ordem == []
        ocupado.clear()
        aguardar(lambda: len(ordem) == 3)
        assert ordem == ['urgente', 'outro', 'depois']
    finally: assert p.encerrar()


def test_falha_nao_para_proximo_e_nao_expoe_caminho(tmp_path):
    a = ArmazemPacotes(tmp_path / 'cache', habilitado=True, reserva_bytes=0)
    p = PreparadorLocal(a)
    try:
        m, fontes = recursos(tmp_path)
        p.agendar(m, {'frente': tmp_path / 'nao-existe'}, setor='laser')
        m2, fontes = recursos(tmp_path, '2')
        p.agendar(m2, fontes, setor='laser')
        p.iniciar()
        aguardar(lambda: p.estado('teste', '2', 'r1')['estado'] == 'local_validado')
        assert p.estado('teste', '1', 'r1')['estado'] == 'falha_preparacao'
        assert 'nao-existe' not in str(p.estado('teste', '1', 'r1'))
    finally: assert p.encerrar()


def test_pausa_cancelamento_ativo_e_reabertura(tmp_path):
    chegou = threading.Event(); liberar = threading.Event()
    real = ArmazemPacotes(tmp_path / 'cache', habilitado=True, reserva_bytes=0)
    class Armazem:
        habilitado = True
        def preparar(self, m, fontes, checkpoint):
            chegou.set()
            assert liberar.wait(2)
            return real.preparar(m, fontes, checkpoint=checkpoint)
    p = PreparadorLocal(Armazem())
    try:
        m, fontes = recursos(tmp_path)
        p.agendar(m, fontes, setor='laser'); p.iniciar()
        assert chegou.wait(2)
        p.pausar()
        liberar.set()
        aguardar(lambda: p.estado('teste', '1', 'r1')['estado'] == 'preparacao_pausada')
        assert p.encerrar()
        assert p.estado('teste', '1', 'r1')['estado'] == 'preparacao_interrompida'
        assert real.consultar('teste', '1', 'r1')['estado'] == 'sem_copia'
    finally:
        liberar.set(); p.encerrar()


def test_limite_deduplicacao_e_desativacao(tmp_path):
    a = ArmazemPacotes(tmp_path / 'cache', habilitado=True)
    p = PreparadorLocal(a, limite=1)
    m, fontes = recursos(tmp_path)
    assert p.agendar(m, fontes, setor='laser')
    assert not p.agendar(m, fontes, setor='laser')
    m['configuracao']['alterado'] = True
    with pytest.raises(ValueError, match='conteúdo diferente'):
        p.agendar(m, fontes, setor='laser')
    m2, _ = recursos(tmp_path, '2')
    with pytest.raises(RuntimeError, match='cheia'): p.agendar(m2, fontes, setor='laser')
    a.habilitado = False
    assert p.estado('teste', '1', 'r1')['estado'] == 'desativado'
    with pytest.raises(RuntimeError): p.iniciar()
    assert not a.raiz.exists()


def test_diagnostico_ocupacao_com_erro_nao_admite_trabalho(tmp_path):
    consultado = threading.Event()
    def ocupado():
        consultado.set()
        raise RuntimeError('diagnostico indisponivel')
    a = ArmazemPacotes(tmp_path / 'cache', habilitado=True)
    p = PreparadorLocal(a, ocupado=ocupado)
    try:
        m, fontes = recursos(tmp_path)
        p.agendar(m, fontes, setor='laser'); p.iniciar()
        assert consultado.wait(2)
        assert not a.raiz.exists()
        assert p.estado('teste', '1', 'r1')['estado'] == 'aguardando_preparacao'
    finally: assert p.encerrar()


def test_reabrir_nao_herda_selo_antigo(tmp_path):
    m, fontes = recursos(tmp_path)
    a = ArmazemPacotes(tmp_path / 'cache', habilitado=True, reserva_bytes=0)
    a.preparar(m, fontes)
    p = PreparadorLocal(a)
    assert p.estado('teste', '1', 'r1')['estado'] == 'desconhecido'
    try:
        p.agendar(m, {}, setor='laser'); p.iniciar()
        aguardar(lambda: p.estado('teste', '1', 'r1')['estado'] == 'local_validado')
    finally: assert p.encerrar()


def test_preferencia_muda_proximo_trabalho_sem_interromper_ativo(tmp_path):
    inicio = threading.Event(); liberar = threading.Event(); ordem = []
    class Armazem:
        habilitado = True
        def preparar(self, m, fontes, checkpoint):
            ordem.append(m['modelo'])
            if m['modelo'] == 'ativo':
                inicio.set(); assert liberar.wait(3)
            return {'estado':'local_validado'}
    p = PreparadorLocal(Armazem())
    agora = datetime.now(timezone.utc)
    try:
        m, f = recursos(tmp_path, 'ativo'); p.agendar(m, f, setor='laser', prazo=agora)
        p.iniciar(); assert inicio.wait(3)
        for nome, prazo in [('urgente', agora), ('preferido', agora + timedelta(days=4))]:
            m, f = recursos(tmp_path, nome); p.agendar(m, f, setor='laser', prazo=prazo)
        p.preferir({'preferido'}); liberar.set()
        aguardar(lambda: len(ordem) == 3)
        assert ordem == ['ativo', 'preferido', 'urgente']
    finally:
        liberar.set(); p.encerrar()
