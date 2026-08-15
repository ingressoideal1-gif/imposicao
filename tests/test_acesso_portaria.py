# -*- coding: utf-8 -*-
"""Os tres endpoints que o aparelho da portaria usa.

Sao a UNICA porta entre o celular do porteiro e o banco. O aparelho nao tem
conta do cliente nem chave do Supabase: ele troca um codigo de 6 caracteres por
um token proprio, revogavel um a um pela tela do dono.
"""

import hashlib

import pytest
from fastapi import HTTPException

import acesso_portaria as ap
import qr_ideal

SAL = "aa" * 32
# UUID de verdade, e nao "e1", porque o banco real so aceita UUID. Um dublê que
# usa id de brinquedo esconde a classe inteira de defeito que aparece quando o
# formato importa -- e escondeu: `POST /entrar` com id malformado devolvia 500
# em producao, e nenhum teste acusava, porque aqui nada era malformado.
EVENTO = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"
PISTA = "11111111-1111-1111-1111-111111111111"
VIP = "22222222-2222-2222-2222-222222222222"


class FakeBanco:
    """Um Supabase de mentira, que guarda em dicionario o que foi gravado."""

    def __init__(self):
        self.eventos = [{"id": EVENTO, "nome_evento": "Festa", "sal": SAL}]
        self.aparelhos = [{
            "id": "d1", "evento_id": EVENTO, "nome": "Portao A", "status": "ativo",
            "codigo_hash": qr_ideal.hash_codigo("ABC234", SAL), "token_hash": None,
        }]
        self.vinculos = [{"dispositivo_id": "d1", "setor_id": PISTA}]
        self.setores = [
            {"id": PISTA, "evento_id": EVENTO, "nome": "PISTA", "quantidade": 600,
             "tipo_uso": "unico", "abre_em": None, "fecha_em": None, "pedido_id_int": 18560},
            {"id": VIP, "evento_id": EVENTO, "nome": "VIP", "quantidade": 500,
             "tipo_uso": "reentrada", "abre_em": None, "fecha_em": None, "pedido_id_int": 18560},
        ]
        self.bloqueios = []
        self.credenciais = [
            {"id": "c1", "codigo_hash": "h1", "setor_id": PISTA, "numero": 1},
            {"id": "c2", "codigo_hash": "h2", "setor_id": VIP, "numero": 9},
        ]
        self.pedidos = [{"pedido_id_int": 18560, "sal": "bb" * 32, "evento_id": EVENTO}]
        self.leituras = []
        self.chamadas = []

    def _status_pedido(self, path):
        """O `status=eq.<valor>` que a URL pediu, ou `None` se ela nao pediu
        nenhum.

        O dublê OBEDECE a URL em vez de decidir por conta propria -- e nao um
        capricho de estilo. Um PostgREST de verdade so filtra o que o filtro
        pede; se `acesso_portaria.py` um dia perder o `&status=eq.ativo` da
        consulta (refatoracao, copiar-colar errado), o servidor real passa a
        devolver aparelho revogado junto. Um fake que filtra por conta propria
        nunca reprova essa regressao -- ele "concerta" o buraco da consulta
        raiz, e a suite fica verde enquanto o aparelho revogado volta a
        funcionar em producao. Mesma licao do FakeBanco de
        tests/test_acesso_api.py, que deduplicava por uma coluna escolhida por
        ele mesmo em vez do `on_conflict=` que o codigo pedia, e passou verde
        por meses com a chave real errada -- ate custar 31 ingressos impressos.
        """
        if "status=eq." not in path:
            return None
        return path.split("status=eq.", 1)[1].split("&", 1)[0]

    @staticmethod
    def _conferir_uuid(path):
        """Levanta no id malformado, como o PostgREST de verdade.

        O Postgres recusa `id=eq.nao-e-uuid` com `22P02 invalid input syntax for
        type uuid`, e o `supabase()` traduz isso em RuntimeError -- que o
        FastAPI, sem tratamento, vira **500**.

        Um dublê que simplesmente devolve lista vazia nesse caso e mais gentil
        que o banco, e essa gentileza esconde defeito: foi assim que o
        `POST /entrar` foi para producao devolvendo 500 para id malformado, com
        a suite inteira verde. Conferido contra o Render em 15/08/2026, depois
        de publicar a v583.
        """
        import re as _re
        for campo in ("id", "evento_id", "setor_id", "dispositivo_id"):
            marca = campo + "=eq."
            if marca not in path:
                continue
            valor = path.split(marca, 1)[1].split("&", 1)[0]
            if not _re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-"
                             r"[0-9a-f]{4}-[0-9a-f]{12}$", valor, _re.I):
                raise RuntimeError(
                    f"Supabase GET {path}: HTTP 400 "
                    f'{{"code":"22P02","message":"invalid input syntax for type uuid: '
                    f'\\"{valor}\\""}}'
                )

    def __call__(self, method, path, body=None, prefer=None):
        self.chamadas.append((method, path))
        if path.startswith("producao_acesso_eventos"):
            self._conferir_uuid(path)
            # Tambem obedece a URL, pelo mesmo motivo do `_status_pedido`
            # abaixo: sem filtrar por `id=eq.`, um evento_id que nao existe
            # "acharia" o primeiro evento da lista, e o teste que existe
            # exatamente para provar que evento inexistente e recusado nunca
            # exerceria esse caminho.
            linhas = list(self.eventos)
            if "id=eq." in path:
                alvo = path.split("id=eq.", 1)[1].split("&", 1)[0]
                linhas = [e for e in linhas if str(e["id"]) == alvo]
            return linhas
        if path.startswith("producao_acesso_dispositivo_setores"):
            return list(self.vinculos)
        if path.startswith("producao_acesso_dispositivos"):
            if method == "GET":
                linhas = list(self.aparelhos)
                if "token_hash=eq." in path:
                    alvo = path.split("token_hash=eq.", 1)[1].split("&", 1)[0]
                    linhas = [a for a in linhas if a.get("token_hash") == alvo]
                status = self._status_pedido(path)
                if status is not None:
                    linhas = [a for a in linhas if a["status"] == status]
                return linhas
            if method == "PATCH":
                for a in self.aparelhos:
                    a.update(body)
                return self.aparelhos
        if path.startswith("producao_acesso_setores"):
            return list(self.setores)
        if path.startswith("producao_acesso_bloqueios"):
            return list(self.bloqueios)
        if path.startswith("producao_acesso_pedidos"):
            return list(self.pedidos)
        if path.startswith("producao_acesso_credenciais"):
            # Falso PostgREST: honra offset/limit de verdade, porque e exatamente
            # isso que o teste de paginacao confere. Sem isto, a fake sempre
            # devolve a lista inteira e nenhuma pagina teria como diferir da
            # seguinte.
            linhas = list(self.credenciais)
            if "offset=" in path:
                desde = int(path.split("offset=", 1)[1].split("&", 1)[0])
                linhas = linhas[desde:]
            if "limit=" in path:
                limite = int(path.split("limit=", 1)[1].split("&", 1)[0])
                linhas = linhas[:limite]
            return linhas
        if path.startswith("producao_acesso_leituras"):
            if method == "POST":
                vistos = {(l["dispositivo_id"], l["id_local"]) for l in self.leituras}
                for linha in body:
                    chave = (linha["dispositivo_id"], linha["id_local"])
                    if chave not in vistos:
                        self.leituras.append(linha)
                        vistos.add(chave)
                return []
        return []


