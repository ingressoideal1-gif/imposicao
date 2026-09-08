"""O PDF recorta cada arte na celula, como a Visualizacao (pedido 21417).

Dados sinteticos: duas artes diferentes, maiores que suas celulas. Conferimos
pixels do PDF salvo, texto/vetores e isolamento entre poses, sem rede ou papel.
"""
import base64
import math
import urllib.request

import fitz
import pytest
from PIL import Image, ImageDraw

from engine import ImpositionConfig, ImpositionEngine, MM2PT


@pytest.fixture(autouse=True)
def somente_local(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)

    def sem_rede(*args, **kwargs):
        raise AssertionError("Este teste so pode usar artes sinteticas locais")

    monkeypatch.setattr(urllib.request, "urlopen", sem_rede)


def _arte(cores, largura=60, altura=50):
    with fitz.open() as doc:
        for cor in cores:
            p = doc.new_page(width=largura * MM2PT, height=altura * MM2PT)
            p.draw_rect(p.rect, fill=cor, color=None)
            p.insert_text((largura / 2 * MM2PT, altura / 2 * MM2PT),
                          "VETOR", fontsize=5)
        return doc.tobytes()


def _impor(tmp_path, origem, caminho, giro, gap=0, escala=100, offset=0,
           capa=False, giro_folha=0, opacidade=1):
    cores = [(1, 0, 0), (0, 0, 1)]
    artes = []
    for i, cor in enumerate(cores):
        dados = _arte([cor, cor])
        arquivo = tmp_path / f"arte_{i}.pdf"
        arquivo.write_bytes(dados if origem == "base" else _arte([(1, 1, 1)] * 2, 40, 30))
        elementos = []
        if origem == "PDF":
            elementos.append({
                "type": "PDF", "x_mm": 20, "y_mm": 15,
                "width_mm": 60, "height_mm": 50, "face": "both",
                "opacity": opacidade,
                "pdf_content": base64.b64encode(dados).decode(),
            })
        elif origem == "SVG":
            cor_hex = "#ff0000" if i == 0 else "#0000ff"
            elementos.append({
                "type": "SVG", "x_mm": 20, "y_mm": 15,
                "width_mm": 60, "height_mm": 50, "face": "both",
                "opacity": opacidade,
                "svg_content": '<svg xmlns="http://www.w3.org/2000/svg" '
                               'width="60mm" height="50mm" viewBox="0 0 60 50">'
                               f'<rect width="60" height="50" fill="{cor_hex}"/></svg>',
            })
        elementos.append({"type": "TEXT", "x_mm": 12, "y_mm": 12,
                          "font_size": 6, "prefix": "N", "face": "both"})
        artes.append({"qtd": 2 if caminho == "strict" else 1,
                      "local_path": str(arquivo), "pdf_url": "local_file",
                      "escala_h": escala, "escala_v": escala,
                      "numeracao": {"tipo": "SEQUENCIAL", "start": i + 1,
                                    "print_mode": "duplex", "elements": elementos}})
    formato = {
        "width_mm": 40, "height_mm": 30, "cols": 2, "rows": 1,
        "gap_h_mm": gap, "gap_v_mm": 0,
        "offset_h_mm": offset, "offset_v_mm": offset,
        "rotations": {"0": giro, "1": giro},
        "has_cover": capa, "cover_scale": 100,
        "cover_font_x": 4, "cover_font_y": 20, "cover_font_size": 5,
    }
    base = tmp_path / "base.pdf"
    base.write_bytes(_arte([cores[0]] * 2 + [cores[1]] * 2))
    cfg = ImpositionConfig(
        base_file=str(base) if caminho == "individual" else "",
        out_pdf=str(tmp_path / "saida.pdf"), formato=formato,
        numeracao=artes[0]["numeracao"] if caminho == "individual" else None,
        saida={"width_mm": 130, "height_mm": 80, "file_format": "pdf"},
        layout_schema=("pdf_multiple" if caminho == "individual" else
                       "cut_stack" if caminho in ("strict", "montagem") else "multi_artes"),
        multi_artes=None if caminho == "individual" else artes,
        print_mode="duplex", sheets_per_block=2,
        cut_stack_mode="strict_assembly", rotate_page=giro_folha,
        arte_escala_h=escala, arte_escala_v=escala,
    )
    motor = ImpositionEngine(cfg)
    motor.process()
    return motor


