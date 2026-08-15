# -*- coding: utf-8 -*-
"""O que a tela PINTA, que e a parte desta camada que falha em silencio.

As regras ja sao testadas em tests/test_portaria_validacao.py. O que nada mais
cobre e a traducao do veredito em cor e frase -- e a spec diz que confundir
`setor_nao_autorizado` (ingresso bom, porta errada) com `desconhecido` (ingresso
estranho ao evento) faz o porteiro devolver ingresso legitimo achando que e
falso. Sao cores diferentes de proposito, e e isto que garante que continuem.
"""

import json
import os
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "portaria_tela_harness.js")

PISTA = "11111111-1111-1111-1111-111111111111"
VIP = "22222222-2222-2222-2222-222222222222"
SAL = "aa" * 32


def hash_de(texto):
    import qr_ideal
    return qr_ideal.hash_codigo(texto, SAL)


def carga(**mudancas):
    base = {
        "evento": {"id": "e1", "nome": "Festa", "sal": SAL},
        "aparelho": {"id": "d1", "nome": "Portao A", "setores": [PISTA]},
        "sais": {},
        "setores": [
            {"id": PISTA, "nome": "PISTA", "quantidade": 600,
             "tipo_uso": "unico", "abre_em": None, "fecha_em": None},
            {"id": VIP, "nome": "VIP", "quantidade": 500,
             "tipo_uso": "unico", "abre_em": None, "fecha_em": None},
        ],
        "bloqueios": [],
        "credenciais": [
            {"h": hash_de("000001"), "s": PISTA, "n": 1, "id": "c-p1"},
            {"h": hash_de("000009"), "s": VIP, "n": 9, "id": "c-v9"},
        ],
    }
    base.update(mudancas)
    return base


def pintar(texto, c=None, escolhido=None):
    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300, capture_output=True, text=True,
        input=json.dumps({"texto": texto, "carga": c or carga(),
                          "setorEscolhido": escolhido}),
    )
    if r.returncode != 0:
        pytest.fail(f"o harness falhou:\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout)


def test_permitido_pinta_verde_e_diz_o_setor_e_o_numero():
    r = pintar("000001")
    assert "ok" in r["classe"]
    assert r["titulo"] == "PODE ENTRAR"
    assert r["detalhe"] == "PISTA"


def test_porta_errada_pinta_LARANJA_e_nao_vermelho():
    """O erro mais caro da tela. Ingresso bom na porta errada nao pode ter a
    mesma cara de ingresso estranho ao evento."""
    r = pintar("000009")
    assert "porta" in r["classe"], f"pintou {r['classe']!r} em vez de laranja"
    assert "recusa" not in r["classe"]
    assert "VIP" in r["detalhe"] and "PISTA" in r["detalhe"]


def test_desconhecido_pinta_vermelho():
    r = pintar("999999")
    assert "recusa" in r["classe"]
    assert "porta" not in r["classe"]


def test_o_motivo_do_bloqueio_aparece_no_campo_de_corpo_grande():
    """E o que o porteiro le em voz alta -- nao pode virar legenda."""
    c = carga(bloqueios=[{"setor_id": PISTA, "de": 1, "ate": 50,
                          "motivo": "lote extraviado na entrega"}])
    r = pintar("000001", c)
    assert r["motivo"] == "lote extraviado na entrega"


def test_ambiguidade_abre_a_tela_de_escolha_e_NAO_registra_leitura():
    """Perguntar nao e decidir: enquanto o porteiro nao tocar num setor, nada
    pode ir para a fila -- senao a lotacao contaria uma entrada que nao houve."""
    c = carga()
    c["aparelho"]["setores"] = [PISTA, VIP]
    c["credenciais"] = [
        {"h": hash_de("000001"), "s": PISTA, "n": 1, "id": "c-p1"},
        {"h": hash_de("000001"), "s": VIP, "n": 1, "id": "c-v1"},
    ]
    r = pintar("000001", c)
    assert r["telaAmbiguo"] is True
    assert r["telaResposta"] is False
    assert r["fila"] == 0


def test_toda_leitura_decidida_entra_na_fila_inclusive_a_negada():
    """E a leitura negada que responde 'por que a fila parou as 22h'."""
    assert pintar("000001")["fila"] == 1
    assert pintar("999999")["fila"] == 1


# ── A fila so sai depois que o servidor confirmou ────────────────────────────
#
# Nenhum dos testes acima toca isto: eles desligam `navigator.onLine` de
# proposito (nenhuma rede deve sair enquanto so estamos testando pintura), e
# por isso `sincronizar()` sai no primeiro guard sem executar o corpo -- onde
# mora a regra "so remove da fila depois que o POST /leituras confirmou".
# Achado em revisao de codigo, 15/08/2026: sem este teste, inverter a ordem
# (remover da fila antes do fetch) passaria pela suite inteira sem aviso.

def _sincronizar(mock):
    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300, capture_output=True, text=True,
        input=json.dumps({"modo": "sincronizar", "carga": carga(), "mock": mock}),
    )
    if r.returncode != 0:
        pytest.fail(f"o harness falhou:\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout)


def test_sincronizar_remove_da_fila_so_depois_da_confirmacao_do_servidor():
    r = _sincronizar({"method": "POST", "pathname": "/api/acesso/portaria/leituras",
                      "status": 200, "body": {"gravadas": 1}})
    assert r["filaAntes"] == 1
    assert r["filaDepois"] == 0


def test_sincronizar_mantem_na_fila_se_o_servidor_nao_confirmar():
    """O teste que fica vermelho se alguem inverter a ordem: remover da fila
    ANTES do fetch faria a leitura sumir mesmo quando o servidor nunca
    recebeu -- e a lotacao contaria uma entrada que nunca chegou."""
    r = _sincronizar({"method": "POST", "pathname": "/api/acesso/portaria/leituras",
                      "abort": True})
    assert r["filaAntes"] == 1
    assert r["filaDepois"] == 1
