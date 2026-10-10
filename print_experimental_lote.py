"""Um trabalho GDI por sequencia completa, sem misturar modelos no motor PDF."""
import hashlib
import json

import print_experimental as experimental
from impressao_plano import Trecho, planejar


def enviar(printer_name, paths, options):
    import print_service as service
    import gestao_estacoes as gestao
    import impressao_destinos

    if not isinstance(options, dict) or options.get('modo') not in ('gdi_atual', 'experimental_gdi'):
        raise ValueError('Trabalho unico disponivel apenas nos dois modos GDI. PDF RAW nao aceita ticket generico.')
    partes = options.get('partes')
    if not isinstance(partes, list) or not partes or len(partes) != len(paths):
        raise ValueError('A sequencia recebida esta incompleta.')
    if not service.HAS_WIN32 or not service.HAS_WIN32UI or gestao._thread is None:
        raise ValueError('Inicie o agente Windows completo antes do teste.')
    if not experimental._lock.acquire(blocking=False):
        raise ValueError('Ja existe um teste experimental em andamento nesta estacao.')
    lote = {}
    try:
        impressao_destinos.conferir_identidade(printer_name, options.get('perfil_driver'))
        preparados = []
        trechos = []
        hashes = []
        for path, parte in zip(paths, partes):
            if not isinstance(parte, dict):
                raise ValueError('Trecho invalido.')
            item = dict(options, tray=parte.get('tray'), duplex=parte.get('duplex'),
                        integridade_sha256=parte.get('sha256'))
            metrics = experimental.validar(path, item)
            # O driver recebe uma copia; o laço externo repete o trabalho completo.
            item['copies'] = 1
            experimental._renderizar(service, gestao, printer_name, path, item, metrics, preflight=True)
            preparados.append((path, item, metrics))
            trechos.append(Trecho(str(len(trechos) + 1), metrics['paginas'], str(item['tray']),
                                 {1: 'simplex', 2: 'duplex_long_edge', 3: 'duplex_short_edge'}[item['duplex']]))
            hashes.append({'sha256': item['integridade_sha256'], 'tray': item['tray'], 'duplex': item['duplex']})
        plano = planejar(trechos, copias=options['copies'])
        digest = hashlib.sha256(json.dumps({'partes': hashes, 'copias': options['copies'],
            'modo': options['modo'], 'paper_size': options['paper_size'], 'dpi': options.get('dpi'),
            'color': options['color'], 'orientation': options['orientation']}, sort_keys=True).encode()).hexdigest()
        # Nenhum StartDoc ocorre antes de conferir TODOS os PDFs e DEVMODEs.
        with gestao.acompanhar_envio(printer_name, 'experimental_lote_' + options['modo'],
                                    digest, options['gestao_envio_id'], contexto=options.get('historico_contexto')) as ident:
            raster_bytes = 0
            for _ in range(options['copies']):
                for path, item, metrics in preparados:
                    result = experimental._renderizar(service, gestao, printer_name, path, item, metrics, lote=lote)
                    raster_bytes += result['raster_rgb_bytes']
            lote['dc'].EndDoc()
            lote['started'] = False
            gestao.historico().transicao(ident, 'enviado')
        return {'estado': 'enviado', 'spool_id': lote['spool_id'], 'teste_id': options['gestao_envio_id'],
                'arquivos': len(paths), 'folhas': plano['folhas_por_copia'] * options['copies'],
                'raster_rgb_bytes': raster_bytes}
    except gestao.EnvioRepetido:
        raise ValueError('Este teste ja foi registrado. Confira a fila antes de iniciar outro teste.') from None
    finally:
        try:
            if lote.get('dc') is not None:
                try:
                    if lote.get('started'):
                        lote['dc'].AbortDoc()
                finally:
                    lote['dc'].DeleteDC()
        finally:
            experimental._lock.release()
