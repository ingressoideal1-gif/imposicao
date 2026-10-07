"""Preflight do retorno solicitado para GUSTAVO-PROD. Nao encerra processos."""
import os
from pathlib import Path
import socket


def conferir_ocioso(base):
    import win32api
    import win32con
    import win32process
    import win32print
    for porta in (9000, 9001):
        with socket.socket() as teste:
            teste.settimeout(1)
            if teste.connect_ex(('127.0.0.1', porta)) == 0:
                raise ValueError('Saia do NewProd pelo icone ao lado do relogio antes de instalar.')
    raizes = [str(base / n).casefold() + os.sep for n in ('NewProd Agent', 'NewProd Piloto')]
    for pid in win32process.EnumProcesses():
        if not pid or pid == os.getpid():
            continue
        handle = None
        try:
            handle = win32api.OpenProcess(win32con.PROCESS_QUERY_INFORMATION | win32con.PROCESS_VM_READ, False, pid)
            caminho = win32process.GetModuleFileNameEx(handle, 0).casefold()
        except Exception:
            continue
        finally:
            if handle:
                handle.Close()
        if Path(caminho).name in ('newprod.exe', 'newprodpiloto.exe') and any(caminho.startswith(r) for r in raizes):
            raise ValueError('O NewProd ainda esta aberto. Use Sair no icone ao lado do relogio.')
    for impressora in win32print.EnumPrinters(win32print.PRINTER_ENUM_LOCAL | win32print.PRINTER_ENUM_CONNECTIONS, None, 2):
        h = win32print.OpenPrinter(impressora['pPrinterName'])
        try:
            if win32print.GetPrinter(h, 2).get('cJobs', 0) or win32print.EnumJobs(h, 0, 1, 1):
                raise ValueError('Ha trabalhos na fila de impressao. Conclua os trabalhos antes de instalar.')
        finally:
            win32print.ClosePrinter(h)


def preparar(instalacao, *, conferir=conferir_ocioso, backup=None, preservar=None):
    from pacotes_locais import _sem_links
    from migracao_estacao import preparar_upgrade, proteger_pasta, copiar_sem_substituir, hash_arquivo
    from backup_gestao import executar
    if socket.gethostname().upper() != 'GUSTAVO-PROD':
        raise ValueError('Este retorno foi preparado somente para GUSTAVO-PROD.')
    base = Path(os.environ['LOCALAPPDATA']).resolve()
    raiz = Path(instalacao).absolute()
    _sem_links(raiz)
    if raiz.resolve() != base / 'NewProd Agent':
        raise ValueError('Execute na mesma conta Windows usada pelo NewProd.')
    conferir(base)
    exe = raiz / 'NewProd.exe'
    _sem_links(exe)
    if not exe.is_file():
        raise ValueError('Instalacao anterior nao encontrada nesta conta Windows.')
    # Copia imutavel do executavel anterior e snapshot cifrado das configuracoes.
    area = base / 'NewProd Dados Protegidos' / 'retorno-original'
    _sem_links(area)
    area.mkdir(parents=True, exist_ok=True)
    proteger_pasta(area)
    copiar_sem_substituir(exe, area / (hash_arquivo(exe) + '.exe'))
    backup = backup or executar
    backup(raiz, raiz)
    piloto = base / 'NewProd Piloto'
    _sem_links(piloto)
    if piloto.is_dir():
        backup(piloto, raiz)
    (preservar or preparar_upgrade)(raiz)
    conferir(base)
    return 0
