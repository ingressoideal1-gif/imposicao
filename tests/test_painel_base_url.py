# -*- coding: utf-8 -*-
"""Para onde aponta o QR que o cliente recebe por WhatsApp.

O endereco vive DUPLICADO de proposito -- `security_config.PAINEL_BASE_URL` no
Python e `PAINEL_PADRAO` no `acesso-pedido/puro.ts` --, porque nenhum dos dois
lados pode busca-lo do ambiente: quem controlasse o ambiente controlaria para
onde o QR do cliente aponta, e o QR viaja por WhatsApp longe de qualquer
conferencia nossa.

Duplicado sem trava e duplicado que diverge. Estes testes sao a trava.
"""
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import security_config

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PURO_TS = os.path.join(RAIZ, "supabase", "functions", "acesso-pedido", "puro.ts")

# A origem em que o aplicativo instalavel MORA. O site atende tambem por
# `imposicao.vercel.app`, e continua atendendo -- QR ja emitido nao pode parar de
# funcionar --, mas o Ideal Control e instalado a partir deste endereco, e e
# nesta origem que ficam o chaveiro dos portoes e o service worker dele.
ONDE_O_APLICATIVO_MORA = "https://ideal-imposition.vercel.app"


def _padrao_do_typescript():
    with open(PURO_TS, encoding="utf-8") as f:
        m = re.search(r'PAINEL_PADRAO\s*=\s*"([^"]+)"', f.read())
    assert m, "PAINEL_PADRAO sumiu do puro.ts"
    return m.group(1)


def test_o_QR_aponta_para_a_origem_em_que_o_aplicativo_e_instalado():
    """O defeito de 17/08/2026.

    O QR era cunhado com `imposicao.vercel.app` e o aplicativo vive em
    `ideal-imposition.vercel.app`. Quem TOCAVA no link no WhatsApp caia no
    outro endereco numa aba de navegador -- outra origem, outro
    `localStorage`, e o celular oferecendo instalar uma SEGUNDA copia do
    aplicativo, cada uma com os seus proprios portoes."""
    assert security_config.PAINEL_BASE_URL == ONDE_O_APLICATIVO_MORA


def test_os_dois_lados_nao_podem_divergir():
    """Python e Edge Function cunham a MESMA URL. Divergir significa dois
    clientes recebendo enderecos diferentes conforme quem gerou o QR."""
    assert _padrao_do_typescript() == security_config.PAINEL_BASE_URL


def test_o_endereco_antigo_continua_aceito_como_origem_nossa():
    """QR ja impresso e ja enviado por WhatsApp carrega o endereco antigo, e ele
    tem de continuar funcionando. Tirar `imposicao.vercel.app` da lista de
    origens quebraria todo QR que ja saiu daqui."""
    assert "https://imposicao.vercel.app" in security_config.ALLOWED_ORIGINS
    assert ONDE_O_APLICATIVO_MORA in security_config.ALLOWED_ORIGINS
