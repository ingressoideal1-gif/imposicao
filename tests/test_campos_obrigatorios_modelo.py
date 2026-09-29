"""Regressão offline: campos incompletos bloqueiam; modelo corrigido gera cinco peças."""
import contextlib
import io
import json
import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
import fitz
from engine import ImpositionConfig, ImpositionEngine


class CamposObrigatoriosModeloTest(unittest.TestCase):
    def test_bloqueios_e_pdf_com_cinco_unidades(self):
        result = subprocess.run(
            ['node', 'tests/faixa_modelo_ausente_harness.js', '--payload'],
            cwd=ROOT, capture_output=True, text=True, encoding='utf-8', timeout=60,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        payload = json.loads(result.stdout)
        with tempfile.TemporaryDirectory(prefix='ideal-campos-modelo-') as folder:
            art = pathlib.Path(folder) / 'arte.pdf'
            with fitz.open() as doc:
                page = doc.new_page(width=50 * 2.8346, height=30 * 2.8346)
                page.insert_text((8, 20), 'PECA_TESTE', fontsize=8)
                doc.save(art)
            with patch('urllib.request.urlopen', side_effect=AssertionError('Rede proibida')):
                cfg = ImpositionConfig(
                    base_file=str(art), out_pdf=str(pathlib.Path(folder) / 'saida.pdf'),
                    formato=payload['formato'], saida=payload['saida'], numeracao=None,
                    seq_start=payload['seq_start'], seq_end=payload['seq_end'],
                    seq_increment=payload['seq_increment'], layout_schema=payload['schema'],
                    print_mode='front',
                )
                self.assertEqual(cfg.total_items, 5)
                engine = ImpositionEngine(cfg)
                with contextlib.redirect_stdout(io.StringIO()):
                    engine.process()
                count = 0
                for file in engine.generated_files:
                    with fitz.open(file['path']) as doc:
                        count += sum(page.get_text().count('PECA_TESTE') for page in doc)
                self.assertEqual(count, 5)


if __name__ == '__main__':
    unittest.main()
