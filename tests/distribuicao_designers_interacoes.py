"""Regressões dos três bloqueadores encontrados na revisão.

Executado pelo harness PostgreSQL com --revisar-gatilhos. Usa funções lidas
do banco real e helpers/dados sintéticos, conforme a fixture documenta.
"""
import json
from pathlib import Path


def revisar(sql, assincrono, esperar, processos):
    raiz = Path(__file__).resolve().parents[1]
    sql((raiz / 'tests/distribuicao_designers_gatilhos_fixture.sql').read_text(encoding='utf-8'))
    executar = sql
    def sql(texto):
        resultado = executar(texto)
        if texto.lstrip().startswith(('INSERT', 'UPDATE')):
            executar('SELECT arte_fila.consumir();')
        return resultado
    uid = '10000000-0000-0000-0000-000000000001'
    admin = "SELECT set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',false);"
    # Caminho real pagamentos_v2 -> propostas: a atualização é aninhada.
    sql("INSERT INTO propostas(id_int,status_interno) VALUES(20,'EM PRODUCAO');"
        f"INSERT INTO pedidos_artes(id_int,status,designer_uid) VALUES(20,'Em Arte','{uid}');")
    sql("INSERT INTO pagamentos_v2 VALUES(20,'PAGO');")
    aninhado = json.loads(sql("SELECT json_build_object('persistido',em_arte,'recalculado',arte_fila.em_arte(20)) FROM arte_fila.pedidos WHERE id_int=20;"))
    assert aninhado == {'persistido': True, 'recalculado': True}, aninhado

    divergencias = []
    for numero, status in [(21, 'IGNORAR'), (22, 'PENDENTE INFORMAÇÃO')]:
        sql(f"INSERT INTO pedidos_artes(id_int,status,designer_uid) VALUES({numero},'{status}','{uid}');")
        r = json.loads(sql(f"SELECT json_build_object('caso','{status}','card_existente',imposition_card_arte_ler({numero}),'nova_carga',arte_fila.em_arte({numero}));"))
        assert r['nova_carga'] is False and r['card_existente'] != 'fila', r
        divergencias.append(r)
    sql("INSERT INTO propostas(id_int,status_interno) VALUES(23,'EM PRODUCAO');"
        f"INSERT INTO pedidos_artes(id_int,status,designer_uid) VALUES(23,'Em Arte','{uid}');"
        "INSERT INTO pedidos_modelos(id_int,status_arte,status_impressao) VALUES(23,'PENDENTE','CORRIGIR_ARTE');")
    r = json.loads(sql("SELECT json_build_object('caso','CORRIGIR_ARTE','card_existente',imposition_card_arte_ler(23),'nova_carga',arte_fila.em_arte(23));"))
    assert r['card_existente'] == 'fila' and r['nova_carga'] is True, r
    divergencias.append(r)

    # Caminho direto de aprovação: AFTER STATEMENT enxerga o status consolidado pelo trigger legado.
    sql(f"INSERT INTO pedidos_artes(id_int,status,designer_uid) VALUES(24,'Em Arte','{uid}');"
        "INSERT INTO pedidos_modelos(id_int,status_arte) VALUES(24,'PENDENTE');"
        "UPDATE pedidos_modelos SET status_arte='APROVADO' WHERE id_int=24;")
    assert sql("SELECT em_arte FROM arte_fila.pedidos WHERE id_int=24;") == 'f'
    status_antes = sql('SELECT status FROM pedidos_artes WHERE id_int=24;')
    revisao_antes = int(sql('SELECT revisao FROM piloto_revisoes_pedidos WHERE pedido=24;'))
    sql(admin + "SELECT arte_distribuicao_fixar(24,'10000000-0000-0000-0000-000000000002',true,'Teste de interação');")
    assert sql('SELECT status FROM pedidos_artes WHERE id_int=24;') == status_antes
    assert int(sql('SELECT revisao FROM piloto_revisoes_pedidos WHERE pedido=24;')) > revisao_antes

    # Comparação com/sem captura da distribuição: separar regressão nova
    # de uma inversão entre locks de linha e advisory já presente no catálogo.
    sql(admin + 'SELECT arte_distribuicao_ativar(false);')
    sql("CREATE FUNCTION teste_pausa_catalogo() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(3); RETURN NEW; END $$;"
        "CREATE TRIGGER zz_teste_pausa BEFORE UPDATE ON producao_numeracoes FOR EACH ROW EXECUTE FUNCTION teste_pausa_catalogo();")
    def concorrencia(numero):
        chave = f'catalogo-teste-{numero}'
        sql(f"INSERT INTO producao_numeracoes VALUES('{chave}','front');"
            f"INSERT INTO pedidos_modelos(id_int,status_arte,amostra_num_id,verso_tipo) VALUES({numero},'PENDENTE','{chave}','SÓ FRENTE');")
        catalogo = assincrono("\\set VERBOSITY verbose\nSET application_name='fila_teste_catalogo'; "
                             f"UPDATE producao_numeracoes SET print_mode='duplex' WHERE id='{chave}';")
        processos.append(catalogo)
        locks = "SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE l.locktype='advisory'"
        esperar(lambda: int(sql(locks + " AND a.application_name='fila_teste_catalogo' AND l.granted;")) > 0)
        modelo = assincrono("\\set VERBOSITY verbose\nSET application_name='fila_teste_modelo'; "
                           f"UPDATE pedidos_modelos SET verso_tipo='FRENTE E VERSO' WHERE id_int={numero};")
        processos.append(modelo)
        esperar(lambda: int(sql(locks + " AND a.application_name='fila_teste_modelo' AND NOT l.granted;")) > 0)
        assert sql("SELECT count(*) FROM pg_locks WHERE locktype='advisory' AND classid=731031 AND objid=1;") == '0'
        resultados = [p.communicate(timeout=12) for p in (catalogo, modelo)]
        return {'deadlocks': sum('40P01' in erro for _, erro in resultados),
                'retornos': [p.returncode for p in (catalogo, modelo)]}
    com_captura = concorrencia(31)
    # Apenas neste cluster descartável: suspender nossos gatilhos preserva os legados.
    for tabela in ('pedidos_artes','pedidos_modelos','produtos_proposta','propostas','pedidos_links_cliente','usuarios'):
        for acao in ('inserir','alterar','excluir'):
            sql(f'ALTER TABLE {tabela} DISABLE TRIGGER arte_fila_{acao};')
    sem_captura = concorrencia(32)
    assert com_captura['deadlocks'] == sem_captura['deadlocks'] == 1
    # Aplicar somente no cluster descartável. Os gatilhos legados ficam intactos.
    sql((raiz / 'sql/ordenar_travas_catalogo_modelos.sql').read_text(encoding='utf-8'))
    sem_captura_corrigido = concorrencia(33)
    for tabela in ('pedidos_artes','pedidos_modelos','produtos_proposta','propostas','pedidos_links_cliente','usuarios'):
        for acao in ('inserir','alterar','excluir'):
            sql(f'ALTER TABLE {tabela} ENABLE TRIGGER arte_fila_{acao};')
    sql(admin + 'SELECT arte_distribuicao_ativar(true);')
    com_captura_corrigido = concorrencia(34)
    executar('SELECT arte_fila.consumir();')
    for numero in (33,34):
        assert sql(f"SELECT verso_tipo='FRENTE E VERSO' AND frente_verso FROM pedidos_modelos WHERE id_int={numero};") == 't'
    assert sem_captura_corrigido == com_captura_corrigido == {'deadlocks':0,'retornos':[0,0]}
    # Ordem inversa: modelo obtém a trava antes do catálogo; este espera antes
    # de travar sua linha, depois propaga o modo confirmado a todos os vínculos.
    modelo = assincrono("SET application_name='fila_modelo_primeiro'; BEGIN; "
                        "UPDATE pedidos_modelos SET verso_tipo='SÓ FRENTE' WHERE id_int=34; SELECT pg_sleep(3); COMMIT;")
    processos.append(modelo)
    esperar(lambda: sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='fila_modelo_primeiro' AND wait_event='PgSleep';") == '1')
    catalogo = assincrono("SET application_name='fila_catalogo_segundo'; UPDATE producao_numeracoes SET print_mode='front' WHERE id='catalogo-teste-34';")
    processos.append(catalogo)
    esperar(lambda: sql("SELECT count(*) FROM pg_locks l JOIN pg_stat_activity a ON a.pid=l.pid WHERE a.application_name='fila_catalogo_segundo' AND l.locktype='advisory' AND NOT l.granted;") == '1')
    for processo in (modelo,catalogo):
        _, erro = processo.communicate(timeout=12)
        assert processo.returncode == 0, erro
    assert sql("SELECT verso_tipo='SÓ FRENTE' AND NOT frente_verso FROM pedidos_modelos WHERE id_int=34;") == 't'
    return {'tres_regressoes_aprovadas': True,
            'antes_correcao_com_captura': com_captura, 'antes_correcao_sem_distribuicao': sem_captura,
            'corrigido_com_fila_ativa': com_captura_corrigido, 'corrigido_sem_distribuicao': sem_captura_corrigido,
            'ordem_inversa_e_propagacao_verso': True,
            'trava_distribuicao_ausente_nas_origens': True,
            'atualizacao_aninhada_reconciliada': aninhado, 'paridade_classificador': divergencias,
            'aprovacao_direta_converge': True, 'atribuicao_preserva_status': True,
            'atribuicao_invalida_cache_piloto': True}
