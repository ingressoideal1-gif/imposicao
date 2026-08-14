# -*- coding: utf-8 -*-
"""O pedido e o modelo precisam CHEGAR ao motor, e não só existir nele.

Este arquivo nasceu de um defeito que passou por toda a parte 1 sem ninguém
notar: o `app.py` lia `data.get("pedido")` e `data.get("modelo")` do payload, e
**nenhum dos dois frontends enviava essas chaves**. Resultado: `cfg.pedido` era
sempre `None`, e todo trabalho com QR Ideal era recusado com

    "QR Ideal sem pedido ou modelo: o trabalho nao pode ser impresso."

O QR Ideal nunca imprimiu. Nem uma vez.

## Por que a suíte inteira passava

Porque os testes do motor montam o `ImpositionConfig` na mão, com `pedido=` e
`modelo=` preenchidos. Eles provavam que a conta do pool estava certa — e
estava. O que ninguém provava é que alguém chegava a chamar aquela conta.

É a diferença entre testar a peça e testar o encaixe. A peça estava perfeita; o
parafuso que a prendia não existia.

## O que estes testes cobram

Que as duas chaves estejam no payload que cada frontend monta, e que o motor
recuse cedo e dizendo QUAL das três coisas falta — pedido, modelo ou o pool.
"""

import os
import re

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


# ── O payload dos dois frontends ────────────────────────────────────────────

@pytest.mark.parametrize("arquivo", ["frontend/script.js", "frontend/pedido.js"])
def test_o_payload_da_imposicao_leva_pedido_e_modelo(arquivo):
    """As duas chaves que o app.py le. Sem elas o QR Ideal nao imprime."""
    texto = _ler(arquivo)
    # `pedido:` no comeco de uma propriedade de objeto, e nao em comentario.
    assert re.search(r"^\s*pedido:\s", texto, re.M), (
        f"{arquivo} nao envia `pedido` no payload de /api/impose"
    )
    assert re.search(r"^\s*modelo:\s", texto, re.M), (
        f"{arquivo} nao envia `modelo` no payload de /api/impose"
    )


@pytest.mark.parametrize("arquivo", ["frontend/script.js", "frontend/pedido.js"])
def test_cada_arte_da_folha_leva_o_modelo_dela(arquivo):
    """Numa folha multi-artes cada modelo tira uma coluna diferente do pool.

    Sem o modelo por arte, o motor nao sabe de qual arte veio cada item — e
    recusa a folha inteira.
    """
    texto = _ler(arquivo)
    assert "modelo: arte.modelo" in texto or "modelo: s.itemId" in texto, (
        f"{arquivo} nao leva o modelo de cada arte de multi_artes"
    )


def test_o_app_le_exatamente_as_chaves_que_o_frontend_manda():
    """A ponta que faltava: as duas metades do contrato, no mesmo teste."""
    app = _ler("app.py")
    assert 'pedido=data.get("pedido")' in app
    assert 'modelo=data.get("modelo")' in app


# ── O motor recusa cedo, e dizendo o que falta ──────────────────────────────

class _CfgFalso:
    def __init__(self, pedido=None, modelo=None, pool_qr=None, multi_artes=None,
                 elements=None):
        self.pedido = pedido
        self.modelo = modelo
        self.pool_qr = pool_qr
        self.multi_artes = multi_artes or []
        self.elements = elements if elements is not None else [{"type": "QR_IDEAL"}]


def _conferir(cfg):
    """Chama a conferencia do motor com um config de mentira."""
    import engine
    imp = engine.ImpositionEngine.__new__(engine.ImpositionEngine)
    imp.cfg = cfg
    return imp._conferir_dados_do_qr_ideal()


def test_sem_qr_ideal_a_conferencia_nem_roda():
    """Um trabalho de numeracao comum nao pode falhar por falta do pool."""
    assert _conferir(_CfgFalso(elements=[{"type": "QR"}])) is None


def test_diz_que_falta_o_pedido():
    with pytest.raises(ValueError) as e:
        _conferir(_CfgFalso(modelo="1000110", pool_qr=object()))
    assert "numero do pedido" in str(e.value)


def test_diz_que_falta_o_modelo():
    with pytest.raises(ValueError) as e:
        _conferir(_CfgFalso(pedido=18560, pool_qr=object()))
    assert "numero do modelo" in str(e.value)


def test_diz_que_falta_o_POOL_e_nao_manda_procurar_pedido():
    """A causa que a mensagem antiga escondia.

    A estacao sem o arquivo de 24 MB e identica a uma com ele ate imprimir, e a
    mensagem antiga mandava conferir pedido e modelo — que estavam certos.
    """
    with pytest.raises(ValueError) as e:
        _conferir(_CfgFalso(pedido=18560, modelo="1000110", pool_qr=None))
    msg = str(e.value)
    assert "qr_ideal_pool.bin" in msg
    assert "numero do pedido" not in msg
    assert "numero do modelo" not in msg


def test_nomeia_a_arte_sem_modelo_na_folha_multi_artes():
    """Com cinco artes na folha, "falta o modelo" nao ajuda ninguem."""
    with pytest.raises(ValueError) as e:
        _conferir(_CfgFalso(
            pedido=18560, pool_qr=object(),
            multi_artes=[{"modelo": "1000107", "nome": "VIP"},
                         {"modelo": None, "nome": "CAMAROTE"}],
        ))
    assert "CAMAROTE" in str(e.value)
    assert "VIP" not in str(e.value)


def test_passa_quando_esta_tudo_no_lugar():
    assert _conferir(_CfgFalso(pedido=18560, modelo="1000110", pool_qr=object())) is None
    assert _conferir(_CfgFalso(
        pedido=18560, pool_qr=object(),
        multi_artes=[{"modelo": "1000107"}, {"modelo": "1000110"}],
    )) is None
