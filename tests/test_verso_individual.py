"""Pedido 21869: FxVerso individual com duas artes de uma pagina, sem rede."""
import re
import subprocess
import urllib.request
from pathlib import Path

import fitz
import pytest

from engine import ImpositionConfig, ImpositionEngine, MM2PT

RAIZ = Path(__file__).resolve().parents[1]


@pytest.fixture(autouse=True)
def somente_local(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)

    def sem_rede(*args, **kwargs):
        raise AssertionError("Teste somente local")

    monkeypatch.setattr(urllib.request, "urlopen", sem_rede)


def arte(path, textos):
    with fitz.open() as doc:
        for texto in textos:
            p = doc.new_page(width=100 * MM2PT, height=50 * MM2PT)
            p.draw_rect(fitz.Rect(5, 5, 25, 25), fill=(0, 0, 1))
            p.insert_text((35, 25), texto, fontsize=10)
        doc.save(path)
    return str(path)


def config(tmp_path, modo="duplex", paginas=None, verso=True, schema="sequential"):
    return ImpositionConfig(
        base_file=arte(tmp_path / "frente.pdf", paginas or ["ARTE-FRENTE"]),
        base_file_verso=arte(tmp_path / "verso.pdf", ["ARTE-VERSO"]) if verso else None,
        out_pdf=str(tmp_path / "saida.pdf"),
        formato={"width_mm": 100, "height_mm": 50, "cols": 2, "rows": 1},
        numeracao={"tipo": "SEQUENCIAL", "print_mode": modo, "elements": [
            {"type": "TEXT", "face": "back", "prefix": "NV", "font_size": 10,
             "x_mm": 30, "y_mm": 35}]},
        saida={"width_mm": 220, "height_mm": 70, "file_format": "pdf"},
        print_mode=modo, seq_start=1, seq_end=4,
        layout_schema=schema, sheets_per_block=2, cut_stack_mode="strict_assembly",
    )


@pytest.mark.parametrize("schema", ["sequential", "cut_stack"])
def test_arte_e_numeracao_saem_juntas_no_verso(tmp_path, schema):
    cfg = config(tmp_path, schema=schema)
    motor = ImpositionEngine(cfg)
    motor.process()
    numeros = []
    total_frentes = total_versos = 0
    for arquivo in motor.generated_files:
        with fitz.open(arquivo["path"]) as doc:
            for i, page in enumerate(doc):
                texto = page.get_text()
                if i % 2:
                    assert texto.count("ARTE-VERSO") == 2
                    assert "ARTE-FRENTE" not in texto
                    total_versos += texto.count("ARTE-VERSO")
                    numeros.extend(map(int, re.findall(r"NV(\d+)", texto)))
                    # A marca vetorial azul precisa estar no PDF final tambem.
                    assert any(d.get("fill") == (0, 0, 1) for d in page.get_drawings())
                else:
                    assert texto.count("ARTE-FRENTE") == 2
                    assert "ARTE-VERSO" not in texto
                    total_frentes += texto.count("ARTE-FRENTE")
    assert total_frentes == total_versos == 4
    assert sorted(numeros) == [1, 2, 3, 4]


@pytest.mark.parametrize("modo,paginas,verso,esperado", [
    ("duplex", ["F"], True, ["F", "ARTE-VERSO"]),
    ("duplex", ["F", "VERSO-EMBUTIDO"], True, ["F", "VERSO-EMBUTIDO"]),
    ("duplex", ["F"], False, ["F"]),
    ("front", ["F"], True, ["F"]),
    ("duplex_unico", ["F1", "F2"], True, ["F1", "F2", "ARTE-VERSO"]),
])
def test_preserva_modos_e_verso_embutido(tmp_path, modo, paginas, verso, esperado):
    cfg = config(tmp_path, modo=modo, paginas=paginas, verso=verso)
    with ImpositionEngine(cfg)._load_base_as_pdf() as doc:
        assert [p.get_text().strip() for p in doc] == esperado


def test_verso_invalido_nao_gera_trabalho_incompleto(tmp_path):
    cfg = config(tmp_path)
    Path(cfg.base_file_verso).write_bytes(b"PDF invalido")
    with pytest.raises(ValueError, match="arte do verso"):
        ImpositionEngine(cfg).process()
    assert not Path(cfg.out_pdf).exists()


@pytest.mark.parametrize("arquivo", ["pedido.js", "script.js"])
def test_upload_envia_verso_nos_dois_modos_duplex(arquivo):
    # Executa o bloco real de FormData com as funcoes reais de modo.
    js = r"""
const fs = require('fs'), vm = require('vm'), assert = require('assert');
const src = fs.readFileSync(process.argv[1], 'utf8');
const helpers = ['temVerso', 'versoUnico'].map(name =>
    src.match(new RegExp('function ' + name + '\\(printMode\\)\\s*\\{[\\s\\S]*?\\n\\}'))[0]).join('\n');
const upload = src.indexOf("formData.append('file_verso'");
const start = src.lastIndexOf('\n    if (', upload);
const end = src.indexOf('\n    }', upload) + 6;
const bloco = src.slice(start, end);
for (const print_mode of ['front', 'duplex', 'duplex_unico']) {
  for (const presente of [true, false]) {
    for (const isPedTab of [true, false]) {
      const sent = [];
      const file = presente ? 'verso.pdf' : null;
      vm.runInNewContext(helpers + bloco, {
        payload: {print_mode}, isPedTab,
        state: {pedArtVersoFile:file, impArtVersoFile:file},
        formData: {append:(...args) => sent.push(args)}
      });
      assert.deepStrictEqual(sent, presente && print_mode !== 'front'
        ? [['file_verso', 'verso.pdf']] : [], print_mode);
    }
  }
}
"""
    result = subprocess.run(["node", "-e", js, str(RAIZ / "frontend" / arquivo)],
                            capture_output=True, text=True, timeout=30)
    assert result.returncode == 0, result.stdout + result.stderr
