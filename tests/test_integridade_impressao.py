"""Regressões de carregamento: entradas sintéticas, sem rede nem impressora."""
import asyncio
import hashlib
import io
import urllib.request
from pathlib import Path

import fitz
import pytest
from PIL import Image
from engine import ImpositionConfig, ImpositionEngine, TriggerList
from integridade_impressao import validar_uploads, validar_contrato, validar_pdf_para_entrega, RecursosDoTrabalho


@pytest.fixture(autouse=True)
def local(monkeypatch, tmp_path):
    monkeypatch.chdir(tmp_path)
    def proibido(*args, **kwargs):
        raise OSError("rede indisponível simulada")
    monkeypatch.setattr(urllib.request, "urlopen", proibido)


def pdf(path, texto="ARTE", paginas=1):
    with fitz.open() as doc:
        for i in range(paginas):
            page = doc.new_page(width=140, height=140)
            page.insert_text((10, 25), texto + str(i + 1))
        doc.save(path)
    return str(path)


def config(tmp_path, **extra):
    args = dict(base_file="", out_pdf=str(tmp_path / "saida.pdf"),
                formato=dict(width_mm=50, height_mm=50, cols=1, rows=1),
                saida=dict(width_mm=60, height_mm=60), numeracao=None,
                seq_start=1, seq_end=3, entregar_por_bloco=True, sheets_per_block=1)
    args.update(extra)
    return ImpositionConfig(**args)


@pytest.mark.parametrize("modo", ["duplex", "duplex_unico"])
def test_somente_arte_no_verso_preserva_frente_vazia(tmp_path, modo):
    cfg = config(tmp_path, print_mode=modo, base_file_verso=pdf(tmp_path / "v.pdf", "VERSO"))
    motor = ImpositionEngine(cfg)
    motor.process()
    textos = []
    for arq in motor.generated_files:
        with fitz.open(arq["path"]) as doc:
            textos.extend(p.get_text() for p in doc)
    assert len(textos) == 6
    assert all(not textos[i].strip() for i in (0, 2, 4))
    assert all("VERSO1" in textos[i] for i in (1, 3, 5))


@pytest.mark.parametrize("modo", ["duplex", "duplex_unico"])
def test_verso_corrompido_entrega_zero(tmp_path, modo):
    v = tmp_path / "v.pdf"
    v.write_bytes(b"invalido")
    entregas = []
    cfg = config(tmp_path, print_mode=modo, base_file_verso=str(v))
    with pytest.raises(ValueError, match="arte do verso"):
        ImpositionEngine(cfg, entregas.append).process()
    assert not entregas


def test_combinado_segundo_modelo_ausente_entrega_zero(tmp_path):
    artes = [dict(qtd=3, local_path=pdf(tmp_path / "a.pdf")),
             dict(qtd=3, local_path=str(tmp_path / "ausente.pdf"))]
    entregas = []
    with pytest.raises(ValueError, match="arte obrigatória"):
        ImpositionEngine(config(tmp_path, multi_artes=artes), entregas.append).process()
    assert not entregas


def test_combinado_somente_verso_local(tmp_path):
    artes = [dict(qtd=2, local_verso_path=pdf(tmp_path / "v.pdf", "VERSO"))]
    motor = ImpositionEngine(config(tmp_path, multi_artes=artes, print_mode="duplex"))
    motor.process()
    with fitz.open(motor.generated_files[0]["path"]) as doc:
        assert not doc[0].get_text().strip()
        assert "VERSO1" in doc[1].get_text()


@pytest.mark.parametrize("tipo,conteudo", [("PDF", ""), ("PDF", "YWJj"), ("SVG", ""), ("SVG", "<invalid/>")])
def test_elemento_tardio_invalido_entrega_zero(tmp_path, tipo, conteudo):
    el = dict(type=tipo, x_mm=20, y_mm=20, width_mm=20, height_mm=20)
    el["pdf_content" if tipo == "PDF" else "svg_content"] = conteudo
    artes = [dict(qtd=2), dict(qtd=2, numeracao=dict(elements=[el]))]
    entregas = []
    with pytest.raises((ValueError, RuntimeError)):
        ImpositionEngine(config(tmp_path, multi_artes=artes), entregas.append).process()
    assert not entregas


def test_foto_da_ultima_linha_invalida_entrega_zero(tmp_path):
    imagem = tmp_path / "foto.png"
    Image.new("RGB", (20, 20), "blue").save(imagem)
    el = dict(type="FOTO", source="database", csv_column="foto", x_mm=20, y_mm=20, width_mm=20, height_mm=20)
    linhas = [dict(foto=str(imagem)), dict(foto=str(imagem)), dict(foto="https://invalid.test/foto.png")]
    entregas = []
    cfg = config(tmp_path, numeracao=dict(elements=[el]), csv_data=linhas)
    with pytest.raises(ValueError, match="foto obrigatória"):
        ImpositionEngine(cfg, entregas.append).process()
    assert not entregas


