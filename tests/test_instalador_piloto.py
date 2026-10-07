import json
from pathlib import Path
import pytest
import piloto_instalacao as m


@pytest.fixture
def ambiente(tmp_path):
    base=tmp_path/'conta';base.mkdir()
    original=base/'NewProd Agent';original.mkdir()
    (original/'NewProd.exe').write_bytes(b'original intocado')
    (original/'formats_db.json').write_text('{"formato":"sintetico"}')
    (original/'agent_config.json').write_text('{"agent_id":"nao-copiar"}')
    privado=base/'NewProd Dados Protegidos';privado.mkdir()
    (privado/'credencial-publicacao.json').write_text('{"sintetico":true}')
    pacote=tmp_path/'pacote';pacote.mkdir()
    (pacote/'NewProdPiloto.exe').write_bytes(b'piloto sintetico')
    p=dict(canal='piloto',porta=9001,executavel='NewProdPiloto.exe',sha256=m.sha(pacote/'NewProdPiloto.exe'),
           versao='1.2.363-piloto-local.29',commit='sintetico',painel='v1034')
    (pacote/'pacote-piloto.json').write_text(json.dumps(p))
    return base,pacote


def preparar(base,pacote,**kw):
    return m.preparar(base,pacote,estacao='ESTACAO-TESTE',proteger=lambda p:None,
                     cifrar=lambda x,f:{'sintetico':x},decifrar=lambda x,f:x['sintetico'],
                     credencial=lambda p:None,**kw)


def test_instala_sem_mudar_original_ou_duplicar_identidade(ambiente):
    base,pacote=ambiente
    antes={str(p.relative_to(base)):p.read_bytes() for p in base.rglob('*') if p.is_file()}
    ativo=preparar(base,pacote)
    for nome,dados in antes.items():assert (base/nome).read_bytes()==dados
    raiz=base/'NewProd Piloto'
    assert not (raiz/'agent_config.json').exists()
    assert (raiz/ativo['executavel']).read_bytes()==b'piloto sintetico'
    assert ativo['estacao']=='ESTACAO-TESTE'
    backups=list((raiz/'instalacao').glob('*.json'));assert len(backups)==1
    salvo=json.loads(json.loads(backups[0].read_text())['sintetico'])
    assert set(salvo)=={'config/formats_db.json','privado/credencial-publicacao.json'}
    # Repetir o MSI nao sobrescreve ajustes posteriores da estacao.
    config=(raiz/ativo['executavel']).parent/'formats_db.json';config.write_text('ajuste posterior')
    assert preparar(base,pacote)==ativo
    assert config.read_text()=='ajuste posterior'
    assert len(list((raiz/'instalacao').glob('*.json')))==1


def test_preserva_instalacao_manual_existente(ambiente):
    base,pacote=ambiente;raiz=base/'NewProd Piloto';raiz.mkdir()
    (raiz/'versao-ativa.json').write_text('{"versao":"mais-nova"}')
    with pytest.raises(ValueError,match='outro Piloto'):preparar(base,pacote)
    assert (raiz/'versao-ativa.json').read_text()=='{"versao":"mais-nova"}'


@pytest.mark.parametrize('falha',['hash','conta','credencial','colisao','traversal'])
def test_falhas_nao_ativam_runtime(ambiente,falha):
    base,pacote=ambiente
    if falha=='hash':(pacote/'NewProdPiloto.exe').write_bytes(b'alterado')
    if falha=='conta':(base/'NewProd Agent'/'formats_db.json').unlink()
    if falha=='credencial':(base/'NewProd Dados Protegidos'/'credencial-publicacao.json').unlink()
    if falha=='colisao':
        pasta=base/'NewProd Piloto Dados Protegidos';pasta.mkdir()
        (pasta/'credencial-publicacao.json').write_text('divergente')
    if falha=='traversal':
        p=json.loads((pacote/'pacote-piloto.json').read_text());p['executavel']='../NewProdPiloto.exe'
        (pacote/'pacote-piloto.json').write_text(json.dumps(p))
    with pytest.raises(ValueError):preparar(base,pacote)
    assert not (base/'NewProd Piloto'/'versao-ativa.json').exists()


def test_token_dpapi_compativel_e_persistente(tmp_path):
    if m.os.name!='nt':pytest.skip('DPAPI Windows')
    primeiro=m.token_local(tmp_path)
    assert len(primeiro)>=32
    assert m.token_local(tmp_path)==primeiro
    assert primeiro not in (tmp_path/'token-local.dpapi').read_text()


def test_vinculo_por_junction_recusado(tmp_path,monkeypatch):
    if m.os.name!='nt':pytest.skip('junction Windows')
    import subprocess
    alvo=tmp_path/'real';alvo.mkdir();link=tmp_path/'atalho'
    monkeypatch.setenv('PILOTO_TEST_LINK',str(link));monkeypatch.setenv('PILOTO_TEST_ALVO',str(alvo))
    subprocess.run(['powershell','-NoProfile','-Command',
                    'New-Item -ItemType Junction -Path $env:PILOTO_TEST_LINK -Target $env:PILOTO_TEST_ALVO | Out-Null'],
                   check=True,capture_output=True)
    with pytest.raises(ValueError,match='redirecionado'):m.sem_links(link/'arquivo')


def test_backup_dpapi_restaura_configuracao_sintetica(ambiente):
    if m.os.name!='nt':pytest.skip('DPAPI Windows')
    import base64
    base,pacote=ambiente
    m.preparar(base,pacote,estacao='TESTE',proteger=lambda p:None,credencial=lambda p:None)
    backup=next((base/'NewProd Piloto'/'instalacao').glob('*.dpapi.json'))
    snapshot=json.loads(m.recuperar_texto(json.loads(backup.read_text()),'instalacao-piloto'))
    recuperado=base/'ensaio-formats.json'
    recuperado.write_bytes(base64.b64decode(snapshot['config/formats_db.json']))
    assert recuperado.read_bytes()==(base/'NewProd Agent'/'formats_db.json').read_bytes()
