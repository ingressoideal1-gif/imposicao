# -*- coding: utf-8 -*-
"""O hash que o agente calcula e o celular tem de reproduzir.

A nuvem nunca ve o codigo do QR Ideal. Ela guarda `codigo_hash`, e o celular da
portaria confere calculando o mesmo hash do que leu. Isso so funciona se os dois
lados -- Python no agente, `crypto.subtle` no navegador -- produzirem exatamente
o mesmo resultado.

Se divergirem, TODO ingresso do evento e recusado na portaria. Nao ha como
descobrir isso testando o app, nem olhando o papel, nem conferindo o banco: a
falha so aparece com a fila na porta e o lote ja entregue. Este arquivo e o
unico lugar onde ela pode ser pega a tempo.
"""

import os
import subprocess

import pytest

import qr_ideal

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# A entrada de conferencia: o conteudo canonico da spec (pedido 20272, modelo
# 1000022, ingresso 7) e um sal previsivel. Nao e segredo -- e um caso de teste.
CONTEUDO = "27202HM4IKCBY"
SAL = "00" * 32


def test_hash_tem_valor_de_conferencia_fixo():
    """Este numero e o contrato entre o agente e o celular.

    Mudar iteracoes, algoritmo ou codificacao muda o valor e quebra este teste --
    que e exatamente o aviso que se quer. E tambem o que o harness do navegador
    compara, entao um lado nao muda sem o outro.
    """
    assert qr_ideal.hash_codigo(CONTEUDO, SAL) == (
        "8cc48cd725a2a437b8a7bf25c312a0f7b85303d85438d0a39842ac21ed4bad9e"
    )


def test_o_mesmo_codigo_com_sais_diferentes_da_hashes_diferentes():
    """O sal por pedido e o que impede correlacionar eventos.

    O pool e reutilizado: o mesmo codigo de 8 caracteres reaparece em eventos
    diferentes por desenho. Sem sal por pedido, o hash tambem reapareceria, e
    quem visse o banco saberia que dois eventos usam o mesmo codigo.
    """
    a = qr_ideal.hash_codigo(CONTEUDO, "00" * 32)
    b = qr_ideal.hash_codigo(CONTEUDO, "11" * 32)
    assert a != b


def test_o_hash_tem_64_hex():
    h = qr_ideal.hash_codigo(CONTEUDO, SAL)
    assert len(h) == 64
    assert all(c in "0123456789abcdef" for c in h)


def test_o_sal_tem_64_hex_e_nunca_repete():
    """Sal repetido derrubaria a separacao entre pedidos."""
    sais = {qr_ideal.gerar_sal() for _ in range(50)}
    assert len(sais) == 50
    assert all(len(s) == 64 and all(c in "0123456789abcdef" for c in s) for s in sais)


def test_o_conteudo_inteiro_entra_no_hash_e_nao_so_o_codigo():
    """Dois pedidos diferentes com o MESMO codigo do pool tem de dar hashes
    diferentes -- e o que impede a colisao de coluna virar colisao na portaria."""
    a = qr_ideal.hash_codigo("27202" + "HM4IKCBY", SAL)
    b = qr_ideal.hash_codigo("27203" + "HM4IKCBY", SAL)
    assert a != b


def test_o_navegador_calcula_o_mesmo_hash_que_o_python():
    """A prova de que a portaria vai funcionar.

    Roda o `frontend/qr-ideal-hash.js` dentro de um navegador de verdade e
    compara com o que o Python produz. E o unico teste do projeto que cobre a
    falha mais cara possivel: agente e celular discordando em silencio.
    """
    esperado = qr_ideal.hash_codigo(CONTEUDO, SAL)
    harness = os.path.join(RAIZ, "tests", "qr_ideal_hash_harness.js")
    r = subprocess.run(
        ["node", harness, CONTEUDO, SAL, esperado],
        cwd=RAIZ, capture_output=True, text=True, timeout=300,
    )
    if r.returncode != 0:
        pytest.fail(
            "o navegador e o Python nao produziram o mesmo hash:\n"
            f"{r.stdout}\n{r.stderr}"
        )
