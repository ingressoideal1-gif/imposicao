"""Banco do pedido no portal: regressões locais e contrato SQL, sem rede real."""
import os
import re
import subprocess
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parents[1]
SQL = (RAIZ / 'sql/link_cliente_bancos_modelos.sql').read_text(encoding='utf-8')
CODIGO = re.sub(r'--[^\n]*', '', SQL)


@pytest.mark.parametrize('harness', ['portal_bancos_harness.js', 'portal_bancos_browser_harness.js'])
def test_bancos_do_portal(harness):
    r = subprocess.run(['node', str(RAIZ / 'tests' / harness)], cwd=RAIZ,
                       capture_output=True, text=True, encoding='utf-8', timeout=90,
                       env=os.environ.copy())
    assert r.returncode == 0, r.stdout + r.stderr
    assert 'OK:' in r.stdout


def test_rpc_aditiva_sem_escritas_de_dados():
    assert re.search(r'CREATE FUNCTION public\.link_cliente_bancos_modelos', CODIGO)
    assert not re.search(r'\b(UPDATE|INSERT|DELETE|TRUNCATE|DROP|ALTER TABLE)\b', CODIGO, re.I)
    assert re.search(r'\bSTABLE\b', CODIGO)
    assert CODIGO.strip().startswith('BEGIN;') and CODIGO.strip().endswith('COMMIT;')


def test_rpc_exige_token_e_identidade_unica():
    assert "NULLIF(btrim(p_token), '') IS NULL" in CODIGO
    assert 'l.token = p_token AND l.ativo IS TRUE' in CODIGO
    assert 'l.numero_pedido = p_numero' in CODIGO
    assert 'IF v_count <> 1 THEN RETURN NULL;' in CODIGO
    assert not re.search(r'LIMIT\s+1\b', CODIGO, re.I)
    assert "v_link.os_id IS DISTINCT FROM ('vibe_' || v_numero::text)" in CODIGO
    assert 'b.id = v_vinc.banco_id AND b.id_int = v_numero' in CODIGO


def test_rpc_restringe_execucao_e_projecao():
    assert 'SET search_path = pg_catalog, public' in CODIGO
    assert 'FROM PUBLIC;' in CODIGO
    assert 'TO anon, authenticated;' in CODIGO
    assert "k.key = ANY(v_colunas) OR k.key IN ('__id', '__ativo')" in CODIGO
    assert "meta.key IN ('url', 'cx', 'cy', 'zoom', 'rot')" in CODIGO
    assert 'ORDER BY r.ord' in CODIGO
    assert "'token'," not in CODIGO


def test_portal_usa_rpc_e_nao_le_tabelas_de_banco():
    fontes = '\n'.join((RAIZ / 'frontend' / n).read_text(encoding='utf-8')
                       for n in ['cliente.js', 'cliente-bancos.js', 'cliente-dados.js'])
    assert ".rpc('link_cliente_bancos_modelos'" in fontes
    assert not re.search(r"\.from\(['\"]pedidos_(bancos|modelos_banco)['\"]\)", fontes)
    html = (RAIZ / 'frontend/cliente.html').read_text(encoding='utf-8')
    assert html.index('/banco-do-modelo.js?') < html.index('/cliente-bancos.js?') < html.index('/cliente.js?')
