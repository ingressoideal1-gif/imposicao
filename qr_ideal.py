"""QR Ideal — o codigo que a portaria le no ingresso.

Este modulo e a unica fonte da regra. Ele nao conhece PDF, nao conhece
FastAPI e nao conhece o editor: recebe (pedido, modelo, item) e devolve a
string que vai gravada no QR. Quem imprime, quem mostra na tela e quem
conferir amanha leem daqui, e por isso a regra nao pode divergir entre eles.

A regra:

    d      = (dois ultimos digitos do pedido - dois ultimos do modelo) mod 100
    coluna = 100 se d == 0, senao d
    idx    = ((coluna - 1) * 30.000 + (item - 1)) mod 3.000.000
    codigo = pool[idx]

O `mod 100` existe porque a subtracao crua vai de -99 a 99: metade das
combinacoes nao teria coluna, e a coluna 100 seria inalcancavel (a diferenca
maxima e 99).

O `mod 3.000.000` e a fita continua: o ingresso 30.001 cai naturalmente na
linha 1 da coluna seguinte, sem caso especial no codigo.

O que distingue este QR do elemento `QR` antigo e que aquele codifica o
numero sequencial — quem tem o ingresso 1234 imprime o 1235. Este codifica um
sorteio de 8 caracteres que so existe na planilha mestra.
"""
import hashlib
import os
import secrets
import sys
import threading

COLUNAS = 100
LINHAS = 30_000
TAMANHO = 8
TOTAL = COLUNAS * LINHAS  # 3.000.000
POOL_SHA256 = "8e30409786113d484103cb66f88080a99bb67530a4817c245789c8929da35174"
POOL_V2_SHA256 = "931cc39738a68b9eb814e3d9908962bd04e3782893234f881222a0526a6e6d51"
POOL_V2_NOME = "qr_ideal_pool_qr12_d1.bin"

NOME_ARQUIVO = "qr_ideal_pool.bin"

# Voltas do PBKDF2. Mexer aqui muda TODO hash ja publicado, e os ingressos que
# ja estao na mao dos clientes param de validar na portaria. So se mexe com
# migracao planejada dos dados existentes.
ITERACOES = 10_000


def ultimos2(n) -> int:
    """Os dois ultimos digitos de um numero, como inteiro."""
    return int(str(n).strip()[-2:])


def coluna_do_modelo(pedido, modelo) -> int:
    """A coluna do pool que atende este modelo dentro deste pedido (1..100)."""
    d = (ultimos2(pedido) - ultimos2(modelo)) % 100
    return COLUNAS if d == 0 else d


def indice(pedido, modelo, item: int) -> int:
    """A posicao do codigo no pool, contando coluna a coluna a partir de zero."""
    col = coluna_do_modelo(pedido, modelo)
    return ((col - 1) * LINHAS + (int(item) - 1)) % TOTAL


def prefixo(pedido) -> str:
    """O numero do pedido de tras para frente.

    String sempre: o pedido 20270 vira "07202", e converte-lo para inteiro o
    transformaria em 7202 — que invertido e outro pedido.
    """
    return str(pedido).strip()[::-1]


def prefixo_modelo(modelo) -> str:
    texto = str(modelo).strip()
    if not texto.isascii() or not texto.isdigit():
        raise ValueError("QR Ideal: modelo invalido")
    return texto[-4:].zfill(4)[::-1]


def indice_contrato(pedido, modelo, item, contrato):
    if str(contrato.get("pedido")) != str(pedido) or str(contrato.get("modelo")) != str(modelo):
        raise ValueError("QR Ideal: contrato de outro pedido/modelo")
    versao = contrato.get("versao")
    pos = int(item) - int(contrato["inicio"])
    capacidade = int(contrato["capacidade"])
    if not 0 <= pos < capacidade:
        raise ValueError("QR Ideal: numero fora da reserva; confira o inicio e a tiragem")
    if versao == 1 and contrato.get("pool_revisao") == "ideal-master-1":
        return indice(pedido, modelo, item)
    if versao != 2 or contrato.get("pool_revisao") != "ideal-qr12-d1":
        raise ValueError("QR Ideal: contrato exige atualizacao da estacao")
    offset = int(contrato["deslocamento"])
    if not (0 <= pos < capacidade and 0 <= offset and offset + capacidade <= TOTAL):
        raise ValueError("QR Ideal: numero fora da reserva; nenhuma volta da base e permitida")
    return offset + pos


def caminho_padrao() -> str:
    """Onde o pool mora: ao lado do executavel na estacao, na raiz em dev.

    Nao vai embutido no `NewProd.exe` de proposito. O agente e compilado
    `onefile`, e dado embutido e extraido para uma pasta temporaria a cada
    abertura — a estacao pagaria 24 MB de extracao toda vez que liga.
    """
    if getattr(sys, "frozen", False):
        from migracao_estacao import pasta_dados
        protegido = pasta_dados() / NOME_ARQUIVO
        if protegido.is_file():
            return str(protegido)
        base = os.path.dirname(sys.executable)
    else:
        base = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(base, NOME_ARQUIVO)


