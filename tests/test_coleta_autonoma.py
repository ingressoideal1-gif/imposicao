from datetime import datetime, timezone
import io
import json

import pytest

from coleta_autonoma import ClienteAutonomo, ColetaAutonoma
from conferencia_piloto import ConferenciaIndisponivel, ConferidorPiloto
from pacotes_api import ServicoPacotes, configurar_piloto
from test_antecipacao_local import candidato


class Cliente:
    def __init__(self):
        self.cursores = []
        self.falha = False
    def listar(self, cursor):
        self.cursores.append(cursor)
        if self.falha: raise OSError('sem internet')
        item = candidato(); item['modelo'] = str(cursor + 1)
        item['prazo_erp'] = '2026-09-27'
        item.pop('prazo')
        return {'itens':[item], 'proximo':cursor+1, 'fim':False}
    def conferir(self, item):
        return datetime.now(timezone.utc).isoformat()


def ambiente(tmp_path, *, hora=22, ocupado=lambda:False):
    s = ServicoPacotes(tmp_path, host='test.invalid', empresa='teste', ocupado=ocupado,
                       conferir=lambda *_: (_ for _ in ()).throw(AssertionError('Autônomo não usa sessão do navegador')))
    cliente = Cliente(); tempo = [0]
    coleta = ColetaAutonoma(s, cliente, relogio=lambda:tempo[0],
        agora=lambda:datetime(2026,9,26,hora,tzinfo=timezone.utc))
    s.coleta_autonoma = coleta
    return s, cliente, coleta, tempo


def test_noite_sem_navegador_persiste_cursor_e_reinicia(tmp_path):
    s, cliente, coleta, _ = ambiente(tmp_path)
    coleta.rodar()
    assert cliente.cursores == list(range(8))
    assert len(s.catalogo()) == 8 and coleta.estado['recebidos'] == 8
    assert coleta.estado['estado'] == 'lote_concluido'
    assert all(i['setor'] == 'laser' and i['prazo'] for i in s.catalogo())
    s2, c2, coleta2, _ = ambiente(tmp_path, hora=10)
    coleta2.rodar()
    assert c2.cursores == [8]
    assert len(s2.catalogo()) == 9


def test_ocupacao_pausa_e_intervalo_impedem_consulta(tmp_path):
    ocupado = [True]
    s, c, coleta, tempo = ambiente(tmp_path, hora=10, ocupado=lambda:ocupado[0])
    coleta.rodar(); assert not c.cursores
    ocupado[0] = False; s.pausar(True)
    coleta.rodar(); assert not c.cursores
    s.pausar(False); coleta.rodar(); coleta.rodar()
    assert c.cursores == [0,1]
    assert s._acordar.is_set()
    tempo[0] = 301; coleta.rodar(); assert c.cursores == [0,1,2]


def test_falha_de_rede_nao_perde_cursor_e_reconecta(tmp_path):
    s, c, coleta, tempo = ambiente(tmp_path, hora=10)
    c.falha = True; coleta.rodar()
    assert coleta.estado['estado'] == 'pendente' and not s.catalogo()
    c.falha = False; tempo[0] = 301; coleta.rodar()
    assert c.cursores == [0,0] and len(s.catalogo()) == 1


def test_parar_durante_leitura_nao_admite_resultado_atrasado(tmp_path):
    s, c, coleta, _ = ambiente(tmp_path)
    original = c.listar
    def parar(cursor):
        resultado = original(cursor); s._stop.set(); return resultado
    c.listar = parar
    coleta.rodar()
    assert not s.catalogo() and coleta.estado['estado'] == 'pausada'


