"""Reprotege uma recuperacao AES local na conta Windows do novo computador."""
import argparse
import json
import os
from pathlib import Path
import sys
import tempfile
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from segredos_estacao import proteger_texto


def provisionar(origem, destino):
    origem, destino = Path(origem), Path(destino)
    if destino.exists() or origem.is_symlink() or destino.parent.is_symlink():
        raise ValueError('Use origem recuperada e destino novo; dados existentes sao preservados.')
    if origem.name != destino.name or origem.name not in ('acessos_locais.json','credencial-publicacao.json','formats_db.json'):
        raise ValueError('Arquivo fora do escopo da recuperacao protegida.')
    data = json.loads(origem.read_text(encoding='utf-8'))
    if origem.name == 'credencial-publicacao.json':
        result = proteger_texto(data['credencial_publicacao'], 'publicacao-faixas')
    elif origem.name == 'acessos_locais.json':
        result = proteger_texto(json.dumps(data,ensure_ascii=False), 'acessos-locais')
    else:
        result = data
        cfg = result.get('email_config',{})
        if cfg.get('password'):
            cfg['password_protegida'] = proteger_texto(cfg.pop('password'),'smtp')
    # A pasta destino deve pertencer somente ao usuario e SYSTEM.
    from migracao_estacao import proteger_pasta
    proteger_pasta(destino.parent)
    fd, temp = tempfile.mkstemp(prefix='.reprotegendo-',dir=destino.parent)
    try:
        with os.fdopen(fd,'w',encoding='utf-8') as output:
            json.dump(result,output,ensure_ascii=False)
            output.flush()
            os.fsync(output.fileno())
        os.link(temp,destino)  # Exclusivo tambem se surgir outro arquivo durante a operacao.
    finally:
        Path(temp).unlink(missing_ok=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origem',required=True)
    parser.add_argument('--destino',required=True)
    args = parser.parse_args()
    provisionar(args.origem,args.destino)
    print('Runtime recuperado com DPAPI; nenhum valor exibido.')
