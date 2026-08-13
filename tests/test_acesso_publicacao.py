# -*- coding: utf-8 -*-
"""O agente publica a faixa sem nunca segurar o operador.

Ele está de pé na frente da impressora. O agente local existe por causa disso —
imposição e PDF rodam na estação para não depender de rede. Calcular 5.000
hashes leva uns quinze segundos, e esses quinze segundos têm de acontecer
DEPOIS que os PDFs saíram, numa thread de fundo.

Dois modos de falhar que estes testes cobrem, e que só apareceriam na portaria
do evento:

  1. publicar a folha impressa em vez da tiragem inteira — quem imprime 2.000
     hoje e 3.000 na semana que vem ficaria com 3.000 ingressos recusados;
  2. a thread de fundo levantar exceção e morrer em silêncio, deixando a faixa
     pela metade sem ninguém saber.
"""

import time

import pytest

import acesso_publicacao


class PoolFalso:
    """Devolve conteúdo determinístico, sem precisar do arquivo de 24 MB."""

    def conteudo(self, pedido, modelo, item):
        return f"{str(pedido)[::-1]}COD{modelo:04d}{item:05d}"


def test_publicar_em_fundo_devolve_na_hora(monkeypatch):
    """A trava que protege o tempo do operador.

    Se um dia alguém trocar a thread por chamada direta, o operador passa a
    esperar a nuvem para receber um PDF que já está pronto.
    """
    def demorada(pedido, pool_factory):
        time.sleep(2)

    monkeypatch.setattr(acesso_publicacao, "_publicar_protegido", demorada)
    comeco = time.time()
    acesso_publicacao.publicar_em_fundo(20272, PoolFalso)
    assert time.time() - comeco < 0.5, "a publicacao segurou quem chamou"


def test_publica_a_TIRAGEM_INTEIRA_e_nao_a_folha_impressa():
    """A quantidade vem do ERP, não do intervalo de folhas do trabalho."""
    tiragem = {1000022: 3, 1000023: 2}
    itens = list(acesso_publicacao.itens_do_pedido(20272, tiragem, "00" * 32, PoolFalso()))
    assert [(i["modelo_id"], i["numero"]) for i in itens] == [
        (1000022, 1), (1000022, 2), (1000022, 3),
        (1000023, 1), (1000023, 2),
    ]


def test_cada_ingresso_recebe_um_hash_diferente():
    """Hash repetido significaria dois ingressos com o mesmo código."""
    tiragem = {1000022: 20}
    hashes = {i["hash"] for i in acesso_publicacao.itens_do_pedido(
        20272, tiragem, "00" * 32, PoolFalso())}
    assert len(hashes) == 20
    assert all(len(h) == 64 for h in hashes)


def test_o_sal_muda_todos_os_hashes():
    """Prova que o sal do pedido entra mesmo no cálculo."""
    tiragem = {1000022: 5}
    a = [i["hash"] for i in acesso_publicacao.itens_do_pedido(20272, tiragem, "00" * 32, PoolFalso())]
    b = [i["hash"] for i in acesso_publicacao.itens_do_pedido(20272, tiragem, "11" * 32, PoolFalso())]
    assert not set(a) & set(b)


def test_publicar_envia_em_lotes_e_fecha(monkeypatch):
    """A sequência que o servidor espera: abrir, lotes, fechar."""
    chamadas = []

    def falso_post(caminho, corpo=None):
        chamadas.append((caminho, len((corpo or {}).get("itens", []))))
        if caminho.endswith("/abrir"):
            return {"sal": "00" * 32, "reaberto": False, "tiragem": {"1000022": 1200}}
        if caminho.endswith("/fechar"):
            return {"total": 1200, "esperado": 1200, "completo": True}
        return {"gravadas": 0}

    monkeypatch.setattr(acesso_publicacao, "_post", falso_post)
    resumo = acesso_publicacao.publicar(20272, PoolFalso())

    assert resumo["enviadas"] == 1200
    assert resumo["completo"] is True
    lotes = [n for c, n in chamadas if c.endswith("/credenciais")]
    assert lotes == [500, 500, 200], f"lotes errados: {lotes}"
    assert chamadas[0][0].endswith("/abrir")
    assert chamadas[-1][0].endswith("/fechar")


def test_a_thread_nao_levanta_quando_a_rede_falha(monkeypatch, capsys):
    """Thread de fundo que levanta morre sozinha e em silêncio.

    O operador não veria nada, e a faixa ficaria pela metade até alguém
    reclamar da portaria.
    """
    monkeypatch.setattr(acesso_publicacao, "_segredo", lambda: "qualquer")

    def explode(*a, **k):
        raise ConnectionError("rede fora")

    monkeypatch.setattr(acesso_publicacao, "publicar", explode)
    acesso_publicacao._publicar_protegido(20272, PoolFalso)  # não pode levantar
    assert "Falha ao publicar" in capsys.readouterr().out