@pytest.mark.parametrize('interrupcao', ['pausa', 'ocupacao', 'parada', 'limite'])
def test_interrupcao_durante_conferencia_nao_admite_nem_avanca_cursor(tmp_path, interrupcao):
    ocupado = [False]
    s, c, coleta, tempo = ambiente(tmp_path, hora=10, ocupado=lambda:ocupado[0])
    original = c.conferir
    def conferir(item):
        recibo = original(item)
        if interrupcao == 'pausa': s.pausar(True)
        elif interrupcao == 'ocupacao': ocupado[0] = True
        elif interrupcao == 'parada': s._stop.set()
        else: tempo[0] = 121
        return recibo
    c.conferir = conferir
    coleta.rodar()
    assert not s.catalogo()
    assert coleta.estado['recebidos'] == 0
    con = s._db()
    try:
        assert con.execute("SELECT valor FROM controle_piloto WHERE chave='cursor_autonomo'").fetchone() is None
    finally: con.close()
    s.pausar(False); ocupado[0] = False; s._stop.clear()
    c.conferir = original; tempo[0] = 301
    coleta.rodar()
    assert c.cursores == [0, 0] and len(s.catalogo()) == 1


def test_transporte_fixo_nao_persiste_segredo_e_valida_cursor():
    chamadas = []
    def abrir(req, timeout):
        chamadas.append(req)
        assert timeout == 20 and req.get_header('X-agente-segredo') == 'sintetico'
        assert req.full_url.startswith('https://test.invalid/functions/v1/piloto-local/')
        assert 'sintetico' not in req.data.decode()
        return io.BytesIO(json.dumps({'itens':[], 'proximo':0, 'fim':False}).encode())
    c = ClienteAutonomo('test.invalid','teste','PC-JR-HOME',segredo=lambda:'sintetico',abrir=abrir)
    with pytest.raises(ValueError): c.listar(0)
    with pytest.raises(ValueError): c.chamar('imprimir',{})
    assert len(chamadas) == 1


def test_ativacao_autonoma_exige_opcao_e_estacao(monkeypatch, tmp_path):
    from fastapi import FastAPI
    for k,v in {'NEWPROD_PILOTO_LOCAL':'1','NEWPROD_PILOTO_EMPRESA':'teste',
                'NEWPROD_PILOTO_TOKEN':'sintetico-000000000000000000000000',
                'NEWPROD_PILOTO_RAIZ':str(tmp_path)}.items(): monkeypatch.setenv(k,v)
    monkeypatch.delenv('NEWPROD_PILOTO_AUTONOMO',raising=False)
    assert configurar_piloto(FastAPI(),ocupado=lambda:False).coleta_autonoma is None
    monkeypatch.setenv('NEWPROD_PILOTO_AUTONOMO','1')
    monkeypatch.delenv('NEWPROD_PILOTO_ESTACAO',raising=False)
    with pytest.raises(ValueError,match='estação'): configurar_piloto(FastAPI(),ocupado=lambda:False)
    monkeypatch.setenv('NEWPROD_PILOTO_ESTACAO','PC-JR-HOME')
    s = configurar_piloto(FastAPI(),ocupado=lambda:False)
    assert s.coleta_autonoma.cliente.estacao == 'PC-JR-HOME'
    assert isinstance(s.conferir,ConferidorPiloto)


def test_falha_no_meio_da_pagina_retoma_depois_do_ultimo_recibo(tmp_path):
    s, c, coleta, tempo = ambiente(tmp_path, hora=10)
    original = c.listar
    def pagina(cursor):
        r = original(cursor)
        segundo = candidato(); segundo['modelo'] = str(cursor+2)
        r['itens'].append(segundo); r['proximo'] = cursor+2
        return r
    c.listar = pagina
    def conferir(item):
        if item['modelo'] == '2': raise ConferenciaIndisponivel('pendente')
        return datetime.now(timezone.utc).isoformat()
    c.conferir = conferir
    coleta.rodar(); assert coleta.estado['recebidos'] == 1
    tempo[0] = 301; coleta.rodar()
    assert c.cursores == [0,1]


