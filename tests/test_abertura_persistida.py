from copy import deepcopy

import pytest

from conferencia_piloto import ConferenciaIndisponivel
from selecao_piloto import SelecaoPiloto
from test_revisao_pedido_piloto import ambiente


def ambiente_v2(tmp_path):
    s, e, itens, _ = ambiente(tmp_path, total=2)
    snapshot = {k: [] for k in ('modelos', 'numeracoes', 'origens', 'produtos',
                               'bancos', 'vinculos', 'artes', 'mapas')}
    snapshot['modelos'] = [{'id': int(i['modelo']), 'id_int': 99} for i in itens]
    conferir = s.coleta_autonoma.cliente.conferir_pedido

    def abrir(pedido, revisao):
        r = conferir(pedido, revisao)
        r['protocolo'] = 2
        if not r['sem_mudanca']:
            r['snapshot'] = deepcopy(snapshot)
        return r

    s.coleta_autonoma.cliente.abrir_pedido = abrir
    return s, e, itens, snapshot


def test_abertura_sem_modelos_no_request_e_reinicio_le_snapshot_local(tmp_path):
    s, e, _, snapshot = ambiente_v2(tmp_path)
    a = SelecaoPiloto(s).abrir_pedido({'pedido': '99'})
    assert a['snapshot'] == snapshot and e['downloads'] == 2
    b = SelecaoPiloto(s).abrir_pedido({'pedido': '99'})
    assert b['snapshot'] == snapshot and b['reutilizados'] == 2
    assert e['downloads'] == 2 and e['consultas'] == 3


@pytest.mark.parametrize('arte_no_gabarito', [False, True])
def test_gabarito_sem_arte_base_prepara_manifesto_sem_download_e_revalida(tmp_path, monkeypatch, arte_no_gabarito):
    import base64
    import fitz
    from engine import ImpositionConfig, ImpositionEngine
    from motor_piloto import resolver_do_pedido
    def sem_rede(*args, **kwargs):
        pytest.fail('Geracao sintetica nao acessa rede')
    monkeypatch.setattr('socket.create_connection', sem_rede)
    s, e, itens, snapshot = ambiente_v2(tmp_path)
    itens[:] = itens[:1]
    snapshot['modelos'] = snapshot['modelos'][:1]
    itens[0].update(fontes={}, versoes_fontes={}, gabarito_sem_arte_base=True)
    p = SelecaoPiloto(s)
    r = p.abrir_pedido({'pedido': '99'})
    assert r['sem_arte'] == [] and len(r['pacotes']) == 1
    pacote = r['pacotes'][0]
    assert pacote['recursos'] == pacote['hashes'] == pacote['fontes'] == {}
    assert pacote['origem'] == 'local' and pacote['execucao_offline'] is False
    assert e['downloads'] == 0
    assert s.local.consultar('teste', '10', pacote['revisao'])['estado'] == 'local_validado'
    # O painel passa por esta segunda conferencia antes de chamar o motor.
    from offline_estacao import OfflineEstacao
    offline = OfflineEstacao(s, p)
    offline.catalogos = lambda: {'formatos': [], 'saidas': []}
    conferido = offline.conferir([{'pedido': '99', 'revisao': r['revisao_pedido']}])
    assert conferido['pedidos'][0]['sem_arte'] == []
    resolver = resolver_do_pedido(s, [{'modelo': '10', 'revisao': pacote['revisao']}])
    elementos = [dict(type='TEXT', x_mm=50, y_mm=35, font_size=12, font_name='Helvetica')]
    if arte_no_gabarito:
        with fitz.open() as arte:
            arte.new_page(width=283.46, height=141.73).insert_text((20, 20), 'ARTE INCLUSA')
            conteudo = base64.b64encode(arte.tobytes()).decode()
        elementos.insert(0, dict(type='PDF', x_mm=50, y_mm=25, width_mm=100, height_mm=50,
                                pdf_content='data:application/pdf;base64,' + conteudo))
    cfg = ImpositionConfig(base_file=None, out_pdf=str(tmp_path / 'numeracao.pdf'),
        formato=dict(name='Sintetico', width_mm=100, height_mm=50, cols=2, rows=2,
                     gap_h_mm=0, gap_v_mm=0, offset_h_mm=0, offset_v_mm=0, rotations={}),
        saida=dict(name='Sintetico', width_mm=220, height_mm=120),
        numeracao=dict(tipo='SEQUENCIAL', elements=elementos), seq_start=1, seq_end=200,
        sheets_per_block=10)
    motor = ImpositionEngine(cfg, resolver_recurso=resolver)
    motor.process()
    linhas = []
    for gerado in motor.generated_files:
        with fitz.open(gerado['path']) as pdf:
            for pagina in pdf:
                linhas.extend(pagina.get_text().splitlines())
    assert sorted(int(linha) for linha in linhas if linha.isdecimal()) == list(range(1, 201))
    assert ('ARTE INCLUSA' in linhas) == arte_no_gabarito
    assert SelecaoPiloto(s).abrir_pedido({'pedido': '99'})['reutilizados'] == 1
    e['revisao'] = 'e' * 64
    itens[0]['observacao']['digest'] = 'f' * 64
    novo = p.abrir_pedido({'pedido': '99'})['pacotes'][0]
    assert novo['digest'] == 'f' * 64 and novo['revisao'] != pacote['revisao']
    assert e['downloads'] == 0
    e['sem_rede'] = True
    with pytest.raises(ConferenciaIndisponivel):
        p.abrir_pedido({'pedido': '99'})


