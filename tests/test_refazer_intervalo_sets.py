"""Intervalo inclusivo entre sets: PDFs reais, sem rede nem impressão."""
import hashlib
import re
from pathlib import Path
import fitz
import pytest
from engine import ImpositionConfig, ImpositionEngine


def gerar(tmp_path, modo="strict_assembly", duplex=False, capa=False, itens=52, **faixa):
    tmp_path.mkdir(parents=True, exist_ok=True)
    cfg = ImpositionConfig(base_file="", out_pdf=str(tmp_path / "trabalho.pdf"),
        formato=dict(width_mm=40, height_mm=30, cols=2, rows=2, has_cover=capa),
        saida=dict(width_mm=100, height_mm=100),
        numeracao={"tipo":"SEQUENCIAL", "elements":[{"type":"TEXT", "x_mm":5,
            "y_mm":10,"font_size":12,"prefix":"N"}]},
        seq_start=1, seq_end=itens, layout_schema="cut_stack", cut_stack_mode=modo,
        sheets_per_block=5, block_depth=1,
        print_mode="duplex" if duplex else "front", **faixa)
    motor = ImpositionEngine(cfg)
    motor.process()
    arquivos = [f for f in motor.generated_files if f["type"] not in ("capa", "contracapa")]
    caminhos = [Path(f["path"]) for f in arquivos] or [Path(cfg.out_pdf)]
    paginas = []
    for caminho in caminhos:
        with fitz.open(caminho) as doc:
            for pagina in doc:
                paginas.append((pagina.get_text(), hashlib.sha256(pagina.get_pixmap().samples).hexdigest()))
    return paginas, motor.generated_files


@pytest.mark.parametrize("modo", ["strict", "strict_assembly"])
@pytest.mark.parametrize("duplex", [False, True])
@pytest.mark.parametrize("capa", [False, True])
def test_intervalo_repete_exatamente_o_trecho_original(tmp_path, modo, duplex, capa):
    inteira, _ = gerar(tmp_path / "inteira", modo, duplex, capa)
    fator = 2 if duplex else 1
    # Set 1 folha 4 -> Set 3 folha 2: atravessa um set intermediário inteiro.
    trecho, arquivos = gerar(tmp_path / "trecho", modo, duplex, capa,
        refazer_set=1, refazer_de=4, refazer_set_ate=3, refazer_ate=2)
    assert trecho == inteira[3 * fator:12 * fator]
    assert len(trecho) == 9 * fator
    assert all(f["type"] not in ("capa", "contracapa") for f in arquivos)


@pytest.mark.parametrize("faixa", [
    dict(refazer_set=2,refazer_de=4,refazer_set_ate=1,refazer_ate=5),
    dict(refazer_set=2,refazer_de=4,refazer_set_ate=2,refazer_ate=3),
    dict(refazer_set=1,refazer_de=1,refazer_set_ate=4,refazer_ate=1),
    dict(refazer_set=1,refazer_de=1,refazer_set_ate=3,refazer_ate=4),
    dict(refazer_set=1,refazer_de=6,refazer_set_ate=3,refazer_ate=1),
    dict(refazer_set=1,refazer_de=0,refazer_set_ate=3,refazer_ate=1),
    dict(refazer_set=1,refazer_de=1,refazer_set_ate=0,refazer_ate=1),
])
def test_extremo_invalido_nao_entrega_nenhum_pdf(tmp_path, faixa):
    with pytest.raises(ValueError, match="Refazer:"):
        gerar(tmp_path, **faixa)
    assert not list(tmp_path.glob("*.pdf"))


def test_mesmo_set_novo_e_legado_sao_identicos(tmp_path):
    antigo, _ = gerar(tmp_path / "antigo", refazer_set=2,refazer_de=2,refazer_ate=4)
    novo, _ = gerar(tmp_path / "novo", refazer_set=2,refazer_de=2,refazer_ate=4,refazer_set_ate=2)
    assert novo == antigo


def test_sobra_final_completa(tmp_path):
    inteira, _ = gerar(tmp_path / "inteira")
    trecho, _ = gerar(tmp_path / "trecho",refazer_set=2,refazer_de=5,refazer_set_ate=3,refazer_ate=3)
    assert trecho == inteira[9:13]
