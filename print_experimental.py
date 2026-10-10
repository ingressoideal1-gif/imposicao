"""Tres saidas de ensaio isoladas: nunca tenta outro motor automaticamente."""
import hashlib
import io
import math
import threading
import time
import uuid

import fitz
from PIL import Image, ImageCms, ImageWin

MAX_BYTES = None  # sem teto de arquivo no ensaio
MAX_PAGES = None
MAX_PIXELS = 100_000_000
MAX_PIXELS_ATUAL = 400_000_000  # permite A3/SRA3 a 1200 DPI para comparacao
MODOS = ('gdi_atual', 'experimental_gdi', 'pdf_raw')
_lock = threading.Lock()


def validar(pdf_path, options):
    """Preflight local, antes de abrir impressora ou criar qualquer trabalho."""
    if not isinstance(options, dict) or options.get('experimental') is not True:
        raise ValueError('Selecione explicitamente o teste experimental.')
    modo = options.get('modo', 'experimental_gdi')  # cliente experimental anterior
    if modo not in MODOS:
        raise ValueError('Modo de teste desconhecido.')
    if modo == 'pdf_raw' and options.get('raw_confirmado') is not True:
        raise ValueError('Confirme suporte a PDF nativo e preset do RIP com as copias desejadas e escala 100%.')
    if modo == 'pdf_raw':
        if any(field in options for field in ('paper_size', 'tray', 'duplex', 'color', 'orientation')):
            raise ValueError('PDF direto usa as opcoes do RIP, nao as opcoes do driver Windows.')
        dpi = None
    elif modo == 'gdi_atual':
        dpi = None  # lido do DC real antes de iniciar o trabalho
    else:
        dpi = options.get('dpi')
    if modo == 'experimental_gdi' and (type(dpi) is not int or dpi not in (300, 600)):
        raise ValueError('O teste aceita somente 300 ou 600 DPI.')
    if type(options.get('copies')) is not int or not 1 <= options['copies'] <= 999:
        raise ValueError('Quantidade de copias invalida.')
    for field, allowed in [('duplex', (1, 2, 3)), ('orientation', (1, 2)), ('color', (1, 2))]:
        if modo == 'pdf_raw':
            break
        if type(options.get(field)) is not int or options[field] not in allowed:
            raise ValueError('Opcao invalida: ' + field)
    for field in ('paper_size', 'tray'):
        if modo == 'pdf_raw':
            break
        if type(options.get(field)) is not int or not 1 <= options[field] <= 32767:
            raise ValueError('Opcao invalida: ' + field)
    try:
        uuid.UUID(options['gestao_envio_id'])
    except (KeyError, ValueError, TypeError, AttributeError):
        raise ValueError('Identificador de teste invalido.') from None
    with open(pdf_path, 'rb') as source:
        digest = hashlib.file_digest(source, 'sha256').hexdigest()
        size = source.tell()
    if options.get('integridade_sha256') != digest:
        raise ValueError('O PDF recebido diverge do arquivo selecionado.')
    with fitz.open(pdf_path) as doc:
        if doc.needs_pass or len(doc) < 1:
            raise ValueError('Use um PDF sem senha, com pelo menos uma pagina.')
        for page in doc:
            pixels = math.ceil(page.rect.width * (dpi or 72) / 72) * math.ceil(page.rect.height * (dpi or 72) / 72)
            if dpi and pixels > MAX_PIXELS:
                raise ValueError('Folha muito grande para esta resolucao experimental.')
        return {'pdf_bytes': size, 'paginas': len(doc), 'dpi': dpi, 'modo': modo}


def enviar(printer_name, pdf_path, options):
    """Um teste, um ID persistido, sem fallback e sem alterar status comercial."""
    metrics = validar(pdf_path, options)
    import print_service as service
    import gestao_estacoes as gestao
    if not service.HAS_WIN32 or (metrics['modo'] != 'pdf_raw' and not service.HAS_WIN32UI):
        raise ValueError('O teste requer o driver Windows e win32ui; nao ha envio simulado.')
    if gestao._thread is None:
        raise ValueError('Inicie o agente completo para registrar e proteger o teste contra duplicidade.')
    if not _lock.acquire(blocking=False):
        raise ValueError('Ja existe um teste experimental em andamento nesta estacao.')
    try:
        if 'perfil_driver' in options:
            from impressao_destinos import conferir_identidade
            conferir_identidade(printer_name, options['perfil_driver'])
        with gestao.acompanhar_envio(printer_name, 'experimental_' + metrics['modo'] if metrics['modo'] != 'experimental_gdi' else 'experimental_gdi',
                                    options['integridade_sha256'], options['gestao_envio_id'],
                                    contexto=options.get('historico_contexto')) as ident:
            render = _pdf_raw if metrics['modo'] == 'pdf_raw' else _renderizar
            result = render(service, gestao, printer_name, pdf_path, options, metrics)
            gestao.historico().transicao(ident, 'enviado')
            result['teste_id'] = options['gestao_envio_id']
            return result
    except gestao.EnvioRepetido:
        raise ValueError('Este teste ja foi registrado. Confira a fila antes de iniciar outro teste.') from None
    finally:
        _lock.release()


