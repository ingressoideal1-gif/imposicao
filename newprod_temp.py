"""Temporarios exclusivos do NewProd, com trava por trabalho e telemetria agregada.

Importar este modulo nao cria pastas, inicia threads ou acessa a rede.
Nunca exclui arquivos da pasta TEMP geral, caches ou pacotes _MEI.
"""
import copy
import os
from pathlib import Path
import re
import shutil
import stat
import tempfile
import threading
import time
import uuid

RETENCAO_SEGUNDOS = 24 * 3600
INTERVALO_LIMPEZA = 3600
INTERVALO_DIAGNOSTICO = 300
MARCADOR = b"NewProd temporary workspace v1\n"
_JOB = re.compile(r"job-[0-9a-f]{32}\Z")
_mutex = threading.RLock()
_limpeza_mutex = threading.RLock()
_thread = None
_diagnostico = {"estado": "aguardando coleta"}


def pasta_raiz():
    base = os.environ.get("LOCALAPPDATA") or tempfile.gettempdir()
    return Path(base) / "NewProd Agent" / "temporarios" / "v1"


def _sem_links(path):
    """Recusa links, junctions e qualquer outro reparse point nos ancestrais."""
    path = Path(os.path.abspath(path))
    for parte in (path, *path.parents):
        try:
            s = parte.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(s.st_mode) or getattr(s, "st_file_attributes", 0) & 0x400:
            return False
    return True


def _travar(handle):
    handle.seek(0)
    if os.name == "nt":
        import msvcrt
        msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
    else:
        import fcntl
        fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)


def pasta_do_trabalho(arquivo):
    """Conversoes auxiliares acompanham a entrada somente se ela for gerenciada."""
    pasta = Path(os.path.abspath(arquivo)).parent
    raiz = Path(os.path.abspath(pasta_raiz()))
    if (pasta.parent == raiz and _JOB.fullmatch(pasta.name)
            and _sem_links(pasta) and (pasta / ".owner.lock").is_file()):
        return str(pasta)
    return None


def _apagar_arquivos(pasta, raiz):
    """Somente filhos regulares de um job direto da raiz validada. Sem rmtree."""
    pasta, raiz = Path(pasta), Path(raiz)
    if (pasta.parent != raiz or not _JOB.fullmatch(pasta.name)
            or not _sem_links(pasta) or pasta.resolve().parent != raiz.resolve()):
        raise OSError("Pasta temporaria fora do escopo")
    entradas = list(pasta.iterdir())
    # Falha fechada: um diretorio inesperado ou link preserva o trabalho inteiro.
    if any(not _sem_links(p) or not p.is_file() for p in entradas):
        raise OSError("Conteudo inesperado na pasta temporaria")
    apagados = 0
    for p in entradas:
        if p.name != ".owner.lock":
            tamanho = p.stat().st_size
            p.unlink()
            apagados += tamanho
    return apagados


class TrabalhoTemporario:
    def __init__(self, raiz=None):
        self.raiz = Path(os.path.abspath(raiz or pasta_raiz()))
        if not _sem_links(self.raiz):
            raise OSError("Raiz temporaria contem link")
        self.raiz.mkdir(parents=True, exist_ok=True)
        self.pasta = self.raiz / ("job-" + uuid.uuid4().hex)
        self.pasta.mkdir()
        self._handle = open(self.pasta / ".owner.lock", "x+b")
        try:
            self._handle.write(MARCADOR)
            self._handle.flush()
            _travar(self._handle)
        except BaseException:
            self._handle.close()
            raise

    def arquivo(self, suffix=".pdf"):
        return tempfile.NamedTemporaryFile(delete=False, suffix=suffix, dir=self.pasta)

    def caminho(self, nome):
        # Impede caminhos absolutos, ADS do Windows e saida da pasta do trabalho.
        nome = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', str(nome)).strip(' .')
        if not nome:
            nome = "saida.pdf"
        if re.match(r"^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)", nome, re.I):
            nome = "_" + nome
        return str(self.pasta / nome)

    def close(self):
        with _limpeza_mutex:
            if self._handle.closed:
                return
            ok = False
            try:
                _apagar_arquivos(self.pasta, self.raiz)
                ok = True
            except OSError:
                # Mantem o marcador para a recuperacao futura; nunca mascara o job.
                pass
            finally:
                self._handle.close()
            if ok:
                try:
                    (self.pasta / ".owner.lock").unlink()
                    self.pasta.rmdir()
                except OSError:
                    pass

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.close()


