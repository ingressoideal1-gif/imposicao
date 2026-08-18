# -*- coding: utf-8 -*-
"""O heartbeat reporta a versao, e sobrevive ao banco que ainda nao tem a coluna.

Nasceu da Tarefa 5 da Fase 2b. A pergunta que ela responde é operacional: para
desligar o Render é preciso saber quando as onze estações migraram, e desligar
antes que a última migre significa uma gráfica imprimindo ingressos que nunca
são publicados.

## O risco que estes testes existem para prender

Mandar uma coluna que o banco não tem faz o PostgREST recusar o UPSERT
**inteiro**. Não seria uma informação a menos — seria a estação sumindo do
painel, porque `last_seen` deixaria de ser atualizado. O operador veria "nenhuma
estação com sinal recente" e não teria como imprimir pelo relay.

Como o `ALTER TABLE` roda no editor do Supabase, por uma pessoa, e o agente sai
por outro caminho (`publicar_agente.ps1`), existe uma janela em que os dois
estão fora de fase — nas duas ordens possíveis. Os dois lados precisam
atravessar essa janela sem quebrar.
"""
import json
import os
import sys
import urllib.error

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ferramentas"))

import acesso_publicacao
import agent_worker
import estacoes


# Para onde a estacao publica a faixa de codigos hoje. Sai do proprio modulo que
# publica, e nao de um literal: se o padrao mudar, o teste acompanha em vez de
# guardar um endereco que ninguem mais usa -- foi exatamente o que aconteceu com
# o servidor Python da nuvem, que ficou aqui dentro depois de sair do ar.
FUNCAO_DA_ESTACAO = acesso_publicacao.BASE_PADRAO


RECUSA_PGRST204 = json.dumps({
    "code": "PGRST204",
    "message": "Could not find the 'versao' column of 'print_agents' in the schema cache",
})


def test_reconhece_a_recusa_por_coluna_que_nao_existe():
    assert agent_worker._e_coluna_ausente(400, RECUSA_PGRST204)
    assert agent_worker._e_coluna_ausente(
        400, "Could not find the 'painel_versao' column of 'print_agents' in the schema cache")


def test_nao_confunde_outro_erro_com_coluna_ausente():
    """Qualquer outro 400 é defeito nosso e tem de continuar aparecendo no log.

    Tratar tudo como coluna ausente transformaria um erro de verdade numa
    tentativa silenciosa a menos — e o heartbeat pararia sem dizer por quê.
    """
    assert not agent_worker._e_coluna_ausente(400, '{"message":"invalid input syntax"}')
    assert not agent_worker._e_coluna_ausente(401, RECUSA_PGRST204)
    assert not agent_worker._e_coluna_ausente(500, "internal")
    assert not agent_worker._e_coluna_ausente(0, "")


class _Espiao:
    """Finge ser o `urlopen`, guardando o que cada tentativa mandou."""

    def __init__(self, recusar_colunas):
        self.recusar_colunas = recusar_colunas
        self.envios = []

    def __call__(self, req, timeout=None):
        corpo = json.loads(req.data.decode("utf-8"))
        self.envios.append(corpo)
        if self.recusar_colunas and "versao" in corpo:
            raise urllib.error.HTTPError(
                "http://x", 400, "Bad Request", {},
                _Corpo(RECUSA_PGRST204))
        return _Corpo("")


class _Corpo:
    def __init__(self, texto):
        self.texto = texto

    def read(self):
        return self.texto.encode("utf-8")

    # O `HTTPError` embrulha o `fp` num fechador de arquivo temporario, que
    # chama `close()` na hora de ser coletado. Sem este metodo o teste passa e
    # deixa um aviso de excecao ignorada atras de si.
    def close(self):
        pass

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


def _rodar(monkeypatch, recusar_colunas):
    espiao = _Espiao(recusar_colunas)
    monkeypatch.setattr(agent_worker.urllib.request, "urlopen", espiao)
    monkeypatch.setattr(agent_worker, "_COLUNAS_DE_VERSAO", True)
    monkeypatch.setattr(agent_worker, "_QUANDO_RETENTAR_COLUNAS", 0.0)
    monkeypatch.setattr(agent_worker.db, "SUPABASE_URL", "https://exemplo.supabase.co")
    monkeypatch.setattr(agent_worker.db, "SUPABASE_KEY", "chave")
    return espiao