def test_thread_descobre_e_baixa_sem_navegador(tmp_path):
    import time
    s = ServicoPacotes(tmp_path, host='test.invalid', empresa='teste',
        abrir=lambda *a,**k:io.BytesIO(b'arquivo sintetico'),
        conferir=lambda *_: (_ for _ in ()).throw(AssertionError('Nao usa sessao')))
    s.intervalo_catalogo = .01
    s.coleta_autonoma = ColetaAutonoma(s, Cliente(), agora=lambda:datetime(2026,9,26,10,tzinfo=timezone.utc))
    s.iniciar()
    try:
        limite = time.monotonic()+3
        while time.monotonic()<limite:
            itens = s.catalogo()
            if itens:
                m = itens[0]['manifesto']
                estado = s.estado_modelo(m['modelo'],m['revisao'])
                if estado['estado']=='recursos_antecipados': break
            time.sleep(.01)
        else: pytest.fail('Thread nao concluiu descoberta e download')
        assert not estado['autorizado_offline']
        assert s.local.ler_recurso('teste','1',estado['revisao_recursos'],'frente') == b'arquivo sintetico'
    finally: assert s.encerrar()


def test_posicao_invalida_nao_consulta_nuvem_nem_reinicia_silenciosamente(tmp_path):
    s, c, coleta, _ = ambiente(tmp_path)
    con = s._db(); con.execute('INSERT INTO controle_piloto VALUES (?,?)',('cursor_autonomo','invalido'))
    con.commit(); con.close()
    coleta.rodar()
    assert coleta.estado['estado']=='pendente' and not c.cursores


def test_preferencial_direto_sem_mover_cursor_geral_e_reconexao(tmp_path):
    s, c, coleta, tempo = ambiente(tmp_path, hora=10)
    original = c.listar; pedidos=[]; offline=[True]
    def listar(cursor, pedido=None):
        if pedido:
            pedidos.append((pedido,cursor))
            if offline[0]: raise OSError('offline')
            item=candidato();item['modelo']='500';item['pedido']=pedido
            return {'itens':[item],'proximo':0,'fim':True}
        return original(cursor)
    c.listar=listar
    s.preferir('42',True); coleta.rodar()
    assert not s.catalogo() and coleta.estado['estado']=='pendente'
    offline[0]=False;tempo[0]=301;coleta.rodar()
    assert pedidos==[('42',0),('42',0)] and c.cursores==[0]
    assert '500' in s.preparador._preferenciais
    s2, _, _, _=ambiente(tmp_path)
    assert s2.preferencias()==['42']
    s2.atualizar_preferencias();assert s2.preparador._preferenciais=={'500'}
    s.preferir('42',False);assert not s.preparador._preferenciais


def test_inicio_imediato_respeita_ocupacao_e_nao_duplica_worker(tmp_path):
    busy=[False]
    s,c,coleta,tempo=ambiente(tmp_path,hora=10,ocupado=lambda:busy[0])
    coleta.rodar();assert len(c.cursores)==1
    busy[0]=True;s.iniciar_copia();coleta.rodar()
    assert len(c.cursores)==1 and coleta._solicitado.is_set()
    busy[0]=False;coleta.rodar()
    assert len(c.cursores)==9


def test_abertura_atualiza_local_mas_varredura_comum_preserva(tmp_path):
    s,c,coleta,tempo=ambiente(tmp_path,hora=10)
    original=candidato();original['pedido']='42'
    s.copias_presentes=lambda modelo: [object()]
    coleta._admitir(original)
    assert not s.catalogo()
    def listar(cursor,pedido=None):
        return {'itens':[original] if pedido else [],'proximo':0,'fim':True}
    c.listar=listar
    s.abrir_pedido('42');coleta.rodar()
    assert len(s.catalogo())==1
    assert s.preparador.resumo()['pendentes']==1
    con=s._db()
    try: assert con.execute('SELECT COUNT(*) FROM aberturas_piloto').fetchone()[0]==0
    finally: con.close()


def test_ociosidade_30_min_respeita_impressao_curta_spool_e_pausa(tmp_path):
    from controle_producao import ControleProducao
    s,c,coleta,tempo=ambiente(tmp_path)
    controle=ControleProducao(relogio=lambda:tempo[0]);livre=[True];aberturas=[]
    coleta.ociosidade=controle.segundos_ociosos;coleta.spool_livre=lambda:livre[0]
    s.pedidos_locais=lambda:['42','43'];s.abrir_pedido=aberturas.append
    tempo[0]=1800;coleta.verificar_ociosidade();assert not aberturas
    # Impressão curta entre duas consultas também reinicia a contagem.
    reserva=controle.reservar();reserva.liberar()
    tempo[0]=1801;coleta.verificar_ociosidade();assert not aberturas
    tempo[0]=3601;livre[0]=False;coleta.verificar_ociosidade();assert not aberturas
    livre[0]=True;tempo[0]=5402;s.pausar(True);coleta.verificar_ociosidade();assert not aberturas
    s.pausar(False);coleta.verificar_ociosidade();assert aberturas==['42','43']
    coleta.verificar_ociosidade();assert len(aberturas)==2


