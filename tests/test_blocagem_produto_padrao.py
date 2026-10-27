import subprocess
from pathlib import Path

from engine import ImpositionConfig


def test_blocagem_padrao_na_tela():
    raiz = Path(__file__).resolve().parents[1]
    resultado = subprocess.run(
        ["node", str(raiz / "tests/blocagem_padrao_harness.js")],
        cwd=raiz, capture_output=True, text=True, encoding="utf-8", timeout=30,
    )
    assert resultado.returncode == 0, resultado.stdout + resultado.stderr


def test_motor_usa_dez_quando_blocagem_nao_foi_informada():
    cfg = ImpositionConfig(
        base_file="", out_pdf="", numeracao={},
        formato={"width_mm": 100, "height_mm": 50, "cols": 2, "rows": 2},
        saida={"width_mm": 300, "height_mm": 300},
    )
    assert cfg.sheets_per_block == 10
