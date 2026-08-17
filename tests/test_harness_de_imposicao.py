# -*- coding: utf-8 -*-
"""Roda os harnesses de node da imposicao dentro do pytest.

Nao ha runner de teste JavaScript neste projeto: as regras de tela que precisam
de prova viram harness de node, que sai com codigo 1 quando algum caso falha.
Sem um envelope como este, o harness so roda quando alguem lembra de chama-lo a
mao — e um teste que ninguem roda nao protege nada.

Os dois harnesses aqui guardam a mesma familia de defeito: `frontend/pedido.js`
e um CLONE do `frontend/script.js`, e uma regra de impressao mudada num so dos
dois ja produziu duas falhas de producao (o pedido 20495 imprimindo o caderno
inteiro, e as artes indo ao motor sem PDF).
"""
import os
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

HARNESSES = [
    "csv_fatia_do_modelo_harness.js",   # a fatia do banco por modelo
    "modelos_somados_harness.js",       # somar modelos aproveitando a folha
]


@pytest.mark.parametrize("harness", HARNESSES)
def test_o_harness_passa(harness):
    caminho = os.path.join(RAIZ, "tests", harness)
    assert os.path.exists(caminho), f"o harness {harness} sumiu"

    r = subprocess.run(
        ["node", caminho], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, f"{harness} falhou:\n{r.stdout}\n{r.stderr}"
    assert "OK:" in (r.stdout or ""), f"{harness} nao relatou sucesso:\n{r.stdout}"
