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

COLUNAS = 100
LINHAS = 30_000
TAMANHO = 8
TOTAL = COLUNAS * LINHAS  # 3.000.000

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


def caminho_padrao() -> str:
    """Onde o pool mora: ao lado do executavel na estacao, na raiz em dev.

    Nao vai embutido no `NewProd.exe` de proposito. O agente e compilado
    `onefile`, e dado embutido e extraido para uma pasta temporaria a cada
    abertura — a estacao pagaria 24 MB de extracao toda vez que liga.
    """
    if getattr(sys, "frozen", False):
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

    def codigo(self, pedido, modelo, item: int) -> str:
        """Os 8 caracteres do pool para este ingresso."""
        idx = indice(pedido, modelo, item)
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
