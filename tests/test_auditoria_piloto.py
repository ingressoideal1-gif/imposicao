"""Regressões da revisão integral do piloto, apenas dados sintéticos."""
import io
import json
import sqlite3

import pytest

from pacotes_api import ServicoPacotes
from test_pacotes_api import ambiente, entrada, entrada_com_foto, enviar_entrada, TOKEN, BYTES, item


def test_servico_reinicia_no_mesmo_processo(tmp_path):
    s = ServicoPacotes(tmp_path, host='test.invalid', empresa='teste', abrir=lambda *a, **k: io.BytesIO(BYTES))
    s.cadastrar(item())
    s.iniciar(); assert s.encerrar()
    try:
        s.iniciar()
    finally:
        assert s.encerrar()


def test_catalogo_cheio_recusa_antes_de_persistir_pacote(tmp_path):
    s = ServicoPacotes(tmp_path, host='test.invalid', empresa='teste')
    con = s._db()
    try:
        con.executemany('INSERT INTO catalogo VALUES (?,?,?)',
                        [(str(i), 'r0', '{}') for i in range(128)])
        con.commit()
    finally: con.close()
    with pytest.raises(ValueError, match='cheio'):
        s.receber_entrada(entrada(), {'frente': io.BytesIO(BYTES)})
    assert not list(s.local.raiz.rglob('indice.sqlite3'))


def test_mapeamento_de_upload_invalido_recusado_na_admissao(tmp_path):
    with ambiente(tmp_path) as (s, c):
        m = entrada(); m['configuracao']['campos']['frente'] = 'csv_file'
        assert enviar_entrada(c, m).status_code == 400
        assert s.catalogo() == []


def test_bytes_corrompidos_apos_consulta_nao_sao_servidos(tmp_path, monkeypatch):
    with ambiente(tmp_path) as (s, c):
        m = entrada(); assert enviar_entrada(c, m).status_code == 200
        original = s.local.consultar
        def consultar(*a, **k):
            resultado = original(*a, **k)
            caminho = s.local._pasta('teste') / 'objetos' / m['arquivos']['frente']['sha256']
            caminho.write_bytes(b'conteudo corrompido apos conferencia')
            return resultado
        monkeypatch.setattr(s.local, 'consultar', consultar)
        r = c.get('/api/pacotes-locais/recurso/1/r1/frente', headers={'X-NewProd-Piloto': TOKEN})
        assert r.status_code == 409
        assert b'conteudo corrompido' not in r.content


def test_coleta_nao_reutiliza_manifesto_derivado_adulterado(tmp_path):
    from test_pacotes_api import estado_ate
    m, arte, foto = entrada_com_foto()
    with ambiente(tmp_path, lambda *a, **k: io.BytesIO(foto)) as (s, c):
        assert enviar_entrada(c, m, arte).status_code == 200
        estado_ate(s, 'fotos_fontes_locais')
        derivado = s.obter_coleta(m)
        derivado['configuracao']['revisao_entrada'] = 'outra'
        s.salvar_coleta(m, derivado)
        with pytest.raises(ValueError):
            s.preparador.armazenamento.preparar(m, {})


def test_diario_recusa_outro_nome_de_estacao_na_mesma_raiz(tmp_path):
    from diario_local import DiarioLocal
    d = DiarioLocal(tmp_path, 'A'); d.registrar('e', 't', 'r', 0, 'tentativa', 'preparado')
    with pytest.raises(ValueError):
        DiarioLocal(tmp_path, 'B').pendentes()


def test_recibo_malformado_nao_confirma_evento(tmp_path):
    from diario_local import DiarioLocal
    d = DiarioLocal(tmp_path, 'A'); d.registrar('e', 't', 'r', 0, 'tentativa', 'preparado')
    with pytest.raises(ValueError):
        d.sincronizar(lambda lote: [{}])
    assert len(d.pendentes()) == 1


def test_recuperacao_concorrente_do_diario_nao_duplica_incerto(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    from diario_local import DiarioLocal
    d = DiarioLocal(tmp_path, 'A')
    d.registrar('e', 't', 'r', 0, 'tentativa', 'preparado')
    d.registrar('e', 't', 'r', 0, 'tentativa', 'envio_iniciado')
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(lambda _: DiarioLocal(tmp_path, 'A').recuperar_envios_incertos(), range(4)))
    assert [e['estado'] for e in d.pendentes()] == ['preparado', 'envio_iniciado', 'incerto']


