"""Preserva dados da estacao antes do MSI remover componentes antigos."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile


def pasta_dados():
    return Path(os.environ['LOCALAPPDATA']) / 'NewProd Dados Protegidos'


def proteger_pasta(path):
    import win32api
    import win32con
    import ntsecuritycon
    import win32security
    token = win32security.OpenProcessToken(win32api.GetCurrentProcess(), win32con.TOKEN_QUERY)
    try:
        owner = win32security.GetTokenInformation(token, win32security.TokenUser)[0]
    finally:
        token.Close()
    acl = win32security.ACL()
    flags = win32con.OBJECT_INHERIT_ACE | win32con.CONTAINER_INHERIT_ACE
    for sid in [owner, win32security.CreateWellKnownSid(win32security.WinLocalSystemSid, None)]:
        acl.AddAccessAllowedAceEx(win32security.ACL_REVISION, flags, ntsecuritycon.FILE_ALL_ACCESS, sid)
    win32security.SetNamedSecurityInfo(str(path), win32security.SE_FILE_OBJECT,
        win32security.OWNER_SECURITY_INFORMATION | win32security.DACL_SECURITY_INFORMATION |
        win32security.PROTECTED_DACL_SECURITY_INFORMATION, owner, None, acl, None)


def hash_arquivo(path):
    with Path(path).open('rb') as f:
        return hashlib.file_digest(f, 'sha256').hexdigest()


def copiar_sem_substituir(source, target):
    if source.is_symlink() or target.is_symlink():
        raise ValueError('Dados de estacao nao podem ser links.')
    expected = hash_arquivo(source)
    if target.exists():
        if hash_arquivo(target) != expected:
            raise ValueError('A copia existente diverge; upgrade interrompido para preservar dados.')
        return
    fd, temp = tempfile.mkstemp(prefix='.preservando-', dir=target.parent)
    try:
        with os.fdopen(fd, 'wb') as output, source.open('rb') as input_file:
            shutil.copyfileobj(input_file, output)
            output.flush()
            os.fsync(output.fileno())
        if hash_arquivo(temp) != expected:
            raise ValueError('Copia nao conferida.')
        os.link(temp, target)
    finally:
        Path(temp).unlink(missing_ok=True)


def preparar_upgrade(installation, destination=None):
    from segredos_estacao import recuperar_texto
    installation = Path(installation)
    if installation.is_symlink():
        raise ValueError('Instalacao nao pode ser um link.')
    installation = installation.resolve()
    expected = (Path(os.environ['LOCALAPPDATA']) / 'NewProd Agent').resolve()
    if installation != expected or installation.is_symlink():
        raise ValueError('Instalacao fora da pasta da conta Windows atual.')
    destination = Path(destination) if destination else pasta_dados()
    if destination.is_symlink():
        raise ValueError('Pasta privada nao pode ser um link.')
    destination.mkdir(exist_ok=True)
    proteger_pasta(destination)
    pool = installation / 'qr_ideal_pool.bin'
    if pool.exists():
        if pool.stat().st_size != 24_000_000:
            raise ValueError('Pool existente invalido; upgrade interrompido.')
        copiar_sem_substituir(pool, destination / pool.name)
    credential = destination / 'credencial-publicacao.json'
    previous = installation / credential.name
    if not credential.exists():
        if previous.exists():
            envelope = json.loads(previous.read_text(encoding='utf-8'))
            recuperar_texto(envelope, 'publicacao-faixas')
            copiar_sem_substituir(previous, credential)
        elif (installation / 'NewProd.exe').exists():
            from ferramentas.provisionar_credencial_publicacao import provisionar
            provisionar(installation / 'NewProd.exe', credential)
    if credential.exists():
        recuperar_texto(json.loads(credential.read_text(encoding='utf-8')), 'publicacao-faixas')
    return {'pool_preservado': (destination / pool.name).exists(),
            'credencial_protegida': credential.exists()}


def executar_upgrade(installation):
    try:
        preparar_upgrade(installation)
        return 0
    except Exception:
        # Nao registra dados ou mensagem de bibliotecas que possam conter valores.
        return 1
