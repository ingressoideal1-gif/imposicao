"""Instalacao independente do Piloto, sob a conta Windows da propria estacao."""
import base64
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import time
import urllib.request

from migracao_estacao import proteger_pasta
from segredos_estacao import proteger_texto, recuperar_texto

CONFIGURACOES = ('formats_db.json', 'acessos_locais.json', 'print_configs.json', 'hot_folders.json')
PRIVADOS = ('qr_ideal_pool.bin', 'qr_ideal_pool_qr12_1.bin', 'credencial-publicacao.json')


def sem_links(p):
    p = Path(p).absolute()
    for parte in (p, *p.parents):
        if parte.exists() and getattr(parte.lstat(), 'st_file_attributes', 0) & 0x400:
            raise ValueError('Pasta ou arquivo redirecionado; instalacao interrompida.')
        if parte.is_symlink():
            raise ValueError('Links nao sao permitidos na instalacao.')
    return p


def sha(p):
    with Path(p).open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def json_exclusivo(p, dados):
    sem_links(p)
    with Path(p).open('x', encoding='utf-8') as f:
        json.dump(dados, f, ensure_ascii=False)
        f.flush()
        os.fsync(f.fileno())


def pacote_conferido(pasta):
    pasta = sem_links(pasta)
    p = json.loads((pasta / 'pacote-piloto.json').read_text(encoding='utf-8-sig'))
    relativo = Path(p['executavel'])
    if relativo.is_absolute() or '..' in relativo.parts or relativo.name != 'NewProdPiloto.exe':
        raise ValueError('Caminho do pacote invalido.')
    exe = sem_links(pasta / relativo)
    if sha(exe) != p['sha256']:
        raise ValueError('Pacote do Piloto divergente; reinstale pelo MSI conferido.')
    if p.get('canal') != 'piloto' or p.get('porta') != 9001:
        raise ValueError('Pacote pertence a outro canal.')
    return p, exe


def copiar_conferido(origem, destino):
    sem_links(origem); sem_links(destino)
    digest = sha(origem)
    if destino.exists():
        if sha(destino) != digest:
            raise ValueError('Dados locais existentes divergem; nenhuma copia foi sobrescrita.')
        return
    with origem.open('rb') as entrada, destino.open('xb') as saida:
        shutil.copyfileobj(entrada, saida)
        saida.flush(); os.fsync(saida.fileno())
    if sha(destino) != digest or sha(origem) != digest:
        raise ValueError('Configuracao mudou durante a copia; tente novamente com o painel ocioso.')


def conferir_credencial(path):
    recuperar_texto(json.loads(path.read_text(encoding='utf-8-sig')), 'publicacao-faixas')


def preparar(base, pasta_pacote, *, estacao=None, proteger=proteger_pasta,
             cifrar=proteger_texto, decifrar=recuperar_texto, credencial=conferir_credencial):
    base = sem_links(base)
    p, fonte_exe = pacote_conferido(pasta_pacote)
    estacao = estacao or socket.gethostname()
    if not estacao or len(estacao) > 80:
        raise ValueError('Nome da estacao invalido.')
    raiz = sem_links(base / 'NewProd Piloto')
    original = sem_links(base / 'NewProd Agent')
    privados = sem_links(base / 'NewProd Dados Protegidos')
    destino_privado = sem_links(base / 'NewProd Piloto Dados Protegidos')
    manifesto = raiz / 'versao-ativa.json'
    pasta_versao = raiz / 'versoes' / p['versao']
    alvo_exe = pasta_versao / 'NewProdPiloto.exe'
    esperado = dict(executavel=str(alvo_exe.relative_to(raiz)), sha256=p['sha256'],
                    porta=9001, versao=p['versao'], commit=p['commit'], painel=p['painel'],
                    instalador='msi-piloto-v1', estacao=estacao, empresa='Ingresso Ideal')
    # Uma instalacao manual ou mais nova nunca e substituida pelo MSI inicial.
    if manifesto.exists():
        atual = json.loads(manifesto.read_text(encoding='utf-8-sig'))
        if atual != esperado:
            raise ValueError('Ja existe outro Piloto nesta conta. Atualize pela instalacao existente; original preservado.')
        if sha(sem_links(alvo_exe)) != p['sha256']:
            raise ValueError('Piloto ativo divergente; dados preservados para recuperacao.')
        return esperado
    if not (original / 'NewProd.exe').is_file() or not (original / 'formats_db.json').is_file():
        raise ValueError('Execute na mesma conta Windows que utiliza o NewProd original configurado.')
    fontes = {}
    for nome in CONFIGURACOES:
        origem = sem_links(original / nome)
        if origem.is_file(): fontes['config/' + nome] = origem
    for nome in PRIVADOS:
        origem = sem_links(privados / nome)
        if not origem.is_file(): origem = sem_links(original / nome)
        if origem.is_file(): fontes['privado/' + nome] = origem
    if 'privado/credencial-publicacao.json' not in fontes:
        raise ValueError('Credencial protegida do NewProd original ausente. Configure a estacao antes de instalar o Piloto.')
    credencial(fontes['privado/credencial-publicacao.json'])
    for chave, origem in fontes.items():
        if chave.endswith('qr_ideal_pool.bin') and origem.stat().st_size != 24_000_000:
            raise ValueError('Pool QR da estacao invalido; original preservado.')
    if shutil.disk_usage(base).free < fonte_exe.stat().st_size * 3 + 2 * 1024**3:
        raise ValueError('Espaco livre insuficiente: reserve pelo menos 2 GiB alem do pacote.')
    # Recusa colisao antes de criar runtime. Nunca copia identidade agent_config.
    for chave, origem in fontes.items():
        alvo = (pasta_versao if chave.startswith('config/') else destino_privado) / origem.name
        sem_links(alvo)
        if alvo.exists() and sha(alvo) != sha(origem):
            raise ValueError('Configuracao do Piloto ja existe e diverge; nenhuma substituicao aplicada.')
    for pasta in (raiz, destino_privado):
        pasta.mkdir(parents=True, exist_ok=True); proteger(pasta)
    pasta_versao.mkdir(parents=True, exist_ok=True)
    proteger(pasta_versao)
    area = raiz / 'instalacao'
    area.mkdir(exist_ok=True); proteger(area)
    # Backup pequeno dos ajustes; pools continuam intactos em ambas as pastas privadas.
    snapshot = {n:base64.b64encode(o.read_bytes()).decode('ascii') for n,o in fontes.items()
                if n.startswith('config/') or n.endswith('credencial-publicacao.json')}
    lacrado = cifrar(json.dumps(snapshot), 'instalacao-piloto')
    if json.loads(decifrar(lacrado, 'instalacao-piloto')) != snapshot:
        raise ValueError('Ensaio de recuperacao do backup falhou.')
    backup = area / ('antes-' + time.strftime('%Y%m%d-%H%M%S') + '-' + secrets.token_hex(4) + '.dpapi.json')
    json_exclusivo(backup, lacrado)
    copiar_conferido(fonte_exe, alvo_exe)
    for chave, origem in fontes.items():
        destino = (pasta_versao if chave.startswith('config/') else destino_privado) / origem.name
        copiar_conferido(origem, destino)
    # O manifesto e o ultimo passo: runtime parcial nunca se torna ativo.
    json_exclusivo(manifesto, esperado)
    return esperado


