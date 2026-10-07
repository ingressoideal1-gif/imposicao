"""Executa as mesmas regressoes nos dois canais antes de compilar/publicar."""
from pathlib import Path
import os
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
TESTES = [
    'test_gestao_estacoes.py', 'test_temp_manager.py',
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

def conferir(canais=('producao','piloto')):
    for canal in canais:
        env = dict(os.environ)
        for nome in ('SUPABASE_SERVICE_KEY','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_ACCESS_TOKEN',
                     'ACESSO_AGENTE_SEGREDO','NEWPROD_PILOTO_TOKEN','NEWPROD_PILOTO_LOCAL'):
            env.pop(nome,None)
        env['NEWPROD_CANAL']=canal
        print('CANAL=' + canal,flush=True)
        subprocess.run([sys.executable,'-m','pytest','-n','0','-q','--tb=short',
                        *('tests/'+n for n in TESTES)],cwd=ROOT,env=env,check=True)
        for nome in HARNESSES:
            subprocess.run(['node','tests/'+nome],cwd=ROOT,env=env,check=True)

if __name__=='__main__':
    canais = (sys.argv[1],) if len(sys.argv)>1 else ('producao','piloto')
    if any(c not in ('producao','piloto') for c in canais): raise SystemExit('Canal invalido')
    conferir(canais)