def _pdf_raw(service, gestao, printer_name, pdf_path, options, metrics):
    """PDF intacto; nenhum SetPrinter/DEVMODE/PJL ou conversao de cor."""
    started = time.perf_counter()
    with open(pdf_path, 'rb') as source:
        if hashlib.file_digest(source, 'sha256').hexdigest() != options['integridade_sha256']:
            raise ValueError('O PDF mudou depois da conferencia.')
    printer = service.win32print.OpenPrinter(printer_name)
    doc_started = False
    try:
        title = '[TESTE PDF RAW] ' + options['gestao_envio_id'][:8]
        spool_id = service.win32print.StartDocPrinter(printer, 1, (title, None, 'RAW'))
        doc_started = True
        gestao.spool_iniciado(spool_id)
        service.win32print.StartPagePrinter(printer)
        offset = 0
        with open(pdf_path, 'rb') as source:
            while chunk := source.read(1024 * 1024):
                consumed = 0
                while consumed < len(chunk):
                    written = service.win32print.WritePrinter(printer, chunk[consumed:])
                    if type(written) is not int or not 0 < written <= len(chunk) - consumed:
                        raise OSError('O spool nao confirmou a escrita do PDF.')
                    consumed += written
                    offset += written
        service.win32print.EndPagePrinter(printer)
        service.win32print.EndDocPrinter(printer)
        doc_started = False
        return dict(metrics, spool_id=spool_id, estado='enviado', raw_bytes=offset,
                    envio_seconds=round(time.perf_counter() - started, 3))
    finally:
        try:
            if doc_started:
                service.win32print.AbortPrinter(printer)
        finally:
            service.win32print.ClosePrinter(printer)


