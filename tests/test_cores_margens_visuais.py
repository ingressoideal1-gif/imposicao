"""Só AST e dados sintéticos: não importa db/app nem lê configurações reais."""
import ast
import copy
from pathlib import Path
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[1]


class MargensVisuaisTest(unittest.TestCase):
    def setUp(self):
        source = ast.parse((ROOT / "db.py").read_text(encoding="utf-8-sig"))
        names = {"_cor_com_margens_visuais", "add_cor", "update_cor"}
        module = ast.Module(body=[n for n in source.body if isinstance(n, ast.FunctionDef) and n.name in names], type_ignores=[])
        self.formato = {"id": "f1", "width_mm": 100, "height_mm": 50}
        self.calls = []
        self.local = {"cores": []}
        self.env = {"get_formato": lambda key: self.formato if key == "f1" else None,
                    "IS_SUPABASE_ACTIVE": True, "uuid": uuid,
                    "_supabase_request": lambda *args: self.calls.append(args) or [{"id": "c1"}],
                    "_get_db": lambda: self.local, "_save_db": lambda data: None}
        exec(compile(module, "db.py:funcoes_isoladas", "exec"), self.env)
        self.data = {"name": "Sintetica", "formato_id": "f1", "width_mm": 999,
                     "height_mm": 999, "margem_esquerda_mm": 3.5, "margem_direita_mm": 7,
                     "margem_superior_mm": 2, "margem_inferior_mm": 9,
                     "cor_referencia": "#123456"}

    def test_criar_e_editar_preservam_margens_sem_alterar_formato(self):
        before = copy.deepcopy(self.formato)
        self.env["add_cor"](self.data)
        self.env["update_cor"]("c1", self.data)
        for _, table, payload in self.calls:
            self.assertTrue(table.startswith("producao_cores"))
            self.assertEqual(payload["width_mm"], 110.5)
            self.assertEqual(payload["height_mm"], 61)
            self.assertEqual(payload["margem_inferior_mm"], 9)
            self.assertEqual(payload["cor_referencia"], "#123456")
        self.assertEqual(self.formato, before)
        self.assertEqual(self.data["width_mm"], 999)

    def test_invalidos_nao_gravam(self):
        for bad in (None, -1, float("nan"), float("inf"), "abc", ""):
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError):
                    self.env["add_cor"]({**self.data, "margem_esquerda_mm": bad})
        with self.assertRaises(ValueError):
            self.env["add_cor"]({**self.data, "formato_id": "ausente"})
        self.assertEqual(self.calls, [])

    def test_caminho_local_guarda_os_quatro_lados(self):
        self.env["IS_SUPABASE_ACTIVE"] = False
        key = self.env["add_cor"](self.data)
        self.assertEqual(self.local["cores"][0]["width_mm"], 110.5)
        self.env["update_cor"](key, {**self.data, "margem_direita_mm": 0})
        self.assertEqual(self.local["cores"][0]["width_mm"], 103.5)
        self.assertEqual(self.calls, [])

    def test_legado_nao_recebe_margens_inventadas(self):
        data = {"name": "Legada", "width_mm": 88, "height_mm": 44}
        self.assertEqual(self.env["_cor_com_margens_visuais"](data), data)

    def test_sintaxe_python_sem_importar_aplicacao(self):
        for file in ("db.py", "app.py"):
            ast.parse((ROOT / file).read_text(encoding="utf-8-sig"), filename=file)


if __name__ == "__main__":
    unittest.main()
