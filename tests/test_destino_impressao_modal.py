"""O modal envia o PDF ao agente mesmo aberto pelo dominio da nuvem."""
from pathlib import Path
import subprocess


def test_modal_usa_agente_e_informa_falha_sem_reenviar():
    root = Path(__file__).resolve().parents[1]
    js = r"""
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('frontend/script.js', 'utf8');
const start = source.indexOf('async function sendPrintJob() {');
const fn = source.slice(start, source.indexOf('\n}', start) + 2);
const base = source.match(/const AGENTE_LOCAL_URL = '[^']+';/)[0];
(async () => {
  for (const hostname of ['imposition.ai-ideal.com.br', '127.0.0.1']) {
    for (const success of [true, false]) {
      const calls = [], messages = [];
      const ctx = vm.createContext({
        window: { location: { hostname } },
        document: {
          getElementById: id => id === 'print-direct-printer' ? { value: 'Impressora ficticia' } : null,
          querySelector: () => null,
        },
        _printBlobQueue: [{ name: 'teste.pdf', blob: new Blob(['ficticio']) }],
        FormData, AGENTE_LOCAL_URL: undefined,
        nomeParaSpool: (i, name) => name,
        toast: (message, type) => messages.push({ message, type }),
        setTimeout: () => {}, console: { error: () => {} },
        fetch: async (url, options) => {
          calls.push(url);
          assert.equal(options.method, 'POST');
          assert.equal(options.body.get('printer_name'), 'Impressora ficticia');
          return { ok: success, text: async () => 'Falha simulada' };
        },
      });
      vm.runInContext(base + '\n' + fn, ctx);
      await ctx.sendPrintJob();
      assert.deepEqual(calls, ['http://127.0.0.1:9000/api/print/submit']);
      assert(messages.some(m => m.type === (success ? 'success' : 'error')));
    }
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
"""
    result = subprocess.run(["node", "-e", js], cwd=root, capture_output=True,
                            text=True, encoding="utf-8", timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
