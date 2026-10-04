from contextlib import contextmanager
import hashlib
import io
import json
import time

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from pacotes_api import ServicoPacotes, criar_router, configurar_piloto
from pacotes_download import validar_url, SemRedirecionamento

TOKEN = 'token-sintetico-exclusivo-dos-testes-00001'
BYTES = b'%PDF-1.4 sintetico; teste de transporte, nao renderizacao'


def item():
    return {'manifesto': {'schema': 1, 'empresa': 'teste', 'modelo': '1', 'revisao': 'r1',
                         'configuracao': {}, 'arquivos': {'frente': {
                             'sha256': hashlib.sha256(BYTES).hexdigest(), 'bytes': len(BYTES)}, 'verso': None}},
            'fontes': {'frente': 'https://test.invalid/storage/v1/object/public/artes/a.pdf'},
            'setor': 'laser', 'prazo': '2026-09-26T10:00:00-03:00'}


def test_catalogo_operacional_ultrapassa_limite_antigo_e_mantem_teto(tmp_path):
    s=ServicoPacotes(tmp_path/'normal',host='test.invalid',empresa='teste')
    for id_modelo in range(1,130):
        entrada=item();entrada['manifesto']['modelo']=str(id_modelo)
        s.cadastrar(entrada)
    assert len(s.catalogo())==129
    limitado=ServicoPacotes(tmp_path/'limitado',host='test.invalid',empresa='teste',limite_catalogo=2)
    for id_modelo in range(1,3):
        entrada=item();entrada['manifesto']['modelo']=str(id_modelo)
        limitado.cadastrar(entrada)
    entrada=item();entrada['manifesto']['modelo']='3'
    with pytest.raises(ValueError,match='Limite'):
        limitado.cadastrar(entrada)
    assert len(limitado.catalogo())==2


@contextmanager
def ambiente(tmp_path, abrir=None, ocupado=lambda: False):
    s = ServicoPacotes(tmp_path, host='test.invalid', empresa='teste',
                       abrir=abrir or (lambda *a, **k: io.BytesIO(BYTES)), ocupado=ocupado)
    app = FastAPI()
    app.include_router(criar_router(s, TOKEN))
    s.iniciar()
    try:
        with TestClient(app, client=('127.0.0.1', 50000)) as client:
            yield s, client
    finally:
        assert s.encerrar()


def pronto(client):
    fim = time.monotonic() + 3
    while time.monotonic() < fim:
        resposta = client.get('/api/pacotes-locais/estado', headers={'X-NewProd-Piloto': TOKEN})
        modelos = resposta.json()['modelos']
        if modelos and modelos[0]['estado'] == 'local_validado':
            return modelos[0]
        time.sleep(.01)
    pytest.fail('Pacote nao preparado')


def test_integracao_download_api_reinicio_sem_rede(tmp_path):
    h = {'X-NewProd-Piloto': TOKEN}
    with ambiente(tmp_path) as (s, c):
        assert c.get('/api/pacotes-locais/estado').status_code == 401
        assert c.post('/api/pacotes-locais/catalogo', json=item(), headers=h).status_code == 200
        assert pronto(c)['autorizado_offline'] is False
        recurso = c.get('/api/pacotes-locais/recurso/1/r1/frente', headers=h)
        assert recurso.content == BYTES
        assert recurso.headers['x-content-sha256'] == hashlib.sha256(BYTES).hexdigest()
        assert c.get('/api/pacotes-locais/recurso/1/r1/segredo', headers=h).status_code == 404
    def offline(*a, **k):
        raise AssertionError('Nao pode baixar pacote ja preparado')
    with ambiente(tmp_path, offline) as (s, c):
        pronto(c)
        assert c.get('/api/pacotes-locais/recurso/1/r1/frente', headers=h).content == BYTES
        next((s.local.raiz).rglob('objetos/*')).write_bytes(b'corrompido')
        assert c.get('/api/pacotes-locais/recurso/1/r1/frente', headers=h).status_code == 409


def test_api_rejeita_manifestos_fora_do_escopo_e_corpo_grande(tmp_path):
    h = {'X-NewProd-Piloto': TOKEN}
    with ambiente(tmp_path) as (_, c):
        for alterar in (lambda i: i['manifesto'].update(empresa='outra'),
                        lambda i: i['fontes'].update(frente='file:///C:/segredo'),
                        lambda i: i.update(prazo='2026-01-01T00:00:00')):
            i = item(); alterar(i)
            assert c.post('/api/pacotes-locais/catalogo', json=i, headers=h).status_code == 400
        assert c.post('/api/pacotes-locais/catalogo', content=b'x' * (2 * 1024 * 1024 + 1), headers=h).status_code == 413
        assert c.get('/api/pacotes-locais/estado', headers=h).json()['modelos'] == []


