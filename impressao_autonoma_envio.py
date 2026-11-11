"""Adapta os lotes locais para os servicos de impressao existentes."""
import hashlib
from pathlib import Path
import copy

import fitz


def validar(pedido, config):
    if not isinstance(pedido, dict) or not isinstance(pedido.get('options'), dict):
        raise ValueError('Destino de impressao ausente.')
    if not isinstance(pedido.get('printerName'), str) or not pedido['printerName'].strip():
        raise ValueError('Selecione a impressora.')
    options = pedido['options']
    if options.get('hot_folder_path') or options.get('impressao_reversa'):
        raise ValueError('Este fluxo requer impressora local e ordem normal.')
    if not config.refazer_capas and int(options.get('copies', 1)) != 1:
        raise ValueError('Use uma copia por envio para preservar a ordem dos blocos.')
    if pedido.get('face', 'both') not in ('both', 'front', 'back'):
        raise ValueError('Selecao de faces invalida.')
    if config.limite_paginas_envio != 10:
        raise ValueError('O agente requer lotes de ate dez paginas.')
    # Recusar antes do aceite; nunca cair em mock silencioso de outra plataforma.
    import print_service
    if not print_service.HAS_WIN32:
        raise ValueError('Impressao autonoma requer Windows com spool disponivel.')


def preparar_pdf(arquivo, pedido, modo):
    path = Path(arquivo['path'])
    face = pedido.get('face', 'both')
    capa = arquivo['type'] in ('capa', 'contracapa')
    with fitz.open(path) as pdf:
        if not 0 < len(pdf) <= 10:
            raise ValueError('Lote fora do limite de dez paginas.')
        if pedido.get('rotacionar_pares'):
            for n in range(1, len(pdf), 2):
                pdf[n].set_rotation((pdf[n].rotation + 180) % 360)
        if face != 'both' and not capa:
            if modo == 'front':
                if face == 'back':
                    raise ValueError('O trabalho nao possui verso.')
            else:
                if len(pdf) % 2:
                    raise ValueError('Miolo sem pares completos de frente e verso.')
                # select() reconstrui o catalogo e remove OutputIntents. Remover
                # as faces no documento original preserva o perfil ICC do PDF.
                paridade = 1 if face == 'back' else 0
                for n in range(len(pdf) - 1, -1, -1):
                    if n % 2 != paridade:
                        pdf.delete_page(n)
        paginas = len(pdf)
        if pedido.get('rotacionar_pares') or face != 'both' and not capa:
            path = path.with_name(path.stem + '_faces.pdf')
            pdf.save(path)
    return path, paginas


def enviar(arquivo, pedido, modo, envio, numero):
    path, paginas = preparar_pdf(arquivo, pedido, modo)
    options = copy.deepcopy(pedido['options'])
    capa = arquivo['type'] in ('capa', 'contracapa')
    if options.get('tray_capa') and options.get('tray_miolo'):
        options['tray'] = options['tray_capa'] if capa else options['tray_miolo']
    if pedido.get('face', 'both') != 'both':
        options['duplex'] = 1
    contexto = copy.deepcopy(pedido.get('historico_contexto') or {})
    contexto['tipo'] = arquivo['type'] if capa else 'miolo'
    options.update(gestao_envio_id=envio, historico_contexto=contexto)
    with path.open('rb') as stream:
        options['integridade_sha256'] = hashlib.file_digest(stream, 'sha256').hexdigest()
    if pedido.get('experimental'):
        import print_experimental
        if options.get('modo') == 'pdf_raw':
            options = {k: v for k, v in options.items() if k in (
                'experimental', 'modo', 'raw_confirmado', 'perfil_driver', 'copies',
                'integridade_sha256', 'gestao_envio_id', 'historico_contexto')}
        print_experimental.enviar(pedido['printerName'], str(path), options)
    else:
        import print_service
        ok, _ = print_service.send_print_job_windows(pedido['printerName'], str(path), options,
                                                     job_title=f'{numero:05d}_{arquivo["name"]}')
        if not ok:
            raise RuntimeError('Envio nao confirmado pelo servico de impressao.')
    return paginas
