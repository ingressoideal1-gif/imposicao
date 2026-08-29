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


def _nomes_candidatos(pasta: str, nome: str):
    """nome.pdf, nome (2).pdf, nome (3).pdf... na ordem.

    Devolve candidatos em vez de "o primeiro livre" de proposito: quem grava
    reivindica o nome na propria criacao do arquivo, entao a decisao de pular
    para o proximo pertence ao sistema de arquivos, nao a um os.path.exists que
    ja pode estar desatualizado quando a criacao acontece.
    """
    yield os.path.join(pasta, nome)
    base = nome[:-4]
    for i in range(2, 1000):
        yield os.path.join(pasta, f"{base} ({i}).pdf")


# ─── Pasta ────────────────────────────────────────────────────────────────────

def normalizar(caminho: str) -> str:
    """Forma canonica usada para comparar caminhos entre si."""
    if not caminho:
        return ""
    return os.path.normcase(os.path.abspath(os.path.normpath(caminho.strip())))


def nome_curto(caminho: str) -> str:
    r"""O nome que o operador reconhece: o ultimo trecho do caminho.

    "C:\RIP\Epson\Sublimacao 160g" -> "Sublimacao 160g". A tela mostra o
    ladrilho por este nome, e o caminho inteiro fica na dica do ladrilho: numa
    coluna de 342 px, o caminho completo nao cabe e o nome e' o que distingue
    uma pasta da outra num relance.

    Raiz de unidade nao tem ultimo trecho ("D:\\" -> "D:"); ai o proprio caminho
    e' o nome, porque um ladrilho sem rotulo nao serve para nada.

    NAO usa os.path.basename, e isso importa: numa RAIZ DE COMPARTILHAMENTO
    ("\\\\servidor\\travada") o Windows trata o caminho inteiro como raiz e o
    basename devolve "". Cairiamos no caminho completo, enquanto o
    `_nomeDaPasta` do frontend -- que atende a mesma pergunta quando a pasta nao
    esta na lista -- devolveria "travada". Duas respostas para a mesma pasta e'
    o tipo de divergencia que so' aparece na estacao, meses depois.
    """
    c = (caminho or "").strip().rstrip("\\/")
    if not c:
        return ""
    trechos = [t for t in re.split(r"[\\/]+", c) if t]
    return trechos[-1] if trechos else c


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

# Como o arquivo passa a existir na pasta. NAO e preferencia de estilo: e o que
# decide se o RIP enxerga o trabalho ou nao. Ver o comentario extenso em soltar().
METODO_PADRAO = "direto"
METODOS_VALIDOS = ("direto", "exclusivo", "rename")


def _gravar_direto(destino: str, dados: bytes):
    """Cria o arquivo ja com o nome final e escreve nele. O padrao.

    Do ponto de vista do sistema de arquivos, e exatamente o que o Explorer faz
    ao copiar um arquivo para a pasta — o unico caminho que sabemos, por
    observacao, que o Epson Edge Print aceita.
    """
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_BINARY"):
        flags |= os.O_BINARY
    fd = os.open(destino, flags)
    with os.fdopen(fd, "wb") as f:
        # Uma unica chamada de escrita, e nao um laco em pedacos: o arquivo ja
        # esta inteiro na memoria, e quanto menos operacoes, menor a janela em
        # que ele existe com o nome final e conteudo parcial.
        f.write(dados)
        f.flush()
        os.fsync(f.fileno())


def _gravar_exclusivo(destino: str, dados: bytes):
    """Nome final, mas trancado: ninguem abre o arquivo enquanto escrevemos.

    Escape hatch para o caso de o RIP reagir tao rapido ao evento de criacao que
    chegue a ler o arquivo pela metade. Com dwShareMode=0, quem tentar abrir no
    meio recebe ERROR_SHARING_VIOLATION — que e o mesmo que qualquer copia em
    andamento produz, e por isso observadores de hot folder costumam repetir a
    tentativa em vez de desistir.

    Nao e o padrao porque "costumam" nao e "garantidamente": um observador que
    desista na primeira recusa ficaria cego de novo, e nao temos como testar
    contra o Edge Print.
    """
    import win32file
    import win32con
    ERROR_FILE_EXISTS = 80
    try:
        h = win32file.CreateFile(
            destino,
            win32con.GENERIC_WRITE,
            0,                       # dwShareMode = 0: acesso exclusivo
            None,
            win32con.CREATE_NEW,     # falha se o arquivo ja existir
            win32con.FILE_ATTRIBUTE_NORMAL,
            None,
        )
    except Exception as e:
        # A API do Windows sinaliza colisao com um erro proprio; quem chama so
        # sabe pular para o proximo nome se ele chegar como FileExistsError.
        if getattr(e, "winerror", None) == ERROR_FILE_EXISTS:
            raise FileExistsError(destino) from e
        raise
    try:
        win32file.WriteFile(h, dados)
        win32file.FlushFileBuffers(h)
    finally:
        h.Close()


