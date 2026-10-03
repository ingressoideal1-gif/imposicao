import sys
from pathlib import Path
import pytest
import requests

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'ferramentas'))
import storage_somente_leitura as download


@pytest.fixture
def servidor(monkeypatch):
    calls=[];sessions=[];responses=[]
    class Response:
        status_code=200
        def __enter__(self):return self
        def __exit__(self,*args):pass
        def raise_for_status(self):pass
        def iter_content(self,size):yield b'test'
    class Session:
        def __init__(self):self.headers={};self.trust_env=True;sessions.append(self)
        def get(self,url,**options):
            calls.append((url,options,dict(self.headers),self.trust_env))
            if responses:
                response=responses.pop(0)
                if isinstance(response,Exception):raise response
                return response
            return Response()
        def close(self):pass
    monkeypatch.setattr(download,'chave_administrativa',lambda *args:'credencial-sintetica')
    monkeypatch.setattr(download.requests,'Session',Session)
    monkeypatch.setattr(download.time,'sleep',lambda n:None)
    return calls,sessions,responses,Response


def test_download_get_isola_credencial_e_escapa_nome(tmp_path,servidor):
    calls,sessions,_,_=servidor
    download.baixar_objetos('cli','projeto-sintetico','teste',[{'name':'pasta/com espaco.pdf','bytes':4}],tmp_path)
    assert (tmp_path/'pasta/com espaco.pdf').read_bytes()==b'test'
    url,options,headers,trust=calls[0]
    assert url.endswith('/teste/pasta/com%20espaco.pdf')
    assert options['allow_redirects'] is False and options['stream'] is True
    assert headers['Accept-Encoding']=='identity' and trust is False
    assert all(not s.headers for s in sessions)
    assert not list(tmp_path.rglob('.transferindo-*'))


def test_download_repete_timeout_sem_sobrescrever(tmp_path,servidor):
    calls,_,responses,_=servidor
    responses.append(requests.Timeout())
    download.baixar_objetos('cli','projeto-sintetico','teste',[{'name':'arquivo','bytes':4}],tmp_path)
    assert len(calls)==2
    with pytest.raises(ValueError,match='sobrescreve'):
        download.baixar_objetos('cli','projeto-sintetico','teste',[{'name':'arquivo','bytes':4}],tmp_path)
    assert (tmp_path/'arquivo').read_bytes()==b'test'


@pytest.mark.parametrize('status',[302,403,404])
def test_download_nao_segue_redirect_nem_esconde_objeto_ausente(tmp_path,servidor,status):
    calls,_,responses,Response=servidor
    resposta=Response();resposta.status_code=status;responses.append(resposta)
    with pytest.raises(RuntimeError,match=f'HTTP {status}'):
        download.baixar_objetos('cli','projeto-sintetico','teste',[{'name':'arquivo','bytes':4}],tmp_path)
    assert len(calls)==1 and not list(tmp_path.iterdir())