def test_fonte_obrigatoria_invalida_entrega_zero(tmp_path):
    el = dict(type="TEXT", _font_data="YWJj", x_mm=20, y_mm=20)
    entregas = []
    with pytest.raises(ValueError, match="Fonte obrigatória"):
        ImpositionEngine(config(tmp_path, numeracao=dict(elements=[el])), entregas.append).process()
    assert not entregas


def test_falha_callback_interrompe_motor(tmp_path):
    tentativas = []
    def entregar(arquivo):
        tentativas.append(arquivo)
        raise OSError("entrega indisponível")
    with pytest.raises(OSError, match="entrega indisponível"):
        ImpositionEngine(config(tmp_path), entregar).process()
    assert len(tentativas) == 1


def test_pdf_invalido_nao_chega_ao_callback(tmp_path):
    arquivo = tmp_path / "saida.pdf"
    arquivo.write_bytes(b"invalid")
    entregas = []
    with pytest.raises(Exception):
        TriggerList(entregas.append).append(dict(path=str(arquivo)))
    assert not entregas


def contrato(conteudo=b"%PDF-test"):
    return dict(formato={}, saida={}, integridade=dict(version=1,
        job_id="12345678-1234-1234-1234-123456789abc", modelos=[], numeracoes=[],
        faces=[dict(front=False, back=True)],
        arquivos=dict(file_verso=dict(size=len(conteudo), sha256=hashlib.sha256(conteudo).hexdigest()))))


class Upload:
    def __init__(self, dados): self.dados = io.BytesIO(dados)
    async def read(self, n=-1): return self.dados.read(n)
    async def seek(self, n): return self.dados.seek(n)


def test_upload_confirmado_e_cursor_rebobinado():
    upload = Upload(b"%PDF-test")
    asyncio.run(validar_uploads(contrato(), dict(file_verso=upload)))
    assert upload.dados.tell() == 0


@pytest.mark.parametrize("formulario", [{}, dict(file_verso=Upload(b"truncado")), dict(file=Upload(b"outro"))])
def test_upload_ausente_corrompido_ou_inesperado_bloqueia(formulario):
    with pytest.raises(ValueError): asyncio.run(validar_uploads(contrato(), formulario))


def test_painel_antigo_bloqueado():
    with pytest.raises(ValueError, match="Atualize o painel"):
        validar_contrato({})


def test_numeracao_exigida_ausente_bloqueia():
    dados = contrato()
    dados["numeracao_id"] = "n1"
    with pytest.raises(ValueError, match="Numeração obrigatória"):
        validar_contrato(dados)


def test_ticket_preserva_celulas_fisicas_e_vias(tmp_path):
    num = dict(tipo="TICKET", ticket_qtd=2, elements=[
        dict(type="TEXT", ticket_pos=1, x_mm=20, y_mm=15, prefix="VIA", font_size=10),
        dict(type="TEXT", ticket_pos=2, x_mm=20, y_mm=30, prefix="VIA", font_size=10)])
    # A faixa contém seis números; QTD física é três, com duas vias por célula.
    cfg = config(tmp_path, numeracao=num, seq_start=51, seq_end=56)
    assert cfg.total_items == 3
    motor = ImpositionEngine(cfg)
    motor.process()
    import re
    numeros = []
    for arquivo in motor.generated_files:
        with fitz.open(arquivo["path"]) as doc:
            for pagina in doc:
                numeros.extend(map(int, re.findall(r"VIA(\d+)", pagina.get_text())))
    assert sorted(numeros) == list(range(51, 57))


def test_hash_conferido_novamente_antes_do_dispositivo(tmp_path):
    conteudo = Path(pdf(tmp_path / "arte.pdf")).read_bytes()
    digest = hashlib.sha256(conteudo).hexdigest()
    validar_pdf_para_entrega(conteudo, digest)
    with pytest.raises(ValueError, match="Integridade"):
        validar_pdf_para_entrega(conteudo[:-20], digest)


def test_cache_em_disco_detecta_alteracao_e_limpa(tmp_path, monkeypatch):
    import newprod_temp
    monkeypatch.setattr(newprod_temp, "pasta_raiz", lambda: tmp_path / "recursos")
    recursos = RecursosDoTrabalho()
    recursos["foto"] = b"sintetico"
    assert recursos["foto"] == b"sintetico"
    caminho = Path(recursos._entradas["foto"][0])
    caminho.write_bytes(b"modificado")
    with pytest.raises(ValueError, match="alterado"):
        recursos["foto"]
    recursos.close()
    assert not caminho.exists()


def test_disco_sem_capacidade_entrega_zero(tmp_path, monkeypatch):
    import integridade_impressao
    from types import SimpleNamespace
    monkeypatch.setattr(integridade_impressao.shutil, "disk_usage", lambda _: SimpleNamespace(free=1))
    entregas = []
    with pytest.raises(ValueError, match="Espaço insuficiente"):
        ImpositionEngine(config(tmp_path), entregas.append).process()
    assert not entregas
