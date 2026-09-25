"""Arte repetida nas duas faces sem alterar a quantidade ou a montagem."""
import tempfile
import unittest
from pathlib import Path

import fitz

from engine import ImpositionConfig, ImpositionEngine, MM2PT


class DuplicarVersoSemModoPdf(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)

    def config(self, paginas=1, **alteracoes):
        entrada = self.root / 'entrada.pdf'
        with fitz.open() as doc:
            for i in range(paginas):
                page = doc.new_page(width=100 * MM2PT, height=50 * MM2PT)
                page.insert_text((20, 25), f'ARTE {i + 1}')
            doc.save(entrada)
        dados = dict(
            base_file=str(entrada), out_pdf=str(self.root / 'saida.pdf'),
            formato={'width_mm': 100, 'height_mm': 50, 'cols': 2, 'rows': 1},
            saida={'width_mm': 220, 'height_mm': 70, 'file_format': 'pdf'},
            numeracao={'tipo': 'SEQUENCIAL', 'print_mode': 'pdf_duplicate_back',
                       'elements': [
                           {'type': 'TEXT', 'face': 'both', 'x_mm': 15, 'y_mm': 25,
                            'font_size': 12, 'prefix': 'NUM-', 'digits': 3},
                           {'type': 'TEXT', 'fixed': True, 'face': 'front', 'x_mm': 15, 'y_mm': 35,
                            'font_size': 12, 'fixed_value': 'SO-FRENTE'},
                           {'type': 'TEXT', 'fixed': True, 'face': 'back', 'x_mm': 15, 'y_mm': 35,
                            'font_size': 12, 'fixed_value': 'SO-VERSO'},
                       ]},
            layout_schema='sequential', print_mode='pdf_duplicate_back',
            seq_start=1, seq_end=10, sheets_per_block=5,
        )
        dados.update(alteracoes)
        return ImpositionConfig(**dados)

    def conferir_dez_pecas(self, cfg):
        self.assertEqual(cfg.total_items, 10)
        ImpositionEngine(cfg).process()
        textos = []
        saidas = sorted(self.root.glob('saida*.pdf'))
        self.assertTrue(saidas)
        for arquivo in saidas:
            with fitz.open(arquivo) as doc:
                textos.extend(p.get_text() for p in doc)
        self.assertEqual(len(textos), 10)
        self.assertEqual(sum(t.count('ARTE 1') for t in textos[::2]), 10)
        self.assertEqual(sum(t.count('ARTE 1') for t in textos[1::2]), 10)
        for frente, verso in zip(textos[::2], textos[1::2]):
            self.assertNotIn('ARTE 2', frente + verso)
            self.assertIn('SO-FRENTE', frente)
            self.assertNotIn('SO-VERSO', frente)
            self.assertIn('SO-VERSO', verso)
            self.assertNotIn('SO-FRENTE', verso)
            nums = lambda t: sorted(l for l in t.splitlines() if l.startswith('NUM-'))
            self.assertEqual(nums(frente), nums(verso))
            self.assertEqual(len(nums(frente)), 2)
        self.assertEqual(len(set(l for t in textos[::2] for l in t.splitlines()
                                 if l.startswith('NUM-'))), 10)

    def test_uma_pagina_dez_pecas_sequenciais(self):
        self.conferir_dez_pecas(self.config())

    def test_ignora_segunda_pagina_e_repete_a_frente(self):
        self.conferir_dez_pecas(self.config(paginas=2))

    def test_blocado_preserva_quantidade_e_faces(self):
        self.conferir_dez_pecas(self.config(layout_schema='cut_stack'))

    def test_empilhamento_vertical_preserva_quantidade_e_faces(self):
        self.conferir_dez_pecas(self.config(layout_schema='cut_stack',
                                          cut_stack_mode='strict_assembly'))

    def test_multipaginas_continua_usando_uma_pagina_por_peca(self):
        cfg = self.config(paginas=3, layout_schema='pdf_multiple', pdf_expected_items=3)
        self.assertEqual(cfg.total_items, 3)
        ImpositionEngine(cfg).process()
        with fitz.open(cfg.out_pdf) as doc:
            textos = [p.get_text() for p in doc]
        self.assertEqual(len(textos), 4)
        for frente, verso in zip(textos[::2], textos[1::2]):
            for i in range(1, 4):
                self.assertEqual(frente.count(f'ARTE {i}'), verso.count(f'ARTE {i}'))

    def test_multipaginas_ainda_recusa_quantidade_divergente(self):
        with self.assertRaisesRegex(ValueError, 'exatamente 10 páginas'):
            self.config(layout_schema='pdf_multiple', pdf_expected_items=10)

    def test_nao_aceita_verso_separado(self):
        with self.assertRaisesRegex(ValueError, 'sem arquivo de verso separado'):
            self.config(base_file_verso='outro.pdf')


if __name__ == '__main__':
    unittest.main()
