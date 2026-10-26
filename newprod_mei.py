"""Limpeza de bundles identificados pelo runtime do NewProd; import sem efeitos."""
import errno
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
import time

from newprod_temp import _sem_links

MARCADOR = ".newprod-mei-v1.lock"
INCOMPLETO = ".newprod-mei-v1.incompleto"
ASSINATURA = b"NewProd owned PyInstaller bundle v1\n"
RETENCAO = 24 * 3600
LIMITE_ENTRADAS = 100000
LIMITE_SEGUNDOS = 30
_NOME = re.compile(r"_MEI[a-zA-Z0-9]+\Z")
_handles = []  # Locks compartilhados vivos ate o encerramento do processo.


def _travar(handle, exclusivo):
    if os.name != "nt":
        import fcntl
        fcntl.flock(handle.fileno(), (fcntl.LOCK_EX if exclusivo else fcntl.LOCK_SH) | fcntl.LOCK_NB)
        return
    import ctypes
    from ctypes import wintypes
    import msvcrt

    class Overlapped(ctypes.Structure):
        _fields_ = [("Internal", ctypes.c_size_t), ("InternalHigh", ctypes.c_size_t),
                    ("Offset", wintypes.DWORD), ("OffsetHigh", wintypes.DWORD),
                    ("hEvent", wintypes.HANDLE)]

    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    lock = kernel.LockFileEx
    lock.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.DWORD,
                     wintypes.DWORD, wintypes.DWORD, ctypes.POINTER(Overlapped)]
    lock.restype = wintypes.BOOL
    overlapped = Overlapped()
    if not lock(msvcrt.get_osfhandle(handle.fileno()), 1 | (2 if exclusivo else 0),
                0, 1, 0, ctypes.byref(overlapped)):
        raise ctypes.WinError(ctypes.get_last_error())


def _validar(pasta, raiz):
    return (pasta.parent == raiz and bool(_NOME.fullmatch(pasta.name))
            and _sem_links(pasta) and pasta.is_dir()
            and pasta.resolve().parent == raiz.resolve())


def registrar_runtime():
    """Runtime hook antes dos imports/multiprocessing; cada processo mantem lock.

    Nao reconhece bundles antigos pela aparencia. Falha criando marcador em
    bundle novo (ex.: disco cheio) deixa esse bundle fora da limpeza automatica.
    Um bundle ja marcado so pode continuar se adquirir sua protecao.
    """
    if not getattr(sys, "frozen", False) or not getattr(sys, "_MEIPASS", None):
        return False
    pasta = Path(os.path.abspath(sys._MEIPASS))
    raiz = Path(os.path.abspath(tempfile.gettempdir()))
    if not _validar(pasta, raiz):
        return False
    marcador = pasta / MARCADOR
    incompleto = pasta / INCOMPLETO
    if not _sem_links(marcador) or not _sem_links(incompleto) or incompleto.exists():
        return False
    if not marcador.exists():
        handle = None
        try:
            # Se faltar espaco ate no flush/close, o sentinela ja existe e
            # impede reconhecer uma assinatura parcialmente persistida.
            with open(incompleto, "xb"):
                pass
            handle = open(marcador, "x+b")
            handle.write(ASSINATURA)
            handle.flush()
            _travar(handle, exclusivo=False)
            incompleto.unlink()
        except OSError:
            if handle is not None:
                try:
                    handle.close()
                except OSError:
                    pass
            return False
        _handles.append(handle)
        return True

    # Filhos e outras instancias compartilham o bundle ja registrado. Se uma
    # limpeza detem a trava exclusiva, nao continuar sem protecao.
    handle = open(marcador, "r+b")
    try:
        if handle.read(len(ASSINATURA) + 1) != ASSINATURA:
            handle.close()
            return False
        _travar(handle, exclusivo=False)
    except BaseException:
        handle.close()
        raise
    _handles.append(handle)
    return True


