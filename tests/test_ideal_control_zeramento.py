"""Regressões do zeramento com IndexedDB real e integração Edge simulada."""
import json
import os
import subprocess

from test_portaria_deposito import rodar

BASE = """
const corte = '2026-09-22T12:00:00Z';
const antiga = '2026-09-22T11:00:00Z';
const nova = '2026-09-22T13:00:00Z';
const carga = {evento: {id: 'e1'}, setores: [], credenciais: [{id: 'c1'}]};
await d.gravarCarga(carga);
const leitura = (id, momento) => ({id_local: id, credencial_id: id, momento, resultado: 'permitido'});
const novidade = {entradas_zeradas_em: corte, entradas: [], totais: {s1: 0}};
"""


def test_zeramento_limpa_entrada_e_total_preserva_credenciais_e_fila():
    r = rodar(BASE + """
await d.enfileirar(leitura('c1', antiga));
await d.gravarTotais({s1: 1});
await d.gravarNovidades(novidade, 'e1');
return {entradas: await d.entradasPermitidas(), totais: await d.lerTotais(),
        fila: await d.contarFila(), carga: await d.lerCarga()};
""")
    assert r['entradas'] == {}
    assert r['totais'] == {'s1': 0}
    assert r['fila'] == 1  # Só o recebimento confirmado libera a fila.
    assert r['carga']['credenciais'] == [{'id': 'c1'}]
    assert r['carga']['entradas_zeradas_em'] == '2026-09-22T12:00:00Z'


def test_entradas_posteriores_sobrevivem_inclusive_ao_repetir_a_marca():
    r = rodar(BASE + """
await d.enfileirar(leitura('c1', antiga));
await d.enfileirar(leitura('c2', nova));
novidade.entradas = [{credencial_id: 'c-antiga', momento: antiga}, {credencial_id: 'c3', momento: nova}];
await d.gravarNovidades(novidade, 'e1');
await d.gravarNovidades(novidade, 'e1');
return await d.entradasPermitidas();
""")
    assert r == {'c2': '2026-09-22T13:00:00Z', 'c3': '2026-09-22T13:00:00Z'}


def test_repara_marca_ja_salva_pela_versao_antiga_com_loja_desatualizada():
    r = rodar(BASE + """
await d.enfileirar(leitura('c1', antiga));
await d.gravarCarga({...carga, entradas_zeradas_em: corte, entradas: {}});
await d.gravarNovidades(novidade, 'e1');
return await d.entradasPermitidas();
""")
    assert r == {}


def test_resposta_anterior_ao_zeramento_nao_restabelece_entrada_ou_total():
    r = rodar(BASE + """
await d.gravarNovidades(novidade, 'e1');
await d.gravarNovidades({entradas_zeradas_em: antiga, totais: {s1: 80},
  entradas: [{credencial_id: 'c1', momento: antiga}]}, 'e1');
return {entradas: await d.entradasPermitidas(), totais: await d.lerTotais()};
""")
    assert r == {'entradas': {}, 'totais': {'s1': 0}}


def test_fusos_equivalentes_e_leitura_em_voo_nao_recriam_entrada_antiga():
    r = rodar(BASE + """
await d.gravarNovidades(novidade, 'e1');
const velha = await d.enfileirar(leitura('c1', '2026-09-22T09:00:00-03:00'));
const atual = await d.enfileirar(leitura('c2', nova));
return {velha, atual, entradas: await d.entradasPermitidas(), fila: await d.contarFila()};
""")
    assert r == {'velha': False, 'atual': True, 'entradas': {'c2': '2026-09-22T13:00:00Z'}, 'fila': 2}


def test_falha_de_gravacao_desfaz_carga_entradas_e_totais_juntos():
    r = rodar(BASE + """
await d.enfileirar(leitura('c1', antiga));
await d.gravarTotais({s1: 1});
const original = IDBObjectStore.prototype.put;
let falhou = false;
IDBObjectStore.prototype.put = function(...args) {
  if (this.name === 'carga') throw new Error('falha sintetica de gravacao');
  return original.apply(this, args);
};
try { await d.gravarNovidades(novidade, 'e1'); } catch(e) { falhou = true; }
finally { IDBObjectStore.prototype.put = original; }
return {falhou, carga: await d.lerCarga(), entradas: await d.entradasPermitidas(), totais: await d.lerTotais()};
""")
    assert r['falhou']
    assert 'entradas_zeradas_em' not in r['carga']
    assert r['entradas'] == {'c1': '2026-09-22T11:00:00Z'}
    assert r['totais'] == {'s1': 1}


def test_resposta_de_outro_evento_nao_altera_o_aparelho():
    r = rodar(BASE + """
let falhou = false;
try { await d.gravarNovidades(novidade, 'e2'); } catch(e) { falhou = true; }
return {falhou, carga: await d.lerCarga()};
""")
    assert r['falhou']
    assert 'entradas_zeradas_em' not in r['carga']


def test_leitura_concorrente_posterior_ao_corte_sobrevive_ao_sincronismo():
    r = rodar(BASE + """
await Promise.all([d.gravarNovidades(novidade, 'e1'), d.enfileirar(leitura('c2', nova))]);
return await d.entradasPermitidas();
""")
    assert r == {'c2': '2026-09-22T13:00:00Z'}


def test_regressao_completa_navegador_e_edge_com_banco_simulado():
    raiz = os.path.dirname(os.path.dirname(__file__))
    r = subprocess.run(['node', 'tests/ideal_control_zeramento_harness.cjs'], cwd=raiz,
                       capture_output=True, encoding='utf-8', timeout=90)
    assert r.returncode == 0, r.stdout + r.stderr
    assert json.loads(r.stdout)['unexpectedErrors'] == 0