def test_sem_arte_sem_autorizacao_da_nuvem_continua_bloqueado(tmp_path):
    s, _, itens, _ = ambiente_v2(tmp_path)
    itens[0].update(fontes={}, versoes_fontes={})
    r = SelecaoPiloto(s).abrir_pedido({'pedido': '99'})
    assert r['sem_arte'] == ['10']
    assert [p['modelo'] for p in r['pacotes']] == ['11']
    itens[0]['gabarito_sem_arte_base'] = True
    # A API generica nao aceita marcador injetado sem conferidor da selecao.
    with pytest.raises(ValueError, match='Fontes'):
        s.antecipar(itens[0])


def test_cache_anterior_a_gabaritos_sem_base_renova_recibo(tmp_path):
    import json
    s, e, itens, _ = ambiente_v2(tmp_path)
    p = SelecaoPiloto(s)
    removido = itens.pop()
    p.abrir_pedido({'pedido': '99'})
    antigo = p._cache.obter('99')
    antigo.pop('gabarito_sem_arte_base')
    con = s._db()
    try:
        con.execute('UPDATE revisoes_pedidos_piloto SET conteudo=? WHERE pedido=?',
                    (json.dumps(antigo), '99'))
        con.commit()
    finally:
        con.close()
    removido.update(fontes={}, versoes_fontes={}, gabarito_sem_arte_base=True)
    itens.append(removido)
    r = SelecaoPiloto(s).abrir_pedido({'pedido': '99'})
    assert len(r['pacotes']) == 2 and r['sem_arte'] == []
    assert r['revisao_pedido'] == antigo['revisao'] and e['downloads'] == 1


def test_metadados_alterados_nao_baixam_arte_igual(tmp_path):
    s, e, itens, snapshot = ambiente_v2(tmp_path)
    p = SelecaoPiloto(s)
    p.abrir_pedido({'pedido': '99'})
    e['revisao'] = 'c' * 64
    itens[0]['observacao']['digest'] = 'd' * 64
    snapshot['modelos'][0]['quantidade'] = 400
    r = p.abrir_pedido({'pedido': '99'})
    assert r['snapshot']['modelos'][0]['quantidade'] == 400
    assert r['pacotes'][0]['digest'] == 'd' * 64
    assert e['downloads'] == 2  # revisao nova, arquivos identicos, so disco


