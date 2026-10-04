import io
import time

import pytest

from pacotes_api import ServicoPacotes
from test_pacotes_api import ambiente, TOKEN, BYTES


def candidato():
    return {'empresa': 'teste', 'modelo': '10', 'setor': 'laser',
            'prazo': '2026-09-26T18:00:00-03:00',
            'fontes': {'frente': 'https://test.invalid/storage/v1/object/public/artes/10.pdf'},
            'observacao': {'digest': 'a' * 64, 'aprovacao': 'APROVADO'}}


def aguardar(c):
    for _ in range(300):
        dados = c.get('/api/pacotes-locais/estado', headers={'X-NewProd-Piloto': TOKEN}).json()
        if dados['modelos'] and dados['modelos'][0]['estado'] == 'recursos_antecipados':
            return dados['modelos'][0]
        time.sleep(.01)
    pytest.fail('Antecipação não concluiu')


def test_antecipa_persiste_sem_autorizar_impressao_e_reutiliza_offline(tmp_path):
    h = {'X-NewProd-Piloto': TOKEN}
    downloads = []
    def abrir(*a, **k):
        downloads.append(1)
        return io.BytesIO(BYTES)
    with ambiente(tmp_path, abrir) as (s, c):
        r = c.post('/api/pacotes-locais/antecipacao', json=candidato(), headers=h)
        assert r.status_code == 200 and r.json()['recebido']
        estado = aguardar(c)
        assert not estado['autorizado_offline'] and not estado['aprovacao_versionada']
        assert len(downloads) == 1
        assert c.get('/api/pacotes-locais/recurso/10/' + estado['revisao_recursos'] + '/frente', headers=h).content == BYTES
        assert c.post('/api/pacotes-locais/antecipacao', json=candidato(), headers=h).json()['revisao'] == r.json()['revisao']
        assert len(s.catalogo()) == 1
    def sem_rede(*a, **k):
        raise AssertionError('Reinício não precisa baixar cópia íntegra')
    with ambiente(tmp_path, sem_rede) as (s, c):
        assert s.estado_modelo('10', r.json()['revisao'])['copia_local_presente']
        assert s.preparador.resumo()['pendentes'] == 0


@pytest.mark.parametrize('mudar', [lambda i: i.update(empresa='outra'),
    lambda i: i['observacao'].update(aprovacao='EM ARTE'),
    lambda i: i['fontes'].update(frente='https://fora.invalid/a.pdf'),
    lambda i: i.update(modelo='../10'), lambda i: i.update(prazo='2026-09-26'),
    lambda i: i['observacao'].update(token='nao-aceitar')])
def test_rejeita_antes_de_persistir(tmp_path, mudar):
    with ambiente(tmp_path) as (s, c):
        item = candidato(); mudar(item)
        assert c.post('/api/pacotes-locais/antecipacao', json=item,
                      headers={'X-NewProd-Piloto': TOKEN}).status_code == 400
        assert not s.catalogo()


def test_pausa_persiste_no_reinicio_e_retoma(tmp_path):
    with ambiente(tmp_path) as (_, c):
        assert c.post('/api/pacotes-locais/pausa/true', headers={'X-NewProd-Piloto': TOKEN}).json()['pausado']
    with ambiente(tmp_path) as (_, c):
        h = {'X-NewProd-Piloto': TOKEN}
        assert c.get('/api/pacotes-locais/estado', headers=h).json()['fila']['pausado']
        c.post('/api/pacotes-locais/antecipacao', json=candidato(), headers=h)
        assert c.get('/api/pacotes-locais/estado', headers=h).json()['modelos'][0]['estado'] == 'aguardando_preparacao'
        c.post('/api/pacotes-locais/pausa/false', headers=h)
        aguardar(c)


