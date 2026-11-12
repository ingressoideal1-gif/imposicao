"""PostgreSQL descartavel em loopback; duas conexoes reais, sem credenciais.

Uso: python tests/arte_transicao_postgres.py CAMINHO_ABSOLUTO_PSQL
Preserva o cluster parado em TEMP para diagnostico.
"""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[1]
PSQL = Path(sys.argv[1]).resolve(strict=True)
BIN = PSQL.parent
OUT = Path(tempfile.mkdtemp(prefix="ideal-arte-transicao-"))
ENV = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
ENV["PGCLIENTENCODING"] = "UTF8"
HIDDEN = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    PORT = sock.getsockname()[1]
BASE = [str(PSQL), "-X", "-h", "127.0.0.1", "-p", str(PORT), "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"]


def run(args, **kw):
    return subprocess.run(list(map(str, args)), capture_output=True, text=True, encoding="utf-8", env=ENV,
                          creationflags=HIDDEN, timeout=30, **kw)


def sql(query, ok=True):
    r = run(BASE, input=query)
    assert (r.returncode == 0) == ok, r.stderr + r.stdout
    return r.stdout.strip() if ok else r.stderr


def seed(n=1, status="Em Alteração", model="REPROVADA_CLIENTE"):
    sql(f"""INSERT INTO propostas VALUES({n},{n},'NOVO');
    INSERT INTO pedidos_artes(id,id_int,status) VALUES({n},{n},'{status}');
    INSERT INTO pedidos_modelos VALUES({n},{n},'{model}',NULL,NULL);
    INSERT INTO pedidos_links_cliente VALUES({n},'{n}','{n}',true,'Em Alteração',now(),NULL);""")


def revision(n=1):
    return sql(f"SET ROLE authenticated; SELECT arte_transicao_ler({n})->>'revisao';")


def call(n=1, action="pronto", rev=None):
    rev = rev or revision(n)
    return f"SELECT arte_transicao_confirmar({n},'{rev}','{action}',{n},'sintetico');"


def states(n=1):
    return json.loads(sql(f"""SELECT json_build_array(
    (SELECT status FROM pedidos_artes WHERE id_int={n}),
    (SELECT status_arte FROM pedidos_modelos WHERE id={n}),
    (SELECT status_arte FROM pedidos_links_cliente WHERE id={n}));"""))


