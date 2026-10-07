import pytest
from manifesto_oficial import BASE, validar


def manifesto():
    return dict(schema=1,produto='NewProdPilotoOficial',version='1.2.366',
                url=BASE+'NewProdPiloto_Oficial_v1.2.366.msi',sha256='a'*64,
                bytes=153000000,estacoes=['PC-JR-HOME'])


def test_liberacao_inicial_nao_atualiza_a_grafica():
    assert validar(manifesto(),'pc-jr-home')['liberado']
    assert not validar(manifesto(),'LASER-01')['liberado']
    m=manifesto();del m['estacoes']
    assert validar(m,'LASER-01')['liberado']


@pytest.mark.parametrize('campo,valor',[
    ('schema',0),('produto','legado'),('version','../arquivo'),
    ('url',BASE+'../outro.msi'),('url','https://outro.invalid/new.msi'),
    ('sha256','z'*64),('bytes',True),('bytes',0),('bytes',1024**3),
    ('estacoes',[]),('estacoes',['*']),('estacoes','PC-JR-HOME')])
def test_manifesto_divergente_recusado(campo,valor):
    m=manifesto();m[campo]=valor
    with pytest.raises(ValueError):validar(m,'PC-JR-HOME')