def _inventario(pasta, inicio):
    arquivos, diretorios = [], []
    pilha = [pasta]
    while pilha:
        atual = pilha.pop()
        if not _sem_links(atual):
            raise OSError("Link no bundle")
        for p in atual.iterdir():
            if len(arquivos) + len(diretorios) >= LIMITE_ENTRADAS or time.monotonic() - inicio > LIMITE_SEGUNDOS:
                raise TimeoutError("Inventario excedeu limite")
            if not _sem_links(p):
                raise OSError("Link no bundle")
            s = p.lstat()
            if stat.S_ISDIR(s.st_mode):
                diretorios.append(p)
                pilha.append(p)
            elif stat.S_ISREG(s.st_mode) and s.st_nlink == 1:
                if p != pasta / MARCADOR:
                    arquivos.append((p, s.st_size))
            else:
                raise OSError("Conteudo inesperado no bundle")
    return arquivos, diretorios


def limpar_abandonados(raiz=None, agora=None):
    """Somente filhos diretos do TEMP, marcados, antigos e sem locks ativos.

    Sem rede, encerramento de processos, elevacao, backup ou rmtree.
    Erros preservam o marcador para repetir a limpeza; bytes contam so unlink
    concluido, inclusive quando outra parte do bundle nao pode ser removida.
    """
    agora = time.time() if agora is None else agora
    r = dict(pastas_removidas=0, bytes_removidos=0, ativos=0, recentes=0,
             sem_identificacao=0, erros=0, parcial=False, executada_em=agora)
    # Uma execucao de desenvolvimento nao deve limpar o TEMP real da maquina.
    if raiz is None and not getattr(sys, "frozen", False):
        r["estado"] = "nao_empacotado"
        return r
    raiz = Path(os.path.abspath(raiz or tempfile.gettempdir()))
    inicio = time.monotonic()
    if not _sem_links(raiz):
        r["erros"] += 1
        return r
    atual = getattr(sys, "_MEIPASS", None)
    atual = Path(os.path.abspath(atual)) if atual else None
    try:
        with os.scandir(raiz) as entradas:
            for indice, entrada in enumerate(entradas):
                if indice >= LIMITE_ENTRADAS or time.monotonic() - inicio > LIMITE_SEGUNDOS:
                    r["parcial"] = True
                    break
                if not _NOME.fullmatch(entrada.name):
                    continue
                pasta = Path(entrada.path)
                handle = None
                try:
                    if not _validar(pasta, raiz):
                        r["erros"] += 1
                        continue
                    if pasta == atual:
                        r["ativos"] += 1
                        continue
                    marcador = pasta / MARCADOR
                    if (pasta / INCOMPLETO).exists() or not marcador.exists():
                        r["sem_identificacao"] += 1
                        continue
                    if not _sem_links(marcador) or marcador.stat().st_nlink != 1:
                        raise OSError("Marcador invalido")
                    handle = open(marcador, "r+b")
                    try:
                        _travar(handle, exclusivo=True)
                    except OSError as exc:
                        codigo_windows = getattr(exc, "winerror", None)
                        ocupado = (codigo_windows == 33 if codigo_windows is not None
                                   else exc.errno in (errno.EACCES, errno.EAGAIN))
                        if ocupado:
                            r["ativos"] += 1
                            continue
                        raise
                    if handle.read(len(ASSINATURA) + 1) != ASSINATURA:
                        r["sem_identificacao"] += 1
                        continue
                    if agora - os.fstat(handle.fileno()).st_mtime < RETENCAO:
                        r["recentes"] += 1
                        continue
                    arquivos, diretorios = _inventario(pasta, inicio)
                    for p, tamanho in arquivos:
                        if time.monotonic() - inicio > LIMITE_SEGUNDOS:
                            raise TimeoutError("Limpeza excedeu limite")
                        if not _validar(pasta, raiz) or not _sem_links(p):
                            raise OSError("Caminho alterado durante limpeza")
                        p.unlink()
                        r["bytes_removidos"] += tamanho
                    for p in reversed(diretorios):
                        if not _sem_links(p):
                            raise OSError("Caminho alterado durante limpeza")
                        p.rmdir()
                    handle.close()
                    handle = None
                    if not _validar(pasta, raiz) or not _sem_links(marcador):
                        raise OSError("Caminho alterado durante limpeza")
                    marcador.unlink()
                    pasta.rmdir()
                    r["pastas_removidas"] += 1
                except TimeoutError:
                    r["parcial"] = True
                    r["erros"] += 1
                except OSError:
                    r["erros"] += 1
                finally:
                    if handle is not None:
                        handle.close()
    except OSError:
        r["erros"] += 1
    return r
