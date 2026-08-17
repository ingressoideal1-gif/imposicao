# -*- coding: utf-8 -*-
"""Os tres endpoints que o aparelho da portaria usa.

Sao a UNICA porta entre o celular do porteiro e o banco. O aparelho nao tem
conta do cliente nem chave do Supabase: ele troca um codigo de 6 caracteres por
um token proprio, revogavel um a um pela tela do dono.
"""

import hashlib
import os

import pytest
from fastapi import HTTPException

import acesso_portaria as ap
import qr_ideal

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _ler(caminho):
    """O texto cru de um arquivo do repositorio.

    A carga que o aparelho baixa e servida por uma Edge Function em
    TypeScript, que este pytest nao executa. Ler o arquivo e o que resta para
    provar que os campos novos estao la -- e e melhor que nao provar nada.
    """
    with open(os.path.join(RAIZ, caminho), encoding="utf-8") as f:
        return f.read()


SAL = "aa" * 32
# UUID de verdade, e nao "e1", porque o banco real so aceita UUID. Um dublê que
# usa id de brinquedo esconde a classe inteira de defeito que aparece quando o
# formato importa -- e escondeu: `POST /entrar` com id malformado devolvia 500
# em producao, e nenhum teste acusava, porque aqui nada era malformado.
EVENTO = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee"
PISTA = "11111111-1111-1111-1111-111111111111"
VIP = "22222222-2222-2222-2222-222222222222"


def _momento(valor):
    """Um instante comparavel, venha ele como texto ISO ou como datetime.

    Comparar as strings direto quase funciona -- e o "quase" e o problema: o
    Postgres devolve `+00:00` e o Python as vezes escreve `Z`, e ai a ordem
    lexicografica mente. Parsear e barato e nao tem esse jeito de falhar.
    """
    from datetime import datetime, timezone
    if isinstance(valor, str):
        d = datetime.fromisoformat(valor.replace("Z", "+00:00"))
    else:
        d = valor
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d


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
        # O freio de forca bruta do pareamento. Ate 16/08/2026 era um dicionario
        # na memoria do processo; virou tabela porque Edge Function e stateless
        # e, la, o freio simplesmente nao existiria.
        self.falhas_pareamento = []
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
        if path.startswith("producao_acesso_falhas_pareamento"):
            # Obedece a URL, como o resto deste dublê. O codigo filtra por
            # `evento_id=eq.` e `momento=gte.`; se um dia ele perder o segundo
            # filtro, uma falha de ontem passaria a trancar o porteiro de hoje --
            # e um fake que filtrasse por conta propria esconderia isso.
            if method == "GET":
                linhas = list(self.falhas_pareamento)
                if "evento_id=eq." in path:
                    alvo = path.split("evento_id=eq.", 1)[1].split("&", 1)[0]
                    linhas = [f for f in linhas if str(f["evento_id"]) == alvo]
                if "momento=gte." in path:
                    from urllib.parse import unquote
                    bruto = unquote(path.split("momento=gte.", 1)[1].split("&", 1)[0])
                    corte = _momento(bruto)
                    linhas = [f for f in linhas if _momento(f["momento"]) >= corte]
                if "limit=" in path:
                    limite = int(path.split("limit=", 1)[1].split("&", 1)[0])
                    linhas = linhas[:limite]
                return linhas
            if method == "POST":
                # O banco carimba o `momento` sozinho (default now()); o dublê
                # tem de fazer o mesmo, senao a linha nasce sem o campo que a
                # consulta seguinte filtra.
                from datetime import datetime, timezone
                self.falhas_pareamento.append({
                    "evento_id": body["evento_id"],
                    "momento": datetime.now(timezone.utc).isoformat(),
                })
                return []
            if method == "DELETE":
                if "evento_id=eq." in path:
                    alvo = path.split("evento_id=eq.", 1)[1].split("&", 1)[0]
                    self.falhas_pareamento = [
                        f for f in self.falhas_pareamento
                        if str(f["evento_id"]) != alvo
                    ]
                else:
                    self.falhas_pareamento = []
                return []
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
        banco.falhas_pareamento.clear()
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