def token_local(raiz):
    import win32crypt
    path = sem_links(raiz / 'token-local.dpapi')
    if not path.exists():
        token = secrets.token_urlsafe(48)
        lacrado = win32crypt.CryptProtectData(token.encode('utf-16-le'), None, None, None, None, 0)
        with path.open('x', encoding='utf-8') as f: f.write(lacrado.hex())
    return win32crypt.CryptUnprotectData(bytes.fromhex(path.read_text(encoding='utf-8-sig').strip()),
                                       None, None, None, 0)[1].decode('utf-16-le')


def iniciar(base, pasta_pacote, abrir=True):
    import webbrowser
    preparar(base, pasta_pacote)
    raiz = Path(base) / 'NewProd Piloto'
    ativa = json.loads((raiz / 'versao-ativa.json').read_text(encoding='utf-8-sig'))
    exe = sem_links(raiz / ativa['executavel'])
    if sha(exe) != ativa['sha256']: raise ValueError('Executavel ativo divergente.')
    def online():
        try:
            with urllib.request.urlopen('http://127.0.0.1:9001/api/version', timeout=2) as r:
                v = json.load(r)
            if v.get('version') != 'NewProd ' + ativa['versao'] or v.get('canal') != 'piloto':
                raise ValueError('Outra versao ocupa a porta 9001; nenhuma instancia foi encerrada.')
            return True
        except urllib.error.URLError: return False
    if not online():
        with socket.socket() as teste:
            if teste.connect_ex(('127.0.0.1',9001)) == 0:
                raise ValueError('Porta 9001 ocupada; nenhuma instancia foi encerrada.')
        env = os.environ.copy()
        env.update(NEWPROD_CANAL='piloto', NEWPROD_PILOTO_LOCAL='1', NEWPROD_PILOTO_AUTONOMO='1',
                   NEWPROD_PILOTO_EMPRESA=ativa['empresa'], NEWPROD_PILOTO_ESTACAO=socket.gethostname(),
                   NEWPROD_PILOTO_RAIZ=str(raiz/'dados'), NEWPROD_PILOTO_TOKEN=token_local(raiz),
                   NEWPROD_PILOTO_PAUSADO='1')
        si = subprocess.STARTUPINFO(); si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
        si.wShowWindow = 0
        subprocess.Popen([str(exe)], cwd=exe.parent, env=env, startupinfo=si)
        for _ in range(40):
            time.sleep(1)
            if online(): break
        else: raise ValueError('Piloto nao respondeu. Use o atalho original e consulte os logs da estacao.')
    if abrir: webbrowser.open('http://127.0.0.1:9001/app/')


def main():
    import ctypes
    modo = sys.argv[1] if len(sys.argv) > 1 else '--abrir'
    try:
        base = Path(os.environ['LOCALAPPDATA'])
        pacote = Path(sys.executable).parent
        if modo == '--preparar': preparar(base, pacote)
        elif modo in ('--abrir','--iniciar'): iniciar(base, pacote, abrir=modo=='--abrir')
        else: raise ValueError('Acao do instalador invalida.')
        return 0
    except Exception as erro:
        # Mensagens de bibliotecas podem incluir valores de configuracao: nao exibir.
        mensagem = str(erro) if isinstance(erro, ValueError) and type(erro) is ValueError else 'Nao foi possivel preparar o Piloto nesta conta Windows. O NewProd original foi preservado.'
        if modo != '--preparar': ctypes.windll.user32.MessageBoxW(None, mensagem, 'NewProd Piloto', 0x10)
        return 1


if __name__ == '__main__':
    sys.exit(main())
