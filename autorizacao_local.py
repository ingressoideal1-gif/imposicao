"""Identidade e permissoes da API local, sem inicializar banco ou worker."""
import hashlib
import json
from pathlib import Path
import secrets
import sys
import threading
import time
import urllib.error
import urllib.request

from fastapi import HTTPException

_raiz = Path(getattr(sys, '_MEIPASS', Path(__file__).parent))
PADROES = json.loads((_raiz / 'permissoes_padroes.json').read_text(encoding='utf-8'))
_sessoes = {}
_lock = threading.Lock()
VALIDADE_SESSAO = 8 * 60 * 60


def permissoes_efetivas(operador):
    role = str(operador.get('role') or '').strip().lower()
    padrao = PADROES.get(role, {})
    grade = operador.get('permissoes') or {}
    if not isinstance(grade, dict):
        raise HTTPException(403, 'Grade de permissoes invalida.')
    permissoes = {k: grade.get(k, padrao.get(k)) is True for k in PADROES['admin']}
    if not grade:
        permissoes['perm_admin_view'] = False
        permissoes['perm_admin_edit'] = False
    return {**operador, 'role': role, 'permissoes': permissoes,
            'admin': permissoes['perm_admin_edit'], 'editor': any(
                v for k, v in permissoes.items() if k.endswith('_edit'))}


def criar_sessao(operador):
    codigo = str(operador.get('codigo') or '')
    if not codigo or operador.get('ativo') is False:
        raise HTTPException(401, 'Operador local invalido.')
    token = secrets.token_urlsafe(32)
    with _lock:
        agora = time.monotonic()
        for chave in list(_sessoes):
            if _sessoes[chave][1] <= agora:
                del _sessoes[chave]
        if len(_sessoes) >= 1024:
            raise HTTPException(429, 'Limite de sessoes locais atingido.')
        _sessoes[hashlib.sha256(token.encode()).digest()] = (codigo, agora + VALIDADE_SESSAO)
    return token


def operador_da_sessao(token):
    if not token or len(token) > 256:
        raise HTTPException(401, 'Entre novamente na estacao.')
    chave = hashlib.sha256(token.encode()).digest()
    with _lock:
        item = _sessoes.get(chave)
        if not item or item[1] <= time.monotonic():
            _sessoes.pop(chave, None)
            raise HTTPException(401, 'Entre novamente na estacao.')
    import acesso_local
    operador = acesso_local.validar(item[0])
    if not operador:
        with _lock:
            _sessoes.pop(chave, None)
        raise HTTPException(401, 'Seu acesso mudou; entre novamente.')
    return permissoes_efetivas(operador)


def revogar_sessao(token):
    if token:
        with _lock:
            _sessoes.pop(hashlib.sha256(token.encode()).digest(), None)


def autenticar(headers):
    token = headers.get('x-newprod-sessao')
    if token:
        return operador_da_sessao(token)
    # Compatibilidade com paineis anteriores: o codigo e validado no servidor,
    # nunca um perfil ou uma grade enviados pelo navegador.
    codigo = headers.get('x-operador-codigo')
    if codigo:
        import acesso_local
        operador = acesso_local.validar(codigo)
        if not operador:
            raise HTTPException(401, 'Operador local invalido.')
        return permissoes_efetivas(operador)
    authorization = headers.get('authorization') or ''
    if not authorization.lower().startswith('bearer '):
        raise HTTPException(401, 'Identifique o operador para esta operacao.')
    import acesso_api
    import db
    usuario = acesso_api._usuario_logado(authorization)
    uid = str(usuario.get('id') or '')
    if not uid or any(c not in '0123456789abcdefABCDEF-' for c in uid):
        raise HTTPException(401, 'Sessao invalida.')
    req = urllib.request.Request(
        f'{db.SUPABASE_URL}/functions/v1/painel/api/user/permissions/{uid}',
        headers={'Authorization': authorization, 'apikey': db.SUPABASE_KEY})
    try:
        with urllib.request.urlopen(req, timeout=10) as resposta:
            dados = json.loads(resposta.read())
    except urllib.error.HTTPError as erro:
        raise HTTPException(erro.code if erro.code in (401, 403) else 503,
                            'Nao foi possivel conferir as permissoes.') from None
    except (OSError, ValueError):
        raise HTTPException(503, 'Nao foi possivel conferir as permissoes.') from None
    grade = dados.get('permissions') if isinstance(dados, dict) else None
    if not isinstance(dados, dict) or not dados.get('ok') or not isinstance(grade, dict) or grade.get('user_id') != uid:
        raise HTTPException(403, 'Usuario sem permissoes configuradas.')
    return permissoes_efetivas({'uid': uid, 'role': grade.get('role'), 'permissoes': grade})


