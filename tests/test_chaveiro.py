# -*- coding: utf-8 -*-
"""O chaveiro: quais eventos ESTE aparelho ja le.

E ele que acende as luzes verdes da tela inicial sem rede e sem conta -- que e
a situacao do celular do porteiro no dia do evento.

Duas coisas aqui nao podem errar:

  1. A MIGRACAO. Todo celular que ja e portao hoje tem a chave antiga e nenhum
     chaveiro. Sem converter, ele acorda com o evento apagado na lista e o
     porteiro chama o dono no meio do evento.

  2. UM PORTAO POR APARELHO. Abrir o mesmo evento duas vezes no mesmo celular
     nao pode criar dois portoes -- decisao do usuario em 16/08/2026.
"""

import json
import os
import subprocess

import pytest

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HARNESS = os.path.join(RAIZ, "tests", "chaveiro_harness.js")

CHAVE = "ideal_control_portoes"
CHAVE_TOKEN = "ideal_portaria_token"
CHAVE_EVENTO = "ideal_portaria_evento"


def chamar(nome, *argumentos, guardado=None):
    r = subprocess.run(
        ["node", HARNESS], cwd=RAIZ, timeout=300, capture_output=True, text=True,
        input=json.dumps({
            "chamada": nome,
            "argumentos": list(argumentos),
            "localStorage": guardado or {},
        }),
    )
    if r.returncode != 0:
        pytest.fail(f"o harness falhou:\n{r.stdout}\n{r.stderr}")
    return json.loads(r.stdout)


PORTAO_A = {
    "evento_id": "e-1", "nome_evento": "Click",
    "aparelho_id": "d-1", "nome_portao": "Portão 1", "token": "t-1",
}
PORTAO_B = {
    "evento_id": "e-2", "nome_evento": "Festa da Uva",
    "aparelho_id": "d-2", "nome_portao": "Portão 1", "token": "t-2",
}


def com(*portoes):
    return {CHAVE: json.dumps(list(portoes))}


# ── Listar e procurar ───────────────────────────────────────────────────────

def test_aparelho_novo_tem_chaveiro_vazio():
    assert chamar("listar")["resultado"] == []


def test_chaveiro_corrompido_nao_derruba_a_tela():
    """JSON invalido no localStorage vira lista vazia, e nao excecao.

    A tela inicial e a primeira coisa que abre. Uma excecao aqui e uma tela em
    branco, sem uma palavra do porque -- exatamente o que o `abrir()` do
    controle.js ja aprendeu a evitar.
    """
    assert chamar("listar", guardado={CHAVE: "{nao e json"})["resultado"] == []


def test_procurar_acha_pelo_evento():
    r = chamar("procurar", "e-2", guardado=com(PORTAO_A, PORTAO_B))
    assert r["resultado"]["token"] == "t-2"


def test_procurar_evento_que_nao_esta_devolve_nulo():
    r = chamar("procurar", "e-9", guardado=com(PORTAO_A))
    assert r["resultado"] is None


# ── Guardar: um portao por aparelho ─────────────────────────────────────────

def test_guardar_acrescenta():
    r = chamar("guardar", PORTAO_B, guardado=com(PORTAO_A))
    assert len(r["resultado"]) == 2


def test_guardar_o_MESMO_evento_substitui_em_vez_de_duplicar():
    """Decisao do usuario: um portao por aparelho, nao um por carregamento."""
    outro = dict(PORTAO_A, token="t-novo", nome_portao="Portão renomeado")
    r = chamar("guardar", outro, guardado=com(PORTAO_A))
    assert len(r["resultado"]) == 1
    assert r["resultado"][0]["token"] == "t-novo"


def test_esquecer_tira_so_o_pedido():
    r = chamar("esquecer", "e-1", guardado=com(PORTAO_A, PORTAO_B))
    assert [p["evento_id"] for p in r["resultado"]] == ["e-2"]


