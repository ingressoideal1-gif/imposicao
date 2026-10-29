"""PDF Artes preserva ICC sem atribuir perfil alheio a paginas de outro modelo."""
from pathlib import Path
import shutil
import subprocess


def test_perfis_no_pdf_artes():
    root = Path(__file__).resolve().parents[1]
    node = shutil.which('node')
    assert node, 'Node necessario para conferir o PDF Artes'
    result = subprocess.run([node, 'tests/pdf_artes_perfil_harness.cjs'], cwd=root,
                            capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
