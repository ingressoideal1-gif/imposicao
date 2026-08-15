# -*- coding: utf-8 -*-
"""O que a tela PINTA, que e a parte desta camada que falha em silencio.

As regras ja sao testadas em tests/test_portaria_validacao.py. O que nada mais
cobre e a traducao do veredito em cor e frase -- e a spec diz que confundir
`setor_nao_autorizado` (ingresso bom, porta errada) com `desconhecido` (ingresso
estranho ao evento) faz o porteiro devolver ingresso legitimo achando que e
falso. Sao cores diferentes de proposito, e e isto que garante que continuem.
"""

import json
import os
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "portaria_tela_harness.js")

PISTA = "11111111-1111-1111-1111-111111111111"
VIP = "22222222-2222-2222-2222-222222222222"
SAL = "aa" * 32


def hash_de(texto):
    import qr_ideal
    return qr_ideal.hash_codigo(texto, SAL)


def carga(**mudancas):
    base = {
        "evento": {"id": "e1", "nome": "Festa", "sal": SAL},
        "aparelho": {"id": "d1", "nome": "Portao A", "setores": [PISTA]},
        "sais": {},
        "setores": [
            {"id": PISTA, "nome": "PISTA", "quantidade": 600,
             "tipo_uso": "unico", "abre_em": None, "fecha_em": None},
            {"id": VIP, "nome": "VIP", "quantidade": 500,
             "tipo_uso": "unico", "abre_em": None, "fecha_em": None},
        ],
        "bloqueios": [],
        "credenciais": [
            {"h": hash_de("000001"), "s": PISTA, "n": 1, "id": "c-p1"},
            {"h": hash_de("000009"), "s": VIP, "n": 9, "id": "c-v9"},
        ],
    }
    base.update(mudancas)
    return base


