"""Instala uma base QR12 recebida por canal privado; nunca baixa ou deriva codigos."""
import argparse
import hashlib
import os
from pathlib import Path
import sys
import tempfile

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from qr_ideal import POOL_V2_NOME,POOL_V2_SHA256,TOTAL,TAMANHO


def provisionar(origem, destino):
    origem=Path(origem);destino=Path(destino)
    def conferir(path):
        if path.is_symlink() or path.stat().st_size!=TOTAL*TAMANHO:
            raise ValueError('Base privada ausente, truncada ou caminho indireto')
        with path.open('rb') as f:
            if hashlib.file_digest(f,'sha256').hexdigest()!=POOL_V2_SHA256:
                raise ValueError('Base privada divergente da revisao contratada')
    conferir(origem)
    if destino.exists():
        conferir(destino)
        return
    from migracao_estacao import proteger_pasta
    destino.parent.mkdir(parents=True,exist_ok=True)
    proteger_pasta(destino.parent)
    temporario=None
    try:
        with tempfile.NamedTemporaryFile(dir=destino.parent,delete=False) as f:
            temporario=Path(f.name)
            with origem.open('rb') as source:
                while bloco:=source.read(1024*1024):f.write(bloco)
        conferir(temporario)
        os.link(temporario,destino)
        conferir(destino)
    finally:
        if temporario is not None:temporario.unlink(missing_ok=True)


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origem',required=True)
    parser.add_argument('--canal',choices=['producao','piloto'],required=True)
    args=parser.parse_args()
    os.environ['NEWPROD_CANAL']=args.canal
    from migracao_estacao import pasta_dados
    provisionar(args.origem,pasta_dados()/POOL_V2_NOME)
    print('QR12_PROVISIONADO='+args.canal+' SHA256='+POOL_V2_SHA256)
