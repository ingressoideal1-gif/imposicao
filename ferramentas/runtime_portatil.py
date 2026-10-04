"""Recuperacao dos arquivos explicitamente selecionados, somente dentro do AES."""
import json
from pathlib import Path
import sys


def recuperar_para_aes(name, data):
    if name not in ('acessos_locais.json', 'credencial-publicacao.json', 'formats_db.json'):
        return None
    config = json.loads(data.decode('utf-8-sig'))
    if not isinstance(config, dict):
        return None
    if not __package__:
        sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    from segredos_estacao import recuperar_texto
    if config.get('protecao') == 'windows-dpapi-v1':
        purpose = 'acessos-locais' if name == 'acessos_locais.json' else 'publicacao-faixas'
        text = recuperar_texto(config, purpose)
        result = json.loads(text) if name == 'acessos_locais.json' else {'credencial_publicacao':text}
    elif name == 'formats_db.json' and isinstance(config.get('email_config'), dict) and 'password_protegida' in config['email_config']:
        result = config
        result['email_config']['password'] = recuperar_texto(result['email_config'].pop('password_protegida'), 'smtp')
    else:
        return None
    return json.dumps(result, ensure_ascii=False).encode('utf-8')
