"""A formula e o pool do QR Ideal.

O pool real tem 24 MB e nao esta no git. Estes testes montam um pool
sintetico de tamanho completo mas conteudo previsivel: o codigo da posicao
`idx` e o proprio `idx` em base 36, preenchido ate 8 caracteres. Assim da
para conferir qualquer celula sem carregar o arquivo de producao.
"""
import os
import sys
import tempfile

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import qr_ideal


def _base36(n: int) -> str:
    alfabeto = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    s = ""
    while n:
        n, r = divmod(n, 36)
        s = alfabeto[r] + s
    return (s or "0").rjust(qr_ideal.TAMANHO, "0")


@pytest.fixture(scope="module")
def pool_sintetico():
    """Pool completo (3.000.000 x 8 bytes) onde pool[idx] == base36(idx)."""
    fd, caminho = tempfile.mkstemp(suffix=".bin")
    os.close(fd)
    with open(caminho, "wb") as f:
        for bloco in range(0, qr_ideal.TOTAL, 100_000):
            fim = min(bloco + 100_000, qr_ideal.TOTAL)
            f.write(b"".join(_base36(i).encode("ascii") for i in range(bloco, fim)))
    yield caminho
    os.unlink(caminho)


def test_ultimos2_pega_os_dois_ultimos_digitos():
    assert qr_ideal.ultimos2(20272) == 72
    assert qr_ideal.ultimos2(1000022) == 22
    assert qr_ideal.ultimos2("20270") == 70
    assert qr_ideal.ultimos2(1000000) == 0


def test_coluna_do_exemplo_canonico():
    # 72 - 22 = 50. E o exemplo que o usuario deu e que foi conferido na planilha.
    assert qr_ideal.coluna_do_modelo(20272, 1000022) == 50


def test_coluna_de_diferenca_negativa_nao_sai_da_faixa():
    # 22 - 72 = -50, que sem o mod 100 nao seria coluna nenhuma.
    assert qr_ideal.coluna_do_modelo(20222, 1000072) == 50


def test_coluna_de_diferenca_zero_vira_100():
    # A subtracao crua nunca alcanca 100 (o maximo e 99); o zero ocupa esse lugar.
    assert qr_ideal.coluna_do_modelo(20222, 1000022) == 100


def test_coluna_fica_sempre_entre_1_e_100():
    for pedido in range(20200, 20300):
        for modelo in range(1000000, 1000100):
            c = qr_ideal.coluna_do_modelo(pedido, modelo)
            assert 1 <= c <= 100


def test_indice_do_exemplo_canonico():
    # coluna 50, item 7 -> (50-1)*30000 + 6
    assert qr_ideal.indice(20272, 1000022, 7) == 1_470_006


def test_item_acima_de_30000_avanca_para_a_coluna_seguinte():
    # O ingresso 30.001 da coluna 50 e a linha 1 da coluna 51.
    assert qr_ideal.indice(20272, 1000022, 30_001) == (
        qr_ideal.indice(20272, 1000022, 1) + qr_ideal.LINHAS
    )


def test_fim_do_pool_volta_para_o_comeco():
    # Coluna 100, item 30.001 passaria de 3.000.000: da a volta.
    assert qr_ideal.indice(20222, 1000022, 30_001) == 0


def test_codigo_le_a_posicao_certa_do_pool(pool_sintetico):
    pool = qr_ideal.PoolQR(pool_sintetico)
    assert pool.codigo(20272, 1000022, 7) == _base36(1_470_006)
    pool.fechar()


def test_conteudo_inverte_o_pedido_e_cola_o_codigo(pool_sintetico):
    pool = qr_ideal.PoolQR(pool_sintetico)
    esperado = "27202" + _base36(1_470_006)
    assert pool.conteudo(20272, 1000022, 7) == esperado
    pool.fechar()


def test_pedido_terminado_em_zero_mantem_o_zero_a_esquerda(pool_sintetico):
    # 20270 invertido e "07202". Tratar como numero destruiria o pedido.
    pool = qr_ideal.PoolQR(pool_sintetico)
    conteudo = pool.conteudo(20270, 1000022, 1)
    assert conteudo.startswith("07202")
    assert len(conteudo) == 5 + qr_ideal.TAMANHO
    pool.fechar()


def test_pool_de_tamanho_errado_e_recusado():
    fd, caminho = tempfile.mkstemp(suffix=".bin")
    os.close(fd)
    with open(caminho, "wb") as f:
        f.write(b"CURTO123")
    try:
        with pytest.raises(ValueError, match="tamanho"):
            qr_ideal.PoolQR(caminho)
    finally:
        os.unlink(caminho)
