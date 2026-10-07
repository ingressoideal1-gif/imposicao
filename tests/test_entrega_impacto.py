"""Regressoes locais: cache, compatibilidade, selecao e falhas; sem agente/rede."""
import json
import ast
import os
import shutil
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'ferramentas'))
import entrega_impacto as e
import conferir_duas_versoes as c
from compatibilidade_painel import painel_externo_validado


class EntregaImpacto(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / 'fonte'
        (self.source / 'frontend').mkdir(parents=True)
        for name, data in {'index.html': '<html>teste</html>', 'style.css': 'body{}',
                           'painel-protocolo.json': '{"sessao_local":1}'}.items():
            (self.source / 'frontend' / name).write_text(data, encoding='utf-8')
        self.cache, self.output = self.root / 'cache', self.root / 'out'
        self.runtime = 'runtime-sintetico'
        self.builds = 0

    def state(self, *args):
        painel = {'frontend/' + p.name: e.digest(p) for p in (self.source / 'frontend').iterdir()}
        result = {'schema': 1, 'runtime': self.runtime, 'painel': painel,
                  'protocolo': json.loads((self.source / 'frontend/painel-protocolo.json').read_text())}
        result['chave'] = e.chave({'runtime': self.runtime, 'painel': painel})
        return result

    def build(self, output):
        self.builds += 1
        (output / 'NewProdPiloto.exe').write_bytes(b'executavel sintetico auditado')

    def prepare(self, panel=True, builder=None):
        with patch.object(e, 'estado', self.state), patch.object(e, 'git', return_value='commit-sintetico'):
            return e.preparar(self.source, self.output, self.cache, panel, builder or self.build)

    def test_reutiliza_sem_recompilar_e_mantem_hash(self):
        first = self.prepare()
        second = self.prepare()
        self.assertEqual((first['acao'], second['acao'], self.builds), ('compilar', 'reutilizar', 1))
        self.assertEqual(e.digest(Path(first['destino']) / 'NewProdPiloto.exe'),
                         e.digest(Path(second['destino']) / 'NewProdPiloto.exe'))

    def test_painel_compativel_monta_nova_pasta_sem_mudar_exe(self):
        first = self.prepare()
        (self.source / 'frontend/style.css').write_text('body{color:red}')
        panel = self.prepare()
        self.assertEqual(panel['acao'], 'painel')
        self.assertEqual(self.builds, 1)
        dest = self.root / 'nova-versao'
        exe = Path(first['destino']) / 'NewProdPiloto.exe'
        e.montar_painel(Path(panel['destino']), exe, dest)
        self.assertEqual(e.digest(exe), e.digest(dest / exe.name))
        self.assertEqual((dest / 'painel/style.css').read_text(), 'body{color:red}')
        self.assertTrue(painel_externo_validado(dest / 'painel', dest / exe.name))
        with self.assertRaises(FileExistsError):
            e.montar_painel(Path(panel['destino']), exe, dest)

    def test_fluxo_msi_continua_exigindo_executavel_completo(self):
        self.prepare()
        (self.source / 'frontend/style.css').write_text('body{color:red}')
        self.assertEqual(self.prepare(panel=False)['acao'], 'compilar')

    def test_runtime_dependencias_protocolo_ou_exclusao_exigem_build(self):
        self.prepare()
        self.runtime = 'outra-dependencia'
        self.assertEqual(self.prepare()['acao'], 'compilar')
        (self.source / 'frontend/painel-protocolo.json').write_text('{"sessao_local":2}')
        self.assertEqual(self.prepare()['acao'], 'compilar')
        (self.source / 'frontend/style.css').unlink()
        self.assertEqual(self.prepare()['acao'], 'compilar')

    def test_cache_corrompido_nao_e_reutilizado(self):
        self.prepare()
        next(self.cache.glob('*/NewProdPiloto.exe')).write_bytes(b'corrompido')
        self.assertEqual(self.prepare()['acao'], 'compilar')

    def test_manifesto_antigo_ou_incompleto_nao_e_prova(self):
        folder = self.root / 'antigo'
        folder.mkdir()
        e.escrever(folder / 'manifesto-piloto.json', {'canal': 'piloto'})
        self.assertIsNone(e.base_validada(folder))

    def test_build_falhou_nao_publica_cache(self):
        def failed(output):
            raise RuntimeError('auditoria recusou')
        with self.assertRaises(RuntimeError):
            self.prepare(builder=failed)
        self.assertFalse(self.cache.exists())

    def test_fontes_mudaram_durante_build_nao_publica_cache(self):
        def changed(output):
            self.build(output)
            self.runtime = 'alterado-durante-build'
        with self.assertRaisesRegex(ValueError, 'durante o build'):
            self.prepare(builder=changed)
        self.assertFalse(self.cache.exists())

    def test_recusa_painel_corrompido_ou_exe_incompativel(self):
        full = self.prepare()
        (self.source / 'frontend/style.css').write_text('novo')
        panel = Path(self.prepare()['destino'])
        exe = Path(full['destino']) / 'NewProdPiloto.exe'
        (panel / 'painel/style.css').write_text('adulterado')
        with self.assertRaises(ValueError):
            e.montar_painel(panel, exe, self.root / 'dest')
        self.assertFalse((self.root / 'dest').exists())
        exe.write_bytes(b'outro exe')
        with self.assertRaisesRegex(ValueError, 'incompativel'):
            e.montar_painel(panel, exe, self.root / 'dest')

    def test_painel_nao_pode_escapar_da_pasta(self):
        full = self.prepare()
        (self.source / 'frontend/style.css').write_text('novo')
        panel = Path(self.prepare()['destino'])
        m = json.loads((panel / 'manifesto-painel.json').read_text())
        m['arquivos']['../fora'] = 'hash'
        e.escrever(panel / 'manifesto-painel.json', m)
        with self.assertRaises(ValueError):
            e.montar_painel(panel, Path(full['destino']) / 'NewProdPiloto.exe', self.root / 'dest')

    def test_selecao_conservadora_e_contratos_obrigatorios(self):
        visual, harnesses = c.selecionar(['frontend/style.css'])
        self.assertLess(len(visual), len(c.TESTES))
        self.assertIn('test_seguranca_estacao.py', visual)
        self.assertIn('test_canais_newprod.py', visual)
        self.assertEqual(harnesses, c.HARNESSES)
        for paths in (['frontend/pedido.js'], ['frontend/index.html'], ['engine.py'],
                      ['desconhecido.xyz'], ['tests/novo.py']):
            self.assertEqual(c.selecionar(paths), (c.TESTES, c.HARNESSES))
        self.assertEqual(e.plano(['docs/nota.md'])['perfil'], 'documentacao')

    def test_tempos_registrados_mesmo_com_falha(self):
        report = self.root / 'tempos.json'
        with patch.object(c.subprocess, 'run', side_effect=subprocess.CalledProcessError(1, 'pytest')):
            with self.assertRaises(subprocess.CalledProcessError):
                c.conferir(('piloto',), ['frontend/style.css'], report)
        data = json.loads(report.read_text())
        self.assertFalse(data[0]['sucesso'])
        self.assertEqual(data[0]['etapa'], 'piloto/pytest')

    def test_cache_html_nao_mascara_mudanca_de_logica(self):
        html = self.source / 'frontend/index.html'
        html.write_text('<script src="a.js?v=2"></script>')
        with patch.object(e, 'alterados', return_value=['frontend/index.html', 'frontend/style.css']), \
             patch.object(e, 'git', return_value='<script src="a.js?v=1"></script>'):
            self.assertEqual(e.impacto_testes(self.source, 'base'), ['frontend/style.css'])
            html.write_text('<script src="b.js?v=2"></script>')
            self.assertIn('frontend/index.html', e.impacto_testes(self.source, 'base'))

    def test_fingerprint_real_fontes_dependencias_e_documentacao(self):
        def cmd(*args):
            subprocess.run(['git', '-C', str(self.source), *args], check=True, capture_output=True)
        cmd('init')
        (self.source / 'engine.py').write_text('valor = 1')
        (self.source / 'docs').mkdir()
        (self.source / 'docs/nota.md').write_text('nota')
        cmd('add', '.')
        original = e.estado(self.source, {'python': 'sintetico-1'})
        (self.source / 'docs/nota.md').write_text('documentacao mudou')
        self.assertEqual(original, e.estado(self.source, {'python': 'sintetico-1'}))
        (self.source / 'frontend/style.css').write_text('nova cor')
        visual = e.estado(self.source, {'python': 'sintetico-1'})
        self.assertEqual(original['runtime'], visual['runtime'])
        self.assertNotEqual(original['chave'], visual['chave'])
        self.assertNotEqual(visual['runtime'], e.estado(self.source, {'python': 'sintetico-2'})['runtime'])
        (self.source / 'engine.py').write_text('valor = 2')
        self.assertNotEqual(visual['runtime'], e.estado(self.source, {'python': 'sintetico-1'})['runtime'])
        (self.source / 'novo.py').write_text('valor = 3')
        with self.assertRaisesRegex(ValueError, 'nao rastreadas'):
            e.estado(self.source, {})

    def test_chama_build_e_auditoria_antes_de_gravar_cache(self):
        calls = []
        def run(cmd, **kwargs):
            calls.append(cmd)
            if 'PyInstaller' in cmd:
                dest = Path(cmd[cmd.index('--distpath') + 1])
                (dest / 'NewProdPiloto.exe').write_bytes(b'sintetico')
            return subprocess.CompletedProcess(cmd, 0)
        with patch.object(e, 'estado', self.state), patch.object(e, 'git', return_value='sha'), \
             patch.object(e.subprocess, 'run', side_effect=run):
            result = e.preparar(self.source, self.output, self.cache)
        self.assertEqual(result['acao'], 'compilar')
        self.assertEqual(len(calls), 2)
        self.assertIn('conferir_pacote_agente.py', calls[1][1])
        self.assertIsNotNone(e.base_validada(Path(result['destino'])))

    def test_reinicio_preserva_overlay_validado_e_recupera_corrompido(self):
        full = self.prepare()
        (self.source / 'frontend/style.css').write_text('painel novo')
        panel = Path(self.prepare()['destino'])
        dest = self.root / 'nova-versao'
        exe = Path(full['destino']) / 'NewProdPiloto.exe'
        e.montar_painel(panel, exe, dest)
        # Extracao do EXE antigo tem data posterior: o mtime nao pode reverter UI.
        (self.source / 'frontend/style.css').write_text('painel embutido antigo')
        for file in (self.source / 'frontend').iterdir():
            os.utime(file, (2000000000, 2000000000))
        tree = ast.parse((e.ROOT / 'app.py').read_text(encoding='utf-8-sig'))
        func = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == '_semear_painel')
        env = {'os': os, 'shutil': shutil}
        exec(compile(ast.Module(body=[func], type_ignores=[]), 'semear-isolado', 'exec'), env)
        with patch('canais_newprod.PILOTO', True), patch.object(sys, 'frozen', True, create=True), \
             patch.object(sys, 'executable', str(dest / exe.name)):
            self.assertTrue(env['_semear_painel'](str(dest / 'painel'), str(self.source / 'frontend')))
            self.assertEqual((dest / 'painel/style.css').read_text(), 'painel novo')
            (dest / 'painel/style.css').write_text('corrompido')
            self.assertFalse(painel_externo_validado(dest / 'painel', dest / exe.name))
            self.assertTrue(env['_semear_painel'](str(dest / 'painel'), str(self.source / 'frontend')))
            self.assertEqual((dest / 'painel/style.css').read_text(), 'painel embutido antigo')


if __name__ == '__main__':
    unittest.main()
