"""Cria cluster descartável em TEMP, em loopback, e prova concorrência com psql.

Uso: python tests/distribuicao_designers_postgres.py CAMINHO_ABSOLUTO_PSQL
Não aceita DSN remoto nem usa credenciais. Preserva o diretório para diagnóstico.
"""
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time

raiz = Path(__file__).resolve().parents[1]
psql = Path(sys.argv[1]).resolve()
binario = psql.parent
teste = Path(tempfile.mkdtemp(prefix="ideal-fila-postgres-"))
dados = teste / "data"
oculto = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
ambiente = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
ambiente["PGCLIENTENCODING"] = "UTF8"
with socket.socket() as sock:
    sock.bind(("127.0.0.1", 0))
    porta = sock.getsockname()[1]


def comando(args, **kwargs):
    r = subprocess.run([str(a) for a in args], capture_output=True, text=True,
                       encoding="utf-8", errors="replace", env=ambiente,
                       creationflags=oculto, timeout=30, **kwargs)
    if r.returncode:
        raise RuntimeError(r.stderr)
    return r.stdout.strip()


base = [psql, "-X", "-h", "127.0.0.1", "-p", str(porta), "-U", "postgres",
        "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-qAt"]


def sql(texto):
    return comando(base, input=texto)


def assincrono(texto):
    p = subprocess.Popen([str(a) for a in base], stdin=subprocess.PIPE,
                         stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                         text=True, encoding="utf-8", env=ambiente, creationflags=oculto)
    p.stdin.write(texto)
    p.stdin.close()
    p.stdin = None
    return p


def esperar(condicao, segundos=8):
    limite = time.monotonic() + segundos
    while time.monotonic() < limite:
        if condicao():
            return
        time.sleep(0.05)
    raise AssertionError("Condição de concorrência não observada no prazo")


iniciado = False
processos = []
try:
    comando([binario / "initdb.exe", "-D", dados, "-U", "postgres", "-A", "trust", "--encoding=UTF8", "--no-locale"])
    # No Windows o servidor pode herdar handles do pg_ctl. Um arquivo evita
    # manter pipes de captura abertos por toda a vida do servidor.
    with (teste / "startup.log").open("w", encoding="utf-8") as log:
        subprocess.run([str(binario / "pg_ctl.exe"), "-D", str(dados), "-l", str(teste / "server.log"),
                        "-o", f"-h 127.0.0.1 -p {porta} -c max_connections=10", "-w", "start"],
                       stdout=log, stderr=log, env=ambiente, creationflags=oculto, timeout=30, check=True)
    iniciado = True
    sql((raiz / "tests/distribuicao_designers_fixture.sql").read_text(encoding="utf-8"))
    sql((raiz / "tests/distribuicao_designers_classificador_fixture.sql").read_text(encoding="utf-8"))
    sql((raiz / "sql/distribuicao_designers.sql").read_text(encoding="utf-8"))
    admin = "SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);"
    dono = "10000000-0000-0000-0000-000000000001"
    sql(admin + "SELECT public.arte_distribuicao_ativar(true);")
    sql(f"INSERT INTO pedidos_artes(id_int,designer_uid,status) VALUES(1,'{dono}','Em Arte'),(2,'{dono}','Em Arte');")
    sql("SELECT arte_fila.consumir();")
    # ID menor ainda não confirmado não pode ser apagado pelo consumidor.
    primeiro = assincrono(f"SET application_name='fila_origem'; BEGIN; INSERT INTO pedidos_artes(id_int,designer_uid,status) VALUES(4,'{dono}','Em Arte'); SELECT pg_sleep(3); COMMIT;")
    processos.append(primeiro)
    esperar(lambda: sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='fila_origem' AND wait_event='PgSleep';") == '1')
    sql(f"INSERT INTO pedidos_artes(id_int,designer_uid,status) VALUES(3,'{dono}','Em Arte');")
    sql("SELECT arte_fila.consumir();")
    assert sql("SELECT count(*) FROM arte_fila.pedidos WHERE id_int=4;") == '0'
    _, erro = primeiro.communicate(timeout=12)
    assert primeiro.returncode == 0, erro
    assert int(sql("SELECT count(*) FROM arte_fila.eventos WHERE id_int=4;")) == 1
    # Dois consumidores não distribuem duas vezes; produtor não disputa mutex.
    segundo = assincrono("BEGIN; SELECT arte_fila.consumir(); SELECT pg_sleep(3); COMMIT;")
    processos.append(segundo)
    trava = "SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND classid=731031 AND objid=1"
    esperar(lambda: int(sql(trava + " AND granted;")) == 1)
    assert sql("SELECT arte_fila.consumir();") == '0'
    sql("INSERT INTO propostas(id_int) VALUES(90);")
    _, erro = segundo.communicate(timeout=12)
    assert segundo.returncode == 0, erro
    sql("SELECT arte_fila.consumir();")
    resultado = json.loads(sql("SELECT json_agg(p ORDER BY id_int) FROM (SELECT id_int,responsavel_uid FROM arte_fila.pedidos) p;"))
    assert [x["responsavel_uid"] for x in resultado[:3]] == [dono] * 3
    assert resultado[3]["responsavel_uid"] == "10000000-0000-0000-0000-000000000002"
    assert int(sql("SELECT count(*) FROM arte_fila.historico WHERE evento='atribuicao' AND id_int IN (3,4);")) == 2
    # Uma transação abortada não pode consumir carga nem deixar evento persistido.
    sql(f"BEGIN; INSERT INTO pedidos_artes(id_int,designer_uid,status) VALUES(5,'{dono}','Em Arte'); ROLLBACK;")
    assert int(sql("SELECT count(*) FROM arte_fila.pedidos WHERE id_int=5;")) == 0
    assert int(sql("SELECT count(*) FROM arte_fila.historico WHERE id_int=5;")) == 0
    if '--revisar-gatilhos' in sys.argv:
        from distribuicao_designers_interacoes import revisar
        revisao = revisar(sql, assincrono, esperar, processos)
        (teste / 'revisao.json').write_text(json.dumps(revisao,ensure_ascii=False,indent=2),encoding='utf-8')
        print(json.dumps(revisao, ensure_ascii=False))
        assert revisao['tres_regressoes_aprovadas'], f'Instalação bloqueada; evidência: {teste / "revisao.json"}'
    print(json.dumps({"resultado": "OK", "postgres": sql("SHOW server_version;"),
                      "consumidores_serializados_produtor_independente": True,
                      "commit_tardio_nao_perde_evento": True,
                      "terceiro_preservado_quarto_distribuido": True,
                      "auditoria_sem_duplicacao": True, "rollback_sem_residuo": True,
                      "diretorio_temporario": str(teste)}, ensure_ascii=False))
finally:
    for p in processos:
        if p.poll() is None:
            p.terminate()
            p.wait(timeout=10)
    if iniciado:
        comando([binario / "pg_ctl.exe", "-D", dados, "-m", "fast", "-w", "stop"])
