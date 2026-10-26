"""Integration in a NEW temporary PostgreSQL cluster, loopback only; no remote access."""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
BIN = Path(sys.argv[1]).resolve()
WORK = Path(tempfile.mkdtemp(prefix='idgen-editor-test-'))
ENV = {k: v for k, v in os.environ.items() if not k.upper().startswith('PG')}
with socket.socket() as s:
    s.bind(('127.0.0.1', 0))
    PORT = s.getsockname()[1]

def run(exe, *args, source=None, error=None):
    with tempfile.TemporaryFile() as out, tempfile.TemporaryFile() as err:
        p = subprocess.run([str(BIN / exe), *map(str, args)], input=source, text=True,
            encoding='utf-8', env=ENV, stdout=out, stderr=err, timeout=45,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0)
        out.seek(0); err.seek(0)
        stdout = out.read().decode('utf-8'); stderr = err.read().decode('utf-8')
    if error:
        assert p.returncode and error in stderr, (stdout, stderr)
    else:
        assert p.returncode == 0, stderr
    return stdout.strip()

def sql(source, error=None):
    return run('psql.exe', '-X', '-h', '127.0.0.1', '-p', PORT, '-U', 'postgres', '-d', 'postgres',
        '-qAt', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', source=source, error=error)

actor = '00000000-0000-4000-8000-000000000001'
order = '00000000-0000-4000-8000-000000000002'
def call(action, data, role='service_role', error=None):
    payload = json.dumps(data).replace("'", "''")
    result = sql(f"SET ROLE {role}; SELECT public.idgen_editor_operar('{actor}', '{action}', '{payload}');", error)
    return json.loads(result) if not error else None

started = False
try:
    run('initdb.exe', '-D', WORK / 'data', '-U', 'postgres', '--auth=trust', '--encoding=UTF8', '--locale=C')
    run('pg_ctl.exe', '-D', WORK / 'data', '-l', WORK / 'postgres.log', '-o', f'-h 127.0.0.1 -p {PORT}', '-w', 'start')
    started = True
    sql(f"""
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE public.imposition_user_permissions(user_id uuid, role text);
    INSERT INTO public.imposition_user_permissions VALUES ('{actor}', 'admin');
    CREATE TABLE public.clientes(id_cliente bigint PRIMARY KEY, nome text, fantasia text);
    INSERT INTO public.clientes VALUES (42, 'Cliente Sintetico', 'Teste');
    INSERT INTO public.clientes VALUES (1, 'Cliente um', 'Um'), (142, 'Nome com 42', '42');
    CREATE TABLE public.pedidos_modelos(id bigint PRIMARY KEY, nome_modelo text);
    INSERT INTO public.pedidos_modelos VALUES (1, 'Preservar');
    """)
    sql((ROOT / 'sql/idgen_pedidos_editor.sql').read_text(encoding='utf-8'))
    sql((ROOT / 'sql/idgen_cliente_por_numero.sql').read_text(encoding='utf-8'))
    before = sql("SELECT pg_get_functiondef('public.idgen_editor_operar(uuid,text,jsonb)'::regprocedure);")
    acl_before = sql("SELECT proacl::text FROM pg_proc WHERE oid='public.idgen_editor_operar(uuid,text,jsonb)'::regprocedure;")
    correction = (ROOT / 'sql/idgen_conflito_sem_retry_20261026.sql').read_text(encoding='utf-8')
    sql(correction)
    sql(correction)  # reexecutar não altera outras regras
    after = sql("SELECT pg_get_functiondef('public.idgen_editor_operar(uuid,text,jsonb)'::regprocedure);")
    assert after == before.replace("ERRCODE = '40001'", "ERRCODE = 'PT409'")
    assert acl_before == sql("SELECT proacl::text FROM pg_proc WHERE oid='public.idgen_editor_operar(uuid,text,jsonb)'::regprocedure;")
    call('listar', {}, role='anon', error='42501')
    call('listar', {}, role='authenticated', error='42501')
    sql('SET ROLE service_role; SELECT * FROM idgen_app.pedidos_editor;', error='42501')
    assert [c['id_cliente'] for c in call('clientes', {'busca': '42'})] == [42]
    assert call('clientes', {'busca': '1'})[0]['id_cliente'] == 1
    assert call('clientes', {'busca': '0042'})[0]['id_cliente'] == 42
    assert call('clientes', {'busca': '4'}) == []
    for invalido in ['Teste', '', '0', '-1', '4.2', '2147483648']:
        call('clientes', {'busca': invalido}, error='22023')
    call('criar', {'id': order, 'cliente_id': 43, 'nome': 'Teste'}, error='22023')
    data = {'id': order, 'cliente_id': 42, 'nome': 'Teste'}
    created = call('criar', data)
    assert call('criar', data) == created  # retry is idempotent
    call('criar', {**data, 'nome': 'Outro'}, error='23505')
    doc = created['documento']; doc['modelos'] = [{'id': 'modelo-sintetico', 'arte_escala_h': 110}]
    changed = call('salvar', {'id': order, 'revisao': 1, 'documento': doc})
    assert changed['revisao'] == 2 and changed['documento'] == doc
    call('salvar', {'id': order, 'revisao': 1, 'documento': {}}, error='22023')
    call('salvar', {'id': order, 'revisao': 1, 'documento': doc}, error='PT409')
    assert call('abrir', {'id': order}) == changed
    sql(f"UPDATE public.imposition_user_permissions SET role='operador' WHERE user_id='{actor}';")
    call('listar', {}, error='42501')
    assert sql('SELECT nome_modelo FROM public.pedidos_modelos WHERE id=1;') == 'Preservar'
    assert sql('SELECT count(*) FROM public.clientes;') == '3'
    print('PASS: migration, ACL, role, client lookup, idempotency, exact save, revision conflict, legacy preservation')
    print('Evidence:', WORK)
finally:
    if started:
        run('pg_ctl.exe', '-D', WORK / 'data', '-m', 'fast', '-w', 'stop')