def limpar_abandonados(raiz=None, agora=None):
    raiz = Path(os.path.abspath(raiz or pasta_raiz()))
    agora = time.time() if agora is None else agora
    r = {"trabalhos_removidos": 0, "bytes_removidos": 0, "ativos": 0, "erros": 0}
    if not _sem_links(raiz):
        r["erros"] = 1
        return r
    if not raiz.exists():
        return r
    with _limpeza_mutex:
        for pasta in raiz.iterdir():
            if not _JOB.fullmatch(pasta.name):
                continue
            handle = None
            try:
                marcador = pasta / ".owner.lock"
                if not _sem_links(marcador) or not marcador.is_file():
                    continue
                if agora - marcador.stat().st_mtime < RETENCAO_SEGUNDOS:
                    continue
                handle = open(marcador, "r+b")
                try:
                    _travar(handle)
                except OSError:
                    r["ativos"] += 1
                    continue
                handle.seek(0)
                if handle.read(len(MARCADOR) + 1) != MARCADOR:
                    continue
                r["bytes_removidos"] += _apagar_arquivos(pasta, raiz)
                handle.close()
                marcador.unlink()
                pasta.rmdir()
                r["trabalhos_removidos"] += 1
            except OSError:
                r["erros"] += 1
            finally:
                if handle is not None:
                    handle.close()
    return r


def medir_pasta(raiz, limite_arquivos=100000, limite_segundos=5):
    """Inventario limitado de metadados; nao publica nomes nem caminhos de arquivos."""
    raiz = Path(raiz)
    r = {"bytes": 0, "arquivos": 0, "bytes_mais_7_dias": 0,
         "bytes_mais_30_dias": 0, "parcial": False, "erros": 0,
         "links_ignorados": 0, "categorias": {}}
    inicio, agora = time.monotonic(), time.time()
    if not _sem_links(raiz):
        r.update(parcial=True, links_ignorados=1)
        return r
    if not raiz.exists():
        r["ausente"] = True
        return r
    pilha = [(raiz, False)]
    visitados = 0
    while pilha:
        pasta, mei = pilha.pop()
        try:
            with os.scandir(pasta) as entradas:
                for e in entradas:
                    visitados += 1
                    if visitados > limite_arquivos or time.monotonic() - inicio > limite_segundos:
                        r["parcial"] = True
                        return r
                    try:
                        s = e.stat(follow_symlinks=False)
                        if e.is_symlink() or getattr(s, "st_file_attributes", 0) & 0x400:
                            r["links_ignorados"] += 1
                            continue
                        em_mei = mei or (pasta == raiz and e.name.startswith("_MEI"))
                        if e.is_dir(follow_symlinks=False):
                            pilha.append((Path(e.path), em_mei))
                            continue
                        if not stat.S_ISREG(s.st_mode):
                            continue
                        tipo = ("pacotes_mei" if em_mei else
                                "fontes_tmp" if e.name.lower().startswith("tmp") and e.name.lower().endswith(".ttf") else
                                "pdf" if e.name.lower().endswith(".pdf") else "outros")
                        r["categorias"][tipo] = r["categorias"].get(tipo, 0) + s.st_size
                        r["bytes"] += s.st_size
                        r["arquivos"] += 1
                        if agora - s.st_mtime > 7 * 86400:
                            r["bytes_mais_7_dias"] += s.st_size
                        if agora - s.st_mtime > 30 * 86400:
                            r["bytes_mais_30_dias"] += s.st_size
                    except OSError:
                        r["erros"] += 1
                        r["parcial"] = True
        except OSError:
            r["erros"] += 1
            r["parcial"] = True
    return r


def coletar_diagnostico():
    local = Path(os.environ.get("LOCALAPPDATA") or tempfile.gettempdir())
    temp = Path(tempfile.gettempdir())
    disco = shutil.disk_usage(temp)
    return {
        "estado": "coletado", "coletado_em": time.time(),
        "disco_temp_livre_bytes": disco.free, "disco_temp_total_bytes": disco.total,
        "disco_temp_critico": disco.free < 2 * 1024**3,
        "retencao_abandonados_horas": 24,
        "gerenciados": medir_pasta(pasta_raiz()),
        "temp_usuario": medir_pasta(temp),
        "cache_fontes": medir_pasta(local / "NewProd Agent" / "fonts_cache"),
        "cache_fotos": medir_pasta(local / "NewProd" / "cache" / "fotos"),
        "temp_geral_somente_leitura": True,
    }


def diagnostico():
    with _mutex:
        return copy.deepcopy(_diagnostico)


def iniciar_manutencao():
    """Uma thread por processo; a varredura nunca roda dentro do heartbeat."""
    global _thread
    with _mutex:
        if _thread is not None and _thread.is_alive():
            return

        def executar():
            global _diagnostico
            proxima_limpeza = 0
            ultima_limpeza = None
            while True:
                try:
                    if time.monotonic() >= proxima_limpeza:
                        ultima_limpeza = limpar_abandonados()
                        ultima_limpeza["executada_em"] = time.time()
                        proxima_limpeza = time.monotonic() + INTERVALO_LIMPEZA
                    novo = coletar_diagnostico()
                    novo["ultima_limpeza"] = ultima_limpeza
                except Exception as exc:
                    novo = {"estado": "falha na coleta", "erro_tipo": type(exc).__name__,
                            "coletado_em": time.time(), "ultima_limpeza": ultima_limpeza}
                with _mutex:
                    _diagnostico = novo
                time.sleep(INTERVALO_DIAGNOSTICO)

        _thread = threading.Thread(target=executar, daemon=True, name="NewProdTemporarios")
        _thread.start()