def _conferir_limites(pagina, gap):
    # Coordenadas de desenho sao sempre da folha sem a rotacao de apresentacao.
    pagina.set_rotation(0)
    pix = pagina.get_pixmap(matrix=fitz.Matrix(2, 2), colorspace=fitz.csRGB)
    im = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
    fora = im.copy()
    desenho = ImageDraw.Draw(fora)
    start_x = (130 - 80 - gap) / 2
    for col in range(2):
        x = start_x + col * (40 + gap)
        # Um pixel de tolerancia apenas para antialias na borda do corte.
        desenho.rectangle((math.floor(x * MM2PT * 2) - 1,
                           math.floor(25 * MM2PT * 2) - 1,
                           math.ceil((x + 40) * MM2PT * 2) + 1,
                           math.ceil(55 * MM2PT * 2) + 1), fill="white")
    assert all(minimo >= 250 for minimo, _ in fora.getextrema()), \
        "Ha tinta fora da borda de alguma celula"
    return im, start_x


def _conferir_cores(im, start_x, gap, face, caminho, modelo, opacidade=1):
    # No verso as colunas se invertem. Na montagem, cada sobra tem seu proprio
    # set, com uma pose ocupada e outra vazia que deve continuar branca.
    for col in range(2):
        esperado = (255, 0, 0) if col == face % 2 else (0, 0, 255)
        if caminho == "montagem":
            esperado = ((255, 0, 0) if modelo == 0 else (0, 0, 255)) \
                if col == face % 2 else (255, 255, 255)
        esperado = tuple(255 * (1 - opacidade) + c * opacidade for c in esperado)
        for dx in (2, 38):
            pixel = im.getpixel((round((start_x + col * (40 + gap) + dx) * MM2PT * 2),
                                 round(28 * MM2PT * 2)))
            assert pixel == pytest.approx(esperado, abs=3)


@pytest.mark.parametrize("caminho", ["individual", "multi", "strict", "montagem"])
@pytest.mark.parametrize("giro,gap,escala,offset", [
    (0, 0, 100, 0), (180, 6, 130, 3), (90, 0, 100, 0), (270, 6, 100, 0),
])
def test_arte_base_nao_invade_vizinha_nem_margens(tmp_path, caminho, giro, gap, escala, offset):
    motor = _impor(tmp_path, "base", caminho, giro, gap, escala, offset)
    for modelo, arquivo in enumerate(motor.generated_files):
        with fitz.open(arquivo["path"]) as doc:
            for face, p in enumerate(doc):
                im, start_x = _conferir_limites(p, gap)
                _conferir_cores(im, start_x, gap, face, caminho, modelo)
                assert not p.get_images(), "O recorte rasterizou a arte"
                assert "VETOR" in p.get_text(), "O texto da arte deixou de ser texto"
                assert "N" in p.get_text(), "A numeracao desapareceu"


@pytest.mark.parametrize("origem", ["PDF", "SVG"])
@pytest.mark.parametrize("opacidade", [0, 0.5, 1])
@pytest.mark.parametrize("caminho,giro", [("multi", 0), ("multi", 180),
                                         ("montagem", 0), ("montagem", 180)])
def test_elementos_da_numeracao_tambem_sao_recortados(tmp_path, origem, caminho, giro, opacidade):
    motor = _impor(tmp_path, origem, caminho, giro, gap=6, opacidade=opacidade)
    for modelo, arquivo in enumerate(motor.generated_files):
        with fitz.open(arquivo["path"]) as doc:
            for face, p in enumerate(doc):
                im, start_x = _conferir_limites(p, 6)
                _conferir_cores(im, start_x, 6, face, caminho, modelo, opacidade)
                assert not p.get_images()
                assert "N" in p.get_text()


@pytest.mark.parametrize("caminho", ["individual", "strict", "montagem"])
@pytest.mark.parametrize("giro_folha", [0, 90])
def test_capas_e_folha_girada_respeitam_o_recorte(tmp_path, caminho, giro_folha):
    motor = _impor(tmp_path, "base", caminho, 0, gap=6, capa=True, giro_folha=giro_folha)
    assert any(a["type"] == "capa" for a in motor.generated_files)
    for arquivo in motor.generated_files:
        with fitz.open(arquivo["path"]) as doc:
            for p in doc:
                _conferir_limites(p, 6)