@pytest.mark.parametrize('url', [' https://test.invalid/storage/v1/object/public/a',
    'https://test.invalid/storage/v1/object/public/a\n',
    'https://test.invalid/storage/v1/object/public/a\tb'])
def test_url_com_controle_nao_e_normalizada_silenciosamente(url):
    from pacotes_download import validar_url
    with pytest.raises(ValueError): validar_url(url, 'test.invalid')


def test_empresa_explicita_e_obrigatoria_para_ativar(tmp_path, monkeypatch):
    from fastapi import FastAPI
    from pacotes_api import configurar_piloto
    monkeypatch.setenv('NEWPROD_PILOTO_LOCAL', '1')
    monkeypatch.setenv('NEWPROD_PILOTO_RAIZ', str(tmp_path))
    monkeypatch.setenv('NEWPROD_PILOTO_TOKEN', TOKEN)
    monkeypatch.delenv('NEWPROD_PILOTO_EMPRESA', raising=False)
    with pytest.raises(ValueError, match='empresa'):
        configurar_piloto(FastAPI(), ocupado=lambda: False)
    assert not list(tmp_path.iterdir())


def test_encerramento_nao_declara_concluido_com_catalogo_ativo(tmp_path):
    class CatalogoAindaAtivo:
        def join(self, timeout): pass
        def is_alive(self): return True
    s = ServicoPacotes(tmp_path, host='test.invalid', empresa='teste')
    s._thread = CatalogoAindaAtivo()
    assert s.encerrar() is False
    with pytest.raises(RuntimeError, match='Encerramento'):
        s.iniciar()


def test_token_com_bytes_nao_ascii_e_recusado_sem_erro_500(tmp_path):
    with ambiente(tmp_path) as (s, c):
        r = c.get('/api/pacotes-locais/estado', headers=[(b'X-NewProd-Piloto', b'\xff' * 32)])
        assert r.status_code == 401


def test_preparacao_pausada_nao_bloqueia_gravacao_de_outra_captura(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    import threading
    from pacotes_locais import ArmazemPacotes
    a = ArmazemPacotes(tmp_path / 'pacotes', habilitado=True, reserva_bytes=0)
    fonte = tmp_path / 'fonte.pdf'; fonte.write_bytes(BYTES)
    m = item()['manifesto']; m2 = item()['manifesto']; m2['modelo'] = '2'
    pausado, liberar = threading.Event(), threading.Event()
    def checkpoint():
        pausado.set()
        assert liberar.wait(5)
    with ThreadPoolExecutor(max_workers=2) as pool:
        primeiro = pool.submit(a.preparar, m, {'frente': fonte}, checkpoint=checkpoint)
        try:
            assert pausado.wait(2)
            segundo = pool.submit(a.preparar, m2, {'frente': fonte})
            assert segundo.result(timeout=1)['estado'] == 'local_validado'
        finally:
            liberar.set()
        assert primeiro.result(timeout=3)['estado'] == 'local_validado'


def test_revisoes_concorrentes_divergentes_nao_sobrescrevem_indice(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    import threading
    from pacotes_locais import ArmazemPacotes, PacoteInvalido
    a = ArmazemPacotes(tmp_path / 'pacotes', habilitado=True, reserva_bytes=0)
    fonte = tmp_path / 'fonte.pdf'; fonte.write_bytes(BYTES)
    barreira = threading.Barrier(2)
    def executar(variante):
        m = item()['manifesto']; m['configuracao']['variante'] = variante
        primeira = True
        def checkpoint():
            nonlocal primeira
            if primeira:
                primeira = False; barreira.wait(timeout=3)
        try:
            a.preparar(m, {'frente': fonte}, checkpoint=checkpoint)
            return True
        except PacoteInvalido:
            return False
    with ThreadPoolExecutor(max_workers=2) as pool:
        resultados = list(pool.map(executar, [1, 2]))
    assert sorted(resultados) == [False, True]
    assert a.consultar('teste', '1', 'r1')['estado'] == 'local_validado'