@pytest.fixture
def banco(monkeypatch):
    b = FakeBanco()
    monkeypatch.setattr(ap, "supabase", b)
    ap._FALHAS.clear()
    return b


def entrar(codigo="ABC234", evento=EVENTO):
    return ap._entrar({"evento_id": evento, "codigo": codigo})


def test_o_codigo_certo_devolve_token_e_o_nome_do_aparelho(banco):
    r = entrar()
    assert len(r["token"]) == 64
    assert r["aparelho"]["nome"] == "Portao A"
    assert r["aparelho"]["setores"] == [PISTA]
    assert r["evento"]["nome"] == "Festa"


def test_o_token_fica_gravado_como_HASH_nunca_em_claro(banco):
    """Vazamento do banco nao pode entregar aparelho nenhum."""
    r = entrar()
    assert banco.aparelhos[0]["token_hash"] == hashlib.sha256(
        r["token"].encode("utf-8")).hexdigest()
    assert r["token"] not in str(banco.aparelhos)


def test_codigo_errado_nao_diz_se_o_evento_existe(banco):
    """Responder diferente contaria a um estranho quais eventos existem."""
    with pytest.raises(HTTPException) as e:
        entrar(codigo="ZZZZZZ")
    assert e.value.status_code == 401


def test_evento_que_nao_existe_nao_diz_se_o_evento_existe(banco):
    """Mesma resposta de `test_codigo_errado_nao_diz_se_o_evento_existe`, mas
    para o outro jeito de a mesma pergunta chegar: em vez de errar o codigo
    num evento que existe, aqui o evento_id em si e desconhecido.

    Um 404 "evento nao encontrado" aqui seria vazamento igual, so que mais
    direto: um estranho testando evento_id em sequencia aprenderia, um a um,
    quais existem -- 404 para os que nao existem, 401 (ou coisa nenhuma) para
    os que existem. A regra do projeto e responder o MESMO para os tres
    casos -- codigo errado, aparelho revogado, evento inexistente -- porque
    responder diferente conta a um estranho o que existe do outro lado.

    O id usado aqui e um UUID BEM FORMADO que nao existe, e nao um texto
    qualquer: e o unico jeito de este teste exercitar a consulta ao banco. Com
    um id malformado ele passaria pela conferencia de formato e nunca chegaria
    la -- ver o teste logo abaixo, que cobre esse outro caminho.
    """
    with pytest.raises(HTTPException) as e:
        entrar(evento="00000000-0000-0000-0000-000000000000")
    assert e.value.status_code == 401


