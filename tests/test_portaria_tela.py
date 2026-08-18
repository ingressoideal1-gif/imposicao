# -*- coding: utf-8 -*-
"""O que a tela FAZ a cada leitura, que e a parte desta camada que falha em
silencio.

As regras ja sao testadas em tests/test_portaria_validacao.py. O que nada mais
cobre e a traducao do veredito em cor, frase, som e -- desde 16/08/2026 -- em
NAO INTERROMPER NINGUEM. A spec diz que confundir `setor_nao_autorizado`
(ingresso bom, porta errada) com `desconhecido` (ingresso estranho ao evento)
faz o porteiro devolver ingresso legitimo achando que e falso. Sao cores
diferentes de proposito, e e isto que garante que continuem.

A tela mudou de forma em 16/08/2026: o ingresso BOM deixou de ocupar o aparelho
-- a camera segue ligada, a faixa verde troca e a fila anda sem ninguem tocar em
nada. A recusa continua travando. Os testes abaixo estao organizados nessa
ordem: primeiro o caminho feliz que nao interrompe, depois o silencio por codigo
que substituiu o desligar-a-camera, depois a recusa, o contador e as saidas.
"""

import json
import os
import re
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


def _harness(caso):
    # `encoding="utf-8"` explicito: sem ele o Python assume a pagina de codigo do
    # Windows (cp1252) para ler o stdout do Node, e a primeira resposta com
    # acento -- "JA ENTROU" com A maiusculo acentuado, o "não enviadas" do
    # contador -- rebenta o teste com UnicodeDecodeError, longe da causa.
    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300, capture_output=True, text=True,
        encoding="utf-8", input=json.dumps(caso),
    )
    if r.returncode != 0:
        pytest.fail(f"o harness falhou:\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout)


def ler(c=None, **caso):
    """Uma leitura (ou varias) na tela de verdade, com a carga semeada."""
    base = {"carga": c or carga()}
    base.update(caso)
    return _harness(base)


def pintar(texto, c=None, escolhido=None):
    return ler(c, texto=texto, setorEscolhido=escolhido)


# ── O ingresso bom nao interrompe ninguem ────────────────────────────────────


def test_ingresso_bom_NAO_desliga_a_camera():
    """O caso comum e o ingresso bom, e ele nao deveria pedir nada de ninguem.
    Dois mil ingressos eram dois mil toques em "Ler o proximo" -- com uma mao,
    no escuro, com a fila esperando.

    Ate 16/08/2026 `achou()` desligava a camera antes de cada validacao e a
    resposta ocupava a tela. Agora a camera segue ligada e a tela continua sendo
    a de leitura: quem prova isso e este teste.
    """
    r = pintar("000001")
    assert r["desligouACamera"] is False, "a camera parou num ingresso BOM"
    assert r["telaLendo"] is True
    assert r["telaResposta"] is False, "o ingresso bom voltou a ocupar a tela"


def test_a_faixa_verde_mostra_setor_numero_e_hora():
    """A hora foi pedida pelo usuario: numa fila rapida, sem ela o porteiro nao
    distingue "acabou de passar" de "isto e de trinta segundos atras e a camera
    nao leu nada desde entao"."""
    r = pintar("000001")
    assert r["faixaVazia"] is False, "a faixa continua com a cara de 'nada lido'"
    assert "PISTA" in r["faixa"]
    assert "1" in r["faixa"]
    assert re.search(r"\d{1,2}:\d{2}", r["faixa"]), (
        f"a faixa nao mostra a hora: {r['faixa']!r}"
    )


def test_o_ingresso_bom_apita_diferente_do_barrado():
    """O porteiro segura o aparelho mas nem sempre olha para ele. Dois avisos
    iguais valem tanto quanto aviso nenhum."""
    assert ler(texto="000001")["avisos"] == ["liberado"]
    assert ler(texto="999999")["avisos"] == ["barrado"]


# ── O silencio por codigo ────────────────────────────────────────────────────
#
# Desligar a camera a cada leitura era, tambem, a protecao contra ler o mesmo QR
# duas vezes. Ela le o mesmo codigo cerca de vinte vezes por segundo enquanto o
# papel estiver na frente da lente.


def test_o_mesmo_codigo_e_ignorado_por_2_segundos():
    """A camera le o mesmo QR ~20x por segundo enquanto o papel estiver na
    frente da lente. Sem isto, o segundo disparo cai em `ja_entrou` e pinta a
    tela de VERMELHO para um ingresso BOM, um piscar depois do verde -- e o
    porteiro devolve quem tinha direito de entrar."""
    r = ler(textos=["000001", "000001"])
    assert r["fila"] == 1, "a mesma leitura entrou duas vezes na fila"
    assert r["telaResposta"] is False, "o ingresso bom piscou vermelho"


def test_outro_codigo_passa_na_hora():
    """O silencio e por CODIGO, nao por tempo de tela: a proxima pessoa da fila
    nao pode esperar dois segundos porque a anterior acabou de passar."""
    r = ler(textos=["000001", "999999"])
    assert r["fila"] == 2
    assert r["telaResposta"] is True, "o segundo codigo nao foi decidido"


def test_o_mesmo_codigo_volta_a_valer_depois_de_2_segundos():
    """O silencio e uma pausa, e nao um esquecimento. Passados os dois segundos,
    o mesmo ingresso apresentado de novo vira `ja_entrou` -- que e o certo: ele
    ja entrou mesmo."""
    r = ler(textos=["000001", "000001"], pausa=2400)
    assert r["fila"] == 2
    assert r["titulo"] == "JÁ ENTROU"


# ── A recusa continua travando ───────────────────────────────────────────────


def test_ingresso_barrado_TRAVA_e_oferece_ler_o_proximo():
    """Recusa e a unica coisa que exige que o porteiro tenha visto. A cor ocupa
    a tela, o aparelho apita longo, a camera para -- e so um toque em "Ler o
    proximo" faz a fila andar."""
    r = pintar("999999")
    assert r["telaResposta"] is True
    assert r["telaLendo"] is False
    assert r["desligouACamera"] is True, "a camera continuou lendo por tras da recusa"
    assert r["avisos"] == ["barrado"]
    assert "Ler o próximo" in _ler("frontend/portaria.html")


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


def test_ambiguidade_TRAVA_a_tela_e_NAO_registra_leitura():
    """Perguntar nao e decidir: enquanto o porteiro nao tocar num setor, nada
    pode ir para a fila -- senao a lotacao contaria uma entrada que nao houve.

    A pergunta ocupa o aparelho como uma recusa ocupa: a camera para, senao ela
    seguiria lendo por tras da pergunta e responderia outra coisa por cima."""
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
    assert r["desligouACamera"] is True


def test_toda_leitura_decidida_entra_na_fila_inclusive_a_negada():
    """E a leitura negada que responde 'por que a fila parou as 22h'."""
    assert pintar("000001")["fila"] == 1
    assert pintar("999999")["fila"] == 1


# ── A conferencia on-line, com teto de 800 ms ────────────────────────────────
#
# Cinco minutos de sincronismo e tempo de sobra para a mesma pessoa entrar por
# dois portoes. Com sinal isso fecha -- e quem decide a corrida e o servidor,
# numa operacao so. Mas o portao NUNCA espera rede.

ENTRADA = "/functions/v1/portaria/entrada"


def test_quem_perde_a_corrida_entre_dois_portoes_e_barrado_aqui():
    """O servidor respondeu que esta credencial ja entrou em outro portao. A
    decisao local dizia "pode entrar" -- e a do servidor vence, porque so ele
    enxerga os dois portoes."""
    r = ler(texto="000001", online=True,
            mock={"method": "POST", "pathname": ENTRADA, "status": 200,
                  "body": {"primeira": False, "resultado": "negado",
                           "motivo": "ja_entrou",
                           "anterior": {"momento": "2026-08-20T22:10:00Z",
                                        "portao": "Portao B"}}})
    assert r["telaResposta"] is True
    assert r["titulo"] == "JÁ ENTROU"
    assert "Portao B" in r["detalhe"], (
        "a recusa nao diz em QUAL portao a pessoa entrou -- sem isso ela vira "
        "'nao sei, o sistema nao deixou'"
    )
    assert r["filaResultados"] == ["negado"], (
        "a fila subiu o veredito LOCAL; o do servidor e que vale"
    )


def test_servidor_lento_NAO_trava_a_leitura():
    """O teto de 800 ms. Um servidor que demora nao pode segurar a fila do
    portao: o aparelho decide com o que tem e a leitura vai para a fila como
    sempre."""
    r = ler(texto="000001", online=True,
            mock={"method": "POST", "pathname": ENTRADA, "status": 200,
                  "demora": 3000, "body": {"primeira": False}})
    assert r["ms"] < 2500, f"a leitura esperou {r['ms']} ms pela rede"
    assert r["telaResposta"] is False, "a demora do servidor barrou ingresso bom"
    assert r["fila"] == 1


# ── O contador ───────────────────────────────────────────────────────────────


def _contador(c, totais=None, fila=None):
    return _harness({"modo": "contador", "carga": c, "token": "token-de-teste",
                     "totais": totais or {}, "fila": fila or [], "online": False})


def _negadas(n):
    return [{"id_local": "n-%d" % i, "momento": "2026-08-20T21:%02d:00Z" % i,
             "credencial_id": None, "setor_id": None,
             "resultado": "negado", "motivo": "desconhecido"} for i in range(n)]


def test_o_contador_soma_todos_os_setores_deste_portao_sobre_o_contratado():
    """Decisao do usuario: um numero so, sem seletor de setor para tocar por
    engano no escuro. O denominador e a quantidade CONTRATADA no ERP, que e a
    regra do projeto para lotacao."""
    c = carga()
    c["aparelho"]["setores"] = [PISTA, VIP]
    c["setores"][0]["quantidade"] = 3000
    c["setores"][1]["quantidade"] = 2000
    r = _contador(c, totais={PISTA: 1000, VIP: 234})
    assert r["numeros"] == "1.234 / 5.000"


def test_o_contador_ignora_setor_que_este_portao_nao_valida():
    """Ele soma os setores DESTE portao. Somar o evento inteiro mostraria ao
    porteiro do camarote a lotacao da pista."""
    r = _contador(carga(), totais={PISTA: 10, VIP: 500})
    assert r["numeros"] == "10 / 600"


def test_o_contador_nao_nasce_zerado_ao_abrir_o_aplicativo():
    """Os totais ficam gravados no celular de proposito: no meio do evento, um
    contador zerado e um numero errado na tela do porteiro, e ele nao tem como
    desconfiar."""
    r = _contador(carga(), totais={PISTA: 812})
    assert r["numeros"].startswith("812")


def test_o_contador_diz_quantas_leituras_ainda_nao_subiram():
    """Junto do contador, e nao numa marca separada -- decisao do usuario. Fila
    que cresce e o sinal de que a rede caiu, e o porteiro precisa ver isso sem
    procurar."""
    r = _contador(carga(), totais={PISTA: 100}, fila=_negadas(12))
    assert "12 não enviadas" in r["pendentes"]


def test_a_marca_de_nao_enviadas_some_quando_a_fila_zera():
    """"0 não enviadas" fixo na tela e ruido no unico numero que o porteiro
    olha."""
    assert _contador(carga(), totais={PISTA: 100})["pendentes"] == ""


# ── O que saiu da tela ───────────────────────────────────────────────────────


def test_saiu_o_botao_de_atualizar_o_evento():
    """Ele existia porque nao havia sincronismo automatico: o porteiro tinha de
    LEMBRAR de tocar para receber um bloqueio que o dono criou. O relogio de
    cinco minutos faz isso sozinho agora -- ver `puxarNovidades`."""
    html = _ler("frontend/portaria.html")
    assert "btn-atualizar-evento" not in html
    assert "Atualizar o evento" not in html
    assert "portariaSincronismo" in _ler("frontend/portaria.js"), (
        "o botao saiu e nada tomou o lugar dele: o bloqueio criado pelo dono "
        "nunca chegaria a este aparelho"
    )


def test_saiu_o_configurar_este_aparelho_da_tela_de_trabalho():
    """Decisao do usuario, 16/08/2026. A tela de trabalho e para ler ingresso;
    trocar a identidade deste celular passa pela engrenagem do evento, que pede
    a senha do dono. O `←` do topo ja leva a mesma lista."""
    html = _ler("frontend/portaria.html")
    assert "btn-configurar-aparelho" not in html
    assert "Configurar este aparelho" not in html


def test_a_lanterna_e_o_digitar_ficam_no_rodape():
    """Os dois alvos de toque do rodape, lado a lado: a lanterna virou icone e o
    "Digitar o numero" ficou ao lado dela. E a lanterna continua sumindo onde
    ela nao existe de verdade -- botao morto no escuro faz o porteiro achar que
    o aparelho travou."""
    html = _ler("frontend/portaria.html")
    rodape = html[html.index('class="rodape"'):]
    rodape = rodape[:rodape.index("</div>")]
    assert 'id="btn-lanterna"' in rodape
    assert 'id="btn-digitar"' in rodape
    assert "sumindo" in rodape[:rodape.index('id="btn-digitar"')], (
        "a lanterna nasce visivel; ela so pode aparecer onde existe de verdade"
    )
    assert "temLanterna" in _ler("frontend/portaria.js")


# ── O toque que destrava o som ───────────────────────────────────────────────


def test_a_leitura_comeca_com_um_toque_que_destrava_o_som():
    """Navegador nenhum toca audio antes de a pessoa encostar na tela, e ler QR
    nao conta como encostar. A alternativa -- tentar apitar sem permissao --
    falha EM SILENCIO, que e o modo de errar que esta tela inteira existe para
    evitar."""
    r = _harness({"modo": "toque", "carga": carga(), "token": "token-de-teste",
                  "fila": [], "online": False})
    assert r["capaAntes"] is True, "a leitura abriu sem pedir o toque"
    assert r["capaDepois"] is False, "a capa nao saiu depois do toque"
    assert r["destravou"] == 1, "o toque nao destravou o som"


# ── O retorno para a lista ───────────────────────────────────────────────────

FILA_DE_TESTE = [
    {"id_local": "negada-1", "momento": "2026-08-20T21:00:00Z", "credencial_id": None,
     "setor_id": None, "resultado": "negado", "motivo": "desconhecido"},
    {"id_local": "entrada-1", "momento": "2026-08-20T21:01:00Z",
     "credencial_id": "c-p1", "setor_id": PISTA, "resultado": "permitido", "motivo": None},
]


def test_ha_um_retorno_no_topo_e_ele_NAO_exige_fila_zerada():
    """A trava da fila existe para quando o aparelho troca de IDENTIDADE -- vira
    portao de outro evento, com token novo, e leitura enfileirada sob o token
    velho nao sobe mais. Ir e voltar da lista nao troca o token, e a fila sobe
    igual depois: prender o porteiro aqui seria uma trava que nao protege nada e
    atrapalha o tempo todo."""
    r = _harness({"modo": "voltar", "carga": carga(), "token": "token-de-teste",
                  "fila": FILA_DE_TESTE, "online": False})
    assert r["botaoVisivel"] is True, "nao ha retorno na tela de leitura"
    assert r["saiu"] is True, "o retorno ficou preso por causa da fila"
    assert r["url"] == "/controle.html"
    assert r["filaDepois"] == 2, "sair da tela apagou a fila"


# ── A fila so sai depois que o servidor confirmou ────────────────────────────
#
# Os testes de leitura acima desligam `navigator.onLine` de proposito (nenhuma
# rede deve sair enquanto so estamos medindo a tela), e por isso `sincronizar()`
# sai no primeiro guard sem executar o corpo -- onde mora a regra "so remove da
# fila depois que o POST /leituras confirmou". Achado em revisao de codigo,
# 15/08/2026: sem este teste, inverter a ordem (remover da fila antes do fetch)
# passaria pela suite inteira sem aviso.


def _conferir(texto, c=None):
    return _harness({"modo": "conferir", "texto": texto, "carga": c or carga()})


def test_digitar_o_numero_desliga_a_camera_antes_de_validar():
    """Achado em revisao de codigo, 15/08/2026, e mais importante ainda desde
    16/08/2026: a camera nao para mais sozinha ao achar um codigo, entao ela
    esta lendo DE VERDADE enquanto o porteiro digita. Um QR que entre no quadro
    no meio da digitacao responderia por cima do numero digitado, sem que nada
    avise a qual ingresso a tela esta respondendo.

    A parada agora acontece ja ao ABRIR a caixa -- antes era so no "Conferir",
    e entre um e outro passa o tempo inteiro da digitacao."""
    r = _conferir("000001")
    assert r["desligarAoAbrir"] is True, "a camera segue lendo enquanto ele digita"
    assert r["desligarChamado"] is True
    assert r["fila"] == 1, "o numero digitado nao foi decidido"


def _sincronizar(mock):
    return _harness({"modo": "sincronizar", "carga": carga(), "mock": mock})


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


# ── O sincronismo de cinco minutos ───────────────────────────────────────────
#
# Ele tomou o lugar do botao "Atualizar o evento", e herdou a regra que aquele
# botao tinha de respeitar: a carga muda, fila e entradas NAO. O que ele faz de
# diferente e nao substituir a carga inteira -- a rota leve nao manda as
# credenciais, e trocar a carga pelo que veio esvaziaria o evento e faria o
# portao recusar todo mundo como "desconhecido".


def _novidades(corpo, c=None):
    return _harness({
        "modo": "novidades", "carga": c or carga(), "setor": PISTA,
        "mock": {"method": "GET", "pathname": "/functions/v1/portaria/sincronizar",
                 "status": 200, "body": corpo},
    })


CORPO_DA_ROTA_LEVE = {
    "evento": {"ativo": False},
    "setores": [{"id": PISTA, "bloqueado": True, "bloqueado_motivo": "Interditado"}],
    "bloqueios": [],
    "entradas": [{"credencial_id": "c-de-outro-portao", "momento": "2026-08-20T22:10:00Z"}],
    "totais": {PISTA: 137},
    "proxima_desde": None,
}


def test_o_sincronismo_troca_a_carga_sem_tocar_fila_ou_entradas():
    """Antes de 16/08/2026 quem fazia isto era o botao "Atualizar o evento", e
    a regra e a mesma: fila e entradas sao do PORTEIRO, nao do evento. Uma
    atualizacao nao pode mexer nelas."""
    r = _novidades(CORPO_DA_ROTA_LEVE)
    assert r["filaAntes"] == 2
    assert r["filaDepois"] == 2, "o sincronismo apagou leituras da fila"
    assert r["eventoAtivoDepois"] is False, "a novidade nao chegou a gravar"
    assert r["setorBloqueadoDepois"] is True


def test_o_sincronismo_NAO_apaga_as_credenciais():
    """A rota leve nao as manda. Substituir a carga pelo que veio esvaziaria o
    evento inteiro e o portao recusaria todo mundo como "desconhecido"."""
    assert _novidades(CORPO_DA_ROTA_LEVE)["credenciaisDepois"] == 2


def test_o_sincronismo_NAO_perde_a_quantidade_contratada_do_setor():
    """Ela e o denominador do contador. A rota leve manda so o que muda no
    setor; substituir o setor inteiro levaria a quantidade junto."""
    assert _novidades(CORPO_DA_ROTA_LEVE)["quantidadeDepois"] == 600


def test_o_sincronismo_junta_as_entradas_dos_outros_portoes():
    """E a razao de a rota devolver `entradas`: cinco minutos e tempo de a mesma
    pessoa tentar entrar por duas portas."""
    r = _novidades(CORPO_DA_ROTA_LEVE)
    assert "c-de-outro-portao" in r["entradasDepois"]
    assert "c-antiga" in r["entradasDepois"], (
        "as entradas do servidor apagaram as locais que ainda nao subiram"
    )


def test_o_sincronismo_guarda_os_totais_do_contador():
    assert _novidades(CORPO_DA_ROTA_LEVE)["totaisDepois"][PISTA] == 137


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


def test_a_trava_da_fila_continua_valendo_ao_trocar_de_identidade():
    """Ela protege a contagem que o cliente pagou para ter. Trocar o token sem
    ela faz o que ficou para tras nunca subir."""
    assert "ainda não subiram" in _ler("frontend/portaria.js")


# ── A trava: trocar a identidade deste celular espera a fila ─────────────────
#
# Decisao do usuario, 16/08/2026: o aparelho "nao deixa editar mais, somente
# com a senha". A tela da portaria nao tem senha nenhuma -- o que ela tem e a
# SAIDA para a tela que pede. Estes testes recarregam a pagina de proposito: o
# que se prova mora no arranque, e semear a tela na mao pularia a decisao.
#
# O BOTAO que chamava esta saida saiu da tela de trabalho na mesma leva (ver
# `test_saiu_o_configurar_este_aparelho_da_tela_de_trabalho`); a trava que ele
# guardava nao saiu, e continua sendo exercitada aqui pela porta exportada.


def _configurar(**caso):
    base = {"modo": "configurar", "carga": carga(), "token": "token-de-teste",
            "fila": [], "online": False}
    base.update(caso)
    return _harness(base)


def test_trocar_a_identidade_leva_a_lista_de_eventos():
    """A saida do portao. Sem ela o celular fica preso: com token guardado, a
    casa do aplicativo devolve este aparelho para a leitura.

    O destino e a lista, sem `?configurar=1`: a senha agora e pedida pela
    engrenagem de cada evento, e nao por uma tela de login separada.
    """
    r = _configurar()
    assert r["saiu"] is True
    assert r["url"] == "/controle.html"


def test_trocar_a_identidade_recusa_enquanto_ha_leitura_por_subir():
    """Configurar cunha um token NOVO para este celular, e leitura enfileirada
    sob o token velho nao sobe mais depois -- some a contagem que o cliente
    pagou para ter. Sem sinal, a saida espera."""
    r = _configurar(fila=FILA_DE_TESTE, online=False)
    assert r["saiu"] is False, "saiu do portao com leitura ainda na fila"
    assert r["mensagem"], "recusou sem dizer por que"
    assert r["filaDepois"] == 2, "a recusa apagou a fila que estava protegendo"


def test_trocar_a_identidade_manda_a_fila_antes_de_sair():
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


def test_a_volta_por_falta_de_token_deixa_o_motivo_escrito():
    """Esta saida usa `location.replace`, que nao deixa rastro: a tela pisca e o
    dono esta de volta na lista sem uma palavra.

    Enquanto ela foi muda, "o conserto nao funcionou" e "este aparelho nao e
    portao deste evento" desenhavam a MESMA imagem, e o dono relatou tres vezes
    em 16/08/2026 que tocar na barra do evento nao fazia nada. A marca abaixo e
    o que a casa do aplicativo le para explicar a volta."""
    r = _configurar(token=None, online=False)
    assert r["marcaSemToken"] == "1", (
        "a portaria voltou para a lista sem dizer por que"
    )


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


# ── Onde cada coisa fica na tela de leitura ─────────────────────────────────
#
# Decisao do usuario em 18/08/2026: "nome do Setor deve ficar mais destacado,
# Lanterna, Digitar Numero e Contador devem ficar na base, parte de baixo da
# tela". O porteiro segura o celular por baixo e trabalha com o polegar.


def _layout(c=None):
    return _harness({"modo": "layout", "carga": c or carga(),
                     "token": "token-de-teste"})


def test_o_contador_a_lanterna_e_o_digitar_ficam_na_BASE_da_tela():
    r = _layout()
    assert r["contadorNaBase"] is True
    assert r["lanternaNaBase"] is True
    assert r["digitarNaBase"] is True
    # Grudados no fim: a base termina onde a folha termina, e a folha tem a
    # altura da tela. A folga e o `padding` de 14px da folha mais a area segura.
    assert r["baseTermina"] >= r["alturaDaTela"] - 40, r
    # E a camera continua em cima -- a base nao subiu para o meio.
    assert r["baseComeca"] > r["visorTermina"], r


def test_o_nome_do_SETOR_e_a_linha_grande_do_topo():
    """E ele que responde a pergunta que o porteiro faz o tempo todo -- "esta
    pessoa esta na fila certa?" -- e ele que precisa ser lido de relance. O
    nome do aparelho serve para saber QUAL celular e este, o que se pergunta
    uma vez por noite."""
    r = _layout()
    assert r["setorCorpo"] > r["aparelhoCorpo"], r
    assert r["setorCorpo"] >= 18, ("de relance, com gente andando na frente", r)
    # O setor vem PRIMEIRO: a ordem e a do que se le com pressa.
    assert r["setorTopo"] < r["aparelhoTopo"], r
