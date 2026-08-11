# -*- coding: utf-8 -*-
"""Versao do agente — fonte unica para o codigo Python.

Precisa continuar igual a Version= em agent_installer.wxs e ao nome do arquivo
em compilar_msi.ps1: o MSI usa aquele campo para decidir se o upgrade se
aplica, e o auto-update compara este valor com o do manifesto.
"""

AGENT_VERSION = "1.2.36"


def como_tupla(texto: str) -> tuple:
    """'NewProd 1.2.5' e '1.2.5.0' viram tuplas comparaveis."""
    import re
    numeros = re.findall(r"\d+", texto or "")
    return tuple(int(n) for n in numeros[:4]) or (0,)
