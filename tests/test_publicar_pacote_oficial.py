import hashlib
import io
import json
import pytest
from ferramentas import publicar_pacote_oficial as p


def test_promocao_exige_prova_do_mesmo_msi(tmp_path,monkeypatch):
    msi=tmp_path/(p.PREFIXO_MSI+'1.2.368.msi');msi.write_bytes(b'novo')
    (tmp_path/(msi.stem+'-publicacao.json')).write_text(json.dumps({'download_conferido':True,'sha256':'0'*64}))
    monkeypatch.setenv('SUPABASE_SERVICE_KEY','sintetica')
    monkeypatch.setattr(p,'requisicao',lambda *_a,**_k:pytest.fail('Nao pode acessar rede sem prova do pacote'))
    with pytest.raises(ValueError,match='conferido'):
        p.publicar(msi,['ESTACAO-TESTE'],True,p.PRODUTO == 'NewProdPilotoOficial',True)


def test_promocao_nao_reenvia_msi_e_verifica_os_dois_manifestos(tmp_path,monkeypatch):
    msi=tmp_path/(p.PREFIXO_MSI+'1.2.368.msi');msi.write_bytes(b'sintetico')
    anterior=dict(version='1.2.368',sha256=hashlib.sha256(b'sintetico').hexdigest(),bytes=9,url=p.BASE+msi.name,download_conferido=True)
    (tmp_path/(msi.stem+'-publicacao.json')).write_text(json.dumps(anterior))
    monkeypatch.setenv('SUPABASE_SERVICE_KEY','sintetica');objetos={};envios=[]
    def abrir(url,**kw):
        assert not url.endswith('.msi')
        nome=url.split('/')[-1].split('?')[0]
        if 'dados' in kw:
            assert kw['substituir'] is True
            objetos[nome]=kw['dados'];envios.append(nome)
        return io.BytesIO(objetos.get(nome,b'{}'))
    monkeypatch.setattr(p,'requisicao',abrir)
    retencoes=[]
    def reter(resultado):
        assert resultado['ativado'] and resultado['download_conferido']
        assert len(envios) == (2 if p.PRODUTO == 'NewProdPilotoOficial' else 1)
        retencoes.append(True)
        return {'completo':True}
    monkeypatch.setattr(p,'apos_publicacao',reter)
    r=p.publicar(msi,['ESTACAO-TESTE'],True,p.PRODUTO == 'NewProdPilotoOficial',True)
    assert envios==[p.NOME_MANIFESTO]+(['latest.json'] if p.PRODUTO == 'NewProdPilotoOficial' else [])
    assert r['ativado'] and r['bootstrap_legado'] == (p.PRODUTO == 'NewProdPilotoOficial')
    assert msi.read_bytes()==b'sintetico'
    assert retencoes == [True]


@pytest.mark.parametrize('falha', ['upload', 'manifesto', 'so_upload'])
def test_retencao_nao_roda_antes_de_publicacao_confirmada(tmp_path, monkeypatch, falha):
    msi=tmp_path/(p.PREFIXO_MSI+'1.2.368.msi');msi.write_bytes(b'sintetico')
    monkeypatch.setenv('SUPABASE_SERVICE_KEY','sintetica')
    monkeypatch.setattr(p,'apos_publicacao',lambda *a:pytest.fail('Retencao prematura'))
    def upload(*a):
        if falha == 'upload':raise ValueError('upload falhou')
    monkeypatch.setattr(p,'conferir_upload',upload)
    monkeypatch.setattr(p,'requisicao',lambda *a,**k:io.BytesIO(b'{}'))
    if falha == 'so_upload':
        assert not p.publicar(msi,['TESTE'],False)['ativado']
    else:
        with pytest.raises(ValueError):p.publicar(msi,['TESTE'],True)


def test_publicador_recusa_msi_de_outro_canal_antes_de_acessar_rede(tmp_path, monkeypatch):
    outro = 'NewProdPiloto_Oficial_v' if p.PRODUTO == 'NewProdPilotoTeste' else 'NewProdPiloto_Teste_v'
    msi = tmp_path / (outro + '1.2.400.msi')
    msi.write_bytes(b'sintetico')
    monkeypatch.setattr(p, 'requisicao', lambda *_a, **_k: pytest.fail('Acesso de rede indevido'))
    with pytest.raises(ValueError, match='Nome MSI'):
        p.publicar(msi, ['ESTACAO-TESTE'], True)


def test_canal_de_teste_nunca_escreve_latest(tmp_path, monkeypatch):
    monkeypatch.setattr(p, 'PRODUTO', 'NewProdPilotoTeste')
    monkeypatch.setattr(p, 'requisicao', lambda *_a, **_k: pytest.fail('Acesso de rede indevido'))
    with pytest.raises(ValueError, match='ponte legada'):
        p.publicar(tmp_path / 'nao-existe.msi', ['ESTACAO-TESTE'], True, True)
