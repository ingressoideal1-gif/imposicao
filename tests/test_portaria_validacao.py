# -*- coding: utf-8 -*-
"""As seis regras que decidem se uma pessoa entra no evento.

A ORDEM e a resposta. Um ingresso pode falhar por dois motivos ao mesmo tempo --
ser de outro setor E cair numa faixa bloqueada -- e o porteiro precisa ouvir o
mais util dos dois. Trocar a ordem nao quebra nada visivelmente: so faz a tela
dizer a coisa errada, na frente da fila.

Roda o arquivo de verdade dentro de um navegador, pelo mesmo motivo do
tests/test_qr_ideal_hash.py: e la que ele vai rodar.
"""

import json
import os
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "portaria_validacao_harness.js")

PISTA = "11111111-1111-1111-1111-111111111111"
VIP = "22222222-2222-2222-2222-222222222222"


def chamar(nome, *argumentos):
    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300, capture_output=True, text=True,
        input=json.dumps({"chamada": nome, "argumentos": list(argumentos)}),
    )
    if r.returncode != 0:
        pytest.fail(f"o harness falhou:\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout)


def carga(**mudancas):
    base = {
        "evento": {"id": "e1", "nome": "Festa", "sal": "aa" * 32},
        "aparelho": {"id": "d1", "nome": "Portao A", "setores": [PISTA]},
        "sais": {"18560": "bb" * 32},
        "setores": [
            {"id": PISTA, "nome": "PISTA", "quantidade": 600,
             "tipo_uso": "unico", "abre_em": None, "fecha_em": None},
            {"id": VIP, "nome": "VIP", "quantidade": 500,
             "tipo_uso": "reentrada", "abre_em": None, "fecha_em": None},
        ],
        "bloqueios": [],
        "credenciais": [
            {"h": "h-pista-1", "s": PISTA, "n": 1, "id": "c-pista-1"},
            {"h": "h-vip-9", "s": VIP, "n": 9, "id": "c-vip-9"},
        ],
    }
    base.update(mudancas)
    return base


def decidir(hashes, c=None, agora="2026-08-20T22:00:00Z", entradas=None, escolhido=None):
    return chamar("decidir", {
        "hashes": hashes, "carga": c or carga(), "agora": agora,
        "entradas": entradas or {}, "setorEscolhido": escolhido,
    })


def test_regra_1_codigo_que_nao_e_do_evento_e_desconhecido():
    r = decidir(["h-de-outro-evento"])
    assert r["estado"] == "negado"
    assert r["motivo"] == "desconhecido"


def test_regra_2_ingresso_bom_no_portao_errado_NAO_e_desconhecido():
    """O erro mais caro desta tela. O ingresso e legitimo e esta na porta
    errada; chama-lo de desconhecido faz o porteiro devolver ingresso bom
    achando que e falso. Por isso a carga traz o evento inteiro."""
    r = decidir(["h-vip-9"])
    assert r["estado"] == "negado"
    assert r["motivo"] == "setor_nao_autorizado"
    assert r["setor"]["nome"] == "VIP"
    assert r["detalhe"]["setoresDoAparelho"] == ["PISTA"]


def test_regra_3_fora_da_janela_do_setor():
    c = carga()
    c["setores"][0]["abre_em"] = "2026-08-20T23:00:00Z"
    r = decidir(["h-pista-1"], c, agora="2026-08-20T22:00:00Z")
    assert r["motivo"] == "fora_da_janela"
    assert r["detalhe"]["abre_em"] == "2026-08-20T23:00:00Z"


def test_regra_3_depois_de_fechar_tambem_e_fora_da_janela():
    c = carga()
    c["setores"][0]["fecha_em"] = "2026-08-20T21:00:00Z"
    r = decidir(["h-pista-1"], c, agora="2026-08-20T22:00:00Z")
    assert r["motivo"] == "fora_da_janela"
    assert r["detalhe"]["fecha_em"] == "2026-08-20T21:00:00Z"


def test_regra_4_faixa_bloqueada_leva_o_motivo_junto():
    """O motivo e o que o porteiro le em voz alta -- foi para isso que a coluna
    nasceu obrigatoria na parte 3a."""
    c = carga(bloqueios=[{"setor_id": PISTA, "de": 1, "ate": 50,
                          "motivo": "lote extraviado na entrega"}])
    r = decidir(["h-pista-1"], c)
    assert r["motivo"] == "bloqueado"
    assert r["detalhe"]["motivoBloqueio"] == "lote extraviado na entrega"


def test_regra_4_a_faixa_e_inclusiva_nos_dois_extremos():
    """`de = ate = 1` bloqueia o ingresso 1 e mais nenhum. Um intervalo meio
    aberto deixaria um ingresso passando na ponta sem ninguem entender."""
    c = carga(bloqueios=[{"setor_id": PISTA, "de": 1, "ate": 1, "motivo": "x"}])
    assert decidir(["h-pista-1"], c)["motivo"] == "bloqueado"
    c["bloqueios"] = [{"setor_id": PISTA, "de": 2, "ate": 9, "motivo": "x"}]
    assert decidir(["h-pista-1"], c)["estado"] == "permitido"


def test_regra_4_bloqueio_de_OUTRO_setor_nao_alcanca_este():
    c = carga(bloqueios=[{"setor_id": VIP, "de": 1, "ate": 600, "motivo": "x"}])
    assert decidir(["h-pista-1"], c)["estado"] == "permitido"


def test_regra_5_ja_entrou_so_vale_para_setor_de_entrada_unica():
    entradas = {"c-pista-1": "2026-08-20T21:14:00Z"}
    r = decidir(["h-pista-1"], entradas=entradas)
    assert r["motivo"] == "ja_entrou"
    assert r["detalhe"]["momentoAnterior"] == "2026-08-20T21:14:00Z"


def test_regra_5_setor_de_reentrada_deixa_entrar_de_novo():
    c = carga()
    c["aparelho"]["setores"] = [VIP]
    r = decidir(["h-vip-9"], c, entradas={"c-vip-9": "2026-08-20T21:14:00Z"})
    assert r["estado"] == "permitido"


def test_regra_6_permitido_diz_o_setor_e_o_numero():
    r = decidir(["h-pista-1"])
    assert r["estado"] == "permitido"
    assert r["setor"]["nome"] == "PISTA"
    assert r["numero"] == 1
    assert r["credencial_id"] == "c-pista-1"


def test_a_ORDEM_das_regras_setor_errado_vence_faixa_bloqueada():
    """As duas falham. O porteiro precisa ouvir 'e VIP, aqui e PISTA', que ele
    resolve mandando a pessoa para a outra porta -- e nao 'lote extraviado',
    que o mandaria chamar o dono do evento a toa."""
    c = carga(bloqueios=[{"setor_id": VIP, "de": 1, "ate": 600, "motivo": "lote extraviado"}])
    assert decidir(["h-vip-9"], c)["motivo"] == "setor_nao_autorizado"


def test_a_ORDEM_das_regras_fora_da_janela_vence_faixa_bloqueada():
    """Fora da janela e a informacao que o porteiro consegue usar sozinho --
    'volte as 20h'. Dizer 'bloqueado' mandaria a pessoa procurar o dono do
    evento por um problema que, antes da janela abrir, nem e o dela: o
    bloqueio so importa depois que o setor comecar a valer."""
    c = carga(bloqueios=[{"setor_id": PISTA, "de": 1, "ate": 50, "motivo": "lote extraviado"}])
    c["setores"][0]["abre_em"] = "2026-08-20T23:00:00Z"
    r = decidir(["h-pista-1"], c, agora="2026-08-20T22:00:00Z")
    assert r["motivo"] == "fora_da_janela"


def test_a_ORDEM_das_regras_bloqueio_vence_ja_entrou():
    """Bloqueio e decisao do dono e tem motivo para ler em voz alta; 'ja entrou'
    e consequencia. Dizer 'ja entrou' esconderia que aquele lote esta suspenso."""
    c = carga(bloqueios=[{"setor_id": PISTA, "de": 1, "ate": 50, "motivo": "suspenso"}])
    r = decidir(["h-pista-1"], c, entradas={"c-pista-1": "2026-08-20T21:14:00Z"})
    assert r["motivo"] == "bloqueado"


def test_ambiguidade_o_mesmo_hash_em_dois_setores_autorizados_pergunta():
    """Com numeracao comum o 0001 do VIP e o do CAMAROTE tem o mesmo texto, o
    mesmo sal (o sal e por pedido) e portanto o MESMO hash. O aparelho nao
    escolhe: pergunta."""
    c = carga()
    c["aparelho"]["setores"] = [PISTA, VIP]
    c["credenciais"] = [
        {"h": "h-igual", "s": PISTA, "n": 1, "id": "c-p"},
        {"h": "h-igual", "s": VIP, "n": 1, "id": "c-v"},
    ]
    r = decidir(["h-igual"], c)
    assert r["estado"] == "ambiguo"
    assert sorted(x["setor"]["nome"] for x in r["candidatos"]) == ["PISTA", "VIP"]


def test_ambiguidade_com_o_setor_escolhido_decide_normalmente():
    c = carga()
    c["aparelho"]["setores"] = [PISTA, VIP]
    c["credenciais"] = [
        {"h": "h-igual", "s": PISTA, "n": 1, "id": "c-p"},
        {"h": "h-igual", "s": VIP, "n": 1, "id": "c-v"},
    ]
    r = decidir(["h-igual"], c, escolhido=VIP)
    assert r["estado"] == "permitido"
    assert r["credencial_id"] == "c-v"


def test_ambiguidade_nao_pergunta_quando_so_um_setor_e_autorizado():
    """O aparelho de PISTA nao deve perguntar nada: o candidato do VIP nem e
    dele. Perguntar aqui poria o porteiro para escolher uma porta que ele nao
    atende."""
    c = carga()
    c["credenciais"] = [
        {"h": "h-igual", "s": PISTA, "n": 1, "id": "c-p"},
        {"h": "h-igual", "s": VIP, "n": 1, "id": "c-v"},
    ]
    r = decidir(["h-igual"], c)
    assert r["estado"] == "permitido"
    assert r["credencial_id"] == "c-p"


def test_o_sal_do_QR_IDEAL_sai_do_pedido_escrito_no_proprio_codigo():
    """O conteudo e `pedido invertido + 8 caracteres`. 06581 invertido e 18560,
    que e um pedido deste evento -- entao ha um sal certo e nao se tenta outro."""
    r = chamar("saisParaTentar", "06581ABCDEFGH", carga())
    assert r == ["bb" * 32]


def test_codigo_comum_tenta_o_sal_de_cada_pedido_e_o_do_evento():
    """`000001` nao diz de que pedido e. Sao poucos pedidos por evento, e cada
    tentativa custa milissegundos."""
    r = chamar("saisParaTentar", "000001", carga())
    assert r == ["bb" * 32, "aa" * 32]
