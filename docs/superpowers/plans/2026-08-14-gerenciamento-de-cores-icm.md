# Gerenciamento de Cores com Perfis .icm — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Embutir OutputIntent sRGB nos PDFs gerados pelo engine e aplicar o perfil .icm da impressora de destino nos três modos de impressão (GDI, Ghostscript, PDF RAW), com cadastro de perfis por impressora.

**Architecture:** Um módulo novo `color_profiles.py` concentra tudo de ICC (pasta de perfis, mapa impressora→perfil, geração do sRGB, validação, OutputIntent, argumentos GS, transformações LittleCMS). O `engine.py` só ganha um wrapper de save; o `print_service.py` consome o módulo em cada estratégia; `app.py`/`local_print_agent.py` ganham endpoints finos; o frontend ganha a box "Gerenciamento de Cores" na janela de impressão.

**Tech Stack:** Python 3.14, PyMuPDF 1.27 (baixo nível: `get_new_xref`/`update_object`/`update_stream`/`xref_set_key`), Pillow 12 `ImageCms` (LittleCMS), Ghostscript (flags ICC), FastAPI, JS vanilla no frontend.

## Global Constraints

- **Sem perfil configurado, comportamento idêntico ao de hoje** — nenhuma regressão no caminho aprovado.
- **Nunca bloquear a produção**: perfil sumido/corrompido na hora de imprimir gera aviso na mensagem de retorno e imprime sem gerenciamento.
- Tudo roda **local, na estação** — nada de conversão na nuvem (requisito de tempo da gráfica).
- Comentários e mensagens em português, no estilo do código existente (sem acento em código Python legado que evita, mas strings de UI com acento).
- Trabalho direto na branch `main` (preferência do usuário), commits frequentes.
- Ao final: `engine.py`, `print_service.py`, `app.py`, `color_profiles.py` e frontend são embutidos no executável — **site e agente publicam na mesma leva, com versão nova do agente** (publicação é ação do usuário).
- O sRGB não é distribuído como arquivo: é gerado em runtime por `ImageCms.createProfile("sRGB")` (588 bytes, validado).
- Validação prévia (já executada em scratch): OutputIntent embutido via xref sobrevive a `doc.save(garbage=4, deflate=True)` no PyMuPDF 1.27.2.

---

### Task 1: Módulo `color_profiles.py` + testes

**Files:**
- Create: `color_profiles.py`
- Create: `tests/test_color_profiles.py`
- Modify: `.gitignore` (adicionar `perfis_icc/` e `printer_icc_map.json`)

**Interfaces:**
- Produces (usadas pelas tasks 2–5):
  - `ICC_DIR: str` (= `"perfis_icc"`), `PRINTER_ICC_MAP_FILE: str` (= `"printer_icc_map.json"`)
  - `srgb_icc_bytes() -> bytes`
  - `perfil_info(path: str) -> dict` — `{"filename", "nome", "classe"}`; levanta `ValueError` com mensagem clara
  - `listar_perfis() -> list[dict]`
  - `load_printer_icc_map() -> dict` / `save_printer_icc_map(mapping: dict) -> None`
  - `resolver_config(printer_name: str) -> tuple[dict|None, str|None]` — `({"path","intento","classe","nome"}, aviso)`
  - `embutir_output_intent(doc: fitz.Document, icc_bytes: bytes, nome: str, classe: str) -> None`
  - `pdf_com_output_intent(pdf_path: str, cfg: dict) -> str` — devolve caminho de PDF temporário com o perfil da impressora embutido
  - `args_ghostscript(cfg: dict|None) -> list[str]`
  - `transform_para_gdi(cfg: dict)` — transformação LittleCMS pronta para `ImageCms.applyTransform`

- [ ] **Step 1: Escrever os testes que falham**

