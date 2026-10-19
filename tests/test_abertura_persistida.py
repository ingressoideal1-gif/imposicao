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
