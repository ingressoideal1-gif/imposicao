"""Compara a prévia real (Node, DOM simulado) com PDFs do motor, sem rede.

Pode rodar com pytest ou diretamente: py tests/test_impressao_combinada.py.
Usa PDFs sintéticos e não importa app/db/serviço de impressão.
"""
import contextlib
import ast
import copy
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


class ImpressaoCombinadaTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        run = subprocess.run(
            ['node', 'tests/impressao_combinada_harness.js', '--json'], cwd=ROOT,
            capture_output=True, text=True, encoding='utf-8', check=True,
        )
        cls.cases = json.loads(run.stdout)

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='ideal-combinada-')
        self.addCleanup(self.tmp.cleanup)
        self.out = pathlib.Path(self.tmp.name)
        self.network = patch('urllib.request.urlopen', side_effect=AssertionError('Rede proibida no teste'))
        self.network.start()
        self.addCleanup(self.network.stop)

    def art(self, name, labels, width=50, height=30):
        file = self.out / (name + '.pdf')
        with fitz.open() as doc:
            for label in labels:
                page = doc.new_page(width=width * 2.8346, height=height * 2.8346)
                page.insert_text((8, 12), label, fontsize=8)
            doc.save(file)
        return str(file)

    def generate(self, cfg):
        engine = ImpositionEngine(cfg)
        with contextlib.redirect_stdout(io.StringIO()):
            engine.process()
        pages = []
        for file in engine.generated_files:
            with fitz.open(file['path']) as doc:
                pages.extend(page.get_text().splitlines() for page in doc)
        return pages

    def config(self, **kwargs):
        args = dict(
            base_file='', out_pdf=str(self.out / 'saida.pdf'), numeracao=None,
            formato=dict(name='Sintético', width_mm=50, height_mm=30, cols=2, rows=2),
            saida=dict(name='Sintético', width_mm=100, height_mm=60, file_format='pdf'),
        )
        args.update(kwargs)
        return ImpositionConfig(**args)

    def test_todas_as_folhas_e_numeros_correspondem_a_previa(self):
        for case in self.cases:
            if case['options'].get('paginadoDuplex'):
                continue
            for duplex in (False, True):
                with self.subTest(mode=case['mode'], bar=case['bar'], qtd=case['quantities'], opts=case['options'], duplex=duplex):
                    arts = copy.deepcopy(case['payload'])
                    for art in arts:
                        model = art['modelo']
                        art['local_path'] = self.art('arte-' + model, [model + 'F', model + 'V'])
                        art['pdf_url'] = 'local_file'
                        art['numeracao']['print_mode'] = 'duplex' if duplex else 'front'
                    cfg = self.config(
                        layout_schema=case['schema'], multi_artes=arts,
                        cut_stack_mode=case['extra']['blocagem']['modo'],
                        sheets_per_block=case['extra']['blocagem']['folhas'],
                        block_depth=case['options'].get('depth', 1),
                        print_mode='duplex' if duplex else 'front',
                    )
                    actual = self.generate(cfg)
                    expected = []
                    for page in case['pages']:
                        expected.append([r.get('art', r.get('vdp')) for r in page['front']])
                        if duplex:
                            expected.append([r.get('art', r.get('vdp')) for r in page['back']])
                    self.assertEqual(len(actual), len(expected))
                    for i, (got, want) in enumerate(zip(actual, expected)):
                        # A ordem de inserção no PDF do verso estrito é espelhada.
                        # Compara conteúdo; geometria/tombamento físico não é provado aqui.
                        if duplex and i % 2:
                            self.assertCountEqual(got, want)
                        else:
                            self.assertEqual(got, want)

    def test_refazer_set_preserva_modelo_e_numeros(self):
        case = self.cases[3]  # quantidades 20/4/8, motor ordena 96/98/97
        arts = copy.deepcopy(case['payload'])
        for art in arts:
            art['local_path'] = self.art('arte-' + art['modelo'], [art['modelo'] + 'F'])
            art['pdf_url'] = 'local_file'
        pages = self.generate(self.config(
            multi_artes=arts, layout_schema='cut_stack', cut_stack_mode='strict_assembly',
            sheets_per_block=8, refazer_de=1, refazer_ate=1, refazer_set=2,
        ))
        expected = next(p for p in case['pages'] if p['set'] == 2 and p['page'] == 1)
        self.assertEqual(pages, [[r.get('art', r.get('vdp')) for r in expected['front']]])

    def paginated(self, case):
        arts = copy.deepcopy(case['payload'])
        files = {}
        for art in arts:
            model = art['modelo']
            art['pdf_url'] = 'https://mock.invalid/front-' + model
            art['pdf_verso_url'] = 'https://mock.invalid/back-' + model
            files[art['pdf_url']] = pathlib.Path(self.art('front-' + model,
                [model + 'F' + str(i + 1) for i in range(art['qtd'])])).read_bytes()
            files[art['pdf_verso_url']] = pathlib.Path(self.art('back-' + model, [model + 'V'])).read_bytes()
        return arts, files

    def test_combinacao_paginada_todas_as_paginas_e_versos(self):
        for case in self.cases[6:]:
            with self.subTest(schema=case['schema'], bar=case['bar']):
                arts, files = self.paginated(case)
                with patch('urllib.request.urlopen', side_effect=lambda req, **kw: io.BytesIO(files[req.full_url])):
                    actual = self.generate(self.config(
                        layout_schema=case['schema'], multi_artes=arts, print_mode='duplex_unico',
                        cut_stack_mode=case['extra']['blocagem']['modo'],
                        sheets_per_block=case['extra']['blocagem']['folhas'],
                    ))
                expected = [p[face] for p in case['pages'] for face in ('front', 'back')]
                self.assertEqual(len(actual), len(expected))
                for got, want in zip(actual, expected):
                    self.assertCountEqual(got, [r.get('art', r.get('vdp')) for r in want])
                # Cada página da fonte entra exatamente uma vez, nunca página 1 repetida.
                fronts = [t for page in actual[::2] for t in page if 'F' in t]
                self.assertEqual(len(fronts), 23)
                self.assertEqual(len(set(fronts)), 23)

    def test_refazer_paginado_conserva_indice_local_e_verso(self):
        for case in (self.cases[6], self.cases[8]):
            arts, files = self.paginated(case)
            expected = case['pages'][1]
            with patch('urllib.request.urlopen', side_effect=lambda req, **kw: io.BytesIO(files[req.full_url])):
                actual = self.generate(self.config(multi_artes=arts, print_mode='duplex_unico',
                    layout_schema=case['schema'], refazer_de=expected['page'], refazer_ate=expected['page'],
                    refazer_set=expected['set'], cut_stack_mode=case['extra']['blocagem']['modo'],
                    sheets_per_block=case['extra']['blocagem']['folhas']))
            self.assertEqual(len(actual), 2)
            for got, face in zip(actual, ('front', 'back')):
                self.assertCountEqual(got, [r.get('art', r.get('vdp')) for r in expected[face]])

    def test_frente_compartilhada_nao_troca_versos_e_posicoes(self):
        arts, files = self.paginated(self.cases[6])
        arts[1]['pdf_url'] = arts[0]['pdf_url']
        arts[1]['qtd'] = arts[0]['qtd']
        cfg = self.config(multi_artes=arts, print_mode='duplex_unico', layout_schema='sequential')
        with patch('urllib.request.urlopen', side_effect=lambda req, **kw: io.BytesIO(files[req.full_url])):
            self.generate(cfg)
        with fitz.open(cfg.out_pdf) as doc:
            for p in range(0, len(doc), 2):
                front_words = doc[p].get_text('words')
                back_words = doc[p + 1].get_text('words')
                # A numeração identifica o modelo mesmo quando os PDFs de frente são iguais.
                for x0, y0, x1, _, text, *_ in front_words:
                    if ':' not in text:
                        continue
                    col = int(((x0 + x1) / 2) // (50 * 2.8346))
                    row = int(y0 // (30 * 2.8346))
                    backs = [w[4] for w in back_words
                             if int(((w[0] + w[2]) / 2) // (50 * 2.8346)) == 1 - col
                             and int(w[1] // (30 * 2.8346)) == row]
                    self.assertIn(text, backs)
                    self.assertIn(text.split(':')[0] + 'V', backs)

    def test_api_anuncia_capacidade_sem_importar_servicos(self):
        tree = ast.parse((ROOT / 'app.py').read_text(encoding='utf-8-sig'))
        fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'version_info')
        fn.decorator_list = []
        namespace = {'LOCAL_AGENT_VERSION': 'teste'}
        exec(compile(ast.Module(body=[fn], type_ignores=[]), 'app.py', 'exec'), namespace)
        self.assertIn('multi_artes_pdf_duplex_unico', namespace['version_info']()['capabilities'])

    def test_paginado_recusa_modos_mistos_e_arquivos_incompletos(self):
        arts, files = self.paginated(self.cases[6])
        for field, value in [('print_mode', 'duplex'), ('modo_pdf', False), ('pdf_verso_url', None)]:
            changed = copy.deepcopy(arts)
            changed[1][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                self.config(multi_artes=changed, print_mode='duplex_unico', layout_schema='multi_artes')
        for broken in ('qtd', 'verso'):
            changed = copy.deepcopy(arts)
            if broken == 'qtd': changed[1]['qtd'] += 1
            else: changed[1]['pdf_verso_url'] = 'https://mock.invalid/missing'
            delivered = []
            engine = ImpositionEngine(self.config(multi_artes=changed, print_mode='duplex_unico',
                layout_schema='multi_artes', entregar_por_bloco=True), on_file_generated=delivered.append)
            with patch('urllib.request.urlopen', side_effect=lambda req, **kw: io.BytesIO(files[req.full_url])), \
                 patch('time.sleep'), contextlib.redirect_stdout(io.StringIO()), self.assertRaises(ValueError):
                engine.process()
            self.assertEqual(engine.generated_files, [])
            self.assertEqual(delivered, [])

    def test_modos_paginados_individuais_permanecem(self):
        source = self.art('paginado', ['P1', 'P2', 'P3'])
        pairs = self.art('pares', ['F1', 'V1', 'F2', 'V2', 'F3', 'V3'])
        back = self.art('verso', ['FIXO'])
        cases = [
            ('front', source, None, None, [['P1', 'P2'], ['P3']]),
            ('duplex', pairs, None, None, [['F1', 'F2'], ['V1', 'V2'], ['F3'], ['V3']]),
            ('duplex_unico', source, back, None, [['P1', 'P2'], ['FIXO', 'FIXO'], ['P3'], ['FIXO']]),
            ('duplex', pairs, None, 'pdf_odd_even', [['F1', 'F2'], ['V1', 'V2'], ['F3'], ['V3']]),
            ('pdf_duplicate_back', source, None, 'pdf_duplicate_back', [['P1', 'P2'], ['P1', 'P2'], ['P3'], ['P3']]),
        ]
        for mode, src, verso, special, expected in cases:
            with self.subTest(mode=mode, special=special):
                args = dict(base_file=src, base_file_verso=verso, layout_schema='pdf_multiple',
                            print_mode=mode, pdf_expected_items=3 if special else None,
                            numeracao=dict(tipo='SEQUENCIAL', print_mode=special or mode, elements=[]),
                            formato=dict(name='Sintético', width_mm=50, height_mm=30, cols=2, rows=1))
                self.assertEqual(self.generate(self.config(**args)), expected)
                if special:
                    with self.assertRaises(ValueError):
                        self.config(**dict(args, pdf_expected_items=4))
                    with self.assertRaises(ValueError):
                        self.config(**dict(args, multi_artes=[dict(qtd=1)]))


if __name__ == '__main__':
    unittest.main()
