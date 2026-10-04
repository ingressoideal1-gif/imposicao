"""Upgrade deve preservar os codigos antes da remocao do componente antigo."""
import json
from pathlib import Path
import pytest
import migracao_estacao as migracao
from segredos_estacao import proteger_texto, recuperar_texto


@pytest.fixture
def paths(tmp_path, monkeypatch):
    monkeypatch.setenv('LOCALAPPDATA', str(tmp_path))
    installation = tmp_path / 'NewProd Agent'
    installation.mkdir()
    return installation, migracao.pasta_dados()


def test_upgrade_preserva_pool_e_credencial_sem_apagar_origem(paths):
    installation, destination = paths
    pool = installation / 'qr_ideal_pool.bin'
    with pool.open('wb') as f:
        f.truncate(24_000_000)  # Dados sinteticos; nunca usa o pool real.
    envelope = proteger_texto('sintetico', 'publicacao-faixas')
    (installation / 'credencial-publicacao.json').write_text(json.dumps(envelope))
    assert migracao.preparar_upgrade(installation) == {'pool_preservado':True, 'credencial_protegida':True}
    assert pool.exists() and migracao.hash_arquivo(pool) == migracao.hash_arquivo(destination / pool.name)
    assert recuperar_texto(json.loads((destination / 'credencial-publicacao.json').read_text()), 'publicacao-faixas') == 'sintetico'
    assert migracao.preparar_upgrade(installation)['pool_preservado']


def test_copia_divergente_interrompe_sem_substituir(paths):
    installation, destination = paths
    with (installation / 'qr_ideal_pool.bin').open('wb') as f:
        f.truncate(24_000_000)
    destination.mkdir()
    (destination / 'qr_ideal_pool.bin').write_bytes(b'preservar')
    with pytest.raises(ValueError, match='diverge'):
        migracao.preparar_upgrade(installation)
    assert (destination / 'qr_ideal_pool.bin').read_bytes() == b'preservar'
    assert (installation / 'qr_ideal_pool.bin').exists()


def test_pool_truncado_interrompe_antes_de_instalar(paths):
    installation, destination = paths
    (installation / 'qr_ideal_pool.bin').write_bytes(b'incompleto')
    assert migracao.executar_upgrade(installation) == 1
    assert not (destination / 'qr_ideal_pool.bin').exists()


def test_instalacao_nova_nao_inventa_codigos_ou_credenciais(paths):
    installation, destination = paths
    assert migracao.preparar_upgrade(installation) == {'pool_preservado':False, 'credencial_protegida':False}


def test_destino_instalado_precisa_pertencer_a_conta(paths, tmp_path):
    with pytest.raises(ValueError, match='fora da pasta'):
        migracao.preparar_upgrade(tmp_path / 'outro')
