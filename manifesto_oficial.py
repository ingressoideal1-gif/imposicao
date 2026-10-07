"""Contrato fixo do release oficial, com liberacao progressiva por estacao."""
import json
import re
import socket
import time
import urllib.request

BASE = 'https://vwbtitjlpelrcnsytzqw.supabase.co/storage/v1/object/public/agent-releases/'
URL = BASE + 'newprod-piloto-oficial.json'


def validar(dados, estacao=None):
    if not isinstance(dados, dict) or dados.get('schema') != 1 or dados.get('produto') != 'NewProdPilotoOficial':
        raise ValueError('Manifesto nao pertence ao produto oficial.')
    versao = dados.get('version')
    if not isinstance(versao, str) or not re.fullmatch(r'\d{1,3}\.\d{1,3}\.\d{1,5}', versao):
        raise ValueError('Versao oficial invalida.')
    a,b,c = map(int,versao.split('.'))
    if a>255 or b>255 or c>65535:
        raise ValueError('Versao fora dos limites MSI.')
    if dados.get('url') != BASE + 'NewProdPiloto_Oficial_v' + versao + '.msi':
        raise ValueError('Instalador fora do destino oficial.')
    if not isinstance(dados.get('sha256'),str) or not re.fullmatch('[0-9a-f]{64}',dados['sha256']):
        raise ValueError('Hash oficial invalido.')
    if type(dados.get('bytes')) is not int or not 0 < dados['bytes'] <= 512*1024**2:
        raise ValueError('Tamanho oficial invalido.')
    alvos = dados.get('estacoes')
    if alvos is not None and (not isinstance(alvos,list) or not 1<=len(alvos)<=1000 or
            any(not isinstance(n,str) or not re.fullmatch('[A-Za-z0-9][A-Za-z0-9_.-]{0,79}',n) for n in alvos)):
        raise ValueError('Liberacao por estacao invalida.')
    liberado = alvos is None or (estacao or socket.gethostname()).casefold() in {x.casefold() for x in alvos}
    return {**dados, 'liberado':liberado}


def consultar():
    from pacotes_download import SemRedirecionamento
    abrir=urllib.request.build_opener(SemRedirecionamento()).open
    req=urllib.request.Request(URL+'?t='+str(int(time.time())),headers={'Cache-Control':'no-cache'})
    with abrir(req,timeout=20) as r:
        raw=r.read(16385)
    if len(raw)>16384:raise ValueError('Manifesto excede limite.')
    return validar(json.loads(raw))
