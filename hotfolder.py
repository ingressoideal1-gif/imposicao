# -*- coding: utf-8 -*-
"""Envio de PDF para uma pasta observada (hot folder) em vez da impressora.

Algumas impressoras da grafica nao recebem trabalho pela fila do Windows. A
Epson SureColor F9470H e conduzida pelo RIP Epson Edge Print, que observa uma
pasta, importa o PDF que aparece ali e aplica a ele o preset associado aquela
pasta.

Este modulo cuida do lado da estacao: validar a pasta, sanitizar o nome, evitar
colisao, gravar de forma atomica, abrir o seletor nativo e conferir se o RIP
consumiu o arquivo. Ele nao conhece HTTP — quem expoe isso e o app.py.
"""

import os
import re
import sys
import threading

# Teto por arquivo. Uma imposicao de SRA3 com arte pesada raramente passa de
# algumas dezenas de MB; 200 MB e folga larga e ainda impede que o endpoint
# vire um jeito de encher o disco da estacao.
TAMANHO_MAXIMO_BYTES = 200 * 1024 * 1024

# Quanto tempo depois do envio faz sentido perguntar se o RIP ja consumiu.
SEGUNDOS_ATE_CONFERIR = 12

# Caracteres que o Windows recusa em nome de arquivo, mais os de controle.
_PROIBIDOS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')

# Nomes reservados pelo DOS que sobrevivem ate hoje: um arquivo chamado "CON.pdf"
# nao pode ser criado no Windows.
_RESERVADOS = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}

# Um seletor de pasta por vez. Sem isso, dois cliques no botao abrem dois
# dialogos, e o segundo nasce atras do primeiro — o operador ve a tela travada.
_lock_dialogo = threading.Lock()

# A escolha do nome livre e o rename precisam ser um passo so dentro do agente,
# senao dois envios simultaneos escolhem o mesmo nome.
_lock_gravacao = threading.Lock()


# ─── Nome do arquivo ──────────────────────────────────────────────────────────

def sanitizar_nome(nome: str) -> str:
    """Reduz o nome recebido a algo que o Windows aceite, sempre terminado em .pdf.

    O nome chega do navegador e vai virar um caminho em disco, entao aqui e o
    lugar de cortar travessia de diretorio: so o ultimo componente sobrevive, e
    separador nenhum passa.
    """
    bruto = (nome or "").strip()

    # Só o último componente, tanto para / quanto para \: o navegador manda o
    # nome do material, e um "../" ali nao pode virar escrita fora da pasta.
    bruto = bruto.replace("\\", "/").split("/")[-1]

    limpo = _PROIBIDOS.sub("_", bruto)

    # ".." vira "__" pelo passo acima nao — ponto nao e proibido. Mas um nome
    # feito so de pontos nao identifica nada e confunde o RIP.
    if limpo.strip(". ") == "":
        limpo = "impressao"

    # Windows corta ponto e espaco no fim do nome, silenciosamente.
    limpo = limpo.rstrip(". ")

    if limpo.lower().endswith(".pdf"):
        base = limpo[:-4].rstrip(". ") or "impressao"
    else:
        base = limpo

    if base.split(".")[0].upper() in _RESERVADOS:
        base = "_" + base

    # 150 caracteres deixam espaco para a pasta e para o sufixo " (12)" dentro
    # do limite de caminho do Windows sem precisar de caminho longo.
    base = base[:150].rstrip(". ") or "impressao"

    return base + ".pdf"


def _nome_livre(pasta: str, nome: str) -> str:
    """Primeiro nome que ainda nao existe na pasta: nome.pdf, nome (2).pdf, ..."""
    caminho = os.path.join(pasta, nome)
    if not os.path.exists(caminho):
        return caminho
    base = nome[:-4]
    for i in range(2, 1000):
        candidato = os.path.join(pasta, f"{base} ({i}).pdf")
        if not os.path.exists(candidato):
            return candidato
    raise OSError(f"mais de 999 arquivos com o nome {nome} na pasta")


# ─── Pasta ────────────────────────────────────────────────────────────────────

def normalizar(caminho: str) -> str:
    """Forma canonica usada para comparar caminhos entre si."""
    if not caminho:
        return ""
    return os.path.normcase(os.path.abspath(os.path.normpath(caminho.strip())))


def e_unidade_mapeada(caminho: str) -> bool:
    """O caminho comeca com letra de unidade em vez de UNC?

    Letra mapeada pertence a sessao do usuario. Se o agente um dia rodar como
    servico ou sob outra conta, "Z:" nao existe para ele e o envio quebra em
    silencio. UNC (\\\\servidor\\pasta) nao tem esse problema.
    """
    c = (caminho or "").strip()
    if len(c) < 2 or c[1] != ":":
        return False
    # C:, D: locais nao sao mapeamento; so avisamos do que parece ser de rede.
    try:
        import ctypes
        DRIVE_REMOTE = 4
        raiz = c[:2] + "\\"
        return ctypes.windll.kernel32.GetDriveTypeW(raiz) == DRIVE_REMOTE
    except Exception:
        return False


