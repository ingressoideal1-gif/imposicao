"""Relogio simulado: nenhuma rede, impressora ou espera real."""
import ast
from pathlib import Path
import sys
import threading
from types import SimpleNamespace


def test_primeira_e_proximas_atualizacoes_so_apos_seis_horas(monkeypatch):
    tree = ast.parse(Path('agent_worker.py').read_text(encoding='utf-8'))
    nodes = [n for n in tree.body if
        isinstance(n, ast.FunctionDef) and n.name == 'run_loop' or
        isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and
            t.id == 'INTERVALO_UPDATE_S' for t in n.targets)]
    clock = [0]
    chamadas = []
    class Encerrar(BaseException):
        pass
    def sleep(segundos):
        clock[0] += segundos
        if clock[0] > 43200:
            raise Encerrar()
    scope = dict(_loop_ativo=False, _loop_lock=threading.Lock(), AGENT_ID='sintetico',
        temp_manager=SimpleNamespace(iniciar_manutencao=lambda: None),
        time=SimpleNamespace(sleep=sleep),
        verificar_atualizacao=lambda: chamadas.append(clock[0]))
    for n in ('sync_heartbeat', '_sincronizar_catalogo_em_thread',
              '_sincronizar_fontes_em_thread', '_sincronizar_painel_em_thread',
              '_sincronizar_acessos_em_thread', 'process_queue'):
        scope[n] = lambda: None
    for n in ('INTERVALO_CATALOGO_S','INTERVALO_FONTES_S','INTERVALO_PAINEL_S','INTERVALO_ACESSOS_S'):
        scope[n] = 1000
    monkeypatch.setitem(sys.modules, 'gestao_estacoes', SimpleNamespace(iniciar_monitor=lambda: None))
    exec(compile(ast.Module(body=nodes, type_ignores=[]), 'worker_isolado', 'exec'), scope)
    try:
        scope['run_loop']()
    except Encerrar:
        pass
    assert chamadas == [21600, 43200]
