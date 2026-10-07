import hashlib
import io
import json
import pytest
from ferramentas import publicar_pacote_oficial as p


def test_promocao_exige_prova_do_mesmo_msi(tmp_path,monkeypatch):
    msi=tmp_path/'NewProdPiloto_Oficial_v1.2.368.msi';msi.write_bytes(b'novo')
    (tmp_path/(msi.stem+'-publicacao.json')).write_text(json.dumps({'download_conferido':True,'sha256':'0'*64}))
    monkeypatch.setenv('SUPABASE_SERVICE_KEY','sintetica')
    monkeypatch.setattr(p,'requisicao',lambda *_a,**_k:pytest.fail('Nao pode acessar rede sem prova do pacote'))
    with pytest.raises(ValueError,match='conferido'):
        p.publicar(msi,['ESTACAO-TESTE'],True,True,True)


def test_promocao_nao_reenvia_msi_e_verifica_os_dois_manifestos(tmp_path,monkeypatch):
    msi=tmp_path/'NewProdPiloto_Oficial_v1.2.368.msi';msi.write_bytes(b'sintetico')
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
    r=p.publicar(msi,['ESTACAO-TESTE'],True,True,True)
    assert envios==['newprod-piloto-oficial.json','latest.json']
    assert r['ativado'] and r['bootstrap_legado']
    assert msi.read_bytes()==b'sintetico'
