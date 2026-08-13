# -*- coding: utf-8 -*-
"""O QR Ideal no papel: o PDF carrega exatamente a string esperada.

A prova nao usa decodificador de QR — nenhuma biblioteca nova entra por causa
de teste. Ela extrai a imagem que o motor embutiu no PDF e compara os PIXELS
com os de `_generate_qr(conteudo_esperado)`. Comparar bytes nao serve: o
PyMuPDF reencoda o PNG ao gravar, e os bytes saem diferentes mesmo quando a
imagem e a mesma. Os pixels, esses, batem — e se o motor tivesse calculado
outro codigo, o desenho seria outro.

O pool real tem 24 MB e nao esta no git, entao estes testes montam um pool
sintetico de tamanho completo onde pool[idx] == base36(idx).
"""
import io
import os
import sys
import tempfile

import fitz
import pytest
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import qr_ideal
from engine import ImpositionConfig, ImpositionEngine, _generate_qr


def _base36(n: int) -> str:
    alfabeto = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    s = ""
    while n:
        n, r = divmod(n, 36)
        s = alfabeto[r] + s
    return (s or "0").rjust(qr_ideal.TAMANHO, "0")


@pytest.fixture(scope="module")
def pool_sintetico():
    fd, caminho = tempfile.mkstemp(suffix=".bin")
    os.close(fd)
    with open(caminho, "wb") as f:
        for bloco in range(0, qr_ideal.TOTAL, 100_000):
            fim = min(bloco + 100_000, qr_ideal.TOTAL)
            f.write(b"".join(_base36(i).encode("ascii") for i in range(bloco, fim)))
    yield caminho
    os.unlink(caminho)


FORMATO = {
    "name": "Ticket 100x50",
    "width_mm": 100,
    "height_mm": 50,
    "cols": 2,
    "rows": 2,
    "gap_h_mm": 0,
    "gap_v_mm": 0,
    "offset_h_mm": 0,
    "offset_v_mm": 0,
    "rotations": {},
}

SAIDA = {"name": "A3", "width_mm": 300, "height_mm": 300}


def _numeracao():
    return {
        "tipo": "SEQUENCIAL",
        "elements": [
            {
                "id": "e1",
                "type": "QR_IDEAL",
                "x_mm": 50,
                "y_mm": 25,
                "size_mm": 15,
                "color": "#000000",
                "rotation": 0,
            }
        ],
    }


def _pixels(png_bytes):
    return Image.open(io.BytesIO(png_bytes)).convert("L").tobytes()


def _qrs_do_pdf(caminho):
    """Os pixels de cada imagem embutida no PDF."""
    doc = fitz.open(caminho)
    try:
        return [
            _pixels(doc.extract_image(info[0])["image"])
            for pagina in doc
            for info in pagina.get_images(full=True)
        ]
    finally:
        doc.close()


def _impor(tmp_path, pool, **extra):
    out = tmp_path / "qr_ideal.pdf"
    cfg = ImpositionConfig(
        base_file="base_ticket.pdf",
        out_pdf=str(out),
        formato=FORMATO,
        numeracao=_numeracao(),
        saida=SAIDA,
        seq_increment=1,
        layout_schema="sequential",
        pool_qr=qr_ideal.PoolQR(pool),
        **extra,
    )
    ImpositionEngine(cfg).process()
    return str(out)


def test_o_papel_carrega_o_conteudo_do_qr_ideal(tmp_path, pool_sintetico):
    """O ingresso 7 do pedido 20272, modelo 1000022, carrega o codigo da
    coluna 50 linha 7 — a celula que foi conferida na planilha real."""
    caminho = _impor(
        tmp_path, pool_sintetico,
        seq_start=7, seq_end=7,
        pedido=20272, modelo=1000022,
    )
    esperado = _pixels(_generate_qr("27202" + _base36(1_470_006), "#000000"))
    assert esperado in _qrs_do_pdf(caminho)


def test_cada_ingresso_recebe_um_codigo_diferente(tmp_path, pool_sintetico):
    caminho = _impor(
        tmp_path, pool_sintetico,
        seq_start=1, seq_end=4,
        pedido=20272, modelo=1000022,
    )
    desenhos = _qrs_do_pdf(caminho)
    for item in (1, 2, 3, 4):
        idx = 49 * qr_ideal.LINHAS + (item - 1)
        assert _pixels(_generate_qr("27202" + _base36(idx), "#000000")) in desenhos


def test_sem_pedido_o_trabalho_falha_em_vez_de_imprimir_em_branco(tmp_path, pool_sintetico):
    """Um QR em branco, ou calculado com valor suposto, so apareceria na
    portaria — quando ja nao da para consertar."""
    with pytest.raises(ValueError, match="QR Ideal"):
        _impor(
            tmp_path, pool_sintetico,
            seq_start=1, seq_end=1,
            pedido=None, modelo=None,
        )


