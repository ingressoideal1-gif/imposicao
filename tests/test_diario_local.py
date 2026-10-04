import pytest
from diario_local import DiarioLocal


def test_reinicio_incerto_e_sincronizacao_idempotente(tmp_path):
    d = DiarioLocal(tmp_path, 'estacao-teste')
    d.registrar('e', 't', 'r1', 0, 'tentativa1', 'preparado')
    d.registrar('e', 't', 'r1', 0, 'tentativa1', 'envio_iniciado')
    d = DiarioLocal(tmp_path, 'estacao-teste')
    d.recuperar_envios_incertos()
    assert [r['estado'] for r in d.pendentes()] == ['preparado', 'envio_iniciado', 'incerto']
    d.recuperar_envios_incertos()
    assert len(d.pendentes()) == 3
    remoto = {}
    def perdeu_ack(lote):
        remoto.update({r['id']: r for r in lote})
        raise OSError('rede caiu apos persistir')
    with pytest.raises(OSError): d.sincronizar(perdeu_ack)
    assert len(d.pendentes()) == 3
    def enviar(lote):
        remoto.update({r['id']: r for r in lote})
        return [r['id'] for r in lote]
    assert d.sincronizar(enviar) == 3
    assert len(remoto) == 3 and not d.pendentes()


def test_recibo_parcial_invalido_e_transicoes(tmp_path):
    d = DiarioLocal(tmp_path, 'estacao-teste')
    primeiro = d.registrar('e', 't', 'r1', 0, 'a', 'preparado')
    with pytest.raises(ValueError): d.registrar('e', 't', 'r2', 0, 'a', 'envio_iniciado')
    with pytest.raises(ValueError): d.registrar('e', 't', 'r1', 0, 'a', 'conferido')
    d.registrar('e', 't', 'r1', 0, 'a', 'envio_iniciado')
    with pytest.raises(ValueError): d.sincronizar(lambda _: ['id-inventado'])
    assert len(d.pendentes()) == 2
    assert d.sincronizar(lambda _: [primeiro]) == 1
    assert len(d.pendentes()) == 1
