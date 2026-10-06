"""PostgreSQL real local descartável; jamais usa ambiente de produção."""
import concurrent.futures
import os
from pathlib import Path
import subprocess
import uuid

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def sql():
    exe = os.environ.get("QR12_TEST_PSQL")
    if not exe:
        pytest.skip("Defina QR12_TEST_PSQL para testar o PostgreSQL sintético local")
    db = "qr12_test_" + uuid.uuid4().hex
    def run(text, database=db, ok=True):
        env = {k:v for k,v in os.environ.items() if not k.startswith("PG")}
        r = subprocess.run([exe,"-X","-qAt","-h","127.0.0.1","-p","55432","-U","postgres","-d",database,
                            "-v","ON_ERROR_STOP=1"],input=text,encoding="utf-8",capture_output=True,env=env,timeout=30)
        if ok:
            assert r.returncode == 0, r.stderr
        else:
            assert r.returncode != 0
        return r.stdout.strip() if ok else r.stderr
    run('CREATE DATABASE '+db, database="postgres")
    try:
        run((ROOT/"tests/qr12_schema_fixture.sql").read_text(encoding="utf-8"))
        run((ROOT/"sql/ideal_control_qr12.sql").read_text(encoding="utf-8"))
        run((ROOT/"sql/ideal_control_qr12_suspensao.sql").read_text(encoding="utf-8"))
        run((ROOT/"sql/ideal_control_qr12_suspensao_piloto.sql").read_text(encoding="utf-8"))
        run((ROOT/"sql/ideal_control_qr12_base_independente.sql").read_text(encoding="utf-8"))
        yield run
    finally:
        # Nome gerado exclusivamente por este teste; nenhum banco compartilhado.
        run('DROP DATABASE '+db, database="postgres")


def ativar(sql):
    sql("UPDATE producao_acesso_qr_controle SET ativo=true,corte=now(); INSERT INTO producao_acesso_qr_autorizacoes VALUES(23063,'SINTETICO: nenhum ingresso impresso');")


def test_legado_colisao_recusada_antes_de_reservar(sql):
    assert "sobrepostos" in sql("SELECT producao_acesso_qr_contratos_obter(23063)",ok=False)
    assert sql("SELECT count(*) FROM producao_acesso_qr_contratos") == "0"


def test_v2_separa_modelos_e_nao_reutiliza_base_legada(sql):
    ativar(sql)
    sql("SELECT producao_acesso_qr_contratos_obter(23063)")
    assert sql("SELECT count(*) FROM producao_acesso_qr_contratos WHERE versao=2") == "2"
    assert sql("SELECT count(*) FROM producao_acesso_qr_reservas a JOIN producao_acesso_qr_reservas b ON a.modelo<>b.modelo AND a.faixa && b.faixa WHERE a.versao=2") == "0"
    assert sql("SELECT sum(capacidade) FROM producao_acesso_qr_contratos") == "1300"


def test_repeticao_e_concorrencia_mantem_contrato(sql):
    ativar(sql)
    with concurrent.futures.ThreadPoolExecutor(4) as pool:
        respostas = list(pool.map(lambda _:sql("SELECT producao_acesso_qr_contratos_obter(23063)"),range(4)))
    assert len(set(respostas)) == 1
    assert sql("SELECT count(*) FROM producao_acesso_qr_reservas WHERE versao=2") == "2"


def test_inicio_ticket_limite_e_imutabilidade(sql):
    sql("UPDATE producao_numeracoes SET tipo='TICKET',ticket_qtd=3,elements='[{\"type\":\"QR_IDEAL\",\"ticket_pos\":2}]'; UPDATE pedidos_modelos SET numeracao_inicio=7;")
    ativar(sql)
    sql("SELECT producao_acesso_qr_contratos_obter(23063)")
    assert sql("SELECT sum(capacidade) FROM producao_acesso_qr_contratos") == "3900"
    sql("UPDATE pedidos_modelos SET quantidade=600 WHERE id=1001859")
    assert "mudou" in sql("SELECT producao_acesso_qr_contratos_obter(23063)",ok=False)


def test_modelo_criado_antes_do_corte_fica_legado(sql):
    sql("UPDATE producao_acesso_qr_controle SET ativo=true,corte=now(); INSERT INTO pedidos_modelos VALUES(11,51,10,7,'2026-10-01','qr'); SELECT producao_acesso_qr_contratos_obter(51);")
    assert sql("SELECT versao FROM producao_acesso_qr_contratos WHERE modelo=11") == "1"


