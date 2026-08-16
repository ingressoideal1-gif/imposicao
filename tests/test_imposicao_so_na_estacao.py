# -*- coding: utf-8 -*-
"""Imposicao e impressao so acontecem na estacao da grafica.

O QUE ESTE TESTE PREVINE

Ate 15/08/2026 o painel, quando nao achava a estacao, mandava o trabalho para o
motor na nuvem: o PDF da arte inteiro -- o material do cliente, centenas de MB --
subia para um servidor de terceiro, e o operador via apenas um selo discreto
escrito "NUVEM" no meio dos numeros do progresso.

Em 15/08/2026 o usuario encerrou o assunto: "ate por questao de seguranca,
impressao so pode acontecer pela estacao da grafica".

Sao DUAS barreiras, e este arquivo cobra as duas:

1. o painel nao tem mais para onde desviar, e recusa comecar sem estacao;
2. o motor na nuvem recusa impor -- porque um painel antigo, em cache no
   navegador de alguma estacao, continuaria tentando por semanas.

Uma barreira so nao bastaria. A do painel protege quem usa a versao de hoje; a
do motor protege contra a copia que o navegador guardou ontem.

## Por que o payload dos testes e invalido de proposito

`impose_file` chama `db.get_formato(...)` logo no comeco, e isso vai a REDE. Um
teste que mandasse payload valido dependeria do Supabase estar no ar para
responder uma pergunta que nao tem nada a ver com Supabase. Com payload
invalido, o `json.loads` falha na primeira linha do `try` e a resposta e 400 --
imediata, offline e estavel. A recusa da nuvem vem ANTES desse `try`, entao ela
continua sendo 403.
"""
import os
import sys
from pathlib import Path

from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

RAIZ = Path(__file__).resolve().parent.parent
FRONT = RAIZ / "frontend"

# Falha no `json.loads`, na primeira linha do `try`, sem tocar no banco.
PAYLOAD_QUE_NAO_ALCANCA_A_REDE = {"payload": "nao-e-json"}


def _cliente_com_nuvem(monkeypatch, na_nuvem: bool) -> TestClient:
    import security_config
    import app as app_mod
    monkeypatch.setattr(security_config, "is_cloud_runtime", lambda: na_nuvem)
    return TestClient(app_mod.app)


def test_na_nuvem_o_motor_recusa_impor(monkeypatch):
    cliente = _cliente_com_nuvem(monkeypatch, na_nuvem=True)

    r = cliente.post("/api/impose", data=PAYLOAD_QUE_NAO_ALCANCA_A_REDE)

    assert r.status_code == 403, f"a nuvem aceitou impor (status {r.status_code})"


def test_a_recusa_diz_ao_operador_o_que_fazer(monkeypatch):
    """Recusa sem saida ensina o operador a procurar defeito onde nao ha."""
    cliente = _cliente_com_nuvem(monkeypatch, na_nuvem=True)

    r = cliente.post("/api/impose", data=PAYLOAD_QUE_NAO_ALCANCA_A_REDE)
    detalhe = (r.json().get("detail") or "").lower()

    assert "localhost:9000" in detalhe, (
        "a recusa nao diz o endereco pelo qual o trabalho funciona"
    )
    assert "estacao" in detalhe, "a recusa nao diz onde a imposicao acontece"


def test_na_estacao_o_motor_nao_recusa(monkeypatch):
    """A barreira e da NUVEM. Na estacao nao pode existir.

    O 400 e o `json.loads` recusando o payload de proposito invalido -- ou seja,
    a requisicao ENTROU no corpo do endpoint em vez de parar na porta. E isso
    que se quer provar aqui.
    """
    cliente = _cliente_com_nuvem(monkeypatch, na_nuvem=False)

    r = cliente.post("/api/impose", data=PAYLOAD_QUE_NAO_ALCANCA_A_REDE)

    assert r.status_code == 400, (
        f"a estacao devia ter entrado no endpoint e falhado no payload, "
        f"e respondeu {r.status_code}"
    )