def _renderizar(service, gestao, printer_name, pdf_path, options, metrics, *, preflight=False, lote=None):
    started = time.perf_counter()
    # Mesmo DEVMODE por trabalho e mesma geometria do envio atual. Nao usa SetPrinter.
    devmode = service._apply_devmode_options(printer_name, options)
    if devmode is None:
        raise ValueError('O driver nao forneceu as configuracoes; nenhum teste foi enviado.')
    for field, attribute in [('copies', 'Copies'), ('paper_size', 'PaperSize'),
                             ('tray', 'DefaultSource'), ('duplex', 'Duplex'),
                             ('color', 'Color'), ('orientation', 'Orientation')]:
        if getattr(devmode, attribute, None) != options[field]:
            raise ValueError('O driver nao confirmou a opcao %s; nenhum teste foi enviado.' % field)
    cor_cfg, aviso = service.color_profiles.resolver_config(printer_name)
    transform = None
    if cor_cfg and cor_cfg.get('path'):
        # O modo experimental falha ANTES do envio se nao puder aplicar a cor pedida.
        transform = service.color_profiles.transform_para_gdi(cor_cfg)
    if aviso:
        raise ValueError('Confira o perfil de cor antes do teste: ' + aviso)
    ajustes = (cor_cfg or {}).get('ajustes')
    if lote is not None and lote.get('hdc') is not None:
        hdc = lote['hdc']
        if service.win32gui.ResetDC(hdc, devmode) != hdc:
            raise ValueError('O driver recusou a troca de configuracao no trabalho unico.')
        dc = lote['dc']
    else:
        hdc = service.win32gui.CreateDC('WINSPOOL', printer_name, devmode)
        dc = None
    doc_started = False
    spool_id = None
    raster_bytes = 0
    render_seconds = 0.0
    try:
        if dc is None:
            dc = service.win32ui.CreateDCFromHandle(hdc)
        if lote is not None:
            lote.update(hdc=hdc, dc=dc)
        caps = {name: dc.GetDeviceCaps(getattr(service.win32con, name)) for name in (
            'LOGPIXELSX', 'LOGPIXELSY', 'HORZRES', 'VERTRES',
            'PHYSICALWIDTH', 'PHYSICALHEIGHT', 'PHYSICALOFFSETX', 'PHYSICALOFFSETY')}
        atual = metrics['modo'] == 'gdi_atual'
        dpi = max(caps['LOGPIXELSX'], caps['LOGPIXELSY'], 300) if atual else options['dpi']
        metrics = dict(metrics, dpi=dpi)
        if any(caps[key] <= 0 for key in ('LOGPIXELSX', 'LOGPIXELSY', 'PHYSICALWIDTH', 'PHYSICALHEIGHT')):
            raise ValueError('O driver nao informou a resolucao ou tamanho fisico do papel.')
        with fitz.open(pdf_path) as doc:
            rectangles = []
            for page in doc:
                pixels = math.ceil(page.rect.width * dpi / 72) * math.ceil(page.rect.height * dpi / 72)
                if pixels > (MAX_PIXELS_ATUAL if atual else MAX_PIXELS):
                    raise ValueError('Folha muito grande para esta resolucao experimental.')
                rect = service.retangulo_da_folha(
                    page.rect.width, page.rect.height, caps['LOGPIXELSX'], caps['LOGPIXELSY'],
                    caps['HORZRES'], caps['VERTRES'], caps['PHYSICALWIDTH'], caps['PHYSICALHEIGHT'],
                    caps['PHYSICALOFFSETX'], caps['PHYSICALOFFSETY'])
                if not rect[4]:
                    raise ValueError('O PDF excede o papel selecionado. O teste nao ajusta a escala.')
                rectangles.append(rect)
            if preflight:
                return metrics
            title = '[TESTE %s %d DPI] %s' % ('GDI ATUAL' if atual else 'GDI FIXO', dpi, options['gestao_envio_id'][:8])
            if lote is None or not lote.get('started'):
                spool_id = service.win32print.StartDoc(hdc, (title, None, None, 0))
                doc_started = True
                if lote is not None:
                    lote.update(started=True, spool_id=spool_id)
                gestao.spool_iniciado(spool_id)
            else:
                spool_id = lote['spool_id']
            for page, (dx, dy, width, height, _) in zip(doc, rectangles):
                before = time.perf_counter()
                if atual:
                    # Mesma rasterizacao, DPI e passagem por PNG do GDI de producao.
                    pix = page.get_pixmap(dpi=dpi)
                    with Image.open(io.BytesIO(pix.tobytes('png'))) as png:
                        img = png.copy()
                else:
                    pix = page.get_pixmap(dpi=dpi, colorspace=fitz.csRGB, alpha=False)
                    img = Image.frombytes('RGB', (pix.width, pix.height), pix.samples)
                raster_bytes += pix.width * pix.height * 3
                del pix
                try:
                    if ajustes:
                        adjusted = service.color_profiles.aplicar_ajustes(img, ajustes)
                        if adjusted is not img:
                            img.close()
                        img = adjusted
                    if transform is not None:
                        adjusted = ImageCms.applyTransform(img, transform)
                        img.close()
                        img = adjusted
                    render_seconds += time.perf_counter() - before
                    dc.StartPage()
                    dib = ImageWin.Dib(img)
                    dib.draw(hdc, (dx, dy, dx + width, dy + height))
                    dc.EndPage()
                    del dib
                finally:
                    img.close()
            if lote is not None and options['duplex'] != 1 and len(doc) % 2:
                # Completa o verso da ultima folha antes da proxima capa/trecho.
                dc.StartPage()
                dc.EndPage()
            if lote is None:
                dc.EndDoc()
                doc_started = False
        result = dict(metrics, spool_id=spool_id, estado='enviado',
                      raster_rgb_bytes=raster_bytes,
                      driver_dpi=[caps['LOGPIXELSX'], caps['LOGPIXELSY']],
                      render_seconds=round(render_seconds, 3),
                      envio_seconds=round(time.perf_counter() - started, 3))
        # O volume RGB nao e tamanho de spool, nem o tempo mede RIP/papel fisico.
        print('[print][EXPERIMENTAL]', result)
        return result
    finally:
        if lote is not None and lote.get('dc') is dc and dc is not None:
            pass  # O dono do lote encerra/aborta e libera o unico DC.
        elif dc is not None:
            try:
                if doc_started:
                    dc.AbortDoc()  # nunca EndDoc para um trabalho parcialmente preparado
            finally:
                dc.DeleteDC()
        else:
            service.win32gui.DeleteDC(hdc)