# ── Migracao da instalacao antiga ───────────────────────────────────────────

def test_migrar_converte_a_instalacao_antiga():
    r = chamar("migrar", guardado={CHAVE_TOKEN: "t-velho", CHAVE_EVENTO: "e-velho"})
    assert r["resultado"] is True
    guardado = json.loads(r["localStorage"][CHAVE])
    assert len(guardado) == 1
    assert guardado[0]["evento_id"] == "e-velho"
    assert guardado[0]["token"] == "t-velho"


def test_migrar_NAO_apaga_as_chaves_antigas():
    """A portaria continua lendo `ideal_portaria_token` como sempre leu.

    O chaveiro e camada nova por cima; apagar embaixo dela desligaria o portao
    que esta trabalhando agora.
    """
    r = chamar("migrar", guardado={CHAVE_TOKEN: "t-velho", CHAVE_EVENTO: "e-velho"})
    assert r["localStorage"][CHAVE_TOKEN] == "t-velho"


def test_migrar_nao_faz_nada_em_aparelho_que_nunca_foi_portao():
    r = chamar("migrar")
    assert r["resultado"] is False
    assert CHAVE not in r["localStorage"]


def test_migrar_duas_vezes_nao_duplica():
    r = chamar("migrar", guardado={
        CHAVE_TOKEN: "t-velho", CHAVE_EVENTO: "e-velho",
        CHAVE: json.dumps([dict(PORTAO_A, evento_id="e-velho", token="t-velho")]),
    })
    assert r["resultado"] is False
    assert len(json.loads(r["localStorage"][CHAVE])) == 1


def test_migrar_sem_o_evento_guardado_nao_inventa_entrada():
    """Token sem evento nao da portao: a lista mostraria uma barra sem nome."""
    r = chamar("migrar", guardado={CHAVE_TOKEN: "t-velho"})
    assert r["resultado"] is False


# ── Qual evento esta carregado ──────────────────────────────────────────────

def test_carregado_le_a_chave_que_a_portaria_usa():
    r = chamar("carregado", guardado={CHAVE_EVENTO: "e-1", CHAVE_TOKEN: "t-1"})
    assert r["resultado"] == "e-1"


def test_evento_sem_token_NAO_conta_como_carregado():
    """O defeito de 16/08/2026, que custou tres relatos do dono.

    `ideal_portaria_evento` sozinho nao prova nada: a portaria escreve essa
    chave so como MEMORIA de qual evento era -- ao abrir `?e=<evento>` sem
    nunca ter virado portao, e ao ser revogada pelo dono (`aparelhoRevogado`
    apaga o token DE PROPOSITO e deixa o evento, para nao perder a fila).

    Quando `carregado()` acreditava nessa chave sozinha, a tela inicial
    decidia 'ler', mandava o aparelho para a `portaria.html`, e la o arranque
    nao achava token e voltava com `location.replace('controle.html')`. O toque
    na barra do evento nao fazia NADA -- sem erro, sem palavra, para sempre.
    """
    r = chamar("carregado", guardado={CHAVE_EVENTO: "e-1"})
    assert r["resultado"] == ""


def test_token_sem_evento_tambem_nao_conta():
    r = chamar("carregado", guardado={CHAVE_TOKEN: "t-1"})
    assert r["resultado"] == ""


def test_carregar_aponta_as_chaves_da_portaria_para_o_portao_pedido():
    r = chamar("carregar", "e-2", guardado=com(PORTAO_A, PORTAO_B))
    assert r["resultado"] is True
    assert r["localStorage"][CHAVE_TOKEN] == "t-2"
    assert r["localStorage"][CHAVE_EVENTO] == "e-2"


def test_carregar_evento_que_nao_esta_no_chaveiro_recusa():
    r = chamar("carregar", "e-9", guardado=com(PORTAO_A))
    assert r["resultado"] is False
