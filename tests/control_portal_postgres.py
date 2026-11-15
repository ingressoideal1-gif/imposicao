"""PostgreSQL portátil em loopback, dados fictícios e conexões concorrentes.

Uso: python tests/control_portal_postgres.py CAMINHO_ABSOLUTO_PSQL
Não recebe DSN remoto; preserva o cluster parado em TEMP para diagnóstico.
"""
import concurrent.futures
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[1]
BIN = Path(sys.argv[1]).resolve(strict=True).parent
OUT = Path(tempfile.mkdtemp(prefix="ideal-control-portal-test-"))
ENV = {k: v for k, v in os.environ.items() if not k.upper().startswith('PG')}
ENV['PGCLIENTENCODING'] = 'UTF8'
HIDDEN = subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0
with socket.socket() as sock:
    sock.bind(('127.0.0.1', 0))
    PORT = sock.getsockname()[1]
BASE = [BIN/'psql.exe', '-X', '-qAt', '-h', '127.0.0.1', '-p', PORT, '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']

def run(args, **kwargs):
    if Path(str(args[0])).name == 'pg_ctl.exe':
        # O servidor filho não deve herdar PIPE e manter communicate aberto.
        with (OUT/'pg_ctl.log').open('w',encoding='utf-8') as log:
            r = subprocess.run(list(map(str,args)),env=ENV,creationflags=HIDDEN,
                               stdout=log,stderr=log,timeout=60)
        r.stderr = (OUT/'pg_ctl.log').read_text(encoding='utf-8',errors='replace')
        return r
    return subprocess.run(list(map(str,args)), env=ENV, creationflags=HIDDEN,
                          capture_output=True, text=True, encoding='utf-8', timeout=60, **kwargs)

def sql(query, ok=True):
    r = run(BASE, input=query)
    assert (r.returncode == 0) == ok, r.stderr
    return r.stdout.strip()

def call(n=1, create=True, token=None):
    flag = 'NULL' if create is None else str(create).lower()
    return json.loads(sql(f"SET ROLE service_role; SELECT ideal_control_portal('{n}','{token or 'ficticio-'+str(n)}',{flag});"))

def seed(n, printed=True, second=False):
    status = 'Impresso' if printed else 'Aguardando'
    sql(f"""INSERT INTO propostas VALUES({n},{n},'EM PRODUCAO');
    INSERT INTO pedidos_links_cliente(numero_pedido,token,ativo) VALUES('{n}','ficticio-{n}',true);
    INSERT INTO pedidos_artes(id_int,nome_evento) VALUES({n},'Evento fictício');
    INSERT INTO pedidos_modelos(id,id_int,nome_modelo,quantidade,amostra_num_id,status_impressao) VALUES({n*10},{n},'Pista',2,'00000000-0000-4000-8000-000000000001','{status}');
    INSERT INTO producao_acesso_pedidos(pedido_id_int,sal,publicado_em,total_credenciais)
      VALUES({n},repeat('a',64),now(),2);
    INSERT INTO producao_acesso_credenciais(pedido_id_int,modelo_id,numero,codigo_hash)
      VALUES({n},{n*10},1,'hash-ficticio-1'),({n},{n*10},2,'hash-ficticio-2');
    INSERT INTO producao_acesso_qr_contratos VALUES({n},{n*10});
    INSERT INTO ideal_control_portal_pedidos VALUES({n},true);""")
    if second:
        sql(f"""INSERT INTO pedidos_modelos(id,id_int,nome_modelo,quantidade,amostra_num_id,status_impressao) VALUES({n*10+1},{n},'VIP',1,'00000000-0000-4000-8000-000000000001','Impresso');
        INSERT INTO producao_acesso_credenciais(pedido_id_int,modelo_id,numero,codigo_hash) VALUES({n},{n*10+1},1,'hash-ficticio-3');
        UPDATE producao_acesso_pedidos SET total_credenciais=3 WHERE pedido_id_int={n};""")

