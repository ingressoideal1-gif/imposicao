import importlib.util
import json
from pathlib import Path
import sys
import zipfile
import pytest
from cryptography.exceptions import InvalidTag

RAIZ=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(RAIZ/'ferramentas'))
import backup_storage as storage
import backup_portatil as backup
import restaurar_storage as recovery


def test_storage_copia_confere_cifra_e_nao_upload(tmp_path,monkeypatch):
    objeto={'bucket_id':'bucket-sintetico','name':'pasta/arquivo.pdf','bytes':4,'updated_at':'2026-10-03T00:00:00Z'}
    calls=[]
    def cli(*args, **kwargs):
        calls.append(args)
        if args[1]=='db': return {'rows':[{'objects':[objeto]}]}
        assert args[1:3]==('storage','cp')
        assert args[-2]=='ss:///bucket-sintetico/'
        assert args[-1]=='.'
        out=Path(kwargs['cwd']);(out/'pasta').mkdir();(out/objeto['name']).write_bytes(b'test')
        return {}
    monkeypatch.setattr(storage,'cli',cli)
    chave=tmp_path/'chave';chave.write_bytes(bytes(range(32)))
    dest=tmp_path/'backup'
    assert storage.copiar('cli-sintetica',dest,chave)['objects']==1
    opened=tmp_path/'conferido.zip'
    backup.decifrar(dest/'bucket-sintetico.iib',opened,chave.read_bytes())
    with zipfile.ZipFile(opened) as z:
        assert z.read('objetos/pasta/arquivo.pdf')==b'test'
        assert len(json.loads(z.read('inventario.json')))==1
    restore=tmp_path/'restauracao'
    assert recovery.restaurar(dest/'bucket-sintetico.iib',restore,chave)['objects']==1
    assert (restore/'objetos/pasta/arquivo.pdf').read_bytes()==b'test'
    with pytest.raises(FileExistsError):
        recovery.restaurar(dest/'bucket-sintetico.iib',restore,chave)
    assert len(calls)==2


@pytest.mark.parametrize('falha',['caminho','hash','duplicado','tamper'])
def test_restauracao_storage_recusa_pacote_invalido_sem_prova_de_sucesso(tmp_path,falha):
    name='../fora' if falha=='caminho' else 'arquivo.pdf'
    objeto={'bucket_id':'teste','name':name,'bytes':4,'sha256':'0'*64}
    archive=tmp_path/'sintetico.zip'
    with zipfile.ZipFile(archive,'x') as z:
        z.writestr('inventario.json',json.dumps([objeto]))
        z.writestr('objetos/'+name,b'test')
        if falha=='duplicado':
            with pytest.warns(UserWarning,match='Duplicate name'):
                z.writestr('objetos/'+name,b'test')
    chave=tmp_path/'chave';chave.write_bytes(bytes(range(32)))
    pacote=tmp_path/'sintetico.iib'
    backup.cifrar(archive,pacote,chave.read_bytes())
    if falha=='tamper':
        data=bytearray(pacote.read_bytes());data[-1]^=1;pacote.write_bytes(data)
    dest=tmp_path/'restauracao'
    with pytest.raises(InvalidTag if falha=='tamper' else ValueError):
        recovery.restaurar(pacote,dest,chave)
    assert not (dest/'evidencia-restauracao.json').exists()
    assert not (dest/'.bucket-validado.zip').exists()
    assert not (tmp_path/'fora').exists()


@pytest.mark.parametrize('names',[['../fora'],['/absoluto'],['C:\\fora'],['iguais.pdf','IGUAIS.pdf'],
                                [''],['pasta/./arquivo'],['pasta//arquivo'],['NUL.txt'],['arquivo.'],['pasta/a:b']])
def test_storage_rejeita_caminhos_e_colisoes(names):
    objects=[{'bucket_id':'teste','name':n} for n in names]
    with pytest.raises(ValueError):storage.validar_objetos('teste',objects)


def test_storage_retoma_bucket_conferido_e_nao_arquiva_cache_cli(tmp_path,monkeypatch):
    origem=tmp_path/'pre-copiado';(origem/'agent-releases').mkdir(parents=True)
    (origem/'agent-releases'/'arquivo.exe').write_bytes(b'test')
    (origem/'supabase'/'.temp').mkdir(parents=True)
    (origem/'supabase'/'.temp'/'project-ref').write_text('metadado sintetico')
    objeto={'bucket_id':'agent-releases','name':'arquivo.exe','bytes':4}
    def cli(*args,**kwargs):
        assert args[1:3]==('db','query')
        return {'rows':[{'objects':[objeto]}]}
    monkeypatch.setattr(storage,'cli',cli)
    chave=tmp_path/'chave';chave.write_bytes(bytes(range(32)))
    destino=tmp_path/'backup'
    assert storage.copiar('sintetica',destino,chave,origem)['objects']==1
    aberto=tmp_path/'aberto.zip'
    backup.decifrar(destino/'agent-releases.iib',aberto,chave.read_bytes())
    with zipfile.ZipFile(aberto) as z:
        assert z.namelist()==['inventario.json','objetos/arquivo.exe']