```python
# tests/test_color_profiles.py
"""Testes do modulo de gerenciamento de cores (perfis ICC por impressora).

Os perfis de teste sao gerados pelo proprio LittleCMS (sRGB), entao nao ha
binario de teste a versionar. A classe CMYK nao tem como ser sintetizada pelo
Pillow; os ramos CMYK sao cobertos passando um cfg montado a mao.
"""
import json
import os
import sys

import fitz
import pytest
from PIL import ImageCms

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import color_profiles as cp


@pytest.fixture
def icc_dir(tmp_path, monkeypatch):
    d = tmp_path / "perfis_icc"
    d.mkdir()
    monkeypatch.setattr(cp, "ICC_DIR", str(d))
    monkeypatch.setattr(cp, "PRINTER_ICC_MAP_FILE", str(tmp_path / "printer_icc_map.json"))
    return d


def _gravar_srgb(icc_dir, nome="teste_srgb.icm"):
    caminho = os.path.join(str(icc_dir), nome)
    with open(caminho, "wb") as f:
        f.write(cp.srgb_icc_bytes())
    return caminho


def test_srgb_icc_bytes_e_um_perfil_valido():
    dados = cp.srgb_icc_bytes()
    assert len(dados) > 100
    # O proprio LittleCMS precisa conseguir reler o que gerou
    import io
    prof = ImageCms.ImageCmsProfile(io.BytesIO(dados))
    assert "RGB" in (prof.profile.xcolor_space or "").upper()


def test_perfil_info_descreve_um_perfil_bom(icc_dir):
    caminho = _gravar_srgb(icc_dir)
    info = cp.perfil_info(caminho)
    assert info["filename"] == "teste_srgb.icm"
    assert info["classe"] == "RGB"
    assert info["nome"]  # nome interno legivel, nunca vazio


def test_perfil_corrompido_e_recusado_com_mensagem_clara(icc_dir):
    caminho = os.path.join(str(icc_dir), "lixo.icm")
    with open(caminho, "wb") as f:
        f.write(b"isto nao e um perfil ICC")
    with pytest.raises(ValueError, match="ICC"):
        cp.perfil_info(caminho)


def test_listar_perfis_ignora_extensoes_estranhas_e_marca_invalidos(icc_dir):
    _gravar_srgb(icc_dir, "bom.icc")
    with open(os.path.join(str(icc_dir), "quebrado.icm"), "wb") as f:
        f.write(b"x")
    with open(os.path.join(str(icc_dir), "leiame.txt"), "w") as f:
        f.write("nada a ver")
    perfis = cp.listar_perfis()
    nomes = {p["filename"] for p in perfis}
    assert nomes == {"bom.icc", "quebrado.icm"}
    quebrado = next(p for p in perfis if p["filename"] == "quebrado.icm")
    assert quebrado.get("erro")


def test_mapa_de_impressoras_grava_e_rele(icc_dir):
    cp.save_printer_icc_map({"Xerox": {"perfil": "bom.icc", "intento": "relativo", "ativo": True}})
    m = cp.load_printer_icc_map()
    assert m["Xerox"]["perfil"] == "bom.icc"


def test_resolver_config_sem_cadastro_devolve_none_sem_aviso(icc_dir):
    cfg, aviso = cp.resolver_config("Impressora Sem Cadastro")
    assert cfg is None and aviso is None


def test_resolver_config_desligado_devolve_none_sem_aviso(icc_dir):
    _gravar_srgb(icc_dir, "bom.icc")
    cp.save_printer_icc_map({"X": {"perfil": "bom.icc", "intento": "relativo", "ativo": False}})
    cfg, aviso = cp.resolver_config("X")
    assert cfg is None and aviso is None


def test_resolver_config_ativo_devolve_config_completo(icc_dir):
    _gravar_srgb(icc_dir, "bom.icc")
    cp.save_printer_icc_map({"X": {"perfil": "bom.icc", "intento": "perceptual", "ativo": True}})
    cfg, aviso = cp.resolver_config("X")
    assert aviso is None
    assert cfg["classe"] == "RGB"
    assert cfg["intento"] == "perceptual"
    assert os.path.isfile(cfg["path"])


def test_resolver_config_perfil_sumido_avisa_e_nao_bloqueia(icc_dir):
    cp.save_printer_icc_map({"X": {"perfil": "sumiu.icm", "intento": "relativo", "ativo": True}})
    cfg, aviso = cp.resolver_config("X")
    assert cfg is None
    assert "SEM gerenciamento" in aviso


def test_embutir_output_intent_sobrevive_ao_save_com_garbage(tmp_path):
    doc = fitz.open()
    page = doc.new_page(width=200, height=200)
    page.draw_rect(fitz.Rect(10, 10, 100, 100), color=(1, 0, 0), fill=(1, 0, 0))
    cp.embutir_output_intent(doc, cp.srgb_icc_bytes(), "sRGB IEC61966-2.1", "RGB")
    out = str(tmp_path / "oi.pdf")
    doc.save(out, garbage=4, deflate=True)
    doc.close()

    relido = fitz.open(out)
    cat = relido.xref_object(relido.pdf_catalog())
    assert "OutputIntents" in cat


def test_pdf_com_output_intent_gera_temporario_com_intent(icc_dir, tmp_path):
    caminho = _gravar_srgb(icc_dir, "bom.icc")
    origem = str(tmp_path / "origem.pdf")
    d = fitz.open(); d.new_page(); d.save(origem); d.close()

    cfg = {"path": caminho, "intento": "relativo", "classe": "RGB", "nome": "sRGB"}
    novo = cp.pdf_com_output_intent(origem, cfg)
    try:
        assert novo != origem
        relido = fitz.open(novo)
        assert "OutputIntents" in relido.xref_object(relido.pdf_catalog())
        relido.close()
    finally:
        os.remove(novo)


def test_args_ghostscript_sem_config_e_vazio():
    assert cp.args_ghostscript(None) == []


def test_args_ghostscript_rgb_perceptual():
    cfg = {"path": "C:/x/p.icm", "intento": "perceptual", "classe": "RGB", "nome": "P"}
    args = cp.args_ghostscript(cfg)
    assert "-sOutputICCProfile=C:/x/p.icm" in args
    assert "-sColorConversionStrategy=RGB" in args
    assert "-dRenderIntent=0" in args
    assert not any("BlackPtComp" in a for a in args)


def test_args_ghostscript_cmyk_relativo_liga_compensacao_de_ponto_preto():
    cfg = {"path": "C:/x/p.icm", "intento": "relativo", "classe": "CMYK", "nome": "P"}
    args = cp.args_ghostscript(cfg)
    assert "-sColorConversionStrategy=CMYK" in args
    assert "-dRenderIntent=1" in args
    assert "-dBlackPtComp=1" in args


def test_transform_para_gdi_rgb_transforma_uma_imagem(icc_dir):
    from PIL import Image
    caminho = _gravar_srgb(icc_dir, "bom.icc")
    cfg = {"path": caminho, "intento": "relativo", "classe": "RGB", "nome": "sRGB"}
    t = cp.transform_para_gdi(cfg)
    img = Image.new("RGB", (8, 8), (200, 30, 30))
    resultado = ImageCms.applyTransform(img, t)
    assert resultado.size == (8, 8)
    assert resultado.mode == "RGB"
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `python -m pytest tests/test_color_profiles.py -v`
Expected: FAIL/ERROR com `ModuleNotFoundError: No module named 'color_profiles'`

- [ ] **Step 3: Implementar `color_profiles.py`**

```python
"""Gerenciamento de cores: perfis ICC (.icm/.icc) por impressora.

A cor e tratada em dois momentos, sem tocar no desenho do motor:
- na GERACAO o engine embute um OutputIntent sRGB no PDF imposto, declarando a
  qualquer RIP o que o RGB significa;
- na IMPRESSAO o print_service aplica o perfil da impressora de destino, do
  jeito certo para cada estrategia (GDI, Ghostscript, PDF RAW).

Este modulo concentra tudo de ICC: a pasta de perfis (perfis_icc/, mesmo padrao
da pasta ppds/), o mapa impressora->perfil (printer_icc_map.json, mesmo padrao
do printer_ppd_map.json) e as funcoes que engine e print_service usam.

Regra de ouro: sem perfil configurado, NADA muda — quem chama recebe None e
imprime como sempre imprimiu. Perfil sumido ou corrompido na hora de imprimir
gera aviso e imprime sem gerenciamento; nunca bloqueia a producao.
"""
import io
import json
import os
import tempfile

import fitz  # PyMuPDF
from PIL import ImageCms

ICC_DIR = "perfis_icc"
os.makedirs(ICC_DIR, exist_ok=True)
PRINTER_ICC_MAP_FILE = "printer_icc_map.json"

INTENTOS = ("perceptual", "relativo")
_INTENTO_GS = {"perceptual": 0, "relativo": 1}

_srgb_cache = None


