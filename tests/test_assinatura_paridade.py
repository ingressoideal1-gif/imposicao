# -*- coding: utf-8 -*-
"""O Python confere o que o Deno assinou -- a outra metade da paridade.

O `supabase/functions/_compartilhado/assinatura_test.ts` prova o caminho de ida:
o Deno confere bilhete que o Python emitiu. Este arquivo prova a volta.

## Por que os dois sentidos

Uma implementação errada dos DOIS lados da mesma forma passaria num teste de
sentido único, e o dia em que um lado fosse corrigido sozinho quebraria o outro
sem ninguém entender por quê. Com os dois sentidos amarrados a casos gravados,
qualquer divergência aparece na hora, e aparece dizendo qual lado mudou.

## Os segredos aqui são de mesa

Fixos e públicos de propósito: os dois arquivos de casos vão para o
repositório. O segredo de produção nunca entra num caso de teste.

Regerar o arquivo (da pasta `supabase/functions`):

    npx deno run --allow-env _compartilhado/emitir_casos.ts > \
      ../../tests/assinatura_casos_do_deno.json
"""
import json
import os
import time

import pytest

CASOS = os.path.join(os.path.dirname(__file__), "assinatura_casos_do_deno.json")


@pytest.fixture(scope="module")
def casos():
    with open(CASOS, encoding="utf-8-sig") as f:
        return json.load(f)


@pytest.fixture(scope="module")
def modulos(casos):
    """Os dois módulos, com os segredos de mesa no ambiente.

    Eles guardam o segredo num cache de módulo (`_SEGREDO_CACHE`), então o
    ambiente precisa estar posto ANTES do primeiro uso -- e o cache precisa ser
    limpo depois, senão um teste que rode em seguida herdaria o segredo de mesa
    achando que é o de produção.
    """
    import acesso_elevacao
    import qr_pedido

    antes = (qr_pedido._SEGREDO_CACHE, acesso_elevacao._SEGREDO_CACHE)
    qr_pedido._SEGREDO_CACHE = casos["segredo_qr"]
    acesso_elevacao._SEGREDO_CACHE = casos["segredo_elevacao"]
    try:
        yield qr_pedido, acesso_elevacao
    finally:
        qr_pedido._SEGREDO_CACHE, acesso_elevacao._SEGREDO_CACHE = antes


def test_o_arquivo_veio_mesmo_do_deno(casos):
    """Se alguém regerar com o script errado, o resto do arquivo mentiria."""
    assert casos["emitido_por"] == "deno"


def test_cada_corpo_cru_assina_igual(casos, modulos):
    """O caso que pega a troca do alfabeto base64url (`+/` para `-_`)."""
    qr_pedido, _ = modulos
    for c in casos["corpos_crus"]:
        assert qr_pedido._assinar(c["corpo"]) == c["assinatura"], (
            f"o corpo {c['corpo']!r} assina diferente no Python"
        )


def test_nenhuma_assinatura_usa_o_alfabeto_padrao(casos):
    for c in casos["corpos_crus"]:
        assert not set(c["assinatura"]) & set("+/="), c["assinatura"]
        assert len(c["assinatura"]) == 27


def test_o_python_confere_o_qr_que_o_deno_emitiu(casos, modulos):
    qr_pedido, _ = modulos
    conferidos = 0
    for c in casos["qr"]:
        if c["expira"] < time.time():
            continue  # vencido de propósito; coberto no teste seguinte
        assert qr_pedido.conferir(c["token"]) == c["pedido"]
        conferidos += 1
    assert conferidos, "nenhum caso válido — as datas do arquivo venceram"


def test_o_qr_vencido_do_deno_e_recusado_como_vencido(casos, modulos):
    qr_pedido, _ = modulos
    vencido = next(c for c in casos["qr"] if c["expira"] == 0)
    with pytest.raises(ValueError, match="vencido"):
        qr_pedido.conferir(vencido["token"])


def test_o_python_confere_a_elevacao_que_o_deno_emitiu(casos, modulos):
    _, acesso_elevacao = modulos
    conferidos = 0
    for c in casos["elevacao"]:
        if c["expira"] < time.time():
            continue
        acesso_elevacao.conferir(
            c["token"], c["evento_id"], c["conta_id"], c["navegador"]
        )
        conferidos += 1
    assert conferidos, "nenhum caso válido — as datas do arquivo venceram"


def test_a_elevacao_do_deno_nao_vale_para_outro_evento(casos, modulos):
    """A assinatura é recalculada sobre o que o chamador afirma, não sobre o
    que veio no token — então trocar o evento simplesmente não bate."""
    _, acesso_elevacao = modulos
    c = next(x for x in casos["elevacao"] if x["expira"] == 2147483647)
    with pytest.raises(ValueError, match="assinatura invalida"):
        acesso_elevacao.conferir(c["token"], "outro-evento", c["conta_id"], c["navegador"])


def test_os_dois_arquivos_de_casos_concordam(casos):
    """O do Python e o do Deno têm de dizer a mesma coisa.

    É o fecho do circuito: se alguém regerar só um dos dois depois de mexer na
    assinatura, este teste falha em vez de os dois ficarem silenciosamente
    descolados.
    """
    do_python = os.path.join(
        os.path.dirname(__file__), "..", "supabase", "functions",
        "_compartilhado", "assinatura_casos.json",
    )
    with open(do_python, encoding="utf-8-sig") as f:
        outro = json.load(f)

    assert outro["segredo_qr"] == casos["segredo_qr"]
    assert outro["segredo_elevacao"] == casos["segredo_elevacao"]
    por_corpo = {c["corpo"]: c["assinatura"] for c in outro["corpos_crus"]}
    for c in casos["corpos_crus"]:
        assert por_corpo.get(c["corpo"]) == c["assinatura"], (
            f"os dois arquivos discordam sobre {c['corpo']!r}"
        )