@pytest.mark.parametrize('url', ['http://test.invalid/storage/v1/object/public/x',
    'https://localhost/storage/v1/object/public/x', 'https://test.invalid:444/storage/v1/object/public/x',
    'https://user:senha@test.invalid/storage/v1/object/public/x',
    'https://test.invalid/storage/v1/object/public/../x'])
def test_url_insegura_bloqueada(url):
    with pytest.raises(ValueError): validar_url(url, 'test.invalid')


def test_redirect_bloqueado_e_piloto_desativado_por_padrao(monkeypatch):
    with pytest.raises(ValueError):
        SemRedirecionamento().redirect_request(None, None, 302, '', {}, 'http://localhost')
    monkeypatch.delenv('NEWPROD_PILOTO_LOCAL', raising=False)
    app = FastAPI()
    assert configurar_piloto(app, ocupado=lambda: False) is None
    assert not any('pacotes-locais' in r.path for r in app.routes)


def test_nome_codificado_permitido_travessia_codificada_bloqueada():
    url = 'https://test.invalid/storage/v1/object/public/artes/arte%20nova.pdf'
    assert validar_url(url, 'test.invalid') == url
    with pytest.raises(ValueError):
        validar_url('https://test.invalid/storage/v1/object/public/%2e%2e/segredo', 'test.invalid')


def test_api_recusa_cliente_lan_mesmo_com_token(tmp_path):
    s = ServicoPacotes(tmp_path, host='test.invalid', empresa='teste')
    app = FastAPI(); app.include_router(criar_router(s, TOKEN))
    with TestClient(app, client=('192.168.1.2', 50000)) as c:
        assert c.get('/api/pacotes-locais/estado', headers={'X-NewProd-Piloto': TOKEN}).status_code == 403
    assert not (tmp_path / 'catalogo.sqlite3').exists()


def test_novo_modelo_reaproveita_recurso_sem_download(tmp_path):
    h = {'X-NewProd-Piloto': TOKEN}
    chamadas = []
    def abrir(*args, **kwargs):
        chamadas.append(1)
        return io.BytesIO(BYTES)
    with ambiente(tmp_path, abrir) as (s, c):
        c.post('/api/pacotes-locais/catalogo', json=item(), headers=h)
        pronto(c)
        novo = item(); novo['manifesto']['modelo'] = '2'
        s.cadastrar(novo); s.atualizar_fila()
        fim = time.monotonic() + 3
        while time.monotonic() < fim and s.preparador.estado('teste', '2', 'r1')['estado'] != 'local_validado':
            time.sleep(.01)
        assert s.preparador.estado('teste', '2', 'r1')['estado'] == 'local_validado'
        assert len(chamadas) == 1


def entrada():
    m = item()['manifesto']
    m['configuracao'] = dict(tipo='entrada_online', preparacao_completa=False,
        modelos=['1'], contexto={'modelos': [{'id': 1, 'status_arte': 'APROVADO'}]},
        campos={'frente': 'file'}, pendencias=['dependencias_do_motor', 'aprovacao_versionada'])
    return m


def enviar_entrada(c, m, dados=BYTES, extras=()):
    return c.post('/api/pacotes-locais/entrada', headers={'X-NewProd-Piloto': TOKEN},
        files=[('manifesto', (None, json.dumps(m))),
               ('arquivo_frente', ('arte.pdf', dados, 'application/pdf')), *extras])


def aguardar_entrada(s):
    fim = time.monotonic() + 3
    while time.monotonic() < fim:
        estado = s.estado_modelo('1', 'r1')
        if estado['estado'] == 'dependencias_pendentes':
            assert estado['autorizado_offline'] is False
            return
        time.sleep(.01)
    pytest.fail('Entrada nao conferida')


def test_captura_persiste_reinicia_sem_rede_sem_autorizar_offline(tmp_path):
    def proibido(*a, **k):
        pytest.fail('Captura nao deve acessar rede')
    with ambiente(tmp_path, proibido) as (s, c):
        resposta = enviar_entrada(c, entrada())
        assert resposta.status_code == 200, resposta.text
        assert resposta.json()['execucao_offline'] is False
        aguardar_entrada(s)
        assert enviar_entrada(c, entrada()).status_code == 200
        assert len(s.catalogo()) == 1
        assert not list((tmp_path / 'entradas').iterdir())
    with ambiente(tmp_path, proibido) as (s, c):
        aguardar_entrada(s)
        assert c.get('/api/pacotes-locais/recurso/1/r1/frente',
                     headers={'X-NewProd-Piloto': TOKEN}).content == BYTES