def srgb_icc_bytes() -> bytes:
    """Perfil sRGB IEC61966-2.1 gerado pelo LittleCMS em runtime (~600 bytes).

    Gerar em vez de distribuir evita carregar um arquivo no executavel e a
    duvida de licenca de redistribuicao do perfil da HP/Microsoft.
    """
    global _srgb_cache
    if _srgb_cache is None:
        _srgb_cache = ImageCms.ImageCmsProfile(ImageCms.createProfile("sRGB")).tobytes()
    return _srgb_cache


def perfil_info(path: str) -> dict:
    """Valida um perfil e devolve filename, nome interno e classe (RGB/CMYK).

    Levanta ValueError com mensagem pronta para a tela quando o arquivo nao e
    um perfil ICC ou e de uma classe que nao serve para impressao aqui.
    """
    try:
        prof = ImageCms.ImageCmsProfile(path)
    except Exception:
        raise ValueError("O arquivo nao e um perfil ICC valido (corrompido ou de outro tipo).")
    classe = (prof.profile.xcolor_space or "").strip().upper()
    if classe not in ("RGB", "CMYK"):
        raise ValueError(
            f"Perfil de classe '{classe or 'desconhecida'}' nao serve para impressao aqui: "
            "use um perfil RGB ou CMYK da impressora."
        )
    nome = (prof.profile.profile_description or "").strip() or os.path.basename(path)
    return {"filename": os.path.basename(path), "nome": nome, "classe": classe}


def listar_perfis() -> list:
    """Todos os .icc/.icm da pasta, com nome interno e classe.

    Perfil invalido aparece na lista com o campo 'erro' em vez de sumir: o
    operador precisa VER que o arquivo que subiu nao presta, nao adivinhar.
    """
    perfis = []
    if not os.path.isdir(ICC_DIR):
        return perfis
    for f in sorted(os.listdir(ICC_DIR)):
        if not f.lower().endswith((".icc", ".icm")):
            continue
        try:
            perfis.append(perfil_info(os.path.join(ICC_DIR, f)))
        except ValueError as e:
            perfis.append({"filename": f, "nome": f, "classe": None, "erro": str(e)})
    return perfis


