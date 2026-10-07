"""Identidade e caminhos dos dois agentes; sem leitura de credenciais no import."""
import os
from pathlib import Path
import tempfile

OFICIAL = os.environ.get('NEWPROD_CANAL') == 'oficial'
PILOTO = OFICIAL or os.environ.get('NEWPROD_CANAL') == 'piloto'
CANAL = 'piloto' if PILOTO else 'producao'
PORTA = 9001 if PILOTO else 9000
NOME_PASTA = 'NewProd Piloto' if PILOTO and not OFICIAL else 'NewProd Agent'
NOME = 'NewProd Piloto' if PILOTO else 'NewProd Agent'
CHAVE_INICIO = 'NewProdPiloto' if PILOTO and not OFICIAL else 'NewProdAgent'

def pasta_local():
    return Path(os.environ.get('LOCALAPPDATA') or tempfile.gettempdir()) / NOME_PASTA

def url_painel():
    return f'http://127.0.0.1:{PORTA}/app/'