def test_evento_id_malformado_e_recusado_igual_e_nao_estoura(banco):
    """Achado conferindo o Render DEPOIS de publicar a v583, em 15/08/2026.

    `POST /entrar` com `evento_id` que nao e UUID devolvia **500 Internal Server
    Error**: o PostgREST recusa `id=eq.nao-e-uuid` com erro de tipo, o
    `supabase()` levanta, e o FastAPI traduz para 500.

    Duas consequencias. A que importa: o porteiro que abrir um endereco truncado
    ou digitado errado ve "Internal Server Error" num portao, com fila, e sem
    nada que ele possa fazer. A outra: 500 aqui e 401 no UUID valido inexistente
    contam a um estranho qual dos dois ids chegou a ser procurado.
    """
    for ruim in ("nao-e-uuid", "123", "'; drop table --", "0000"):
        ap._FALHAS.clear()
        with pytest.raises(HTTPException) as e:
            entrar(evento=ruim)
        assert e.value.status_code == 401, f"{ruim!r} nao devolveu 401"
        assert e.value.detail == "codigo invalido", (
            f"{ruim!r} respondeu diferente dos outros casos, e isso e vazamento"
        )


def test_aparelho_revogado_nao_pareia(banco):
    banco.aparelhos[0]["status"] = "revogado"
    with pytest.raises(HTTPException) as e:
        entrar()
    assert e.value.status_code == 401


def test_dez_erros_seguidos_fecham_o_pareamento_daquele_evento(banco):
    """Sao 31^6 codigos, mas forca bruta e ataque de repeticao: parar depois de
    dez erros custa nada a quem digitou certo e muito a quem esta tentando."""
    for _ in range(10):
        with pytest.raises(HTTPException):
            entrar(codigo="ZZZZZZ")
    with pytest.raises(HTTPException) as e:
        entrar(codigo="ABC234")          # ate o codigo CERTO e recusado agora
    assert e.value.status_code == 429


def token_de(banco):
    return "Bearer " + entrar()["token"]


def test_a_faixa_traz_o_evento_INTEIRO_e_marca_os_setores_do_aparelho(banco):
    """Se trouxesse so os setores autorizados, um ingresso de outro setor
    cairia em 'desconhecido' e o porteiro devolveria ingresso bom achando que e
    falso. O aparelho precisa conhecer o evento todo para distinguir."""
    r = ap._faixa(token_de(banco), 0)
    assert sorted(s["nome"] for s in r["setores"]) == ["PISTA", "VIP"]
    assert r["aparelho"]["setores"] == [PISTA]
    assert sorted(c["s"] for c in r["credenciais"]) == sorted([PISTA, VIP])


