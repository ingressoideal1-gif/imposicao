"""Presenca: PostgreSQL sintetico, concorrencia real e nenhuma nuvem."""
import concurrent.futures
import json
import os
from pathlib import Path
import unittest
from test_control_integridade_sql import IntegridadeSql, uid


@unittest.skipUnless(os.environ.get('IDEAL_CONTROL_TEST_PSQL'), 'PostgreSQL sintetico nao configurado')
class PresencaSql(unittest.TestCase):
    run_sql = IntegridadeSql.run_sql
    statement = IntegridadeSql.statement

    def setUp(self):
        IntegridadeSql.setUp(self)
        self.run_sql((Path(__file__).resolve().parents[1]/'sql/ideal_control_presenca_20261012.sql').read_text(encoding='utf-8'))
        self.run_sql("UPDATE producao_acesso_setores SET tipo_uso='reentrada'")

    def move(self, local, acao='auto', version=None, device=11, cid=31, moment='2099-01-01T00:00:00Z', error=False):
        i=dict(id_local=local,credencial_id=uid(cid),setor_id=uid(21),momento=moment,acao=acao,versao=version)
        raw=self.run_sql(f"SELECT producao_acesso_movimento('{uid(device)}','{json.dumps(i)}')",ok=not error)
        return raw if error else json.loads(raw)

    def test_ciclo_confirmacao_recusa_saida_reentrada_e_metricas(self):
        self.assertEqual(self.move('primeira')['tipo'],'entrada')
        p=self.move('consulta'); self.assertEqual(p['resultado'],'confirmar')
        self.assertEqual(self.run_sql('SELECT count(*) FROM producao_acesso_leituras'),'1')
        self.assertEqual(self.move('negada','entrada',p['versao'])['motivo'],'ja_no_local')
        self.assertEqual(self.move('saida','saida',p['versao'])['tipo'],'saida')
        m=json.loads(self.run_sql(f"SELECT producao_acesso_metricas('{uid(1)}')"))
        self.assertEqual((m['entraram'],m['sairam'],m['presentes'],m['recusadas']),(1,1,0,1))
        self.assertEqual(self.move('volta')['tipo'],'entrada')
        m=json.loads(self.run_sql(f"SELECT producao_acesso_metricas('{uid(1)}')"))
        self.assertEqual((m['entraram'],m['sairam'],m['presentes'],m['ingressos_utilizados']),(2,1,1,1))

    def test_reenvio_identidade_tipo_e_estado_obsoleto(self):
        self.move('a'); p=self.move('b')
        s=self.move('s','saida',p['versao']); self.assertTrue(self.move('s','saida',p['versao'])['reenvio'])
        self.move('s','entrada',p['versao'],error=True)
        self.assertEqual(self.move('outra-saida','saida',p['versao'])['motivo'],'estado_alterado')
        # Resposta perdida do popup conserva a consulta; nao vira entrada apos saida.
        self.assertEqual(self.move('b')['resultado'],'confirmar')
        self.assertEqual(self.run_sql('SELECT dentro FROM producao_acesso_presencas'),'f')
        self.move('volta')
        self.assertEqual(self.move('popup-antigo','saida',p['versao'])['motivo'],'estado_alterado')
        self.assertTrue(self.move('a')['reenvio'])
        self.assertEqual(self.move('a')['motivo'],'estado_alterado')
        self.assertEqual(self.run_sql('SELECT dentro FROM producao_acesso_presencas'),'t')

    def test_dois_portoes_concorrentes(self):
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            r=list(pool.map(lambda d:self.move('mesmo',device=d),[11,12]))
        self.assertEqual(sorted(x['resultado'] for x in r),['confirmar','permitido'])
        version=next(x['versao'] for x in r if x['resultado']=='confirmar')
        with concurrent.futures.ThreadPoolExecutor(2) as pool:
            r=list(pool.map(lambda d:self.move('saida','saida',version,device=d),[11,12]))
        self.assertEqual(sorted(x['resultado'] for x in r),['negado','permitido'])
        self.assertEqual(self.run_sql("SELECT count(*) FROM producao_acesso_leituras WHERE tipo='saida' AND resultado='permitido'"),'1')

    def test_saida_apos_bloqueio_e_reentrada_proibida(self):
        self.move('a'); p=self.move('b')
        self.run_sql("UPDATE producao_acesso_setores SET bloqueado=true,fecha_em='2000-01-01'; UPDATE producao_acesso_eventos SET status='inativo'")
        self.assertEqual(self.move('s','saida',p['versao'])['resultado'],'permitido')
        self.assertEqual(self.move('nova')['motivo'],'evento_inativo')

    def test_zeramento_nao_recria_presenca_e_restricoes(self):
        self.move('a'); p=self.move('b')
        self.run_sql(f"SELECT producao_acesso_zerar_entradas('{uid(1)}')")
        self.assertTrue(self.move('a')['zerada'])
        self.assertTrue(self.move('tardia',moment='2000-01-01T00:00:00Z')['zerada'])
        self.assertEqual(self.move('velha','saida',p['versao'])['motivo'],'estado_alterado')
        self.assertEqual(self.move('nova')['tipo'],'entrada')
        self.move('outro-evento',cid=32,error=True)
        self.run_sql('DELETE FROM producao_acesso_dispositivo_setores')
        self.assertEqual(self.move('sem-porta')['motivo'],'setor_nao_autorizado')

    def test_legado_preservado_e_clientes_antigos_bloqueados(self):
        r=json.loads(self.run_sql(self.statement()))[0]
        self.assertEqual(r['motivo'],'atualizacao_necessaria')
        self.run_sql(f"INSERT INTO producao_acesso_leituras(evento_id,dispositivo_id,credencial_id,setor_id,id_local,momento,tipo,resultado) VALUES('{uid(1)}','{uid(11)}','{uid(31)}','{uid(21)}','legado',now(),'entrada','permitido')")
        self.assertEqual(self.move('consulta')['resultado'],'confirmar')
        self.assertEqual(self.run_sql("SELECT tipo FROM producao_acesso_leituras WHERE id_local='legado'"),'entrada')
        for role in ['anon','authenticated']:
            self.assertEqual(self.run_sql(f"SELECT has_function_privilege('{role}','producao_acesso_movimento(uuid,jsonb)','EXECUTE')"),'f')

    def test_transacao_falha_nao_muda_presenca(self):
        self.run_sql("CREATE FUNCTION falhar() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'falha'; END $$; CREATE TRIGGER falhar BEFORE INSERT ON producao_acesso_leituras FOR EACH ROW EXECUTE FUNCTION falhar()")
        self.move('falha',error=True)
        self.assertEqual(self.run_sql('SELECT count(*) FROM producao_acesso_presencas'),'0')