PAYLOAD = {"id": "a", "name": "PC", "status": "online", "last_seen": "agora",
           "printers_json": {"version": "1.2.93"}}
COLUNAS = {"versao": "1.2.93", "painel_versao": "596"}


def test_com_a_coluna_no_banco_a_versao_vai_na_coluna(monkeypatch):
    espiao = _rodar(monkeypatch, recusar_colunas=False)
    agent_worker._gravar_heartbeat(dict(PAYLOAD), dict(COLUNAS), "agora")

    assert len(espiao.envios) == 1, "não devia ter havido segunda tentativa"
    assert espiao.envios[0]["versao"] == "1.2.93"
    assert espiao.envios[0]["painel_versao"] == "596"
    assert agent_worker._COLUNAS_DE_VERSAO is True


def test_sem_a_coluna_o_heartbeat_ainda_acontece(monkeypatch):
    """O que não pode acontecer: a estação sumir do painel."""
    espiao = _rodar(monkeypatch, recusar_colunas=True)
    agent_worker._gravar_heartbeat(dict(PAYLOAD), dict(COLUNAS), "agora")

    assert len(espiao.envios) == 2, "devia ter repetido sem as colunas"
    segunda = espiao.envios[1]
    assert "versao" not in segunda and "painel_versao" not in segunda
    # O que importa de verdade: o sinal de vida e a versão pelo JSON.
    assert segunda["last_seen"] == "agora"
    assert segunda["printers_json"]["version"] == "1.2.93"


def test_depois_da_primeira_recusa_nem_tenta_de_novo(monkeypatch):
    """Uma tentativa perdida por ciclo, a cada 30 segundos, em onze estações,
    seria desperdício permanente — e a resposta nunca mudaria dentro daquele
    processo."""
    espiao = _rodar(monkeypatch, recusar_colunas=True)
    agent_worker._gravar_heartbeat(dict(PAYLOAD), dict(COLUNAS), "agora")
    assert agent_worker._COLUNAS_DE_VERSAO is False

    espiao.envios.clear()
    agent_worker._gravar_heartbeat(dict(PAYLOAD), dict(COLUNAS), "depois")
    assert len(espiao.envios) == 1
    assert "versao" not in espiao.envios[0]


def test_uma_hora_depois_ele_tenta_de_novo(monkeypatch):
    """O caso que aconteceu em 16/08/2026, uma hora depois do ALTER TABLE.

    O SQL é colado por uma pessoa, no editor do Supabase, com os onze agentes
    JÁ no ar — esse é o caso normal, não a exceção. Todos já desistiram das
    colunas quando elas nascem. Sem esta volta, a coluna ficaria vazia até cada
    estação reiniciar, o que pode levar dias.
    """
    espiao = _rodar(monkeypatch, recusar_colunas=True)
    agent_worker._gravar_heartbeat(dict(PAYLOAD), dict(COLUNAS), "agora")
    assert agent_worker._COLUNAS_DE_VERSAO is False

    # O ALTER TABLE rodou: o banco para de recusar.
    espiao.recusar_colunas = False
    espiao.envios.clear()

    # Antes da hora, nem tenta — não adianta bater no banco a cada 30 segundos.
    agent_worker._gravar_heartbeat(dict(PAYLOAD), dict(COLUNAS), "logo depois")
    assert "versao" not in espiao.envios[0]

    # Passada a hora, tenta — e como agora funciona, volta a preencher sozinho.
    monkeypatch.setattr(agent_worker, "_QUANDO_RETENTAR_COLUNAS", 0.0)
    espiao.envios.clear()
    agent_worker._gravar_heartbeat(dict(PAYLOAD), dict(COLUNAS), "uma hora depois")
    assert espiao.envios[0]["versao"] == "1.2.93"
    assert agent_worker._COLUNAS_DE_VERSAO is True, "devia ter voltado a confiar nas colunas"


