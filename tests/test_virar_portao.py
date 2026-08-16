# -*- coding: utf-8 -*-
"""O que acontece ao tocar na barra de um evento.

A trava da fila e o unico ponto aqui que perde dinheiro do cliente se errar:
trocar de evento com leitura pendente faz o que ficou para tras subir contado
no evento NOVO, e a contagem que o cliente pagou para ter sai errada sem que
ninguem descubra.
"""

import json
import os
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "virar_portao_harness.js")


def decidir(**caso):
    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300, capture_output=True, text=True,
        input=json.dumps({"chamada": "decidirTroca", "argumentos": [caso]}),
    )
    if r.returncode != 0:
        pytest.fail(f"o harness falhou:\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout)["resultado"]


def test_evento_ja_carregado_neste_aparelho_vai_direto_para_a_leitura():
    """O caso do dia do evento: um toque, e a camera."""
    assert decidir(pedido="e-1", carregado="e-1", naFila=0) == "ler"


def test_evento_ja_carregado_vai_ler_MESMO_com_fila_pendente():
    """A fila e do proprio evento. Trava-la aqui pararia o portao por causa de
    um 4G ruim, que e exatamente quando a fila cresce."""
    assert decidir(pedido="e-1", carregado="e-1", naFila=40) == "ler"


def test_outro_evento_do_chaveiro_com_fila_zerada_troca():
    assert decidir(pedido="e-2", carregado="e-1", naFila=0) == "trocar"


def test_outro_evento_com_leitura_pendente_RECUSA():
    """O que ficou para tras subiria contado no evento novo."""
    assert decidir(pedido="e-2", carregado="e-1", naFila=1) == "fila-cheia"


def test_aparelho_que_ainda_nao_e_portao_cria():
    assert decidir(pedido="e-9", carregado="", naFila=0) == "criar"


def test_aparelho_novo_com_fila_de_outro_evento_ainda_recusa():
    """Fila sem evento carregado nao existe na pratica, mas se existir e a
    mesma perda: nao deixe passar."""
    assert decidir(pedido="e-9", carregado="e-1", naFila=3) == "fila-cheia"


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


def test_o_portao_nasce_com_TODOS_os_setores():
    """Portao sem setor recusa tudo na porta, com o laranja de 'outra porta',
    e o porteiro nao teria como saber por que. Restringir e escolha da
    engrenagem, feita depois."""
    assert "todosOsSetores" in _ler("frontend/virar-portao.js")


def test_o_nome_automatico_conta_os_portoes_que_ja_existem():
    """Decisao do usuario: nasce nomeado e ja le; renomear e na engrenagem."""
    texto = _ler("frontend/virar-portao.js")
    assert "'Portão '" in texto or '"Portão "' in texto


def test_a_sessao_e_encerrada_pelo_aparelho_js():
    """A ordem (token, signOut, navegar) ja esta resolvida la, e inverte-la nao
    da erro na tela: da um aparelho inutil no meio de um evento."""
    assert "aparelhoAqui.assumir" in _ler("frontend/virar-portao.js")
