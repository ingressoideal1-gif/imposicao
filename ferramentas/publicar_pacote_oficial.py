"""Publica pacote imutavel e so ativa manifesto depois de conferir download."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
import urllib.request
import urllib.error

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from manifesto_oficial import BASE, validar


def requisicao(url, *, dados=None, chave=None, substituir=False):
    headers = {'Cache-Control': 'no-cache'}
    if chave:
        headers.update(Authorization='Bearer '+chave, apikey=chave)
    if dados is not None:
        headers.update({'Content-Type':'application/json' if url.endswith('.json') else 'application/octet-stream',
                        'x-upsert':'true' if substituir else 'false'})
    return urllib.request.urlopen(urllib.request.Request(url, data=dados, headers=headers), timeout=600)


def publicar(msi, estacoes=None, ativar=False, bootstrap=False):
    msi=Path(msi).resolve(strict=True)
    m=re.fullmatch(r'NewProdPiloto_Oficial_v(\d+\.\d+\.\d+)\.msi',msi.name)
    if not m:raise ValueError('Nome MSI oficial invalido')
    dados=msi.read_bytes();digest=hashlib.sha256(dados).hexdigest()
    manifest=dict(schema=1,produto='NewProdPilotoOficial',version=m[1],url=BASE+msi.name,
                  sha256=digest,bytes=len(dados),size=len(dados),notes='NewProd Piloto oficial; atualizacao por estacao.')
    if not estacoes:
        # Uma publicacao rotineira conserva a liberacao existente; nao habilita
        # automaticamente cadastros antigos, testes ou estacoes desconhecidas.
        with requisicao(BASE+'newprod-piloto-oficial.json?t='+str(time.time_ns())) as r:
            anterior=validar(json.load(r))
        estacoes=anterior.get('estacoes')
        if not estacoes:raise ValueError('Informe as estacoes autorizadas para a primeira liberacao')
    manifest['estacoes']=estacoes
    validar(manifest)
    chave=os.environ['SUPABASE_SERVICE_KEY']
    upload=manifest['url'].replace('/object/public/','/object/')
    print('Enviando pacote imutavel: '+msi.name,flush=True)
    try:
        with requisicao(upload,dados=dados,chave=chave) as r:r.read()
    except urllib.error.HTTPError as e:
        if e.code not in (400,409):raise RuntimeError('Upload HTTP '+str(e.code)) from None
        # Somente bytes identicos permitem retomar uma publicacao interrompida.
        print('Objeto pode existir; conferindo download sem sobrescrever.',flush=True)
    print('Conferindo download publico completo...',flush=True)
    with requisicao(manifest['url']) as r:
        h=hashlib.sha256();total=0
        while chunk:=r.read(1024*1024):h.update(chunk);total+=len(chunk)
    if h.hexdigest()!=digest or total!=len(dados):raise ValueError('Download publico divergente')
    resultado={**manifest,'download_conferido':True,'ativado':False,'bootstrap_legado':False}
    if ativar:
        for nome in ['newprod-piloto-oficial.json']+(['latest.json'] if bootstrap else []):
            url=BASE+nome
            try:
                with requisicao(url+'?t='+str(time.time_ns())) as r:anterior=r.read(65537)
                (msi.parent/(nome+'.antes-'+str(time.time_ns()))).write_bytes(anterior)
            except urllib.error.HTTPError as e:
                if e.code not in (400,404):raise
            with requisicao(url.replace('/object/public/','/object/'),dados=json.dumps(manifest).encode(),chave=chave,substituir=True) as r:r.read()
            with requisicao(url+'?t='+str(time.time_ns())) as r:confirmado=json.load(r)
            if confirmado!=manifest:raise ValueError('Manifesto publicado divergente')
        resultado.update(ativado=True,bootstrap_legado=bootstrap)
    (msi.parent/(msi.stem+'-publicacao.json')).write_text(json.dumps(resultado,indent=2),encoding='utf-8')
    print(json.dumps(resultado),flush=True)
    return resultado


if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--msi',required=True);p.add_argument('--estacao',action='append')
    p.add_argument('--ativar',action='store_true');p.add_argument('--bootstrap-legado',action='store_true')
    args=p.parse_args()
    if args.bootstrap_legado and not args.ativar:p.error('bootstrap exige --ativar')
    publicar(args.msi,args.estacao,args.ativar,args.bootstrap_legado)