def test_a_retentativa_que_falha_de_novo_nao_perde_o_heartbeat(monkeypatch):
    """A hora passou, o ALTER ainda não rodou: a tentativa cai, e o sinal de
    vida tem de sair mesmo assim."""
    espiao = _rodar(monkeypatch, recusar_colunas=True)
    agent_worker._gravar_heartbeat(dict(PAYLOAD), dict(COLUNAS), "agora")

    monkeypatch.setattr(agent_worker, "_QUANDO_RETENTAR_COLUNAS", 0.0)
    espiao.envios.clear()
    agent_worker._gravar_heartbeat(dict(PAYLOAD), dict(COLUNAS), "uma hora depois")

    assert len(espiao.envios) == 2, "devia ter tentado e repetido sem as colunas"
    assert "versao" in espiao.envios[0], "a primeira era a retentativa"
    assert "versao" not in espiao.envios[1], "a segunda tinha de ir sem as colunas"
    # O que importa: o sinal de vida saiu. Sem ele a estacao some do painel.
    assert espiao.envios[1]["printers_json"]["version"] == "1.2.93"
    assert agent_worker._COLUNAS_DE_VERSAO is False


def test_a_versao_de_agora_tambem_vai_pelo_json():
    """O modal 'Qual é esta estação?' do painel lê `printers_json.version`.

    Ele roda na tela do operador, que pode estar desatualizada. Tirar o campo do
    JSON ao criar a coluna trocaria um incômodo de quem publica por um incômodo
    de quem imprime.
    """
    fonte = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                              "agent_worker.py"), encoding="utf-8").read()
    trecho = fonte[fonte.index("printers_json = {"):fonte.index("# Formato UTC")]
    assert '"version": AGENT_VERSION' in trecho
    assert '"painel": painel' in trecho
    # Para onde a estação publica a faixa: é a conta da Fase 3, e a versão
    # sozinha não a responde — uma estação pode migrar por variável de ambiente.
    assert '"acesso_base": _acesso_base()' in trecho


# ─── A leitura, do lado de quem confere ───────────────────────────────────────


def test_versao_comparada_como_numero_e_nao_como_texto():
    """Como texto, "1.2.9" seria maior que "1.2.92" — e a conferência
    declararia em dia uma estação atrasada."""
    assert estacoes.como_numero("1.2.9") < estacoes.como_numero("1.2.92")
    assert estacoes.como_numero("1.10.0") > estacoes.como_numero("1.9.99")
    assert estacoes.como_numero("nao-e-versao") == ()


def test_le_a_versao_da_coluna_quando_ela_existe():
    versao, painel, base = estacoes._versoes({
        "versao": "1.2.93", "painel_versao": "596",
        "printers_json": {"version": "1.2.10", "painel": {"versao": "500"}},
    })
    assert (versao, painel) == ("1.2.93", "596")


def test_cai_no_json_enquanto_a_coluna_nao_existe():
    """As duas metades da janela: banco sem coluna, ou agente que não a preenche."""
    versao, painel, base = estacoes._versoes({
        "printers_json": {
            "version": "1.2.67", "painel": {"versao": "568"},
            "acesso_base": FUNCAO_DA_ESTACAO},
    })
    assert (versao, painel) == ("1.2.67", "568")
    assert base == FUNCAO_DA_ESTACAO


def test_estacao_que_nao_reporta_nada_nao_vira_versao_inventada():
    """Duas estações vistas em 16/08/2026 estão exatamente neste caso: vivas,
    sem versão nenhuma. A resposta certa é vazio, para a conferência poder dizer
    'não informa' em vez de mentir um número."""
    versao, painel, base = estacoes._versoes({"printers_json": {}})
    assert (versao, painel, base) == ("", "", "")
    versao, _, _ = estacoes._versoes({"printers_json": None})
    assert versao == ""


def test_printers_json_como_texto_ainda_e_lido():
    """O PostgREST devolve JSONB como objeto, mas nem toda linha antiga foi
    gravada assim."""
    versao, _, _ = estacoes._versoes({"printers_json": json.dumps({"version": "1.2.7"})})
    assert versao == "1.2.7"