def load_printer_icc_map() -> dict:
    if os.path.exists(PRINTER_ICC_MAP_FILE):
        try:
            with open(PRINTER_ICC_MAP_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return {}
    return {}


def save_printer_icc_map(mapping: dict) -> None:
    with open(PRINTER_ICC_MAP_FILE, "w", encoding="utf-8") as f:
        json.dump(mapping, f, indent=4, ensure_ascii=False)


def resolver_config(printer_name: str):
    """Config de cor pronto para uso na impressao: (cfg, aviso).

    - Sem cadastro, desligado ou sem perfil escolhido -> (None, None): imprime
      como hoje, sem aviso — e o estado normal de quem nao usa o recurso.
    - Perfil sumido ou corrompido -> (None, aviso): imprime sem gerenciamento
      e o aviso segue na mensagem de retorno da impressao.
    """
    m = load_printer_icc_map().get(printer_name)
    if not m or not m.get("ativo") or not m.get("perfil"):
        return None, None
    path = os.path.join(ICC_DIR, m["perfil"])
    if not os.path.isfile(path):
        return None, (f"Perfil '{m['perfil']}' nao encontrado na pasta {ICC_DIR}; "
                      "a impressao saiu SEM gerenciamento de cores.")
    try:
        info = perfil_info(path)
    except ValueError as e:
        return None, (f"Perfil '{m['perfil']}' invalido ({e}); "
                      "a impressao saiu SEM gerenciamento de cores.")
    intento = m.get("intento") if m.get("intento") in INTENTOS else "relativo"
    return {"path": path, "intento": intento, "classe": info["classe"], "nome": info["nome"]}, None


def embutir_output_intent(doc, icc_bytes: bytes, nome: str, classe: str) -> None:
    """Grava um OutputIntent no catalogo do PDF aberto no PyMuPDF.

    Baixo nivel de proposito: o PyMuPDF nao tem API de OutputIntent. O objeto
    referenciado a partir do catalogo sobrevive ao save com garbage=4
    (validado no PyMuPDF 1.27.2).
    """
    n = 4 if classe == "CMYK" else 3
    alternate = "/DeviceCMYK" if classe == "CMYK" else "/DeviceRGB"
    x = doc.get_new_xref()
    doc.update_object(x, f"<</N {n}/Alternate {alternate}>>")
    doc.update_stream(x, icc_bytes, new=True)
    oi = doc.get_new_xref()
    # Parenteses e barras quebrariam a string literal do PDF
    nome_pdf = nome.replace("\\", "").replace("(", "[").replace(")", "]")
    doc.update_object(
        oi,
        f"<</Type/OutputIntent/S/GTS_PDFA1"
        f"/OutputConditionIdentifier({nome_pdf})/Info({nome_pdf})"
        f"/DestOutputProfile {x} 0 R>>",
    )
    doc.xref_set_key(doc.pdf_catalog(), "OutputIntents", f"[{oi} 0 R]")


def pdf_com_output_intent(pdf_path: str, cfg: dict) -> str:
    """Copia temporaria do PDF com o perfil da impressora como OutputIntent.

    Usada no modo PDF RAW: a controladora (Fiery, Konica, Ricoh) le o intent e
    converte no RIP dela. Quem chama e responsavel por apagar o temporario.
    """
    with open(cfg["path"], "rb") as f:
        icc = f.read()
    doc = fitz.open(pdf_path)
    embutir_output_intent(doc, icc, cfg["nome"], cfg["classe"])
    fd, tmp = tempfile.mkstemp(suffix=".pdf")
    os.close(fd)
    doc.save(tmp, garbage=4, deflate=True)
    doc.close()
    return tmp


def args_ghostscript(cfg) -> list:
    """Flags ICC para o comando Ghostscript; lista vazia sem config."""
    if not cfg:
        return []
    estrategia = "CMYK" if cfg["classe"] == "CMYK" else "RGB"
    args = [
        f"-sOutputICCProfile={cfg['path']}",
        f"-sColorConversionStrategy={estrategia}",
        f"-dRenderIntent={_INTENTO_GS[cfg['intento']]}",
    ]
    if cfg["intento"] == "relativo":
        args.append("-dBlackPtComp=1")
    return args


def transform_para_gdi(cfg):
    """Transformacao LittleCMS para o raster do GDI (RGB de entrada e saida).

    - Perfil RGB: conversao direta sRGB -> perfil da impressora.
    - Perfil CMYK: o driver GDI so aceita RGB, entao usamos a transformacao de
      prova (sRGB -> CMYK -> sRGB), que assa o gamut e o comportamento da
      impressora no raster entregue ao driver.
    A transformacao e criada UMA vez por trabalho e reaproveitada em todas as
    folhas — criar por folha desperdicaria tempo do operador.
    """
    srgb = ImageCms.createProfile("sRGB")
    destino = ImageCms.ImageCmsProfile(cfg["path"])
    intento = (ImageCms.Intent.PERCEPTUAL if cfg["intento"] == "perceptual"
               else ImageCms.Intent.RELATIVE_COLORIMETRIC)
    flags = ImageCms.Flags.NONE
    if cfg["intento"] == "relativo":
        flags |= ImageCms.Flags.BLACKPOINTCOMPENSATION
    if cfg["classe"] == "CMYK":
        return ImageCms.buildProofTransform(
            srgb, srgb, destino, "RGB", "RGB",
            renderingIntent=ImageCms.Intent.RELATIVE_COLORIMETRIC,
            proofRenderingIntent=intento,
            flags=flags | ImageCms.Flags.SOFTPROOFING,
        )
    return ImageCms.buildTransform(srgb, destino, "RGB", "RGB",
                                   renderingIntent=intento, flags=flags)
```

- [ ] **Step 4: Adicionar ao `.gitignore`**

Acrescentar duas linhas (perto de onde `printer_ppd_map.json` estiver, se estiver; senão no bloco de dados locais):

```
perfis_icc/
printer_icc_map.json
```

- [ ] **Step 5: Rodar os testes e confirmar que passam**

Run: `python -m pytest tests/test_color_profiles.py -v`
Expected: todos PASS

- [ ] **Step 6: Commit**

```powershell
git add color_profiles.py tests/test_color_profiles.py .gitignore
git commit -m @'
feat(cores): modulo de perfis ICC por impressora

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 2: OutputIntent sRGB na geração (`engine.py`)

**Files:**
- Modify: `engine.py` (import + wrapper `_salvar_pdf` + 9 pontos de save)
- Create: `tests/test_engine_output_intent.py`

**Interfaces:**
- Consumes: `color_profiles.srgb_icc_bytes()`, `color_profiles.embutir_output_intent(doc, icc_bytes, nome, classe)`
- Produces: função de módulo `_salvar_pdf(doc, out_name)` em `engine.py` — substitui todos os `X.save(out, garbage=4, deflate=True)` de PDFs de saída.

- [ ] **Step 1: Escrever o teste que falha**

```python
# tests/test_engine_output_intent.py
"""Todo PDF que o engine grava sai com OutputIntent sRGB.

O OutputIntent declara ao RIP o que o RGB do arquivo significa. Sem ele a
controladora chuta (em geral sRGB/SWOP de fabrica) — com ele, o chute vira
informacao. O teste cobre o wrapper _salvar_pdf, que e o funil unico de
gravacao de PDF do engine.
"""
import os
import sys

import fitz

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import engine


def test_salvar_pdf_embute_output_intent_srgb(tmp_path):
    doc = fitz.open()
    page = doc.new_page(width=300, height=300)
    page.draw_rect(fitz.Rect(20, 20, 120, 120), color=(0, 0, 1), fill=(0, 0, 1))
    out = str(tmp_path / "saida.pdf")

    engine._salvar_pdf(doc, out)
    doc.close()

    relido = fitz.open(out)
    cat = relido.xref_object(relido.pdf_catalog())
    assert "OutputIntents" in cat
    # O desenho continua la: o wrapper so acrescenta metadado
    assert relido[0].get_drawings()


def test_salvar_pdf_nao_quebra_se_o_intent_falhar(tmp_path, monkeypatch):
    """Producao nunca para por causa de metadado de cor."""
    import color_profiles as cp

    def explode(*a, **k):
        raise RuntimeError("falha simulada")

    monkeypatch.setattr(cp, "embutir_output_intent", explode)
    doc = fitz.open()
    doc.new_page()
    out = str(tmp_path / "saida.pdf")
    engine._salvar_pdf(doc, out)  # nao levanta
    doc.close()
    assert os.path.getsize(out) > 0


def test_todos_os_saves_de_pdf_do_engine_passam_pelo_wrapper():
    """Nenhum save de PDF de saida pode escapar do funil do OutputIntent.

    Se um save novo aparecer fora do wrapper, este teste acusa antes de o
    PDF sair sem intent para a grafica.
    """
    src = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                            "engine.py"), encoding="utf-8").read()
    # O unico .save(..., garbage=4, ...) permitido e o de dentro do wrapper
    ocorrencias = [l for l in src.splitlines() if "garbage=4" in l]
    assert len(ocorrencias) == 1, (
        f"Save de PDF fora do _salvar_pdf: {ocorrencias}"
    )
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `python -m pytest tests/test_engine_output_intent.py -v`
Expected: FAIL com `AttributeError: module 'engine' has no attribute '_salvar_pdf'`

- [ ] **Step 3: Implementar o wrapper em `engine.py`**

Junto aos imports do topo do arquivo, acrescentar:

```python
import color_profiles
```

Logo antes da classe `ImpositionConfig` (funções utilitárias de módulo), acrescentar:

```python
def _salvar_pdf(doc, out_name):
    """Funil unico de gravacao dos PDFs de saida do engine.

    Embute o OutputIntent sRGB (declara ao RIP o que o RGB significa) e so
    entao grava. Falha no metadado nao pode parar a producao: o PDF sai sem
    intent e o aviso vai para o log.
    """
    try:
        color_profiles.embutir_output_intent(
            doc, color_profiles.srgb_icc_bytes(), "sRGB IEC61966-2.1", "RGB")
    except Exception as e:
        print(f"[engine] aviso: OutputIntent sRGB nao embutido: {e}")
    doc.save(out_name, garbage=4, deflate=True)
```

Substituir **todos os 9 pontos** de save de PDF (linhas atuais 2037, 2102, 2145, 2582, 2588, 2607, 2757, 3079, 3203 — confirmar com grep, os números mudam):

- `doc_out.save(out_name, garbage=4, deflate=True)` → `_salvar_pdf(doc_out, out_name)`
- `doc_out.save(cfg.out_pdf, garbage=4, deflate=True)` → `_salvar_pdf(doc_out, cfg.out_pdf)`
- `doc_c.save(out_name, garbage=4, deflate=True)` → `_salvar_pdf(doc_c, out_name)`

(O `img.save(buf, format="PNG")` da linha ~283 é Pillow, não PDF — **não tocar**.)

Run para conferir a substituição: `python -c "import re; s=open('engine.py',encoding='utf-8').read(); print(len(re.findall(r'garbage=4', s)))"`
Expected: `1`

- [ ] **Step 4: Rodar o teste novo e a suíte de engine inteira**

Run: `python -m pytest tests/test_engine_output_intent.py tests/ -k "engine" -v`
Expected: todos PASS (as suítes existentes de engine garantem que o desenho não mudou)

- [ ] **Step 5: Commit**

```powershell
git add engine.py tests/test_engine_output_intent.py
git commit -m @'
feat(cores): PDFs do engine saem com OutputIntent sRGB

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 3: Aplicar o perfil da impressora nos três modos (`print_service.py`)

**Files:**
- Modify: `print_service.py` (`_send_pdf_raw`, `_send_ps_ghostscript`, `_send_gdi_raster`, `send_print_job_windows`)
- Create: `tests/test_print_service_cores.py`

**Interfaces:**
- Consumes: `color_profiles.resolver_config(printer_name)`, `args_ghostscript(cfg)`, `transform_para_gdi(cfg)`, `pdf_com_output_intent(pdf_path, cfg)`
- Produces: as três funções internas ganham parâmetro final `cor_cfg=None`; `send_print_job_windows` resolve a config uma vez e anexa `aviso` à mensagem de retorno.

- [ ] **Step 1: Escrever os testes que falham**

```python
# tests/test_print_service_cores.py
"""O print_service resolve a config de cor por impressora e nunca bloqueia.

O envio real ao spooler e win32/hardware e nao roda em CI; aqui se testa o
que da para testar sem impressora: a resolucao da config, o aviso quando o
perfil sumiu, e o mock path (HAS_WIN32=False) continuar funcionando com e
sem perfil.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import color_profiles as cp
import print_service


@pytest.fixture
def icc_dir(tmp_path, monkeypatch):
    d = tmp_path / "perfis_icc"
    d.mkdir()
    monkeypatch.setattr(cp, "ICC_DIR", str(d))
    monkeypatch.setattr(cp, "PRINTER_ICC_MAP_FILE", str(tmp_path / "printer_icc_map.json"))
    return d


def _gravar_srgb(icc_dir, nome="p.icm"):
    caminho = os.path.join(str(icc_dir), nome)
    with open(caminho, "wb") as f:
        f.write(cp.srgb_icc_bytes())
    return caminho


def _pdf_min(tmp_path):
    import fitz
    p = str(tmp_path / "min.pdf")
    d = fitz.open(); d.new_page(); d.save(p); d.close()
    return p


def test_sem_perfil_o_mock_imprime_como_sempre(icc_dir, tmp_path, monkeypatch):
    monkeypatch.setattr(print_service, "HAS_WIN32", False)
    ok, msg = print_service.send_print_job_windows(
        "Qualquer", _pdf_min(tmp_path), {"print_mode": "gdi"})
    assert ok
    assert "SEM gerenciamento" not in msg


def test_perfil_sumido_avisa_na_mensagem_mas_imprime(icc_dir, tmp_path, monkeypatch):
    monkeypatch.setattr(print_service, "HAS_WIN32", False)
    cp.save_printer_icc_map({"X": {"perfil": "sumiu.icm", "intento": "relativo", "ativo": True}})
    ok, msg = print_service.send_print_job_windows(
        "X", _pdf_min(tmp_path), {"print_mode": "gdi"})
    assert ok
    assert "SEM gerenciamento" in msg


def test_perfil_ativo_no_mock_nao_quebra(icc_dir, tmp_path, monkeypatch):
    monkeypatch.setattr(print_service, "HAS_WIN32", False)
    _gravar_srgb(icc_dir)
    cp.save_printer_icc_map({"X": {"perfil": "p.icm", "intento": "relativo", "ativo": True}})
    ok, msg = print_service.send_print_job_windows(
        "X", _pdf_min(tmp_path), {"print_mode": "gdi"})
    assert ok
```

- [ ] **Step 2: Rodar e confirmar o estado**

Run: `python -m pytest tests/test_print_service_cores.py -v`
Expected: o teste do aviso FALHA (mensagem ainda não carrega o aviso); os outros podem passar por acaso — confirmar qual falha antes de seguir.

- [ ] **Step 3: Implementar em `print_service.py`**

No topo, junto aos imports:

```python
import color_profiles
```

**3a — assinaturas.** As três funções internas ganham o parâmetro final `cor_cfg=None`:

```python
def _send_pdf_raw(printer_name, pdf_path, devmode, job_title, cor_cfg=None):
def _send_ps_ghostscript(printer_name, pdf_path, devmode, job_title, cor_cfg=None):
def _send_gdi_raster(printer_name, pdf_path, devmode, job_title, cor_cfg=None):
```

**3b — `_send_pdf_raw`:** logo após o `if not HAS_WIN32:` (mantendo o mock como está), antes do `try:` principal, preparar o PDF com o intent da impressora:

```python
    pdf_temporario = None
    if cor_cfg:
        try:
            pdf_temporario = color_profiles.pdf_com_output_intent(pdf_path, cor_cfg)
            pdf_path = pdf_temporario
            print(f"[print][PDF-RAW] OutputIntent embutido: {cor_cfg['nome']} ({cor_cfg['classe']})")
        except Exception as e:
            print(f"[print][PDF-RAW] Aviso: OutputIntent nao embutido ({e}); enviando sem gerenciamento")
```

E no final da função (sucesso ou erro), apagar o temporário — envolver o `try` existente num `try/finally`:

```python
    finally:
        if pdf_temporario and os.path.exists(pdf_temporario):
            try:
                os.remove(pdf_temporario)
            except OSError:
                pass
```

Na mensagem de sucesso, acrescentar a marca quando gerenciado:

```python
        sufixo_cor = f" [cores: {cor_cfg['nome']}]" if cor_cfg else ""
        return True, f"PDF enviado diretamente (RAW) para '{printer_name}' ({size_mb:.1f} MB).{sufixo_cor}"
```

**3c — `_send_ps_ghostscript`:** no comando `cmd`, logo antes do `pdf_path` final, inserir as flags:

```python
        cmd = [
            gs_exe, "-q", "-dNOPAUSE", "-dBATCH", "-dSAFER",
            "-sDEVICE=ps2write",
            f"-sOutputFile={ps_path}",
            "-dEmbedAllFonts=true",
            "-dSubsetFonts=true",
            "-dCompressFonts=true",
        ] + color_profiles.args_ghostscript(cor_cfg) + [
            pdf_path
        ]
```

E na mensagem de sucesso o mesmo `sufixo_cor` do 3b.

**3d — `_send_gdi_raster`:** criar a transformação uma vez, antes do loop de páginas (logo após `render_dpi = max(...)`):

```python
                transform_cor = None
                if cor_cfg:
                    try:
                        transform_cor = color_profiles.transform_para_gdi(cor_cfg)
                        print(f"[print][GDI] Gerenciamento de cores ativo: {cor_cfg['nome']} ({cor_cfg['classe']}, {cor_cfg['intento']})")
                    except Exception as e:
                        print(f"[print][GDI] Aviso: transformacao de cor falhou ({e}); imprimindo sem gerenciamento")
```

E dentro do loop, após `img = Image.open(...)`, aplicar:

```python
                    if transform_cor is not None:
                        from PIL import ImageCms as _cms
                        if img.mode != "RGB":
                            img = img.convert("RGB")
                        img = _cms.applyTransform(img, transform_cor)
```

Na mensagem de sucesso final: `return True, f"PDF enviado via GDI (raster) para '{printer_name}'.{sufixo_cor}"` com o mesmo padrão do 3b.

**3e — `send_print_job_windows`:** logo após o bloco `if not HAS_WIN32:` do mock… **não** — o mock precisa carregar o aviso também. Substituir o início da função por:

```python
    # Config de cor da impressora de destino (perfil .icm, intento). Resolvida
    # UMA vez por trabalho; None quando o recurso esta desligado — e ai tudo
    # se comporta exatamente como antes do gerenciamento de cores existir.
    cor_cfg, aviso_cor = color_profiles.resolver_config(printer_name)
    sufixo_aviso = f" AVISO: {aviso_cor}" if aviso_cor else ""

    if not HAS_WIN32:
        print(f"[print][MOCK] Job: {job_title} | Printer: {printer_name} | PDF: {pdf_path}")
        return True, f"[MOCK] Impressao simulada com sucesso.{sufixo_aviso}"
```

Repassar `cor_cfg` nas seis chamadas às estratégias (modo forçado e cascata do modo auto), e anexar `sufixo_aviso` a cada `return True, msg` (ex.: `return True, msg + sufixo_aviso`).

- [ ] **Step 4: Rodar os testes**

Run: `python -m pytest tests/test_print_service_cores.py tests/test_color_profiles.py -v`
Expected: todos PASS

- [ ] **Step 5: Commit**

```powershell
git add print_service.py tests/test_print_service_cores.py
git commit -m @'
feat(cores): perfil .icm da impressora aplicado nos 3 modos de impressao

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 4: Endpoints de perfis ICC (`app.py` + `local_print_agent.py`)

**Files:**
- Modify: `app.py` (após os endpoints de PPD, ~linha 1243)
- Modify: `local_print_agent.py` (após os endpoints de ppd-map, ~linha 139)
- Create: `tests/test_api_icc.py`

**Interfaces:**
- Consumes: `color_profiles.listar_perfis()`, `perfil_info()`, `load_printer_icc_map()`, `save_printer_icc_map()`, `ICC_DIR`
- Produces (o frontend da Task 5 consome):
  - `GET /api/icc` → `[{filename, nome, classe, erro?}]`
  - `POST /api/icc/upload` (multipart `file`) → `{ok, perfil}` ou HTTP 400 com `detail`
  - `GET /api/printers/icc-map` → mapa completo
  - `POST /api/printers/icc-map` (JSON: mapa completo) → `{status: "success"}`

- [ ] **Step 1: Escrever os testes que falham**

```python
# tests/test_api_icc.py
"""Endpoints de perfis ICC: upload valida, lista descreve, mapa persiste."""
import io
import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import color_profiles as cp


@pytest.fixture
def client(tmp_path, monkeypatch):
    d = tmp_path / "perfis_icc"
    d.mkdir()
    monkeypatch.setattr(cp, "ICC_DIR", str(d))
    monkeypatch.setattr(cp, "PRINTER_ICC_MAP_FILE", str(tmp_path / "printer_icc_map.json"))
    import app as app_module
    return TestClient(app_module.app)


def test_upload_de_perfil_bom_e_listagem(client):
    r = client.post("/api/icc/upload",
                    files={"file": ("meu_srgb.icm", io.BytesIO(cp.srgb_icc_bytes()))})
    assert r.status_code == 200
    assert r.json()["perfil"]["classe"] == "RGB"

    r = client.get("/api/icc")
    assert any(p["filename"] == "meu_srgb.icm" for p in r.json())


def test_upload_corrompido_e_recusado_e_nao_fica_na_pasta(client):
    r = client.post("/api/icc/upload",
                    files={"file": ("lixo.icm", io.BytesIO(b"nao sou um perfil"))})
    assert r.status_code == 400
    assert not any(p["filename"] == "lixo.icm" for p in client.get("/api/icc").json())


def test_upload_de_extensao_errada_e_recusado(client):
    r = client.post("/api/icc/upload",
                    files={"file": ("perfil.txt", io.BytesIO(b"x"))})
    assert r.status_code == 400


def test_mapa_persiste_ida_e_volta(client):
    novo = {"Xerox": {"perfil": "meu_srgb.icm", "intento": "relativo", "ativo": True}}
    r = client.post("/api/printers/icc-map", json=novo)
    assert r.status_code == 200
    assert client.get("/api/printers/icc-map").json() == novo
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `python -m pytest tests/test_api_icc.py -v`
Expected: FAIL com 404 nos endpoints

- [ ] **Step 3: Implementar em `app.py`**

Adicionar `import color_profiles` junto aos imports do topo. Após `save_ppd_map` (~linha 1243), acrescentar:

```python
# ─── PERFIS ICC (GERENCIAMENTO DE CORES) ──────────────────────────────────────
# O perfil e propriedade da IMPRESSORA, nao do trabalho: configurado uma vez,
# vale para todo pedido que va para ela. Mesmo padrao do mapa de PPDs.

@app.get("/api/icc")
def list_icc():
    return color_profiles.listar_perfis()

@app.post("/api/icc/upload")
async def upload_icc(file: UploadFile = File(...)):
    filename = os.path.basename(file.filename or "")
    if not filename.lower().endswith((".icc", ".icm")):
        raise HTTPException(status_code=400, detail="Apenas arquivos .icc ou .icm são suportados")
    dest_path = os.path.join(color_profiles.ICC_DIR, filename)
    with open(dest_path, "wb") as f:
        f.write(await file.read())
    try:
        return {"ok": True, "perfil": color_profiles.perfil_info(dest_path)}
    except ValueError as e:
        # Perfil invalido nao fica na pasta enganando a listagem
        os.remove(dest_path)
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/printers/icc-map")
def get_icc_map():
    return color_profiles.load_printer_icc_map()

@app.post("/api/printers/icc-map")
async def save_icc_map(request: Request):
    mapping = await request.json()
    color_profiles.save_printer_icc_map(mapping)
    return {"status": "success"}
```

- [ ] **Step 4: Espelhar em `local_print_agent.py`**

Adicionar `import color_profiles` no topo e, após os endpoints de ppd-map (~linha 139), os mesmos quatro endpoints acima (copiar o bloco inteiro — o arquivo roda só em desenvolvimento, mas os dois servidores precisam responder igual).

- [ ] **Step 5: Rodar os testes**

Run: `python -m pytest tests/test_api_icc.py -v`
Expected: todos PASS

- [ ] **Step 6: Commit**

```powershell
git add app.py local_print_agent.py tests/test_api_icc.py
git commit -m @'
feat(cores): endpoints de perfis ICC e mapa por impressora

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 5: Box "Gerenciamento de Cores" na janela de impressão (frontend)

**Files:**
- Modify: `frontend/index.html` (dentro de `ped-driver-options`, após a grid de Cópias/Orientação que fecha na ~linha 1685, antes de `</div><!-- /ped-driver-options -->`)
- Modify: `frontend/script.js` (funções novas perto de `onPedPrinterChange`, ~linha 28830, e uma chamada dentro dela)

**Interfaces:**
- Consumes: `GET /api/icc`, `POST /api/icc/upload`, `GET/POST /api/printers/icc-map` (Task 4)
- Produces: elementos `ped-print-cor-ativo` (checkbox), `ped-print-cor-perfil` (select), `ped-print-cor-intento` (select), `ped-print-cor-status` (div de texto), `ped-print-cor-upload` (input file oculto); funções JS `carregarCorImpressora(printerName)`, `salvarCorImpressora()`, `enviarPerfilIcc(input)`.

- [ ] **Step 1: HTML da box**

Inserir em `frontend/index.html`, logo após o `</div>` da grid "Cópias e Orientação" (~linha 1685) e antes de `</div><!-- /ped-driver-options -->`:

```html
                                             <!-- Gerenciamento de Cores: perfil ICC por impressora.
                                                  A escolha vale para a IMPRESSORA (fica no agente da
                                                  estacao), nao para o pedido. -->
                                             <div id="ped-print-cor-box" style="display:flex;flex-direction:column;gap:8px;padding:8px 10px;background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:6px;">
                                                 <div style="display:flex;align-items:center;justify-content:space-between;">
                                                     <label style="font-size:0.72rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Gerenciamento de Cores</label>
                                                     <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                                                         <input type="checkbox" id="ped-print-cor-ativo" onchange="salvarCorImpressora()" style="width:16px;height:16px;accent-color:#6366f1;cursor:pointer;">
                                                         <span style="font-size:0.75rem;color:#94a3b8;">Ativo</span>
                                                     </label>
                                                 </div>
                                                 <div>
                                                     <label style="display:block;font-size:0.72rem;font-weight:600;color:#64748b;margin-bottom:5px;">Perfil da impressora (.icm)</label>
                                                     <select id="ped-print-cor-perfil" onchange="salvarCorImpressora()" style="width:100%;background:#0f172a;border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#f1f5f9;padding:7px 10px;font-size:0.8rem;appearance:none;">
                                                         <option value="">— sem perfil —</option>
                                                     </select>
                                                 </div>
                                                 <div>
                                                     <label style="display:block;font-size:0.72rem;font-weight:600;color:#64748b;margin-bottom:5px;">Intento de renderização</label>
                                                     <select id="ped-print-cor-intento" onchange="salvarCorImpressora()" style="width:100%;background:#0f172a;border:1px solid rgba(255,255,255,0.1);border-radius:6px;color:#f1f5f9;padding:7px 10px;font-size:0.8rem;appearance:none;">
                                                         <option value="relativo">Colorimétrico Relativo (fiel, com compensação de ponto preto)</option>
                                                         <option value="perceptual">Perceptual (comprime o gamut suavemente)</option>
                                                     </select>
                                                 </div>
                                                 <input type="file" id="ped-print-cor-upload" accept=".icc,.icm" style="display:none;" onchange="enviarPerfilIcc(this)">
                                                 <button onclick="document.getElementById('ped-print-cor-upload').click()" style="width:100%;padding:7px 10px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);color:#94a3b8;border-radius:6px;cursor:pointer;font-size:0.78rem;">📥 Enviar perfil .icm desta impressora…</button>
                                                 <div id="ped-print-cor-status" style="font-size:0.72rem;color:#64748b;line-height:1.4;">Desligado: a impressão sai sem conversão de cores, como sempre saiu.</div>
                                             </div>
```

- [ ] **Step 2: JS — carregar, salvar e enviar perfil**

Em `frontend/script.js`, logo ANTES de `async function onPedPrinterChange()` (~linha 28830), acrescentar:

```javascript
// ──── Gerenciamento de Cores (perfil ICC por impressora) ────────────────────
// O perfil e do EQUIPAMENTO: escolhido uma vez, vale para todo pedido que va
// para aquela impressora. O mapa vive no agente da estacao
// (printer_icc_map.json), ao lado do mapa de PPDs.

let _corPerfisCache = null;

async function carregarCorImpressora(printerName) {
    const selPerfil = document.getElementById('ped-print-cor-perfil');
    const selIntento = document.getElementById('ped-print-cor-intento');
    const chkAtivo = document.getElementById('ped-print-cor-ativo');
    if (!selPerfil || !printerName) return;
    try {
        const [perfis, mapa] = await Promise.all([
            fetch('/api/icc').then(r => r.json()),
            fetch('/api/printers/icc-map').then(r => r.json())
        ]);
        _corPerfisCache = perfis;
        selPerfil.innerHTML = '<option value="">— sem perfil —</option>' +
            perfis.map(p => p.erro
                ? `<option value="${p.filename}" disabled>${p.filename} (inválido)</option>`
                : `<option value="${p.filename}">${p.nome} (${p.classe})</option>`
            ).join('');
        const cfg = (mapa && mapa[printerName]) || {};
        selPerfil.value = cfg.perfil || '';
        if (selPerfil.value !== (cfg.perfil || '')) selPerfil.value = '';
        selIntento.value = cfg.intento || 'relativo';
        chkAtivo.checked = cfg.ativo === true;
        atualizarStatusCor();
    } catch (e) {
        console.warn('[cores] Falha ao carregar perfis ICC:', e);
    }
}

function atualizarStatusCor() {
    const st = document.getElementById('ped-print-cor-status');
    const chkAtivo = document.getElementById('ped-print-cor-ativo');
    const selPerfil = document.getElementById('ped-print-cor-perfil');
    if (!st) return;
    if (!chkAtivo?.checked) {
        st.textContent = 'Desligado: a impressão sai sem conversão de cores, como sempre saiu.';
    } else if (!selPerfil?.value) {
        st.textContent = 'Ligado, mas sem perfil escolhido: nada muda na impressão até escolher um.';
    } else {
        const p = (_corPerfisCache || []).find(x => x.filename === selPerfil.value);
        st.textContent = `As cores desta impressora serão convertidas para "${p ? p.nome : selPerfil.value}"` +
            (p && p.classe ? ` (${p.classe})` : '') + ' na hora de imprimir.';
    }
}

async function salvarCorImpressora() {
    const printerName = document.getElementById('ped-print-printer')?.value;
    if (!printerName) return;
    try {
        const mapa = await fetch('/api/printers/icc-map').then(r => r.json()) || {};
        mapa[printerName] = {
            perfil: document.getElementById('ped-print-cor-perfil')?.value || '',
            intento: document.getElementById('ped-print-cor-intento')?.value || 'relativo',
            ativo: document.getElementById('ped-print-cor-ativo')?.checked === true
        };
        await fetch('/api/printers/icc-map', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(mapa)
        });
        atualizarStatusCor();
    } catch (e) {
        console.warn('[cores] Falha ao salvar config de cor:', e);
    }
}

