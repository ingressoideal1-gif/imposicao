from types import SimpleNamespace
import pytest
import fitz
from test_recursos_motor_local import pacote, config, FOTO, FONTE, ARTE
from engine import ImpositionEngine
from motor_piloto import resolver_do_pedido


def preparar(pacote, tmp_path):
    local, m = pacote
    caminhos = {}
    for n in ('foto','fonte','frente'):
        p = tmp_path / ('motor-' + n)
        p.write_bytes(local.ler_recurso('teste','1','r1',n)); caminhos[n] = p
    m = dict(m, revisao='d'*64, configuracao={'fontes':{'foto':FOTO,'fonte':FONTE,'frente':ARTE}})
    local.preparar(m, caminhos)
    s = SimpleNamespace(local=local, empresa='teste', host='teste.invalid',
                        manifesto_coletado=lambda modelo, revisao: m if (modelo,revisao)==('1','d'*64) else None)
    return s, [{'modelo':'1','revisao':'d'*64}]


@pytest.mark.parametrize('multi', [False, True])
def test_recursos_do_pedido_entram_no_motor_sem_rede(pacote, tmp_path, multi):
    s, refs = preparar(pacote, tmp_path)
    resolver = resolver_do_pedido(s, refs)
    with s.local.pdf_para_motor('teste','1','d'*64) as base:
        motor = ImpositionEngine(config(tmp_path,str(base),multi), resolver_recurso=resolver)
        motor.process()
    with fitz.open(motor.generated_files[0]['path']) as pdf:
        assert len(pdf) == 1 and 'LOCAL' in pdf[0].get_text() and 'ARTE' in pdf[0].get_text()


def test_corrupcao_nao_busca_copia_na_rede(pacote, tmp_path):
    s, refs = preparar(pacote,tmp_path)
    resolver = resolver_do_pedido(s,refs)
    info = s.manifesto_coletado('1','d'*64)['arquivos']['foto']
    (s.local._pasta('teste')/'objetos'/info['sha256']).write_bytes(b'corrompido')
    with pytest.raises(ValueError): resolver(FOTO)
    with pytest.raises(ValueError): resolver_do_pedido(s,refs)


@pytest.mark.parametrize('refs', [[],[{'modelo':'1','revisao':'r1'}],[{'modelo':'../1','revisao':'d'*64}],
                                 [{'modelo':'1','revisao':'e'*64}]])
def test_referencia_invalida_e_pacote_ausente_bloqueiam(pacote,tmp_path,refs):
    s, _ = preparar(pacote,tmp_path)
    with pytest.raises(ValueError): resolver_do_pedido(s,refs)
