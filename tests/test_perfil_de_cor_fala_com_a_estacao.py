# -*- coding: utf-8 -*-
"""O perfil ICC por impressora mora no agente, e é com ele que a tela fala.

## O defeito que este arquivo fecha

O bloco de Gerenciamento de Cores do `script.js` já dizia, no próprio
comentário, onde o dado mora: *"O mapa vive no agente da estação
(printer_icc_map.json), ao lado do mapa de PPDs."* Mas as cinco chamadas usavam
caminho RELATIVO — ou seja, perguntavam a quem serviu a página.

No painel aberto pela Vercel isso ia parar no Render, que tem outro disco e
efêmero. O efeito era silencioso das duas pontas: o seletor de perfil vinha
vazio como se a estação não tivesse perfil nenhum, e o que fosse salvo ali
sumia na publicação seguinte sem erro na tela. Quem configurasse cor pelo
painel da nuvem imprimiria com a configuração antiga e não teria como saber.

É o MESMO desvio que já tinha sido corrigido em `carregarCapacidades` e no mapa
de PPDs — os dois carregam até hoje o comentário "127.0.0.1: o hostname da
pagina apontava para a Vercel". Este bloco ficou para trás.

## Por que uma guarda de código-fonte, e não um teste de comportamento

Porque o defeito não é de lógica: é de ENDEREÇO. Um teste que exercitasse a
função precisaria de um agente de verdade em 127.0.0.1 e de uma impressora
configurada. O que precisa ser vigiado cabe numa pergunta que se responde lendo
o arquivo: alguma chamada de cor saiu sem o `AGENTE_LOCAL_URL`?
"""
import os
import re
import sys

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)

with open(os.path.join(RAIZ, "frontend", "script.js"), encoding="utf-8") as f:
    SCRIPT = f.read()

#: As rotas que só o agente da estação sabe responder, porque o dado está no
#: disco dele. `printers/capabilities` não entra: já foi corrigida e tem o
#: comentário dela.
ROTAS_DA_ESTACAO = ["/api/icc", "/api/icc/upload", "/api/printers/icc-map"]


@pytest.mark.parametrize("rota", ROTAS_DA_ESTACAO)
def test_a_chamada_leva_o_endereco_do_agente(rota):
    for linha in SCRIPT.splitlines():
        if f"fetch(" in linha and rota in linha:
            assert "AGENTE_LOCAL_URL" in linha, (
                f"chamada a {rota} sem o agente -> {linha.strip()[:100]}"
            )


@pytest.mark.parametrize("rota", ROTAS_DA_ESTACAO)
def test_a_rota_e_mesmo_chamada_em_algum_lugar(rota):
    """Sem isto, apagar a tela inteira faria os testes acima passarem."""
    assert re.search(rf"AGENTE_LOCAL_URL\}}{re.escape(rota)}\b", SCRIPT), (
        f"ninguem mais chama {rota}; a tela de cor sumiu?"
    )


def test_o_ping_de_pre_aquecimento_do_render_nao_volta():
    """Ele disparava em TODA página da nuvem só para acordar o servidor Python
    que ficava lá. Aquele servidor saiu do ar em 17/08/2026, e as telas falam
    com Edge Functions, que não dormem."""
    # Só as linhas de CÓDIGO: a lápide que ficou no lugar do ping cita o
    # endereço, e uma busca crua acharia o texto errado.
    codigo = [l for l in SCRIPT.splitlines() if not l.strip().startswith("//")]
    for linha in codigo:
        assert "onrender.com/api/health" not in linha, linha.strip()[:100]
        assert "_prewarmRenderServer" not in linha, linha.strip()[:100]