async function enviarPerfilIcc(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
        const res = await fetch('/api/icc/upload', { method: 'POST', body: fd });
        const corpo = await res.json().catch(() => ({}));
        if (!res.ok) {
            alert('Perfil recusado: ' + (corpo.detail || 'arquivo inválido.'));
            return;
        }
        const printerName = document.getElementById('ped-print-printer')?.value;
        await carregarCorImpressora(printerName);
        const selPerfil = document.getElementById('ped-print-cor-perfil');
        if (selPerfil) { selPerfil.value = corpo.perfil.filename; }
        await salvarCorImpressora();
    } catch (e) {
        alert('Falha ao enviar o perfil: ' + e);
    } finally {
        input.value = '';
    }
}
```

- [ ] **Step 3: Chamar o carregamento na troca de impressora**

Dentro de `onPedPrinterChange()`, logo após `if (optDiv) optDiv.style.display = 'none';` (linha ~28848, antes do fetch de capacidades), acrescentar:

```javascript
    // Config de cor e independente das capacidades do driver: carrega em paralelo
    carregarCorImpressora(printerName);
```

- [ ] **Step 4: Verificar no app real**

Usar a skill `rodar-app` para subir o app e conferir no navegador headless: abrir a janela de impressão de um pedido, escolher impressora, ver a box aparecer com o texto de desligado; ligar, escolher intento — e conferir que `printer_icc_map.json` foi gravado na raiz com a impressora como chave.

- [ ] **Step 5: Commit**

```powershell
git add frontend/index.html frontend/script.js
git commit -m @'
feat(cores): box Gerenciamento de Cores na janela de impressao

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 6: Empacotamento do agente e documentação

