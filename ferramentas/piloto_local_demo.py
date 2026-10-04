"""Interface de ensaio isolado, sem banco real, internet ou impressora.

Serve só em 127.0.0.1; gera dados sintéticos e token efêmero em memória.
Não importa app.py e não inicia o worker operacional. Ctrl+C encerra o ensaio.
"""
from contextlib import asynccontextmanager
import io
import hashlib
import json
from pathlib import Path
import secrets
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import fitz
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, Response
import uvicorn
from pacotes_api import ServicoPacotes, criar_router


def criar_demo(raiz):
    token = secrets.token_urlsafe(32)
    rede = {'online': True}
    with fitz.open() as pdf:
        p = pdf.new_page(width=283.46, height=141.73)
        p.insert_text((20, 30), 'PILOTO SINTETICO - NAO IMPRIMIR')
        conteudo = pdf.tobytes()
    def abrir(*args, **kwargs):
        if not rede['online']:
            raise OSError('Internet indisponivel no simulador')
        return io.BytesIO(conteudo)
    servico = ServicoPacotes(raiz, host='simulacao.invalid', empresa='piloto-sintetico', abrir=abrir)
    manifesto = {'schema': 1, 'empresa': 'piloto-sintetico', 'modelo': '100', 'revisao': 'r1',
                 'configuracao': {}, 'arquivos': {'frente': {
                     'sha256': hashlib.sha256(conteudo).hexdigest(), 'bytes': len(conteudo)}, 'verso': None}}
    servico.cadastrar({'manifesto': manifesto, 'fontes': {
        'frente': 'https://simulacao.invalid/storage/v1/object/public/artes/prova.pdf'}, 'setor': 'laser'})
    @asynccontextmanager
    async def lifespan(app):
        servico.iniciar()
        try:
            yield
        finally:
            servico.encerrar()
    app = FastAPI(lifespan=lifespan)
    app.include_router(criar_router(servico, token))
    @app.middleware('http')
    async def limitar(request, call_next):
        if request.url.hostname not in ('127.0.0.1', 'localhost'):
            return Response(status_code=403)
        resposta = await call_next(request)
        resposta.headers['Cache-Control'] = 'no-store'
        resposta.headers['X-Frame-Options'] = 'DENY'
        resposta.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'"
        return resposta
    @app.get('/pacotes-locais.js')
    def script():
        return Response((Path(__file__).resolve().parents[1] / 'frontend/pacotes-locais.js').read_text(encoding='utf-8'),
                        media_type='application/javascript')
    @app.post('/api/demo/rede/{modo}')
    def conexao(modo: str, request: Request):
        if not secrets.compare_digest(request.headers.get('x-newprod-piloto', ''), token):
            raise HTTPException(401)
        if modo not in ('online', 'offline'):
            raise HTTPException(400)
        rede['online'] = modo == 'online'
        return rede
    @app.get('/', response_class=HTMLResponse)
    def inicio():
        return '''<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Piloto local — Laser</title>
<style>body{font:16px system-ui;background:#f1f5f9;color:#102036;margin:48px auto;max-width:960px;padding:24px}
h1{font-size:30px}article{background:white;border:1px solid #d8e0e9;border-radius:14px;padding:24px;margin:22px 0}
table{width:100%;text-align:left;border-collapse:collapse}td,th{padding:18px 10px;border-bottom:1px solid #ddd}
button{padding:12px 18px;background:#143c60;color:white;border:0;border-radius:7px;cursor:pointer;margin-right:8px}
.aviso{color:#854d0e;background:#fef3c7;padding:14px;border-radius:8px}small{color:#526172}</style>
<p>PC-JR-HOME · SETOR LASER</p><h1>Preparação local de produção</h1>
<p class="aviso">Piloto isolado com dados sintéticos. Nenhuma impressora ou pedido real é utilizado.</p>
<article><h2>Carteira local</h2><table><thead><tr><th>Modelo</th><th>Revisão</th><th>Disponibilidade</th></tr></thead>
<tbody><tr><td>100 — Prova sintética</td><td>r1</td><td data-pacote-modelo="100" data-pacote-revisao="r1"></td></tr></tbody></table>
<p id="conexao">Simulador de origem: online</p><button onclick="rede('offline')">Simular queda da internet</button>
<button onclick="rede('online')">Simular reconexão</button><button onclick="conferir()">Conferir recurso local</button>
<p id="resultado"></p><small>O selo comprova integridade local. Autorização de impressão offline permanece desativada.</small></article>
<article><h2>Recuperação</h2><p>Fechar o ensaio não modifica o NewProd instalado. Não há envio físico nem alteração na nuvem.</p></article>
<script src="/pacotes-locais.js"></script><script>
const chave = ''' + json.dumps(token) + ''';
const headers = {'X-NewProd-Piloto': chave};
PacotesLocais.iniciar({base:location.origin, token:chave});
async function rede(modo){const r=await fetch('/api/demo/rede/'+modo,{method:'POST',headers});
if(r.ok) document.getElementById('conexao').textContent='Simulador de origem: '+modo;}
async function conferir(){const r=await fetch('/api/pacotes-locais/recurso/100/r1/frente',{headers});
document.getElementById('resultado').textContent=r.ok?'Recurso local validado: '+(await r.arrayBuffer()).byteLength+' bytes. Nenhuma impressão enviada.':'Recurso indisponível.';}
</script></html>'''
    return app


if __name__ == '__main__':
    with tempfile.TemporaryDirectory(prefix='newprod-piloto-demo-') as raiz:
        uvicorn.run(criar_demo(raiz), host='127.0.0.1', port=9011, log_level='warning', access_log=False)
