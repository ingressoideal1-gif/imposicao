"""Contrato entre o painel local e o backend, sem iniciar servicos."""
import json
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
