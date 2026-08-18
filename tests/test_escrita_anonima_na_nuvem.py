# -*- coding: utf-8 -*-
"""Na nuvem, escrever exige sessão — e ler dado sensível também.

## O que foi medido em 16/08/2026, sem credencial nenhuma, de fora

    GET  <servidor da nuvem>/api/acessos-locais   200
    GET  <servidor da nuvem>/api/user/permissions 200

A primeira devolvia os **códigos de acesso local em texto claro** — três pessoas
da gráfica, uma delas com papel `admin`. É o código que destranca o painel do
NewProd numa estação. A segunda devolvia a grade de permissões inteira, e o
`POST` dela deixaria qualquer um se dar `admin`.

A causa não era um descuido pontual: `get_current_user` é um carimbo que devolve
admin para todo mundo, e o **mesmo `app.py`** rodava na estação (onde isso é
inofensivo, atrás da LAN e da trava do código local) e num servidor Python
hospedado (onde era um endereço público). Aquele servidor saiu do ar em
17/08/2026 e o `app.py` ficou só na estação — mas a regra abaixo fica, porque é
ela que impede a próxima cópia de nascer aberta.

## Por que a regra é por MÉTODO, e não uma lista de rotas

Uma lista de rotas protegidas envelhece: quem acrescentar um endpoint novo
amanhã precisa lembrar de incluí-lo, e o esquecimento não aparece como erro —
aparece como uma porta aberta que ninguém procura. A regra por método é o
contrário: nasce fechada para tudo que escreve, e abrir é ato explícito.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import app as app_modulo

precisa = app_modulo.precisa_de_sessao


def test_toda_escrita_exige_sessao():
    for metodo in ("POST", "PUT", "PATCH", "DELETE"):
        assert precisa(metodo, "/api/formatos"), metodo
        assert precisa(metodo, "/api/mapas_teatro/abc"), metodo
        assert precisa(metodo, "/api/qualquer-coisa-nova"), (
            f"{metodo} numa rota que ainda nem existe tem de nascer fechado"
        )


def test_os_dois_vazamentos_medidos_ficam_fechados_ate_na_leitura():
    """Ler já era o estrago: os códigos saíam em texto claro."""
    assert precisa("GET", "/api/acessos-locais")
    assert precisa("GET", "/api/user/permissions")
    assert precisa("GET", "/api/user/permissions/algum-uuid")
    assert precisa("GET", "/api/admin/users")
    assert precisa("GET", "/api/email/config")
    assert precisa("GET", "/api/diag")


def test_leitura_de_catalogo_continua_aberta():
    """`cliente.html` é a tela do cliente, sem login nenhum, e ela lê fontes.

    Fechar isto junto trocaria um vazamento por uma tela quebrada na frente do
    cliente. O catálogo não é segredo: são nomes de fonte e formatos de papel.
    """
    for caminho in ("/api/fontes", "/api/fonte", "/api/proxy", "/api/formatos",
                    "/api/numeracoes", "/api/mapas_teatro"):
        assert not precisa("GET", caminho), caminho


def test_o_preflight_passa():
    """O navegador manda o OPTIONS sem cabeçalho nenhum, por definição. Exigir
    sessão nele bloquearia a requisição de verdade antes de ela sair."""
    assert not precisa("OPTIONS", "/api/user/permissions")
    assert not precisa("OPTIONS", "/api/formatos")


def test_o_controle_de_acesso_tem_trava_propria():
    """`/api/acesso/*` não passa por aqui: a portaria se identifica com token de
    aparelho, a estação com o segredo do agente, e o Ideal Control com papel
    lido do banco. Exigir sessão de painel ali recusaria o porteiro."""
    for caminho in ("/api/acesso/portaria/entrar", "/api/acesso/pedidos/1/abrir",
                    "/api/acesso/interno/pedidos"):
        assert not precisa("POST", caminho), caminho


def test_a_imposicao_na_nuvem_continua_recusando_com_a_frase_dela():
    """Ela já recusa TODO MUNDO desde a Fase 1, e a recusa diz ao operador por
    onde o trabalho sai. Um 401 seco no lugar dela não fecharia nada a mais e
    mandaria o operador procurar senha quando o problema é outro."""
    assert not precisa("POST", "/api/impose")


def test_o_que_nao_e_api_nao_e_assunto():
    assert not precisa("GET", "/")
    assert not precisa("POST", "/favicon.ico")


def test_o_agente_local_nao_e_afetado():
    """A trava vale só na nuvem, e isso é decisão, não esquecimento.

    Na estação o operador entra pelo código local — muitas vezes sem rede, que é
    justamente o caso para o qual o `acesso_local` existe. Exigir sessão do
    Supabase ali pararia a produção para resolver um problema que a estação não
    tem: ela vive na LAN da gráfica.
    """
    fonte = open(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                              "app.py"), encoding="utf-8").read()
    trecho = fonte[fonte.index("async def exigir_sessao_na_nuvem"):]
    assert "security_config.is_cloud_runtime()" in trecho[:400], (
        "a trava precisa estar presa ao runtime de nuvem"
    )