CATALOGOS_PUBLICOS = ('formatos', 'numeracoes', 'saidas', 'cores', 'modelos_imposicao',
                     'mapas_teatro', 'fontes', 'fonte', 'proxy')
PUBLICOS_EXATOS = {'/api/health', '/api/status', '/api/version', '/api/local/login/estado'}
PUBLICOS_EXATOS.update('/api/' + nome for nome in CATALOGOS_PUBLICOS)
CATALOGOS_COM_ID = {'formatos', 'numeracoes', 'saidas', 'cores', 'modelos_imposicao'}


def exige_identidade(metodo, caminho):
    if metodo == 'OPTIONS' or not caminho.startswith('/api/') or caminho.startswith('/api/acesso/'):
        return False
    partes = caminho.split('/')
    catalogo_por_id = len(partes) == 4 and partes[2] in CATALOGOS_COM_ID
    if metodo == 'GET' and (caminho in PUBLICOS_EXATOS or catalogo_por_id):
        return False
    return not (metodo == 'POST' and caminho == '/api/local/login')


def autorizar(operador, metodo, caminho):
    if caminho in ('/api/local/sessao', '/api/local/logout'):
        return
    if metodo == 'GET' and operador.get('uid') and caminho == '/api/user/permissions/' + operador['uid']:
        return
    permissoes = operador['permissoes']
    recurso = caminho.split('/')[2]
    escrita = metodo not in ('GET', 'HEAD', 'OPTIONS')
    sufixo = 'edit' if escrita else 'view'
    modulos = {'formatos': 'formatos', 'numeracoes': 'numeracao', 'saidas': 'saidas',
               'cores': 'cores', 'mapas_teatro': 'mapas', 'fontes': 'fontes',
               'modelos_imposicao': 'imposicao', 'os_itens': 'pedidos',
               'balanca': 'acabamento', 'peso-setores': 'acabamento',
               'setor-concluido': 'acabamento', 'expedicao': 'acabamento',
               'senha-liberacao': 'acabamento', 'printers': 'impressoras',
               'ppds': 'impressoras', 'icc': 'impressoras', 'print-config': 'impressoras',
               'bancos-pedido': 'pedidos', 'email': 'lista_arte'}
    if recurso in ('admin', 'acessos-locais', 'user', 'diag'):
        chaves = ['perm_admin_' + sufixo]
    elif recurso == 'pacotes-locais':
        # Copia e prioridade da estacao pertencem a producao; nao concedem
        # administracao, impressao nem alteracao de pedidos na nuvem.
        chaves = ['perm_producao_edit', 'perm_admin_edit'] if caminho.endswith('/controle-painel') else ['perm_pedidos_view']
    elif recurso == 'impose':
        chaves = ['perm_gerar_pdf']
    elif recurso == 'print' or recurso == 'hotfolder' and caminho.endswith('/drop'):
        chaves = ['perm_imprimir']
    elif recurso == 'hotfolder':
        chaves = ['perm_impressoras_' + sufixo]
    elif recurso == 'update':
        chaves = ['perm_admin_edit']
    elif recurso in ('propostas', 'ordens'):
        chaves = ['perm_' + m + '_view' for m in ('pedidos', 'producao', 'acabamento', 'lista_arte')]
        # As mutacoes de propostas sao tambem revalidadas pela Edge Function.
    elif recurso == 'fundo':
        chaves = ['perm_pedidos_edit']
    elif recurso == 'qr-ideal':
        chaves = ['perm_numeracao_view', 'perm_imposicao_view']
    elif caminho == '/api/email/config' and escrita:
        chaves = ['perm_admin_edit']
    elif recurso == 'bancos-pedido':
        chaves = ['perm_pedidos_' + ('view' if caminho.endswith('/consultar') else 'edit')]
    elif recurso in modulos:
        chaves = ['perm_' + modulos[recurso] + '_' + sufixo]
    else:
        chaves = ['perm_admin_edit' if escrita else 'perm_admin_view']
    if not any(permissoes.get(chave) is True for chave in chaves):
        raise HTTPException(403, 'Sem permissao para esta operacao.')
