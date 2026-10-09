"""Piloto isolado: integridade de pacotes locais, sem rede ou impressão.

Desativado por padrão. A validação comprova somente as dependências declaradas;
não concede aprovação, reserva de modelo ou autorização de execução offline.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import tempfile
from contextlib import contextmanager


class PacoteInvalido(ValueError):
    pass


LIMITE_RECURSO_BYTES = 256 * 1024 * 1024
LIMITE_TOTAL_BYTES = 256 * 1024 * 1024


class LimiteRecursoExcedido(PacoteInvalido):
    """Detalhe público composto somente por identidade e tamanhos, sem URLs."""
    def __init__(self, tamanho, limite, modelo, escopo='arquivo'):
        self.detalhe = {'codigo': 'limite_recurso', 'tamanho_bytes': tamanho,
                        'limite_bytes': limite, 'escopo': escopo,
                        'modelo': str(modelo) if re.fullmatch(r'[1-9][0-9]{0,14}', str(modelo)) else ''}
        super().__init__(f'Limite de {escopo} excedido: {tamanho} bytes; máximo {limite} bytes.')


def _json(valor):
    return json.dumps(valor, ensure_ascii=False, sort_keys=True,
                      separators=(",", ":"), allow_nan=False)


def _manifesto(valor):
    m = json.loads(_json(valor))  # cópia independente do chamador
    if not isinstance(m, dict) or type(m.get("schema")) is not int or m["schema"] != 1:
        raise PacoteInvalido("Schema de pacote não suportado.")
    for campo in ("empresa", "modelo", "revisao"):
        if not isinstance(m.get(campo), str) or not m[campo].strip():
            raise PacoteInvalido("Identidade incompleta: " + campo)
    if not isinstance(m.get("configuracao"), dict):
        raise PacoteInvalido("Configuração da revisão ausente.")
    arquivos = m.get("arquivos")
    if not isinstance(arquivos, dict) or not {"frente", "verso"} <= arquivos.keys():
        raise PacoteInvalido("Declare frente e verso, inclusive ausência intencional.")
    for nome, info in arquivos.items():
        if not isinstance(nome, str) or not nome:
            raise PacoteInvalido("Nome de recurso inválido.")
        if info is None and nome in ("frente", "verso"):
            continue
        if not isinstance(info, dict) or set(info) != {"sha256", "bytes"}:
            raise PacoteInvalido("Recurso incompleto: " + nome)
        if not isinstance(info["sha256"], str) or not re.fullmatch(r"[a-f0-9]{64}", info["sha256"]):
            raise PacoteInvalido("Hash inválido: " + nome)
        if type(info["bytes"]) is not int or info["bytes"] <= 0:
            raise PacoteInvalido("Tamanho inválido: " + nome)
    return m


def _hash_arquivo(caminho, checkpoint=None):
    digest = hashlib.sha256()
    tamanho = 0
    with caminho.open("rb") as entrada:
        for bloco in iter(lambda: entrada.read(1024 * 1024), b""):
            if checkpoint:
                checkpoint()
            tamanho += len(bloco)
            digest.update(bloco)
    return digest.hexdigest(), tamanho


def _sem_links(caminho):
    for parte in (caminho, *caminho.parents):
        if parte.is_symlink() or (hasattr(parte, "is_junction") and parte.is_junction()):
            raise PacoteInvalido("O armazenamento não aceita links ou junctions.")


class ArmazemPacotes:
    def __init__(self, raiz, *, habilitado=False, reserva_bytes=1024 ** 3):
        self.raiz = Path(os.path.abspath(raiz))
        self.habilitado = habilitado
        if type(reserva_bytes) is not int or reserva_bytes < 0:
            raise ValueError("Reserva de disco inválida.")
        self.reserva_bytes = reserva_bytes

    def _pasta(self, empresa):
        if not self.habilitado:
            raise RuntimeError("Preparação local desativada.")
        if not isinstance(empresa, str) or not empresa.strip():
            raise PacoteInvalido("Empresa ausente.")
        pasta = self.raiz / hashlib.sha256(empresa.encode()).hexdigest()
        _sem_links(pasta)
        return pasta

    def _conectar(self, pasta):
        pasta.mkdir(parents=True, exist_ok=True)
        _sem_links(pasta / "indice.sqlite3")
        con = sqlite3.connect(pasta / "indice.sqlite3", timeout=15)
        con.execute("PRAGMA synchronous=FULL")
        con.execute("CREATE TABLE IF NOT EXISTS pacotes (modelo TEXT NOT NULL, "
                    "revisao TEXT NOT NULL, manifesto TEXT NOT NULL, "
                    "PRIMARY KEY (modelo, revisao))")
        return con

    def preparar(self, manifesto, fontes, *, checkpoint=None):
        """Fontes são caminhos locais explícitos; nenhum download é disparado."""
        pasta = self._pasta(manifesto.get("empresa"))
        m = _manifesto(manifesto)
        serializado = _json(m)
        con = self._conectar(pasta)
        try:
            # Conferência antecipada; a disputa pela mesma revisão é resolvida
            # novamente na transação curta de registro, depois das cópias.
            existente = con.execute("SELECT manifesto FROM pacotes WHERE modelo=? AND revisao=?",
                                    (m["modelo"], m["revisao"])).fetchone()
            if existente and existente[0] != serializado:
                raise PacoteInvalido("Revisão imutável: alterações exigem nova revisão.")
            objetos = pasta / "objetos"
            _sem_links(objetos)
            objetos.mkdir(exist_ok=True)
            for nome, info in m["arquivos"].items():
                if checkpoint:
                    checkpoint()
                if info is None:
                    continue
                destino = objetos / info["sha256"]
                _sem_links(destino)
                esperado = (info["sha256"], info["bytes"])
                if destino.is_file() and _hash_arquivo(destino, checkpoint) == esperado:
                    continue
                if nome not in fontes:
                    raise PacoteInvalido("Recurso não disponível: " + nome)
                if shutil.disk_usage(pasta).free < info["bytes"] + self.reserva_bytes:
                    raise OSError("Espaço insuficiente; preparação pausada.")
                temporario = None
                try:
                    with tempfile.NamedTemporaryFile(dir=objetos, prefix="parcial-", delete=False) as saida:
                        temporario = Path(saida.name)
                        tamanho = 0
                        digest = hashlib.sha256()
                        with Path(fontes[nome]).open("rb") as entrada:
                            for bloco in iter(lambda: entrada.read(1024 * 1024), b""):
                                if checkpoint:
                                    checkpoint()
                                tamanho += len(bloco)
                                if tamanho > info["bytes"]:
                                    raise PacoteInvalido("Recurso maior que o declarado: " + nome)
                                digest.update(bloco)
                                saida.write(bloco)
                        if (digest.hexdigest(), tamanho) != esperado:
                            raise PacoteInvalido("Integridade divergente: " + nome)
                        saida.flush()
                        os.fsync(saida.fileno())
                    # Publicacao atomica sem sobrescrever: dois modelos podem
                    # compartilhar estes bytes. No Windows, substituir o
                    # objeto enquanto outro leitor o abre causa WinError 5.
                    try:
                        os.link(temporario, destino)
                    except FileExistsError:
                        _sem_links(destino)
                        if _hash_arquivo(destino, checkpoint) != esperado:
                            # Reparar corrupcao continua permitido. Se outro
                            # preparador reparou primeiro e um leitor abriu o
                            # objeto, so aceitar os bytes integralmente validos.
                            try:
                                os.replace(temporario, destino)
                            except PermissionError:
                                _sem_links(destino)
                                if _hash_arquivo(destino, checkpoint) != esperado:
                                    raise
                finally:
                    if temporario is not None and temporario.exists():
                        temporario.unlink()  # somente o parcial criado nesta chamada
            # Não esperar ociosidade enquanto mantém o bloqueio de escrita.
            # Objetos são endereçados pelo hash e só entram completos no índice.
            con.execute("BEGIN IMMEDIATE")
            concorrente = con.execute("SELECT manifesto FROM pacotes WHERE modelo=? AND revisao=?",
                                      (m["modelo"], m["revisao"])).fetchone()
            if concorrente and concorrente[0] != serializado:
                raise PacoteInvalido("Revisão imutável: alterações exigem nova revisão.")
            con.execute("INSERT OR IGNORE INTO pacotes VALUES (?, ?, ?)",
                        (m["modelo"], m["revisao"], serializado))
            con.commit()
        except BaseException:
            con.rollback()
            raise
        finally:
            con.close()
        return self.consultar(m["empresa"], m["modelo"], m["revisao"], checkpoint=checkpoint)

    def consultar(self, empresa, modelo, revisao, *, revisao_online=None, checkpoint=None, verificar_bytes=True):
        resultado = {"estado": "desativado", "origem": None,
                     "autorizado_offline": False, "revisao": revisao}
        if not self.habilitado:
            return resultado
        pasta = self._pasta(empresa)
        banco = pasta / "indice.sqlite3"
        _sem_links(banco)
        resultado["estado"] = "sem_copia"
        if not banco.exists():
            return resultado
        con = None
        try:
            con = sqlite3.connect(banco.as_uri() + "?mode=ro", uri=True)
            linha = con.execute("SELECT manifesto FROM pacotes WHERE modelo=? AND revisao=?",
                                (modelo, revisao)).fetchone()
        except sqlite3.DatabaseError:
            resultado["estado"] = "falha_validacao"
            return resultado
        finally:
            if con is not None:
                con.close()
        if not linha:
            return resultado
        try:
            m = _manifesto(json.loads(linha[0]))
            if (m["empresa"], m["modelo"], m["revisao"]) != (empresa, modelo, revisao):
                raise PacoteInvalido("Identidade divergente no índice.")
            for info in m["arquivos"].values():
                if info is not None:
                    arquivo = pasta / "objetos" / info["sha256"]
                    _sem_links(arquivo)
                    if (verificar_bytes and _hash_arquivo(arquivo, checkpoint) != (info["sha256"], info["bytes"])) or (
                            not verificar_bytes and arquivo.stat().st_size != info['bytes']):
                        raise PacoteInvalido("Arquivo alterado no disco.")
        except (OSError, ValueError, TypeError, KeyError):
            resultado["estado"] = "falha_validacao"
            return resultado
        resultado.update(estado="local_validado", origem="local",
                         atualidade_online="desconhecida" if revisao_online is None else "confirmada")
        if revisao_online is not None and revisao_online != revisao:
            resultado.update(estado="atualizacao_pendente", atualidade_online="desatualizada")
        return resultado

    def ler_recurso(self, empresa, modelo, revisao, nome):
        """Snapshot limitado aos bytes efetivamente conferidos nesta leitura."""
        pasta = self._pasta(empresa)
        banco = pasta / 'indice.sqlite3'
        _sem_links(banco)
        con = sqlite3.connect(banco.as_uri() + '?mode=ro', uri=True)
        try:
            row = con.execute('SELECT manifesto FROM pacotes WHERE modelo=? AND revisao=?',
                              (modelo, revisao)).fetchone()
        finally:
            con.close()
        if not row:
            raise PacoteInvalido('Pacote ausente.')
        m = _manifesto(json.loads(row[0]))
        if (m['empresa'], m['modelo'], m['revisao']) != (empresa, modelo, revisao):
            raise PacoteInvalido('Identidade divergente.')
        info = m['arquivos'].get(nome)
        if not info:
            raise PacoteInvalido('Recurso ausente.')
        if info['bytes'] > LIMITE_RECURSO_BYTES:
            raise LimiteRecursoExcedido(info['bytes'], LIMITE_RECURSO_BYTES, modelo)
        caminho = pasta / 'objetos' / info['sha256']
        _sem_links(caminho)
        with caminho.open('rb') as f:
            dados = f.read(info['bytes'] + 1)
        if len(dados) != info['bytes'] or hashlib.sha256(dados).hexdigest() != info['sha256']:
            raise PacoteInvalido('Recurso alterado.')
        return dados

    def resolver_para_motor(self, empresa, modelo, revisao):
        """Leitor fechado das dependências declaradas; não autoriza impressão.

        `configuracao.recursos_motor` vincula origem exata a nome de recurso.
        Não interpreta origem como URL nem como caminho local. Hash é refeito
        a cada leitura; o motor mantém seu cache privado durante a geração.
        """
        if self.consultar(empresa, modelo, revisao)['estado'] != 'local_validado':
            raise PacoteInvalido('Pacote não validado.')
        pasta = self._pasta(empresa)
        banco = pasta / 'indice.sqlite3'
        _sem_links(banco)
        con = sqlite3.connect(banco.as_uri() + '?mode=ro', uri=True)
        try:
            linha = con.execute('SELECT manifesto FROM pacotes WHERE modelo=? AND revisao=?',
                                (modelo, revisao)).fetchone()
        finally:
            con.close()
        if not linha:
            raise PacoteInvalido('Pacote ausente.')
        m = _manifesto(json.loads(linha[0]))
        if (m['empresa'], m['modelo'], m['revisao']) != (empresa, modelo, revisao):
            raise PacoteInvalido('Identidade divergente.')
        mapa = m['configuracao'].get('recursos_motor')
        if not isinstance(mapa, dict) or any(
                not isinstance(origem, str) or not origem or not isinstance(nome, str)
                or not m['arquivos'].get(nome) for origem, nome in mapa.items()):
            raise PacoteInvalido('Mapa de dependências ausente ou inválido.')

        def resolver(origem):
            if origem not in mapa:
                raise PacoteInvalido('Dependência não declarada no pacote local.')
            info = m['arquivos'][mapa[origem]]
            if info['bytes'] > LIMITE_RECURSO_BYTES:
                raise LimiteRecursoExcedido(info['bytes'], LIMITE_RECURSO_BYTES, modelo)
            arquivo = pasta / 'objetos' / info['sha256']
            _sem_links(arquivo)
            with arquivo.open('rb') as entrada:
                dados = entrada.read(info['bytes'] + 1)
            if len(dados) != info['bytes'] or hashlib.sha256(dados).hexdigest() != info['sha256']:
                raise PacoteInvalido('Dependência local alterada.')
            return dados
        return resolver

    @contextmanager
    def pdf_para_motor(self, empresa, modelo, revisao, nome='frente'):
        """Cópia temporária validada com extensão PDF; não concede autorização."""
        if self.consultar(empresa, modelo, revisao)['estado'] != 'local_validado':
            raise PacoteInvalido('Pacote não validado.')
        pasta = self._pasta(empresa)
        con = sqlite3.connect((pasta / 'indice.sqlite3').as_uri() + '?mode=ro', uri=True)
        try:
            linha = con.execute('SELECT manifesto FROM pacotes WHERE modelo=? AND revisao=?',
                                (modelo, revisao)).fetchone()
        finally:
            con.close()
        m = _manifesto(json.loads(linha[0]))
        info = m['arquivos'].get(nome)
        if not info:
            raise PacoteInvalido('Face sem recurso PDF.')
        origem = pasta / 'objetos' / info['sha256']
        _sem_links(origem)
        with origem.open('rb') as entrada:
            if entrada.read(5) != b'%PDF-':
                raise PacoteInvalido('Recurso não é um PDF.')
        if shutil.disk_usage(pasta).free < info['bytes'] + self.reserva_bytes:
            raise OSError('Espaço insuficiente para cópia de execução.')
        temporario = None
        try:
            with tempfile.NamedTemporaryFile(dir=pasta, prefix='execucao-', suffix='.pdf', delete=False) as saida:
                temporario = Path(saida.name)
                with origem.open('rb') as entrada:
                    tamanho = 0
                    while True:
                        bloco = entrada.read(min(1024 * 1024, info['bytes'] - tamanho + 1))
                        if not bloco:
                            break
                        tamanho += len(bloco)
                        if tamanho > info['bytes']:
                            raise PacoteInvalido('Recurso cresceu durante materialização.')
                        saida.write(bloco)
                saida.flush()
                os.fsync(saida.fileno())
            if _hash_arquivo(temporario) != (info['sha256'], info['bytes']):
                raise PacoteInvalido('Recurso mudou durante materialização.')
            yield temporario
        finally:
            if temporario is not None and temporario.exists():
                temporario.unlink()

    def prever_limpeza(self, empresa, elegiveis, protegidos):
        """Só prévia: elegibilidade/retenção vem do operador, proteção é obrigatória.

        Chamador deve incluir pacotes ativos, incertos e com eventos pendentes.
        Nunca executa exclusão; não presume prazo de retenção ou conclusão física.
        """
        pasta = self._pasta(empresa)
        banco = pasta / 'indice.sqlite3'
        _sem_links(banco)
        if not banco.exists():
            return {'pacotes': [], 'objetos': [], 'bytes_recuperaveis': 0, 'simulacao': True}
        con = sqlite3.connect(banco.as_uri() + '?mode=ro', uri=True)
        try:
            linhas = con.execute('SELECT modelo,revisao,manifesto FROM pacotes').fetchall()
        finally:
            con.close()
        elegiveis, protegidos = set(elegiveis), set(protegidos)
        apagar, usados, candidatos = [], set(), {}
        for modelo, revisao, serializado in linhas:
            m = _manifesto(json.loads(serializado))
            if m['empresa'] != empresa:
                raise PacoteInvalido('Empresa divergente no índice.')
            remover = (modelo, revisao) in elegiveis and (modelo, revisao) not in protegidos
            if remover:
                apagar.append({'modelo': modelo, 'revisao': revisao})
            for info in m['arquivos'].values():
                if info is not None:
                    if remover:
                        candidatos[info['sha256']] = info['bytes']
                    else:
                        usados.add(info['sha256'])
        objetos = []
        for digest, tamanho in candidatos.items():
            arquivo = pasta / 'objetos' / digest
            _sem_links(arquivo)
            if digest not in usados and arquivo.is_file():
                objetos.append({'sha256': digest, 'bytes': arquivo.stat().st_size})
        return {'pacotes': apagar, 'objetos': objetos,
                'bytes_recuperaveis': sum(item['bytes'] for item in objetos), 'simulacao': True}
