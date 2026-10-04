from fastapi import FastAPI
from fastapi.responses import HTMLResponse
from fastapi.testclient import TestClient
from estatisticas_piloto import criar_router_estatisticas, PainelPilotoMiddleware, resumo
from pacotes_api import ServicoPacotes
from test_pacotes_api import item, BYTES
from canais_newprod import PORTA


def test_cache_conta_hash_unico_sem_confundir_modelos(tmp_path):
    s=ServicoPacotes(tmp_path,host='test.invalid',empresa='teste')
    entrada=tmp_path/'arte.pdf'; entrada.write_bytes(BYTES)
    for modelo in ['1','2']:
        dados=item(); dados['manifesto']['modelo']=modelo
        s.cadastrar(dados)
        s.local.preparar(dados['manifesto'],{'frente':entrada})
    r=resumo(s)
    assert r['estatisticas']['arquivos_cache']==1
    assert r['estatisticas']['bytes_cache']==len(BYTES)
    assert r['estatisticas']['modelos_catalogados']==2
    assert not r['execucao_offline']
    assert 'fontes' not in str(r) and 'token' not in str(r)


def test_resumo_exige_origem_local_e_nao_expoe_chave(tmp_path):
    app=FastAPI();s=ServicoPacotes(tmp_path,host='test.invalid',empresa='teste')
    app.include_router(criar_router_estatisticas(s))
    with TestClient(app,base_url=f'http://127.0.0.1:{PORTA}',client=('127.0.0.1',55)) as c:
        js=c.get('/api/pacotes-locais/painel.js')
        assert 'charset=utf-8' in js.headers['content-type']
        path='/api/pacotes-locais/resumo-painel'
        assert c.get(path).status_code==403
        assert c.get(path,headers={'sec-fetch-site':'cross-site'}).status_code==403
        assert c.get(path,headers={'sec-fetch-site':'same-origin','origin':'https://fora.invalid'}).status_code==403
        assert c.get(path,headers={'sec-fetch-site':'same-origin','host':'fora.invalid'}).status_code==403
        r=c.get(path,headers={'sec-fetch-site':'same-origin'})
        assert r.status_code==200 and r.headers['cache-control']=='no-store'
        assert 'token' not in r.text and 'fontes' not in r.text


def test_injecao_preserva_html_atual_e_remove_validadores():
    app=FastAPI();app.add_middleware(PainelPilotoMiddleware)
    from fastapi import Request
    @app.get('/app/',response_class=HTMLResponse)
    def tela(request:Request):
        assert 'if-none-match' not in request.headers
        return '<html><body>painel atual</body></html>'
    @app.get('/outro',response_class=HTMLResponse)
    def outro():return '<body>outra tela</body>'
    with TestClient(app) as c:
        r=c.get('/app/',headers={'if-none-match':'anterior'})
        assert 'painel atual' in r.text and r.text.count('/api/pacotes-locais/painel.js')==1
        assert int(r.headers['content-length'])==len(r.content)
        assert r.headers['cache-control']=='no-store'
        assert 'painel.js' not in c.get('/outro').text


def test_controles_persistem_sem_internet_e_exigem_origem(tmp_path):
    from coleta_autonoma import ColetaAutonoma
    s=ServicoPacotes(tmp_path,host='test.invalid',empresa='teste')
    s.coleta_autonoma=ColetaAutonoma(s, None)
    app=FastAPI();app.include_router(criar_router_estatisticas(s))
    headers={'sec-fetch-site':'same-origin','origin':f'http://127.0.0.1:{PORTA}','x-piloto-painel':'1'}
    path='/api/pacotes-locais/controle-painel'
    with TestClient(app,base_url=f'http://127.0.0.1:{PORTA}',client=('127.0.0.1',55)) as c:
        corpo={'acao':'preferir','pedido':'22593','marcado':True}
        assert c.post(path,json=corpo).status_code==403
        assert c.post(path,json=corpo,headers={**headers,'origin':'https://fora.invalid'}).status_code==403
        assert c.post(path,json=corpo,headers={**headers,'sec-fetch-site':'cross-site'}).status_code==403
        assert c.post(path,json=corpo,headers=headers).status_code==200
        s2=ServicoPacotes(tmp_path,host='test.invalid',empresa='teste')
        assert s2.preferencias()==['22593']
        assert s.coleta_autonoma._solicitado.is_set()
        assert c.post(path,json={**corpo,'pedido':'1&x=2'},headers=headers).status_code==422
        assert c.post(path,content='x'*1025,headers=headers).status_code==413
        assert c.post(path,json={'acao':'pausar'},headers=headers).status_code==200
        assert s.preparador.resumo()['pausado']
        assert c.post(path,json={'acao':'iniciar'},headers=headers).status_code==200
        assert not s.preparador.resumo()['pausado'] and s._acordar.is_set()
        assert c.post(path,json={**corpo,'marcado':False},headers=headers).status_code==200
        assert s2.preferencias()==[]
        assert c.post(path,json={'acao':'abrir','pedido':'42'},headers=headers).status_code==200
        assert c.post(path,json={'acao':'abrir','pedido':'../42'},headers=headers).status_code==422