def _gravar_por_rename(destino: str, dados: bytes):
    """Grava um .tmp na pasta e renomeia. NAO USE com o Epson Edge Print.

    Era o padrao ate 2026-08-11 e foi o que quebrou o hot folder em producao.
    Continua aqui porque a troca atomica e genuinamente mais segura contra
    leitura parcial, e um RIP que trate evento de renomeacao ganha isso de graca.
    """
    temporario = destino + ".tmp"
    flags = os.O_WRONLY | os.O_CREAT | os.O_EXCL
    if hasattr(os, "O_BINARY"):
        flags |= os.O_BINARY
    fd = os.open(temporario, flags)
    try:
        with os.fdopen(fd, "wb") as f:
            f.write(dados)
            f.flush()
            os.fsync(f.fileno())
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


_GRAVADORES = {
    "direto": _gravar_direto,
    "exclusivo": _gravar_exclusivo,
    "rename": _gravar_por_rename,
}


def soltar(pasta: str, nome: str, dados: bytes, metodo: str = None) -> str:
    """Grava o PDF na pasta e devolve o caminho final.

    O arquivo e CRIADO ja com o nome final. Nao ha .tmp e nao ha renomeacao —
    e isso e a coisa mais importante deste modulo.

    A primeira versao gravava "<nome>.pdf.tmp" e renomeava, pela razao classica:
    a troca e atomica, entao o RIP nunca veria o arquivo pela metade. Em
    producao, com a Epson SureColor F9470H e o Epson Edge Print, isso nao
    funcionou — o RIP simplesmente ignorava o arquivo. Fechar e reabrir o Edge
    Print fazia o mesmo arquivo ser importado sem problema, e um PDF gerado
    fora e arrastado pelo Explorer sempre funcionou.

    Esses tres fatos, juntos, dizem uma coisa so. Se o arquivo fosse invalido ou
    truncado, reabrir o RIP nao o salvaria — logo o conteudo estava bom. O Edge
    Print varre a pasta ao iniciar e, em regime, depende de uma notificacao do
    Windows. Renomear para dentro da pasta emite FILE_ACTION_RENAMED_NEW_NAME;
    criar emite FILE_ACTION_ADDED. Um observador que so trate "arquivo criado" —
    o caso comum, e o comportamento padrao de quem usa FileSystemWatcher.Created
    — nunca ve um arquivo que chegou por renomeacao.

    Ou seja: a protecao contra leitura parcial estava escondendo o arquivo do
    proprio RIP que ela deveria proteger.

    O que perdemos ao gravar direto e a atomicidade. O que ganhamos e o unico
    comportamento observado como funcional nesta maquina — arrastar pelo
    Explorer produz exatamente esta mesma sequencia de operacoes, e sempre deu
    certo, o que mostra que o Edge Print sabe lidar com um arquivo que ainda
    esta crescendo. A escrita sai numa unica chamada, a partir de bytes que ja
    estao na memoria, entao a janela e a menor possivel.

    Se algum dia um arquivo parcial for importado, o `metodo` permite trocar sem
    release novo do agente: "exclusivo" tranca o arquivo enquanto escreve.
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

    escolhido = (metodo or METODO_PADRAO).strip().lower()
    gravador = _GRAVADORES.get(escolhido)
    if gravador is None:
        print(f"[hotfolder] metodo '{escolhido}' desconhecido; usando '{METODO_PADRAO}'")
        escolhido = METODO_PADRAO
        gravador = _GRAVADORES[METODO_PADRAO]

    nome_final = sanitizar_nome(nome)

    with _lock_gravacao:
        # O nome livre e reivindicado pela propria criacao (O_EXCL / CREATE_NEW):
        # se outro processo tiver criado o arquivo entre a escolha e a criacao, a
        # chamada falha e tentamos o proximo nome. Isso mantem "nunca
        # sobrescrever" como garantia do sistema de arquivos, e nao como uma
        # checagem nossa que pode correr atrasada.
        destino = None
        for candidato in _nomes_candidatos(pasta, nome_final):
            try:
                gravador(candidato, dados)
                destino = candidato
                break
            except FileExistsError:
                continue
            except Exception:
                # Escrita interrompida no meio (disco cheio, share caiu). Com a
                # gravacao direta o arquivo ja esta na pasta COM O NOME FINAL e
                # incompleto — o RIP importaria lixo. Tem que sair daqui.
                _remover_silencioso(candidato)
                _remover_silencioso(candidato + ".tmp")
                raise

        if destino is None:
            raise OSError(f"nao consegui um nome livre para {nome_final} em {pasta}")

    return destino


def _remover_silencioso(caminho: str):
    try:
        if os.path.exists(caminho):
            os.remove(caminho)
    except Exception:
        pass


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
