"""Executa as mesmas regressoes nos dois canais antes de compilar/publicar."""
from pathlib import Path
import os
import subprocess
import sys
import argparse
import json
import time
from entrega_impacto import impacto_testes, plano

ROOT = Path(__file__).resolve().parents[1]
TESTES = [
    'test_perfil_oficial.py','test_transicao_piloto.py','test_atualizador_oficial.py','test_auditoria_transicao_piloto.py','test_manifesto_oficial.py','test_controle_producao.py',
    'test_instalador_piloto.py',
    'test_gestao_estacoes.py', 'test_gdi_id_spool.py', 'test_temp_manager.py',
    'test_hotfolder_dialogo.py','test_motor_piloto.py',
    'test_canais_newprod.py','test_seguranca_estacao.py','test_integridade_impressao.py',
    'test_numeracao_compatibilidade.py',
    'test_engine_pdf_mesclar.py','test_engine_modelos_somados.py','test_engine_banco_nunca_vira_sequencial.py',
    'test_teatro_banco.py','test_teatro_snapshot.py','test_mapa_conferencia_newprod.py','test_painel_estacao.py',
    'test_pacotes_locais.py','test_preparacao_local.py','test_antecipacao_local.py',
    'test_coleta_autonoma.py','test_conferencia_piloto.py','test_auditoria_piloto.py',
    'test_diario_local.py','test_pacotes_api.py','test_selecao_piloto.py','test_revisao_pedido_piloto.py',
    'test_estatisticas_piloto.py','test_pacote_motor_local.py','test_recursos_motor_local.py']
HARNESSES = ['gestao_estacoes_harness.js','modelos_pedido_carregamento_harness.js','fidelidade_numeracao_harness.js',
             'foto_piloto_harness.js','foto_lib_harness.js',
             'selecao_piloto_harness.js','integridade_impressao_harness.js',
             'token_estacao_harness.js','ticket_condicoes_harness.js',
             'ticket_previas_harness.js','numeracao_compatibilidade_harness.js',
             'mapas_teatro_harness.js','mapas_teatro_browser_harness.js',
             'teatro_snapshot_harness.js','teatro_vertical_modelo_harness.js']

def selecionar(paths=None):
    perfil = plano(paths)['perfil'] if paths is not None else 'completo'
    if perfil == 'completo':
        return TESTES, HARNESSES
    # Os contratos de isolamento, seguranca e painel nunca sao dispensados.
    obrigatorios = ['test_canais_newprod.py', 'test_seguranca_estacao.py',
                    'test_compatibilidade_painel.py', 'test_painel_estacao.py']
    return obrigatorios, HARNESSES if perfil == 'visual' else ['token_estacao_harness.js']


def conferir(canais=('producao','piloto'), paths=None, relatorio=None):
    testes, harnesses = selecionar(paths)
    tempos = []
    def executar(cmd, env, etapa):
        inicio = time.monotonic()
        sucesso = False
        try:
            subprocess.run(cmd, cwd=ROOT, env=env, check=True)
            sucesso = True
        finally:
            tempos.append({'etapa': etapa, 'segundos': round(time.monotonic()-inicio, 3), 'sucesso': sucesso})
            print('TEMPO=' + json.dumps(tempos[-1]), flush=True)
            if relatorio:
                Path(relatorio).parent.mkdir(parents=True, exist_ok=True)
                Path(relatorio).write_text(json.dumps(tempos, indent=2), encoding='utf-8')
    for canal in canais:
        env = dict(os.environ)
        for nome in ('SUPABASE_SERVICE_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ACCESS_TOKEN',
                     'ACESSO_AGENTE_SEGREDO','NEWPROD_PILOTO_TOKEN','NEWPROD_PILOTO_LOCAL'):
            env.pop(nome,None)
        env['NEWPROD_CANAL']=canal
        print('CANAL=' + canal,flush=True)
        executar([sys.executable,'-m','pytest','-n','0','-q','--tb=short',
                  *('tests/'+n for n in testes)], env, canal + '/pytest')
        for nome in harnesses:
            executar(['node','tests/'+nome], env, canal + '/' + nome)

if __name__=='__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('canal', nargs='?', choices=['producao', 'piloto', 'oficial'])
    parser.add_argument('--base')
    parser.add_argument('--relatorio')
    args = parser.parse_args()
    paths = impacto_testes(ROOT, args.base) if args.base else None
    print(json.dumps(plano(paths) if paths is not None else {'perfil': 'completo'}), flush=True)
    conferir((args.canal,) if args.canal else ('producao','piloto'), paths, args.relatorio)
