# -*- coding: utf-8 -*-
"""Acesso local ao painel do NewProd — a lista de operadores em disco.

O painel servido na porta 9000 nao tem como perguntar ao Supabase quem pode
entrar: a estacao precisa funcionar com a internet fora, e a rede no caminho do
operador e exatamente o que o agente existe para evitar. Entao a lista de
codigos e baixada de tempos em tempos pelo agent_worker e guardada aqui; o
login confere contra este arquivo, em memoria, sem sair da maquina.

O codigo fica em texto claro. Isso e requisito: o administrador precisa ler o
codigo na tela para entregar ao operador. O que se constroi aqui e uma tranca de
estacao, nao uma barreira criptografica.
"""

import json
import os
import threading
import time

import db

ARQUIVO = os.path.join(db.DB_DIR, "acessos_locais.json")

# Retardo depois de erros seguidos. Sao 32^6 combinacoes possiveis, entao a
# forca bruta ja e impraticavel; o retardo custa quase nada e fecha a porta de
# quem tentaria as poucas dezenas de codigos "obvios" na mao.
ERROS_ATE_RETARDO = 5
RETARDO_S = 3.0

_lock = threading.Lock()
_erros_seguidos = 0


def salvar_lista(acessos) -> bool:
    """Grava a lista baixada da nuvem, so com o que o login precisa."""
    enxuto = []
    for a in acessos or []:
        codigo = db.normalizar_codigo_acesso(a.get("codigo"))
        if not codigo:
            continue
        enxuto.append({
            "codigo": codigo,
            "nome": a.get("nome") or "Operador",
            "role": a.get("role") or "",
            # A grade de permissoes por modulo, a mesma dos demais usuarios. E o
            # que o painel aplica na estacao depois do login.
            "permissoes": a.get("permissoes") or {},
            "ativo": a.get("ativo") is not False,
        })
    try:
        temporario = ARQUIVO + ".novo"
        with open(temporario, "w", encoding="utf-8") as f:
            json.dump({"acessos": enxuto}, f, ensure_ascii=False, indent=2)
        os.replace(temporario, ARQUIVO)
        return True
    except Exception as e:
        print(f"[acesso_local] Nao foi possivel gravar a lista: {e}")
        return False


def carregar_lista():
    """Le a lista em disco. Sem arquivo, devolve lista vazia."""
    try:
        with open(ARQUIVO, "r", encoding="utf-8") as f:
            dados = json.load(f)
        return dados.get("acessos") or []
    except FileNotFoundError:
        return []
    except Exception as e:
        print(f"[acesso_local] Nao foi possivel ler a lista: {e}")
        return []


def ha_lista() -> bool:
    """Esta estacao ja recebeu alguma lista de acessos?

    Enquanto a resposta for nao — instalacao nova, ou maquina que nunca alcancou
    a nuvem — o painel libera a entrada como fazia antes. Travar a producao
    porque a internet caiu seria pior do que o problema que isto resolve.

    Repare que conta acesso INATIVO tambem, de proposito. Contar so os ativos
    parecia mais certo e produzia o oposto do que o administrador pediu:
    desativar o ultimo acesso da lista zerava a contagem, a estacao concluia que
    nao havia codigo nenhum e voltava a deixar QUALQUER UM entrar. Desativar
    alguem tem de restringir, nunca liberar. Uma vez que a grafica cadastrou
    acessos, a estacao passa a pedir codigo para sempre; se todos forem
    desativados, ninguem entra ate o administrador reativar alguem pelo site —
    que e exatamente o que ele mandou fazer.
    """
    return len(carregar_lista()) > 0


def validar(codigo):
    """Devolve o acesso correspondente ao codigo, ou None.

    Compara em tempo constante para nao entregar, pelo tempo de resposta, quantos
    caracteres iniciais estavam certos.
    """
    import hmac

    global _erros_seguidos
    with _lock:
        atrasar = _erros_seguidos >= ERROS_ATE_RETARDO
    if atrasar:
        time.sleep(RETARDO_S)

    alvo = db.normalizar_codigo_acesso(codigo)
    encontrado = None
    if alvo:
        for a in carregar_lista():
            if a.get("ativo") is False:
                continue
            if hmac.compare_digest(str(a.get("codigo") or ""), alvo):
                encontrado = a
                break

    with _lock:
        _erros_seguidos = 0 if encontrado else _erros_seguidos + 1
    return encontrado