def test_sem_modelo_tambem_falha(tmp_path, pool_sintetico):
    with pytest.raises(ValueError, match="QR Ideal"):
        _impor(
            tmp_path, pool_sintetico,
            seq_start=1, seq_end=1,
            pedido=20272, modelo=None,
        )


def test_reimpressao_da_celula_7_traz_o_codigo_do_item_7(tmp_path, pool_sintetico):
    """O codigo segue o numero do item, nunca a posicao na folha compactada.

    Refazer a celula 7 imprime uma folha com um item so, na primeira pose. O
    codigo tem de ser o do item 7 — se seguisse a pose, sairia o do item 1, e
    o ingresso reimpresso nao validaria na portaria.
    """
    caminho = _impor(
        tmp_path, pool_sintetico,
        seq_start=1, seq_end=20,
        pedido=20272, modelo=1000022,
        refazer_celulas=[7],
    )
    desenhos = _qrs_do_pdf(caminho)

    do_item_7 = _pixels(_generate_qr("27202" + _base36(49 * qr_ideal.LINHAS + 6), "#000000"))
    do_item_1 = _pixels(_generate_qr("27202" + _base36(49 * qr_ideal.LINHAS + 0), "#000000"))

    assert do_item_7 in desenhos
    assert do_item_1 not in desenhos


def _engine_multi(pool, modelos, tmp_path):
    cfg = ImpositionConfig(
        base_file="base_ticket.pdf",
        out_pdf=str(tmp_path / "multi.pdf"),
        formato=FORMATO,
        numeracao=_numeracao(),
        saida=SAIDA,
        seq_start=1, seq_end=len(modelos),
        seq_increment=1,
        layout_schema="multi_artes",
        multi_artes=[{"modelo": m} for m in modelos],
        pedido=20272, modelo=modelos[0],
        pool_qr=qr_ideal.PoolQR(pool),
    )
    return ImpositionEngine(cfg)


def test_modelos_consecutivos_caem_em_colunas_diferentes():
    # Os modelos de um pedido nascem com ids consecutivos, e ai as colunas
    # tambem sao consecutivas. E o caso normal.
    assert qr_ideal.coluna_do_modelo(20272, 1000022) == 50
    assert qr_ideal.coluna_do_modelo(20272, 1000023) == 49
    assert qr_ideal.coluna_do_modelo(20272, 1000024) == 48


def test_a_trava_deixa_passar_modelos_de_colunas_distintas(tmp_path, pool_sintetico):
    motor = _engine_multi(pool_sintetico, ["1000022", "1000023"], tmp_path)
    motor._conferir_colunas_qr_ideal()  # nao levanta


def test_modelos_com_id_distante_100_sao_recusados(tmp_path, pool_sintetico):
    """1000022 e 1000122 caem os dois na coluna 50 — QRs IDENTICOS no mesmo
    evento, o unico choque que o prefixo do pedido nao separa."""
    assert qr_ideal.coluna_do_modelo(20272, 1000022) == qr_ideal.coluna_do_modelo(20272, 1000122)

    motor = _engine_multi(pool_sintetico, ["1000022", "1000122"], tmp_path)
    with pytest.raises(ValueError, match="mesma coluna"):
        motor.process()


def test_trabalho_sem_qr_ideal_nao_e_afetado_pela_trava(tmp_path, pool_sintetico):
    """A trava so vale para quem usa o elemento. Um trabalho de numeracao comum
    com dois modelos na mesma coluna nao tem por que ser recusado."""
    cfg = ImpositionConfig(
        base_file="base_ticket.pdf",
        out_pdf=str(tmp_path / "sem_qr.pdf"),
        formato=FORMATO,
        numeracao={"tipo": "SEQUENCIAL", "elements": [
            {"id": "e1", "type": "TEXT", "x_mm": 50, "y_mm": 25,
             "font_size": 12, "color": "#000000", "prefix": "N"}
        ]},
        saida=SAIDA,
        seq_start=1, seq_end=2,
        seq_increment=1,
        layout_schema="multi_artes",
        multi_artes=[{"modelo": "1000022"}, {"modelo": "1000122"}],
        pedido=20272, modelo="1000022",
        pool_qr=qr_ideal.PoolQR(pool_sintetico),
    )
    ImpositionEngine(cfg)._conferir_colunas_qr_ideal()  # nao levanta


def test_pedido_terminado_em_zero_nao_perde_o_zero_no_papel(tmp_path, pool_sintetico):
    """Pedido 20270 vira "07202" no QR. Se algum trecho tratasse o prefixo
    como numero, ele viraria "7202" e o ingresso apontaria para outro pedido."""
    caminho = _impor(
        tmp_path, pool_sintetico,
        seq_start=1, seq_end=1,
        pedido=20270, modelo=1000022,
    )
    # (70 - 22) mod 100 = 48 -> coluna 48
    idx = 47 * qr_ideal.LINHAS
    esperado = _pixels(_generate_qr("07202" + _base36(idx), "#000000"))
    assert esperado in _qrs_do_pdf(caminho)