def test_o_freio_conta_pelo_BANCO_e_nao_pela_memoria(banco):
    """O QUE ISTO PREVINE

    Ate 16/08/2026 a contagem vivia num dicionario na memoria do processo, e o
    proprio codigo admitia num comentario que ela nao sobrevivia a um reinicio
    do Render nem a duas instancias.

    A Edge Function e stateless por natureza: la, cada invocacao comecaria a
    contagem do zero e o freio simplesmente NAO EXISTIRIA -- 887 milhoes de
    codigos deixariam de estar protegidos pelo segundo freio.

    E enquanto as duas versoes conviverem, contar em lugares separados daria ao
    atacante o dobro de tentativas, bastando alternar entre os dois enderecos.
    """
    for _ in range(3):
        with pytest.raises(HTTPException):
            entrar(codigo="ZZZZZZ")

    assert len(banco.falhas_pareamento) == 3, (
        "as falhas nao foram parar no banco -- o freio continua so na memoria, "
        "e some quando o processo reinicia"
    )
    assert all(f["evento_id"] == EVENTO for f in banco.falhas_pareamento)


def test_a_data_do_filtro_nao_leva_MAIS_na_url(banco):
    """O `+` de `+00:00` vira ESPACO quando o servidor le a query string.

    `datetime.isoformat()` produz `2026-08-16T04:52:51.988513+00:00`, e o
    `supabase()` monta a URL por concatenacao, sem escapar nada. O servidor
    decodifica aquele `+` como espaco e o filtro chega quebrado -- o PostgREST
    recusa, o `supabase()` levanta, e o porteiro recebe 500 no portao.

    Um dublê nao pega isso sozinho, porque ele nunca passa por um decodificador
    de URL de verdade. Por isso o teste olha a URL crua que o codigo montou.
    """
    with pytest.raises(HTTPException):
        entrar(codigo="ZZZZZZ")

    urls = [p for m, p in banco.chamadas if p.startswith("producao_acesso_falhas")]
    assert urls, "o freio nao consultou a tabela de falhas"
    for u in urls:
        assert "+" not in u, (
            f"a URL leva um '+' que o servidor vai ler como espaco: {u}"
        )


def test_falha_velha_nao_tranca_o_porteiro_de_hoje(banco):
    """A janela e de cinco minutos. Sem o filtro por tempo, um porteiro que
    errou o codigo ontem chegaria hoje com o pareamento fechado -- e o freio
    que existe para atrapalhar atacante passaria a atrapalhar so ele."""
    from datetime import datetime, timedelta, timezone
    velho = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    banco.falhas_pareamento = [
        {"evento_id": EVENTO, "momento": velho} for _ in range(50)
    ]

    r = entrar()                          # codigo CERTO
    assert "token" in r, "falhas fora da janela estao trancando o pareamento"


def test_parear_com_sucesso_limpa_as_falhas_daquele_evento(banco):
    """Quem acertou provou que nao e o atacante. Deixar a contagem de pe faria
    o porteiro que errou duas vezes antes de acertar chegar mais perto do teto
    sem motivo -- e o teto existe para quem NAO acerta."""
    for _ in range(3):
        with pytest.raises(HTTPException):
            entrar(codigo="ZZZZZZ")
    assert banco.falhas_pareamento

    entrar()                              # codigo certo

    assert banco.falhas_pareamento == [], (
        "parear com sucesso nao limpou as falhas daquele evento"
    )


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


# ── O que a carga leva ao portao ────────────────────────────────────────────


def test_a_carga_diz_se_o_evento_esta_ativo():
    """Sem este campo, inativar o evento nao chega ao portao.

    A decisao no portao e tomada com a carga guardada no celular. Se ela nao
    disser o estado do evento, o aparelho continua deixando gente entrar num
    evento que o dono desligou.
    """
    texto = _ler("supabase/functions/portaria/index.ts")
    assert "ativo:" in texto and "status" in texto


def test_a_carga_traz_o_bloqueio_de_setor():
    texto = _ler("supabase/functions/portaria/index.ts")
    assert "bloqueado" in texto
    assert "bloqueado_motivo" in texto


# ── A porta dupla, e a rota leve de cinco em cinco minutos ──────────────────
#
# Cinco minutos e tempo de a mesma pessoa entrar por dois portoes. Fechar isso
# exige duas rotas novas, e as duas moram na Edge Function -- que este pytest
# nao executa. Por isso os testes abaixo leem o fonte, como os dois acima.


def test_existe_a_rota_que_decide_a_corrida():
    texto = _ler("supabase/functions/portaria/index.ts")
    assert '"entrada"' in texto
    assert "producao_acesso_entradas_unicas" in texto