**Files:**
- Modify: `agent_tray.spec` (hiddenimports)
- Modify: `GUIA_AGENTE.md` (seção curta sobre o gerenciamento de cores)

**Interfaces:**
- Consumes: módulo `color_profiles` (Task 1) e `PIL.ImageCms`.
- Produces: executável do agente com LittleCMS embutido.

- [ ] **Step 1: hiddenimports**

Em `agent_tray.spec`, na lista `hiddenimports`:
- após `'PIL.ImageDraw',` acrescentar `'PIL.ImageCms',` (extensão C `_imagingcms` só é achada pelo PyInstaller com o import explícito — sem isso o agente sobe, mas a primeira impressão gerenciada morre com ImportError silencioso no log);
- após `'print_service',` acrescentar `'color_profiles',`.

- [ ] **Step 2: Conferir que o módulo importa no contexto do agente**

Run: `python -c "import color_profiles, print_service, engine; print('ok')"`
Expected: `ok`

- [ ] **Step 3: Documentar no GUIA_AGENTE.md**

Acrescentar uma seção curta (junto das seções de impressão) explicando: onde vivem os perfis (`perfis_icc/` na pasta do agente), onde vive o mapa (`printer_icc_map.json`), que a configuração é por impressora na janela de impressão, e que sem perfil nada muda. Mencionar que o modo GDI converte o raster via LittleCMS, o modo Ghostscript converte via flags ICC e o modo PDF RAW embute o perfil como OutputIntent para a controladora converter.

