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
            assert len(estado['uploads']) == 1
            estado['writes'].append(nome)
            estado['objetos'][nome] = json.loads(kw['dados'])
        return io.BytesIO(json.dumps(estado['objetos'].get(nome,
            {'version': '1.3.9', 'estacoes': ['ANTIGA']})).encode())
    monkeypatch.setattr(p, 'requisicao', request)
    monkeypatch.setattr(p, 'conferir_upload', lambda path, manifest, data, key:
        estado['uploads'].append((manifest['url'], data)))
    return msi, estado


def test_producao_nao_altera_teste(tmp_path, monkeypatch):
    msi, estado = preparar(tmp_path, monkeypatch)
    result = p.publicar(msi, canal='producao')
    assert set(result) == set(estado['writes']) == {'latest.json', 'newprod-piloto-oficial.json'}
    assert len(estado['uploads']) == 1
    assert all('estacoes' not in m for m in result.values())


def test_teste_nao_altera_producao(tmp_path, monkeypatch):
    msi, estado = preparar(tmp_path, monkeypatch)
    teste = msi.with_name('NewProdPiloto_Teste_v1.3.10.msi')
    teste.write_bytes(b'teste sintetico')
    result = p.publicar(teste, canal='teste')
    assert list(result) == estado['writes'] == ['newprod-piloto-teste.json']
    assert len(estado['uploads']) == 1
    assert result['newprod-piloto-teste.json']['produto'] == 'NewProdPilotoTeste'
    assert estado['uploads'][0][1] == b'teste sintetico'


def test_nome_incompativel_recusado_antes_da_rede(tmp_path, monkeypatch):
    msi, estado = preparar(tmp_path, monkeypatch)
    with pytest.raises(ValueError, match='canal'):
        p.publicar(msi, canal='teste')
    assert estado['writes'] == estado['uploads'] == []


def test_download_divergente_nao_ativa_nenhum_manifesto(tmp_path, monkeypatch):
    msi, estado = preparar(tmp_path, monkeypatch)
    def falhar(*args):
        raise ValueError('Download publico divergente')
    monkeypatch.setattr(p, 'conferir_upload', falhar)
    with pytest.raises(ValueError, match='divergente'):
        p.publicar(msi, canal="producao")
    assert estado['writes'] == []


def test_recusa_downgrade(tmp_path, monkeypatch):
    msi, estado = preparar(tmp_path, monkeypatch)
    estado['objetos']['latest.json'] = {'version': '1.3.11'}
    with pytest.raises(ValueError, match='recente'):
        p.publicar(msi, canal="producao")
    assert estado['writes'] == estado['uploads'] == []
