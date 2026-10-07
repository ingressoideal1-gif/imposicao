"""Backup local cifrado de configuracao/historico, verificacao e retencao propria."""
from datetime import datetime, timezone
import base64
import hashlib
import json
from pathlib import Path
import secrets
import shutil
import sqlite3
import tempfile
import threading
import zipfile

_mutex = threading.Lock()

def executar(raiz, instalacao, *, proteger=None, recuperar=None):
    # A agenda e o botao manual compartilham chave/destino nesta instancia.
    with _mutex:
        return _executar(raiz, instalacao, proteger=proteger, recuperar=recuperar)


def _executar(raiz, instalacao, *, proteger=None, recuperar=None):
    from segredos_estacao import proteger_texto, recuperar_texto
    from persistencia_local import gravar_json_atomico
    from pacotes_locais import _sem_links
    from ferramentas.backup_portatil import cifrar, decifrar, sha256
    proteger = proteger or proteger_texto
    recuperar = recuperar or recuperar_texto
    raiz, instalacao = Path(raiz).resolve(), Path(instalacao).resolve()
    area = raiz / 'gestao' / 'backups'
    area.mkdir(parents=True, exist_ok=True)
    _sem_links(area)
    chave_path=raiz/'gestao'/'backup-chave.dpapi'
    _sem_links(chave_path)
    if not chave_path.exists():
        gravar_json_atomico(chave_path, proteger(base64.b64encode(secrets.token_bytes(32)).decode(),'backup-gestao'))
    chave=base64.b64decode(recuperar(json.loads(chave_path.read_text(encoding='utf-8')), 'backup-gestao'),validate=True)
    if len(chave)!=32: raise ValueError('Chave invalida')
    fontes={}
    for origem, prefixo in ((raiz,'canal'),(instalacao,'instalacao')):
        for nome in ('formats_db.json','acessos_locais.json','agent_config.json','versao-ativa.json','iniciar-piloto.ps1','token-local.dpapi'):
            p=origem/nome
            if p.is_file(): fontes[prefixo+'/'+nome]=p
    # Bases SQLite recebem snapshot consistente pela API backup, nunca copia WAL parcial.
    bases=[]
    for sub in ('dados','gestao'):
        pasta=raiz/sub
        if pasta.is_dir():
            for p in pasta.rglob('*.sqlite3'):
                if 'backups' not in p.parts: bases.append(p)
    total=sum(p.stat().st_size for p in fontes.values())+sum(p.stat().st_size for p in bases)
    if shutil.disk_usage(area).free < 3*total+2*1024**3: raise ValueError('Espaco insuficiente para backup verificado')
    nome='runtime-'+datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')+'-'+secrets.token_hex(4)+'.iib'
    destino=area/nome
    with tempfile.TemporaryDirectory(prefix='backup-',dir=area) as tmp:
        tmp=Path(tmp)
        inventario={}
        with zipfile.ZipFile(tmp/'runtime.zip','x',compression=zipfile.ZIP_DEFLATED) as z:
            for nome_arquivo,p in fontes.items():
                _sem_links(p)
                dados=p.read_bytes()
                z.writestr(nome_arquivo,dados)
                inventario[nome_arquivo]=hashlib.sha256(dados).hexdigest()
            for i,p in enumerate(bases):
                _sem_links(p)
                copia=tmp/f'{i}.sqlite3'
                with sqlite3.connect(p.as_uri()+'?mode=ro',uri=True) as origem_db, sqlite3.connect(copia) as alvo:
                    origem_db.backup(alvo)
                    if alvo.execute('PRAGMA integrity_check').fetchone()[0]!='ok': raise ValueError('Base local inconsistente')
                n='bases/'+str(p.relative_to(raiz)).replace('\\','/')
                z.write(copia,n);inventario[n]=sha256(copia)
            z.writestr('inventario.json',json.dumps(inventario))
        cifrar(tmp/'runtime.zip',destino,chave)
        decifrar(destino,tmp/'ensaio.zip',chave)
        with zipfile.ZipFile(tmp/'ensaio.zip') as z:
            if z.testzip() is not None: raise ValueError('Backup incompleto')
            for n,digest in inventario.items():
                if hashlib.sha256(z.read(n)).hexdigest()!=digest: raise ValueError('Restauracao divergente')
    return dict(quando=datetime.now(timezone.utc).isoformat(),verificado=True,arquivos=len(inventario),
                bytes=destino.stat().st_size,sha256=sha256(destino),arquivo=destino.name,
                copia_externa_confirmada=False,escopo='Configuracoes e SQLite; nao inclui PDFs, pools QR, executavel ou banco da nuvem.',
                recuperacao='Exige backup-chave.dpapi e a mesma conta Windows. Backup portatil completo e separado.')
