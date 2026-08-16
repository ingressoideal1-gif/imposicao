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


def _ler(caminho):
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()

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
    r = _atualizar({"method": "GET", "pathname": "/functions/v1/portaria/faixa",
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
    r = _sincronizar({"method": "POST", "pathname": "/functions/v1/portaria/leituras",
                      "status": 200, "body": {"gravadas": 2}})
    assert r["filaAntes"] == 2
    assert r["filaDepois"] == 0


def test_sincronizar_mantem_na_fila_se_o_servidor_nao_confirmar():
    """O teste que fica vermelho se alguem inverter a ordem: remover da fila
    ANTES do fetch faria a leitura sumir mesmo quando o servidor nunca
    recebeu -- e a lotacao contaria uma entrada que nunca chegou."""
    r = _sincronizar({"method": "POST", "pathname": "/functions/v1/portaria/leituras",
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
    r = _sincronizar({"method": "POST", "pathname": "/functions/v1/portaria/leituras",
                      "status": 401, "body": {"detail": "aparelho nao pareado ou revogado"}})
    assert r["filaAntes"] == 2
    assert r["filaDepois"] == 2, "o 401 apagou leituras que o servidor nunca confirmou"
    assert r["entradasAntes"] == r["entradasDepois"], "o 401 apagou a marca de quem ja entrou"
    assert r["tokenDepois"] is None, "o token revogado tem de ser esquecido"
    assert r["telaAvisoVisivel"] is True
    assert r["mensagem"], "o porteiro tem de saber por que o aparelho parou de ler"


# ── O codigo de seis caracteres saiu da tela ─────────────────────────────────
#
# Decisao do usuario, 16/08/2026: retirar TODAS as opcoes de codigo. Quem poe um
# portao no ar e o dono, com a conta dele, tocando na barra do evento na casa do
# aplicativo -- e nao alguem digitando seis caracteres anotados num papel.


def test_a_tela_de_digitar_codigo_saiu():
    """Decisao do usuario: retirar todas as opcoes de codigo.

    O caminho novo e o dono entrar com a conta dele NAQUELE celular e tocar na
    barra do evento. Nao ha mais codigo para anotar nem para digitar.
    """
    texto = _ler("frontend/portaria.html")
    assert "tela-pareando" not in texto


def test_o_botao_de_configurar_leva_a_lista_e_nao_ao_login():
    texto = _ler("frontend/portaria.js")
    assert "controle.html?configurar=1" not in texto


def test_a_trava_da_fila_continua_valendo_ao_sair_do_portao():
    """Ela protege a contagem que o cliente pagou para ter. Sair sem ela faz o
    que ficou para tras nunca subir."""
    assert "ainda não subiram" in _ler("frontend/portaria.js")


# ── A trava: sair do portao passa pela senha ─────────────────────────────────
#
# Decisao do usuario, 16/08/2026: o aparelho "nao deixa editar mais, somente
# com a senha". A tela da portaria nao tem senha nenhuma -- o que ela tem e a
# SAIDA para a tela que pede. Estes testes recarregam a pagina de proposito: o
# que se prova mora no arranque, e semear a tela na mao pularia a decisao.

FILA_DE_TESTE = [
    {"id_local": "negada-1", "momento": "2026-08-20T21:00:00Z", "credencial_id": None,
     "setor_id": None, "resultado": "negado", "motivo": "desconhecido"},
    {"id_local": "entrada-1", "momento": "2026-08-20T21:01:00Z",
     "credencial_id": "c-p1", "setor_id": PISTA, "resultado": "permitido", "motivo": None},
]


def _harness(caso):
    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300, capture_output=True, text=True,
        input=json.dumps(caso),
    )
    if r.returncode != 0:
        pytest.fail(f"o harness falhou:\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout)


def _configurar(**caso):
    base = {"modo": "configurar", "carga": carga(), "token": "token-de-teste",
            "fila": [], "online": False}
    base.update(caso)
    return _harness(base)


def test_configurar_este_aparelho_leva_a_lista_de_eventos():
    """A saida do portao. Sem ela o celular fica preso: com token guardado, a
    casa do aplicativo devolve este aparelho para a leitura, e da leitura nao
    havia como voltar.

    O destino e a lista, sem `?configurar=1`: a senha agora e pedida pela
    engrenagem de cada evento, e nao por uma tela de login separada.
    """
    r = _configurar()
    assert r["botaoVisivel"] is True, "o botao nao aparece na tela de leitura"
    assert r["saiu"] is True
    assert r["url"] == "/controle.html"


def test_configurar_recusa_enquanto_ha_leitura_por_subir():
    """Configurar cunha um token NOVO para este celular, e leitura enfileirada
    sob o token velho nao sobe mais depois -- some a contagem que o cliente
    pagou para ter. Sem sinal, a saida espera."""
    r = _configurar(fila=FILA_DE_TESTE, online=False)
    assert r["saiu"] is False, "saiu do portao com leitura ainda na fila"
    assert r["mensagem"], "recusou sem dizer por que"
    assert r["filaDepois"] == 2, "a recusa apagou a fila que estava protegendo"


def test_configurar_manda_a_fila_antes_de_sair():
    """Com sinal, a fila sobe e o caminho segue -- a espera acima nao pode
    virar uma porta que nunca abre."""
    r = _configurar(fila=FILA_DE_TESTE, online=True,
                    mock={"method": "POST", "pathname": "/functions/v1/portaria/leituras",
                          "status": 200, "body": {"gravadas": 2}})
    assert r["saiu"] is True
    assert r["filaDepois"] == 0


def test_aparelho_sem_token_vai_sozinho_para_a_lista_e_NAO_perde_a_fila():
    """Sem token este celular nao e portao de nada, e nao ha mais tela de
    codigo onde ele possa esperar: o arranque o manda para a casa do
    aplicativo, onde o dono toca na barra do evento.

    A fila fica. Revogado o aparelho, `aparelhoRevogado()` esquece o token e
    GUARDA as leituras -- elas ja nao tem como subir daqui, e apaga-las nao as
    salvaria. O que as salva e o celular voltar a ser portao do MESMO evento, e
    o arranque respeita isso."""
    r = _configurar(token=None, fila=FILA_DE_TESTE, online=False)
    assert r["saiu"] is True, "o celular sem token ficou preso na portaria"
    assert r["url"] == "/controle.html"
    assert r["filaDepois"] == 2, "a saida apagou a fila do aparelho revogado"


# ── A carga do aparelho ANTERIOR nao pode ler ingresso ───────────────────────


def _reconfigurado(nova, fila=None):
    return _harness({
        "modo": "reconfigurado", "carga": carga(), "token": "token-novo",
        "reconfigurado": True, "fila": fila or FILA_DE_TESTE, "online": True,
        "mock": {"method": "GET", "pathname": "/functions/v1/portaria/faixa",
                 "status": 200, "body": nova},
    })


def _outro_aparelho(evento_id="e1"):
    c = carga()
    c["evento"] = {"id": evento_id, "nome": "Festa", "sal": SAL}
    c["aparelho"] = {"id": "d2", "nome": "Portao B", "setores": [VIP]}
    c["proxima"] = None
    return c


def test_reconfigurar_troca_o_nome_e_os_setores_antes_da_primeira_leitura():
    """A carga guarda o nome do portao e os setores que ele valida. Reusada
    depois de reconfigurar, o topo mostraria "Portao A" e a validacao recusaria
    ingresso do VIP como "OUTRA PORTA" -- ingresso bom devolvido na porta, sem
    nada na tela que explique."""
    r = _reconfigurado(_outro_aparelho())
    assert r["lendo"] is True
    assert r["aparelhoDepois"] == "Portao B", "a carga continua sendo a do aparelho anterior"
    assert r["topo"] == "Portao B"
    assert "VIP" in r["setoresNoTopo"]
    assert r["marcaDepois"] is None, "a marca ficou para tras e a carga se refaria toda abertura"


def test_reconfigurar_no_mesmo_evento_preserva_a_fila():
    """A fila e do porteiro, nao da configuracao: ela sobe com o token novo."""
    r = _reconfigurado(_outro_aparelho())
    assert r["filaDepois"] == 2
    assert r["entradasDepois"] == 1


def test_trocar_de_evento_esquece_a_fila_do_evento_anterior():
    """O servidor grava a fila com o evento do token ATUAL. Leitura que sobrou
    do evento anterior viraria entrada de um evento contada em outro -- e ela
    ja nao tinha como subir, porque o token que a criou se foi."""
    r = _reconfigurado(_outro_aparelho(evento_id="e2"))
    assert r["filaDepois"] == 0, "a fila do evento anterior foi para o evento novo"


def test_sem_a_carga_nova_o_aparelho_NAO_le_com_a_antiga():
    """O caso que faz a marca ser apagada so no fim. Se a carga nova nao chega,
    o aparelho tem de esperar -- ler com a do aparelho anterior e pior que nao
    ler."""
    r = _harness({
        "modo": "reconfigurado", "carga": carga(), "token": "token-novo",
        "reconfigurado": True, "fila": [], "online": True,
        "mock": {"method": "GET", "pathname": "/functions/v1/portaria/faixa",
                 "abort": True},
    })
    assert r["lendo"] is False, "abriu a leitura com a carga do aparelho anterior"
    assert r["marcaDepois"] == "1", "a marca sumiu; a proxima abertura leria com a carga velha"
    assert r["aparelhoDepois"] == "Portao A", "apagou a carga que ainda era a unica que havia"