def test_sem_segredo_avisa_alto_e_nao_publica(monkeypatch, capsys):
    """Estação sem segredo não pode fingir que publicou."""
    monkeypatch.setattr(acesso_publicacao, "_segredo", lambda: None)
    chamou = []
    monkeypatch.setattr(acesso_publicacao, "publicar", lambda *a: chamou.append(1))
    acesso_publicacao._publicar_protegido(20272, PoolFalso)
    saida = capsys.readouterr().out
    assert not chamou
    assert "ACESSO_AGENTE_SEGREDO" in saida
    assert "NAO publicada" in saida


def test_faixa_incompleta_e_anunciada(monkeypatch, capsys):
    """Publicar 4.000 de 5.000 não pode passar por sucesso."""
    monkeypatch.setattr(acesso_publicacao, "_segredo", lambda: "qualquer")
    monkeypatch.setattr(acesso_publicacao, "publicar",
                        lambda *a: {"total": 4000, "esperado": 5000, "completo": False})
    acesso_publicacao._publicar_protegido(20272, PoolFalso)
    saida = capsys.readouterr().out
    assert "INCOMPLETA" in saida and "4000 de 5000" in saida


# ─── O gancho no fim da imposição ─────────────────────────────────────────────
#
# `_publicar_faixa_qr_ideal` é chamada logo depois de `engine.process()`, nos
# dois caminhos de `/api/impose`. Ela precisa ser seletiva: calcular a tiragem
# inteira em hash custa uns quinze segundos, e um trabalho de numeração comum
# não tem faixa nenhuma para publicar.


class ConfigFalso:
    def __init__(self, elements):
        self.elements = elements


def _espionar(monkeypatch):
    """Troca a publicação por um espião e devolve a lista de chamadas."""
    import acesso_publicacao as pub
    chamadas = []
    monkeypatch.setattr(pub, "publicar_em_fundo", lambda *a, **k: chamadas.append(a))
    return chamadas


def test_o_gancho_nao_dispara_sem_pedido(monkeypatch):
    """Sem pedido não há a quem atribuir a faixa."""
    import app
    chamadas = _espionar(monkeypatch)
    monkeypatch.setattr(app, "_pool_qr_ou_none", lambda: object())
    app._publicar_faixa_qr_ideal(ConfigFalso([{"type": "QR_IDEAL"}]), {})
    assert not chamadas


def test_o_gancho_nao_dispara_sem_elemento_qr_ideal(monkeypatch):
    """Numeração comum não tem faixa. Publicar seria queimar CPU à toa."""
    import app
    chamadas = _espionar(monkeypatch)
    monkeypatch.setattr(app, "_pool_qr_ou_none", lambda: object())
    app._publicar_faixa_qr_ideal(ConfigFalso([{"type": "TEXT"}, {"type": "QR"}]), {"pedido": 20272})
    assert not chamadas


def test_o_gancho_nao_dispara_sem_pool(monkeypatch):
    """Sem pool não há como calcular hash nenhum — é o caso do motor na nuvem."""
    import app
    chamadas = _espionar(monkeypatch)
    monkeypatch.setattr(app, "_pool_qr_ou_none", lambda: None)
    app._publicar_faixa_qr_ideal(ConfigFalso([{"type": "QR_IDEAL"}]), {"pedido": 20272})
    assert not chamadas


def test_o_gancho_dispara_quando_as_tres_condicoes_batem(monkeypatch):
    import app
    chamadas = _espionar(monkeypatch)
    monkeypatch.setattr(app, "_pool_qr_ou_none", lambda: object())
    app._publicar_faixa_qr_ideal(ConfigFalso([{"type": "TEXT"}, {"type": "QR_IDEAL"}]),
                                 {"pedido": 20272})
    assert len(chamadas) == 1
    assert chamadas[0][0] == 20272


def test_o_gancho_nunca_derruba_um_trabalho_ja_impresso(monkeypatch, capsys):
    """O papel já saiu. Uma exceção aqui não pode virar erro na tela do operador."""
    import app
    import acesso_publicacao as pub

    def explode(*a, **k):
        raise RuntimeError("qualquer coisa")

    monkeypatch.setattr(pub, "publicar_em_fundo", explode)
    monkeypatch.setattr(app, "_pool_qr_ou_none", lambda: object())
    app._publicar_faixa_qr_ideal(ConfigFalso([{"type": "QR_IDEAL"}]), {"pedido": 20272})
    assert "Nao consegui iniciar a publicacao" in capsys.readouterr().out
