# -*- coding: utf-8 -*-
"""O sincronismo de cinco minutos do portao.

Duas responsabilidades, e as duas erram em silencio se estiverem erradas:

`aplicar(carga, novidade)` MESCLA. A rota leve manda so o que muda -- o evento
continua ativo? que setores o dono bloqueou? quem entrou por outro portao? --
e nunca manda a lista de ingressos, que e a parte pesada. Uma funcao que
SUBSTITUI em vez de mesclar apagaria as credenciais do celular, e o portao
passaria a recusar todo mundo como "desconhecido", cinco minutos depois de
comecar a noite. Ninguem veria o defeito num teste de tela: a carga chega certa
e some depois.

`ligar(pedir, aoAplicar)` e o relogio. Ele recebe a ida ao servidor por
injecao, e por isso o teste roda em milissegundos em vez de cinco minutos.

Roda o arquivo de verdade dentro de um navegador, pelo mesmo motivo do
tests/test_portaria_validacao.py: e la que ele vai rodar.
"""

import json
import os
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "sincronismo_harness.js")

PISTA = "11111111-1111-1111-1111-111111111111"
VIP = "22222222-2222-2222-2222-222222222222"


def _rodar(caso):
    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300, capture_output=True, text=True,
        input=json.dumps(caso),
    )
    if r.returncode != 0:
        pytest.fail(f"o harness falhou:\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout)


def chamar(nome, *argumentos):
    """Devolve {resultado, argumentos} -- os argumentos voltam para os testes
    de pureza poderem conferir que a carga original ficou intacta."""
    return _rodar({"chamada": nome, "argumentos": list(argumentos)})


def chamar_valor(nome):
    return _rodar({"valor": nome})


def relogio(**cenario):
    return _rodar({"relogio": cenario})


def aplicar(c, novidade):
    return chamar("aplicar", c, novidade)["resultado"]


def carga(**mudancas):
    """A mesma forma do tests/test_portaria_validacao.py -- e a carga de
    verdade que o aparelho guarda."""
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


# ── aplicar: o que a rota leve muda ─────────────────────────────────────────

def test_aplicar_troca_o_estado_do_evento():
    nova = aplicar(carga(), {"evento": {"ativo": False}})
    assert nova["evento"]["ativo"] is False


def test_aplicar_NAO_perde_o_sal_do_evento():
    """A rota leve manda `{ativo}` e mais nada. Trocar o objeto `evento` inteiro
    levaria embora o sal -- e sem o sal o aparelho nao consegue calcular hash
    nenhum, ou seja, nao consegue reconhecer um ingresso sequer."""
    nova = aplicar(carga(), {"evento": {"ativo": True}})
    assert nova["evento"]["sal"] == "aa" * 32
    assert nova["evento"]["nome"] == "Festa"


def test_aplicar_bloqueia_o_setor_sem_perder_o_resto_dele():
    """A rota leve manda so o que muda. Se `aplicar` substituir o setor
    inteiro, some a quantidade contratada -- e o contador quebra."""
    nova = aplicar(carga(), {"setores": [{"id": PISTA, "bloqueado": True,
                                          "bloqueado_motivo": "Interditado"}]})
    setor = [s for s in nova["setores"] if s["id"] == PISTA][0]
    assert setor["bloqueado"] is True
    assert setor["quantidade"] == 600


def test_setor_que_a_novidade_nao_cita_fica_como_estava():
    """Bloquear a PISTA nao pode mexer no VIP."""
    nova = aplicar(carga(), {"setores": [{"id": PISTA, "bloqueado": True}]})
    vip = [s for s in nova["setores"] if s["id"] == VIP][0]
    assert vip == carga()["setores"][1]


def test_setor_desconhecido_NAO_vira_setor_de_mentira():
    """A rota leve nao traz nome nem quantidade. Acrescentar um setor que so o
    servidor conhece poria na tela um setor sem nome, e no contador um
    denominador sem contratado. Setor novo chega na carga inteira, com as
    credenciais dele junto."""
    nova = aplicar(carga(), {"setores": [{"id": "setor-que-nasceu-agora",
                                          "bloqueado": False}]})
    assert len(nova["setores"]) == 2


def test_aplicar_NAO_apaga_credenciais():
    """A rota leve nao as manda. Substituir a carga pelo que veio esvaziaria o
    evento inteiro e o portao recusaria todo mundo como "desconhecido"."""
    nova = aplicar(carga(), {"evento": {"ativo": True}})
    assert len(nova["credenciais"]) == 2


def test_a_lista_de_faixas_bloqueadas_e_SUBSTITUIDA():
    """Ao contrario dos setores, a rota manda a lista inteira: e assim que uma
    faixa DESBLOQUEADA pelo dono some. Mesclar faixa a faixa deixaria o lote
    suspenso para sempre, e ingresso bom sendo devolvido na porta."""
    c = carga(bloqueios=[{"setor_id": PISTA, "de": 1, "ate": 50, "motivo": "sumiu"}])
    assert aplicar(c, {"bloqueios": []})["bloqueios"] == []


def test_aplicar_junta_as_entradas_de_outros_aparelhos():
    nova = aplicar(carga(), {"entradas": [{"credencial_id": "c-vip-9",
                                           "momento": "2026-08-20T22:10:00Z"}]})
    assert nova["entradas"]["c-vip-9"] == "2026-08-20T22:10:00Z"


def test_as_entradas_que_ja_estavam_no_aparelho_ficam():
    """Elas sao a regra `ja_entrou` deste portao. Trocar o mapa pelo do servidor
    perderia justamente as leituras que ainda nao subiram."""
    c = carga()
    c["entradas"] = {"c-pista-1": "2026-08-20T20:00:00Z"}
    nova = aplicar(c, {"entradas": [{"credencial_id": "c-vip-9",
                                     "momento": "2026-08-20T22:10:00Z"}]})
    assert nova["entradas"]["c-pista-1"] == "2026-08-20T20:00:00Z"
    assert nova["entradas"]["c-vip-9"] == "2026-08-20T22:10:00Z"


def test_entrada_local_mais_antiga_vence_a_do_servidor():
    """Quem entrou primeiro entrou primeiro. O relogio do servidor nao pode
    reescrever um horario que este aparelho registrou antes."""
    c = carga()
    c["entradas"] = {"c-vip-9": "2026-08-20T21:00:00Z"}
    nova = aplicar(c, {"entradas": [{"credencial_id": "c-vip-9",
                                     "momento": "2026-08-20T22:10:00Z"}]})
    assert nova["entradas"]["c-vip-9"] == "2026-08-20T21:00:00Z"


def test_entrada_do_servidor_mais_antiga_CORRIGE_a_local():
    """O outro lado da mesma regra: a pessoa entrou primeiro no outro portao.
    E a hora que o porteiro le quando recusa, entao tem de ser a certa."""
    c = carga()
    c["entradas"] = {"c-vip-9": "2026-08-20T22:10:00Z"}
    nova = aplicar(c, {"entradas": [{"credencial_id": "c-vip-9",
                                     "momento": "2026-08-20T21:00:00Z"}]})
    assert nova["entradas"]["c-vip-9"] == "2026-08-20T21:00:00Z"


def test_os_totais_por_setor_alimentam_o_contador():
    """O contador conta o que os outros portoes leram, e nao so este aparelho."""
    nova = aplicar(carga(), {"totais": {PISTA: 123}})
    assert nova["totais"][PISTA] == 123


def test_total_de_um_setor_nao_zera_o_do_outro():
    c = carga()
    c["totais"] = {PISTA: 10, VIP: 20}
    nova = aplicar(c, {"totais": {PISTA: 11}})
    assert nova["totais"] == {PISTA: 11, VIP: 20}


def test_novidade_vazia_nao_muda_nada():
    assert aplicar(carga(), {}) == carga()


def test_aplicar_NAO_remexe_na_carga_que_recebeu():
    """Ela e a que esta guardada no IndexedDB do celular. Mexer nela no lugar
    deixaria o aparelho com um estado que ninguem gravou -- e que sobrevive ate
    a proxima carga inteira."""
    r = chamar("aplicar", carga(), {"evento": {"ativo": False},
                                    "setores": [{"id": PISTA, "bloqueado": True}]})
    assert r["argumentos"][0] == carga()


# ── ligar: o relogio ────────────────────────────────────────────────────────

def test_o_intervalo_e_de_cinco_minutos():
    assert chamar_valor("INTERVALO_MS") == 300000


def test_o_relogio_pede_no_intervalo_combinado():
    assert relogio(tiques=0)["intervalo"] == 300000


def test_o_que_o_servidor_manda_chega_em_aoAplicar():
    r = relogio(tiques=1, respostas=[{"novidade": {"evento": {"ativo": False}}}])
    assert r["aplicados"] == [{"evento": {"ativo": False}}]


def test_o_primeiro_pedido_vai_SEM_desde():
    """Aparelho recem-aberto nao sabe de que ponto continuar, e a rota responde
    as entradas todas quando nao recebe `desde`."""
    assert relogio(tiques=1)["pedidos"] == [None]


def test_o_segundo_pedido_continua_de_onde_o_SERVIDOR_parou():
    """O ponto de continuacao e o relogio do servidor, nunca o do celular: o
    aparelho do portao passa a noite ligado e pode estar minutos fora: adiantado
    ele pularia entradas de vez, atrasado ele repetiria as mesmas para sempre."""
    r = relogio(tiques=2, respostas=[{"novidade": {"momento": "2026-08-20T22:05:00Z"}}])
    assert r["pedidos"] == [None, "2026-08-20T22:05:00Z"]


def test_sincronizacao_que_falha_NAO_interrompe_nada():
    """O portao segue lendo com o que tem e tenta de novo em cinco minutos.
    Uma excecao solta aqui apareceria como tela travada no meio da fila."""
    r = relogio(tiques=1, respostas=[{"erro": "sem rede"}])
    assert r["lancou"] is None
    assert r["aplicados"] == []


def test_erro_lancado_na_hora_tambem_NAO_derruba_nada():
    """`fetch` explode sozinho quando o celular perde o 4G no meio do caminho."""
    r = relogio(tiques=1, respostas=[{"lanca": "TypeError: failed to fetch"}])
    assert r["lancou"] is None


def test_depois_de_falhar_ele_tenta_de_novo():
    """Se o modulo se desse por vencido, o portao ficaria com o evento de cinco
    minutos atras ate alguem fechar e abrir o aplicativo."""
    r = relogio(tiques=2, respostas=[{"erro": "sem rede"},
                                     {"novidade": {"evento": {"ativo": False}}}])
    assert len(r["pedidos"]) == 2
    assert r["aplicados"] == [{"evento": {"ativo": False}}]


def test_falha_NAO_avanca_o_ponto_de_continuacao():
    """Se o `desde` andasse mesmo com a gravacao falhando, as entradas daquele
    intervalo nunca mais desceriam -- e a mesma pessoa entraria duas vezes,
    calada, por dois portoes."""
    r = relogio(tiques=2, aplicarLanca=True,
                respostas=[{"novidade": {"momento": "2026-08-20T22:05:00Z"}}, {}])
    assert r["pedidos"] == [None, None]


def test_desligar_para_o_relogio():
    """A tela de leitura sai do ar quando o porteiro volta para a lista. Um
    relogio esquecido continuaria pedindo rede e gravando por cima."""
    assert relogio(tiques=0, desligar=True)["cancelamentos"] >= 1