def test_mudanca_durante_download_nao_substitui_cache_bom(tmp_path):
    s, e, itens, _ = ambiente_v2(tmp_path)
    p = SelecaoPiloto(s)
    antes = p.abrir_pedido({'pedido': '99'})
    e['revisao'] = 'd' * 64
    itens[0]['versoes_fontes']['frente'] = {'revisao': 'e' * 64, 'etag': 'novo'}
    e['etags']['10'] = 'novo'
    e['mudou_download'] = True
    with pytest.raises(ConferenciaIndisponivel):
        p.abrir_pedido({'pedido': '99'})
    assert p._cache.obter('99')['revisao'] == antes['revisao_pedido']


def test_sem_sinal_ou_snapshot_incompleto_nao_libera_copia(tmp_path):
    s, e, _, _ = ambiente_v2(tmp_path)
    p = SelecaoPiloto(s)
    p.abrir_pedido({'pedido': '99'})
    e['sem_rede'] = True
    with pytest.raises(ConferenciaIndisponivel):
        p.abrir_pedido({'pedido': '99'})
    e['sem_rede'] = False
    s.coleta_autonoma.cliente.abrir_pedido = s.coleta_autonoma.cliente.conferir_pedido
    with pytest.raises(ConferenciaIndisponivel):
        p.abrir_pedido({'pedido': '99'})


def test_cache_antigo_renova_modelo_omitido_sem_mudar_revisao_comercial(tmp_path):
    import json
    s, e, itens, snapshot = ambiente_v2(tmp_path)
    p = SelecaoPiloto(s)
    modelo = itens.pop()
    p.abrir_pedido({'pedido': '99'})
    antigo = p._cache.obter('99')
    antigo.pop('fontes_gabarito')
    con = s._db()
    try:
        con.execute('UPDATE revisoes_pedidos_piloto SET conteudo=? WHERE pedido=?',
                    (json.dumps(antigo), '99'))
        con.commit()
    finally:
        con.close()
    itens.append(modelo)  # servidor corrigido, dados comerciais inalterados
    r = SelecaoPiloto(s).abrir_pedido({'pedido': '99'})
    assert len(r['pacotes']) == 2 and r['sem_arte'] == []
    assert r['revisao_pedido'] == antigo['revisao']
    assert p._cache.obter('99')['fontes_gabarito'] == 1
    consultas = e['consultas']
    SelecaoPiloto(s).abrir_pedido({'pedido': '99'})
    assert e['consultas'] == consultas + 1


def test_renova_lista_de_recursos_antiga_uma_vez_sem_apagar_copia(tmp_path):
    import json
    s,e,_,_=ambiente_v2(tmp_path)
    p=SelecaoPiloto(s)
    p.abrir_pedido({'pedido':'99'})
    antigo=p._cache.obter('99')
    antigo.pop('recursos_fotos')
    con=s._db()
    try:
        con.execute('UPDATE revisoes_pedidos_piloto SET conteudo=? WHERE pedido=?',
                    (json.dumps(antigo),'99'));con.commit()
    finally: con.close()
    revisoes=[]
    original=s.coleta_autonoma.cliente.abrir_pedido
    def abrir(pedido,revisao):
        revisoes.append(revisao)
        return original(pedido,revisao)
    s.coleta_autonoma.cliente.abrir_pedido=abrir
    p.abrir_pedido({'pedido':'99'})
    assert revisoes[0]==''
    assert p._cache.obter('99')['recursos_fotos']==1
    assert s.local.consultar('teste','10',antigo['pacotes'][0]['revisao'])['estado']=='local_validado'
    revisoes.clear()
    r=SelecaoPiloto(s).abrir_pedido({'pedido':'99'})
    assert revisoes==['a'*64] and r['reutilizados']==2