- [ ] **Step 4: Commit**

```powershell
git add agent_tray.spec GUIA_AGENTE.md
git commit -m @'
chore(cores): LittleCMS e color_profiles no pacote do agente

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
'@
```

---

### Task 7: Verificação final

- [ ] **Step 1: Suíte completa**

Run: `python -m pytest tests/ -x -q`
Expected: tudo PASS (nenhuma regressão nas suítes de engine/duplex/foto/QR)

- [ ] **Step 2: Conferência do projeto**

Run: `.\ferramentas\conferir.ps1`
Expected: sem segredo em arquivo versionado; commits pendentes de publicação listados (esperado — publicar é ação do usuário)

- [ ] **Step 3: Smoke test real de geração**

Gerar uma imposição pequena via `tests/run_impose.py` (ou o caminho usado pelas suítes de engine) e abrir o PDF de saída conferindo `OutputIntents` no catálogo:

Run: `python -c "import fitz; d=fitz.open('<pdf gerado>'); print(d.xref_object(d.pdf_catalog()))"`
Expected: catálogo com `/OutputIntents`

- [ ] **Step 4: Relatar ao usuário**

Resumo do que mudou + lembrete: **publicar site e agente juntos, com número de versão novo do agente** (`.\publicar.ps1` + `.\publicar_agente.ps1 <versão nova>`), decisão e execução do usuário.