def validar_pasta(caminho: str):
    """(ok, mensagem). Confere que existe, e pasta, e aceita escrita de verdade.

    A sonda de escrita nao e paranoia: hot folder costuma ser um share de rede,
    e um share pode estar montado e legivel mas negar escrita para a conta do
    agente. Descobrir isso agora e melhor do que no meio de um envio.
    """
    if not caminho or not caminho.strip():
        return False, "nenhuma pasta informada"

    alvo = caminho.strip()

    if not os.path.exists(alvo):
        return False, f"a pasta nao existe: {alvo}"
    if not os.path.isdir(alvo):
        return False, f"o caminho existe mas nao e uma pasta: {alvo}"

    sonda = os.path.join(alvo, f".newprod_sonda_{os.getpid()}.tmp")
    try:
        with open(sonda, "wb") as f:
            f.write(b"ok")
    except Exception as e:
        return False, f"a pasta existe mas nao aceita escrita ({e})"
    finally:
        try:
            if os.path.exists(sonda):
                os.remove(sonda)
        except Exception:
            pass

    return True, "ok"


# ─── Gravacao ─────────────────────────────────────────────────────────────────

def soltar(pasta: str, nome: str, dados: bytes) -> str:
    """Grava o PDF na pasta e devolve o caminho final.

    Grava primeiro como "<nome>.pdf.tmp" DENTRO da pasta de destino e so entao
    renomeia. O temporario precisa estar no mesmo volume — rename entre volumes
    nao e atomico, vira copia, e o RIP pode importar o arquivo pela metade. Esse
    e o modo de falha classico de hot folder, e ele nao aparece como erro: chega
    como arte cortada ou trabalho abortado, horas depois.

    A extensao dupla (.pdf.tmp) existe para que nenhum watcher associe o
    temporario a um PDF enquanto ele esta sendo escrito.
    """
    if dados is None:
        raise ValueError("nenhum conteudo para gravar")
    if len(dados) == 0:
        raise ValueError("o arquivo chegou vazio")
    if len(dados) > TAMANHO_MAXIMO_BYTES:
        raise ValueError(
            f"arquivo de {len(dados) // (1024*1024)} MB acima do teto de "
            f"{TAMANHO_MAXIMO_BYTES // (1024*1024)} MB")

    ok, msg = validar_pasta(pasta)
    if not ok:
        raise OSError(msg)

    nome_final = sanitizar_nome(nome)

    with _lock_gravacao:
        destino = _nome_livre(pasta, nome_final)
        temporario = destino + ".tmp"

        try:
            # O_EXCL garante que nao estamos escrevendo por cima do temporario
            # de outro envio que ainda esta em andamento.
            flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
            if hasattr(os, "O_BINARY"):
                flags |= os.O_BINARY
            fd = os.open(temporario, flags)
            try:
                with os.fdopen(fd, "wb") as f:
                    f.write(dados)
                    f.flush()
                    os.fsync(f.fileno())
            except Exception:
                raise
            # rename, e nao replace: no Windows ele falha se o destino existir,
            # o que transforma "nunca sobrescrever" numa garantia do sistema de
            # arquivos e nao numa checagem nossa que pode correr atrasada.
            if os.path.exists(destino):
                raise FileExistsError(destino)
            os.rename(temporario, destino)
        except Exception:
            try:
                if os.path.exists(temporario):
                    os.remove(temporario)
            except Exception:
                pass
            raise

    return destino


def conferir(caminhos) -> list:
    """Dos caminhos enviados, quais ainda estao na pasta.

    O Edge Print importa o arquivo e o remove. Sobrando arquivo, o watcher
    provavelmente nao esta rodando. E sinal, nao veredito: ha RIP que deixa o
    arquivo no lugar de proposito.
    """
    restantes = []
    for c in (caminhos or []):
        try:
            if c and os.path.exists(c):
                restantes.append(c)
        except Exception:
            pass
    return restantes


# ─── Seletor nativo de pasta ──────────────────────────────────────────────────
#
# SHBrowseForFolderW por ctypes, e nao o filedialog do tkinter: o tkinter esta
# em `excludes` no agent_tray.spec e nao existe dentro do executavel. O ctypes
# nao acrescenta dependencia nenhuma e a caixa de edicao da janela aceita um
# caminho UNC colado.

