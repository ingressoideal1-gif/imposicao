"""Perfil generico obtido da fila Windows; nenhuma escrita no driver ou rede.

O driver ja persiste a configuracao por PC/fila. Nao duplicamos essa fonte em
um JSON que envelhece nem inferimos suporte PDF/JDF a partir da marca.
"""
import hashlib
import json
import os
import socket

DC_DRIVER = 11  # wingdi.h: versao declarada pelo driver


def _assinatura(dados):
    return hashlib.sha256(json.dumps(dados, sort_keys=True, ensure_ascii=True).encode()).hexdigest()


def _identidade(api, printer_name, estacao):
    handle = api.OpenPrinter(printer_name)
    try:
        info = api.GetPrinter(handle, 2)
        versao = api.DeviceCapabilities(printer_name, info['pPortName'], DC_DRIVER)
        if type(versao) is not int or versao < 0:
            raise ValueError('Versao do driver indisponivel.')
        return {'estacao': estacao.upper(), 'impressora': printer_name,
                'driver': info['pDriverName'], 'porta': info['pPortName'],
                'versao_driver': versao}
    finally:
        api.ClosePrinter(handle)


def _windows():
    try:
        import win32print
        import win32con
    except ImportError as error:
        raise ValueError('A consulta do destino requer o driver Windows.') from error
    return win32print, win32con


def _nome(printer_name):
    if not isinstance(printer_name, str) or not printer_name.strip() or '\x00' in printer_name:
        raise ValueError('Selecione uma impressora.')


def consultar(printer_name, *, api=None, constantes=None, estacao=None):
    _nome(printer_name)
    if api is None:
        api, constantes = _windows()
    estacao = estacao or os.environ.get('COMPUTERNAME') or socket.gethostname()
    try:
        identidade = _identidade(api, printer_name, estacao)
        def cap(nome):
            return api.DeviceCapabilities(printer_name, identidade['porta'], getattr(constantes, nome))
        def lista(ids, nomes):
            codigos, rotulos = cap(ids), cap(nomes)
            if not isinstance(codigos, (tuple, list)) or not isinstance(rotulos, (tuple, list)) or len(codigos) != len(rotulos):
                raise ValueError('O driver nao informou as opcoes completas.')
            return [{'id': int(i), 'name': str(n).rstrip('\x00 ')} for i, n in zip(codigos, rotulos)]
        bandejas = lista('DC_BINS', 'DC_BINNAMES')
        papeis = lista('DC_PAPERS', 'DC_PAPERNAMES')
        duplex, copias = cap('DC_DUPLEX'), cap('DC_COPIES')
        if duplex not in (0, 1) or type(copias) is not int or copias < 1:
            raise ValueError('O driver nao confirmou duplex/copias.')
        return {'schema': 1, 'estacao': identidade['estacao'], 'impressora': printer_name,
                'driver': identidade['driver'], 'assinatura': _assinatura(identidade),
                'bandejas': bandejas, 'papeis': papeis,
                'duplex': [1, 2, 3] if duplex == 1 else [1], 'max_copias': copias,
                'opcoes_pdf_raw': False, 'trabalho_unico_misto': False}
    except Exception as error:
        raise ValueError('Nao foi possivel consultar o perfil desta impressora. Confira o driver e a fila.') from error


def validar_opcoes(perfil, options):
    if not isinstance(options, dict):
        raise ValueError('Configuracao do modelo invalida.')
    if options.get('modo') not in ('gdi_atual', 'experimental_gdi', 'pdf_raw'):
        raise ValueError('Selecione a saida experimental.')
    if options['modo'] == 'pdf_raw':
        return  # Configuracoes Windows nao descrevem o preset do RIP.
    for campo, disponiveis in [('paper_size', {p['id'] for p in perfil['papeis']}),
                               ('tray', {p['id'] for p in perfil['bandejas']}),
                               ('tray_capa', {p['id'] for p in perfil['bandejas']}),
                               ('tray_miolo', {p['id'] for p in perfil['bandejas']})]:
        valor = options.get(campo)
        if campo == 'tray' and options.get('tray_capa') and options.get('tray_miolo'):
            continue  # O envio atual usa as duas bandejas, nao o controle simples oculto.
        if campo in ('tray_capa', 'tray_miolo') and valor is None:
            continue
        if type(valor) is not int or valor not in disponiveis:
            raise ValueError('Opcao do modelo indisponivel nesta impressora: ' + campo)
    if type(options.get('duplex')) is not int or options['duplex'] not in perfil['duplex']:
        raise ValueError('Duplex do modelo indisponivel nesta impressora.')
    if type(options.get('copies')) is not int or not 1 <= options['copies'] <= min(999, perfil['max_copias']):
        raise ValueError('Quantidade de copias indisponivel nesta impressora.')


def conferir_identidade(printer_name, assinatura, *, api=None, estacao=None):
    """Reconsulta leve antes do spool; opcoes GDI ainda passam pelo DEVMODE."""
    _nome(printer_name)
    if not isinstance(assinatura, str) or len(assinatura) != 64:
        raise ValueError('Perfil de impressora invalido. Reabra o teste.')
    if api is None:
        api, _ = _windows()
    estacao = estacao or os.environ.get('COMPUTERNAME') or socket.gethostname()
    try:
        atual = _assinatura(_identidade(api, printer_name, estacao))
    except Exception as error:
        raise ValueError('Nao foi possivel conferir a impressora antes do envio.') from error
    if assinatura != atual:
        raise ValueError('A fila ou o driver mudou. Selecione a impressora novamente antes do teste.')
