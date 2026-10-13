import io
import json
import threading
from urllib.error import HTTPError

import pytest
import diagnostico_estacao as dg
from diagnostico_http import classificar_corpo, contexto
from coleta_autonoma import ClienteAutonomo
from conferencia_piloto import ConferenciaIndisponivel


@pytest.mark.parametrize('body,esperado', [
    (b'{"detail":"estacao fora do piloto"}', 'estacao_fora_do_piloto'),
    (b'{"detail":"piloto sem empresa ou permissoes"}', 'piloto_sem_empresa_ou_permissoes'),
    (b'{"detail":"senha privada https://interno.invalid"}', 'nao_catalogado'),
    (b'<!DOCTYPE html><html>proxy usuario senha</html>', 'resposta_html'),
    (b'x'*5000, 'corpo_excede_limite'),
    (b'{"detail":{"token":"privado"}}', 'nao_catalogado'),
])
def test_so_motivos_catalogados_sao_retidos(body, esperado):
    stream=io.BytesIO(body)
    assert classificar_corpo(stream) == esperado
    assert stream.closed


def test_headers_proxy_sem_enderecos(monkeypatch):
    monkeypatch.setattr('urllib.request.getproxies',lambda:{'https':'http://usuario:senha@privado.invalid'})
    e=HTTPError('https://privado.invalid',403,'token',{'Server':'cloudflare','CF-Ray':'valor privado',
        'Via':'proxy secreto','Content-Type':'text/html','Set-Cookie':'senha'},None)
    r=dg._limpar(dict(id='D-123456789abc',quando='2026-10-13T12:00:00+00:00',
        **contexto(e,'GUSTAVO-PROD','Ingresso Ideal','destino desconhecido')))
    assert r['proxy_https_configurado'] is True and r['via_presente'] is True
    assert r['servidor_http']=='cloudflare' and r['destino_padrao'] is False
    assert r['estacao_enviada']=='GUSTAVO-PROD'
    assert not any(x in json.dumps(r) for x in ['privado','senha','secreto','Set-Cookie','usuario:'])


def test_captura_http_assincrona_preserva_409_e_fecha_stream(diagnosticos_isolados):
    liberar=threading.Event()
    class Lenta(io.BytesIO):
        def read1(self,n):
            assert threading.current_thread().name=='DiagnosticosNewProd'
            assert n==4097
            liberar.wait(5)
            return super().read1(n)
    stream=Lenta(b'{"detail":"responsavel sem permissao do piloto"}')
    def abrir(*a,**k):
        raise HTTPError('https://privado.invalid',403,'segredo',{'Content-Type':'application/json'},stream)
    c=ClienteAutonomo('example.invalid','Ingresso Ideal','GUSTAVO-PROD',segredo=lambda:'privado',abrir=abrir)
    try:
        with pytest.raises(ConferenciaIndisponivel) as exc:
            c.abrir_pedido('23381')
        from estatisticas_piloto import _erro_diagnosticado
        http=_erro_diagnosticado(409,'Pedido nao conferido',exc.value,'abrir-pedido',b'{"pedido":"23381"}')
        assert http.status_code==409
        assert http.headers['X-NewProd-Diagnostico']==exc.value.diagnostico_id
    finally:
        liberar.set()
    diagnosticos_isolados.fila.join()
    r=dg.resumo()['recentes'][0]
    assert r['motivo_http']=='responsavel_sem_permissao_do_piloto'
    assert r['http_origem']==403 and r['pedido']=='23381'
    assert stream.closed
    assert 'privado' not in json.dumps(r)