def test_abertura_offline_persiste_para_reconexao(tmp_path):
    s,c,coleta,tempo=ambiente(tmp_path)
    c.listar=lambda *a,**k: (_ for _ in ()).throw(OSError('offline'))
    s.abrir_pedido('42');coleta.rodar()
    s2,_,_,_=ambiente(tmp_path)
    con=s2._db()
    try: assert con.execute('SELECT pedido,cursor FROM aberturas_piloto').fetchall()==[('42',0)]
    finally: con.close()


def test_varredura_concluida_espera_mas_lote_continua(tmp_path):
    s,c,coleta,tempo=ambiente(tmp_path,hora=10)
    coleta.rodar();assert coleta.proxima==0 and s._acordar.is_set()
    c.listar=lambda cursor: {'itens':[],'proximo':0,'fim':True}
    s._acordar.clear();coleta.rodar()
    assert coleta.proxima==300 and not s._acordar.is_set()
    assert coleta.estado['estado']=='concluida'


def test_spool_impede_novo_lote(tmp_path):
    s,c,coleta,tempo=ambiente(tmp_path)
    coleta.spool_livre=lambda:False
    coleta.rodar();assert not c.cursores


def test_inicio_manual_copia_imediatamente_com_spool_ocupado_e_continua_lotes(tmp_path):
    s,c,coleta,_=ambiente(tmp_path,hora=10)
    coleta.spool_livre=lambda:False
    coleta.rodar()
    assert not c.cursores and coleta.estado['estado']=='aguardando_spool'
    s.iniciar_copia()
    coleta.rodar()
    assert c.cursores==list(range(8)) and coleta.estado['modo']=='manual'
    coleta.rodar()
    assert c.cursores==list(range(16))
    s.pausar(True)
    assert not coleta._manual.is_set()
    coleta.rodar()
    assert c.cursores==list(range(16))
    s.pausar(False)
    coleta.rodar()
    assert c.cursores==list(range(16)) and coleta.estado['estado']=='aguardando_spool'


def test_inicio_manual_prioriza_marcados_antes_dos_outros_abertos(tmp_path):
    s,c,coleta,_=ambiente(tmp_path,hora=10)
    chamados=[]
    def listar(cursor,pedido=None):
        chamados.append(pedido)
        return {'itens':[],'proximo':0,'fim':True}
    c.listar=listar
    s.abrir_pedido('90')
    s.preferir('42',True)
    coleta.spool_livre=lambda:False
    s.iniciar_copia()
    coleta.rodar()
    assert chamados[:2]==['42','90']
    assert coleta.estado['estado']=='concluida' and not coleta._manual.is_set()
    # Novo clique tambem atualiza o selecionado dentro do intervalo de cinco minutos.
    chamados.clear()
    s.iniciar_copia()
    coleta.rodar()
    assert chamados[0]=='42'


def test_preferenciais_nao_repetem_antes_de_cada_lote(tmp_path):
    s,c,coleta,tempo=ambiente(tmp_path,hora=10)
    s.preferir('42',True);coleta._solicitado.clear();pedidos=[];original=c.listar
    def listar(cursor,pedido=None):
        if pedido:
            pedidos.append(pedido)
            return {'itens':[],'proximo':0,'fim':True}
        return original(cursor)
    c.listar=listar
    coleta.rodar();coleta.rodar();coleta.rodar()
    assert pedidos==['42'] and c.cursores==[0,1,2]
    assert coleta.estado['lotes_consultados']==4
    assert coleta.estado['lotes_catalogo']==3
    tempo[0]=301;coleta.rodar();assert pedidos==['42','42']
