"""DPAPI CurrentUser: segredos locais pertencem a conta Windows da estacao.

Nao migra arquivos existentes nem carrega configuracao ao importar.
Fora do Windows, recusa a gravacao; nunca substitui criptografia por texto claro.
"""
import base64
import ctypes
import os
from ctypes import wintypes


class ProtecaoIndisponivel(RuntimeError):
    pass


class _Blob(ctypes.Structure):
    _fields_ = [('tamanho', wintypes.DWORD), ('dados', ctypes.POINTER(ctypes.c_ubyte))]


def _dpapi(conteudo, finalidade, proteger):
    if os.name != 'nt':
        raise ProtecaoIndisponivel('Armazenamento protegido exige a conta Windows da estacao.')
    entrada_buffer = ctypes.create_string_buffer(conteudo)
    entropia_buffer = ctypes.create_string_buffer(('IdealImposition/' + finalidade).encode('utf-8'))
    entrada = _Blob(len(conteudo), ctypes.cast(entrada_buffer, ctypes.POINTER(ctypes.c_ubyte)))
    entropia = _Blob(len(entropia_buffer.raw) - 1, ctypes.cast(entropia_buffer, ctypes.POINTER(ctypes.c_ubyte)))
    saida = _Blob()
    crypt32 = ctypes.WinDLL('crypt32', use_last_error=True)
    kernel32 = ctypes.WinDLL('kernel32', use_last_error=True)
    funcao = crypt32.CryptProtectData if proteger else crypt32.CryptUnprotectData
    funcao.argtypes = [ctypes.POINTER(_Blob), ctypes.c_void_p, ctypes.POINTER(_Blob),
                       ctypes.c_void_p, ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(_Blob)]
    funcao.restype = wintypes.BOOL
    kernel32.LocalFree.argtypes = [ctypes.c_void_p]
    kernel32.LocalFree.restype = ctypes.c_void_p
    if not funcao(ctypes.byref(entrada), None, ctypes.byref(entropia), None, None,
                  1, ctypes.byref(saida)):  # CRYPTPROTECT_UI_FORBIDDEN
        raise ProtecaoIndisponivel('Nao foi possivel proteger ou recuperar o segredo nesta conta Windows.')
    try:
        return ctypes.string_at(saida.dados, saida.tamanho)
    finally:
        kernel32.LocalFree(saida.dados)


def proteger_texto(texto, finalidade):
    return {'protecao': 'windows-dpapi-v1',
            'dados': base64.b64encode(_dpapi(texto.encode('utf-8'), finalidade, True)).decode('ascii')}


def recuperar_texto(envelope, finalidade):
    try:
        if not isinstance(envelope, dict) or envelope.get('protecao') != 'windows-dpapi-v1':
            raise ValueError()
        lacrado = base64.b64decode(envelope['dados'], validate=True)
        return _dpapi(lacrado, finalidade, False).decode('utf-8')
    except (ValueError, KeyError, UnicodeError, TypeError) as erro:
        raise ProtecaoIndisponivel('Configuracao protegida invalida; reconfigure na estacao.') from erro
