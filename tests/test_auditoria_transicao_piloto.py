from datetime import datetime, timezone
from ferramentas.auditar_transicao_piloto import auditar


AGORA = datetime(2026, 10, 7, 15, tzinfo=timezone.utc)


def linha(nome='LASER-01 [Piloto]', quando='2026-10-07T14:59:50Z', fila=None):
    return dict(name=nome,last_seen=quando,printers_json=dict(
        gestao=dict(coletado_em=quando,fila_disponivel=True,fila=fila or {})))


def test_agrupa_sem_contar_instalacoes_como_estacoes():
    r=auditar([linha(),linha('LASER-01')],AGORA)
    assert len(r['estacoes'])==1
    assert len(r['estacoes'][0]['instalacoes'])==2
    assert not r['estacoes'][0]['migracao_autorizada_pelo_relatorio']


def test_sinal_antigo_ou_futuro_nao_comprova_fila_vazia():
    for quando in ('2026-10-07T12:00:00Z','2026-10-08T15:00:00Z',None):
        i=auditar([linha(quando=quando)],AGORA)['estacoes'][0]['instalacoes'][0]
        assert not i['presenca_recente'] and i['fila'] is None


def test_fila_ativa_impede_transicao():
    r=auditar([linha(fila={'imprimindo':1})],AGORA)['estacoes'][0]
    assert any('nao interromper' in p for p in r['pendencias'])


def test_fila_vazia_nao_e_preflight_de_motor_ou_backup():
    r=auditar([linha()],AGORA)['estacoes'][0]
    assert not r['migracao_autorizada_pelo_relatorio']
    assert any('motor, dados e backup' in p for p in r['pendencias'])


def test_coleta_antiga_com_heartbeat_novo_nao_e_fila_atual():
    l=linha();l['printers_json']['gestao']['coletado_em']='2026-10-07T12:00:00Z'
    assert not auditar([l],AGORA)['estacoes'][0]['instalacoes'][0]['fila_conhecida']
