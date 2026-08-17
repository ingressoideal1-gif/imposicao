# -*- coding: utf-8 -*-
"""O "Novo Evento": a camera que le o QR e decide a tela.

O QR do Pedido (`?t=`) leva ao cadastro do evento; o QR do portao (`?e=`) liga
este aparelho a leitura. A conferencia de ORIGEM existe para que um QR qualquer
de rua nao abra fluxo nenhum com dado estranho dentro.

O que este arquivo protege e o equilibrio entre as duas coisas. Ate 17/08/2026 a
conferencia era `url.origin !== window.location.origin` -- origem IDENTICA --, e
isso recusava o QR legitimo da propria grafica: ele e cunhado com
`https://imposicao.vercel.app` (o `PAINEL_PADRAO` do `acesso-pedido`), e o
aplicativo instalado do dono roda em `https://ideal-imposition.vercel.app`. Dois
enderecos do MESMO sistema, e a tela dizia "Este QR nao e do Ideal Control".
"""

import json
import os
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "ler_qr_harness.js")

APP = "https://ideal-imposition.vercel.app"
QR_DA_GRAFICA = "https://imposicao.vercel.app"


def despachar(qr, origem=APP):
    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300, capture_output=True,
        encoding="utf-8", input=json.dumps({"origem": origem, "qr": qr}),
    )
    if r.returncode != 0:
        pytest.fail(f"o harness falhou:\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout.strip().splitlines()[-1])


def test_o_QR_da_grafica_e_aceito_no_aplicativo_instalado():
    """O defeito relatado pelo dono em 17/08/2026, com o aplicativo em v621.

    O QR sai do `acesso-pedido` com o dominio `imposicao.vercel.app`; o
    aplicativo instalado dele abre em `ideal-imposition.vercel.app`. Sao os dois
    enderecos oficiais do mesmo sistema -- os dois estao em
    `security_config.ALLOWED_ORIGINS` e em `_compartilhado/cors.ts` --, e exigir
    que fossem o MESMO deixava o dono sem conseguir cadastrar evento nenhum.
    """
    r = despachar(QR_DA_GRAFICA + "/ic/evento.html?t=tok-123")
    assert r["recusou"] is False, r["aviso"]
    assert r["destino"].endswith("/ic/evento.html?t=tok-123")


def test_o_QR_do_outro_dominio_NAO_leva_o_dono_para_o_outro_dominio():
    """Aceitar o QR e SEGUI-LO sao coisas diferentes.

    O destino e montado com caminho relativo, entao a tela que abre e a do
    endereco em que o dono ja esta -- o aplicativo instalado dele. Se a
    navegacao seguisse o dominio escrito no QR, o dono sairia do aplicativo
    instalado para uma aba de navegador: outra origem, outro `localStorage`,
    outro chaveiro de portoes, e ate a oferta de instalar um SEGUNDO aplicativo.
    Duas copias do mesmo sistema no mesmo celular e a confusao que esta linha
    existe para impedir."""
    r = despachar(QR_DA_GRAFICA + "/ic/evento.html?t=tok-123")
    assert r["destino"].startswith(APP), (
        "ler o QR jogou o dono para fora do aplicativo instalado"
    )
    assert QR_DA_GRAFICA not in r["destino"]


def test_o_QR_do_portao_da_grafica_tambem_e_aceito():
    r = despachar(QR_DA_GRAFICA + "/ic/portaria.html?e=ev-9")
    assert r["recusou"] is False, r["aviso"]
    assert r["destino"].endswith("/ic/portaria.html?e=ev-9")


def test_o_QR_da_propria_origem_continua_valendo():
    r = despachar(APP + "/ic/evento.html?t=tok-123")
    assert r["recusou"] is False, r["aviso"]
    assert r["destino"].endswith("/ic/evento.html?t=tok-123")


def test_um_QR_de_rua_continua_recusado():
    """A conferencia de origem nao pode virar decoracao: o que ela impede e um
    QR colado num poste mandar o dono cadastrar o evento de outra pessoa."""
    r = despachar("https://exemplo-qualquer.com/ic/evento.html?t=tok-123")
    assert r["recusou"] is True
    assert "não é do Ideal Control" in r["aviso"]


def test_dominio_parecido_com_o_nosso_e_recusado():
    """`ideal-imposition.vercel.app.exemplo.com` e um dominio que qualquer um
    registra. A regra tem de estar ANCORADA -- e a mesma licao que o
    `_compartilhado/cors.ts` ja aprendeu."""
    r = despachar("https://ideal-imposition.vercel.app.exemplo.com/x?t=tok")
    assert r["recusou"] is True


def test_a_estacao_da_gtafica_le_o_proprio_QR():
    """Na estacao as paginas sao servidas pelo agente local, em `localhost` numa
    porta qualquer. Um QR cunhado com o endereco da propria pagina tem de
    passar, senao a grafica nao consegue testar o proprio fluxo."""
    r = despachar("http://localhost:9000/evento.html?t=tok-123",
                  origem="http://localhost:9000")
    assert r["recusou"] is False, r["aviso"]
