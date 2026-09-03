# -*- coding: utf-8 -*-
"""O cliente aprova a arte e vai embora sem conferir entrega e nota.

Medido no banco em 03/09/2026, com os 88 links ativos:

    arte ja decidida, dados NUNCA conferidos ....... 17 pedidos
    desses, que abriram o link 2x ou mais .......... 14
    taxa desde que o Portal do Pedido existe ....... 6 de 14 (43%)
    links que ja pediram correcao de dados ......... 0 de 88

Nao foi falta de oportunidade: um dos 17 abriu o link 50 vezes. O motivo estava
na tela. Para quem ja tinha aprovado, o link abria SEMPRE na aba da Arte
(`montarPortal` so respeitava um `#hash`, e o link colado no WhatsApp nao tem
hash), e o cartao maior da primeira dobra dizia *"Pedido em producao -- suas
artes ja estao na impressora"*: uma mensagem de tranquilidade. O que pedia acao
eram dois chips CINZA na trilha e dois pontos ambar de 9px no rodape -- duas
linguas diferentes para o mesmo estado.

Endereco errado e frete de volta; CNPJ errado e nota refeita. Os dois so se
descobrem depois de o material estar impresso.

As quatro mudancas que este teste protege estao no harness ao lado, e a quinta
-- o marcador para a grafica, no Painel de Producao -- e a segunda linha de
defesa, para o caso de o cliente fechar o WhatsApp no meio mesmo assim.
"""
import os
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "portal_pendencia_harness.js")


def test_o_harness_da_pendencia_do_portal_passa():
    assert os.path.exists(HARNESS), "o harness da pendencia do Portal sumiu"

    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300,
        capture_output=True, text=True, encoding="utf-8", errors="replace",
    )
    assert r.returncode == 0, "o harness falhou:" + (r.stdout or "") + (r.stderr or "")
    assert "OK:" in (r.stdout or ""), "o harness nao relatou sucesso:" + (r.stdout or "")


def test_o_cartao_da_pendencia_nao_reusa_a_classe_da_aba_de_entrega():
    """`.portal-falta` ja pertencia ao cartao EM LINHA da aba de Entrega, com
    `display: flex`. O cartao novo, que e empilhado, chegou a nascer com essa
    classe: titulo, texto e botao sairam lado a lado, cada um numa coluna
    estreita, e a margem de um vazou para o outro. Foi visto na tela antes de
    publicar, e nao pode voltar por descuido de nome."""
    with open(os.path.join(RAIZ, "frontend", "style.css"), encoding="utf-8") as f:
        css = f.read()

    assert ".portal-falta {" in css, "a classe da aba de Entrega sumiu"
    assert ".portal-pendencia {" in css, "a classe do cartao novo sumiu"

    # As duas existem, e sao diferentes: a da Entrega e em linha, a nova nao.
    trecho_falta = css.split(".portal-falta {", 1)[1].split("}", 1)[0]
    trecho_pendencia = css.split(".portal-pendencia {", 1)[1].split("}", 1)[0]
    assert "display: flex" in trecho_falta, "a da aba de Entrega deixou de ser em linha"
    assert "display" not in trecho_pendencia, "o cartao novo nao deve mexer no display"
