# -*- coding: utf-8 -*-
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