def _abrir_dialogo(inicial: str = "") -> str:
    import ctypes
    from ctypes import wintypes

    BIF_RETURNONLYFSDIRS = 0x00000001
    BIF_EDITBOX = 0x00000010
    BIF_NEWDIALOGSTYLE = 0x00000040
    BFFM_INITIALIZED = 1
    BFFM_SETSELECTIONW = 0x0467
    HWND_TOPMOST = -1
    SWP_NOMOVE = 0x0002
    SWP_NOSIZE = 0x0001

    shell32 = ctypes.windll.shell32
    ole32 = ctypes.windll.ole32
    user32 = ctypes.windll.user32

    BFFCALLBACK = ctypes.WINFUNCTYPE(
        ctypes.c_int, wintypes.HWND, wintypes.UINT, wintypes.LPARAM, wintypes.LPARAM)

    class BROWSEINFOW(ctypes.Structure):
        _fields_ = [
            ("hwndOwner", wintypes.HWND),
            ("pidlRoot", ctypes.c_void_p),
            ("pszDisplayName", wintypes.LPWSTR),
            ("lpszTitle", wintypes.LPCWSTR),
            ("ulFlags", wintypes.UINT),
            ("lpfn", BFFCALLBACK),
            ("lParam", wintypes.LPARAM),
            ("iImage", ctypes.c_int),
        ]

    def _callback(hwnd, msg, lp, data):
        if msg == BFFM_INITIALIZED:
            # A janela nasce atras do navegador se nao for trazida a frente —
            # do ponto de vista do operador, o botao simplesmente nao fez nada.
            try:
                user32.SetWindowPos(hwnd, HWND_TOPMOST, 0, 0, 0, 0,
                                    SWP_NOMOVE | SWP_NOSIZE)
                user32.SetForegroundWindow(hwnd)
            except Exception:
                pass
            if inicial:
                try:
                    user32.SendMessageW(hwnd, BFFM_SETSELECTIONW, 1,
                                        ctypes.c_wchar_p(inicial))
                except Exception:
                    pass
        return 0

    # A referencia precisa sobreviver a chamada: se o objeto for coletado, o
    # Windows chama um ponteiro morto.
    callback = BFFCALLBACK(_callback)

    display = ctypes.create_unicode_buffer(260)
    bi = BROWSEINFOW()
    bi.hwndOwner = None
    bi.pidlRoot = None
    bi.pszDisplayName = ctypes.cast(display, wintypes.LPWSTR)
    bi.lpszTitle = "Escolha a pasta observada pelo RIP (hot folder)"
    bi.ulFlags = BIF_RETURNONLYFSDIRS | BIF_NEWDIALOGSTYLE | BIF_EDITBOX
    bi.lpfn = callback
    bi.lParam = 0
    bi.iImage = 0

    # LPITEMIDLIST e ponteiro: sem restype explicito, o ctypes trunca para int
    # de 32 bits e o CoTaskMemFree libera um endereco errado.
    shell32.SHBrowseForFolderW.restype = ctypes.c_void_p
    shell32.SHBrowseForFolderW.argtypes = [ctypes.POINTER(BROWSEINFOW)]
    shell32.SHGetPathFromIDListW.argtypes = [ctypes.c_void_p, wintypes.LPWSTR]
    shell32.SHGetPathFromIDListW.restype = wintypes.BOOL

    pidl = shell32.SHBrowseForFolderW(ctypes.byref(bi))
    if not pidl:
        return ""   # o operador cancelou
    try:
        caminho = ctypes.create_unicode_buffer(1024)
        if not shell32.SHGetPathFromIDListW(pidl, caminho):
            return ""   # pasta virtual (Este Computador, Rede), sem caminho real
        return caminho.value
    finally:
        try:
            ole32.CoTaskMemFree(pidl)
        except Exception:
            pass


def escolher_pasta(inicial: str = "") -> str:
    """Abre o seletor nativo na estacao. Devolve "" se cancelado.

    Roda numa thread propria com COM em STA. O endpoint do FastAPI e servido por
    uma thread do pool, que pode ja estar em MTA — e o BIF_NEWDIALOGSTYLE exige
    STA. Numa thread nova o modo e nosso.
    """
    if sys.platform != "win32":
        raise RuntimeError("o seletor de pasta so existe no Windows")

    if not _lock_dialogo.acquire(blocking=False):
        raise RuntimeError("ja existe um seletor de pasta aberto nesta estacao")

    resultado = {"caminho": "", "erro": None}

    def tarefa():
        import ctypes
        ole32 = ctypes.windll.ole32
        iniciado = False
        try:
            # S_OK (0) e S_FALSE (1) sao sucesso; so quem inicializou desinicializa.
            hr = ole32.CoInitialize(None)
            iniciado = hr in (0, 1)
            resultado["caminho"] = _abrir_dialogo(inicial)
        except Exception as e:
            resultado["erro"] = e
        finally:
            if iniciado:
                try:
                    ole32.CoUninitialize()
                except Exception:
                    pass

    try:
        t = threading.Thread(target=tarefa, name="HotFolderDialogo", daemon=True)
        t.start()
        t.join()
    finally:
        _lock_dialogo.release()

    if resultado["erro"]:
        raise resultado["erro"]
    return resultado["caminho"]
