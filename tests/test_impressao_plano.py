import pytest

from copy import deepcopy

from impressao_plano import Trecho, planejar, preparar_para_destino


def test_intercalacao_e_fronteiras_de_folhas():
    plano = planejar([
        Trecho('capa_1.pdf', 1, 'capa', 'simplex'),
        Trecho('miolo_1.pdf', 3, 'miolo', 'duplex_long_edge'),
        Trecho('capa_2.pdf', 1, 'capa', 'simplex'),
        Trecho('miolo_2.pdf', 4, 'miolo', 'duplex_short_edge'),
    ], copias=2)
    assert plano['paginas_por_copia'] == 9
    assert plano['folhas_por_copia'] == 6
    assert plano['copias'] == 2
    assert [t['arquivo'] for t in plano['trechos']] == [
        'capa_1.pdf', 'miolo_1.pdf', 'capa_2.pdf', 'miolo_2.pdf']
    assert [(t['pagina_inicial'], t['pagina_final']) for t in plano['trechos']] == [
        (1, 1), (2, 4), (5, 5), (6, 9)]
    assert [t['folha_inicial'] for t in plano['trechos']] == [1, 2, 4, 5]
    assert [t['ultimo_verso_sem_conteudo'] for t in plano['trechos']] == [False, True, False, False]


def test_face_unica_nao_emparelha_capas_e_miolos():
    plano = planejar([Trecho('capa', 1, 'capa', 'simplex'),
                      Trecho('miolo_frentes', 50, 'miolo', 'simplex')])
    assert plano['folhas_por_copia'] == 51


@pytest.mark.parametrize('trecho', [
    Trecho('a', 0, 'b', 'simplex'), Trecho('a', True, 'b', 'simplex'),
    Trecho('a', 1, 15, 'simplex'), Trecho('a', 1, '', 'simplex'),
    Trecho('a', 1, 'b', 'automatico'), Trecho('', 1, 'b', 'simplex'),
])
def test_rejeita_configuracao_ambigua(trecho):
    with pytest.raises(ValueError):
        planejar([trecho])


def test_rejeita_trabalho_vazio():
    with pytest.raises(ValueError):
        planejar([])


@pytest.mark.parametrize('copias', [0, True, 1000])
def test_rejeita_copias_invalidas(copias):
    with pytest.raises(ValueError):
        planejar([Trecho('a', 1, 'b', 'simplex')], copias=copias)


def perfil(estacao='PC-A', impressora='Fila A'):
    return {'estacao': estacao, 'impressora': impressora,
            'adaptador': 'simulado', 'bandejas': {'capa': '2', 'miolo': '4'},
            'duplex': ['simplex', 'duplex_long_edge'],
            'recursos': {k: True for k in ('trabalho_unico', 'inicio_em_nova_folha',
                'copias_agrupadas', 'bandeja_por_trecho', 'duplex_por_trecho')}}


def preparar(p, estacao='PC-A', impressora='Fila A'):
    return preparar_para_destino([
        Trecho('capa.pdf', 1, 'capa', 'simplex'),
        Trecho('miolo.pdf', 3, 'miolo', 'duplex_long_edge')],
        estacao=estacao, impressora=impressora, perfil=p, copias=2)


def test_mesmo_modelo_em_duas_estacoes_com_bandejas_diferentes():
    primeiro = perfil()
    segundo = perfil('PC-B', 'Fila B')
    segundo['bandejas'] = {'capa': 'TrayA', 'miolo': 'TrayC'}
    original = deepcopy(segundo)
    a = preparar(primeiro, estacao='pc-a')
    b = preparar(segundo, 'PC-B', 'Fila B')
    assert [t['bandeja_destino'] for t in a['trechos']] == ['2', '4']
    assert [t['bandeja_destino'] for t in b['trechos']] == ['TrayA', 'TrayC']
    assert a['folhas_por_copia'] == b['folhas_por_copia'] == 3
    assert b['envio_habilitado'] is False
    assert segundo == original


@pytest.mark.parametrize('campo,valor', [('estacao', 'PC-B'), ('impressora', 'Outra')])
def test_nao_reutiliza_perfil_de_outro_destino(campo, valor):
    p = perfil()
    p[campo] = valor
    with pytest.raises(ValueError, match='outra'):
        preparar(p)


@pytest.mark.parametrize('recurso', ['trabalho_unico', 'inicio_em_nova_folha',
    'copias_agrupadas', 'bandeja_por_trecho', 'duplex_por_trecho'])
def test_nao_silencia_recurso_ausente(recurso):
    p = perfil()
    p['recursos'][recurso] = False
    with pytest.raises(ValueError, match=recurso):
        preparar(p)


def test_bandeja_sem_mapeamento():
    p = perfil()
    del p['bandejas']['capa']
    with pytest.raises(ValueError, match='correspondencia'):
        preparar(p)


def test_duplex_indisponivel():
    p = perfil()
    p['duplex'] = ['simplex']
    with pytest.raises(ValueError, match='Duplex'):
        preparar(p)