@pytest.mark.parametrize('alterar', [
    lambda m: m.update(empresa='outra'),
    lambda m: m['configuracao'].update(contexto=None),
    lambda m: m['configuracao'].update(contexto={'modelos': [None]}),
    lambda m: m['configuracao'].update(modelos=[{}]),
    lambda m: m['configuracao'].update(campos=None),
    lambda m: m['configuracao'].update(preparacao_completa=True),
    lambda m: m['configuracao']['contexto']['modelos'][0].update(status_arte='REPROVADA'),
])
def test_captura_rejeita_contexto_invalido(tmp_path, alterar):
    with ambiente(tmp_path) as (s, c):
        m = entrada(); alterar(m)
        assert enviar_entrada(c, m).status_code == 400
        assert s.catalogo() == []


def test_captura_rejeita_corrompido_duplicado_e_rota_alternativa(tmp_path):
    with ambiente(tmp_path) as (s, c):
        assert enviar_entrada(c, entrada(), b'corrompido').status_code == 400
        assert enviar_entrada(c, entrada(), extras=[
            ('arquivo_frente', ('duplicado.pdf', BYTES))]).status_code == 400
        i = item(); i['manifesto'] = entrada()
        assert c.post('/api/pacotes-locais/catalogo', json=i,
                      headers={'X-NewProd-Piloto': TOKEN}).status_code == 400
        assert s.catalogo() == []
        assert not list((tmp_path / 'entradas').iterdir())


def entrada_com_foto(modelo='1', setor='laser', prazo='2026-09-27T10:00:00-03:00'):
    from PIL import Image
    import fitz
    foto = io.BytesIO(); Image.new('RGB', (12, 12), 'red').save(foto, format='PNG')
    with fitz.open() as pdf:
        pdf.new_page(width=280, height=140).insert_text((10, 20), 'SINTETICO')
        arte = pdf.tobytes()
    m = entrada()
    m['modelo'] = modelo
    m['configuracao']['modelos'] = [modelo]
    m['configuracao']['contexto']['modelos'][0]['id'] = modelo
    m['configuracao']['agendamento'] = {'setores': [setor], 'prazo': prazo}
    url = 'https://test.invalid/storage/v1/object/public/fotos/' + modelo + '.png'
    m['configuracao']['dados'] = dict(modelo=modelo, seq_start=1, seq_end=1,
        formato=dict(width_mm=100, height_mm=50, cols=1, rows=1),
        saida=dict(width_mm=120, height_mm=70),
        numeracao=dict(tipo='SEQUENCIAL', elements=[dict(type='FOTO', source='database',
            csv_column='Foto', x_mm=20, y_mm=25, width_mm=15, height_mm=15)], csv_data=[{'Foto': url}]))
    m['arquivos']['frente'] = {'sha256': hashlib.sha256(arte).hexdigest(), 'bytes': len(arte)}
    return m, arte, foto.getvalue()


def estado_ate(s, esperado, modelo='1'):
    fim = time.monotonic() + 5
    while time.monotonic() < fim:
        e = s.estado_modelo(modelo, 'r1')
        if e['estado'] == esperado:
            return e
        time.sleep(.01)
    pytest.fail('Estado não alcançado: ' + str(e))


def test_captura_coleta_automaticamente_e_reinicia_sem_download(tmp_path):
    m, arte, foto = entrada_com_foto()
    chamadas = []
    def abrir(req, **kwargs):
        chamadas.append(req.full_url)
        return io.BytesIO(foto)
    with ambiente(tmp_path, abrir) as (s, c):
        assert enviar_entrada(c, m, arte).status_code == 200
        estado = estado_ate(s, 'fotos_fontes_locais')
        assert estado['autorizado_offline'] is False
        derivado = s.obter_coleta(m)
        assert derivado['revisao'] == estado['revisao_recursos']
        assert derivado['configuracao']['revisao_entrada'] == 'r1'
        assert s.catalogo()[0]['setor'] == 'laser'
        assert len(chamadas) == 1
        # A captura original continua íntegra e imutável.
        assert s.local.consultar('teste', '1', 'r1')['estado'] == 'local_validado'
        nome = next(iter(derivado['configuracao']['recursos_motor'].values()))
        recurso = c.get('/api/pacotes-locais/recurso/1/' + derivado['revisao'] + '/' + nome,
                        headers={'X-NewProd-Piloto': TOKEN})
        assert recurso.content == foto
    def offline(*a, **k):
        raise AssertionError('Reinício não pode baixar coleta íntegra')
    with ambiente(tmp_path, offline) as (s, c):
        e = s.estado_modelo('1', 'r1')
        assert e['copia_local_presente']
        assert s.obter_coleta(m)['revisao'] == derivado['revisao']
        assert s.preparador.resumo()['pendentes'] == 0


