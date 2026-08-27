# -*- coding: utf-8 -*-
"""O PDF Gabarito de um modelo frente e verso sai com duas páginas.

## O defeito, relatado pelo usuário em 27/08/2026

> "Na edição de um pedido em arte, ao clicar em PDF Gabarito, verificar a
> geração do PDF para quando o modelo for frente e verso. Se tivermos dois
> modelos, um apenas frente e outro frente e verso, o PDF deve ser gerado com
> três páginas."

O `exportarPdfGabarito` adicionava exatamente uma página por modelo, sem
nenhuma noção de face. Duas coisas saíam erradas ao mesmo tempo:

1. **O verso não existia.** Um pedido com um modelo só frente e outro frente e
   verso saía com duas páginas, e não três. O operador ficava sem o gabarito do
   verso — o lado que ele não tem como conferir de outro jeito.
2. **A frente vinha suja.** Como o `criarCanvasNumeracaoRasterizada` desenhava
   TODOS os elementos, os marcados "Apenas Verso" no editor eram rasterizados
   por cima da frente. O gabarito da frente mostrava as duas faces empilhadas.

Os dois botões vizinhos sempre acertaram: o `exportarPdfSomenteArte` já emitia a
página do verso, e o `importarPdfMultipage` já fatiava contando frente e verso.
Só o gabarito ficou para trás.

## A conta das páginas tem de ser a MESMA dos três caminhos

`modeloTemVerso` existe por isso. O painel guarda o mesmo dado em dois nomes na
memória — `verso`, booleano, e `verso_tipo`, o texto do ERP — e o helper lê os
dois. Os três caminhos que contam páginas (PDF Arte, PDF Gabarito e a
importação fatiada) passaram a chamar o mesmo helper, porque o operador
confere o gabarito por cima da arte: se as contagens divergissem, a página 2 de
um seria o verso do modelo 1 e a do outro seria a frente do modelo 2.
"""
import os
import re
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "gabarito_frente_e_verso_harness.js")
SCRIPT = os.path.join(RAIZ, "frontend", "script.js")


def _texto():
    with open(SCRIPT, encoding="utf-8") as f:
        return f.read()


def _corpo(nome):
    texto = _texto()
    i = texto.index(nome)
    return texto[i:texto.index("\n}", i) + 2]


def test_o_harness_do_frente_e_verso_passa():
    assert os.path.exists(HARNESS), "o harness do gabarito frente e verso sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    saida = (r.stdout or "") + (r.stderr or "")
    assert r.returncode == 0, "o harness falhou:\n" + saida
    assert "OK:" in saida, "o harness nao relatou sucesso:\n" + saida


def test_o_gabarito_emite_uma_pagina_por_face():
    """O defeito relatado, na sua forma mais curta."""
    corpo = _corpo("async function exportarPdfGabarito(")
    assert re.search(r"const faces = modeloTemVerso\(item\)", corpo), (
        "o exportarPdfGabarito voltou a nao olhar o verso do modelo — "
        "um modelo frente e verso precisa render DUAS paginas"
    )
    assert "for (const face of faces)" in corpo, (
        "o laco de faces sumiu do exportarPdfGabarito"
    )


def test_o_raster_do_gabarito_recebe_a_face():
    """Sem a face, a frente sai com os elementos do verso por cima."""
    corpo = _corpo("async function exportarPdfGabarito(")
    assert re.search(r"criarCanvasNumeracaoRasterizada\(numParaRaster, fmt, face\)", corpo), (
        "o raster do gabarito parou de receber a face — a pagina da frente "
        "voltaria a desenhar os elementos marcados 'Apenas Verso'"
    )

    raster = _corpo("async function criarCanvasNumeracaoRasterizada(")
    assert "elementoVisivelNaFace(el, faceDoGabarito)" in raster, (
        "o filtro de face saiu do criarCanvasNumeracaoRasterizada"
    )


def test_o_picote_espelha_no_verso_do_gabarito():
    """Mesma regra do card do pedido: o corte e o mesmo papel, visto do avesso."""
    raster = _corpo("async function criarCanvasNumeracaoRasterizada(")
    assert re.search(r"faceDoGabarito === 'back' && el\.type === 'PICOTE'", raster), (
        "o picote parou de espelhar no verso do gabarito"
    )


def test_os_elementos_pdf_tambem_sao_filtrados_por_face():
    """Eles entram vetoriais, antes do raster, e tem a mesma regra de face."""
    corpo = _corpo("async function exportarPdfGabarito(")
    assert "todosPdfEls.filter(e => elementoVisivelNaFace(e, face))" in corpo, (
        "os elementos PDF vetoriais do gabarito pararam de respeitar a face"
    )


def test_o_fundo_legado_entra_so_na_frente():
    """A coluna `pdf_content` da numeracao sempre foi o fundo da frente."""
    corpo = _corpo("async function exportarPdfGabarito(")
    assert "if (face === 'front' && num && !todosPdfEls.length && num.pdf_content)" in corpo, (
        "o fundo legado do gabarito deixou de ser exclusivo da frente"
    )


def test_os_tres_caminhos_contam_o_verso_pelo_mesmo_helper():
    """PDF Arte, PDF Gabarito e a importacao fatiada tem de casar pagina a pagina."""
    texto = _texto()
    for nome in ("async function exportarPdfSomenteArte(",
                 "async function exportarPdfGabarito(",
                 "async function importarPdfMultipage("):
        corpo = _corpo(nome)
        assert "modeloTemVerso(item)" in corpo, (
            f"{nome.strip()} parou de usar o modeloTemVerso — as contagens de "
            "pagina dos tres caminhos precisam bater entre si"
        )
        assert not re.search(r"\bitem\.verso\b(?!_)", corpo), (
            f"{nome.strip()} voltou a ler `item.verso` cru; o painel guarda o "
            "mesmo dado tambem em `verso_tipo`, e os dois podem divergir"
        )
