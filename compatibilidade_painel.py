"""Contrato entre o painel local e o backend, sem iniciar servicos."""
import json
import hashlib
from pathlib import Path

PROTOCOLO_SESSAO = 1
ARQUIVO_PROTOCOLO = 'painel-protocolo.json'


def protocolo_do_painel(pasta):
    arquivo = Path(pasta) / ARQUIVO_PROTOCOLO
    if not arquivo.exists():
        return 0
    try:
        dados = json.loads(arquivo.read_text(encoding='utf-8'))
        valor = dados.get('sessao_local')
        return valor if type(valor) is int and valor >= 0 else -1
    except (OSError, ValueError, AttributeError):
        return -1


def painel_compativel(pasta):
    return protocolo_do_painel(pasta) == PROTOCOLO_SESSAO


def renovar_conjunto(destino, origem):
    """Repor o conjunto embutido quando o painel existente usa outro protocolo."""
    return painel_compativel(origem) and not painel_compativel(destino)


def painel_externo_validado(pasta, executavel):
    """Reconhece overlay do Piloto ligado ao EXE exato; nao altera arquivos."""
    pasta = Path(pasta)
    try:
        manifesto = json.loads((pasta.parent / 'manifesto-painel.json').read_text(encoding='utf-8-sig'))
        if (manifesto.get('schema') != 1 or manifesto.get('canal') != 'piloto'
                or manifesto.get('protocolo', {}).get('sessao_local') != PROTOCOLO_SESSAO
                or not painel_compativel(pasta)):
            return False
        def sha(path):
            with Path(path).open('rb') as stream:
                return hashlib.file_digest(stream, 'sha256').hexdigest()
        if sha(executavel) != manifesto['base_exe_sha256']:
            return False
        arquivos = manifesto['arquivos']
        if 'index.html' not in arquivos or ARQUIVO_PROTOCOLO not in arquivos:
            return False
        for nome, esperado in arquivos.items():
            path = pasta / nome
            if (path.is_symlink() or not path.resolve().is_relative_to(pasta.resolve())
                    or ':' in nome or '\\' in nome or '..' in Path(nome).parts or sha(path) != esperado):
                return False
        return True
    except (OSError, ValueError, KeyError, TypeError, AttributeError):
        return False