def test_fila_persistida_retoma_ociosidade_e_prioriza_laser_prazo(tmp_path):
    import threading
    ocupado = threading.Event(); ocupado.set()
    chamadas = []
    m, arte, foto = entrada_com_foto()
    def abrir(req, **kwargs):
        chamadas.append(req.full_url.rsplit('/', 1)[-1])
        return io.BytesIO(foto)
    with ambiente(tmp_path, abrir, ocupado.is_set) as (s, c):
        for modelo, setor, prazo in [('3', 'offset', '2026-09-26T08:00:00-03:00'),
                                     ('2', 'laser', '2026-09-29T08:00:00-03:00'),
                                     ('1', 'laser', '2026-09-26T08:00:00-03:00')]:
            m, arte, _ = entrada_com_foto(modelo, setor, prazo)
            assert enviar_entrada(c, m, arte).status_code == 200
        assert chamadas == []
        assert len(s.catalogo()) == 3
    # Como no início do período noturno: o agente reinicia e a estação está ociosa.
    ocupado.clear()
    with ambiente(tmp_path, abrir, ocupado.is_set) as (s, c):
        for modelo in ('1', '2', '3'):
            estado_ate(s, 'fotos_fontes_locais', modelo)
        assert chamadas == ['1.png', '3.png', '2.png']


def test_coleta_falha_reconexao_reagenda_sem_repetir_impressao(tmp_path):
    m, arte, foto = entrada_com_foto()
    online = [False]
    def abrir(*a, **k):
        if not online[0]: raise OSError('Queda simulada')
        return io.BytesIO(foto)
    with ambiente(tmp_path, abrir) as (s, c):
        assert enviar_entrada(c, m, arte).status_code == 200
        estado_ate(s, 'falha_preparacao')
        assert s.obter_coleta(m) is None
        online[0] = True
        s.atualizar_fila()  # mesmo caminho do ciclo periódico de 30 s
        estado_ate(s, 'fotos_fontes_locais')
        assert not list(s.raiz.rglob('saida.pdf'))


def test_mapa_teatro_permanece_pendente_sem_consultar_banco(tmp_path):
    m, arte, foto = entrada_com_foto()
    m['configuracao']['dados']['mapa_teatro_id'] = 'mapa-sintetico'
    def proibido(*a, **k): raise AssertionError('Não pode buscar dados implícitos')
    with ambiente(tmp_path, proibido) as (s, c):
        assert enviar_entrada(c, m, arte).status_code == 200
        e = estado_ate(s, 'dependencias_pendentes')
        assert e['motivo_coleta'] == 'mapa_teatro_nao_capturado'
        assert s.obter_coleta(m) is None


def test_csv_capturado_tem_precedencia_e_alimenta_coleta(tmp_path):
    m, arte, foto = entrada_com_foto()
    num = m['configuracao']['dados']['numeracao']
    url = num['csv_data'][0]['Foto']
    num['csv_data'] = [{'Foto': 'https://test.invalid/nao-usar'}]
    csv_bytes = ('Foto\n' + url + '\n').encode('utf-8')
    m['arquivos']['csv_file'] = {'sha256': hashlib.sha256(csv_bytes).hexdigest(), 'bytes': len(csv_bytes)}
    m['configuracao']['campos']['csv_file'] = 'csv_file'
    chamadas = []
    def abrir(req, **k):
        chamadas.append(req.full_url)
        return io.BytesIO(foto)
    with ambiente(tmp_path, abrir) as (s, c):
        r = enviar_entrada(c, m, arte, extras=[('arquivo_csv_file', ('dados.csv', csv_bytes))])
        assert r.status_code == 200
        estado_ate(s, 'fotos_fontes_locais')
        assert chamadas == [url]


def test_pausa_impede_coleta_ate_operador_retomar(tmp_path):
    m, arte, foto = entrada_com_foto()
    chamadas = []
    def abrir(req, **k):
        chamadas.append(req.full_url)
        return io.BytesIO(foto)
    with ambiente(tmp_path, abrir) as (s, c):
        h = {'X-NewProd-Piloto': TOKEN}
        assert c.post('/api/pacotes-locais/pausa/true', headers=h).status_code == 200
        assert enviar_entrada(c, m, arte).status_code == 200
        assert s.preparador._pausado
        assert chamadas == []
        assert c.post('/api/pacotes-locais/pausa/false', headers=h).status_code == 200
        estado_ate(s, 'fotos_fontes_locais')
        assert len(chamadas) == 1
