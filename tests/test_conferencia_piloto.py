from datetime import datetime, timezone, timedelta
import io
import json

from fastapi import FastAPI
from fastapi.testclient import TestClient
import pytest

from conferencia_piloto import ConferidorPiloto, ConferenciaIndisponivel
from pacotes_api import ServicoPacotes, criar_router
from test_antecipacao_local import candidato
from test_pacotes_api import TOKEN


def recibo():
    return dict(empresa='teste', modelo='10', digest='a' * 64, aprovacao='APROVADO',
                conferido_em=datetime.now(timezone.utc).isoformat(),
                execucao_offline=False, aprovacao_versionada=False)


def test_encaminha_sessao_apenas_no_cabecalho():
    def abrir(req, timeout):
        assert timeout == 20
        assert req.get_header('Authorization') == 'Bearer sintetica'
        assert 'sintetica' not in req.data.decode()
        assert req.full_url == 'https://test.invalid/functions/v1/piloto-local/conferir-sessao'
        return io.BytesIO(json.dumps(recibo()).encode())
    assert ConferidorPiloto('test.invalid', abrir=abrir)(candidato(), 'Bearer sintetica')


@pytest.mark.parametrize('alterar', [lambda r: r.update(empresa='outra'),
    lambda r: r.update(digest='b'*64), lambda r: r.update(modelo='11'),
    lambda r: r.update(execucao_offline=True), lambda r: r.update(aprovacao_versionada=True),
    lambda r: r.update(aprovacao='EM ARTE'),
    lambda r: r.update(conferido_em=(datetime.now(timezone.utc)-timedelta(minutes=3)).isoformat()),
    lambda r: r.update(conferido_em='sem-data')])
def test_recibo_divergente_ou_vencido_nao_confirma(alterar):
    r = recibo(); alterar(r)
    conferir = ConferidorPiloto('test.invalid', abrir=lambda *a, **k: io.BytesIO(json.dumps(r).encode()))
    with pytest.raises(ConferenciaIndisponivel): conferir(candidato(), 'Bearer sintetica')


def test_api_nao_persiste_sem_conferencia_e_recusa_rota_alternativa(tmp_path):
    def abrir(*a, **k):
        raise OSError('erro remoto com dado que nao deve ser divulgado')
    servico = ServicoPacotes(tmp_path, host='test.invalid', empresa='teste',
                            conferir=ConferidorPiloto('test.invalid', abrir=abrir))
    app = FastAPI(); app.include_router(criar_router(servico, TOKEN))
    with TestClient(app, client=('127.0.0.1', 12345)) as c:
        h = {'X-NewProd-Piloto': TOKEN, 'Authorization': 'Bearer sintetica'}
        r = c.post('/api/pacotes-locais/antecipacao', json=candidato(), headers=h)
        assert r.status_code == 409 and 'erro remoto' not in r.text
        assert not (tmp_path / 'catalogo.sqlite3').exists()
        m = dict(schema=1, empresa='teste', modelo='10', revisao='r',
                 arquivos={'frente': None, 'verso': None}, configuracao={'tipo': 'antecipacao_online'})
        assert c.post('/api/pacotes-locais/catalogo', json={'manifesto':m, 'fontes':{}}, headers=h).status_code == 400


def test_recibo_guardado_sem_credencial_nem_autorizacao_offline(tmp_path):
    servico = ServicoPacotes(tmp_path, host='test.invalid', empresa='teste',
        conferir=ConferidorPiloto('test.invalid', abrir=lambda *a, **k: io.BytesIO(json.dumps(recibo()).encode())))
    r = servico.antecipar(candidato(), 'Bearer NAO-GRAVAR-SESSAO')
    assert r['origem_conferida_em']
    assert servico.estado_modelo('10', r['revisao'])['origem_conferida_em']
    assert not r['execucao_offline']
    assert b'NAO-GRAVAR-SESSAO' not in (tmp_path / 'catalogo.sqlite3').read_bytes()


def test_conferencia_vencida_nao_admite_nova_preparacao(tmp_path):
    servico = ServicoPacotes(tmp_path, host='test.invalid', empresa='teste',
        conferir=ConferidorPiloto('test.invalid', abrir=lambda *a, **k: io.BytesIO(json.dumps(recibo()).encode())))
    r = servico.antecipar(candidato(), 'Bearer sintetica')
    con = servico._db()
    con.execute('UPDATE conferencias SET quando=?', ((datetime.now(timezone.utc)-timedelta(minutes=6)).isoformat(),))
    con.commit(); con.close()
    servico.atualizar_fila()
    assert servico.preparador.resumo()['pendentes'] == 0
    assert servico.estado_modelo('10', r['revisao'])['conferencia_online_pendente']
    servico.antecipar(candidato(), 'Bearer sintetica')
    servico.atualizar_fila()
    assert servico.preparador.resumo()['pendentes'] == 1
