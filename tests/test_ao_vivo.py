# -*- coding: utf-8 -*-
"""A tela do evento acontecendo: "Ao vivo" durante, "Relatório" depois.

Ela existe porque o dono ficava cego na hora do evento — configurava tudo
antes, recebia um número solto depois de finalizar, e nas quatro horas em que a
fila anda o aplicativo não lhe dizia nada.

O que estes testes protegem não é o desenho: é o que a tela AFIRMA. Um número
errado aqui não quebra nada visível — ele só faz o dono tomar uma decisão errada
na porta, e é o tipo de defeito que ninguém procura depois.
"""

import json
import os
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "ao_vivo_harness.js")

# O navegador sobe uma vez por caso, como nos outros arnês desta pasta, e por
# isso os casos ficam no mesmo processo do xdist.
pytestmark = pytest.mark.xdist_group("ao_vivo")


def _chamar(chamada, argumentos):
    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300, capture_output=True,
        encoding="utf-8",
        input=json.dumps({"chamada": chamada, "argumentos": argumentos}),
    )
    if r.returncode != 0:
        pytest.fail(f"o harness falhou:\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout)


def desenhar(dados):
    return _chamar("desenhar", [dados])


# ── Um evento de mesa, com o formato que o servidor devolve ─────────────────

def evento(**mudancas):
    base = {
        "evento": {
            "id": "e1", "nome_evento": "Festa da Uva",
            "data_evento": "2026-09-12", "local_evento": "Parque",
            "status": "ativo",
        },
        "publico": {
            "contratado": 150, "publicado": 150, "cortesias": 0,
            "entraram": 90, "sairam": 0, "presentes": 90,
            "recusadas": 0, "bloqueados": 0, "comparecimento_pct": 60.0,
        },
        "por_setor": [
            {"setor_id": "vip", "nome": "VIP", "contratado": 100,
             "entraram": 60, "ocupacao_pct": 60.0},
            {"setor_id": "cam", "nome": "Camarote", "contratado": 50,
             "entraram": 30, "ocupacao_pct": 60.0},
        ],
        "recusas": [],
        "por_hora": [
            {"hora": "2026-09-12T21:00", "entradas": 30, "saidas": 0, "recusas": 0},
            {"hora": "2026-09-12T22:00", "entradas": 60, "saidas": 0, "recusas": 0},
        ],
        "pico": "2026-09-12T22:00",
        "grafico_truncado": False,
        "leituras_lidas": 90,
        "aparelhos": [
            {"id": "a1", "nome": "Portão 1", "status": "ativo",
             "ultimo_visto": "2026-09-12T22:28:00Z"},
        ],
        "agora": "2026-09-12T22:30:00Z",
    }
    base.update(mudancas)
    return base


# ── O que a tela afirma ─────────────────────────────────────────────────────

def test_evento_ativo_se_chama_ao_vivo_e_avisa_que_se_atualiza_sozinha():
    """O que o sistema faz sozinho precisa se anunciar.

    Sem a linha, o dono fica recarregando na mão sem saber que não precisa — e
    a tela que se refaz debaixo do dedo dele vira um defeito aparente.
    """
    r = desenhar(evento())
    assert r["titulo"] == "Ao vivo"
    assert r["avisandoQueAtualiza"] is True
    assert r["nome"] == "Festa da Uva"


def test_evento_finalizado_se_chama_relatorio_e_fica_parado():
    d = evento()
    d["evento"] = dict(d["evento"], status="finalizado")
    r = desenhar(d)
    assert r["titulo"] == "Relatório"
    assert r["avisandoQueAtualiza"] is False
    assert "finalizado" in r["sub"]


def test_o_resumo_abre_com_quantos_entraram():
    """É a pergunta que o dono faz primeiro, e por isso é a primeira placa."""
    r = desenhar(evento())
    assert r["resumo"][0].startswith("90")
    assert "entraram" in r["resumo"][0]


def test_dentro_agora_so_aparece_onde_alguem_saiu():
    """Em setor de entrada única ninguém sai, e o número seria uma cópia de
    "entraram" ocupando espaço e sugerindo que alguém saiu."""
    sem_saida = desenhar(evento())
    assert not any("dentro agora" in p for p in sem_saida["resumo"])

    d = evento()
    d["publico"] = dict(d["publico"], sairam=12, presentes=78)
    com_saida = desenhar(d)
    assert any("dentro agora" in p for p in com_saida["resumo"])
    assert any(p.startswith("78") for p in com_saida["resumo"])


def test_sem_denominador_o_comparecimento_e_travessao_e_nao_zero():
    """Zero por cento diria "ninguém apareceu". A verdade é que ainda não há
    ingresso publicado — e as duas frases mandam o dono fazer coisas
    diferentes."""
    d = evento()
    d["publico"] = dict(d["publico"], publicado=0, comparecimento_pct=None)
    r = desenhar(d)
    assert any(p.startswith("—") and "compareceram" in p for p in r["resumo"])


def test_cada_setor_mostra_entraram_de_contratados():
    r = desenhar(evento())
    assert "VIP" in r["setores"][0]
    assert "60 de 100" in r["setores"][0]
    assert "Camarote" in r["setores"][1]
    assert "30 de 50" in r["setores"][1]


def test_a_barra_do_setor_e_proporcional_e_o_numero_esta_escrito():
    """A barra é resumo; o número é o dado. Quem não distingue o comprimento de
    duas barras parecidas — e quem usa leitor de tela — precisa do número."""
    r = desenhar(evento())
    assert r["larguras"] == ["60%", "60%"]


def test_a_hora_de_pico_e_a_unica_marcada():
    r = desenhar(evento())
    assert r["picos"] == 1
    assert "22h" in r["horas"][1]


def test_sem_recusa_nenhuma_a_secao_inteira_some():
    """Uma seção vazia chamada "Recusas" faz o dono procurar um problema que
    não existe."""
    assert desenhar(evento())["recusasEscondidas"] is True


def test_a_recusa_aparece_com_o_nome_que_a_pessoa_entende():
    d = evento()
    d["recusas"] = [{"motivo": "setor_bloqueado",
                     "rotulo": "Setor desligado pelo dono", "quantas": 3}]
    d["publico"] = dict(d["publico"], recusadas=3)
    r = desenhar(d)
    assert r["recusasEscondidas"] is False
    assert "Setor desligado pelo dono" in r["recusas"][0]
    assert any("recusas" in p for p in r["resumo"])


def test_o_ultimo_sinal_do_portao_e_contado_contra_o_relogio_do_SERVIDOR():
    """"Há 40 minutos" calculado com o relógio do celular mente sempre que ele
    estiver errado, e um portão que parece mudo por causa do relógio do dono é
    uma corrida até a porta à toa. Aqui o `agora` diz 22:30 e o sinal foi
    22:28 — dois minutos, seja qual for a hora da máquina que roda o teste."""
    r = desenhar(evento())
    assert "Portão 1" in r["aparelhos"][0]
    assert "há 2 min" in r["aparelhos"][0]


def test_portao_pausado_diz_pausado_em_vez_de_um_silencio_suspeito():
    """"Pausado" é decisão do dono e explica o silêncio sozinha. Sem a palavra,
    um portão pausado apareceria como um portão que parou de responder — e ele
    iria até a porta conferir."""
    d = evento()
    d["aparelhos"] = [{"id": "a1", "nome": "Portão 1", "status": "pausado",
                       "ultimo_visto": None}]
    r = desenhar(d)
    assert "pausado" in r["aparelhos"][0]


def test_grafico_cortado_avisa_que_foi_cortado():
    """Um corte que não avisa se lê como o evento inteiro — e o número que ele
    contradiz ("entraram") está logo acima, na mesma tela."""
    d = evento()
    d["grafico_truncado"] = True
    d["leituras_lidas"] = 20000
    cortado = desenhar(d)
    assert "20.000" in cortado["horasTexto"]
    assert "totais acima" in cortado["horasTexto"]
    # E, sem corte, a frase NÃO aparece: um aviso permanente vira decoração e
    # deixa de ser lido no dia em que importa.
    assert "20.000" not in desenhar(evento())["horasTexto"]


def test_o_corpo_da_tela_aparece_depois_de_desenhar():
    assert desenhar(evento())["corpoEscondido"] is False


# ── A planilha da noite ─────────────────────────────────────────────────────

def csv(leituras):
    return _chamar("csvDe", [leituras])["resultado"]


def test_a_planilha_usa_ponto_e_virgula_e_aspas():
    """`;` porque o Excel em português abre o ponto-e-vírgula em colunas sem
    perguntar nada, e é nele que este arquivo vai ser aberto. As aspas porque
    nome de setor é texto digitado por gente: cabe qualquer coisa dentro,
    inclusive um `;` que partiria a planilha em colunas que ninguém pediu."""
    saida = csv([{
        "momento": "2026-09-12T22:00:00Z", "recebido_em": "2026-09-12T22:01:00Z",
        "tipo": "entrada", "resultado": "negado", "motivo": "ja_entrou",
        "rotulo_motivo": "Ingresso já usado", "setor": "VIP; Camarote",
        "aparelho": "Portão 1", "numero": 42,
    }])
    linhas = saida.split("\r\n")
    assert linhas[0] == ("Hora no aparelho;Hora no servidor;Setor;Aparelho;"
                         "Numero;Tipo;Resultado;Motivo")
    assert '"VIP; Camarote"' in linhas[1]
    assert '"Ingresso já usado"' in linhas[1]
    assert '"42"' in linhas[1]


def test_a_planilha_traz_a_leitura_NEGADA_junto():
    """É ela que responde "por que a fila parou às 22h". Um relatório só de
    quem entrou esconderia exatamente a parte que precisa de explicação."""
    saida = csv([
        {"resultado": "permitido", "tipo": "entrada", "numero": 1},
        {"resultado": "negado", "tipo": "entrada", "numero": 2,
         "rotulo_motivo": "Código não existe neste evento"},
    ])
    assert saida.count("\r\n") == 2          # cabeçalho + duas linhas
    assert "negado" in saida


def test_a_planilha_escapa_a_aspa_dobrando_ela():
    saida = csv([{"setor": 'Camarote "A"', "numero": 1}])
    assert '"Camarote ""A"""' in saida


# ── O relógio ───────────────────────────────────────────────────────────────

def quanto(quando, agora):
    return _chamar("haQuantoTempo", [quando, agora])["resultado"]


def test_sem_sinal_nenhum_o_tempo_e_vazio_e_nao_uma_conta_absurda():
    """"há 56 anos" — o que a conta com data nula produziria — seria pior que
    silêncio."""
    assert quanto(None, "2026-09-12T22:30:00Z") == ""


def test_o_tempo_e_lido_em_minutos_horas_e_dias():
    agora = "2026-09-12T22:30:00Z"
    assert quanto("2026-09-12T22:29:40Z", agora) == "agora"
    assert quanto("2026-09-12T22:05:00Z", agora) == "há 25 min"
    assert quanto("2026-09-12T19:30:00Z", agora) == "há 3 h"
    assert quanto("2026-09-10T22:30:00Z", agora) == "há 2 d"
