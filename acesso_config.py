# -*- coding: utf-8 -*-
"""A tela do dono do evento: ler e configurar.

Separado do `acesso_api.py` porque aquele arquivo já fazia três coisas — a
publicação da faixa, o QR do Pedido e a reivindicação — e configuração é a
quarta. O que NÃO se separou foi a chave: este módulo importa a `supabase()` de
lá em vez de abrir a própria conexão, para que a pergunta "quem tem a
chave-mestra do banco na mão?" continue tendo um arquivo só por resposta.

## As duas chaves de entrada

Toda LEITURA exige o JWT do Supabase e ser dono do evento. Toda ESCRITA exige,
além disso, um token de elevação — prova de que a senha do dono foi digitada nos
últimos 15 minutos, naquele navegador.

É a decisão do usuário em 13/08/2026: sem a senha é somente leitura. Ler
ingresso e registrar entrada, que é o trabalho do porteiro, nunca pedem senha —
mas isso é a parte 3b, e não passa por aqui.
"""

from fastapi import APIRouter, Header, HTTPException

import acesso_elevacao
from acesso_api import _usuario_logado, contar, supabase

router = APIRouter(prefix="/api/acesso", tags=["acesso"])


def _evento_do_dono(evento_id: str, usuario: dict) -> dict:
    """O evento, se ele for desta conta. 403 em qualquer outro caso.

    A MESMA resposta para "não existe" e para "não é seu": responder diferente
    contaria a um estranho quais eventos existem.
    """
    linha = (supabase(
        "GET",
        f"producao_acesso_eventos?id=eq.{evento_id}"
        "&select=id,dono_auth_id,nome_evento,data_evento,local_evento,status",
    ) or [None])[0]

    if not linha or str(linha.get("dono_auth_id")) != str(usuario.get("id")):
        raise HTTPException(status_code=403, detail="evento nao encontrado nesta conta")
    return linha


def _painel(evento_id: str) -> dict:
    """Tudo que a tela mostra, numa resposta só."""
    evento = (supabase(
        "GET",
        f"producao_acesso_eventos?id=eq.{evento_id}"
        "&select=id,nome_evento,data_evento,local_evento,status",
    ) or [None])[0]

    setores = supabase(
        "GET",
        f"producao_acesso_setores?evento_id=eq.{evento_id}&status=eq.ativo"
        "&select=id,nome,quantidade,lotacao,tipo_uso,pedido_id_int,modelo_id"
        "&order=nome.asc",
    ) or []
    for s in setores:
        # O número que a tela compara com `quantidade`. Divergência aqui é ou
        # impressão que ainda não terminou de publicar, ou credencial que
        # alguém publicou sem dever.
        s["publicadas"] = contar(
            f"producao_acesso_credenciais?setor_id=eq.{s['id']}&status=eq.ativo"
        )

    aparelhos = supabase(
        "GET",
        f"producao_acesso_dispositivos?evento_id=eq.{evento_id}"
        "&select=id,nome,status,ultimo_visto&order=nome.asc",
    ) or []
    vinculos = supabase(
        "GET",
        "producao_acesso_dispositivo_setores?select=dispositivo_id,setor_id",
    ) or []
    for a in aparelhos:
        a["setores"] = [v["setor_id"] for v in vinculos
                        if str(v["dispositivo_id"]) == str(a["id"])]

    pedidos = supabase(
        "GET",
        f"producao_acesso_pedidos?evento_id=eq.{evento_id}"
        "&select=pedido_id_int,publicado_em,total_credenciais&order=pedido_id_int.asc",
    ) or []

    return {
        "evento": evento,
        "setores": setores,
        "aparelhos": aparelhos,
        "pedidos": pedidos,
        "codigos_cliente": contar(
            f"producao_acesso_credenciais?evento_id=eq.{evento_id}&origem=eq.cliente"
        ),
    }


@router.get("/eventos/{evento_id}")
def ver_evento(evento_id: str, authorization: str = Header(None)):
    _evento_do_dono(evento_id, _usuario_logado(authorization))
    return _painel(evento_id)
