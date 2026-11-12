import sys
from types import SimpleNamespace

from gestao_estacoes import resumo_coleta


def test_telemetria_sem_app_nao_inicia_servidor(monkeypatch):
    monkeypatch.delitem(sys.modules, 'app', raising=False)
    assert resumo_coleta() == {'habilitada': False}
    assert 'app' not in sys.modules


def test_telemetria_mostra_pausa_thread_sem_dados_de_pedido(monkeypatch):
    servico = SimpleNamespace(
        coleta_autonoma=SimpleNamespace(estado={'habilitada': True, 'estado': 'pausada',
            'recebidos': 4, 'pedido': 'privado', 'motivo': 'nao publicar detalhes internos'}),
        preparador=SimpleNamespace(resumo=lambda: {'pausado': True, 'pendentes': 2}),
        _thread=SimpleNamespace(is_alive=lambda: True), erro_catalogo=False)
    monkeypatch.setitem(sys.modules, 'app', SimpleNamespace(piloto_pacotes=servico))
    assert resumo_coleta() == {'habilitada': True, 'estado': 'pausada', 'recebidos': 4,
        'fila': {'pausado': True, 'pendentes': 2}, 'thread_ativa': True, 'erro_catalogo': False}


def test_retencao_informa_bytes_sem_identificadores_ou_caminhos(monkeypatch):
    servico = SimpleNamespace(coleta_autonoma=SimpleNamespace(estado={'habilitada':True}),
        preparador=SimpleNamespace(resumo=lambda:{}),_thread=None,erro_catalogo=False,
        retencao=SimpleNamespace(estado={'modelos':2,'bytes_removidos':100,'adiado':False,
                                      'pedido':'privado','caminho':'privado'}))
    monkeypatch.setitem(sys.modules,'app',SimpleNamespace(piloto_pacotes=servico))
    assert resumo_coleta()['retencao_cache'] == {'modelos':2,'bytes_removidos':100,'adiado':False}
    servico.retencao_fontes = {'bytes_removidos': 50, 'protegido': True,
                              'acima_limite': True, 'caminho': 'privado'}
    assert resumo_coleta()['retencao_fontes'] == {
        'bytes_removidos': 50, 'protegido': True, 'acima_limite': True}