checks = []
started = False
try:
    r = run([BIN/'initdb.exe','-D',OUT/'data','-U','postgres','-A','trust','--encoding=UTF8',
             '--locale-provider=builtin','--builtin-locale=C.UTF-8'])
    assert r.returncode == 0, r.stderr
    r = run([BIN/'pg_ctl.exe','-D',OUT/'data','-l',OUT/'postgres.log','-o',f'-h 127.0.0.1 -p {PORT}','-w','start'])
    assert r.returncode == 0, r.stderr
    started = True
    sql((ROOT/'tests/control_portal_fixture.sql').read_text(encoding='utf-8'))
    sql((ROOT/'sql/ideal_control_portal_piloto.sql').read_text(encoding='utf-8'))
    preparation = (ROOT/'sql/ideal_control_preparacao_nuvem.sql').read_text(encoding='utf-8')
    sql(preparation[preparation.index('CREATE TABLE public.producao_acesso_preparacoes'):].replace('COMMIT;', ''))
    sql("INSERT INTO producao_numeracoes(id,elements) VALUES('00000000-0000-4000-8000-000000000001','[{\"type\":\"QR_IDEAL\"}]');")
    seed(1)
    assert call()['disponivel'] is False
    sql('UPDATE ideal_control_portal_config SET habilitado=true;')
    assert call(1,False)['estado'] == 'pronto'
    assert call(1,None)['estado'] == 'pronto'
    assert sql('SELECT count(*) FROM producao_acesso_eventos;') == '0'
    checks.append('desligado e consulta sem escrita')
    assert call(1,True,'invalido')['disponivel'] is False
    seed(2)
    sql('UPDATE pedidos_links_cliente SET ativo=false WHERE numero_pedido=\'2\';')
    assert call(2)['disponivel'] is False
    checks.append('link errado e revogado')
    seed(3,False)
    assert call(3)['estado'] == 'aguardando_impressao'
    seed(4,second=True)
    sql("UPDATE pedidos_modelos SET status_impressao='Aguardando' WHERE id=41;")
    assert call(4)['estado'] == 'aguardando_impressao'
    seed(5)
    sql('DELETE FROM producao_acesso_credenciais WHERE pedido_id_int=5 AND numero=2;')
    assert call(5)['estado'] == 'conferir_evento'
    checks.append('PDF sem impressão, impressão parcial e publicação incompleta')
    # Duas conexões reais: a primeira mantém a transação aberta após criar.
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        a = pool.submit(sql,"BEGIN; SET LOCAL ROLE service_role; SELECT ideal_control_portal('1','ficticio-1',true)->>'estado'; SELECT pg_sleep(0.3); COMMIT;")
        b = pool.submit(call,1)
        assert 'criado' in a.result() and b.result()['estado'] == 'criado'
    assert sql('SELECT count(*) FROM producao_acesso_eventos;') == '1'
    assert sql('SELECT count(*) FROM producao_acesso_convites_evento;') == '1'
    assert call(1,False)['qr'] == call(1)['qr']
    checks.append('concorrência real, evento único e QR estável')
    seed(6,second=True)
    sql("""CREATE FUNCTION falha_simulada() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.modelo_id=61 THEN RAISE EXCEPTION 'falha simulada'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER falha_simulada BEFORE INSERT ON producao_acesso_setores FOR EACH ROW EXECUTE FUNCTION falha_simulada();""")
    sql("SET ROLE service_role; SELECT ideal_control_portal('6','ficticio-6',true);",ok=False)
    assert sql('SELECT count(*) FROM producao_acesso_eventos WHERE id_cliente=6;') == '0'
    assert sql('SELECT count(*) FROM producao_acesso_setores WHERE pedido_id_int=6;') == '0'
    assert sql('SELECT count(*) FROM producao_acesso_credenciais WHERE pedido_id_int=6 AND evento_id IS NOT NULL;') == '0'
    sql('DROP TRIGGER falha_simulada ON producao_acesso_setores;')
    assert call(6)['estado'] == 'criado'
    checks.append('falha entre setores com rollback integral e retomada')
    sql('UPDATE producao_acesso_convites_evento SET revogado_em=now();')
    assert call(1)['estado'] == 'acesso_revogado'
    assert sql('SELECT count(*) FROM producao_acesso_convites_evento;') == '2'
    checks.append('revogação não gera convite substituto')
    sql('SET ROLE anon; SELECT segredo FROM ideal_control_portal_convites;',ok=False)
    sql('SET ROLE authenticated; UPDATE ideal_control_portal_config SET habilitado=false;',ok=False)
    before = sql('SELECT count(*) FROM producao_acesso_eventos;')
    sql('UPDATE ideal_control_portal_config SET habilitado=false;')
    assert call(6)['disponivel'] is False
    assert sql('SELECT count(*) FROM producao_acesso_eventos;') == before
    checks.append('tabelas privadas e desligamento sem apagar eventos')
    sql('UPDATE ideal_control_portal_config SET habilitado=true;')
    seed(7)
    sql('UPDATE ideal_control_portal_pedidos SET habilitado=false WHERE pedido_id_int=7;')
    assert call(7)['disponivel'] is False
    seed(8)
    sql("UPDATE propostas SET status_interno='CANCELADO' WHERE id_int=8;")
    assert call(8)['estado'] == 'indisponivel'
    seed(9)
    sql('DELETE FROM producao_acesso_pedidos WHERE pedido_id_int=9;')
    assert call(9,False)['estado'] == 'pronto'
    sql('DELETE FROM producao_acesso_credenciais WHERE pedido_id_int=9;')
    sql('DELETE FROM producao_acesso_qr_contratos WHERE pedido=9;')
    assert call(9)['estado'] == 'conferir_emissao'
    assert sql('SELECT count(*) FROM producao_acesso_eventos WHERE id_cliente=9;') == '0'
    sql('INSERT INTO producao_acesso_qr_contratos VALUES(9,90);')
    preparing = call(9)
    assert preparing['estado'] == 'preparando' and 'qr' not in preparing
    assert call(9)['evento_id'] == preparing['evento_id']
    assert sql('SELECT count(*) FROM ideal_control_portal_convites WHERE pedido_id_int=9;') == '0'
    sql("SET ROLE anon; SELECT ideal_control_portal('9','ficticio-9',true);",ok=False)
    event = preparing['evento_id']
    state = json.loads(sql(f"SELECT producao_acesso_preparar_lote('{event}',9);"))
    sector = sql('SELECT id FROM producao_acesso_setores WHERE pedido_id_int=9;')
    plan = json.dumps([{'modelo':90,'quantidade':2,'setor':sector}])
    sql(f"SELECT producao_acesso_preparar_lote('{event}',9,'{state['fonte_hash']}','{plan}');")
    items = json.dumps([{'modelo':90,'numero':1,'hash':'a'*64}])
    sql(f"SELECT producao_acesso_preparar_lote('{event}',9,'{state['fonte_hash']}',NULL,0,'{items}');")
    assert call(9)['estado'] == 'preparando' and 'qr' not in call(9)
    # Repetição do lote anterior não duplica nem avança o cursor.
    sql(f"SELECT producao_acesso_preparar_lote('{event}',9,'{state['fonte_hash']}',NULL,0,'{items}');")
    assert sql('SELECT count(*) FROM producao_acesso_credenciais WHERE pedido_id_int=9;') == '1'
    items = json.dumps([{'modelo':90,'numero':2,'hash':'b'*64}])
    sql(f"SELECT producao_acesso_preparar_lote('{event}',9,'{state['fonte_hash']}',NULL,1,'{items}');")
    assert call(9)['estado'] == 'criado'
    checks.append('pedido fora do piloto, cancelado e sem publicação')
    seed(10)
    original = call(10)
    sql("""DELETE FROM ideal_control_portal_convites WHERE pedido_id_int=10;
      UPDATE producao_acesso_setores SET nome='Nome preservado' WHERE pedido_id_int=10;""")
    assert call(10,False)['estado'] == 'evento_existente'
    assert call(10)['estado'] == 'criado'
    assert sql('SELECT count(*) FROM producao_acesso_eventos WHERE id_cliente=10;') == '1'
    assert sql('SELECT nome FROM producao_acesso_setores WHERE pedido_id_int=10;') == 'Nome preservado'
    sql('UPDATE producao_acesso_eventos SET id_cliente=999 WHERE id_cliente=10;')
    assert call(10)['estado'] == 'evento_indisponivel'
    checks.append('evento existente preservado e cliente divergente bloqueado')
    seed(11)
    sql('UPDATE producao_acesso_credenciais SET numero=3 WHERE pedido_id_int=11 AND numero=2;')
    assert call(11)['estado'] == 'conferir_evento'
    seed(12)
    sql("UPDATE producao_acesso_pedidos SET status='inativo' WHERE pedido_id_int=12;")
    assert call(12)['estado'] == 'acesso_revogado'
    seed(13)
    sql('UPDATE producao_acesso_pedidos SET qr_revogado_em=now() WHERE pedido_id_int=13;')
    assert call(13)['estado'] == 'acesso_revogado'
    checks.append('faixa ordinal incompleta, pedido inativo e QR do pedido revogado')
    # Segunda migração: primeira emissão automática após marcar Impresso.
    for f in ['tests/control_portal_qr_fixture.sql','tests/control_portal_qr_baseline.sql',
              'sql/ideal_control_portal_emissao_automatica.sql']:
        sql((ROOT/f).read_bytes().decode('utf-8'))
    def empty(n):
        seed(n)
        sql(f"DELETE FROM producao_acesso_credenciais WHERE pedido_id_int={n}; DELETE FROM producao_acesso_pedidos WHERE pedido_id_int={n}; DELETE FROM producao_acesso_qr_contratos WHERE pedido={n};")
    empty(14)
    assert call(14,False)['estado'] == 'pronto'
    assert sql('SELECT count(*) FROM producao_acesso_qr_contratos WHERE pedido=14;') == '0'
    # A API das estações conserva a proteção anterior.
    sql('SELECT producao_acesso_qr_contratos_obter(14);',ok=False)
    sql('SET ROLE service_role; SELECT ideal_control_portal_reservar_qr(14);',ok=False)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        a=pool.submit(call,14)
        b=pool.submit(call,14)
        assert a.result()['evento_id'] == b.result()['evento_id']
    assert sql('SELECT count(*) FROM producao_acesso_qr_contratos WHERE pedido=14 AND versao=2;') == '1'
    assert sql('SELECT count(*) FROM producao_acesso_qr_reservas WHERE pedido=14;') == '1'
    original=sql('SELECT row_to_json(c)::text FROM producao_acesso_qr_contratos c WHERE pedido=14;')
    assert call(14)['estado'] == 'preparando'
    assert sql('SELECT row_to_json(c)::text FROM producao_acesso_qr_contratos c WHERE pedido=14;') == original
    empty(15)
    assert call(15)['estado'] == 'preparando'
    assert sql("SELECT count(*) FROM producao_acesso_qr_reservas a JOIN producao_acesso_qr_reservas b ON a.modelo<b.modelo AND a.faixa && b.faixa;") == '0'
    # Divergência de fonte não substitui o contrato nem expõe QR.
    sql('UPDATE pedidos_modelos SET numeracao_inicio=2 WHERE id=140;')
    sql("SET ROLE service_role; SELECT ideal_control_portal('14','ficticio-14',true);",ok=False)
    assert sql('SELECT row_to_json(c)::text FROM producao_acesso_qr_contratos c WHERE pedido=14;') == original
    empty(16)
    sql("UPDATE pedidos_links_cliente SET ativo=false WHERE numero_pedido='16';")
    assert call(16)['disponivel'] is False
    assert sql('SELECT count(*) FROM producao_acesso_qr_reservas WHERE pedido=16;') == '0'
    empty(17)
    sql("UPDATE pedidos_modelos SET amostra_num_id=NULL WHERE id=170;")
    assert call(17)['estado'] == 'sem_codigos'
    empty(18)
    sql("UPDATE producao_acesso_qr_controle SET ativo=false;")
    sql("SET ROLE service_role; SELECT ideal_control_portal('18','ficticio-18',true);",ok=False)
    assert sql('SELECT count(*) FROM producao_acesso_eventos WHERE id_cliente=18;') == '0'
    assert sql('SELECT count(*) FROM producao_acesso_setores WHERE pedido_id_int=18;') == '0'
    sql("UPDATE producao_acesso_qr_controle SET ativo=true;")
    assert call(18)['estado'] == 'preparando'
    seed(19,second=True)
    sql('DELETE FROM producao_acesso_credenciais WHERE pedido_id_int=19; DELETE FROM producao_acesso_pedidos WHERE pedido_id_int=19; DELETE FROM producao_acesso_qr_contratos WHERE pedido=19;')
    sql("""CREATE FUNCTION falha_reserva_simulada() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.modelo=191 THEN RAISE EXCEPTION 'falha segunda reserva'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER falha_reserva_simulada BEFORE INSERT ON producao_acesso_qr_contratos FOR EACH ROW EXECUTE FUNCTION falha_reserva_simulada();""")
    sql("SET ROLE service_role; SELECT ideal_control_portal('19','ficticio-19',true);",ok=False)
    assert sql('SELECT count(*) FROM producao_acesso_qr_contratos WHERE pedido=19;') == '0'
    assert sql('SELECT count(*) FROM producao_acesso_qr_reservas WHERE pedido=19;') == '0'
    assert sql('SELECT count(*) FROM producao_acesso_eventos WHERE id_cliente=19;') == '0'
    sql('DROP TRIGGER falha_reserva_simulada ON producao_acesso_qr_contratos;')
    assert call(19)['estado'] == 'preparando'
    assert sql('SELECT count(*) FROM producao_acesso_qr_contratos WHERE pedido=19;') == '2'
    checks.append('emissão automática concorrente, faixa exclusiva, consulta sem escrita, contrato imutável, divergência e rollback')
    # Terceira migração: todos os pedidos, inclusive criados depois da ativação.
    sql((ROOT/'sql/ideal_control_portal_todos_pedidos.sql').read_bytes().decode('utf-8'))
    empty(20)
    sql('DELETE FROM ideal_control_portal_pedidos WHERE pedido_id_int=20;')
    assert call(20,False)['estado'] == 'pronto'
    assert sql('SELECT count(*) FROM producao_acesso_qr_contratos WHERE pedido=20;') == '0'
    assert call(20,True,'errado')['disponivel'] is False
    assert call(20)['estado'] == 'preparando'
    assert sql('SELECT count(*) FROM producao_acesso_qr_contratos WHERE pedido=20;') == '1'
    empty(21)
    sql("DELETE FROM ideal_control_portal_pedidos WHERE pedido_id_int=21; UPDATE pedidos_modelos SET status_impressao='Aguardando' WHERE id=210;")
    assert call(21)['estado'] == 'aguardando_impressao'
    sql("UPDATE pedidos_links_cliente SET ativo=false WHERE numero_pedido='20';")
    assert call(20)['disponivel'] is False
    sql("UPDATE pedidos_links_cliente SET ativo=true WHERE numero_pedido='20';")
    before=sql('SELECT count(*) FROM producao_acesso_eventos;')
    sql('UPDATE ideal_control_portal_config SET habilitado=false;')
    assert call(20)['disponivel'] is False
    assert sql('SELECT count(*) FROM producao_acesso_eventos;') == before
    sql('UPDATE ideal_control_portal_config SET habilitado=true,todos_pedidos=false;')
    assert call(20)['disponivel'] is False
    assert call(19)['estado'] == 'preparando'
    sql('UPDATE ideal_control_portal_config SET todos_pedidos=true;')
    assert call(20)['estado'] == 'preparando'
    sql('SET ROLE anon; UPDATE ideal_control_portal_config SET todos_pedidos=true;',ok=False)
    sql('SET ROLE service_role; SELECT ideal_control_portal_reservar_qr(20);',ok=False)
    checks.append('liberação geral, pedido futuro sem allowlist, impressão pendente, link revogado, desligamento e retorno ao piloto')
    print(json.dumps({'resultado':'OK','verificacoes':checks,'cluster':str(OUT)},ensure_ascii=False))
finally:
    if started:
        stop = run([BIN/'pg_ctl.exe','-D',OUT/'data','-m','fast','-w','stop'])
        assert stop.returncode == 0, stop.stderr