def test_a_corrida_e_decidida_pelo_BANCO_e_nao_por_duas_consultas():
    """Perguntar "ja existe?" e so entao gravar deixa dois portoes entrarem
    quando as duas leituras caem no mesmo instante."""
    texto = _ler("supabase/functions/portaria/index.ts")
    assert "ignore-duplicates" in texto or "on_conflict" in texto


def test_reentrada_nao_entra_na_corrida():
    """Setor que permite sair e voltar nao tem "primeira entrada"."""
    texto = _ler("supabase/functions/portaria/index.ts")
    assert "reentrada" in texto


def test_a_entrada_nunca_confia_no_dispositivo_id_que_o_corpo_mandar():
    """Mesma regra do `/leituras`, e aqui ela pesa mais: e o `dispositivo_id`
    da linha que decide QUEM ganhou a corrida. Aceitar o id do corpo deixaria
    um aparelho reivindicar a entrada no nome de outro portao."""
    texto = _ler("supabase/functions/portaria/index.ts")
    inicio = texto.index("async function entrada(")
    trecho = texto[inicio:texto.index("async function sincronizar(")]
    assert "dispositivo_id: aparelho.id" in trecho
    assert "corpo.dispositivo_id" not in trecho


def test_a_leitura_sobe_mesmo_quando_o_aparelho_PERDE_a_corrida():
    """E contagem que o cliente pagou para ter: o relatorio precisa mostrar que
    aquele ingresso foi apresentado numa segunda porta, e nao um silencio. O que
    muda ao perder e o `resultado`/`motivo` gravado, nao a existencia da linha."""
    texto = _ler("supabase/functions/portaria/index.ts")
    inicio = texto.index("async function entrada(")
    trecho = texto[inicio:texto.index("async function sincronizar(")]
    assert "producao_acesso_leituras" in trecho
    assert 'motivo = "ja_entrou"' in trecho


def _corpo_da_funcao(nome):
    """O corpo de UMA funcao do `index.ts`, do cabecalho ate a proxima.

    Antes, os dois testes abaixo cortavam 3000 caracteres a partir da primeira
    ocorrencia da PALAVRA `sincronizar` no arquivo -- inclusive num comentario
    la em cima. Quem escrevesse essa palavra num comentario deslocaria a janela
    para um trecho que nao e a funcao, e o teste passaria a medir outra coisa
    sem reclamar. Um teste que se desarma sozinho e pior que teste nenhum.
    """
    texto = _ler("supabase/functions/portaria/index.ts")
    inicio = texto.index("async function " + nome)
    resto = texto[inicio + 1:]
    # A proxima funcao de topo, ou o `Deno.serve` que fecha o arquivo.
    fins = [p for p in (resto.find("\nasync function "), resto.find("\nfunction "),
                        resto.find("\nDeno.serve")) if p != -1]
    return resto[:min(fins)] if fins else resto


def test_a_rota_leve_NAO_desce_credenciais():
    """E a razao de ela existir: em 4G de portao, a lista de ingressos e a
    diferenca entre alguns kB e varias paginas, a cada cinco minutos."""
    assert "producao_acesso_credenciais" not in _corpo_da_funcao("sincronizar")


def test_a_rota_leve_traz_as_entradas_de_todos_os_aparelhos():
    trecho = _corpo_da_funcao("sincronizar")
    assert "entradas" in trecho and "totais" in trecho


def test_a_rota_leve_pagina_as_entradas():
    """O PostgREST corta toda resposta em 1000 linhas, e esse teto vence o
    `limit` pedido. No primeiro sincronismo depois de um boot, no meio de um
    evento grande, ha muito mais de mil entradas: sem paginar, as que sobraram
    nunca chegariam ao portao -- que voltaria a deixar entrar quem ja entrou.

    E o mesmo teto que ja mordeu o `/faixa` em producao, na quarta porta."""
    texto = _ler("supabase/functions/portaria/index.ts")
    assert "ENTRADAS_POR_VEZ" in texto
    assert "proxima_desde" in texto


def test_o_desde_da_rota_leve_e_opcional():
    """Sem ele a rota devolve as entradas todas -- e o primeiro sincronismo
    depois de um boot, quando o aparelho nao tem de onde partir."""
    texto = _ler("supabase/functions/portaria/index.ts")
    inicio = texto.index("async function sincronizar(")
    trecho = texto[inicio:]
    assert "desdeBruto: string | null" in trecho
    assert "? `&momento=gte." in trecho or 'filtro = desde' in trecho
