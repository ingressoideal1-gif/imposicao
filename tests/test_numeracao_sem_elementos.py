# -*- coding: utf-8 -*-
"""Numeração escolhida SEM nenhum elemento: a folha sai, e sai com a arte.

Este arquivo é o par do `test_numeracao_pedida_e_ausente.py`. Aquele cobra a recusa
quando o objeto da numeração não chega ao motor; este cobra o caso vizinho, que é
produção legítima e que ficou travado por engano.

03/09/2026, pedido 21411: a guarda do `/api/impose` recusava o trabalho quando o
`numeracao_id` vinha preenchido e a numeração chegava com a lista de elementos vazia.
O usuário fechou a questão: isso é comum, porque nem todo trabalho leva número ou QR.
A numeração está escolhida no seletor, ela simplesmente não desenha nada, e a folha
sair só com a arte é o RESULTADO CORRETO.

O teste de fonte (`test_numeracao_pedida_e_ausente.py`) garante que a recusa não
volte. Este garante o que interessa de verdade: que o papel sai. Sem ele, alguém
poderia remover a recusa e deixar o motor quebrando no lugar dela — o operador
continuaria sem folha, só com outra mensagem.
"""
import base64  # noqa: F401  (mantido: os testes vizinhos deste diretório o usam)

import fitz
import pytest

from engine import ImpositionConfig, ImpositionEngine

FORMATO = {
    "name": "Ingresso 100x50",
    "width_mm": 100,
    "height_mm": 50,
    "cols": 2,
    "rows": 2,
    "gap_h_mm": 0,
    "gap_v_mm": 0,
    "offset_h_mm": 0,
    "offset_v_mm": 0,
}

SAIDA = {
    "name": "Folha 200x100",
    "width_mm": 200,
    "height_mm": 100,
    "file_format": "pdf",
}


@pytest.fixture
def arte(tmp_path):
    """Arte de produção: um retângulo vermelho que ocupa a peça inteira."""
    caminho = tmp_path / "arte.pdf"
    doc = fitz.open()
    pg = doc.new_page(width=100 * 2.834645, height=50 * 2.834645)
    pg.draw_rect(pg.rect, color=None, fill=(1, 0, 0))
    doc.save(str(caminho))
    doc.close()
    return str(caminho)


def _impor(arte, saida_pdf, numeracao):
    config = ImpositionConfig(
        base_file=arte,
        out_pdf=str(saida_pdf),
        formato=FORMATO,
        numeracao=numeracao,
        saida=SAIDA,
        seq_start=1,
        seq_end=4,
        seq_increment=1,
        layout_schema="sequential",
    )
    ImpositionEngine(config).process()


@pytest.mark.parametrize("numeracao", [
    pytest.param({"elements": []}, id="lista-vazia"),
    pytest.param({}, id="sem-a-chave-elements"),
    pytest.param({"name": "Numeracao do cliente", "elements": []}, id="numeracao-de-verdade"),
])
def test_a_folha_sai_com_a_arte_quando_a_numeracao_nao_tem_elementos(arte, tmp_path, numeracao):
    """Quatro peças de 100x50 numa folha de 200x100: uma folha, toda vermelha.

    O que se mede é a TINTA, não a estrutura: o motor pode montar a árvore de
    objetos certa e não colar arte nenhuma.
    """
    saida_pdf = tmp_path / f"folha_{len(numeracao)}.pdf"
    _impor(arte, saida_pdf, numeracao)

    assert saida_pdf.exists(), "o motor nao gerou folha nenhuma"

    doc = fitz.open(str(saida_pdf))
    try:
        assert doc.page_count == 1, f"esperava 1 folha, saiu {doc.page_count}"
        pix = doc[0].get_pixmap(dpi=36)
        # Um ponto dentro de cada uma das quatro peças.
        for frac_x, frac_y in ((0.25, 0.25), (0.75, 0.25), (0.25, 0.75), (0.75, 0.75)):
            px = pix.pixel(int(pix.width * frac_x), int(pix.height * frac_y))
            r, g, b = px[0], px[1], px[2]
            assert r > 200 and g < 80 and b < 80, (
                f"a peca em ({frac_x}, {frac_y}) saiu {px} em vez de vermelha — "
                "a arte nao foi colada"
            )
    finally:
        doc.close()


def test_a_numeracao_vazia_nao_muda_a_folha_de_quem_nao_tem_numeracao(arte, tmp_path):
    """`numeracao=None` (trabalho sem numeração nenhuma) e `numeracao` escolhida mas
    vazia têm de dar a MESMA folha. Se diferirem, a numeração vazia está deixando
    alguma marca no papel — e o papel é o produto."""
    sem = tmp_path / "sem_numeracao.pdf"
    vazia = tmp_path / "numeracao_vazia.pdf"
    _impor(arte, sem, None)
    _impor(arte, vazia, {"elements": []})

    def _tinta(caminho):
        doc = fitz.open(str(caminho))
        try:
            return doc[0].get_pixmap(dpi=36).samples
        finally:
            doc.close()

    assert _tinta(sem) == _tinta(vazia), (
        "a numeracao escolhida sem elementos mudou o que sai no papel"
    )
