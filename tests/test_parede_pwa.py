# -*- coding: utf-8 -*-
"""A exigencia de instalar o aplicativo, e a ressalva que evita trancar alguem.

Decisao do usuario em 16/08/2026: "exige instalar sempre", com a ressalva
"deixar passar so nesse caso" quando o navegador nao souber instalar. As duas
metades importam. Sem a primeira o pedido nao foi atendido; sem a segunda,
quem abre no Firefox do PC fica olhando uma parede que nunca sai.
"""

import os
import re

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


def test_reconhece_o_aplicativo_instalado_nos_dois_sistemas():
    """Android e PC respondem `display-mode`; o iPhone so `navigator.standalone`."""
    texto = _ler("frontend/parede-pwa.js")
    assert "display-mode: standalone" in texto
    assert "navigator.standalone" in texto


def test_o_iphone_recebe_a_instrucao_em_texto():
    """Safari nunca dispara `beforeinstallprompt`. Sem a frase, o iPhone
    ficaria diante de uma parede sem saida."""
    texto = _ler("frontend/parede-pwa.js")
    assert "Tela de Início" in texto
    assert "Compartilhar" in texto


def test_navegador_que_nao_sabe_instalar_NAO_leva_parede():
    """A ressalva do usuario, e ela precisa estar escrita no codigo."""
    texto = _ler("frontend/parede-pwa.js")
    assert "'nada'" in texto or '"nada"' in texto


def test_a_espera_pelo_beforeinstallprompt_tem_teto():
    """Sem teto, o navegador que nunca dispara o evento deixa a tela travada
    esperando para sempre."""
    assert re.search(r"setTimeout\([^)]*,\s*1[0-9]{3}\s*\)", _ler("frontend/parede-pwa.js"))


def test_a_parede_nao_e_fechavel():
    """Enquanto ela estiver ali o aplicativo nao e usavel -- e o ponto dela."""
    texto = _ler("frontend/parede-pwa.js")
    assert "Fechar" not in texto and "Agora não" not in texto


def test_o_arquivo_entra_na_lista_que_as_estacoes_baixam():
    import security_config
    assert "parede-pwa.js" in security_config.PAINEL_ARQUIVOS
