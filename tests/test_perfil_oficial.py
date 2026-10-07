import json
import socket
import subprocess
import sys
import os
from pathlib import Path
import pytest
import perfil_oficial as p


def test_oficial_preserva_identidade_recebe_porta_piloto_e_versao_release(tmp_path):
    env={**os.environ,'NEWPROD_CANAL':'oficial','LOCALAPPDATA':str(tmp_path)}
    script=('import canais_newprod as c,agent_version as v,migracao_estacao as m,json;'
            'print(json.dumps([c.PILOTO,c.OFICIAL,c.PORTA,c.NOME,c.pasta_local().name,'
            'm.pasta_dados().name,v.AGENT_VERSION]))')
    r=subprocess.run([sys.executable,'-c',script],env=env,capture_output=True,text=True,check=True)
    import re
    base=re.search(r'AGENT_VERSION = "([\d.]+)"',Path('agent_version.py').read_text()).group(1)
    assert json.loads(r.stdout)==[True,True,9001,'NewProd Piloto','NewProd Agent',
                                 'NewProd Dados Protegidos',base]


def test_migracao_preserva_identidade_e_reutiliza_catalogo(tmp_path):
    from piloto_instalacao import sha
    legado=tmp_path/'NewProd Agent';legado.mkdir()
    (legado/'agent_config.json').write_text('{"agent_id":"identidade-original"}')
    (legado/'formats_db.json').write_text('{"origem":"legado"}')
    piloto=tmp_path/'NewProd Piloto';runtime=piloto/'versoes'/'anterior';runtime.mkdir(parents=True)
    exe=runtime/'NewProdPiloto.exe';exe.write_bytes(b'sintetico')
    (runtime/'formats_db.json').write_text('{"origem":"piloto"}')
    (piloto/'versao-ativa.json').write_text(json.dumps({'executavel':str(exe.relative_to(piloto)),'sha256':sha(exe)}))
    (piloto/'dados').mkdir();(piloto/'dados'/'preservar.bin').write_bytes(b'catalogo')
    backups=[]
    perfil=p.preparar(tmp_path,conferir=lambda _:None,backup=lambda *a:backups.append(a))
    assert len(backups)==2
    assert perfil['dados']=='NewProd Piloto/dados'
    assert json.loads((legado/'formats_db.json').read_text())=={'origem':'piloto'}
    assert json.loads((legado/'agent_config.json').read_text())['agent_id']=='identidade-original'
    assert (piloto/'dados'/'preservar.bin').read_bytes()==b'catalogo'
    (legado/'formats_db.json').write_text('{"ajuste":"posterior"}')
    assert p.preparar(tmp_path,conferir=lambda _:None)==perfil
    assert json.loads((legado/'formats_db.json').read_text())=={'ajuste':'posterior'}


def test_instalacao_recusada_com_agente_ativo(tmp_path):
    def ocupado(_):raise ValueError('ocupado')
    with pytest.raises(ValueError,match='ocupado'):
        p.preparar(tmp_path,conferir=ocupado)
    assert not (tmp_path/'NewProd Agent').exists()


def test_backup_falhou_nao_ativa_perfil(tmp_path):
    legado=tmp_path/'NewProd Agent';legado.mkdir()
    def falhar(*_):raise OSError('backup indisponivel')
    with pytest.raises(OSError):p.preparar(tmp_path,conferir=lambda _:None,backup=falhar)
    assert not (legado/'perfil-oficial.json').exists()


def test_partida_configura_ambiente_sem_resetar_pausa(tmp_path,monkeypatch):
    raiz=tmp_path/'NewProd Agent';raiz.mkdir()
    perfil=dict(schema=1,estacao=socket.gethostname(),dados='NewProd Agent/dados')
    (raiz/'perfil-oficial.json').write_text(json.dumps(perfil))
    monkeypatch.setattr('piloto_instalacao.token_local',lambda _: 'token-sintetico-'+'x'*40)
    from unittest.mock import patch
    with patch.dict(os.environ, {'NEWPROD_PILOTO_PAUSADO':'1'}):
        p.configurar(tmp_path)
        assert os.environ['NEWPROD_PILOTO_RAIZ']==str(tmp_path/'NewProd Agent'/'dados')
        assert 'NEWPROD_PILOTO_PAUSADO' not in os.environ


def test_perfil_nao_aceita_dados_fora_da_estacao(tmp_path):
    raiz=tmp_path/'NewProd Agent';raiz.mkdir()
    (raiz/'perfil-oficial.json').write_text(json.dumps(dict(schema=1,estacao=socket.gethostname(),dados='../alheio')))
    with pytest.raises(ValueError,match='Raiz'):p.configurar(tmp_path)
