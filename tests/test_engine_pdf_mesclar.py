"""Pixels do PDF final, com arquivos sintéticos e sem rede/impressora."""
import base64
import io
import json
import subprocess
from pathlib import Path

from PIL import Image
import fitz
import pytest

import engine


def pdf_cor(cor):
    with fitz.open() as doc:
        p = doc.new_page(width=100 * engine.MM2PT, height=50 * engine.MM2PT)
        p.draw_rect(p.rect, fill=cor, color=None)
        p.insert_text((5, 12), "VETOR", fontsize=8)
        return doc.tobytes()


def elemento(cor, **extra):
    return dict(type="PDF", pdf_content=base64.b64encode(pdf_cor(cor)).decode(),
                x_mm=50, y_mm=25, width_mm=100, height_mm=50, **extra)


def impor(tmp_path, elements, schema="sequential", rot=0, modulo=engine):
    base = tmp_path / "base.pdf"
    base.write_bytes(pdf_cor((0.2, 0.4, 0.8)))
    out = tmp_path / "saida.pdf"
    num = dict(elements=elements, print_mode="duplex")
    args = dict(base_file=str(base), out_pdf=str(out),
                formato=dict(width_mm=100, height_mm=50, cols=1, rows=1,
                             rotations={"0": rot}),
                numeracao=num, saida=dict(width_mm=100, height_mm=50),
                seq_start=1, seq_end=1, seq_increment=1,
                print_mode="duplex", layout_schema=schema)
    if schema == "multi_artes":
        args["multi_artes"] = [dict(qtd=1, local_path=str(base), numeracao=num)]
    modulo.ImpositionEngine(modulo.ImpositionConfig(**args)).process()
    return fitz.open(out)


def pixel(page):
    pix = page.get_pixmap()
    return pix.pixel(pix.width // 2, pix.height // 2)[:3]


@pytest.mark.parametrize("schema", ["sequential", "cut_stack", "multi_artes"])
@pytest.mark.parametrize("rot", [0, 180])
def test_marcados_depois_dos_normais_frente_verso(tmp_path, schema, rot):
    # Marcado aparece antes na lista: ainda deve mesclar sobre o PDF azul normal.
    els = [elemento((1, 1, 0), mesclar_com_arte=True, face="front"),
           elemento((0, 0, 1))]
    with impor(tmp_path, els, schema, rot) as doc:
        assert len(doc) == 2
        assert max(pixel(doc[0])) <= 3  # amarelo multiply azul = preto
        assert max(abs(a-b) for a, b in zip(pixel(doc[1]), (0, 0, 255))) <= 2
        assert all(not p.get_images() for p in doc)  # PDFs continuam vetoriais
        assert "VETOR" in doc[0].get_text()


@pytest.mark.parametrize("op,azul", [(0, 255), (0.5, 128), (1, 0)])
def test_multiply_respeita_opacidade(tmp_path, op, azul):
    els = [elemento((0, 0, 1)), elemento((1, 1, 0), mesclar_com_arte=True, opacity=op)]
    with impor(tmp_path, els) as doc:
        for p in doc:
            r, g, b = pixel(p)
            assert r <= 3 and g <= 3 and abs(b - azul) <= 3


def test_varios_pdfs_branco_neutro_e_sem_vazamento(tmp_path):
    els = [elemento((1, 1, 1), mesclar_com_arte=True),
           elemento((0.5, 1, 1), mesclar_com_arte=True),
           elemento((1, 0.5, 1), mesclar_com_arte=True),
           elemento((1, 1, 1))]
    with impor(tmp_path, els) as doc:
        assert all(max(abs(a-b) for a, b in zip(pixel(p), (127, 127, 255))) <= 3 for p in doc)


def test_desmarcado_identico_ao_campo_ausente(tmp_path):
    els = [elemento((1, 1, 0), opacity=0.5), elemento((0, 0, 1), face="back")]
    with impor(tmp_path, els) as doc:
        antes = [p.get_pixmap().samples for p in doc]
    for valor in [None, False]:
        atuais = [dict(el, **({} if valor is None else {"mesclar_com_arte": valor})) for el in els]
        with impor(tmp_path, atuais) as doc:
            assert [p.get_pixmap().samples for p in doc] == antes


def test_marcacao_so_aceita_pdf_e_booleano():
    assert not engine._mesclar_com_arte(dict(type="SVG", mesclar_com_arte=True))
    assert not engine._mesclar_com_arte(dict(type="PDF", mesclar_com_arte="false"))


def test_motor_opacidade_do_pdf_inteiro_e_layout_preservado(tmp_path):
    el = elemento((1,1,0), mesclar_com_arte=True, opacity=0.5)
    with fitz.open() as source:
        p = source.new_page(width=100*engine.MM2PT,height=50*engine.MM2PT)
        p.draw_rect(p.rect,fill=(1,1,0),color=None)
        p.draw_rect(fitz.Rect(p.rect.width*0.4,0,p.rect.width*0.6,p.rect.height),
                    fill=(1,1,0),color=None)
        el["pdf_content"] = base64.b64encode(source.tobytes()).decode()
    with impor(tmp_path, [elemento((0,0,1)),el]) as doc:
        for p in doc:
            pix=p.get_pixmap()
            centro= pixel(p)
            lado=pix.pixel(pix.width//4,pix.height//2)[:3]
            assert max(abs(a-b) for a,b in zip(centro,lado)) <= 3
            assert abs(centro[2]-128) <= 3
    el['render_mode']='layout'
    with impor(tmp_path, [elemento((0,0,1)),el]) as doc:
        assert all(pixel(p)[2]>=253 for p in doc)


@pytest.mark.parametrize("marcado,op,azul", [(False,1,255),(True,1,0),(True,0.5,128)])
@pytest.mark.parametrize("sobreposto", [False, True])
def test_gabarito_exportado_mescla_depois_da_numeracao(marcado, op, azul, sobreposto):
    png = io.BytesIO()
    Image.new("RGB", (100, 50), (0, 0, 255)).save(png, format="PNG")
    els = [elemento((1, 1, 0), mesclar_com_arte=marcado, opacity=op, face="front"),
           dict(type="FIXED", fixed_value="sintetico")]
    if sobreposto:
        with fitz.open() as source:
            page = source.new_page(width=100*engine.MM2PT,height=50*engine.MM2PT)
            for rect in [fitz.Rect(0,0,page.rect.width*0.6,page.rect.height),
                         fitz.Rect(page.rect.width*0.4,0,page.rect.width,page.rect.height)]:
                page.draw_rect(rect, fill=(1,1,0), color=None)
            els[0]["pdf_content"] = base64.b64encode(source.tobytes()).decode()
    data = dict(elements=els, png="data:image/png;base64," + base64.b64encode(png.getvalue()).decode())
    result = subprocess.run(["node", str(Path(__file__).with_name("gabarito_pdf_mesclar_harness.js"))],
                            input=json.dumps(data), capture_output=True, text=True, check=True)
    with fitz.open(stream=base64.b64decode(result.stdout), filetype="pdf") as doc:
        assert len(doc) == 2
        assert max(abs(a-b) for a,b in zip(pixel(doc[0]), (0,0,azul))) <= 3
        assert max(abs(a-b) for a,b in zip(pixel(doc[1]), (0,0,255))) <= 3