def gerar_sal() -> str:
    """32 bytes sorteados, em hexadecimal. Um por pedido, nunca reaproveitado.

    Nao e segredo: o celular da portaria baixa o sal junto com a faixa do
    evento. O que ele faz e impedir que o mesmo codigo do pool produza o mesmo
    hash em eventos diferentes. Como o pool e reutilizado por desenho, sem sal
    por pedido daria para correlacionar eventos so olhando o banco.
    """
    return secrets.token_hex(32)


def hash_codigo(conteudo: str, sal: str) -> str:
    """O que a nuvem guarda no lugar do codigo. O codigo em si nunca sai daqui.

    `conteudo` e o texto INTEIRO do QR — prefixo do pedido mais os 8 caracteres
    do pool —, e nao so o codigo. E isso que impede a colisao de coluna entre
    dois pedidos de virar colisao de verdade na portaria.

    PBKDF2-HMAC-SHA256 porque existe pronto nos dois lados que precisam dele:
    `hashlib` aqui, `crypto.subtle.deriveBits` no navegador. Nenhuma dependencia
    nova, nem no agente nem no celular.

    A 10.000 voltas, uma leitura no celular custa milissegundos e uma busca por
    forca bruta custa 2,8 x 10^16 operacoes por pedido — quer dizer, um
    vazamento do banco nao entrega codigo nenhum.

    ARMADILHA: o sal entra como os BYTES do hexadecimal, nao como o texto dele.
    O navegador tem de fazer a mesma coisa. E o erro mais facil de cometer aqui,
    e ele so apareceria na portaria do evento.
    """
    return hashlib.pbkdf2_hmac(
        "sha256",
        conteudo.encode("utf-8"),
        bytes.fromhex(sal),
        ITERACOES,
        dklen=32,
    ).hex()


class PoolQR:
    """Leitura do pool por posicao direta, com o arquivo aberto uma vez so.

    Uma tiragem de 10.000 ingressos faz 10.000 leituras; abrir e fechar o
    arquivo a cada uma seria desperdicio num caminho que o operador espera de
    pe na frente da impressora.
    """

    def __init__(self, caminho: str | None = None):
        self.caminho = caminho or caminho_padrao()
        if not os.path.exists(self.caminho):
            raise FileNotFoundError(
                f"Pool do QR Ideal nao encontrado em {self.caminho}. "
                "Sem ele nao ha como imprimir QR Ideal."
            )
        tamanho = os.path.getsize(self.caminho)
        if tamanho != TOTAL * TAMANHO:
            raise ValueError(
                f"Pool do QR Ideal com tamanho errado: {tamanho} bytes, "
                f"esperado {TOTAL * TAMANHO}."
            )
        self._f = open(self.caminho, "rb")
        self._lock = threading.Lock()
        self._sha_conferido = None

    def verificar_integridade(self, esperado=POOL_SHA256):
        with self._lock:
            if self._sha_conferido is None:
                self._f.seek(0)
                self._sha_conferido = hashlib.file_digest(self._f, "sha256").hexdigest()
            if self._sha_conferido != esperado:
                raise ValueError("QR Ideal: integridade da base privada nao confirmada")

    def codigo(self, pedido, modelo, item: int) -> str:
        """Os 8 caracteres do pool para este ingresso."""
        idx = indice(pedido, modelo, item)
        return self.codigo_indice(idx)

    def codigo_indice(self, idx: int) -> str:
        if not 0 <= idx < TOTAL:
            raise ValueError("QR Ideal: posicao fora da base")
        with self._lock:
            self._f.seek(idx * TAMANHO)
            bruto = self._f.read(TAMANHO)
        if len(bruto) != TAMANHO:
            raise ValueError(f"Leitura curta do pool na posicao {idx}.")
        return bruto.decode("ascii")

    def conteudo(self, pedido, modelo, item: int) -> str:
        """O que fica gravado no QR: pedido invertido + codigo, sem separador.

        A leitura na portaria desfaz assim: os 8 ultimos caracteres sao o
        codigo, e o resto invertido e o pedido. O tamanho fixo do codigo torna
        a separacao nao-ambigua para qualquer numero de digitos do pedido.
        """
        return prefixo(pedido) + self.codigo(pedido, modelo, item)

    def fechar(self):
        if getattr(self, "_f", None):
            self._f.close()
            self._f = None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.fechar()


class PoolComContratos:
    """Contrato obtido antes de gerar qualquer PDF; nenhum fallback de versão."""
    def __init__(self, pool, contratos, pool_v2=None):
        self.pool = pool
        self.pool_v2 = pool_v2
        self.contratos = {(str(c["pedido"]), str(c["modelo"])): dict(c) for c in contratos}

    def contrato(self, pedido, modelo):
        c = self.contratos.get((str(pedido), str(modelo)))
        if c is None:
            raise ValueError("QR Ideal: contrato de emissao ausente; conecte a estacao para conferir o modelo")
        return c

    def codigo(self, pedido, modelo, item):
        c = self.contrato(pedido, modelo)
        base = self.pool_v2 if c["versao"] == 2 else self.pool
        if base is None:
            raise ValueError("QR Ideal: base privada da versao contratada indisponivel")
        return base.codigo_indice(indice_contrato(pedido, modelo, item, c))

    def conteudo(self, pedido, modelo, item):
        c = self.contrato(pedido, modelo)
        pref = prefixo_modelo(modelo) if c["versao"] == 2 else prefixo(pedido)
        return pref + self.codigo(pedido, modelo, item)
