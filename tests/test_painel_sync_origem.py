"""Pedido 21869: atualizar o agente nao pode restaurar o painel antigo da Vercel.

Executa as funcoes reais sem importar o worker, iniciar servicos ou acessar rede.
"""
import ast
import io
import os
from pathlib import Path
import shutil
import time
from types import SimpleNamespace
import urllib.request

import pytest
import security_config


RAIZ = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize("falhar_download", [False, True])
def test_sync_busca_cloudflare_e_preserva_painel_se_download_falhar(tmp_path, monkeypatch, falhar_download):
    nomes = ["index.html", "pedido.js", "arte-de-impressao.js"]
    monkeypatch.setattr(security_config, "PAINEL_ARQUIVOS", nomes)
    destino = tmp_path / "painel"
    destino.mkdir()
    for nome in nomes:
        (destino / nome).write_text("<html>painel anterior</html>", encoding="utf-8")
    chamadas = []

    def baixar(req, timeout):
        chamadas.append(req.full_url)
        assert req.full_url.startswith("https://imposicao.pages.dev/")
        assert req.get_header("User-agent").startswith("NewProd Agent/")
        nome = req.full_url.split("/")[-1].split("?")[0]
        if falhar_download and nome == "pedido.js":
            raise OSError("falha de rede simulada")
        resposta = io.BytesIO((RAIZ / "frontend" / nome).read_bytes())
        resposta.status = 200
        return resposta

    monkeypatch.setattr(urllib.request, "urlopen", baixar)
    arvore = ast.parse((RAIZ / "agent_worker.py").read_text(encoding="utf-8-sig"))
    funcoes = [n for n in arvore.body if isinstance(n, ast.FunctionDef)
               and n.name in ("_painel_valido", "sincronizar_painel")]
    contexto = dict(os=os, shutil=shutil, time=time, urllib=SimpleNamespace(request=urllib.request),
                    PAINEL_DIR=str(destino))
    exec(compile(ast.Module(body=funcoes, type_ignores=[]), "agent_worker.py", "exec"), contexto)
    assert contexto["sincronizar_painel"]() is (not falhar_download)
    assert chamadas
    for nome in nomes:
        if falhar_download:
            assert (destino / nome).read_text(encoding="utf-8") == "<html>painel anterior</html>"
        else:
            assert (destino / nome).read_bytes() == (RAIZ / "frontend" / nome).read_bytes()
    if not falhar_download:
        assert "prepararVersoDoTrabalho" in (destino / "pedido.js").read_text(encoding="utf-8")