def test_a_faixa_traz_o_sal_de_cada_pedido_e_o_do_evento(banco):
    """Sem eles o aparelho nao consegue calcular o hash do que leu -- a nuvem
    nunca manda codigo, so hash."""
    r = ap._faixa(token_de(banco), 0)
    assert r["sais"]["18560"] == "bb" * 32
    assert r["evento"]["sal"] == SAL


def test_a_faixa_pagina_e_diz_onde_continuar(banco, monkeypatch):
    monkeypatch.setattr(ap, "POR_PAGINA", 1)
    r = ap._faixa(token_de(banco), 0)
    assert len(r["credenciais"]) == 1
    assert r["proxima"] == 1
    fim = ap._faixa(token_de(banco), 1)
    assert fim["proxima"] is None


def test_a_pagina_da_faixa_cabe_no_teto_de_mil_linhas_do_postgrest():
    """O PostgREST corta toda resposta em 1000 linhas, e esse teto vence o
    `limit` pedido. Com POR_PAGINA acima disso, a pagina volta truncada, o
    `tem_mais` da False, e o aparelho para achando que baixou o evento inteiro --
    metade das pessoas recebe 'NAO E DESTE EVENTO' com ingresso legitimo.

    Este mesmo teto ja mordeu o projeto duas vezes antes de chegar aqui: no
    `_fechar_pedido` (contagem por tamanho de resposta, corrigida para contar
    por `Content-Range`) e na auditoria de 15/08/2026 (pedido 18560, 2.000
    credenciais gravadas e corretas, leitura devolvendo 1.000). E o mesmo
    defeito, na terceira porta."""
    assert ap.POR_PAGINA + 1 < 1000


def test_token_desconhecido_e_recusado(banco):
    with pytest.raises(HTTPException) as e:
        ap._faixa("Bearer nao-existe", 0)
    assert e.value.status_code == 401


def test_revogar_derruba_quem_ja_estava_pareado(banco):
    """E o unico jeito de tirar um aparelho de circulacao: gerar codigo novo nao
    derruba ninguem, porque quem esta pareado ja nao usa o codigo."""
    cabecalho = token_de(banco)
    banco.aparelhos[0]["status"] = "revogado"
    with pytest.raises(HTTPException) as e:
        ap._faixa(cabecalho, 0)
    assert e.value.status_code == 401


def test_as_leituras_sobem_e_o_reenvio_nao_duplica(banco):
    """O celular que ficou tres horas offline reenvia a fila inteira. A chave
    unica (dispositivo_id, id_local) e o que transforma reenvio em nada."""
    cabecalho = token_de(banco)
    lote = {"leituras": [
        {"id_local": "a", "momento": "2026-08-20T21:00:00Z", "credencial_id": "c1",
         "setor_id": PISTA, "resultado": "permitido", "motivo": None},
        {"id_local": "b", "momento": "2026-08-20T21:01:00Z", "credencial_id": None,
         "setor_id": None, "resultado": "negado", "motivo": "desconhecido"},
    ]}
    assert ap._leituras(cabecalho, lote)["gravadas"] == 2
    ap._leituras(cabecalho, lote)
    assert len(banco.leituras) == 2


def test_a_leitura_NEGADA_tambem_sobe(banco):
    """E ela que responde 'por que a fila parou as 22h'. Sem ela o relatorio
    mostraria um evento sem problema nenhum, que nunca e verdade."""
    ap._leituras(token_de(banco), {"leituras": [
        {"id_local": "n", "momento": "2026-08-20T22:00:00Z", "credencial_id": None,
         "setor_id": None, "resultado": "negado", "motivo": "bloqueado"},
    ]})
    assert banco.leituras[0]["resultado"] == "negado"
    assert banco.leituras[0]["motivo"] == "bloqueado"


def test_a_leitura_nunca_confia_no_dispositivo_id_que_o_corpo_mandar(banco):
    """O aparelho e quem o TOKEN diz que e. Aceitar o id do corpo deixaria um
    aparelho gravar leitura no nome de outro."""
    ap._leituras(token_de(banco), {"leituras": [
        {"id_local": "a", "momento": "2026-08-20T21:00:00Z", "resultado": "permitido",
         "credencial_id": "c1", "setor_id": PISTA, "dispositivo_id": "OUTRO"},
    ]})
    assert banco.leituras[0]["dispositivo_id"] == "d1"