def pintar(texto, c=None, escolhido=None):
    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300, capture_output=True, text=True,
        input=json.dumps({"texto": texto, "carga": c or carga(),
                          "setorEscolhido": escolhido}),
    )
    if r.returncode != 0:
        pytest.fail(f"o harness falhou:\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout)


def test_permitido_pinta_verde_e_diz_o_setor_e_o_numero():
    r = pintar("000001")
    assert "ok" in r["classe"]
    assert r["titulo"] == "PODE ENTRAR"
    assert r["detalhe"] == "PISTA"


def test_porta_errada_pinta_LARANJA_e_nao_vermelho():
    """O erro mais caro da tela. Ingresso bom na porta errada nao pode ter a
    mesma cara de ingresso estranho ao evento."""
    r = pintar("000009")
    assert "porta" in r["classe"], f"pintou {r['classe']!r} em vez de laranja"
    assert "recusa" not in r["classe"]
    assert "VIP" in r["detalhe"] and "PISTA" in r["detalhe"]


def test_desconhecido_pinta_vermelho():
    r = pintar("999999")
    assert "recusa" in r["classe"]
    assert "porta" not in r["classe"]


def test_setor_ausente_da_carga_pinta_recusa_em_vez_de_travar():
    """Achado em revisao de codigo, 15/08/2026. A regra 2 (setor_nao_autorizado)
    devolve `setor: setorPorId(carga, alheio.s)`, que e null quando o setor do
    ingresso alheio nao esta em `carga.setores` -- acontece quando um setor
    vira `status != 'ativo'` no servidor mas a credencial ainda aponta para
    ele. `pintar()` acessava `v.setor.nome` direto: TypeError, e a tela nao
    muda -- nem verde, nem vermelho, indistinguivel de celular travado. O
    porteiro le o QR e nada acontece."""
    c = carga()
    c["setores"] = [s for s in c["setores"] if s["id"] != VIP]  # setor sumiu da carga
    r = pintar("000009", c)  # ingresso do VIP; o aparelho so autoriza PISTA
    assert r["telaResposta"] is True
    assert "recusa" in r["classe"] or "porta" in r["classe"]


def test_o_motivo_do_bloqueio_aparece_no_campo_de_corpo_grande():
    """E o que o porteiro le em voz alta -- nao pode virar legenda."""
    c = carga(bloqueios=[{"setor_id": PISTA, "de": 1, "ate": 50,
                          "motivo": "lote extraviado na entrega"}])
    r = pintar("000001", c)
    assert r["motivo"] == "lote extraviado na entrega"


def test_ambiguidade_abre_a_tela_de_escolha_e_NAO_registra_leitura():
    """Perguntar nao e decidir: enquanto o porteiro nao tocar num setor, nada
    pode ir para a fila -- senao a lotacao contaria uma entrada que nao houve."""
    c = carga()
    c["aparelho"]["setores"] = [PISTA, VIP]
    c["credenciais"] = [
        {"h": hash_de("000001"), "s": PISTA, "n": 1, "id": "c-p1"},
        {"h": hash_de("000001"), "s": VIP, "n": 1, "id": "c-v1"},
    ]
    r = pintar("000001", c)
    assert r["telaAmbiguo"] is True
    assert r["telaResposta"] is False
    assert r["fila"] == 0


def test_toda_leitura_decidida_entra_na_fila_inclusive_a_negada():
    """E a leitura negada que responde 'por que a fila parou as 22h'."""
    assert pintar("000001")["fila"] == 1
    assert pintar("999999")["fila"] == 1


# ── A fila so sai depois que o servidor confirmou ────────────────────────────
#
# Nenhum dos testes acima toca isto: eles desligam `navigator.onLine` de
# proposito (nenhuma rede deve sair enquanto so estamos testando pintura), e
# por isso `sincronizar()` sai no primeiro guard sem executar o corpo -- onde
# mora a regra "so remove da fila depois que o POST /leituras confirmou".
# Achado em revisao de codigo, 15/08/2026: sem este teste, inverter a ordem
# (remover da fila antes do fetch) passaria pela suite inteira sem aviso.

def _conferir(texto, c=None):
    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300, capture_output=True, text=True,
        input=json.dumps({"modo": "conferir", "texto": texto, "carga": c or carga()}),
    )
    if r.returncode != 0:
        pytest.fail(f"o harness falhou:\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout)


def test_digitar_o_numero_desliga_a_camera_antes_de_validar():
    """Achado em revisao de codigo, 15/08/2026. `achou()` (camera) ja desliga
    antes de validar; `btn-conferir` ('Digitar o numero') tinha ficado de
    fora. Sem isto, a camera continua lendo QR enquanto o porteiro digita um
    numero -- e meio segundo depois ela pode pegar outro ingresso e pintar a
    tela com a resposta ERRADA por cima da certa, sem que nada avise qual
    ingresso a tela esta respondendo."""
    assert _conferir("000001")["desligarChamado"] is True


def _atualizar(mock, c=None):
    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300, capture_output=True, text=True,
        input=json.dumps({"modo": "atualizar", "carga": c or carga(), "mock": mock}),
    )
    if r.returncode != 0:
        pytest.fail(f"o harness falhou:\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout)


def test_atualizar_o_evento_troca_a_carga_sem_tocar_fila_ou_entradas():
    """Achado em revisao de codigo, 15/08/2026 (I5). Antes desta correcao nao
    havia como refazer a carga depois de parear: um bloqueio criado as 21h
    pelo dono nunca chegava ao aparelho que pareou as 20h. O botao 'Atualizar
    o evento' chama `baixarCarga()`, que SUBSTITUI a carga -- mas fila e
    entradas sao do porteiro, nao do evento, e uma atualizacao nao pode
    mexer nelas."""
    nova = carga()
    nova["evento"]["nome"] = "Festa Atualizada"
    nova["proxima"] = None
    r = _atualizar({"method": "GET", "pathname": "/api/acesso/portaria/faixa",
                    "status": 200, "body": nova})
    assert r["filaAntes"] == 2
    assert r["filaDepois"] == 2, "atualizar o evento apagou leituras da fila"
    assert r["entradasAntes"] == r["entradasDepois"], "atualizar o evento apagou entradas"
    assert r["nomeEventoDepois"] == "Festa Atualizada", "a carga nova nao chegou a gravar"


def _sincronizar(mock):
    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300, capture_output=True, text=True,
        input=json.dumps({"modo": "sincronizar", "carga": carga(), "mock": mock}),
    )
    if r.returncode != 0:
        pytest.fail(f"o harness falhou:\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout)


def test_sincronizar_remove_da_fila_so_depois_da_confirmacao_do_servidor():
    r = _sincronizar({"method": "POST", "pathname": "/api/acesso/portaria/leituras",
                      "status": 200, "body": {"gravadas": 2}})
    assert r["filaAntes"] == 2
    assert r["filaDepois"] == 0


def test_sincronizar_mantem_na_fila_se_o_servidor_nao_confirmar():
    """O teste que fica vermelho se alguem inverter a ordem: remover da fila
    ANTES do fetch faria a leitura sumir mesmo quando o servidor nunca
    recebeu -- e a lotacao contaria uma entrada que nunca chegou."""
    r = _sincronizar({"method": "POST", "pathname": "/api/acesso/portaria/leituras",
                      "abort": True})
    assert r["filaAntes"] == 2
    assert r["filaDepois"] == 2


def test_401_na_sincronizacao_preserva_a_fila_em_vez_de_apagar():
    """Achado em revisao de codigo, 15/08/2026. O 401 na sincronizacao chamava
    `desparear()`, que apaga carga, fila E entradas -- contra a spec escrita:
    'perder uma leitura e perder a contagem que o cliente pagou para ter.' O
    dono pode revogar o aparelho ERRADO (Portao B fica horas sem sinal e
    acumula leituras; o dono revoga o aparelho errado na tela dele) e o 401
    que vem depois nao pode comer o que o Portao B ainda nao mandou."""
    r = _sincronizar({"method": "POST", "pathname": "/api/acesso/portaria/leituras",
                      "status": 401, "body": {"detail": "aparelho nao pareado ou revogado"}})
    assert r["filaAntes"] == 2
    assert r["filaDepois"] == 2, "o 401 apagou leituras que o servidor nunca confirmou"
    assert r["entradasAntes"] == r["entradasDepois"], "o 401 apagou a marca de quem ja entrou"
    assert r["tokenDepois"] is None, "o token revogado tem de ser esquecido"
    assert r["telaPareandoVisivel"] is True
    assert r["mensagem"], "o porteiro tem de saber por que voltou para o pareamento"
