"""Executa a regressão de navegador sem serviços reais."""
import subprocess
import unittest
from pathlib import Path


class DuplicarVersoFrontend(unittest.TestCase):
    def test_validacao_e_previas_sem_modo_pdf(self):
        root = Path(__file__).resolve().parents[1]
        resultado = subprocess.run(
            ['node', str(root / 'tests/duplicar_verso_sem_modo_pdf_harness.js')],
            cwd=root, capture_output=True, text=True, encoding='utf-8',
            timeout=60,
        )
        self.assertEqual(resultado.returncode, 0, resultado.stdout + resultado.stderr)
