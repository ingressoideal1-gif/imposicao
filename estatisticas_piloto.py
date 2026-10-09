"""Resumo para o painel da própria estação, sem credenciais ou fontes de arquivos."""
from datetime import datetime, timezone
import re
import shutil
import sys
import json
import math
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request, Response
from pacotes_locais import _sem_links, LimiteRecursoExcedido


def resumo(servico):
    modelos = []
    # Resumo de presença: uma conexão e uma visita por modelo, sem reabrir
    # SQLite nem verificar todas as revisões antigas para cada linha do painel.
    con = servico._db()
    try:
        coletas = {}
        for modelo, manifesto in con.execute('SELECT modelo, manifesto FROM coletas'):
            coletas.setdefault(modelo, []).append(json.loads(manifesto))
        presenca = {m:bool(servico.copias_presentes(m, _manifestos=ms)) for m, ms in coletas.items()}
        for modelo, revisao in con.execute('SELECT modelo, revisao FROM catalogo').fetchall():
            estado = servico.estado_modelo(modelo, revisao, _con=con, _copia_local_presente=presenca.get(modelo, False))
            modelos.append({'modelo': modelo, 'estado': estado['estado'],
                            'copia_local_presente': estado.get('copia_local_presente', False),
                            'conferencia_online_pendente': estado.get('conferencia_online_pendente', True)})
    finally:
        con.close()
    arquivos = tamanho = livre = None
    try:
        objetos = servico.local._pasta(servico.empresa) / 'objetos'
        _sem_links(objetos)
        arquivos = tamanho = 0
        if objetos.exists():
            for caminho in objetos.iterdir():
                if not re.fullmatch('[a-f0-9]{64}', caminho.name):
                    continue
                _sem_links(caminho)
                if caminho.is_file():
                    tamanho += caminho.stat().st_size
                    arquivos += 1
        livre = shutil.disk_usage(servico.raiz).free
    except (OSError, ValueError):
        arquivos = tamanho = livre = None
    ensaio = None
    try:
        caminho = servico.raiz / 'ensaios-impressos/resumo.json'
        _sem_links(caminho)
        if caminho.stat().st_size <= 65536:
            registro = json.loads(caminho.read_text(encoding='utf-8'))
            chaves = ('arquivos', 'bytes', 'download_segundos', 'leitura_segundos', 'falhas')
            if all(type(registro.get(k)) in (int, float) and math.isfinite(registro[k]) and registro[k] >= 0 for k in chaves):
                ensaio = {k:registro[k] for k in chaves}
    except (OSError, ValueError, TypeError):
        pass
    return {'empresa': servico.empresa, 'setor': servico.preparador.setor_prioritario,
            'preferenciais': servico.preferencias(),
            'modelos': modelos, 'fila': servico.preparador.resumo(),
            'coleta': dict(servico.coleta_autonoma.estado) if servico.coleta_autonoma else {},
            'estatisticas': {'arquivos_cache': arquivos, 'bytes_cache': tamanho, 'bytes_livres': livre,
                            'modelos_catalogados': len({m['modelo'] for m in modelos}),
                            'revisoes_com_falha': sum(m['estado'].startswith('falha_') for m in modelos)},
            'ensaio_impressos': ensaio,
            'medido_em': datetime.now(timezone.utc).isoformat(), 'execucao_offline': False}


def exigir_painel(request, *, escrita=False):
    from canais_newprod import PORTA
    origem = str(request.base_url).rstrip('/')
    if (not request.client or request.client.host not in ('127.0.0.1', '::1')
            or origem not in (f'http://127.0.0.1:{PORTA}', f'http://localhost:{PORTA}')
            or request.headers.get('sec-fetch-site') != 'same-origin'
            or request.headers.get('origin', '' if escrita else origem) != origem
            or escrita and request.headers.get('x-piloto-painel') != '1'):
        raise HTTPException(403, 'Operação disponível somente no painel desta estação.')


