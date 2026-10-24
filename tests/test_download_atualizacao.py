import hashlib
import io
from types import SimpleNamespace
import pytest
import download_atualizacao as d


@pytest.fixture
def disco(monkeypatch):
    monkeypatch.setattr(d.shutil, 'disk_usage', lambda _: SimpleNamespace(free=10**12))


def executar(tmp_path, conteudo=b'pacote', tamanho=6, sha=None, abrir=None):
    return d.baixar(abrir or (lambda *a, **k: io.BytesIO(conteudo)), object(),
                    tmp_path/'setup.msi', tamanho,
                    sha or hashlib.sha256(b'pacote').hexdigest(), tmp_path)


def test_download_confere_e_substitui_so_ao_concluir(tmp_path, disco):
    (tmp_path/'setup.msi').write_bytes(b'antigo')
    executar(tmp_path)
    assert (tmp_path/'setup.msi').read_bytes() == b'pacote'
    assert not list(tmp_path.glob('*.part'))


@pytest.mark.parametrize('conteudo,tamanho,erro', [
    (b'curto', 6, 'download_incompleto'), (b'excedido', 6, 'tamanho_excedido'),
    (b'errado', 6, 'sha_divergente')])
def test_falhas_preservam_pacote_anterior(tmp_path, disco, conteudo, tamanho, erro):
    (tmp_path/'setup.msi').write_bytes(b'antigo')
    with pytest.raises(d.FalhaDownload, match=erro):
        executar(tmp_path, conteudo, tamanho)
    assert (tmp_path/'setup.msi').read_bytes() == b'antigo'
    assert not list(tmp_path.glob('*.part'))


def test_rede_interrompida_remove_somente_parcial_proprio(tmp_path, disco):
    class Interrompido(io.BytesIO):
        def read(self, *args):
            if self.tell():
                raise OSError('rede interrompida')
            return super().read(*args)
    (tmp_path/'outro.part').write_bytes(b'preservar')
    with pytest.raises(OSError):
        executar(tmp_path, abrir=lambda *a, **k: Interrompido(b'pac'))
    assert sorted(p.name for p in tmp_path.iterdir()) == ['outro.part']


def test_sem_espaco_na_instalacao_nao_inicia_rede(tmp_path, monkeypatch):
    chamadas = []
    def espaco(pasta):
        chamadas.append(pasta)
        return SimpleNamespace(free=10**12 if len(chamadas) == 1 else 0)
    monkeypatch.setattr(d.shutil, 'disk_usage', espaco)
    with pytest.raises(d.FalhaDownload, match='espaco_insuficiente'):
        executar(tmp_path, abrir=lambda *a, **k: pytest.fail('rede iniciada'))
    assert len(chamadas) == 2


def test_falha_fatal_exige_tentativa_humana_ou_nova_versao():
    registro = dict(etapa='instalacao_falhou', versao_alvo='1.3.33')
    assert d.exige_intervencao(registro, '1.3.33')
    assert not d.exige_intervencao(registro, '1.3.33', forcado=True)
    assert not d.exige_intervencao(registro, '1.3.34')
    assert d.exige_intervencao(dict(etapa='download_falhou', versao_alvo='1.3.33'), '1.3.33')


@pytest.mark.parametrize('falha', ['instalacao_falhou', *sorted(d.FALHAS_TEMPORARIAS)])
def test_consulta_passiva_nao_apaga_falha_e_inicio_explicitado_a_substitui(tmp_path, falha):
    import ast
    import datetime
    import json
    from pathlib import Path
    tree = ast.parse(Path('agent_worker.py').read_text(encoding='utf-8'))
    fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == '_registrar_update')
    arquivo = tmp_path/'ultimo_update.json'
    anterior = dict(etapa=falha,versao_alvo='1.3.33',erro='falha sintetica', quando='2026-10-24T10:00:00Z')
    arquivo.write_text(json.dumps(anterior))
    scope = dict(datetime=datetime, _ARQUIVO_UPDATE=str(arquivo),
                 ultimo_update=lambda: json.loads(arquivo.read_text()))
    exec(compile(ast.Module(body=[fn],type_ignores=[]),'registro','exec'),scope)
    for etapa in ('adiado_producao','manifesto_indisponivel','sem_atualizacao','aguardando_liberacao'):
        scope['_registrar_update'](etapa)
        assert json.loads(arquivo.read_text()) == anterior
    scope['_registrar_update']('download_falhou', versao_alvo='1.3.34')
    assert json.loads(arquivo.read_text())['versao_alvo'] == '1.3.34'
    assert d.exige_intervencao(json.loads(arquivo.read_text()), '1.3.34')
    scope['_registrar_update']('instalando',versao_alvo='1.3.34')
    assert json.loads(arquivo.read_text())['etapa'] == 'instalando'


@pytest.mark.parametrize('tamanho', [6, None])
def test_cache_conferido_nao_abre_rede(tmp_path, disco, tamanho):
    (tmp_path/'setup.msi').write_bytes(b'pacote')
    executar(tmp_path, tamanho=tamanho, abrir=lambda *a, **k: pytest.fail('download repetido'))


def test_cache_corrompido_mesmo_tamanho_baixa_novamente(tmp_path, disco):
    (tmp_path/'setup.msi').write_bytes(b'errado')
    executar(tmp_path)
    assert (tmp_path/'setup.msi').read_bytes() == b'pacote'


@pytest.mark.parametrize('etapa', sorted(d.FALHAS_TEMPORARIAS))
def test_espera_persistente_de_seis_horas(etapa):
    from datetime import datetime, timezone, timedelta
    agora = datetime(2026, 10, 24, 12, tzinfo=timezone.utc)
    registro = dict(etapa=etapa, versao_alvo='1.3.36', quando=agora.isoformat())
    assert d.exige_intervencao(registro, '1.3.36', agora=agora+timedelta(hours=5, minutes=59))
    assert not d.exige_intervencao(registro, '1.3.36', agora=agora+timedelta(hours=6))
    assert not d.exige_intervencao(registro, '1.3.37', agora=agora)
    assert not d.exige_intervencao(registro, '1.3.36', forcado=True, agora=agora)
