"""Regressao do editor com DOM e Storage simulados, sem dados reais."""
from pathlib import Path
import subprocess


def test_editor_fundo_verso():
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(['node', 'tests/fundo_verso_numeracao_harness.js'],
                            cwd=root, capture_output=True, text=True, encoding='utf-8')
    assert result.returncode == 0, result.stdout + result.stderr
