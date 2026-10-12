"""PostgreSQL local sintético. Usa unittest; não instala dependências.

Definir IDEAL_CONTROL_TEST_PSQL. Porta fixa 55439 e host 127.0.0.1.
Cada teste cria banco com nome aleatório; nenhum banco existente é apagado.
"""
import concurrent.futures
import json
import os
from pathlib import Path
import subprocess
import unittest
import uuid

ROOT = Path(__file__).resolve().parents[1]


def uid(n):
    return f"00000000-0000-4000-8000-{n:012d}"


@unittest.skipUnless(os.environ.get("IDEAL_CONTROL_TEST_PSQL"), "PostgreSQL sintético não configurado")
class IntegridadeSql(unittest.TestCase):
    def run_sql(self, text, db=None, ok=True):
        env = {k: v for k, v in os.environ.items() if not k.upper().startswith("PG")}
        r = subprocess.run([os.environ["IDEAL_CONTROL_TEST_PSQL"], "-X", "-qAt", "-h", "127.0.0.1",
                            "-p", "55439", "-U", "postgres", "-d", db or self.db,
                            "-v", "ON_ERROR_STOP=1"], input=text, encoding="utf-8", capture_output=True,
                           timeout=30, env=env)
        if ok:
            self.assertEqual(r.returncode, 0, r.stderr)
        else:
            self.assertNotEqual(r.returncode, 0)
        return r.stdout.strip() if ok else r.stderr

    def setUp(self):
        self.db = "control_test_" + uuid.uuid4().hex
        self.run_sql("CREATE DATABASE " + self.db, db="postgres")
        self.run_sql((ROOT / "tests/control_integridade_fixture.sql").read_text(encoding="utf-8"))
        for f in ["schema_acesso_zeramento_atomico.sql", "ideal_control_integridade_20261012.sql"]:
            self.run_sql((ROOT / "sql" / f).read_text(encoding="utf-8"))

    def statement(self, local="l1", device=11, cid=31, sid=21, moment="2026-10-12T21:00:00Z", online=False):
        items = [dict(id_local=local, credencial_id=uid(cid) if cid else None,
                      setor_id=uid(sid) if sid else None, momento=moment, resultado="permitido")]
        return (f"SELECT producao_acesso_registrar_leituras('{uid(device)}',"
                f"'{json.dumps(items)}'::jsonb,{str(online).lower()});")

    def result(self, **kwargs):
        return json.loads(self.run_sql(self.statement(**kwargs)))[0]

    def test_reenvio_e_nova_tentativa_do_mesmo_aparelho(self):
        self.assertEqual(self.result()["resultado"], "permitido")
        self.assertTrue(self.result()["reenvio"])
        self.assertEqual(self.result(local="l2")["motivo"], "ja_entrou")
        self.assertEqual(self.run_sql("SELECT count(*) FROM producao_acesso_leituras"), "2")
        self.assertEqual(self.run_sql("SELECT id_local FROM producao_acesso_entradas_unicas"), "l1")
        self.run_sql(self.statement(local="l1", moment="2026-10-12T22:00:00Z"), ok=False)

    def test_concorrencia_portoes_e_mesmo_id(self):
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            replies = list(pool.map(lambda d: self.result(device=d), [11, 12]))
        self.assertEqual(sorted(r["resultado"] for r in replies), ["negado", "permitido"])
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            replies = list(pool.map(lambda _: self.result(local="outra"), range(2)))
        self.assertTrue(all(r["motivo"] == "ja_entrou" for r in replies))
        self.assertEqual(self.run_sql("SELECT count(*) FROM producao_acesso_leituras"), "3")
        self.run_sql(f"INSERT INTO producao_acesso_credenciais(id,evento_id,setor_id,numero) VALUES('{uid(33)}','{uid(1)}','{uid(21)}',2)")
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            replies = list(pool.map(lambda _: self.result(local="mesma", cid=33), range(2)))
        self.assertTrue(all(r["resultado"] == "permitido" for r in replies))
        self.assertEqual(sum(bool(r.get("reenvio")) for r in replies), 1)

    def test_vinculos_autorizacao_bloqueios_e_reentrada(self):
        self.assertEqual(self.result(cid=32, sid=22)["motivo"], "desconhecido")
        self.assertEqual(self.result(local="sem-setor", sid=None)["motivo"], "erro_de_leitura")
        self.run_sql("UPDATE producao_acesso_dispositivo_setores SET setor_id='" + uid(22) + "'")
        self.assertEqual(self.result(local="outra-porta")["motivo"], "setor_nao_autorizado")
        self.run_sql("UPDATE producao_acesso_dispositivo_setores SET setor_id='" + uid(21) + "'; UPDATE producao_acesso_setores SET bloqueado=true")
        self.assertEqual(self.result(local="bloqueado")["motivo"], "setor_bloqueado")
        self.run_sql("UPDATE producao_acesso_setores SET bloqueado=false,tipo_uso='reentrada'")
        self.assertEqual(self.result(local="reentrada1")["resultado"], "permitido")
        self.assertEqual(self.result(local="reentrada2")["resultado"], "permitido")
        self.assertEqual(self.run_sql("SELECT count(*) FROM producao_acesso_entradas_unicas"), "0")
        self.assertEqual(self.run_sql("SELECT resultado_aparelho FROM producao_acesso_leituras WHERE id_local='bloqueado'"), "permitido")

    def test_zeramento_fila_tardia_e_reserva_legada(self):
        self.result()
        self.run_sql(f"SELECT producao_acesso_zerar_entradas('{uid(1)}')")
        self.assertTrue(self.result(moment="2020-01-01T00:00:00Z")["zerada"])
        self.assertEqual(self.run_sql("SELECT count(*) FROM producao_acesso_leituras"), "0")
        self.assertEqual(self.result(local="apos-corte", moment="2099-01-01T00:00:00Z")["resultado"], "permitido")
        self.run_sql(f"SELECT producao_acesso_zerar_entradas('{uid(1)}')")
        self.run_sql(f"INSERT INTO producao_acesso_entradas_unicas(credencial_id,evento_id,setor_id,dispositivo_id,momento) VALUES('{uid(31)}','{uid(1)}','{uid(21)}','{uid(11)}','2099-01-01')")
        self.assertEqual(self.result(local="nova", moment="2099-01-02T00:00:00Z")["motivo"], "ja_entrou")

    def test_zeramento_concorrente_espera_transacao_e_nao_deixa_reserva(self):
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            reading = pool.submit(self.run_sql, "BEGIN; " + self.statement() + " SELECT pg_sleep(0.3); COMMIT;")
            reset = pool.submit(self.run_sql, f"SELECT pg_sleep(0.1); SELECT producao_acesso_zerar_entradas('{uid(1)}')")
            reading.result(); reset.result()
        self.assertEqual(self.run_sql("SELECT count(*) FROM producao_acesso_leituras"), "0")
        self.assertEqual(self.run_sql("SELECT count(*) FROM producao_acesso_entradas_unicas"), "0")

    def test_janela_evento_credencial_e_faixa(self):
        self.run_sql("UPDATE producao_acesso_eventos SET status='inativo'")
        self.assertEqual(self.result()["motivo"], "evento_inativo")
        self.run_sql("UPDATE producao_acesso_eventos SET status='ativo'; UPDATE producao_acesso_credenciais SET status='inativo'")
        self.assertEqual(self.result(local="c")["motivo"], "desconhecido")
        self.run_sql("UPDATE producao_acesso_credenciais SET status='ativo'; UPDATE producao_acesso_setores SET abre_em='2099-01-01'")
        self.assertEqual(self.result(local="h")["motivo"], "fora_da_janela")
        self.run_sql(f"UPDATE producao_acesso_setores SET abre_em=NULL; INSERT INTO producao_acesso_bloqueios(evento_id,setor_id,de,ate,motivo) VALUES('{uid(1)}','{uid(21)}',1,1,'Sintético')")
        self.assertEqual(self.result(local="b")["motivo"], "bloqueado")

    def test_rollback_reserva_e_rbac(self):
        self.run_sql("CREATE FUNCTION falhar() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Falha sintética'; END $$; CREATE TRIGGER falhar BEFORE INSERT ON producao_acesso_leituras FOR EACH ROW EXECUTE FUNCTION falhar()")
        self.run_sql(self.statement(), ok=False)
        self.assertEqual(self.run_sql("SELECT count(*) FROM producao_acesso_entradas_unicas"), "0")
        for role in ["anon", "authenticated"]:
            self.assertEqual(self.run_sql(f"SELECT has_function_privilege('{role}','producao_acesso_registrar_leituras(uuid,jsonb,boolean)','EXECUTE')"), "f")
            self.assertEqual(self.run_sql(f"SELECT has_function_privilege('{role}','producao_acesso_metricas(uuid)','EXECUTE')"), "f")

    def test_metricas_acima_de_20mil_e_reentradas(self):
        self.run_sql(f"INSERT INTO producao_acesso_leituras(evento_id,dispositivo_id,credencial_id,setor_id,id_local,momento,tipo,resultado) SELECT '{uid(1)}','{uid(11)}','{uid(31)}','{uid(21)}','l'||i,now(),'entrada','permitido' FROM generate_series(1,20001) i")
        m = json.loads(self.run_sql(f"SELECT producao_acesso_metricas('{uid(1)}')"))
        self.assertEqual(m["entraram"], 20001)
        self.assertEqual(m["ingressos_utilizados"], 1)
        self.assertEqual(m["publicados_utilizados"], 1)
        self.assertEqual(m["por_setor"][0]["passagens"], 20001)


if __name__ == "__main__":
    unittest.main(verbosity=2)
