"""Gravacao atomica de JSON local, sem importar banco ou iniciar servicos."""
import json
import os
from pathlib import Path
import tempfile


def gravar_json_atomico(caminho, dados):
    destino = Path(caminho)
    conteudo = json.dumps(dados, indent=4, ensure_ascii=False).encode('utf-8')
    temporario = None
    try:
        with tempfile.NamedTemporaryFile(dir=destino.parent, prefix=destino.name + '.',
                                         suffix='.novo', delete=False) as arquivo:
            temporario = arquivo.name
            arquivo.write(conteudo)
            arquivo.flush()
            os.fsync(arquivo.fileno())
        os.replace(temporario, destino)
        temporario = None
    finally:
        if temporario is not None:
            os.unlink(temporario)