def test_emissao_existente_nao_muda_hash_nem_versao(sql):
    ativar(sql)
    sql("INSERT INTO producao_acesso_credenciais(pedido_id_int,modelo_id,numero,codigo_hash) VALUES(23063,1001859,1,'hash-sintetico');")
    assert "existente" in sql("SELECT producao_acesso_qr_contratos_obter(23063)",ok=False)
    assert "já emitida" in sql("INSERT INTO producao_acesso_credenciais(pedido_id_int,modelo_id,numero,codigo_hash) VALUES(23063,1001859,1,'outro-hash');",ok=False)
    assert sql("SELECT count(*) FROM producao_acesso_credenciais") == "1"


def test_esgotamento_nao_da_volta_nem_deixa_reserva_parcial(sql):
    ativar(sql)
    sql("INSERT INTO producao_acesso_qr_reservas VALUES(99,99,2,int8range(0,3000000,'[)'))")
    assert "sem faixa livre" in sql("SELECT producao_acesso_qr_contratos_obter(23063)",ok=False)
    assert sql("SELECT count(*) FROM producao_acesso_qr_contratos") == "0"


def test_rbac_e_leitor_minimo(sql):
    ativar(sql)
    sql("SELECT producao_acesso_qr_contratos_obter(23063); INSERT INTO producao_acesso_pedidos VALUES(23063,'00000000-0000-4000-8000-000000000012');")
    assert sql("SELECT producao_acesso_qr_leitor_evento('00000000-0000-4000-8000-000000000012')") == "2"
    assert sql("SELECT has_table_privilege('anon','producao_acesso_qr_reservas','SELECT')") == "f"
    assert sql("SELECT has_function_privilege('authenticated','producao_acesso_qr_contratos_obter(integer)','EXECUTE')") == "f"


def test_suspensao_nao_retorna_ao_legado_e_preserva_reimpressao(sql):
    ativar(sql)
    original=sql("SELECT producao_acesso_qr_contratos_obter(23063)")
    sql("UPDATE producao_acesso_qr_controle SET ativo=false; INSERT INTO pedidos_modelos VALUES(11,51,10,1,now(),'qr');")
    assert "suspensas" in sql("SELECT producao_acesso_qr_contratos_obter(51)",ok=False)
    assert sql("SELECT count(*) FROM producao_acesso_qr_contratos WHERE pedido=51") == "0"
    assert sql("SELECT count(*) FROM producao_acesso_qr_reservas WHERE pedido=51") == "0"
    assert sql("SELECT producao_acesso_qr_contratos_obter(23063)") == original
    sql("INSERT INTO pedidos_modelos VALUES(12,52,10,1,'2026-10-01','qr'); SELECT producao_acesso_qr_contratos_obter(52)")
    assert sql("SELECT versao FROM producao_acesso_qr_contratos WHERE pedido=52") == "1"
    sql("INSERT INTO pedidos_modelos VALUES(13,53,10,1,'2026-10-01','qr'); INSERT INTO producao_acesso_qr_autorizacoes VALUES(53,'SINTETICO: ausencia de impressao confirmada')")
    assert "suspensas" in sql("SELECT producao_acesso_qr_contratos_obter(53)",ok=False)
    # Reativar usa a base v2; a tentativa bloqueada nao deixou contrato v1.
    sql("UPDATE producao_acesso_qr_controle SET ativo=true; SELECT producao_acesso_qr_contratos_obter(51)")
    assert sql("SELECT versao FROM producao_acesso_qr_contratos WHERE pedido=51") == "2"


def test_piloto_autorizado_com_corte_infinito_respeita_suspensao(sql):
    sql("INSERT INTO producao_acesso_qr_autorizacoes VALUES(23063,'SINTETICO: ausencia de impressao confirmada')")
    assert "suspensas" in sql("SELECT producao_acesso_qr_contratos_obter(23063)",ok=False)
    assert sql("SELECT count(*) FROM producao_acesso_qr_contratos") == "0"
    sql("UPDATE producao_acesso_qr_controle SET ativo=true")
    original=sql("SELECT producao_acesso_qr_contratos_obter(23063)")
    assert sql("SELECT count(*) FROM producao_acesso_qr_contratos WHERE versao=2") == "2"
    sql("INSERT INTO pedidos_modelos VALUES(11,51,10,1,now(),'qr'); SELECT producao_acesso_qr_contratos_obter(51)")
    assert sql("SELECT versao FROM producao_acesso_qr_contratos WHERE pedido=51") == "1"
    sql("UPDATE producao_acesso_qr_controle SET ativo=false")
    assert sql("SELECT producao_acesso_qr_contratos_obter(23063)") == original