def criar_router_estatisticas(servico):
    router = APIRouter()
    from selecao_piloto import SelecaoPiloto
    from conferencia_piloto import ConferenciaIndisponivel
    from starlette.concurrency import run_in_threadpool
    selecao = SelecaoPiloto(servico)

    @router.get('/api/pacotes-locais/painel.js')
    def script():
        raiz = Path(getattr(sys, '_MEIPASS', Path(__file__).resolve().parent))
        codigo = (raiz / 'frontend/estatisticas-piloto.js').read_text(encoding='utf-8')
        codigo += '\n' + (raiz / 'frontend/selecao-piloto.js').read_text(encoding='utf-8')
        return Response(codigo,
                        media_type='application/javascript; charset=utf-8', headers={'Cache-Control':'no-store'})

    @router.get('/api/pacotes-locais/resumo-painel')
    def painel(request: Request, response: Response):
        exigir_painel(request)
        response.headers['Cache-Control'] = 'no-store'
        response.headers['Vary'] = 'Origin, Sec-Fetch-Site'
        return resumo(servico)

    @router.post('/api/pacotes-locais/controle-painel')
    async def controle(request: Request):
        exigir_painel(request, escrita=True)
        corpo = bytearray()
        async for parte in request.stream():
            corpo.extend(parte)
            if len(corpo) > 1024:
                raise HTTPException(413, 'Comando excede limite.')
        try:
            dados = json.loads(corpo)
            if not isinstance(dados, dict): raise ValueError()
            acao = dados.get('acao')
            if acao == 'preferir' and set(dados) == {'acao', 'pedido', 'marcado'}:
                servico.preferir(dados['pedido'], dados['marcado'])
            elif acao == 'abrir' and set(dados) == {'acao', 'pedido'}:
                servico.abrir_pedido(dados['pedido'])
            elif acao == 'iniciar' and set(dados) == {'acao'}:
                servico.iniciar_copia()
            elif acao == 'pausar' and set(dados) == {'acao'}:
                servico.pausar(True)
            else:
                raise ValueError('Comando inválido.')
        except (ValueError, TypeError):
            raise HTTPException(422, 'Comando inválido ou limite do piloto atingido.') from None
        return Response(json.dumps({'recebido': True}), media_type='application/json', headers={'Cache-Control':'no-store'})

    @router.post('/api/pacotes-locais/selecionar-painel')
    async def selecionar(request: Request):
        exigir_painel(request, escrita=True)
        corpo = bytearray()
        async for parte in request.stream():
            corpo.extend(parte)
            if len(corpo) > 1024:
                raise HTTPException(413, 'Seleção excede limite.')
        try:
            resultado = await run_in_threadpool(selecao.preparar, json.loads(corpo))
            return Response(json.dumps(resultado), media_type='application/json', headers={'Cache-Control':'no-store'})
        except ConferenciaIndisponivel:
            raise HTTPException(409, 'Modelo não conferido. Aguarde a preparação e selecione novamente.') from None
        except LimiteRecursoExcedido as erro:
            raise HTTPException(413, erro.detalhe) from None
        except (ValueError, KeyError, TypeError, StopIteration):
            raise HTTPException(422, 'Seleção ou pacote local incompatível.') from None
        except OSError:
            raise HTTPException(507, 'Não foi possível preparar os arquivos locais.') from None

    @router.post('/api/pacotes-locais/preparar-pedido-painel')
    async def preparar_pedido(request: Request):
        exigir_painel(request, escrita=True)
        corpo = bytearray()
        async for parte in request.stream():
            corpo.extend(parte)
            if len(corpo) > 65536:
                raise HTTPException(413, 'Pedido excede limite de preparação.')
        try:
            resultado = await run_in_threadpool(selecao.preparar_pedido, json.loads(corpo))
            return Response(json.dumps(resultado), media_type='application/json', headers={'Cache-Control':'no-store'})
        except ConferenciaIndisponivel:
            raise HTTPException(409, 'Pedido não conferido. Reabra e tente novamente.') from None
        except LimiteRecursoExcedido as erro:
            raise HTTPException(413, erro.detalhe) from None
        except (ValueError, KeyError, TypeError, StopIteration):
            raise HTTPException(422, 'Pedido ou pacote local incompatível.') from None
        except OSError:
            raise HTTPException(507, 'Não foi possível preparar os arquivos do pedido.') from None

    @router.get('/api/pacotes-locais/recurso-painel/{modelo}/{revisao}/{nome}')
    def recurso_painel(modelo: str, revisao: str, nome: str, request: Request):
        exigir_painel(request)
        try:
            dados = selecao.ler(modelo, revisao, nome)
        except (ValueError, OSError, KeyError):
            raise HTTPException(409, 'Arquivo local ausente ou inválido. Selecione novamente.') from None
        tipo = 'application/pdf' if dados.startswith(b'%PDF-') else 'application/octet-stream'
        return Response(dados, media_type=tipo, headers={'Cache-Control':'no-store', 'X-Piloto-Origem':'local', 'X-Content-Type-Options':'nosniff'})

    return router


class PainelPilotoMiddleware:
    """Acrescenta a leitura local sem substituir os arquivos do painel instalado."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if (scope['type'] != 'http' or scope.get('method') != 'GET'
                or scope.get('path') not in {'/app/', '/app/index.html', '/app/producao.html', '/index.html', '/producao.html'}):
            return await self.app(scope, receive, send)
        inicio = None
        partes = []
        scope = {**scope, 'headers': [(k,v) for k,v in scope.get('headers', [])
                                      if k.lower() not in (b'if-none-match', b'if-modified-since')]}
        async def interceptar(message):
            nonlocal inicio
            if message['type'] == 'http.response.start':
                headers = dict(message['headers'])
                if message['status'] == 200 and b'text/html' in headers.get(b'content-type', b'') and b'content-encoding' not in headers:
                    inicio = message
                    return
            elif message['type'] == 'http.response.body' and inicio is not None:
                partes.append(message.get('body', b''))
                if message.get('more_body', False): return
                corpo = b''.join(partes)
                tag = b'<script src="/api/pacotes-locais/painel.js"></script>'
                if tag not in corpo:
                    corpo = corpo.replace(b'</body>', tag + b'</body>')
                corpo = corpo.replace(b'<title>', b'<title>NewProd Piloto | ', 1)
                # Identidade visivel tambem antes do login e da carga do JS.
                # Este middleware e instalado somente no canal Piloto.
                if b'id="newprod-canal-piloto"' not in corpo:
                    selo = (b'<div id="newprod-canal-piloto" role="status" '
                            b'style="position:fixed;top:8px;left:50%;transform:translateX(-50%);'
                            b'z-index:2147483647;padding:6px 14px;border-radius:8px;'
                            b'background:#581c87;color:#fff;border:1px solid #c084fc;'
                            b'font:600 12px system-ui,sans-serif;pointer-events:none;'
                            b'white-space:nowrap">NewProd Piloto &middot; porta 9001</div>')
                    corpo = corpo.replace(b'</body>', selo + b'</body>', 1)
                inicio['headers'] = [(k,v) for k,v in inicio['headers'] if k not in (b'content-length', b'etag', b'cache-control')]
                inicio['headers'] += [(b'content-length', str(len(corpo)).encode()), (b'cache-control', b'no-store')]
                await send(inicio)
                await send({'type':'http.response.body','body':corpo})
                return
            await send(message)
        await self.app(scope, receive, interceptar)