def test_corrupcao_da_copia_antecipada_rebaixa_estado_e_refaz_download(tmp_path):
    with ambiente(tmp_path) as (s, c):
        c.post('/api/pacotes-locais/antecipacao', json=candidato(), headers={'X-NewProd-Piloto': TOKEN})
        aguardar(c)
        objeto = next(s.local.raiz.rglob('objetos/*'))
        objeto.write_bytes(b'corrompido')
    with ambiente(tmp_path) as (_, c):
        aguardar(c)
        assert objeto.read_bytes() == BYTES


def test_raiz_nao_pode_ser_reutilizada_por_outra_empresa(tmp_path):
    ServicoPacotes(tmp_path, host='test.invalid', empresa='teste').catalogo()
    with pytest.raises(ValueError, match='outra empresa'):
        ServicoPacotes(tmp_path, host='test.invalid', empresa='outra').catalogo()


def test_atualizacao_de_prazo_reordena_a_fila_pausada(tmp_path):
    with ambiente(tmp_path) as (s, c):
        s.pausar(True)
        i = candidato()
        recibo = s.antecipar(i)
        s.atualizar_fila()
        i['prazo'] = '2026-09-26T08:00:00-03:00'
        assert s.antecipar(i)['revisao'] == recibo['revisao']
        chave = ('teste', '10', recibo['revisao'])
        assert s.preparador._tarefas[chave][3].hour == 8


def test_mesma_url_revalida_com_etag_e_conserva_revisao_anterior(tmp_path):
    import urllib.error
    chamadas = []
    def abrir(req, **kwargs):
        chamadas.append(req.get_header('If-none-match'))
        if len(chamadas) == 2:
            raise urllib.error.HTTPError(req.full_url, 304, 'Not Modified', {}, None)
        resposta = io.BytesIO(BYTES if len(chamadas) == 1 else b'arte atualizada')
        resposta.headers = {'ETag': '"v1"' if len(chamadas) == 1 else '"v2"'}
        return resposta
    s = ServicoPacotes(tmp_path, host='test.invalid', empresa='teste', abrir=abrir)
    s.antecipar(candidato())
    m = s.catalogo()[0]['manifesto']
    preparador = s.preparador.armazenamento
    agora = [0]; preparador.relogio = lambda: agora[0]
    inicial = preparador.preparar(m, {})
    preparador.preparar(m, {})
    assert len(chamadas) == 1
    agora[0] = 301
    preparador.preparar(m, {})
    assert len(chamadas) == 1  # Tempo sozinho não atualiza a cópia.
    preparador._atualizar_ao_abrir.add(('teste','10',m['revisao']))
    igual = preparador.preparar(m, {})
    assert chamadas == [None, '"v1"']
    assert igual['revisao_recursos'] == inicial['revisao_recursos']
    agora[0] = 602
    preparador._atualizar_ao_abrir.add(('teste','10',m['revisao']))
    novo = preparador.preparar(m, {})
    assert novo['revisao_recursos'] != inicial['revisao_recursos']
    assert s.local.ler_recurso('teste', '10', novo['revisao_recursos'], 'frente') == b'arte atualizada'
    assert s.local.ler_recurso('teste', '10', inicial['revisao_recursos'], 'frente') == BYTES


def test_etag_fraco_nao_substitui_hash_dos_bytes(tmp_path):
    chamadas = []
    def abrir(req, **kwargs):
        chamadas.append(req.get_header('If-none-match'))
        resposta = io.BytesIO(BYTES)
        resposta.headers = {'ETag': 'W/"fraco"'}
        return resposta
    s = ServicoPacotes(tmp_path, host='test.invalid', empresa='teste', abrir=abrir)
    s.antecipar(candidato()); m = s.catalogo()[0]['manifesto']
    p = s.preparador.armazenamento
    agora = [0]; p.relogio = lambda: agora[0]
    p.preparar(m, {}); agora[0] = 301
    p._atualizar_ao_abrir.add(('teste','10',m['revisao']))
    p.preparar(m, {})
    assert chamadas == [None, None]
