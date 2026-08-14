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

import threading
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
    # `*a` de proposito: uma assinatura fixa aqui morre em silencio quando a
    # de verdade ganha um parametro. A thread levanta TypeError, ninguem ve, e
    # este teste continua passando porque so mede tempo. Ja aconteceu.
    entrou = threading.Event()

    def demorada(*a):
        entrou.set()
        time.sleep(2)

    monkeypatch.setattr(acesso_publicacao, "_publicar_protegido", demorada)
    comeco = time.time()
    acesso_publicacao.publicar_em_fundo(20272, PoolFalso)
    assert time.time() - comeco < 0.5, "a publicacao segurou quem chamou"
    assert entrou.wait(3), "a thread nem chegou a rodar"


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
    def __init__(self, elements, modelo="1000105", multi_artes=None):
        self.elements = elements
        self.modelo = modelo
        self.multi_artes = multi_artes or []


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


def test_o_gancho_dispara_com_qr_comum(monkeypatch):
    """Mudou em 14/08: QR comum tambem alimenta a portaria.

    Antes o gancho exigia o elemento QR_IDEAL. A regra do usuario passou a ser
    que o Ideal Control funcione com qualquer ingresso que tenha QR ou codigo
    de barras, lendo o dado do proprio elemento de numeracao.
    """
    import app
    chamadas = _espionar(monkeypatch)
    monkeypatch.setattr(app, "_pool_qr_ou_none", lambda: object())
    app._publicar_faixa_qr_ideal(ConfigFalso([{"type": "TEXT"}, {"type": "QR", "pad": 4}]),
                                 {"pedido": 20272})
    assert len(chamadas) == 1


def test_o_gancho_nao_dispara_sem_codigo_nenhum(monkeypatch):
    """Etiqueta com texto e picote nao tem o que a portaria leia."""
    import app
    chamadas = _espionar(monkeypatch)
    monkeypatch.setattr(app, "_pool_qr_ou_none", lambda: object())
    app._publicar_faixa_qr_ideal(ConfigFalso([{"type": "TEXT"}, {"type": "PICOTE"}]),
                                 {"pedido": 20272})
    assert not chamadas


def test_o_gancho_nao_dispara_sem_pool_QUANDO_e_qr_ideal(monkeypatch):
    """Sem pool não há como calcular o código do QR Ideal — motor na nuvem."""
    import app
    chamadas = _espionar(monkeypatch)
    monkeypatch.setattr(app, "_pool_qr_ou_none", lambda: None)
    app._publicar_faixa_qr_ideal(ConfigFalso([{"type": "QR_IDEAL"}]), {"pedido": 20272})
    assert not chamadas


def test_sem_pool_o_qr_comum_publica_do_mesmo_jeito(monkeypatch):
    """A numeracao comum nao depende do pool: a conta sai do proprio elemento.

    Antes a falta do pool desistia de tudo. Continuar desistindo deixaria a
    estacao sem o arquivo de 24 MB sem controle de acesso nenhum, mesmo nos
    trabalhos que nao precisam dele.
    """
    import app
    chamadas = _espionar(monkeypatch)
    monkeypatch.setattr(app, "_pool_qr_ou_none", lambda: None)
    app._publicar_faixa_qr_ideal(ConfigFalso([{"type": "QR", "pad": 4}]), {"pedido": 20272})
    assert len(chamadas) == 1


def test_o_gancho_dispara_quando_as_tres_condicoes_batem(monkeypatch):
    import app
    chamadas = _espionar(monkeypatch)
    monkeypatch.setattr(app, "_pool_qr_ou_none", lambda: object())
    app._publicar_faixa_qr_ideal(ConfigFalso([{"type": "TEXT"}, {"type": "QR_IDEAL"}]),
                                 {"pedido": 20272})
    assert len(chamadas) == 1
    assert chamadas[0][0] == 20272


def test_o_gancho_leva_a_numeracao_de_cada_modelo(monkeypatch):
    """O agente nao conhece a numeracao: quem a entrega e o app.py.

    Sem esse mapa, o agente calcularia tudo pelo pool — e um modelo de QR
    comum receberia hash que nao corresponde ao papel.
    """
    import app
    chamadas = _espionar(monkeypatch)
    monkeypatch.setattr(app, "_pool_qr_ou_none", lambda: object())
    app._publicar_faixa_qr_ideal(
        ConfigFalso([{"type": "QR", "pad": 4, "prefix": "V"}], modelo="1000105"),
        {"pedido": 20272})
    assert chamadas[0][2] == {
        1000105: {"tipo": "QR", "prefix": "V", "pad": 4, "suffix": ""}
    }


def test_modelo_ausente_nao_publica(monkeypatch):
    """Sem modelo nao ha a que amarrar o codigo, e supor seria pior."""
    import app
    chamadas = _espionar(monkeypatch)
    monkeypatch.setattr(app, "_pool_qr_ou_none", lambda: object())
    app._publicar_faixa_qr_ideal(ConfigFalso([{"type": "QR", "pad": 4}], modelo=None),
                                 {"pedido": 20272})
    assert not chamadas


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
