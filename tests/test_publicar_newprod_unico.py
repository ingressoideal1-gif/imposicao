import io
import json
import pytest
from ferramentas import publicar_newprod_unico as p


def preparar(tmp_path, monkeypatch):
    msi = tmp_path / 'NewProdPiloto_Oficial_v1.3.10.msi'
    msi.write_bytes(b'sintetico')
    monkeypatch.setenv('SUPABASE_SERVICE_KEY', 'sintetica')
    estado = {'uploads': [], 'writes': [], 'objetos': {}}
    def request(url, **kw):
        nome = url.split('/')[-1].split('?')[0]
        if 'dados' in kw:
            assert len(estado['uploads']) == 2
            estado['writes'].append(nome)
            estado['objetos'][nome] = json.loads(kw['dados'])
        return io.BytesIO(json.dumps(estado['objetos'].get(nome,
            {'version': '1.3.9', 'estacoes': ['ANTIGA']})).encode())
    monkeypatch.setattr(p, 'requisicao', request)
    monkeypatch.setattr(p, 'conferir_upload', lambda path, manifest, data, key:
        estado['uploads'].append((manifest['url'], data)))
    return msi, estado


def test_tres_manifestos_sem_restricao_apos_dois_downloads(tmp_path, monkeypatch):
    msi, estado = preparar(tmp_path, monkeypatch)
    result = p.publicar(msi)
    assert len(result) == len(estado['writes']) == 3
    assert all('estacoes' not in m and m['version'] == '1.3.10' for m in result.values())
    assert estado['uploads'][0][1] == estado['uploads'][1][1] == b'sintetico'
    assert len({m['sha256'] for m in result.values()}) == 1


def test_download_divergente_nao_ativa_nenhum_manifesto(tmp_path, monkeypatch):
    msi, estado = preparar(tmp_path, monkeypatch)
    def falhar(*args):
        raise ValueError('Download publico divergente')
    monkeypatch.setattr(p, 'conferir_upload', falhar)
    with pytest.raises(ValueError, match='divergente'):
        p.publicar(msi)
    assert estado['writes'] == []


def test_recusa_downgrade(tmp_path, monkeypatch):
    msi, estado = preparar(tmp_path, monkeypatch)
    estado['objetos']['latest.json'] = {'version': '1.3.11'}
    with pytest.raises(ValueError, match='recente'):
        p.publicar(msi)
    assert estado['writes'] == estado['uploads'] == []