processes = []
started = False
checks = []
try:
    r = run([BIN / "initdb.exe", "-D", OUT / "data", "-U", "postgres", "-A", "trust", "--encoding=UTF8", "--locale-provider=builtin", "--builtin-locale=C.UTF-8"])
    assert r.returncode == 0, r.stderr
    with (OUT / "startup.log").open("w") as log:
        subprocess.run(list(map(str, [BIN / "pg_ctl.exe", "-D", OUT / "data", "-l", OUT / "server.log",
            "-o", f"-h 127.0.0.1 -p {PORT}", "-w", "start"])), stdout=log, stderr=log,
            env=ENV, creationflags=HIDDEN, timeout=30, check=True)
    started = True
    sql((ROOT / "tests/arte_transicao_fixture.sql").read_text(encoding="utf-8"))
    sql((ROOT / "sql/arte_transicao_concorrente.sql").read_text(encoding="utf-8"))
    seed()
    stale = revision()
    sql("SET ROLE authenticated;" + call())
    assert states() == ["Enviar Arte", "AGUARDANDO_CLIENTE", "Enviar Arte"]
    assert sql("SELECT cliente_abriu_em IS NULL AND arte_pronta_em IS NOT NULL FROM pedidos_links_cliente WHERE id=1;") == "t"
    checks.append("pronto atomico e nova versao do link")
    assert "outra tela" in sql("SET ROLE authenticated;" + call(action="reconciliar", rev=stale), ok=False)
    assert states()[0] == "Enviar Arte"
    checks.append("aba antiga rejeitada por revisao")
    assert "antiga recusada" in sql("UPDATE pedidos_artes SET status='Em Alteração' WHERE id=1;", ok=False)
    checks.append("PATCH de aba antiga bloqueado no banco")
    sql("UPDATE pedidos_artes SET status='Em Alteração',reprovacao_acao='10000000-0000-0000-0000-000000000001' WHERE id=1;")
    assert states()[0] == "Em Alteração"
    checks.append("nova alteracao explicita permitida")
    seed(2)
    sql("DELETE FROM pedidos_links_cliente WHERE id=2;")
    before = states(2)
    assert "Link ativo" in sql("SET ROLE authenticated;" + call(2), ok=False)
    assert states(2) == before
    checks.append("falha no link desfaz modelo e status geral")
    seed(3)
    sql("UPDATE propostas SET status_interno='CANCELADA' WHERE id=3;")
    assert "cancelado" in sql("SET ROLE authenticated;" + call(3), ok=False)
    checks.append("cancelado recusado")
    seed(4, model="APROVADA")
    assert "aprovado" in sql("SET ROLE authenticated;" + call(4), ok=False)
    checks.append("aprovacao preservada")
    seed(5)
    sql("UPDATE pedidos_modelos SET status_impressao='Corrigir Arte' WHERE id=5;")
    sql("SET ROLE authenticated;" + call(5))
    assert states(5) == ["Dados Pendentes", "APROVADA", "Em Alteração"]
    assert sql("SELECT status_impressao FROM pedidos_modelos WHERE id=5;") == "Aguardando"
    checks.append("correcao de producao preserva aprovacao e nao reinicia link")
    seed(6)
    sql("INSERT INTO pedidos_modelos VALUES(60,6,'REPROVADA_CLIENTE',NULL,NULL);")
    sql("SET ROLE authenticated;" + call(6))
    assert states(6) == ["Em Alteração", "AGUARDANDO_CLIENTE", "Em Alteração"]
    checks.append("modelo restante reprovado impede promover pedido")
    seed(7)
    rev = revision(7)
    # A segunda conexao espera a transacao da primeira e deve reler a revisao.
    p = subprocess.Popen(BASE, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                         text=True, encoding="utf-8", env=ENV, creationflags=HIDDEN)
    processes.append(p)
    p.stdin.write("SET application_name='arte_primeira_aba'; SET ROLE authenticated; BEGIN;" + call(7, rev=rev) + "SELECT pg_sleep(2); COMMIT;")
    p.stdin.close()
    p.stdin = None
    until = time.monotonic() + 8
    while sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='arte_primeira_aba' AND wait_event='PgSleep';") != "1":
        assert time.monotonic() < until
        time.sleep(.05)
    error = sql("SET ROLE authenticated;" + call(7, action="reconciliar", rev=rev), ok=False)
    stdout, stderr = p.communicate(timeout=10)
    assert p.returncode == 0, stderr
    assert "outra tela" in error, error
    assert states(7)[0] == "Enviar Arte"
    checks.append("duas conexoes simultaneas: revisao relida apos espera")
    seed(8)
    rev = revision(8)
    sql("INSERT INTO pedidos_modelos VALUES(80,8,'REPROVADA_CLIENTE',NULL,NULL);")
    assert "outra tela" in sql("SET ROLE authenticated;" + call(8, rev=rev), ok=False)
    checks.append("insercao concorrente detectada")
    seed(10, status="Corrigir Dados", model="APROVADA_CLIENTE")
    sql("UPDATE pedidos_artes SET entrega_dados='APROVADO',observacoes='{\"status_antes_correcao_dados\":\"Dados Pendentes\"}' WHERE id=10;")
    sql("SET ROLE authenticated;" + call(10, action="reconciliar"))
    assert states(10)[0] == "APROVADO"
    checks.append("entrega corrigida restaura status calculado com modelos atuais")
    seed(11)
    sql("UPDATE propostas SET status_interno='EM PRODUCAO' WHERE id=11;")
    before = states(11)
    assert "saiu da Arte" in sql("SET ROLE authenticated;" + call(11), ok=False)
    assert states(11) == before
    checks.append("pedido em producao nao reinicia ciclo de aprovacao")
    seed(12)
    rev = revision(12)
    sql("UPDATE pedidos_artes SET status='Em Arte' WHERE id=12;")
    sql("UPDATE pedidos_artes SET status='Em Alteração' WHERE id=12;")
    assert "outra tela" in sql("SET ROLE authenticated;" + call(12, rev=rev), ok=False)
    checks.append("ABA detectado mesmo com status final identico")
    seed(13)
    sql("INSERT INTO pedidos_links_cliente VALUES(130,'13','13',true,'Em Arte',NULL,NULL);")
    before = states(13)
    assert "Link ativo unico" in sql("SET ROLE authenticated;" + call(13), ok=False)
    assert states(13) == before
    checks.append("links duplicados recusam toda a conclusao")
    seed(14)
    assert "READ COMMITTED" in sql("SET ROLE authenticated; BEGIN ISOLATION LEVEL REPEATABLE READ;" + call(14), ok=False)
    checks.append("isolamento sem leitura atual recusado")
    seed(15)
    sql("INSERT INTO producao_ordens_servico VALUES('10000000-0000-0000-0000-000000000015',15,'Em Arte'); UPDATE pedidos_links_cliente SET os_id='10000000-0000-0000-0000-000000000015' WHERE id=15;")
    sql("SET ROLE authenticated;" + call(15))
    assert sql('SELECT status FROM producao_ordens_servico WHERE numero=15;') == 'Enviar Arte'
    checks.append('OS propria acompanha conclusao na mesma transacao')
    seed(16)
    sql("INSERT INTO pedidos_modelos VALUES(160,16,'AGUARDANDO',NULL,NULL);")
    sql("SET ROLE authenticated;" + call(16))
    assert states(16) == ['Em Arte','AGUARDANDO_CLIENTE','Em Alteração']
    checks.append('modelo pronto com outro ainda em trabalho nao promove nem falha')
    sql("SET ROLE anon; SELECT public.arte_transicao_ler(1);", ok=False)
    checks.append("anon sem acesso a RPC")
    sql("ALTER TABLE pedidos_modelos ENABLE ROW LEVEL SECURITY; CREATE POLICY leitura ON pedidos_modelos FOR SELECT TO authenticated USING(true);")
    seed(9)
    before = states(9)
    assert "Modelo nao" in sql("SET ROLE authenticated;" + call(9), ok=False)
    assert states(9) == before
    checks.append("RLS de escrita preservada, sem sucesso vazio")
    sql((ROOT / 'sql/arte_transicao_concorrente_rollback.sql').read_text(encoding='utf-8'))
    assert sql("SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname LIKE 'arte_transicao_%';") == '0'
    assert states(7)[0] == 'Enviar Arte'
    checks.append("rollback remove apenas objetos novos e preserva pedidos")
    print(json.dumps({"checks": checks, "total": len(checks), "cluster": str(OUT)}, ensure_ascii=True))
finally:
    for p in processes:
        if p.poll() is None:
            p.terminate()
            p.wait(timeout=10)
    if started:
        run([BIN / "pg_ctl.exe", "-D", OUT / "data", "-m", "fast", "-w", "stop"])
