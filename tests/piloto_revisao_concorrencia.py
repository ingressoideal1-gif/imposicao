"""Ensaio manual: somente cluster sintetico local previamente preparado.

Recebe caminho do psql; porta fixa exclusiva do ensaio, sem credenciais reais.
Executar depois do teste SQL e reaplicar a migracao v2 no banco descartavel.
"""
import concurrent.futures
import json
import subprocess
import sys
import time

BASE = [sys.argv[1], '-X', '-qAt', '-h', '127.0.0.1', '-p', '55439',
        '-U', 'newprod_test', '-d', 'newprod_test_revisao', '-v', 'ON_ERROR_STOP=1']


def sql(statement):
    return subprocess.check_output(BASE + ['-c', statement], text=True).strip()


assert sql('SELECT current_database()') == 'newprod_test_revisao'


def receipt(revision=''):
    assert not revision or (len(revision) == 64 and all(c in '0123456789abcdef' for c in revision))
    return json.loads(sql("SELECT public.piloto_snapshot_pedido_v2('99','','test.supabase.co','" + revision + "')"))


def concurrent_visibility(statement):
    before = receipt()['revisao']
    writer = subprocess.Popen(BASE + ['-c', "SET application_name='newprod_revision_writer'; BEGIN; "
                                     + statement + '; SELECT pg_sleep(2); COMMIT;'],
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    try:
        deadline = time.monotonic() + 8
        while sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='newprod_revision_writer' AND wait_event='PgSleep'") != '1':
            assert writer.poll() is None, 'writer terminou antes da observacao'
            assert time.monotonic() < deadline, 'writer nao chegou a barreira'
            time.sleep(0.03)
        assert receipt(before)['sem_mudanca'], 'mudanca nao confirmada vazou'
        out, err = writer.communicate(timeout=10)
        assert writer.returncode == 0, (out, err)
        assert not receipt(before)['sem_mudanca'], 'commit nao invalidou'
    finally:
        if writer.poll() is None:
            writer.terminate()
            writer.wait(timeout=5)


concurrent_visibility('UPDATE public.pedidos_modelos SET quantidade=quantidade+1 WHERE id=10')
concurrent_visibility("UPDATE public.producao_numeracoes SET elements=jsonb_build_array(clock_timestamp()::text)")

# Duas origens distintas disputam o contador compartilhado, em transacoes curtas.
start_revision = int(sql('SELECT revisao FROM public.piloto_revisao_catalogo'))
statements = ["UPDATE public.produtos SET setor_pcp=clock_timestamp()::text WHERE id=1",
              "UPDATE storage.objects SET version=clock_timestamp()::text"]


def writes(statement):
    for _ in range(30):
        sql(statement)


started = time.monotonic()
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    list(pool.map(writes, statements))
assert int(sql('SELECT revisao FROM public.piloto_revisao_catalogo')) - start_revision == 60
print(json.dumps({'visibilidade_modelo': 'ok', 'visibilidade_catalogo': 'ok',
                  'incrementos_concorrentes': 60, 'sem_perdas': True,
                  'segundos_incluindo_abertura_psql': round(time.monotonic()-started, 3)}))
