"""Testa a exportação num cluster PostgreSQL descartável de loopback.

Uso: python tests/ideal_control_exportacao_postgres.py CAMINHO_ABSOLUTO_PSQL
"""
from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import time


ROOT = Path(__file__).resolve().parents[1]
MIGRACAO = ROOT / "sql/ideal_control_exportacao_leituras_v1.sql"
EVENTO = "10000000-0000-4000-8000-000000000001"
OUTRO = "10000000-0000-4000-8000-000000000002"
VAZIO = "10000000-0000-4000-8000-000000000003"
SETOR = "20000000-0000-4000-8000-000000000001"
APARELHO = "20000000-0000-4000-8000-000000000002"
CREDENCIAL_1 = "30000000-0000-4000-8000-000000000001"
SELECT_EXPORTACAO = f"SELECT public.producao_acesso_exportar_leituras_v1('{EVENTO}');"


def testar(binarios):
    ambiente = {k: v for k, v in os.environ.items() if not k.upper().startswith("PG")}
    ambiente["PGCLIENTENCODING"] = "UTF8"
    oculto = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    temporario = Path(tempfile.mkdtemp(prefix="ideal-control-exportacao-"))
    dados = temporario / "data"

    with socket.socket() as porta_local:
        porta_local.bind(("127.0.0.1", 0))
        porta = porta_local.getsockname()[1]

    cliente = [
        "psql", "-X", "-qAt", "-h", "127.0.0.1", "-p", porta, "-U", "postgres", "-d",
        "postgres", "-v", "ON_ERROR_STOP=1",
    ]

    def executar(programa, *args, entrada=None):
        executavel = binarios / (programa + (".exe" if os.name == "nt" else ""))
        parametros = [str(executavel), *map(str, args)]
        opcoes = {"env": ambiente, "creationflags": oculto, "timeout": 45}
        if programa == "pg_ctl":
            # O servidor filho pode herdar stdout sem manter um PIPE do teste aberto.
            with (temporario / "pg_ctl.log").open("w", encoding="utf-8") as arquivo:
                resultado = subprocess.run(parametros, stdout=arquivo, stderr=arquivo, **opcoes)
            resultado.stderr = (temporario / "pg_ctl.log").read_text(encoding="utf-8", errors="replace")
            return resultado
        return subprocess.run(parametros, input=entrada, capture_output=True, text=True,
                              encoding="utf-8", errors="replace", **opcoes)

    def comando(programa, *args):
        resultado = executar(programa, *args)
        assert resultado.returncode == 0, resultado.stderr
        return resultado.stdout

    def sql(texto, erro_esperado=None):
        resultado = executar(*cliente, entrada=texto)
        if erro_esperado:
            assert resultado.returncode and erro_esperado in resultado.stderr, resultado.stderr
        else:
            assert resultado.returncode == 0, resultado.stderr
        return resultado.stdout.strip()

    def exportar(evento=EVENTO):
        return json.loads(sql(f"SET ROLE service_role; SELECT public.producao_acesso_exportar_leituras_v1('{evento}');"))

    comando("initdb", "-D", dados, "-U", "postgres", "-A", "trust", "--encoding=UTF8", "--no-locale")
    try:
        comando("pg_ctl", "-D", dados, "-l", temporario / "postgres.log", "-o",
                f"-h 127.0.0.1 -p {porta}", "-w", "start")
        sql("CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;")
        sql((ROOT / "sql/schema_acesso.sql").read_text(encoding="utf-8"))
        sql(MIGRACAO.read_text(encoding="utf-8"))
        sql("""
            GRANT SELECT ON public.producao_acesso_leituras, public.producao_acesso_setores,
                            public.producao_acesso_dispositivos, public.producao_acesso_credenciais
            TO service_role;
        """)
        sql(f"""
            INSERT INTO producao_acesso_eventos(id,dono_auth_id,nome_evento,sal)
            SELECT id::uuid, gen_random_uuid(), 'Evento sintético', 'teste'
            FROM (VALUES ('{EVENTO}'), ('{OUTRO}'), ('{VAZIO}')) AS eventos(id);
            INSERT INTO producao_acesso_setores(id,evento_id,nome) VALUES ('{SETOR}','{EVENTO}','Pista');
            INSERT INTO producao_acesso_dispositivos(id,evento_id,nome,codigo_hash)
            VALUES ('{APARELHO}','{EVENTO}','Portão A','hash-ficticio-aparelho');
            INSERT INTO producao_acesso_credenciais(id,evento_id,setor_id,numero,codigo_hash)
            SELECT ('30000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid,
                   CASE WHEN n = 1 THEN NULL ELSE '{EVENTO}'::uuid END, '{SETOR}', n, 'credencial-teste-' || n
            FROM generate_series(1,2963) AS n;
            INSERT INTO producao_acesso_leituras
                (id,evento_id,dispositivo_id,credencial_id,setor_id,id_local,momento,recebido_em,tipo,resultado,motivo)
            SELECT ('40000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, '{EVENTO}', '{APARELHO}',
                   CASE WHEN n <= 2963 THEN ('30000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid END,
                   '{SETOR}', 'teste-' || n,
                   '2026-11-27 18:00:00+00'::timestamptz + ((n-1)/2)*interval '1 second',
                   '2026-11-27 19:00:00+00'::timestamptz + n*interval '1 second',
                   CASE WHEN n = 2 THEN 'saida' ELSE 'entrada' END,
                   CASE WHEN n <= 2963 THEN 'permitido' ELSE 'negado' END,
                   CASE WHEN n > 2963 THEN 'desconhecido' END
            FROM generate_series(1,3230) AS n ORDER BY n DESC;
            INSERT INTO producao_acesso_leituras
                (evento_id,dispositivo_id,credencial_id,setor_id,id_local,momento,resultado)
            VALUES ('{OUTRO}','{APARELHO}','30000000-0000-4000-8000-000000000002','{SETOR}',
                    'isolamento','2026-11-27 18:00:00+00','negado');
        """)

        resultado = exportar()
        leituras = resultado["leituras"]
        aceitas = [linha for linha in leituras if linha["resultado"] == "permitido"]
        recusadas = [linha for linha in leituras if linha["resultado"] == "negado"]
        assert len(leituras) == 3230 and not resultado["ha_mais"]
        assert [linha["numero"] for linha in aceitas] == list(range(1, 2964))
        assert len(recusadas) == 267
        assert all(linha["numero"] is None and linha["motivo"] == "desconhecido" for linha in recusadas)
        assert leituras[0]["momento"] == leituras[1]["momento"]
        assert leituras[0]["momento"] != leituras[0]["recebido_em"]
        assert leituras[1]["tipo"] == "saida"
        assert all(linha["setor"] == "Pista" and linha["aparelho"] == "Portão A" for linha in leituras)
        # A credencial 1 foi desvinculada. A segunda ainda pertence a outro evento na leitura cruzada.
        assert leituras[0]["numero"] == 1
        outro = exportar(OUTRO)["leituras"]
        assert len(outro) == 1 and all(outro[0][campo] is None for campo in ("setor", "aparelho", "numero"))
        assert exportar(VAZIO) == {"leituras": [], "ha_mais": False}
        print("PASS: 3230 leituras, 267 recusas sem credencial, vínculo histórico, ordenação, evento isolado e vazio.")

        for papel in ("anon", "authenticated"):
            sql(f"SET ROLE {papel}; {SELECT_EXPORTACAO}", "permission denied for function")
        assert sql("""
            SELECT NOT prosecdef AND provolatile = 's'
            FROM pg_proc WHERE oid = 'public.producao_acesso_exportar_leituras_v1(uuid)'::regprocedure;
        """) == "t"
        print("PASS: somente service_role entre os papéis da API, função estável e invoker.")

        # A view de teste pausa a consulta já em execução. Uma segunda conexão
        # grava a leitura atrasada e libera a primeira dentro da mesma transação.
        sql("""
            ALTER TABLE producao_acesso_leituras RENAME TO leituras_concorrencia;
            CREATE FUNCTION aguardar_escrita_teste() RETURNS boolean LANGUAGE plpgsql AS $$
            BEGIN
                PERFORM pg_advisory_xact_lock(961127);
                RETURN true;
            END;
            $$;
            CREATE VIEW producao_acesso_leituras WITH (security_invoker = true) AS
            SELECT * FROM leituras_concorrencia
            WHERE CASE WHEN id_local = 'teste-1' THEN aguardar_escrita_teste() ELSE true END;
            GRANT SELECT ON producao_acesso_leituras TO service_role;
        """)
        with ThreadPoolExecutor(max_workers=2) as tarefas:
            escritor = tarefas.submit(sql, f"""
                BEGIN;
                SELECT pg_advisory_xact_lock(961127);
                DO $$
                BEGIN
                    FOR tentativa IN 1..400 LOOP
                        IF EXISTS (SELECT 1 FROM pg_locks
                                   WHERE locktype = 'advisory' AND objid = 961127 AND NOT granted) THEN
                            RETURN;
                        END IF;
                        PERFORM pg_sleep(0.025);
                    END LOOP;
                    RAISE EXCEPTION 'Leitor não aguardou a gravação concorrente';
                END;
                $$;
                INSERT INTO leituras_concorrencia
                    (evento_id,dispositivo_id,credencial_id,setor_id,id_local,momento,resultado,motivo)
                VALUES ('{EVENTO}','{APARELHO}','{CREDENCIAL_1}','{SETOR}','atrasada',
                        '2026-11-27 17:00:00+00','negado','duplicado');
                COMMIT;
            """)
            prazo = time.monotonic() + 8
            while sql("""
                SELECT EXISTS (SELECT 1 FROM pg_locks
                               WHERE locktype='advisory' AND objid=961127 AND granted);
            """) != "t":
                assert time.monotonic() < prazo, "Escritor não adquiriu o bloqueio de teste"

            leitor = tarefas.submit(exportar)
            escritor.result()
            assert leitor.result() == resultado

        nova_exportacao = exportar()
        assert len(nova_exportacao["leituras"]) == 3231
        assert nova_exportacao["leituras"][0]["motivo"] == "duplicado"
        sql("""
            ALTER VIEW producao_acesso_leituras RENAME TO leituras_concorrencia_view;
            ALTER TABLE leituras_concorrencia RENAME TO producao_acesso_leituras;
        """)
        print("PASS: uma leitura antiga sincronizada durante o SELECT entra somente na próxima exportação.")

        def incluir_extras(primeira, ultima):
            sql(f"""
                INSERT INTO producao_acesso_leituras
                    (evento_id,dispositivo_id,id_local,momento,resultado,motivo)
                SELECT '{EVENTO}', '{APARELHO}', 'extra-' || n,
                       '2026-11-28 00:00:00+00'::timestamptz + n*interval '1 second',
                       'negado', 'extra-' || n
                FROM generate_series({primeira},{ultima}) AS n;
            """)

        def conferir_limite(ha_mais):
            total, sinal, ultima = sql(f"""
                SET ROLE service_role;
                SELECT jsonb_array_length(r->'leituras'), r->>'ha_mais', r->'leituras'->29999->>'motivo'
                FROM public.producao_acesso_exportar_leituras_v1('{EVENTO}') AS r;
            """).split("|")
            assert int(total) == 30000 and sinal == ha_mais and ultima == "extra-30000"

        incluir_extras(3232, 30000)
        conferir_limite("false")
        incluir_extras(30001, 30001)
        conferir_limite("true")
        print("PASS: 30 mil sem aviso, 30.001 com aviso e as primeiras 30 mil linhas na ordem.")
    finally:
        if executar("pg_ctl", "-D", dados, "status").returncode == 0:
            comando("pg_ctl", "-D", dados, "-w", "-m", "fast", "stop")


if __name__ == "__main__":
    testar(Path(sys.argv[1]).resolve(strict=True).parent)
