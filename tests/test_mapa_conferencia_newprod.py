"""Conferência no executável, sem importar db/app ou abrir configurações reais."""
import ast
import copy
import io
import json
from pathlib import Path
import subprocess
from types import SimpleNamespace
import unittest
import urllib.parse
import urllib.request

import teatro_snapshot

ROOT = Path(__file__).resolve().parents[1]


class ConferenciaNewProdTest(unittest.TestCase):
    def setUp(self):
        tree = ast.parse((ROOT / 'db.py').read_text(encoding='utf-8-sig'))
        names = {'get_mapa_teatro_para_conferencia', '_supabase_call'}
        isolated = ast.Module(body=[n for n in tree.body
            if isinstance(n, ast.FunctionDef) and n.name in names], type_ignores=[])
        self.calls = []
        self.response = []
        self.failure = None

        def open_fake(req, **kwargs):
            self.calls.append((req, kwargs))
            if self.failure:
                raise self.failure
            return io.BytesIO(json.dumps(self.response).encode())

        self.env = {'json': json, 'IS_SUPABASE_ACTIVE': False,
            'SUPABASE_URL': 'https://example.invalid', 'SUPABASE_KEY': 'synthetic',
            'urllib': SimpleNamespace(parse=urllib.parse,
                request=SimpleNamespace(Request=urllib.request.Request, urlopen=open_fake)),
            '_get_db': lambda: self.fail('A conferência não pode usar o catálogo local')}
        exec(compile(isolated, 'db.py:isolado', 'exec'), self.env)

    def read(self, mapa='mapa1'):
        return self.env['get_mapa_teatro_para_conferencia'](mapa)

    def test_executavel_sem_catalogo_consulta_apenas_mapa_solicitado(self):
        self.response = [{'id': 'mapa1', 'config': {'setores': [{'id': 's1'}]}}]
        self.assertEqual(self.read(), self.response[0])
        req, options = self.calls[0]
        self.assertEqual(req.get_method(), 'GET')
        self.assertIsNone(req.data)
        self.assertEqual(urllib.parse.parse_qs(urllib.parse.urlsplit(req.full_url).query),
                         {'id': ['eq.mapa1'], 'select': ['id,config'], 'limit': ['1']})
        self.assertEqual(options, {'timeout': 15})

    def test_filtro_nao_aceita_parametros_injetados_no_id(self):
        self.read('mapa1&select=*')
        req, _ = self.calls[0]
        query = urllib.parse.parse_qs(urllib.parse.urlsplit(req.full_url).query)
        self.assertEqual(query['id'], ['eq.mapa1&select=*'])
        self.assertEqual(query['select'], ['id,config'])

    def test_mapa_ausente_nao_usa_catalogo_antigo(self):
        self.assertIsNone(self.read())

    def test_timeout_e_acesso_negado_bloqueiam_com_mensagem_de_consulta(self):
        for error in [TimeoutError('timeout'), PermissionError('synthetic denied')]:
            with self.subTest(error=type(error).__name__):
                self.failure = error
                with self.assertRaisesRegex(ValueError, 'consultar o mapa atual'):
                    self.read()

    def test_resposta_invalida_nao_e_tratada_como_mapa_ausente(self):
        self.response = {'error': 'synthetic'}
        with self.assertRaisesRegex(ValueError, 'Resposta inválida'):
            self.read()

    def fixture(self):
        result = subprocess.run(['node', 'tests/teatro_snapshot_harness.js', '--payload'],
            cwd=ROOT, text=True, encoding='utf-8', capture_output=True, timeout=30)
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_multiartes_sem_catalogo_preserva_snapshot_e_consulta_uma_vez(self):
        source = self.fixture()
        self.response = [source['atual']]
        a = source['payload']
        b = copy.deepcopy(a)
        b['modelo'] = b['numeracao']['teatro_modelo']['id'] = 'm2'
        payload = {'multi_artes': [a, b]}
        before = copy.deepcopy(payload)
        self.assertEqual(len(teatro_snapshot.aplicar(payload, self.read)), 2)
        self.assertEqual(payload, before)
        self.assertEqual(len(self.calls), 1)

    def test_mapa_ausente_e_setor_incorreto_tem_erros_distintos(self):
        source = self.fixture()
        with self.assertRaisesRegex(ValueError, 'Mapa de teatro não encontrado'):
            teatro_snapshot.aplicar(source['payload'], self.read)
        self.response = [{'id': 'mapa1', 'config': {'setores': [{'id': 'outro'}]}}]
        with self.assertRaisesRegex(ValueError, 'setor do modelo não pertence'):
            teatro_snapshot.aplicar(source['payload'], self.read)

    def test_dois_mapas_independentes_na_mesma_imposicao(self):
        source = self.fixture()
        a = source['payload']
        b = copy.deepcopy(a)
        b['modelo'] = b['numeracao']['teatro_modelo']['id'] = 'modelo-outro-pedido'
        model = b['numeracao']['teatro_modelo']
        model['mapa_teatro_id'] = model['mapa_teatro_snapshot']['mapa']['id'] = 'outro-mapa'
        b['numeracao']['csv_data'] = teatro_snapshot.linhas(model)
        maps = {'mapa1': source['atual'], 'outro-mapa': {**source['atual'], 'id': 'outro-mapa'}}
        calls = []
        def read(key):
            calls.append(key)
            self.response = [maps[key]]
            return self.read(key)
        payload = {'multi_artes': [a, b]}
        before = copy.deepcopy(payload)
        self.assertEqual(len(teatro_snapshot.aplicar(payload, read)), 2)
        self.assertEqual(payload, before)
        self.assertEqual(calls, ['mapa1', 'outro-mapa'])

    def test_rota_de_imposicao_usa_conferencia_remota(self):
        tree = ast.parse((ROOT / 'app.py').read_text(encoding='utf-8-sig'))
        calls = [n for n in ast.walk(tree) if isinstance(n, ast.Call)
                 and isinstance(n.func, ast.Attribute) and n.func.attr == 'aplicar'
                 and isinstance(n.func.value, ast.Name) and n.func.value.id == 'teatro_snapshot']
        self.assertTrue(calls)
        for call in calls:
            self.assertEqual(ast.unparse(call.args[1]), 'db.get_mapa_teatro_para_conferencia')


if __name__ == '__main__':
    unittest.main()
